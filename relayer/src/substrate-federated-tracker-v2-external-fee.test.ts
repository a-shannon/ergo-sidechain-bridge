import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import { tracker_application_v2_empty_digest } from '../../wasm-avl/pkg/bridge_avl.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister } from './ergo-encoding.js';
import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { MINER_FEE, MINER_FEE_TREE } from './profiles/substrate-grandpa-v1/ergo-settlement-policy.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import {
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context,
  type SubstrateFederatedTrackerV2Context,
} from './substrate-federated-tracker-v2.js';
import {
  assertSubstrateFederatedTrackerV2ExternalFeeTransaction as assertTransaction,
  buildSubstrateFederatedTrackerV2ExternalFeeTransaction as build,
  buildSubstrateFederatedTrackerV2FeeFunding as buildFunding,
  buildSubstrateFederatedWithdrawalV2FeeFunding as buildWithdrawalFunding,
  type BuildSubstrateFederatedTrackerV2ExternalFeeTransactionInput as BuildInput,
  type SubstrateFederatedTrackerV2ExternalFeeTransaction,
} from './substrate-federated-tracker-v2-external-fee.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';

const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url,
), 'utf8'));
const identity = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json', import.meta.url,
), 'utf8'));
const PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const OTHER_PUBLIC_KEY = `03${PUBLIC_KEY.slice(2)}`;
const CURRENT_HEIGHT = 1_030;
type Candidate = Pick<Eip12Box, 'value' | 'ergoTree' | 'assets' | 'additionalRegisters' | 'creationHeight'>;
let wasm: any;
let context: Readonly<SubstrateFederatedTrackerV2Context>;
let trackerInputBox: Eip12Box;
let feeInputBox: Eip12Box;
let input: BuildInput;
let transaction: Readonly<SubstrateFederatedTrackerV2ExternalFeeTransaction>;

describe('bounded V2 tracker external fee composition', () => {
  beforeAll(async () => {
    const module = await import('ergo-lib-wasm-nodejs');
    wasm = module.default ?? module;
    const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
    const statement = buildSubstrateFederatedCheckpointStatementV1({ ...vector.input.statement, profile });
    const compilerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      trackerGenesisInputBoxIdHex: vector.input.tracker.trackerNftIdHex,
      profile, application: identity.application,
      template: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
        source: readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url), 'utf8'),
      },
    });
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const testNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    let compilerReceipt;
    try {
      compilerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(compilerRequest);
    } finally {
      process.env.NODE_OPTIONS = testNodeOptions;
    }
    trackerInputBox = boxFromCandidate({
      value: '10000000', ergoTree: compilerReceipt.contract.propositionHex,
      assets: [{ tokenId: compilerRequest.trackerNftIdHex, amount: '1' }],
      creationHeight: 1_000,
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
        R5: encodeAvlTreeRegister(Buffer.from(tracker_application_v2_empty_digest(), 'hex'), 1, 370),
        R6: encodeCollByteRegister(Buffer.from(statement.sidechainIdHex, 'hex')),
        R7: encodeLongRegister(0n), R8: encodeIntRegister(0),
        R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')),
      },
    });
    const membership = buildErgoExtensionMembershipProof([
      { key: Buffer.from('0100', 'hex'), value: Buffer.from('bounded-v2-external-fee', 'ascii') },
      { key: Buffer.from('0401', 'hex'), value: Buffer.from(
        encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex), 'hex',
      ) },
    ], Buffer.from('0401', 'hex'));
    const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
      currentHeight: CURRENT_HEIGHT, anchorContextIndex: 1,
      anchorExtensionRootHex: membership.root.toString('hex'),
    });
    const observedHeaderContext = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders: synthetic.headers.map(header => header.raw), anchorContextIndex: 1,
      expectedAnchorHeaderIdHex: synthetic.anchorHeader.id,
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    });
    context = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
      compilerRequest, compilerReceipt, trackerInputBox, observedHeaderContext,
      encodedStatementHex: statement.encodedStatementHex,
      extensionMembershipProofHex: membership.proof.toString('hex'),
    });
    feeInputBox = boxFromCandidate({
      value: '1100000', ergoTree: `0008cd${PUBLIC_KEY}`, creationHeight: 1_000,
      assets: [], additionalRegisters: {},
    });
    input = { trackerContext: context, trackerInputBox, feeInputBox, feePayerPublicKeyHex: PUBLIC_KEY };
    transaction = await build(input);
  }, 90_000);

  it('preserves the exact tracker successor and funds only the canonical miner output', async () => {
    expect(transaction.schema).toBe('e2s.substrate-federated-v2-tracker-external-fee-transaction');
    expect(transaction.version).toBe(2);
    expect(transaction.trackerUnsignedTransactionIdHex).toBe(context.unsignedTransactionIdHex);
    expect(transaction.unsignedTransactionIdHex).not.toBe(context.unsignedTransactionIdHex);
    expect(transaction.minerFeeNanoErg).toBe(String(MINER_FEE));
    expect(transaction.inputBoxes).toEqual([trackerInputBox, feeInputBox]);
    const tx = transaction.eip12UnsignedTransaction;
    expect(tx.inputs).toEqual([
      { ...trackerInputBox, extension: context.contextExtension.eip12Values },
      { ...feeInputBox, extension: {} },
    ]);
    expect(tx.dataInputs).toEqual([]);
    expect(tx.outputs).toEqual([
      (context.eip12UnsignedTransaction.outputs as unknown[])[0],
      { value: String(MINER_FEE), ergoTree: MINER_FEE_TREE, assets: [],
        additionalRegisters: {}, creationHeight: CURRENT_HEIGHT },
    ]);
    expect(tx.outputs[0]).toBe((context.eip12UnsignedTransaction.outputs as unknown[])[0]);
    expect(tx.outputs[0].value).toBe(trackerInputBox.value);
    expect(BigInt(tx.inputs[0].value) + BigInt(tx.inputs[1].value))
      .toBe(BigInt(tx.outputs[0].value) + BigInt(tx.outputs[1].value));
    expect(tx.outputs[0].assets).toEqual(trackerInputBox.assets);
    expect(Object.keys(tx.inputs[0].extension)).toEqual(['0', '1', '2']);
    expect(tx.inputs[0].extension['2']).toBe(encodeIntRegister(context.trackerTransition.anchorHeight));
    expect(transaction.boundaries).toEqual({ ...context.boundaries, feesIncluded: true });
    expect(await build(input)).toEqual(transaction);
    expectDeepFrozen(transaction);
    expect(() => assertTransaction(transaction)).not.toThrow();
  });

  it.each([0, 1, 720] as const)('funds the exact tracker fee from mature operator change (delay %s)', async delay => {
    const source = boxFromCandidate({ value: '38900000',
      ergoTree: delay === 0 ? `0008cd${OTHER_PUBLIC_KEY}`
        : deriveDevnetRewardErgoTreeHexForDelay(OTHER_PUBLIC_KEY, delay),
      creationHeight: 100, assets: [], additionalRegisters: {} });
    const funded = await buildFunding({ sourceBox: source, fundingPublicKeyHex: OTHER_PUBLIC_KEY,
      feePayerPublicKeyHex: PUBLIC_KEY, currentHeight: CURRENT_HEIGHT - 1 });
    expect(await buildWithdrawalFunding({ sourceBox: source, fundingPublicKeyHex: OTHER_PUBLIC_KEY,
      feePayerPublicKeyHex: PUBLIC_KEY, currentHeight: CURRENT_HEIGHT - 1 })).toEqual(funded);
    expect(funded.outputs.map(box => box.value)).toEqual(['1100000', '36700000', '1100000']);
    expect(funded.outputs.map(box => box.ergoTree))
      .toEqual([`0008cd${PUBLIC_KEY}`, `0008cd${OTHER_PUBLIC_KEY}`, MINER_FEE_TREE]);
    expect(funded.outputs.reduce((sum, box) => sum + BigInt(box.value), 0n)).toBe(BigInt(source.value));
    expect(Object.isFrozen(funded.eip12Tx.inputs[0])).toBe(true);
    const update = await build({ ...input, feeInputBox: funded.outputs[0] });
    expect(update.inputBoxes[1].boxId).toBe(funded.outputs[0]!.boxId);
    expect(update.eip12UnsignedTransaction.outputs[0].value).toBe(trackerInputBox.value);
    expect(update.eip12UnsignedTransaction.outputs[0].assets).toEqual(trackerInputBox.assets);
  });

  it.each([
    ['token-bearing', { assets: [{ tokenId: 'ab'.repeat(32), amount: '1' }] }, /pure ERG/],
    ['register-bearing', { additionalRegisters: { R4: '0400' } }, /pure ERG/],
    ['wrong owner', { ergoTree: `0008cd${OTHER_PUBLIC_KEY}` }, /operator-owned/],
    ['tracker script', { ergoTree: '10010100d17300' }, /operator-owned/],
    ['underfunded', { value: '3199999' }, /non-dust/],
    ['immature', { ergoTree: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY, 720), creationHeight: 400 }, /mature/],
    ['future height', { creationHeight: CURRENT_HEIGHT }, /mature/],
  ] as const)('rejects %s fee funding without relaxing the tracker fee shape', async (_label, patch, error) => {
    const source = boxFromCandidate({ value: '38900000', ergoTree: `0008cd${PUBLIC_KEY}`,
      creationHeight: 100, assets: [], additionalRegisters: {}, ...structuredClone(patch) as Partial<Candidate> });
    await expect(buildFunding({ sourceBox: source, fundingPublicKeyHex: PUBLIC_KEY,
      feePayerPublicKeyHex: OTHER_PUBLIC_KEY, currentHeight: CURRENT_HEIGHT })).rejects.toThrow(error);
    await expect(buildWithdrawalFunding({ sourceBox: source, fundingPublicKeyHex: PUBLIC_KEY,
      feePayerPublicKeyHex: OTHER_PUBLIC_KEY, currentHeight: CURRENT_HEIGHT })).rejects.toThrow(error);
  });

  it.each([0, -1, 1.5, 0x80000000, NaN])('rejects invalid fee funding height %s', async currentHeight => {
    await expect(buildFunding({ sourceBox: feeInputBox, fundingPublicKeyHex: PUBLIC_KEY,
      feePayerPublicKeyHex: OTHER_PUBLIC_KEY, currentHeight })).rejects.toThrow(/signed Int/);
    await expect(buildWithdrawalFunding({ sourceBox: feeInputBox, fundingPublicKeyHex: PUBLIC_KEY,
      feePayerPublicKeyHex: OTHER_PUBLIC_KEY, currentHeight })).rejects.toThrow(/signed Int/);
  });

  it.each(['fundingPublicKeyHex', 'feePayerPublicKeyHex'] as const)('rejects invalid %s', async field => {
    await expect(buildFunding({ sourceBox: feeInputBox, fundingPublicKeyHex: PUBLIC_KEY,
      feePayerPublicKeyHex: OTHER_PUBLIC_KEY, currentHeight: CURRENT_HEIGHT,
      [field]: `02${'ff'.repeat(32)}` })).rejects.toThrow();
    await expect(buildWithdrawalFunding({ sourceBox: feeInputBox, fundingPublicKeyHex: PUBLIC_KEY,
      feePayerPublicKeyHex: OTHER_PUBLIC_KEY, currentHeight: CURRENT_HEIGHT,
      [field]: `02${'ff'.repeat(32)}` })).rejects.toThrow();
  });

  it('matches independent exact WASM EIP-12, both box Sigma bytes, proofless bytes and ID', () => {
    const expected = {
      inputs: [
        { boxId: trackerInputBox.boxId, extension: context.contextExtension.eip12Values },
        { boxId: feeInputBox.boxId, extension: {} },
      ],
      dataInputs: [],
      outputs: [
        (context.eip12UnsignedTransaction.outputs as unknown[])[0],
        { value: String(MINER_FEE), ergoTree: MINER_FEE_TREE, creationHeight: CURRENT_HEIGHT,
          assets: [], additionalRegisters: {} },
      ],
    };
    let unsigned: any;
    let signerView: any;
    let id: any;
    let proofless: any;
    let roundTrip: any;
    try {
      unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(expected));
      signerView = wasm.UnsignedTransaction.from_json(JSON.stringify(transaction.eip12UnsignedTransaction));
      expect(unsigned.to_js_eip12()).toEqual(expected);
      expect(signerView.to_js_eip12()).toEqual(expected);
      id = unsigned.id();
      expect(id.to_str()).toBe(transaction.unsignedTransactionIdHex);
      const consumed = unsigned;
      unsigned = undefined;
      proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array(), new Uint8Array()]);
      const bytes = Buffer.from(proofless.sigma_serialize_bytes());
      expect(bytes.toString('hex')).toBe(transaction.prooflessTransactionHex);
      expect(bytes.length).toBe(transaction.prooflessTransactionBytes);
      expect(Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex'))
        .toBe(transaction.unsignedTransactionIdHex);
      const actual = proofless.to_js_eip12();
      expect(actual.inputs.map((box: any) => box.spendingProof))
        .toEqual([{ proofBytes: '', extension: context.contextExtension.eip12Values },
          { proofBytes: '', extension: {} }]);
      roundTrip = wasm.Transaction.from_json(JSON.stringify(actual));
      expect(Buffer.from(roundTrip.sigma_serialize_bytes())).toEqual(bytes);
      for (const [index, value] of [trackerInputBox, feeInputBox].entries()) {
        const box = wasm.ErgoBox.from_json(JSON.stringify(value));
        try {
          expect(box.to_js_eip12()).toEqual(value);
          expect(Buffer.from(box.sigma_serialize_bytes()).toString('hex'))
            .toBe(transaction.inputBoxSigmaHex[index]);
        } finally { box.free(); }
      }
      expect(transaction.inputBoxSigmaHex[0]).toBe(context.inputBoxSigmaHex);
    } finally {
      roundTrip?.free?.();
      proofless?.free?.();
      id?.free?.();
      signerView?.free?.();
      unsigned?.free?.();
    }
  });

  it.each([0, CURRENT_HEIGHT - 1])('accepts exact fee creation height %s', async creationHeight => {
    const fee = boxFromCandidate({ ...candidateFromBox(feeInputBox), creationHeight });
    const built = await build({ ...input, feeInputBox: fee });
    expect(built.inputBoxes[1]).toEqual(fee);
    expect(built.eip12UnsignedTransaction.outputs[1].creationHeight).toBe(CURRENT_HEIGHT);
  });

  const candidateMutations: Array<[string, (box: Candidate) => void]> = [
    ['fee below exact amount', box => { box.value = '1099999'; }],
    ['fee above exact amount / change forbidden', box => { box.value = '1100001'; }],
    ['token', box => { box.assets = [{ tokenId: 'ab'.repeat(32), amount: '1' }]; }],
    ['register', box => { box.additionalRegisters.R4 = encodeIntRegister(0); }],
    ['other valid P2PK key', box => { box.ergoTree = `0008cd${OTHER_PUBLIC_KEY}`; }],
    ['non-P2PK tree', box => { box.ergoTree = MINER_FEE_TREE; }],
    ['current height', box => { box.creationHeight = CURRENT_HEIGHT; }],
    ['future height', box => { box.creationHeight = CURRENT_HEIGHT + 1; }],
  ];
  it.each(candidateMutations)('rejects rematerialized fee candidate: %s', async (_name, mutate) => {
    const candidate = candidateFromBox(feeInputBox);
    mutate(candidate);
    const fee = boxFromCandidate(candidate);
    await expect(build({ ...input, feeInputBox: fee })).rejects.toThrow(/fee input box/);
  });

  const rawMutations: Array<[string, (box: Record<string, any>) => void]> = [
    ['boxId mismatch', box => { box.boxId = 'ff'.repeat(32); }],
    ['transactionId mismatch', box => { box.transactionId = 'ff'.repeat(32); }],
    ['index mismatch', box => { box.index = 1; }],
    ['negative index', box => { box.index = -1; }],
    ['fractional index', box => { box.index = 0.5; }],
    ['oversized index', box => { box.index = 32768; }],
    ['negative height', box => { box.creationHeight = -1; }],
    ['fractional height', box => { box.creationHeight = 0.5; }],
    ['unsafe height', box => { box.creationHeight = Number.MAX_SAFE_INTEGER + 1; }],
    ['string height', box => { box.creationHeight = '1000'; }],
    ['numeric value', box => { box.value = 1100000; }],
    ['noncanonical value', box => { box.value = '01100000'; }],
    ['uppercase boxId', box => { box.boxId = box.boxId.toUpperCase(); }],
    ['uppercase transactionId', box => { box.transactionId = box.transactionId.toUpperCase(); }],
    ['uppercase tree', box => { box.ergoTree = box.ergoTree.toUpperCase(); }],
    ['missing assets', box => { delete box.assets; }],
    ['non-array assets', box => { box.assets = {}; }],
    ['missing registers', box => { delete box.additionalRegisters; }],
    ['null registers', box => { box.additionalRegisters = null; }],
    ['array registers', box => { box.additionalRegisters = []; }],
    ['extra field', box => { box.extra = true; }],
    ['caller extension', box => { box.extension = {}; }],
  ];
  it.each(rawMutations)('rejects non-exact fee input: %s', async (_name, mutate) => {
    const fee = structuredClone(feeInputBox);
    mutate(fee);
    await expect(build({ ...input, feeInputBox: fee })).rejects.toThrow();
  });

  it.each([null, [], {}, 'box'])('rejects non-box fee input %j', async fee => {
    await expect(build({ ...input, feeInputBox: fee })).rejects.toThrow();
  });

  it.each([
    '', PUBLIC_KEY.toUpperCase(), `0x${PUBLIC_KEY}`, `04${PUBLIC_KEY.slice(2)}`,
    PUBLIC_KEY.slice(2), `${PUBLIC_KEY}00`, `02${'ff'.repeat(32)}`, `02${'00'.repeat(32)}`,
    `00${'00'.repeat(32)}`,
  ])('rejects malformed or invalid curve key %s', async feePayerPublicKeyHex => {
    await expect(build({ ...input, feePayerPublicKeyHex })).rejects.toBeDefined();
  });

  it('rejects another valid captured key, duplicate box ID and tracker substitution', async () => {
    await expect(build({ ...input, feePayerPublicKeyHex: OTHER_PUBLIC_KEY })).rejects.toThrow(/fee input box/);
    await expect(build({ ...input, feeInputBox: trackerInputBox })).rejects.toThrow(/different box ID/);
    await expect(build({ ...input, feeInputBox: { ...feeInputBox, boxId: trackerInputBox.boxId } }))
      .rejects.toThrow(/different box ID/);
    const otherTracker = boxFromCandidate({ ...candidateFromBox(trackerInputBox), creationHeight: 1_001 });
    await expect(build({ ...input, trackerInputBox: otherTracker })).rejects.toThrow(/ID differs/);
    await expect(build({ ...input, trackerInputBox: feeInputBox })).rejects.toThrow(/ID differs/);
  });

  it.each(rawMutations)('rejects altered exact tracker input: %s', async (_name, mutate) => {
    const tracker = structuredClone(trackerInputBox);
    mutate(tracker);
    await expect(build({ ...input, trackerInputBox: tracker })).rejects.toThrow();
  });

  it('rejects cloned, spread, frozen-copy and cross-version context or transaction provenance', async () => {
    for (const trackerContext of [structuredClone(context), { ...context }, Object.freeze({ ...context }),
      { ...context, version: 1 }]) {
      await expect(Reflect.apply(build, undefined, [{ ...input, trackerContext }])).rejects.toThrow(/provenance/);
    }
    for (const value of [structuredClone(transaction), { ...transaction }, Object.freeze({ ...transaction }),
      context, null, {}]) {
      expect(() => assertTransaction(value)).toThrow(/provenance/);
    }
  });

  it('snapshots both nested boxes and every caller property before the first await', async () => {
    const tracker = structuredClone(trackerInputBox);
    const fee = structuredClone(feeInputBox);
    const caller = { ...input, trackerInputBox: tracker, feeInputBox: fee };
    const pending = build(caller);
    tracker.value = '1';
    tracker.assets[0]!.amount = '2';
    tracker.additionalRegisters.R4 = encodeIntRegister(1);
    fee.value = '1100001';
    fee.assets.push({ tokenId: 'ee'.repeat(32), amount: '1' });
    fee.additionalRegisters.R4 = encodeIntRegister(1);
    caller.trackerContext = structuredClone(context);
    caller.trackerInputBox = structuredClone(feeInputBox);
    caller.feeInputBox = structuredClone(trackerInputBox);
    caller.feePayerPublicKeyHex = OTHER_PUBLIC_KEY;
    expect(await pending).toEqual(transaction);
    expectDeepFrozen(transaction);
  });
});

function candidateFromBox(box: Eip12Box): Candidate {
  return structuredClone({ value: box.value, ergoTree: box.ergoTree, assets: box.assets,
    additionalRegisters: box.additionalRegisters, creationHeight: box.creationHeight });
}

function boxFromCandidate(candidate: Candidate): Eip12Box {
  let unsigned: any;
  let id: any;
  let candidates: any;
  let output: any;
  let box: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
      inputs: [{ boxId: '67'.repeat(32), extension: {} }], dataInputs: [], outputs: [candidate],
    }));
    id = unsigned.id();
    candidates = unsigned.output_candidates();
    output = candidates.get(0);
    box = wasm.ErgoBox.from_box_candidate(output, id, 0);
    return box.to_js_eip12() as Eip12Box;
  } finally {
    box?.free?.();
    output?.free?.();
    candidates?.free?.();
    id?.free?.();
    unsigned?.free?.();
  }
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}
