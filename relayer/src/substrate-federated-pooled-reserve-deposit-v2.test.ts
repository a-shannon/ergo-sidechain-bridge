import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getPooledReserveEmptyDigest } from './avl-bridge.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeLongRegister, MINER_FEE, MINER_FEE_TREE }
  from './ergo-encoding.js';
import { buildSubstrateFederatedCheckpointProfileV1 } from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from './substrate-federated-settlement-family-v1.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2 } from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import { getSubstrateFederatedSettlementFamilyV1FixtureIdentity } from './substrate-federated-burn-settlement-v1-fixture.js';
import { bindSubstrateFederatedSettlementFamilyCompilerIdentityV1 } from './substrate-federated-settlement-family-compiler-binding-v1.js';
import { assertSubstrateFederatedPooledReserveDepositV1Packet, buildSubstrateFederatedPooledReserveDepositCandidate,
  buildSubstrateFederatedPooledReserveDepositV1 } from './substrate-federated-pooled-reserve-deposit-v1.js';
import { assertSubstrateFederatedPooledReserveDepositV2Packet, buildSubstrateFederatedPooledReserveDepositV2 as build,
  type BuildSubstrateFederatedPooledReserveDepositV2Input as Input } from './substrate-federated-pooled-reserve-deposit-v2.js';
import { materializeSubstrateFederatedWithdrawalFixtureBox as box,
  substrateFederatedWithdrawalFixtureTemplate as template } from './substrate-federated-burn-settlement-v2-fixture.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';

const P2PK = '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
let base: Input;

beforeAll(async () => {
  const vector = JSON.parse(readFileSync(new URL('../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url), 'utf8'));
  const identity = JSON.parse(readFileSync(new URL('../test-vectors/substrate-federated-v1-tracker-contract.json', import.meta.url), 'utf8'));
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
    template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
    trackerGenesisInputBoxIdHex: vector.input.tracker.trackerNftIdHex,
    profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile), application: identity.application,
  });
  if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
    throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
  }
  const options = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  let familyCompilerInput: Input['familyCompilerInput'];
  let family: Input['familyCompilerReceipt'];
  try {
    const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
    familyCompilerInput = { trackerRequest, trackerReceipt, templates: {
      duplicatePrevention: template('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
      sourceLock: template('contracts/MainChainLockPooledReserveV6.es'),
      pooledReserve: template('contracts/MainChainPooledReserveValidityApplicationV6.es'),
    }, duplicatePreventionGenesisInputBoxIdHex: '0e'.repeat(32), pooledReserveGenesisInputBoxIdHex: '0f'.repeat(32) };
    family = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(familyCompilerInput);
  } finally { process.env.NODE_OPTIONS = options; }
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(family.profile);
  base = {
    familyCompilerInput, familyCompilerReceipt: family,
    sourceFundingInput: await box({ value: '20000000', ergoTree: P2PK, assets: [], additionalRegisters: {}, creationHeight: 100 }),
    reserveState: { predecessor: await box({
      value: '2000000', ergoTree: family.contracts.pooledReserve.propositionHex,
      assets: [{ tokenId: family.profile.pooledReserveNftIdHex, amount: '1' }], creationHeight: 100,
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(family.profile.familyIdHex, 'hex')),
        R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'), 1, 32), R6: encodeLongRegister(0n),
      },
    }), depositHistory: [] },
    sourceIntent: {
      formatVersion: 2, sourceNetworkIdHex: profile.sourceNetworkIdHex, sidechainIdHex: profile.sidechainIdHex,
      bridgeAddressHex: profile.bridgeAddressHex, tokenAddressHex: profile.tokenAddressHex,
      settlementProfileIdHex: profile.settlementProfileIdHex, admissionProfileIdHex: family.profile.familyIdHex,
      sourceAssetIdHex: profile.settlementAssetIdHex, amountNanoErg: '10000000', recipientAddressHex: '31'.repeat(20),
    },
    depositorErgoTreeHex: P2PK,
    creationHeights: { currentErgoHeight: 111, sourceLockCreation: 110, reserveTransition: 111 },
  };
}, 120_000);

function input(): Input {
  const { familyCompilerInput, familyCompilerReceipt, ...state } = base;
  return { ...structuredClone(state), familyCompilerInput, familyCompilerReceipt };
}

describe('genuine V2 compiler -> complete deposit construction', () => {
  it.each(['funding', 'reserve', 'history', 'intent', 'depositor', 'height', 'fees', 'templates'] as const)(
    'captures %s before the first construction await', async field => {
      const original = input();
      const changed: Input = { ...input(), familyCompilerInput: { ...base.familyCompilerInput,
        templates: structuredClone(base.familyCompilerInput.templates) },
      fees: { sourceLockCreationNanoErg: String(MINER_FEE), reserveTransitionNanoErg: String(MINER_FEE) } };
      const expected = await build(original);
      const pending = build(changed);
      if (field === 'funding') changed.sourceFundingInput.value = '1';
      if (field === 'reserve') changed.reserveState.predecessor.value = '1';
      if (field === 'history') Object.assign(changed.reserveState, { depositHistory: [
        { sourceLockBoxIdHex: '51'.repeat(32), depositCommitmentHex: '52'.repeat(32) },
      ] });
      if (field === 'intent') Object.assign(changed.sourceIntent, { amountNanoErg: '1' });
      if (field === 'depositor') Object.assign(changed, { depositorErgoTreeHex: '00' });
      if (field === 'height') Object.assign(changed.creationHeights, { reserveTransition: 0 });
      if (field === 'fees') Object.assign(changed.fees!, { sourceLockCreationNanoErg: '0' });
      if (field === 'templates') Object.assign(changed.familyCompilerInput.templates.sourceLock, {
        source: changed.familyCompilerInput.templates.sourceLock.source + '\n// changed after capture\n',
      });
      expect(await pending).toEqual(expected);
      await expect(build(changed)).rejects.toThrow();
    },
  );

  it('constructs both transactions with exact V2 identity, replay insertion and external fees', async () => {
    const packet = await build(input());
    expect(await build(input())).toEqual(packet);
    assertSubstrateFederatedPooledReserveDepositV2Packet(packet);
    expect(packet.version).toBe(2);
    expect(packet.familyCompiler).toEqual({
      trackerRequestDigestHex: base.familyCompilerInput.trackerRequest.requestDigestHex,
      trackerReceiptDigestHex: base.familyCompilerInput.trackerReceipt.receiptDigestHex,
      familyRequestDigestHex: base.familyCompilerReceipt.familyCompilerRequestDigestHex,
      familyReceiptDigestHex: base.familyCompilerReceipt.receiptDigestHex,
      compilerLockDigestHex: base.familyCompilerReceipt.compilerLockDigestHex,
    });
    expect(packet.transactions.reserveTransition.eip12Tx.inputs.map(value => value.boxId)).toEqual([
      base.reserveState.predecessor.boxId, packet.boxes.sourceLock.boxId, packet.boxes.transitionFeeFunding.boxId,
    ]);
    expect(packet.boxes.sourceLock.ergoTree).toBe(base.familyCompilerReceipt.contracts.sourceLock.propositionHex);
    expect(packet.boxes.reserveSuccessor.ergoTree).toBe(base.familyCompilerReceipt.contracts.pooledReserve.propositionHex);
    expect(packet.reserve).toMatchObject({ inputValueNanoErg: '2000000', outputValueNanoErg: '12000000',
      inputLiabilityNanoErg: '0', outputLiabilityNanoErg: '10000000', protectedSeedNanoErg: '2000000', successorDepositCount: 1 });
    for (const tx of Object.values(packet.transactions)) {
      expect(tx.eip12Tx.inputs.reduce((sum, value) => sum + BigInt(value.value), 0n))
        .toBe(tx.outputs.reduce((sum, value) => sum + BigInt(value.value), 0n));
      expect(tx.outputs.filter(value => value.ergoTree === MINER_FEE_TREE)).toMatchObject([{ value: String(MINER_FEE) }]);
    }
    expect(packet.boundaries).toMatchObject({ sourceLockConsumptionEstablished: false,
      fundsAuthorityEstablished: false, targetNodeAcceptanceEstablished: false });
    expect(() => assertSubstrateFederatedPooledReserveDepositV1Packet(packet)).toThrow(/provenance/);
  });

  it('keeps raw construction and copied packets non-authorizing and unbranded', async () => {
    const { familyCompilerInput: _compiler, familyCompilerReceipt: family, ...state } = input();
    const raw = await buildSubstrateFederatedPooledReserveDepositCandidate(state, family);
    const packet = await build(input());
    expect(raw.invariants.exactFederatedFamilyBound).toBe(false);
    expect(raw).not.toHaveProperty('familyCompiler');
    for (const value of [raw, structuredClone(packet), { ...packet }]) {
      expect(() => assertSubstrateFederatedPooledReserveDepositV2Packet(value)).toThrow(/provenance/);
      expect(() => assertSubstrateFederatedPooledReserveDepositV1Packet(value)).toThrow(/provenance/);
    }
  });

  it.each(['family', 'tracker', 'request'] as const)('rejects copied %s provenance', async role => {
    const changed = input();
    if (role === 'family') Object.assign(changed, { familyCompilerReceipt: structuredClone(base.familyCompilerReceipt) });
    else Object.assign(changed, { familyCompilerInput: { ...base.familyCompilerInput,
      [role === 'tracker' ? 'trackerReceipt' : 'trackerRequest']:
        structuredClone(base.familyCompilerInput[role === 'tracker' ? 'trackerReceipt' : 'trackerRequest']),
    } });
    await expect(build(changed)).rejects.toThrow(/provenance/);
  });

  it('rejects changed compiler genesis and templates without recompiling', async () => {
    await expect(build({ ...input(), familyCompilerInput: { ...base.familyCompilerInput,
      pooledReserveGenesisInputBoxIdHex: '42'.repeat(32) } })).rejects.toThrow(/binding drifted/);
    const templates = structuredClone(base.familyCompilerInput.templates);
    Object.assign(templates.sourceLock, { source: templates.sourceLock.source + '\n// different source\n' });
    await expect(build({ ...input(), familyCompilerInput: { ...base.familyCompilerInput, templates } }))
      .rejects.toThrow(/binding drifted|template/);
  });

  it.each(['familyCompilerInput', 'familyCompilerReceipt', 'sourceFundingInput', 'reserveState',
    'sourceIntent', 'depositorErgoTreeHex', 'creationHeights'] as const)(
    'rejects a missing or inherited own %s before construction', async key => {
      const original = input();
      const changed: Record<string, unknown> = { ...original };
      delete changed[key];
      for (const value of [changed, Object.assign(Object.create({ [key]: original[key] }), changed)]) {
        await expect(build(value as unknown as Input)).rejects.toThrow(/unknown or missing fields/);
      }
    },
  );

  it('rejects extra authority claims before reading compiler provenance', async () => {
    await expect(build({ ...input(), familyCompilerReceipt: {} as Input['familyCompilerReceipt'], verified: true } as Input))
      .rejects.toThrow(/unknown or missing fields/);
  });

  it.each(['sourceNetworkIdHex', 'sidechainIdHex', 'bridgeAddressHex', 'tokenAddressHex',
    'settlementProfileIdHex', 'admissionProfileIdHex', 'sourceAssetIdHex'] as const)(
    'rejects source intent %s substitution', async field => {
      const changed = input();
      const bytes = field.endsWith('AddressHex') ? 20 : 32;
      await expect(build({ ...changed, sourceIntent: { ...changed.sourceIntent, [field]: '43'.repeat(bytes) } }))
        .rejects.toThrow(/does not match the federated family/);
    },
  );

  it.each([
    ['tree', 'substrate federated reserve predecessor identity or policy mismatch'],
    ['singleton', 'substrate federated reserve predecessor identity or policy mismatch'],
    ['family', 'substrate federated reserve predecessor identity or policy mismatch'],
    ['liability', 'substrate federated reserve liability is invalid'],
    ['history', 'substrate federated reserve deposit history does not match its AVL digest'],
  ] as const)(
    'rejects a canonically re-encoded wrong reserve %s', async (fault, error) => {
      const changed = input();
      const predecessor = changed.reserveState.predecessor;
      if (fault === 'tree') predecessor.ergoTree = P2PK;
      if (fault === 'singleton') predecessor.assets[0].tokenId = '44'.repeat(32);
      if (fault === 'family') predecessor.additionalRegisters.R4 = encodeCollByteRegister(Buffer.from('45'.repeat(32), 'hex'));
      if (fault === 'liability') predecessor.additionalRegisters.R6 = encodeLongRegister(2_000_001n);
      const depositHistory = fault === 'history'
        ? [{ sourceLockBoxIdHex: '46'.repeat(32), depositCommitmentHex: '47'.repeat(32) }]
        : changed.reserveState.depositHistory;
      await expect(build({ ...changed, reserveState: { predecessor: await box(predecessor), depositHistory } }))
        .rejects.toThrow(error);
    },
  );

  it('rejects the refund boundary and insufficient external funding', async () => {
    const changed = input();
    await expect(build({ ...changed, creationHeights: { ...changed.creationHeights,
      currentErgoHeight: 10110, reserveTransition: 10110 } })).rejects.toThrow(/refund|timeout/i);
    await expect(build({ ...input(), sourceFundingInput: await box({ ...base.sourceFundingInput, value: '10000000' }) }))
      .rejects.toThrow(/funding|cover/i);
  });

  it('does not reinterpret an unchanged V1 packet or family as V2', async () => {
    const familyBinding = bindSubstrateFederatedSettlementFamilyCompilerIdentityV1(getSubstrateFederatedSettlementFamilyV1FixtureIdentity());
    const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(familyBinding.profile);
    const { familyCompilerInput: _compiler, familyCompilerReceipt: _receipt, ...state } = input();
    const old = await buildSubstrateFederatedPooledReserveDepositV1({
      ...state, familyBinding,
      sourceIntent: { ...base.sourceIntent, sourceNetworkIdHex: profile.sourceNetworkIdHex, sidechainIdHex: profile.sidechainIdHex,
        bridgeAddressHex: profile.bridgeAddressHex, tokenAddressHex: profile.tokenAddressHex,
        settlementProfileIdHex: profile.settlementProfileIdHex, admissionProfileIdHex: familyBinding.profile.familyIdHex,
        sourceAssetIdHex: profile.settlementAssetIdHex },
      reserveState: { depositHistory: [], predecessor: await box({ ...base.reserveState.predecessor,
        ergoTree: familyBinding.contracts.pooledReserve.propositionHex,
        assets: [{ tokenId: familyBinding.profile.pooledReserveNftIdHex, amount: '1' }],
        additionalRegisters: { ...base.reserveState.predecessor.additionalRegisters,
          R4: encodeCollByteRegister(Buffer.from(familyBinding.profile.familyIdHex, 'hex')) },
      }) },
    });
    expect(() => assertSubstrateFederatedPooledReserveDepositV2Packet(old)).toThrow(/provenance/);
    await expect(build({ ...input(), familyCompilerReceipt: familyBinding as unknown as Input['familyCompilerReceipt'] }))
      .rejects.toThrow(/provenance/);
  });
});
