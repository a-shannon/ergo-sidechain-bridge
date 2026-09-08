import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { assertObservedSubstrateFederatedGenesisV1, compileObservedSubstrateFederatedGenesisV1, type CompileObservedSubstrateFederatedGenesisV1Input } from './substrate-federated-observed-genesis-v1.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2 } from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2, readSubstrateFederatedGenesisProfilesFromSessionV2 } from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import * as trackerCompiler from './substrate-federated-tracker-jvm-compiler-v2.js';
import * as familyCompiler from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import * as unsigned from './unsigned-ergo-transaction.js';
import * as issuanceMaterializer from './substrate-federated-genesis-issuance-materialization-v1.js';
import { getDupTreeDigest, getPooledReserveEmptyDigest } from './avl-bridge.js';
import { getSubstrateFederatedTrackerDigestV1Hex } from './substrate-federated-burn-settlement-v1.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister, MINER_FEE_TREE } from './ergo-encoding.js';
import { buildSubstrateFederatedNativeGenesisSetupCheckRequestV1 } from './substrate-federated-native-genesis-setup-check-request-v1.js';
import * as genesisObservation from './substrate-federated-genesis-observation-v1.js';
import * as ownedTarget from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import * as readOnlySource from './authenticated-spv-tracker-read-only-node-client.js';
import * as helpers from './ergo-helpers.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 } from './bridge-validity-tracker-header-context-v1.js';
import { assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1, getSubstrateFederatedNativeGenesisSetupCompilerInputV1 }
  from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';

const bridgeRoot = fileURLToPath(new URL('../../', import.meta.url));
const runTracker = trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2;
let setup: Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>>;
let source: ReturnType<typeof createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
let input: CompileObservedSubstrateFederatedGenesisV1Input;
let wasm: any;
let headers: Record<string, any>[];
const BASE_INPUT = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5', value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`, assets: [], additionalRegisters: {}, creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
};

async function observedInputs(delay: 1 | 720, target: object) {
  const tree = delay === 1 ? setup.signer.rewardInputErgoTrees.delay1 : setup.signer.rewardInputErgoTrees.delay720;
  const boxes = (await unsigned.materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }], dataInputs: [], outputs: [50, 60, 70, 120].map(amount => ({
      value: String(amount * 1_000_000), ergoTree: tree, creationHeight: 120,
    })),
  }, 'observed FED issuance fixture')).outputs;
  const genesisInputs = Object.freeze({ tracker: boxes[0]!, duplicatePrevention: boxes[1]!, pooledReserve: boxes[2]! });
  const discovery = Object.freeze({ reportDigestHex: '71'.repeat(32),
    target: Object.freeze({ network: 'devnet', genesisHeaderIdHex: '72'.repeat(32), tipHeight: 1000, tipHeaderIdHex: headers[0]!.id }),
    sources: Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052' }),
    signer: Object.freeze({ publicKeyHex: setup.signer.publicKeyHex, p2pkErgoTreeHex: setup.signer.p2pkErgoTreeHex,
      rewardDelayBlocks: delay, rewardInputErgoTreeHex: tree }),
    genesisBoxIds: Object.freeze({ tracker: boxes[0]!.boxId, duplicatePrevention: boxes[1]!.boxId, pooledReserve: boxes[2]!.boxId }),
    genesisInputs });
  const ownedDiscovery = Object.freeze({ observation: discovery });
  const history = Object.freeze({ receipt: Object.freeze({ rewardInputDiscoveryDigestHex: discovery.reportDigestHex,
    genesisBoxIds: discovery.genesisBoxIds, target: Object.freeze({ genesisHeaderIdHex: discovery.target.genesisHeaderIdHex,
      setupAnchorHeaderIdHex: discovery.target.tipHeaderIdHex, setupAnchorHeight: discovery.target.tipHeight }) }) });
  observations.owned.set(ownedDiscovery, target); observations.history.add(history);
  return { ownedDiscovery: ownedDiscovery as never, history: history as never };
}

beforeAll(async () => {
  const module = await import('ergo-lib-wasm-nodejs'); wasm = module.default ?? module;
  headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: 1001, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => header.raw);
});
beforeEach(async () => {
  observations.active = true;
  setup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
  source = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
    ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [setup.signer.publicKeyHex],
  });
  const runtimeWasm = Buffer.from('0061736d01000000', 'hex');
  const target = Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: true, witnessReadOnly: true });
  input = { target: target as never, ...await observedInputs(1, target),
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
      input = { ...input, ...await observedInputs(720, input.target) };
    }
    const expectedDiscovery = input.ownedDiscovery.observation;
    const expectedHistory = input.history;
    const expectedTarget = input.target;
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
      expect(result.issuance.creationHeight).toBe(1001);
      expect(result.issuance.greenfieldReplayBaselineEstablished).toBe(false);
      expect(result.issuance.targetNodeAcceptanceEstablished).toBe(false);
      expect(result.issuance.issuanceEstablished).toBe(false);
      const familyId = encodeCollByteRegister(Buffer.from(result.familyReceipt.profile.familyIdHex, 'hex'));
      const expectedRegisters = [
        { R4: encodeCollByteRegister(Buffer.from(result.preparation.checkpointProfile.profileIdHex, 'hex')),
          R5: encodeAvlTreeRegister(Buffer.from(getSubstrateFederatedTrackerDigestV1Hex([]), 'hex'), 1, 370),
          R6: encodeCollByteRegister(Buffer.from(result.preparation.application.sidechainIdHex, 'hex')),
          R7: encodeLongRegister(0n), R8: encodeIntRegister(0),
          R9: encodeCollByteRegister(Buffer.from(result.preparation.checkpointProfile.ergoAdmissionKeySetDigestHex, 'hex')) },
        { R4: familyId, R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'), 1, 1) },
        { R4: familyId, R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'), 1, 32), R6: encodeLongRegister(0n) },
      ];
      const trees = [result.familyCompilerInput.trackerReceipt.contract.propositionHex,
        result.familyReceipt.contracts.duplicatePrevention.propositionHex, result.familyReceipt.contracts.pooledReserve.propositionHex];
      expect(result.issuance.orderedTransactions.map(value => value.role)).toEqual(['tracker', 'duplicatePrevention', 'pooledReserve']);
      for (const [index, { role, transaction }] of result.issuance.orderedTransactions.entries()) {
        const funding = expectedDiscovery.genesisInputs[role];
        expect(transaction.eip12Tx.inputs).toEqual([{ ...funding, extension: {} }]);
        expect(transaction.eip12Tx.dataInputs).toEqual([]);
        expect(transaction.outputs).toHaveLength(3);
        const [state, change, fee] = transaction.outputs;
        expect(state).toMatchObject({ transactionId: transaction.txId, index: 0, creationHeight: 1001,
          value: '10000000', ergoTree: trees[index], assets: [{ tokenId: funding.boxId, amount: '1' }],
          additionalRegisters: expectedRegisters[index] });
        expect(change).toMatchObject({ value: String(BigInt(funding.value) - 11_100_000n), ergoTree: funding.ergoTree,
          assets: [], additionalRegisters: {}, creationHeight: 1001 });
        expect(fee).toMatchObject({ value: '1100000', ergoTree: MINER_FEE_TREE, assets: [], additionalRegisters: {}, creationHeight: 1001 });
        expect(transaction.outputs.reduce((sum, box) => sum + BigInt(box.value), 0n)).toBe(BigInt(funding.value));
        expect(await unsigned.materializeUnsignedTransaction(transaction.eip12Tx, 'FED issuance replay')).toEqual(transaction);
        expect(Object.isFrozen(transaction.eip12Tx.inputs[0])).toBe(true);
        expect(Object.isFrozen(state!.additionalRegisters)).toBe(true);
      }
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
      // This join retains real compiler provenance; only node observation/custody are doubled.
      vi.spyOn(ownedTarget, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
        .mockReturnValue({ processBindingDigestHex: '74'.repeat(32), executionTargetIdentityDigestHex: '75'.repeat(32) });
      vi.spyOn(genesisObservation, 'observeSubstrateFederatedGenesisV1').mockImplementation(async profile => ({
        status: 'AGREED', observedAt: new Date().toISOString(), reportDigestHex: '76'.repeat(32),
        target: { ...expectedDiscovery.target },
        sources: { primary: { endpointOrigin: profile.sources.primary.endpointOrigin, sourceIdHex: profile.sources.primary.sourceIdHex },
          witness: { endpointOrigin: profile.sources.witness.endpointOrigin, sourceIdHex: profile.sources.witness.sourceIdHex } },
        agreement: { fixtureAgreement: true }, authorization: { fixtureAuthority: false },
        boundary: { readOnlyNodeRequestsOnly: true, signerOrWalletMaterialRead: false, targetAcceptanceEstablished: false },
        boxes: Object.fromEntries(['tracker', 'duplicatePrevention', 'pooledReserve'].map((role, index) =>
          [role, { box: expectedDiscovery.genesisInputs[role as keyof typeof expectedDiscovery.genesisInputs],
            role: ['tracker', 'duplicate-prevention', 'pooled-reserve'][index], sigmaSerializedSha256Hex: '77'.repeat(32),
            checks: { presentInCurrentUtxoView: true, boxIdRecomputedFromJson: true, sigmaBytesCanonical: true } }])),
        profile,
      }) as never);
      vi.spyOn(genesisObservation, 'assertSubstrateFederatedGenesisObservationV1Provenance').mockImplementation(() => {});
      vi.spyOn(readOnlySource, 'createBoundedAuthenticatedSpvTrackerReadOnlySource').mockReturnValue({
        getBlockHeaderIdsAtHeight: async () => [expectedDiscovery.target.tipHeaderIdHex],
      } as never);
      const request = await buildSubstrateFederatedNativeGenesisSetupCheckRequestV1({ compiled: result, target: expectedTarget });
      expect(request.sourceBindings.familyIdHex).toBe(result.candidate.familyIdHex);
      expect(request.sourceBindings.runtimeProfileIdHex).toBe(result.candidate.runtimeProfileIdHex);
      expect(request.sourceBindings.trackerCompilerReceiptDigestHex).toBe(result.familyCompilerInput.trackerReceipt.receiptDigestHex);
      expect(request.sourceBindings.familyCompilerReceiptDigestHex).toBe(result.familyReceipt.receiptDigestHex);
      expect(request.orderedIssuances.map(value => value.unsignedTransactionBody))
        .toEqual(result.issuance.orderedTransactions.map(value => value.transaction.eip12Tx));
      expect(() => assertObservedSubstrateFederatedGenesisV1(result, expectedTarget)).not.toThrow();
      expect(() => assertObservedSubstrateFederatedGenesisV1({ ...result }, expectedTarget)).toThrow(/compiler and target provenance/);
      expect(() => assertObservedSubstrateFederatedGenesisV1(result, {} as never)).toThrow(/compiler and target provenance/);
      vi.spyOn(helpers, 'ngetDirect').mockResolvedValue(headers);
      vi.spyOn(helpers, 'ncheck').mockImplementation(async (_path, body) => {
        const transaction = wasm.Transaction.from_json(JSON.stringify(body));
        const id = transaction.id();
        try { return id.to_str(); } finally { id.free(); transaction.free(); }
      });
      const batch = await setup.runNativeGenesisRetainingSigner(result, expectedTarget);
      expect(batch.profile).toBe('fed-native-height-zero-v1');
      expect(batch.orderedTransactions.map(value => value.signedCandidate.txId))
        .toEqual(result.issuance.orderedTransactions.map(value => value.transaction.txId));
      expect(batch.orderedTransactions.map(value => value.issuance.unsignedTransactionBody))
        .toEqual(result.issuance.orderedTransactions.map(value => value.transaction.eip12Tx));
      expect(helpers.ncheck).toHaveBeenCalledTimes(3);
      expect(batch.receipt.signer.publicKeyHex).toBe(setup.signer.publicKeyHex);
      expect(batch.receipt.signer.rewardDelayBlocks).toBe(delay);
      expect(batch.receipt.boundaries.fundsAuthorityEstablished).toBe(false);
      const retainedCompiler = getSubstrateFederatedNativeGenesisSetupCompilerInputV1(batch, expectedTarget);
      expect(retainedCompiler.trackerRequest).toBe(result.familyCompilerInput.trackerRequest);
      expect(retainedCompiler.trackerReceipt).toBe(result.familyCompilerInput.trackerReceipt);
      expect(retainedCompiler.familyReceipt).toBe(result.familyReceipt);
      expect(() => assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, expectedTarget)).not.toThrow();
      observations.active = false;
      expect(() => assertObservedSubstrateFederatedGenesisV1(result, expectedTarget)).toThrow(/observation inactive/);
      observations.active = true;
      if (delay === 1) {
        setup.dispose();
        expect(() => assertObservedSubstrateFederatedGenesisV1(result, expectedTarget)).toThrow(/active process provenance/);
        expect(() => assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, expectedTarget)).toThrow(/inactive/);
        expect(() => getSubstrateFederatedNativeGenesisSetupCompilerInputV1(batch, expectedTarget)).toThrow(/inactive/);
      } else {
        source.dispose();
        expect(() => assertObservedSubstrateFederatedGenesisV1(result, expectedTarget)).toThrow(/disposed/);
        expect(() => assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, expectedTarget)).toThrow(/disposed/);
        expect(() => getSubstrateFederatedNativeGenesisSetupCompilerInputV1(batch, expectedTarget)).toThrow(/disposed/);
      }
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

  it.each(['tracker', 'duplicatePrevention', 'pooledReserve'].flatMap(role =>
    ['id', 'serialized value', 'tree', 'asset', 'register', 'immature'].map(fault => ({ role, fault }))))
    ('rejects $role input $fault before compilation', async ({ role, fault }) => {
      const observation = structuredClone(input.ownedDiscovery.observation);
      const selectedRole = role as keyof typeof observation.genesisInputs;
      const box = observation.genesisInputs[selectedRole] as any;
      if (fault === 'id') box.boxId = 'ab'.repeat(32);
      else if (fault === 'serialized value') box.value = String(BigInt(box.value) + 1n);
      else if (fault === 'tree') box.ergoTree = setup.signer.p2pkErgoTreeHex;
      else if (fault === 'asset') box.assets = [{ tokenId: BASE_INPUT.boxId, amount: '1' }];
      else if (fault === 'register') box.additionalRegisters = { R4: '0400' };
      else box.creationHeight = observation.target.tipHeight;
      let history = input.history;
      if (fault !== 'id' && fault !== 'serialized value') {
        // Semantic negatives retain valid serialized identities and matching provenance.
        const { value, ergoTree, assets, additionalRegisters, creationHeight } = box;
        const transaction = await unsigned.materializeUnsignedTransaction({
          inputs: [{ ...BASE_INPUT, extension: {} }], dataInputs: [], outputs: [
            { value, ergoTree, assets, additionalRegisters, creationHeight },
            { value: String(BigInt(BASE_INPUT.value) - BigInt(value)),
              ergoTree: BASE_INPUT.ergoTree, creationHeight },
          ],
        }, 'canonical FED semantic-negative fixture');
        const canonical = transaction.outputs[0]!;
        expect(await unsigned.normalizeEip12Box(canonical, 'semantic-negative identity')).toEqual(canonical);
        (observation.genesisInputs as any)[selectedRole] = canonical;
        (observation.genesisBoxIds as any)[selectedRole] = canonical.boxId;
        history = { ...input.history, receipt: { ...input.history.receipt, genesisBoxIds: observation.genesisBoxIds } };
        observations.history.add(history);
      }
      const ownedDiscovery = { ...input.ownedDiscovery, observation };
      observations.owned.set(ownedDiscovery, input.target);
      await expect(compileObservedSubstrateFederatedGenesisV1({ ...input, ownedDiscovery, history })).rejects.toThrow(
        fault === 'serialized value' ? /differs from calculated from box serialized bytes/
          : fault === 'register' ? /^observed FED genesis requires exact data fields$/
            : fault === 'id' || fault === 'immature' ? /^observed FED issuance input identity or maturity differs$/
              : /^observed FED issuance input must be mature pure ERG owned by the setup signer$/);
      expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).not.toHaveBeenCalled();
      expect(familyCompiler.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2).not.toHaveBeenCalled();
    });

  it.each([0, -1, 1.5, Number.NaN, 2_147_483_647])('rejects issuance height %s before compilation', async height => {
    const observation = { ...input.ownedDiscovery.observation, target: { ...input.ownedDiscovery.observation.target, tipHeight: height } };
    const history = { ...input.history, receipt: { ...input.history.receipt,
      target: { ...input.history.receipt.target, setupAnchorHeight: height } } };
    const ownedDiscovery = { ...input.ownedDiscovery, observation };
    observations.owned.set(ownedDiscovery, input.target); observations.history.add(history);
    await expect(compileObservedSubstrateFederatedGenesisV1({ ...input, ownedDiscovery, history })).rejects.toThrow(
      Number.isNaN(height) ? /history differs/ : /height cannot bind/);
    expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).not.toHaveBeenCalled();
  });

  it('rejects duplicate canonical inputs even with matching observation and history IDs', async () => {
    const original = input.ownedDiscovery.observation;
    const genesisBoxIds = { ...original.genesisBoxIds, duplicatePrevention: original.genesisBoxIds.tracker };
    const observation = { ...original, genesisBoxIds,
      genesisInputs: { ...original.genesisInputs, duplicatePrevention: original.genesisInputs.tracker } };
    const ownedDiscovery = { ...input.ownedDiscovery, observation };
    const history = { ...input.history, receipt: { ...input.history.receipt, genesisBoxIds } };
    observations.owned.set(ownedDiscovery, input.target); observations.history.add(history);
    await expect(compileObservedSubstrateFederatedGenesisV1({ ...input, ownedDiscovery, history })).rejects.toThrow(/must be distinct/);
    expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).not.toHaveBeenCalled();
  });

  it.each(['source', 'setup', 'target'])('rechecks %s after input normalization', async owner => {
    const normalize = unsigned.normalizeEip12Box;
    vi.spyOn(unsigned, 'normalizeEip12Box').mockImplementationOnce(async (...args) => {
      const box = await normalize(...args);
      if (owner === 'source') source.dispose();
      else if (owner === 'setup') setup.dispose();
      else observations.active = false;
      return box;
    });
    await expect(compileObservedSubstrateFederatedGenesisV1(input)).rejects.toThrow(
      owner === 'source' ? /disposed/ : owner === 'setup' ? /active process provenance/ : /observation inactive/);
    expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).not.toHaveBeenCalled();
  });

  it('rejects target expiry during materialization after the real JVM pair', async () => {
    const materialize = issuanceMaterializer.materializeSubstrateFederatedSingletonIssuanceV1;
    const spy = vi.spyOn(issuanceMaterializer, 'materializeSubstrateFederatedSingletonIssuanceV1').mockImplementationOnce(async args => {
      const result = await materialize(args); observations.active = false; return result;
    });
    const previous = process.env.NODE_OPTIONS;
    if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS;
    try {
      await expect(compileObservedSubstrateFederatedGenesisV1(input)).rejects.toThrow(/observation inactive/);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(trackerCompiler.compileSubstrateFederatedTrackerWithPinnedJvmV2).toHaveBeenCalledTimes(1);
      expect(familyCompiler.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previous;
    }
  }, 120_000);

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
