import { beforeAll, describe, expect, it } from 'vitest';

import { getDupTreeDigest } from './avl-bridge.js';
import {
  decodeCanonicalLongRegister, encodeAvlTreeRegister, encodeCollByteRegister,
  encodeIntRegister, encodeLongRegister, MINER_FEE, MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  assertSubstrateFederatedBurnSettlementV1Packet,
  buildSubstrateFederatedBurnSettlementCandidate,
  getSubstrateFederatedTrackerDigestV1Hex,
} from './substrate-federated-burn-settlement-v1.js';
import {
  assertSubstrateFederatedBurnSettlementV2Packet,
  buildSubstrateFederatedBurnSettlementV2 as build,
  type BuildSubstrateFederatedBurnSettlementV2Input as Input,
} from './substrate-federated-burn-settlement-v2.js';
import {
  buildSubstrateFederatedBurnSettlementV2FixtureInput,
  materializeSubstrateFederatedWithdrawalFixtureBox as box,
  substrateFederatedWithdrawalFixtureTemplate as template,
} from './substrate-federated-burn-settlement-v2-fixture.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1 } from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2 } from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { buildSubstrateFederatedTrackerCompilerRequestV1 } from './substrate-federated-tracker-compiler-v1.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV1 } from './substrate-federated-tracker-jvm-compiler-v1.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

const OTHER_TREE = '0008cd0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
let base: Input;
let alternateFamily: Input['familyCompilerReceipt'] | undefined;
let v1Tracker: Awaited<ReturnType<typeof compileSubstrateFederatedTrackerWithPinnedJvmV1>> | undefined;
let v1Family: Awaited<ReturnType<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1>> | undefined;

beforeAll(async () => {
  base = await withCompilerEnvironment(buildSubstrateFederatedBurnSettlementV2FixtureInput);
}, 120_000);

async function withCompilerEnvironment<T>(operation: () => Promise<T>): Promise<T> {
  if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
    throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
  }
  const options = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  try {
    return await operation();
  } finally {
    process.env.NODE_OPTIONS = options;
  }
}

async function legacyReceipts(includeFamily: boolean) {
  return withCompilerEnvironment(async () => {
    const request = base.familyCompilerInput.trackerRequest;
    const v1Request = buildSubstrateFederatedTrackerCompilerRequestV1({
      template: template('contracts/SPVTrackerSubstrateFederatedV1.es'),
      trackerGenesisInputBoxIdHex: request.trackerNftIdHex,
      profile: request.profile, application: request.application,
    });
    v1Tracker ??= await compileSubstrateFederatedTrackerWithPinnedJvmV1(v1Request);
    if (includeFamily) {
      v1Family ??= await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
        ...base.familyCompilerInput, trackerRequest: v1Request, trackerReceipt: v1Tracker,
      });
    }
    return { tracker: v1Tracker, family: v1Family };
  });
}

describe('V2 compiler receipts -> synthetic complete withdrawal', () => {
  it.each(['trackerState', 'reserveState', 'duplicatePreventionState', 'feeFundingInput',
    'claim', 'currentErgoHeight', 'creationHeight'] as const)(
    'preserves non-enumerable own construction field %s', async key => {
      const changed = input();
      Object.defineProperty(changed, key, { value: changed[key], enumerable: false });
      expect(await build(changed)).toEqual(await build(input()));
    },
  );

  it.each(['non-enumerable', 'inherited'] as const)(
    'does not silently default a %s explicit fee', async kind => {
      const changed = input();
      if (kind === 'non-enumerable') {
        Object.defineProperty(changed, 'feeNanoErg', { value: MINER_FEE + 1, enumerable: false });
      } else {
        delete (changed as { feeNanoErg?: unknown }).feeNanoErg;
        Object.setPrototypeOf(changed, { feeNanoErg: MINER_FEE + 1 });
      }
      await expect(build(changed))
        .rejects.toThrow('substrate federated fee funding must be exact pure ERG');
    },
  );

  it('materializes the exact deterministic burn/DUP/reserve/payout/external-fee join', async () => {
    const packet = await build(input());
    expect(await build(input())).toEqual(packet);
    assertSubstrateFederatedBurnSettlementV2Packet(packet);
    const family = base.familyCompilerReceipt;
    expect(packet).toMatchObject({
      schema: 'e2s.substrate-federated-burn-settlement.v2', version: 2,
      familyIdHex: family.profile.familyIdHex,
      familyCompilerReceiptDigestHex: family.receiptDigestHex,
      familyCompilerRequestDigestHex: family.familyCompilerRequestDigestHex,
      trackerCompilerReceiptDigestHex: base.familyCompilerInput.trackerReceipt.receiptDigestHex,
      trackerCompilerRequestDigestHex: base.familyCompilerInput.trackerRequest.requestDigestHex,
      compilerLockDigestHex: family.compilerLockDigestHex,
    });
    const tx = packet.transaction;
    expect(tx.eip12Tx.inputs.map(value => value.boxId)).toEqual([
      base.reserveState.predecessor.boxId, base.duplicatePreventionState.predecessor.boxId,
      base.feeFundingInput.boxId,
    ]);
    expect(tx.eip12Tx.dataInputs).toEqual([base.trackerState.dataInput]);
    expect(tx.eip12Tx.inputs.map(value => value.extension)).toEqual([
      {}, packet.contextExtensions.duplicatePrevention, {},
    ]);
    expect(Object.keys(packet.contextExtensions.duplicatePrevention)).toEqual(['0', '1', '2', '3']);
    expect(tx.outputs).toHaveLength(4);
    const [reserve, dup, payout, fee] = tx.outputs;
    expect(reserve.ergoTree).toBe(family.contracts.pooledReserve.propositionHex);
    expect(reserve.assets).toEqual(base.reserveState.predecessor.assets);
    expect(reserve.additionalRegisters).toEqual({
      ...base.reserveState.predecessor.additionalRegisters, R6: encodeLongRegister(30_000_000n),
    });
    expect(reserve.value).toBe('32000000');
    expect(BigInt(base.reserveState.predecessor.value) - BigInt(reserve.value)).toBe(10_000_000n);
    expect(BigInt(reserve.value) - decodeCanonicalLongRegister(reserve.additionalRegisters.R6)).toBe(2_000_000n);
    expect(dup.ergoTree).toBe(family.contracts.duplicatePrevention.propositionHex);
    expect(dup.assets).toEqual(base.duplicatePreventionState.predecessor.assets);
    expect(dup.value).toBe(base.duplicatePreventionState.predecessor.value);
    expect(dup.additionalRegisters).toEqual({
      ...base.duplicatePreventionState.predecessor.additionalRegisters,
      R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([packet.burn.leaf.burnIdHex]), 'hex'), 1, 1),
    });
    expect(payout).toMatchObject({
      value: '10000000', ergoTree: base.claim.recipientErgoTreeHex, assets: [], additionalRegisters: {},
    });
    expect(fee).toMatchObject({ value: String(MINER_FEE), ergoTree: MINER_FEE_TREE, assets: [], additionalRegisters: {} });
    expect(tx.eip12Tx.inputs.reduce((sum, value) => sum + BigInt(value.value), 0n))
      .toBe(tx.outputs.reduce((sum, value) => sum + BigInt(value.value), 0n));
    expect(tx.outputs.every(value => value.creationHeight === base.creationHeight)).toBe(true);
    for (const [name, value] of Object.entries(packet.boundaries)) {
      expect(value, name).toBe(name === 'burnSettlementTransactionConstructed');
    }
  });

  it.each(['familyCompilerInput', 'familyCompilerReceipt', 'trackerState', 'reserveState',
    'duplicatePreventionState', 'feeFundingInput', 'claim', 'currentErgoHeight', 'creationHeight'] as const)(
    'rejects inherited and missing own ingress field %s before capture', async key => {
      const original = input();
      const state: Record<string, unknown> = { ...original };
      delete state[key];
      for (const value of [state, Object.assign(Object.create({ [key]: original[key] }), state)]) {
        await expect(build(value as Input))
          .rejects.toThrow('substrate federated burn-settlement input contains unknown or missing fields');
      }
    },
  );

  it('rejects extra ingress fields before compiler authentication', async () => {
    await expect(build({ ...input(), familyCompilerReceipt: {} as Input['familyCompilerReceipt'], verified: true } as Input))
      .rejects.toThrow('substrate federated burn-settlement input contains unknown or missing fields');
  });

  it.each(['unknown', 'copy', 'V1'] as const)('rejects %s family receipts', async kind => {
    const receipt = kind === 'unknown' ? {} : kind === 'copy'
      ? structuredClone(base.familyCompilerReceipt) : (await legacyReceipts(true)).family;
    await expect(build({ ...input(), familyCompilerReceipt: receipt as Input['familyCompilerReceipt'] }))
      .rejects.toThrow(/V2 settlement-family JVM receipt lacks process provenance/);
  }, 90_000);

  it.each(['unknown', 'copy', 'V1'] as const)('rejects %s tracker receipts', async kind => {
    const receipt = kind === 'unknown' ? {} : kind === 'copy'
      ? structuredClone(base.familyCompilerInput.trackerReceipt) : (await legacyReceipts(false)).tracker;
    await expect(build({
      ...input(), familyCompilerInput: { ...base.familyCompilerInput, trackerReceipt: receipt as Input['familyCompilerInput']['trackerReceipt'] },
    })).rejects.toThrow(/V2 JVM compiler receipt lacks process provenance/);
  }, 90_000);

  it('rejects a genuine family compiled for different genesis inputs', async () => {
    alternateFamily ??= await withCompilerEnvironment(() => compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2({
      ...base.familyCompilerInput, duplicatePreventionGenesisInputBoxIdHex: 'a1'.repeat(32),
    }));
    await expect(build({ ...input(), familyCompilerReceipt: alternateFamily }))
      .rejects.toThrow(/family compiler binding drifted/);
  }, 90_000);

  it('rejects a different genuine tracker request with the original receipt', async () => {
    const request = base.familyCompilerInput.trackerRequest;
    const other = buildSubstrateFederatedTrackerCompilerRequestV2({
      template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
      trackerGenesisInputBoxIdHex: 'a2'.repeat(32), profile: request.profile, application: request.application,
    });
    await expect(build({ ...input(), familyCompilerInput: { ...base.familyCompilerInput, trackerRequest: other } }))
      .rejects.toThrow(/receipt request binding drifted/);
  });

  it('rejects copied requests and changed source templates without running a compiler', async () => {
    await expect(build({ ...input(), familyCompilerInput: {
      ...base.familyCompilerInput, trackerRequest: structuredClone(base.familyCompilerInput.trackerRequest),
    } })).rejects.toThrow(/provenance/);
    const templates = structuredClone(base.familyCompilerInput.templates);
    (templates.duplicatePrevention as { source: string }).source += '\n// changed input\n';
    await expect(build({ ...input(), familyCompilerInput: { ...base.familyCompilerInput, templates } }))
      .rejects.toThrow(/binding drifted|template/);
  });

  it('cannot promote raw construction or field-identical copies into either packet brand', async () => {
    const { familyCompilerInput: _compiler, familyCompilerReceipt: family, ...state } = input();
    const raw = await buildSubstrateFederatedBurnSettlementCandidate(state, {
      profile: family.profile, pooledReserveTreeHex: family.contracts.pooledReserve.propositionHex,
      duplicatePreventionTreeHex: family.contracts.duplicatePrevention.propositionHex,
    });
    expect(raw.invariants.federatedAuthorityProfileBound).toBe(false);
    expect(raw).not.toHaveProperty('familyCompilerReceiptDigestHex');
    const packet = await build(input());
    const matching = { ...packet, ...raw, invariants: packet.invariants };
    expect(matching).toEqual(packet);
    for (const value of [raw, matching, structuredClone(packet)]) {
      expect(() => assertSubstrateFederatedBurnSettlementV2Packet(value)).toThrow(/process provenance/);
      expect(() => assertSubstrateFederatedBurnSettlementV1Packet(value)).toThrow(/not built in this process/);
    }
    expect(() => assertSubstrateFederatedBurnSettlementV1Packet(packet)).toThrow(/not built in this process/);
  });

  it.each([
    ['execution block', 180, 212], ['source block', 148, 180], ['runtime profile', 216, 248],
    ['settlement profile', 248, 280], ['federation profile', 280, 312], ['admission key set', 312, 344],
  ] as const)('rejects a root-consistent wrong tracker %s', async (_name, start, end) => {
    await expect(build({ ...input(), trackerState: await trackerState(bytes => bytes.fill(0xa3, start, end)) }))
      .rejects.toThrow(/tracker value binding mismatch/);
  });

  it.each([
    ['threshold', (bytes: Buffer) => bytes.writeUInt16BE(3, 344), /binding mismatch/],
    ['epoch', (bytes: Buffer) => bytes.writeBigUInt64BE(8n, 346), /binding mismatch/],
    ['burn root', (bytes: Buffer) => bytes.fill(0xa4, 40, 72), /burn inclusion/],
    ['burn count', (bytes: Buffer) => bytes.writeUInt32BE(4, 212), /burn count/],
    ['anchor depth', (bytes: Buffer) => bytes.writeUInt32BE(1029, 136), /anchor.*depth/],
    ['horizon', (bytes: Buffer) => bytes.writeBigUInt64BE(1029n, 354), /outside its horizon/],
  ] as const)('rejects tracker %s independently', async (_name, mutate, error) => {
    await expect(build({ ...input(), trackerState: await trackerState(mutate) })).rejects.toThrow(error);
  });

  it.each([
    ['tracker', 'ergoTree', OTHER_TREE, /exact singleton/],
    ['reserve', 'ergoTree', OTHER_TREE, /reserve predecessor identity/],
    ['dup', 'ergoTree', OTHER_TREE, /duplicate-prevention identity/],
    ['fee', 'value', String(MINER_FEE + 1), /exact pure ERG/],
    ['reserve', 'value', '10000000', /liability is invalid/],
  ] as const)('rejects %s %s substitution', async (role, field, value, error) => {
    const changed = input();
    await replaceBox(changed, role, { [field]: value });
    await expect(build(changed)).rejects.toThrow(error);
  });

  it.each([
    ['tracker', 'R4', encodeCollByteRegister(Buffer.from('a5'.repeat(32), 'hex')), /exact singleton/],
    ['tracker', 'R7', encodeLongRegister(999n), /latest height is stale/],
    ['tracker', 'R8', encodeIntRegister(1039), /stamp is invalid/],
    ['tracker', 'R9', encodeCollByteRegister(Buffer.from('a6'.repeat(32), 'hex')), /exact singleton/],
    ['reserve', 'R4', encodeCollByteRegister(Buffer.from('a7'.repeat(32), 'hex')), /reserve predecessor identity/],
    ['reserve', 'R6', encodeLongRegister(9_999_999n), /insufficient/],
    ['reserve', 'R6', encodeLongRegister(-1n), /liability is invalid/],
    ['dup', 'R4', encodeCollByteRegister(Buffer.from('a8'.repeat(32), 'hex')), /duplicate-prevention identity/],
    ['fee', 'R4', encodeLongRegister(1n), /exact pure ERG/],
  ] as const)('rejects %s %s independently', async (role, register, value, error) => {
    const changed = input();
    const prior = selectedBox(changed, role);
    await replaceBox(changed, role, { additionalRegisters: { ...prior.additionalRegisters, [register]: value } });
    await expect(build(changed)).rejects.toThrow(error);
  });

  it('rejects payout redirection', async () => {
    await expect(build({ ...input(), claim: { ...base.claim, recipientErgoTreeHex: OTHER_TREE } }))
      .rejects.toThrow(/payout binding/);
  });

  it.each([
    ['amountNanoErg', '10000001', /burn inclusion/],
    ['burnIdHex', 'a9'.repeat(32), /burnId/],
    ['sidechainBlockHashHex', 'aa'.repeat(32), /execution block hash/],
    ['sidechainIdHex', 'ab'.repeat(32), /burnId|sidechain ID/],
    ['assetIdHex', 'ac'.repeat(32), /settlement asset/],
  ] as const)('rejects burn %s substitution', async (key, value, error) => {
    await expect(build({ ...input(), claim: { ...base.claim, burnLeaf: { ...base.claim.burnLeaf, [key]: value } } }))
      .rejects.toThrow(error);
  });

  it('rejects burn inclusion proof substitution', async () => {
    const changed = input();
    (changed.claim.burnProof[0] as { hashHex: string }).hashHex = 'ad'.repeat(32);
    await expect(build(changed)).rejects.toThrow(/burn inclusion/);
  });

  it('rejects replay against a consistent nonempty DUP root', async () => {
    const changed = input();
    const historyKeys = [changed.claim.burnLeaf.burnIdHex];
    const predecessor = await box({ ...changed.duplicatePreventionState.predecessor, additionalRegisters: {
      ...changed.duplicatePreventionState.predecessor.additionalRegisters,
      R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest(historyKeys), 'hex'), 1, 1),
    } });
    await expect(build({ ...changed, duplicatePreventionState: { historyKeys, predecessor } }))
      .rejects.toThrow(/already in replay history/);
  });

  it('rejects divergent DUP history', async () => {
    await expect(build({ ...input(), duplicatePreventionState: {
      ...base.duplicatePreventionState, historyKeys: ['ae'.repeat(32)],
    } })).rejects.toThrow(/history mismatch/);
  });

  it.each(['tracker', 'reserve', 'dup', 'fee'] as const)('rejects extra tokens on %s', async role => {
    const changed = input();
    const prior = selectedBox(changed, role);
    await replaceBox(changed, role, { assets: [...prior.assets, { tokenId: 'af'.repeat(32), amount: '1' }] });
    await expect(build(changed)).rejects.toThrow(/singleton|identity|pure ERG/);
  });

  it('rejects protected-seed depletion even when liability covers the burn', async () => {
    const changed = input();
    await replaceBox(changed, 'reserve', {
      value: '10999999', additionalRegisters: { ...changed.reserveState.predecessor.additionalRegisters, R6: encodeLongRegister(10_000_000n) },
    });
    await expect(build(changed)).rejects.toThrow(/reserve conservation/);
  });

  it('rejects an attempt to take the fee from the reserve', async () => {
    const changed = input();
    await replaceBox(changed, 'fee', { value: '1000000' });
    await expect(build(changed)).rejects.toThrow(/exact pure ERG/);
  });

  it('snapshots state and retains original compiler references across awaits', async () => {
    const changed = input();
    const pending = build(changed);
    const mutable = changed as any;
    mutable.familyCompilerReceipt = {};
    mutable.familyCompilerInput.trackerReceipt = {};
    mutable.claim.recipientErgoTreeHex = OTHER_TREE;
    mutable.trackerState.history[0].value = '00'.repeat(370);
    const packet = await pending;
    expect(packet.familyCompilerReceiptDigestHex).toBe(base.familyCompilerReceipt.receiptDigestHex);
    expect(packet.boxes.payout.ergoTree).toBe(base.claim.recipientErgoTreeHex);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.invariants)).toBe(true);
    expect(Object.isFrozen(packet.transaction.outputs[0].additionalRegisters)).toBe(true);
  });
});

function input(): Input {
  const { familyCompilerInput, familyCompilerReceipt, ...state } = base;
  return { ...structuredClone(state), familyCompilerReceipt, familyCompilerInput: { ...familyCompilerInput } };
}

async function trackerState(mutate: (bytes: Buffer) => unknown): Promise<Input['trackerState']> {
  const bytes = Buffer.from(base.trackerState.history[0].value, 'hex');
  mutate(bytes);
  const history = [{ key: base.trackerState.history[0].key, value: bytes.toString('hex') }];
  return { history, dataInput: await box({ ...base.trackerState.dataInput, additionalRegisters: {
    ...base.trackerState.dataInput.additionalRegisters,
    R5: encodeAvlTreeRegister(Buffer.from(getSubstrateFederatedTrackerDigestV1Hex(history), 'hex'), 1, 370),
  } }) };
}

type Role = 'tracker' | 'reserve' | 'dup' | 'fee';
function selectedBox(value: Input, role: Role): Eip12Box {
  return role === 'tracker' ? value.trackerState.dataInput : role === 'reserve' ? value.reserveState.predecessor
    : role === 'dup' ? value.duplicatePreventionState.predecessor : value.feeFundingInput;
}

async function replaceBox(value: Input, role: Role, changes: Partial<Eip12Box>): Promise<void> {
  const replacement = await box({ ...selectedBox(value, role), ...changes });
  const mutable = value as any;
  if (role === 'tracker') mutable.trackerState.dataInput = replacement;
  else if (role === 'reserve') mutable.reserveState.predecessor = replacement;
  else if (role === 'dup') mutable.duplicatePreventionState.predecessor = replacement;
  else mutable.feeFundingInput = replacement;
}
