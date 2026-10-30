import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { getPooledReserveEmptyDigest } from './avl-bridge.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeLongRegister, MINER_FEE, MINER_FEE_TREE }
  from './ergo-encoding.js';
import { buildSubstrateFederatedCheckpointProfileV1 } from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from './substrate-federated-settlement-family-v1.js';
import { getSubstrateFederatedSettlementFamilyV1FixtureIdentity }
  from './substrate-federated-burn-settlement-v1-fixture.js';
import { bindSubstrateFederatedSettlementFamilyCompilerIdentityV1 }
  from './substrate-federated-settlement-family-compiler-binding-v1.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 }
  from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 }
  from './substrate-federated-tracker-jvm-compiler-v2.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2 }
  from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import {
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3,
} from './substrate-federated-settlement-family-jvm-compiler-v3.js';
import { assertSubstrateFederatedPooledReserveDepositV1Packet,
  buildSubstrateFederatedPooledReserveDepositV1,
  type BuildSubstrateFederatedPooledReserveDepositV1Input }
  from './substrate-federated-pooled-reserve-deposit-v1.js';
import { assertSubstrateFederatedPooledReserveDepositV2Packet,
  buildSubstrateFederatedPooledReserveDepositV2 }
  from './substrate-federated-pooled-reserve-deposit-v2.js';
import { assertSubstrateFederatedPooledReserveDepositV3Packet,
  buildSubstrateFederatedPooledReserveDepositV3 as build,
  SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V3_SCHEMA,
  type BuildSubstrateFederatedPooledReserveDepositV3Input as Input }
  from './substrate-federated-pooled-reserve-deposit-v3.js';
import { materializeSubstrateFederatedWithdrawalFixtureBox as box,
  substrateFederatedWithdrawalFixtureTemplate as template }
  from './substrate-federated-burn-settlement-v2-fixture.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';

const P2PK = '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
type State = Omit<BuildSubstrateFederatedPooledReserveDepositV1Input, 'familyBinding'>;
type Family = Pick<BuildSubstrateFederatedPooledReserveDepositV1Input['familyBinding'], 'profile' | 'contracts'>;
let base: Input;
let v2CompilerInput: Parameters<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2>[0];
let v2Receipt: Awaited<ReturnType<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2>>;

beforeAll(async () => {
  const vector = JSON.parse(readFileSync(new URL('../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url), 'utf8'));
  const identity = JSON.parse(readFileSync(new URL('../test-vectors/substrate-federated-v1-tracker-contract.json', import.meta.url), 'utf8'));
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
    template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
    trackerGenesisInputBoxIdHex: identity.trackerNftIdHex,
    profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile), application: identity.application,
  });
  if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
    throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
  }
  const options = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  try {
    const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
    const common = {
      trackerRequest, trackerReceipt,
      duplicatePreventionGenesisInputBoxIdHex: '0e'.repeat(32),
      pooledReserveGenesisInputBoxIdHex: '0f'.repeat(32),
    };
    const predecessorTemplates = {
      duplicatePrevention: template('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
      sourceLock: template('contracts/MainChainLockPooledReserveV6.es'),
    };
    v2CompilerInput = { ...common, templates: {
      ...predecessorTemplates,
      pooledReserve: template('contracts/MainChainPooledReserveValidityApplicationV6.es'),
    } };
    const familyCompilerInput: Input['familyCompilerInput'] = { ...common, templates: {
      ...predecessorTemplates,
      pooledReserve: template('contracts/MainChainPooledReserveValidityApplicationV7.es'),
    } };
    const familyCompilerReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(familyCompilerInput);
    v2Receipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(v2CompilerInput);
    base = { ...await stateFor(familyCompilerReceipt), familyCompilerInput, familyCompilerReceipt };
  } finally {
    process.env.NODE_OPTIONS = options;
  }
}, 120_000);

function input(): Input {
  const { familyCompilerInput, familyCompilerReceipt, ...state } = base;
  return { ...structuredClone(state), familyCompilerInput, familyCompilerReceipt };
}

async function stateFor(family: Family): Promise<State> {
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(family.profile);
  return {
    sourceFundingInput: await box({ value: '20000000', ergoTree: P2PK,
      assets: [], additionalRegisters: {}, creationHeight: 100 }),
    reserveState: { predecessor: await box({
      value: '2000000', ergoTree: family.contracts.pooledReserve.propositionHex,
      assets: [{ tokenId: family.profile.pooledReserveNftIdHex, amount: '1' }], creationHeight: 100,
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(family.profile.familyIdHex, 'hex')),
        R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'), 1, 32),
        R6: encodeLongRegister(0n),
      },
    }), depositHistory: [] },
    sourceIntent: {
      formatVersion: 2, sourceNetworkIdHex: profile.sourceNetworkIdHex,
      sidechainIdHex: profile.sidechainIdHex, bridgeAddressHex: profile.bridgeAddressHex,
      tokenAddressHex: profile.tokenAddressHex, settlementProfileIdHex: profile.settlementProfileIdHex,
      admissionProfileIdHex: family.profile.familyIdHex,
      sourceAssetIdHex: profile.settlementAssetIdHex, amountNanoErg: '10000000',
      recipientAddressHex: '31'.repeat(20),
    },
    depositorErgoTreeHex: P2PK,
    creationHeights: { currentErgoHeight: 111, sourceLockCreation: 110, reserveTransition: 111 },
  };
}

describe('process-owned V3/V7 family to complete unsigned deposit', () => {
  it('constructs the two balanced transactions with distinct V3 family provenance', async () => {
    const packet = await build(input());
    expect(await build(input())).toEqual(packet);
    assertSubstrateFederatedPooledReserveDepositV3Packet(packet);
    expect(packet.schema).toBe(SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V3_SCHEMA);
    expect(packet.version).toBe(3);
    expect(packet.familyCompiler).toEqual({
      trackerAnchorSelector: 'absolute-ergo-header-height',
      settlementLayout: 'native-erg-federated-family-reserve-v7',
      trackerRequestDigestHex: base.familyCompilerInput.trackerRequest.requestDigestHex,
      trackerReceiptDigestHex: base.familyCompilerInput.trackerReceipt.receiptDigestHex,
      familyRequestDigestHex: base.familyCompilerReceipt.familyCompilerRequestDigestHex,
      familyReceiptDigestHex: base.familyCompilerReceipt.receiptDigestHex,
      compilerLockDigestHex: base.familyCompilerReceipt.compilerLockDigestHex,
    });
    expect(packet.boxes.sourceLock.ergoTree).toBe(base.familyCompilerReceipt.contracts.sourceLock.propositionHex);
    expect(packet.boxes.reserveSuccessor.ergoTree).toBe(base.familyCompilerReceipt.contracts.pooledReserve.propositionHex);
    expect(packet.transactions.reserveTransition.eip12Tx.inputs.map(value => value.boxId)).toEqual([
      base.reserveState.predecessor.boxId, packet.boxes.sourceLock.boxId, packet.boxes.transitionFeeFunding.boxId,
    ]);
    expect(packet.reserve).toMatchObject({ inputValueNanoErg: '2000000', outputValueNanoErg: '12000000',
      inputLiabilityNanoErg: '0', outputLiabilityNanoErg: '10000000', protectedSeedNanoErg: '2000000',
      predecessorDepositCount: 0, successorDepositCount: 1 });
    for (const tx of Object.values(packet.transactions)) {
      expect(tx.eip12Tx.inputs.reduce((sum, value) => sum + BigInt(value.value), 0n))
        .toBe(tx.outputs.reduce((sum, value) => sum + BigInt(value.value), 0n));
      expect(tx.outputs.filter(value => value.ergoTree === MINER_FEE_TREE)).toMatchObject([{ value: String(MINER_FEE) }]);
    }
    expect(packet.invariants.exactFederatedFamilyBound).toBe(true);
    expect(packet.boundaries).toMatchObject({ predecessorStateProvenanceEstablished: false,
      sourceLockConsumptionEstablished: false, ergoDepositFinalityEstablished: false,
      sidechainMintAcceptanceEstablished: false, targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false, broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false, productionReadinessEstablished: false });
    expect(() => assertSubstrateFederatedPooledReserveDepositV1Packet(packet)).toThrow(/provenance/);
    expect(() => assertSubstrateFederatedPooledReserveDepositV2Packet(packet)).toThrow(/provenance/);
  });

  it('rejects copied and forged V3 receipts and a genuine V2 receipt before candidate construction', async () => {
    const invalidSource = { ...input(), sourceFundingInput: null as unknown as Input['sourceFundingInput'] };
    for (const familyCompilerReceipt of [
      structuredClone(base.familyCompilerReceipt),
      { ...base.familyCompilerReceipt, receiptDigestHex: '41'.repeat(32) },
      v2Receipt,
    ]) {
      await expect(build({ ...invalidSource, familyCompilerReceipt } as Input))
        .rejects.toThrow(/process provenance/);
    }
    await expect(build({ ...invalidSource, familyCompilerInput: { ...base.familyCompilerInput,
      pooledReserveGenesisInputBoxIdHex: '42'.repeat(32) } })).rejects.toThrow(/binding drifted/);
  });

  it('does not promote copied or V1/V2 cross-profile packets to V3 provenance', async () => {
    const packet = await build(input());
    const v2Packet = await buildSubstrateFederatedPooledReserveDepositV2({
      ...await stateFor(v2Receipt), familyCompilerInput: v2CompilerInput,
      familyCompilerReceipt: v2Receipt,
    });
    const familyBinding = bindSubstrateFederatedSettlementFamilyCompilerIdentityV1(
      getSubstrateFederatedSettlementFamilyV1FixtureIdentity(),
    );
    const v1Packet = await buildSubstrateFederatedPooledReserveDepositV1({
      ...await stateFor(familyBinding), familyBinding,
    });
    for (const value of [structuredClone(packet), { ...packet }, v1Packet, v2Packet,
      structuredClone(v1Packet), structuredClone(v2Packet)]) {
      expect(() => assertSubstrateFederatedPooledReserveDepositV3Packet(value)).toThrow(/provenance/);
    }
  });

  it('rejects an isolated canonically reboxed wrong V7 reserve predecessor', async () => {
    const changed = input();
    const predecessor = await box({ ...changed.reserveState.predecessor,
      ergoTree: P2PK,
    });
    await expect(build({ ...changed, reserveState: { predecessor, depositHistory: [] } }))
      .rejects.toThrow(/predecessor identity or policy mismatch/);
  });
});
