import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import axios from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the upstream observation and history provenance are doubled here.
const observations = vi.hoisted(() => ({
  owned: new WeakMap<object, object>(), history: new WeakSet<object>(), active: true,
  validations: 0,
  boxes: new Map<string, unknown>(), binary: new Map<string, string>(),
  tip: '', height: 1000,
  binding: Object.freeze({ processBindingDigestHex: '74'.repeat(32),
    executionTargetIdentityDigestHex: '75'.repeat(32) }),
}));
vi.mock('./substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({
  validateSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1: (value: any, target: object) => {
    if (!observations.active || observations.owned.get(value) !== target) {
      throw new Error('owned observation inactive or unproven');
    }
    observations.validations++;
    return { observation: value.observation, processBinding: observations.binding };
  },
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance: (value: object) => {
    if (!observations.history.has(value)) throw new Error('history unproven');
  },
}));
vi.mock('./authenticated-spv-tracker-read-only-node-client.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-spv-tracker-read-only-node-client.js')>(),
  createBoundedAuthenticatedSpvTrackerReadOnlySource(origin: string) {
    if (origin !== 'http://127.0.0.1:9051' && origin !== 'http://127.0.0.1:9052') {
      throw new Error('unselected node origin');
    }
    return {
      async getInfo() { return { network: 'devnet', fullHeight: observations.height }; },
      async getBestHeader() { return { id: observations.tip, height: observations.height }; },
      async getBlockHeaderIdsAtHeight(height: number) {
        return [height === 1 ? '72'.repeat(32) : observations.tip];
      },
      async getBoxByIdOrNull(id: string) { return observations.boxes.get(id) ?? null; },
      async getBoxBinaryByIdOrNull(id: string) { return { bytes: observations.binary.get(id) }; },
    };
  },
}));

import {
  assertObservedSubstrateFederatedGenesisReadCustodyV3,
  compileObservedSubstrateFederatedGenesisV3,
  validateObservedSubstrateFederatedGenesisV3,
  type CompileObservedSubstrateFederatedGenesisV3Input,
} from './substrate-federated-observed-genesis-v3.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2 }
  from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1,
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3,
  assertSubstrateFederatedNativeGenesisSetupReadCustodyV3,
  assertSubstrateFederatedNativeGenesisPegInSourceLockExecutionCheckV3,
  assertSubstrateFederatedNativeGenesisPegInCommittedVaultExecutionCheckV3,
  promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1,
  promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1 }
  from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2 }
  from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import { buildSubstrateFederatedGenesisV3 } from './substrate-federated-runtime-genesis-v3.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile }
  from './substrate-federated-settlement-family-v1.js';
import { buildSubstrateFederatedNativeGenesisPegInPacketV3 as buildNativePegInV3,
  assertSubstrateFederatedNativeGenesisPegInPacketV3 as assertNativePegInV3,
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV3 as assertNativeReadCustodyV3 }
  from './substrate-federated-isolated-devnet-peg-in-candidate-v3.js';
import { createSubstrateFederatedNativeGenesisPegInCommittedVaultAuthorizationSessionV3 }
  from './substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 }
  from './bridge-validity-tracker-header-context-v1.js';
import * as helpers from './ergo-helpers.js';
import * as owned from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import * as trackerCompiler from './substrate-federated-tracker-jvm-compiler-v2.js';
import * as familyCompiler from './substrate-federated-settlement-family-jvm-compiler-v3.js';
import { StateTracker } from './state-tracker.js';
import { executeSubstrateFederatedNativeGenesisBatchV3 }
  from './apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import * as unsigned from './unsigned-ergo-transaction.js';
import { getPooledReserveEmptyDigest } from './avl-bridge.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeLongRegister } from './ergo-encoding.js';

const bridgeRoot = fileURLToPath(new URL('../../', import.meta.url));
const BASE_INPUT = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000', ergoTree: '0008cd02' + '22'.repeat(32),
  assets: [], additionalRegisters: {}, creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
};
let setup: Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>>;
let source: ReturnType<typeof createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
let input: CompileObservedSubstrateFederatedGenesisV3Input;
let wasm: any;
let headers: Record<string, any>[];

async function observedInputs(target: object, tipHeaderIdHex = '73'.repeat(32),
  currentSetup = setup) {
  const tree = currentSetup.signer.rewardInputErgoTrees.delay1;
  const boxes = (await unsigned.materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }], dataInputs: [],
    outputs: [50, 60, 70, 120].map(amount => ({
      value: String(amount * 1_000_000), ergoTree: tree, creationHeight: 120,
    })),
  }, 'observed FED V3 issuance fixture')).outputs;
  const genesisInputs = Object.freeze({
    tracker: boxes[0]!, duplicatePrevention: boxes[1]!, pooledReserve: boxes[2]!,
  });
  const observation = Object.freeze({
    reportDigestHex: '71'.repeat(32),
    target: Object.freeze({ network: 'devnet', genesisHeaderIdHex: '72'.repeat(32),
      tipHeight: 1000, tipHeaderIdHex }),
    sources: Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051',
      witnessNodeOrigin: 'http://127.0.0.1:9052' }),
    signer: Object.freeze({ publicKeyHex: currentSetup.signer.publicKeyHex,
      p2pkErgoTreeHex: currentSetup.signer.p2pkErgoTreeHex,
      rewardDelayBlocks: 1 as const, rewardInputErgoTreeHex: tree }),
    genesisBoxIds: Object.freeze({ tracker: boxes[0]!.boxId,
      duplicatePrevention: boxes[1]!.boxId, pooledReserve: boxes[2]!.boxId }),
    genesisInputs,
  });
  const ownedDiscovery = Object.freeze({ observation });
  const history = Object.freeze({ receipt: Object.freeze({
    rewardInputDiscoveryDigestHex: observation.reportDigestHex,
    genesisBoxIds: observation.genesisBoxIds,
    target: Object.freeze({ genesisHeaderIdHex: observation.target.genesisHeaderIdHex,
      setupAnchorHeaderIdHex: observation.target.tipHeaderIdHex,
      setupAnchorHeight: observation.target.tipHeight }),
  }) });
  observations.owned.set(ownedDiscovery, target);
  observations.history.add(history);
  return { ownedDiscovery: ownedDiscovery as never, history: history as never };
}

beforeAll(async () => {
  const imported = await import('ergo-lib-wasm-nodejs');
  wasm = imported.default ?? imported;
  headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: 1001, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => header.raw);
});
beforeEach(async () => {
  observations.active = true;
  observations.validations = 0;
  observations.binding = Object.freeze({ processBindingDigestHex: '74'.repeat(32),
    executionTargetIdentityDigestHex: '75'.repeat(32) });
  observations.boxes.clear(); observations.binary.clear();
  observations.tip = ''; observations.height = 1000;
  setup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
  source = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
    ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [setup.signer.publicKeyHex],
  });
  const target = Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052', primaryMining: true, witnessReadOnly: true });
  const runtimeWasm = Buffer.from('0061736d01000000', 'hex');
  input = { target: target as never, ...await observedInputs(target),
    setupSigner: setup.signer, sourceSession: source,
    genesis: { bridgeRoot, launchDomainHex: '61'.repeat(32), evmChainId: '198407',
      operatorAddressHex: '31'.repeat(20), bridgeAddressHex: '33'.repeat(20),
      tokenAddressHex: '44'.repeat(20), runtimeWasm,
      expectedRuntimeWasmSha256Hex: createHash('sha256').update(runtimeWasm).digest('hex'),
      endowments: [{ addressHex: '31'.repeat(20), balance: '1000000000000000000' }] } };
});
afterEach(() => { source?.dispose(); setup?.dispose(); vi.restoreAllMocks(); });

describe('observed FED genesis V3 compilation and retained execution', () => {
  it('compiles the process-owned V2/V7 family and materializes all three unsigned singleton issuances', async () => {
    const previous = process.env.NODE_OPTIONS;
    if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS;
    let result: Awaited<ReturnType<typeof compileObservedSubstrateFederatedGenesisV3>>;
    try {
      result = await compileObservedSubstrateFederatedGenesisV3(input);
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previous;
    }
    expect(result.preparation.schema).toBe('e2s.substrate-federated-genesis-preparation.v3');
    expect(result.familyReceipt.schema).toBe('e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v3');
    expect(result.familyReceipt.version).toBe(3);
    expect(result.familyReceipt.profile.encodedProfileHex).toHaveLength(596 * 2);
    expect(result.familyReceipt.checks.reserveV7TemplateSha256BoundIntoFamilyId).toBe(true);
    expect(result.familyCompilerInput.trackerRequest.anchorSelector).toBe('absolute-ergo-header-height');
    expect(result.familyCompilerInput.templates.pooledReserve.relativePath)
      .toBe('contracts/MainChainPooledReserveValidityApplicationV7.es');
    expect(result.candidate.schema).toBe('e2s.substrate-federated-typed-genesis-candidate.v3');
    expect(result.candidate.runtimeProfileScaleHex).toHaveLength(2 + 349 * 2);
    expect(result.candidate.familyIdHex).toBe(result.familyReceipt.profile.familyIdHex);
    expect(result.issuance.orderedTransactions.map(item => item.role))
      .toEqual(['tracker', 'duplicatePrevention', 'pooledReserve']);
    expect(result.issuance.greenfieldReplayBaselineEstablished).toBe(false);
    expect(result.issuance.targetNodeAcceptanceEstablished).toBe(false);
    expect(result.issuance.issuanceEstablished).toBe(false);
    const third = result.issuance.orderedTransactions[2]!.transaction;
    const reserveInput = input.ownedDiscovery.observation.genesisInputs.pooledReserve;
    expect(third.eip12Tx.inputs).toEqual([{ ...reserveInput, extension: {} }]);
    expect(third.eip12Tx.dataInputs).toEqual([]);
    expect(third.outputs).toHaveLength(3);
    expect(third.outputs[0]).toMatchObject({
      transactionId: third.txId, index: 0, creationHeight: 1001,
      value: '10000000', ergoTree: result.familyReceipt.contracts.pooledReserve.propositionHex,
      assets: [{ tokenId: reserveInput.boxId, amount: '1' }],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(result.familyReceipt.profile.familyIdHex, 'hex')),
        R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'), 1, 32),
        R6: encodeLongRegister(0n),
      },
    });
    expect(third.outputs.reduce((sum, box) => sum + BigInt(box.value), 0n))
      .toBe(BigInt(reserveInput.value));
    expect(await unsigned.materializeUnsignedTransaction(third.eip12Tx, 'V3 issuance replay')).toEqual(third);
    expect(Object.isFrozen(third.outputs[0]?.additionalRegisters)).toBe(true);

    const v6 = 'contracts/MainChainPooledReserveValidityApplicationV6.es';
    const badFamilyInput = { ...result.familyCompilerInput,
      templates: { ...result.familyCompilerInput.templates,
        pooledReserve: { relativePath: v6, source: readFileSync(new URL('../../' + v6, import.meta.url), 'utf8') } } };
    await expect(familyCompiler.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(badFamilyInput))
      .rejects.toThrow(/pooledReserve V3 template path or bytes drifted/);
    const forgedV2 = { ...result.familyReceipt,
      schema: 'e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v2', version: 2 };
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: result.preparation, familyCompilerInput: result.familyCompilerInput,
      familyReceipt: forgedV2 as never,
    })).toThrow(/process provenance/);

    observations.validations = 0;
    expect(() => assertObservedSubstrateFederatedGenesisReadCustodyV3(result, input.target)).not.toThrow();
    expect(observations.validations).toBe(0);
    expect(validateObservedSubstrateFederatedGenesisV3(result, input.target).processBinding)
      .toBe(observations.binding);
    expect(observations.validations).toBe(1);
    expect(() => validateObservedSubstrateFederatedGenesisV3({ ...result }, input.target))
      .toThrow(/compiler and target provenance/);
    source.dispose();
    expect(() => assertObservedSubstrateFederatedGenesisReadCustodyV3(result, input.target))
      .toThrow(/disposed/);
    expect(() => validateObservedSubstrateFederatedGenesisV3(result, input.target))
      .toThrow(/disposed/);
  }, 120_000);

  it('joins one pinned JVM V3 compilation to the retained native setup check', async () => {
    const target = input.target;
    observations.tip = headers[0]!.id;
    observations.height = headers[0]!.height;
    input = { ...input, ...await observedInputs(target, observations.tip) };
    for (const box of Object.values(input.ownedDiscovery.observation.genesisInputs)) {
      observations.boxes.set(box.boxId, box);
      const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
      try {
        observations.binary.set(box.boxId,
          Buffer.from(parsed.sigma_serialize_bytes()).toString('hex'));
      } finally { parsed.free(); }
    }
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockImplementation(current => {
        if (current !== target || !observations.active) throw new Error('owned target mismatch');
        return observations.binding;
      });
    vi.spyOn(helpers, 'ngetDirect').mockResolvedValue(headers);
    vi.spyOn(helpers, 'ncheck').mockImplementation(async (_path, body) => {
      const tx = wasm.Transaction.from_json(JSON.stringify(body));
      const id = tx.id();
      try { return id.to_str(); } finally { id.free(); tx.free(); }
    });

    const previous = process.env.NODE_OPTIONS;
    if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS;
    let compiled: Awaited<ReturnType<typeof compileObservedSubstrateFederatedGenesisV3>>;
    try {
      compiled = await compileObservedSubstrateFederatedGenesisV3(input);
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previous;
    }
    const batch = await setup.runNativeGenesisRetainingSignerV3(compiled, target);
    expect(batch.profile).toBe('fed-native-height-zero-v3-reserve-v7');
    expect(batch.request.schema).toBe('e2s.substrate-federated-native-genesis-setup-check-request.v3');
    expect(batch.receipt.schema).toBe('e2s.substrate-federated-native-genesis-setup-check-receipt.v3');
    expect(batch.receipt.version).toBe(3);
    expect(batch.request.sourceBindings.familyIdHex).toBe(compiled.familyReceipt.profile.familyIdHex);
    expect(batch.orderedTransactions.map(item => item.issuance.role))
      .toEqual(['tracker', 'duplicate-prevention', 'pooled-reserve']);
    expect(helpers.ngetDirect).toHaveBeenCalledWith('/blocks/lastHeaders/10',
      'http://127.0.0.1:9051');
    expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    expect(() => assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3(batch, target))
      .not.toThrow();
    expect(() => assertSubstrateFederatedNativeGenesisSetupReadCustodyV3(batch, target))
      .not.toThrow();
    expect(() => assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3(
      { ...batch }, target)).toThrow(/process provenance/);
    expect(() => assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3(
      batch, { ...target })).toThrow(/process provenance/);
    expect(() => assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(
      batch as never, target)).toThrow(/process provenance/);
    const funding = (await unsigned.materializeUnsignedTransaction({
      inputs: [{ ...BASE_INPUT, extension: {} }],
      dataInputs: [],
      outputs: [
        { value: '20000000', ergoTree: setup.signer.p2pkErgoTreeHex, creationHeight: 1001 },
        { value: '280000000', ergoTree: setup.signer.p2pkErgoTreeHex, creationHeight: 1001 },
      ],
    }, 'V3 distinct deposit funding fixture')).outputs[0]!;
    const familyProfile = decodeSubstrateFederatedSettlementFamilyV1Profile(
      compiled.familyReceipt.profile);
    const pegInInput = {
      batch, target, sourceFundingInput: funding,
      sourceIntent: {
        formatVersion: 2 as const, sourceNetworkIdHex: familyProfile.sourceNetworkIdHex,
        sidechainIdHex: familyProfile.sidechainIdHex,
        bridgeAddressHex: familyProfile.bridgeAddressHex,
        tokenAddressHex: familyProfile.tokenAddressHex,
        settlementProfileIdHex: familyProfile.settlementProfileIdHex,
        admissionProfileIdHex: compiled.familyReceipt.profile.familyIdHex,
        sourceAssetIdHex: familyProfile.settlementAssetIdHex,
        amountNanoErg: '10000000', recipientAddressHex: '31'.repeat(20),
      },
      depositorErgoTreeHex: setup.signer.p2pkErgoTreeHex,
      creationHeights: { currentErgoHeight: 1001, sourceLockCreation: 1001,
        reserveTransition: 1001 },
    } satisfies Parameters<typeof buildNativePegInV3>[0];
    await expect(buildNativePegInV3({ ...pegInInput, batch: { ...batch } } as never))
      .rejects.toThrow(/process provenance/);
    await expect(buildNativePegInV3({ ...pegInInput, target: { ...target } } as never))
      .rejects.toThrow(/process provenance/);
    const pegInPacket = await buildNativePegInV3(pegInInput);
    expect(pegInPacket.schema).toBe('e2s.substrate-federated-pooled-reserve-deposit.v3');
    expect(pegInPacket.boxes.reservePredecessor.boxId)
      .toBe(batch.request.orderedIssuances[2]!.predictedStateOutput.boxIdHex);
    expect(pegInPacket.invariants.exactFederatedFamilyBound).toBe(true);
    expect(assertNativePegInV3(pegInPacket, batch, target)).toBe(pegInPacket);
    expect(() => assertNativePegInV3({ ...pegInPacket }, batch, target))
      .toThrow(/process provenance/);
    expect(() => assertNativePegInV3(pegInPacket, { ...batch }, target))
      .toThrow(/process provenance/);
    expect(() => assertNativePegInV3(pegInPacket, batch, { ...target }))
      .toThrow(/process provenance/);
    const materialize = unsigned.materializeUnsignedTransaction;
    const mutableFunding = structuredClone(funding);
    const mutation = vi.spyOn(unsigned, 'materializeUnsignedTransaction')
      .mockImplementationOnce(async (tx, label) => {
        const value = await materialize(tx, label);
        Object.assign(mutableFunding, { value: '21000000' });
        return value;
      });
    try {
      const captured = await buildNativePegInV3({ ...pegInInput,
        sourceFundingInput: mutableFunding });
      expect(captured.boxes.sourceFundingInput.value).toBe('20000000');
    } finally { mutation.mockRestore(); }
    const prediction = vi.spyOn(unsigned, 'materializeUnsignedTransaction')
      .mockImplementationOnce(async (tx, label) => {
        const value = await materialize(tx, label);
        return { ...value, txId: 'ff'.repeat(32) };
      });
    try {
      await expect(buildNativePegInV3(pegInInput)).rejects.toThrow(/prediction differs/);
    } finally { prediction.mockRestore(); }
    const outputDrift = vi.spyOn(unsigned, 'materializeUnsignedTransaction')
      .mockImplementationOnce(async (tx, label) => {
        const value = await materialize(tx, label);
        return { ...value, outputs: [
          { ...value.outputs[0]!, value: '1' }, ...value.outputs.slice(1),
        ] };
      });
    try {
      await expect(buildNativePegInV3(pegInInput)).rejects.toThrow(/prediction differs/);
      expect(outputDrift).toHaveBeenCalledOnce();
    } finally { outputDrift.mockRestore(); }
    const revoked = vi.spyOn(unsigned, 'materializeUnsignedTransaction')
      .mockImplementationOnce(async (tx, label) => {
        const value = await materialize(tx, label);
        observations.active = false;
        return value;
      });
    try {
      await expect(buildNativePegInV3(pegInInput)).rejects.toThrow(/inactive|unproven/);
    } finally { observations.active = true; revoked.mockRestore(); }
    const foreignSetup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    const foreignSource = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
      ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [foreignSetup.signer.publicKeyHex],
    });
    try {
      const foreignObserved = await observedInputs(target, observations.tip, foreignSetup);
      const foreignOwned = foreignObserved.ownedDiscovery as unknown as typeof input.ownedDiscovery;
      for (const box of Object.values(foreignOwned.observation.genesisInputs)) {
        observations.boxes.set(box.boxId, box);
        const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
        try {
          observations.binary.set(box.boxId,
            Buffer.from(parsed.sigma_serialize_bytes()).toString('hex'));
        } finally { parsed.free(); }
      }
      const foreignInput: CompileObservedSubstrateFederatedGenesisV3Input = {
        ...input, ...foreignObserved, setupSigner: foreignSetup.signer, sourceSession: foreignSource,
      };
      const previousOptions = process.env.NODE_OPTIONS;
      if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS;
      let foreignCompiled: Awaited<ReturnType<typeof compileObservedSubstrateFederatedGenesisV3>>;
      try {
        foreignCompiled = await compileObservedSubstrateFederatedGenesisV3(foreignInput);
      } finally {
        if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = previousOptions;
      }
      const foreignBatch = await foreignSetup.runNativeGenesisRetainingSignerV3(foreignCompiled, target);
      expect(helpers.ncheck).toHaveBeenCalledTimes(6);
      const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
      try {
        await expect(foreignSetup.checkNativePegInSourceLockRetainingSignerV3(pegInPacket, target))
          .rejects.toThrow(/native FED V3 peg-in packet lacks exact process provenance/);
        expect(signatures).not.toHaveBeenCalled();
        expect(helpers.ncheck).toHaveBeenCalledTimes(6);
      } finally { signatures.mockRestore(); }
      expect(() => assertNativePegInV3(pegInPacket, foreignBatch, target))
        .toThrow(/native FED V3 peg-in packet lacks exact process provenance/);
      expect(() => assertNativePegInV3(pegInPacket, batch, target)).not.toThrow();
      expect(() => assertNativeReadCustodyV3(pegInPacket, batch, target)).not.toThrow();
    } finally { foreignSource.dispose(); foreignSetup.dispose(); }
    const uncheckedSameTxPacket = await buildNativePegInV3(pegInInput);
    expect(uncheckedSameTxPacket).not.toBe(pegInPacket);
    expect(uncheckedSameTxPacket.transactions.sourceLockCreation.txId)
      .toBe(pegInPacket.transactions.sourceLockCreation.txId);
    const sourceLock = await setup.checkNativePegInSourceLockRetainingSignerV3(pegInPacket, target);
    expect(sourceLock.unsignedTransactionIdHex).toBe(pegInPacket.transactions.sourceLockCreation.txId);
    expect(sourceLock.sourceFundingBoxIdHex).toBe(pegInPacket.boxes.sourceFundingInput.boxId);
    expect(sourceLock.boundaries.broadcastAuthorityEstablished).toBe(false);
    expect(helpers.ncheck).toHaveBeenCalledTimes(7);
    const promotedSourceLock = promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(
      sourceLock, target);
    expect(() => assertSubstrateFederatedNativeGenesisPegInSourceLockExecutionCheckV3(
      promotedSourceLock, uncheckedSameTxPacket, batch, target))
      .toThrow(/exact packet custody/);
    expect(() => assertSubstrateFederatedNativeGenesisPegInSourceLockExecutionCheckV3(
      promotedSourceLock, pegInPacket, batch, target)).not.toThrow();
    expect(() => assertNativePegInV3(pegInPacket, batch, target)).not.toThrow();
    const vaultForeignSetup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    const vaultForeignSource = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
      ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [vaultForeignSetup.signer.publicKeyHex],
    });
    try {
      const vaultForeignObserved = await observedInputs(target, observations.tip, vaultForeignSetup);
      const vaultOwned = vaultForeignObserved.ownedDiscovery as unknown as typeof input.ownedDiscovery;
      for (const box of Object.values(vaultOwned.observation.genesisInputs)) {
        observations.boxes.set(box.boxId, box);
        const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
        try {
          observations.binary.set(box.boxId,
            Buffer.from(parsed.sigma_serialize_bytes()).toString('hex'));
        } finally { parsed.free(); }
      }
      const vaultInput: CompileObservedSubstrateFederatedGenesisV3Input = {
        ...input, ...vaultForeignObserved, setupSigner: vaultForeignSetup.signer,
        sourceSession: vaultForeignSource,
      };
      const previousOptions = process.env.NODE_OPTIONS;
      if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS;
      let vaultCompiled: Awaited<ReturnType<typeof compileObservedSubstrateFederatedGenesisV3>>;
      try {
        vaultCompiled = await compileObservedSubstrateFederatedGenesisV3(vaultInput);
      } finally {
        if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = previousOptions;
      }
      const vaultBatch = await vaultForeignSetup.runNativeGenesisRetainingSignerV3(vaultCompiled, target);
      expect(helpers.ncheck).toHaveBeenCalledTimes(10);
      const vaultFunding = (await unsigned.materializeUnsignedTransaction({
        inputs: [{ ...BASE_INPUT, extension: {} }], dataInputs: [],
        outputs: [
          { value: '20000000', ergoTree: vaultForeignSetup.signer.p2pkErgoTreeHex,
            creationHeight: 1001 },
          { value: '280000000', ergoTree: vaultForeignSetup.signer.p2pkErgoTreeHex,
            creationHeight: 1001 },
        ],
      }, 'V3 foreign vault deposit funding fixture')).outputs[0]!;
      const vaultProfile = decodeSubstrateFederatedSettlementFamilyV1Profile(
        vaultCompiled.familyReceipt.profile);
      const vaultPacket = await buildNativePegInV3({
        ...pegInInput, batch: vaultBatch, sourceFundingInput: vaultFunding,
        depositorErgoTreeHex: vaultForeignSetup.signer.p2pkErgoTreeHex,
        sourceIntent: { ...pegInInput.sourceIntent,
          sourceNetworkIdHex: vaultProfile.sourceNetworkIdHex,
          sidechainIdHex: vaultProfile.sidechainIdHex,
          bridgeAddressHex: vaultProfile.bridgeAddressHex,
          tokenAddressHex: vaultProfile.tokenAddressHex,
          settlementProfileIdHex: vaultProfile.settlementProfileIdHex,
          admissionProfileIdHex: vaultCompiled.familyReceipt.profile.familyIdHex },
      });
      await vaultForeignSetup.checkNativePegInSourceLockRetainingSignerV3(vaultPacket, target);
      expect(helpers.ncheck).toHaveBeenCalledTimes(11);
      const vaultSignatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
      try {
        await expect(vaultForeignSetup.checkNativePegInCommittedVaultRetainingSignerV3(
          { ...vaultPacket }, target)).rejects.toThrow(/packet differs from the checked source lock/);
        expect(vaultSignatures).not.toHaveBeenCalled();
        expect(helpers.ncheck).toHaveBeenCalledTimes(11);
      } finally { vaultSignatures.mockRestore(); }
    } finally { vaultForeignSource.dispose(); vaultForeignSetup.dispose(); }
    const vault = await setup.checkNativePegInCommittedVaultRetainingSignerV3(pegInPacket, target);
    expect(vault.unsignedTransactionIdHex).toBe(pegInPacket.transactions.reserveTransition.txId);
    expect(vault.reservePredecessorBoxIdHex).toBe(pegInPacket.boxes.reservePredecessor.boxId);
    expect(vault.sourceLockBoxIdHex).toBe(pegInPacket.boxes.sourceLock.boxId);
    expect(vault.boundaries.broadcastAuthorityEstablished).toBe(false);
    expect(helpers.ncheck).toHaveBeenCalledTimes(12);
    expect(uncheckedSameTxPacket.transactions.reserveTransition.txId)
      .toBe(pegInPacket.transactions.reserveTransition.txId);
    expect(() => promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(
      { ...vault }, target)).toThrow(/exact execution provenance/);
    const promotedVault = promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(
      vault, target);
    expect(() => promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(
      vault, target)).toThrow(/exact execution provenance/);
    expect(() => assertSubstrateFederatedNativeGenesisPegInCommittedVaultExecutionCheckV3(
      promotedVault, uncheckedSameTxPacket, batch, target)).toThrow(/exact packet custody/);
    expect(() => assertSubstrateFederatedNativeGenesisPegInCommittedVaultExecutionCheckV3(
      { ...promotedVault }, pegInPacket, batch, target)).toThrow(/exact packet custody/);
    expect(() => assertSubstrateFederatedNativeGenesisPegInCommittedVaultExecutionCheckV3(
      promotedSourceLock as never, pegInPacket, batch, target)).toThrow(/exact packet custody/);
    expect(() => assertSubstrateFederatedNativeGenesisPegInCommittedVaultExecutionCheckV3(
      promotedVault, pegInPacket, { ...batch }, target)).toThrow(/exact packet custody/);
    expect(() => assertSubstrateFederatedNativeGenesisPegInCommittedVaultExecutionCheckV3(
      promotedVault, pegInPacket, batch, { ...target })).toThrow(/exact packet custody/);
    expect(() => assertSubstrateFederatedNativeGenesisPegInCommittedVaultExecutionCheckV3(
      promotedVault, pegInPacket, batch, target)).not.toThrow();
    expect(() => createSubstrateFederatedNativeGenesisPegInCommittedVaultAuthorizationSessionV3({
      target, batch, packet: uncheckedSameTxPacket, executionCheck: promotedVault,
      sourceLockObservation: {} as never,
    })).toThrow(/exact packet custody/);
    const root = mkdtempSync(join(tmpdir(), 'e2s-v3-native-issuance-'));
    const markers = join(root, 'markers');
    mkdirSync(markers);
    const state = new StateTracker(join(root, 'state.sqlite'));
    const sent = new Set<string>();
    const inclusionHeight = batch.request.target.preSetupAnchor.height;
    const inclusionHeaderIdHex = batch.request.target.preSetupAnchor.headerIdHex;
    vi.spyOn(axios, 'create').mockImplementation(() => ({
      get: async (path: string) => {
        if (path === '/info') return { data: { network: 'devnet', fullHeight: inclusionHeight + 20 } };
        if (path === '/blocks/at/1') return { data: [batch.request.target.genesisHeaderIdHex] };
        if (path === `/blocks/at/${inclusionHeight}`) return { data: [inclusionHeaderIdHex] };
        const match = /^\/blockchain\/transaction\/byId\/([0-9a-f]{64})$/.exec(path);
        if (match && sent.has(match[1]!)) return { data: {
          id: match[1], numConfirmations: 20, inclusionHeight, headerId: inclusionHeaderIdHex,
        } };
        throw new Error(`unexpected V3 node observation ${path}`);
      },
    }) as ReturnType<typeof axios.create>);
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url, body) => {
      expect(url).toBe('http://127.0.0.1:9051/transactions');
      if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string') {
        throw new Error('V3 transport requires a signed transaction ID');
      }
      const expected = batch.orderedTransactions[sent.size]!;
      expect(body.id).toBe(expected.issuance.unsignedTransactionIdHex);
      expect(state.getErgoOperationalTransactionAttempt(body.id)).not.toBeNull();
      expect(readdirSync(markers)).toHaveLength(sent.size + 1);
      for (const predecessor of sent) {
        expect(state.getErgoOperationalTransactionAttempt(predecessor)?.status).toBe('confirmed');
      }
      sent.add(body.id);
      return { status: 200, data: body.id };
    });
    try {
      const execution = { target, batch, state, markerDirectory: markers };
      await expect(executeSubstrateFederatedNativeGenesisBatchV3({
        ...execution, batch: { ...batch },
      } as never)).rejects.toThrow(/process provenance/);
      await expect(executeSubstrateFederatedNativeGenesisBatchV3({
        ...execution, target: { ...target },
      } as never)).rejects.toThrow(/process provenance/);
      expect(post).not.toHaveBeenCalled();
      const result = await executeSubstrateFederatedNativeGenesisBatchV3(execution);
      expect(result.map(value => value.role)).toEqual(['tracker', 'duplicatePrevention', 'pooledReserve']);
      expect(result.map(value => value.expectedTxId)).toEqual([...sent]);
      expect(result.every(value => value.transportStatus === 'accepted'
        && value.confirmationHeight === inclusionHeight
        && value.confirmationHeaderIdHex === inclusionHeaderIdHex)).toBe(true);
      expect(result.every(value => state.getErgoOperationalTransactionAttempt(value.expectedTxId)?.status
        === 'confirmed')).toBe(true);
      expect(post).toHaveBeenCalledTimes(3);
      expect(readdirSync(markers)).toHaveLength(3);
      await expect(executeSubstrateFederatedNativeGenesisBatchV3(execution)).rejects.toThrow();
      expect(post).toHaveBeenCalledTimes(3);
    } finally {
      state.close();
      rmSync(root, { recursive: true, force: true });
    }
    await expect(setup.runNativeGenesisRetainingSignerV3(compiled, target)).rejects.toThrow();
    expect(helpers.ncheck).toHaveBeenCalledTimes(12);
    expect(() => assertSubstrateFederatedNativeGenesisSetupReadCustodyV3(batch, target))
      .toThrow();
    expect(() => assertNativePegInV3(pegInPacket, batch, target)).toThrow();
    expect(() => assertNativeReadCustodyV3(pegInPacket, batch, target)).toThrow();
    expect(() => assertSubstrateFederatedNativeGenesisPegInCommittedVaultExecutionCheckV3(
      promotedVault, pegInPacket, batch, target)).toThrow(/inactive/);
  }, 120_000);

  it.each(['setup clone', 'source clone', 'discovery clone', 'history clone',
    'setup disposed', 'source disposed', 'target inactive'])(
    'rejects %s before either compiler', async fault => {
      let changed = input;
      let error: RegExp;
      if (fault === 'setup clone') {
        changed = { ...input, setupSigner: { ...setup.signer } }; error = /active process provenance/;
      } else if (fault === 'source clone') {
        changed = { ...input, sourceSession: { ...source } }; error = /lacks provenance/;
      } else if (fault === 'discovery clone') {
        changed = { ...input, ownedDiscovery: { ...input.ownedDiscovery } }; error = /observation inactive/;
      } else if (fault === 'history clone') {
        changed = { ...input, history: { ...input.history } }; error = /history unproven/;
      } else if (fault === 'setup disposed') {
        setup.dispose(); error = /active process provenance/;
      } else if (fault === 'source disposed') {
        source.dispose(); error = /disposed/;
      } else {
        observations.active = false; error = /observation inactive/;
      }
      const tracker = vi.spyOn(trackerCompiler, 'compileSubstrateFederatedTrackerWithPinnedJvmV2');
      const family = vi.spyOn(familyCompiler, 'compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3');
      await expect(compileObservedSubstrateFederatedGenesisV3(changed)).rejects.toThrow(error);
      expect(tracker).not.toHaveBeenCalled();
      expect(family).not.toHaveBeenCalled();
    });
});
