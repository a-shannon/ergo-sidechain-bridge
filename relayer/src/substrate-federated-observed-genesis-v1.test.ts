import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// These two upstream observation boundaries are stubs, not live-node evidence.
// Custody, profile encoding, tracked templates and both JVM compilers stay real.
const observations = vi.hoisted(() => ({
  owned: new WeakMap<object, object>(), history: new WeakSet<object>(), active: true,
}));
vi.mock('./substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1: (value: any, target: object) => {
    if (!observations.active || observations.owned.get(value) !== target) throw new Error('owned observation inactive or unproven');
    return value.observation;
  },
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance: (value: object) => {
    if (!observations.history.has(value)) throw new Error('history unproven');
  },
}));

import { compileObservedSubstrateFederatedGenesisV1, type CompileObservedSubstrateFederatedGenesisV1Input } from './substrate-federated-observed-genesis-v1.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2 } from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2, readSubstrateFederatedGenesisProfilesFromSessionV2 } from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import * as trackerCompiler from './substrate-federated-tracker-jvm-compiler-v2.js';
import * as familyCompiler from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';

const bridgeRoot = fileURLToPath(new URL('../../', import.meta.url));
const runTracker = trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2;
let setup: Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>>;
let source: ReturnType<typeof createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
let input: CompileObservedSubstrateFederatedGenesisV1Input;

beforeEach(async () => {
  observations.active = true;
  setup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
  source = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
    ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [setup.signer.publicKeyHex],
  });
  const runtimeWasm = Buffer.from('0061736d01000000', 'hex');
  const target = Object.freeze({});
  const discovery = Object.freeze({ reportDigestHex: '71'.repeat(32),
    target: Object.freeze({ genesisHeaderIdHex: '72'.repeat(32), tipHeight: 20, tipHeaderIdHex: '73'.repeat(32) }),
    signer: Object.freeze({ publicKeyHex: setup.signer.publicKeyHex, p2pkErgoTreeHex: setup.signer.p2pkErgoTreeHex,
      rewardDelayBlocks: 1, rewardInputErgoTreeHex: setup.signer.rewardInputErgoTrees.delay1 }),
    genesisBoxIds: Object.freeze({ tracker: '0d'.repeat(32), duplicatePrevention: '0e'.repeat(32), pooledReserve: '0f'.repeat(32) }) });
  const ownedDiscovery = Object.freeze({ observation: discovery });
  const history = Object.freeze({ receipt: Object.freeze({ rewardInputDiscoveryDigestHex: discovery.reportDigestHex,
    genesisBoxIds: discovery.genesisBoxIds, target: Object.freeze({ genesisHeaderIdHex: discovery.target.genesisHeaderIdHex,
      setupAnchorHeaderIdHex: discovery.target.tipHeaderIdHex, setupAnchorHeight: discovery.target.tipHeight }) }) });
  observations.owned.set(ownedDiscovery, target);
  observations.history.add(history);
  input = { target: target as never, ownedDiscovery: ownedDiscovery as never, history: history as never,
    setupSigner: setup.signer, sourceSession: source,
    genesis: { bridgeRoot, launchDomainHex: '61'.repeat(32), evmChainId: '198407',
      operatorAddressHex: '31'.repeat(20), bridgeAddressHex: '33'.repeat(20), tokenAddressHex: '44'.repeat(20),
      runtimeWasm, expectedRuntimeWasmSha256Hex: createHash('sha256').update(runtimeWasm).digest('hex'),
      endowments: [{ addressHex: '31'.repeat(20), balance: '1000000000000000000' }] } };
  vi.spyOn(trackerCompiler, 'compileSubstrateFederatedTrackerWithPinnedJvmV2');
  vi.spyOn(familyCompiler, 'compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2');
});
afterEach(() => { source?.dispose(); setup?.dispose(); vi.restoreAllMocks(); });

describe('observed FED genesis compilation', () => {
  it.each([1, 720])('joins delay-%i observations through the real JVM pair and retains pre-await inputs', async delay => {
    if (delay === 720) {
      const observation = { ...input.ownedDiscovery.observation, signer: { ...input.ownedDiscovery.observation.signer,
        rewardDelayBlocks: 720 as const, rewardInputErgoTreeHex: setup.signer.rewardInputErgoTrees.delay720 } };
      const ownedDiscovery = { ...input.ownedDiscovery, observation };
      observations.owned.set(ownedDiscovery, input.target);
      input = { ...input, ownedDiscovery };
    }
    const expectedDiscovery = input.ownedDiscovery.observation;
    const expectedHistory = input.history;
    vi.mocked(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).mockImplementationOnce(async request => {
      const result = await runTracker(request);
      (input.genesis as any).launchDomainHex = 'ab'.repeat(32);
      (input.genesis as any).operatorAddressHex = 'bc'.repeat(20);
      (input.genesis.endowments[0] as any).balance = '1';
      input.genesis.runtimeWasm.fill(0);
      (input as any).target = {};
      (input as any).sourceSession = {};
      (input as any).ownedDiscovery = {};
      (input as any).history = {};
      return result;
    });
    const previous = process.env.NODE_OPTIONS;
    if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS;
    try {
      const result = await compileObservedSubstrateFederatedGenesisV1(input);
      expect(result.familyCompilerInput.trackerRequest.trackerNftIdHex).toBe(expectedDiscovery.genesisBoxIds.tracker);
      expect(result.familyCompilerInput.duplicatePreventionGenesisInputBoxIdHex).toBe(expectedDiscovery.genesisBoxIds.duplicatePrevention);
      expect(result.familyCompilerInput.pooledReserveGenesisInputBoxIdHex).toBe(expectedDiscovery.genesisBoxIds.pooledReserve);
      expect(result.preparation.checkpointProfile.ergoAdmissionPublicKeysHex).toEqual([setup.signer.publicKeyHex]);
      expect(result.preparation.mintProofProfile.signerPublicKeysHex).toEqual(source.binding.federatedMintProfile.signerPublicKeysHex);
      expect(result.candidate.runtimeProfile.activationHeight).toBe('0');
      expect(result.candidate.runtimeProfile.lineageProfileIdHex).toBe(`0x${result.familyReceipt.profile.familyIdHex}`);
      expect(result.candidate.runtimeProfile.sourceProofProfileIdHex).toBe(source.binding.federatedMintProfile.proofProfileIdHex);
      expect(result.discovery).toBe(expectedDiscovery);
      expect(result.history).toBe(expectedHistory);
      expect(result.preparation.launchDomainHex).toBe('61'.repeat(32));
      expect(result.preparation.operatorAddressHex).toBe('31'.repeat(20));
      expect(JSON.parse(result.candidate.genesisJson).balances.balances).toEqual([
        ['0x' + '31'.repeat(20), 1_000_000_000_000_000_000],
      ]);
      expect(result.preparation.application.sourceRuntimeCodeSha256Hex).toBe(
        createHash('sha256').update(Buffer.from('0061736d01000000', 'hex')).digest('hex'));
      expect(readSubstrateFederatedGenesisProfilesFromSessionV2(source).checkpointProfile).toEqual(result.preparation.checkpointProfile);
      expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).toHaveBeenCalledTimes(1);
      expect(familyCompiler.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previous;
    }
  }, 120_000);

  it.each(['setup disposed', 'source disposed', 'source clone', 'target inactive', 'target changed', 'discovery clone', 'history clone', 'admission key'])
    ('rejects %s before invoking either compiler', async fault => {
      let value = input;
      let error: RegExp;
      if (fault === 'setup disposed') { setup.dispose(); error = /active process provenance/; }
      else if (fault === 'source disposed') { source.dispose(); error = /disposed/; }
      else if (fault === 'source clone') { value = { ...input, sourceSession: { ...source } }; error = /lacks provenance/; }
      else if (fault === 'target inactive') { observations.active = false; error = /observation inactive/; }
      else if (fault === 'target changed') { value = { ...input, target: {} as never }; error = /observation inactive/; }
      else if (fault === 'discovery clone') { value = { ...input, ownedDiscovery: { ...input.ownedDiscovery } }; error = /observation inactive/; }
      else if (fault === 'history clone') { value = { ...input, history: { ...input.history } }; error = /history unproven/; }
      else {
        source.dispose();
        source = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
          ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: ['02' + '11'.repeat(32)],
        });
        value = { ...input, sourceSession: source }; error = /admission keys differ/;
      }
      await expect(compileObservedSubstrateFederatedGenesisV1(value)).rejects.toThrow(error);
      expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).not.toHaveBeenCalled();
      expect(familyCompiler.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2).not.toHaveBeenCalled();
    });

  it.each(['publicKeyHex', 'p2pkErgoTreeHex', 'rewardInputErgoTreeHex'])('rejects mismatched observed signer %s', async field => {
    const observation = { ...input.ownedDiscovery.observation,
      signer: { ...input.ownedDiscovery.observation.signer, [field]: 'ab'.repeat(33) } };
    const ownedDiscovery = { ...input.ownedDiscovery, observation };
    observations.owned.set(ownedDiscovery, input.target);
    await expect(compileObservedSubstrateFederatedGenesisV1({ ...input, ownedDiscovery })).rejects.toThrow(/reward signer differs/);
    expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).not.toHaveBeenCalled();
  });

  it.each(['digest', 'tracker', 'duplicatePrevention', 'pooledReserve', 'genesis', 'anchor', 'height'])
    ('rejects mismatched history %s before compilation', async fault => {
      const receipt = structuredClone(input.history.receipt);
      if (fault === 'digest') (receipt as any).rewardInputDiscoveryDigestHex = 'ab'.repeat(32);
      else if (fault === 'genesis') (receipt.target as any).genesisHeaderIdHex = 'ab'.repeat(32);
      else if (fault === 'anchor') (receipt.target as any).setupAnchorHeaderIdHex = 'ab'.repeat(32);
      else if (fault === 'height') (receipt.target as any).setupAnchorHeight++;
      else (receipt.genesisBoxIds as any)[fault] = 'ab'.repeat(32);
      const history = { ...input.history, receipt };
      observations.history.add(history);
      await expect(compileObservedSubstrateFederatedGenesisV1({ ...input, history })).rejects.toThrow(/history differs/);
      expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).not.toHaveBeenCalled();
      expect(familyCompiler.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2).not.toHaveBeenCalled();
    });

  it.each(['tracker', 'family'].flatMap(phase => ['source', 'setup', 'target'].map(owner => ({ phase, owner }))))
    ('rechecks $owner lifetime after the $phase compiler', async ({ phase, owner }) => {
    const expire = () => {
      if (owner === 'source') source.dispose();
      else if (owner === 'setup') setup.dispose();
      else observations.active = false;
    };
    vi.mocked(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).mockImplementationOnce(async () => {
      if (phase === 'tracker') expire();
      return {} as never;
    });
    vi.mocked(familyCompiler.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2).mockImplementationOnce(async () => {
      expire();
      return {} as never;
    });
    await expect(compileObservedSubstrateFederatedGenesisV1(input)).rejects.toThrow(
      owner === 'source' ? /disposed/ : owner === 'setup' ? /active process provenance/ : /observation inactive/);
    expect(familyCompiler.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2).toHaveBeenCalledTimes(phase === 'tracker' ? 0 : 1);
  });

  it('does not invoke accessor input while rejecting extra fields', async () => {
    const getter = vi.fn(() => input.genesis);
    const value = { ...input };
    Object.defineProperty(value, 'genesis', { enumerable: true, get: getter });
    await expect(compileObservedSubstrateFederatedGenesisV1(value)).rejects.toThrow(/exact data fields/);
    await expect(compileObservedSubstrateFederatedGenesisV1({ ...input, unexpected: true } as never)).rejects.toThrow(/exact data fields/);
    await expect(compileObservedSubstrateFederatedGenesisV1({ ...input,
      genesis: { ...input.genesis, checkpointProfile: {} } } as never)).rejects.toThrow(/exact data fields/);
    expect(getter).not.toHaveBeenCalled();
    expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).not.toHaveBeenCalled();
  });
});
