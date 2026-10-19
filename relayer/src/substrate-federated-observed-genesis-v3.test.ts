import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the upstream observation and history provenance are doubled here.
const observations = vi.hoisted(() => ({
  owned: new WeakMap<object, object>(), history: new WeakSet<object>(), active: true,
  validations: 0,
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

import {
  assertObservedSubstrateFederatedGenesisReadCustodyV3,
  compileObservedSubstrateFederatedGenesisV3,
  validateObservedSubstrateFederatedGenesisV3,
  type CompileObservedSubstrateFederatedGenesisV3Input,
} from './substrate-federated-observed-genesis-v3.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2 }
  from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2 }
  from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import { buildSubstrateFederatedGenesisV3 } from './substrate-federated-runtime-genesis-v3.js';
import * as trackerCompiler from './substrate-federated-tracker-jvm-compiler-v2.js';
import * as familyCompiler from './substrate-federated-settlement-family-jvm-compiler-v3.js';
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

async function observedInputs(target: object) {
  const tree = setup.signer.rewardInputErgoTrees.delay1;
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
      tipHeight: 1000, tipHeaderIdHex: '73'.repeat(32) }),
    sources: Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051',
      witnessNodeOrigin: 'http://127.0.0.1:9052' }),
    signer: Object.freeze({ publicKeyHex: setup.signer.publicKeyHex,
      p2pkErgoTreeHex: setup.signer.p2pkErgoTreeHex,
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

beforeAll(async () => { await import('ergo-lib-wasm-nodejs'); });
beforeEach(async () => {
  observations.active = true;
  observations.validations = 0;
  observations.binding = Object.freeze({ processBindingDigestHex: '74'.repeat(32),
    executionTargetIdentityDigestHex: '75'.repeat(32) });
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

describe('observed FED genesis V3 source-only compilation', () => {
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
