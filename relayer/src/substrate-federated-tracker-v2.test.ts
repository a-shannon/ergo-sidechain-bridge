import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  tracker_application_v2_empty_digest,
  tracker_application_v2_insert,
  tracker_application_v2_verify_insert,
} from '../../wasm-avl/pkg/bridge_avl.js';
import {
  BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE,
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister,
} from './ergo-encoding.js';
import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { buildSubstrateFederatedTrackerAdmissionV1 } from './profiles/substrate-federated-v1/tracker-admission.js';
import { buildSubstrateFederatedTrackerCompilerRequestV1 } from './substrate-federated-tracker-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV2,
  type SubstrateFederatedTrackerCompilerRequestV2,
} from './substrate-federated-tracker-compiler-v2.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV2,
  type SubstrateFederatedTrackerJvmCompilerReceiptV2,
} from './substrate-federated-tracker-jvm-compiler-v2.js';
import {
  assertExactSubstrateFederatedTrackerV2InputBox,
  assertSubstrateFederatedTrackerV2ContinuationContext,
  assertSubstrateFederatedTrackerV2Context,
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context as build,
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContinuationContext as buildContinuation,
  type BuildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Input as BuildInput,
  type BuildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContinuationInput as ContinuationInput,
  type SubstrateFederatedTrackerV2Context,
} from './substrate-federated-tracker-v2.js';
import { buildSubstrateFederatedTrackerV2ExternalFeeTransaction } from './substrate-federated-tracker-v2-external-fee.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url,
), 'utf8'));
const identity = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json', import.meta.url,
), 'utf8'));
const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
const statement = buildSubstrateFederatedCheckpointStatementV1({ ...vector.input.statement, profile });
let wasm: any;
let compilerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
let compilerReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
let receiptV1: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
let trackerInputBox: Eip12Box;
let input: BuildInput;
let context: Readonly<SubstrateFederatedTrackerV2Context>;
let firstSuccessor: Eip12Box;
let secondStatement: typeof statement;
let continuationInput: ContinuationInput;
let continuationContext: Readonly<SubstrateFederatedTrackerV2Context>;

type Candidate = Pick<Eip12Box, 'value' | 'ergoTree' | 'assets' | 'additionalRegisters' | 'creationHeight'>;

describe('observed-anchor compiler-bound federated tracker V2 FIRST/GENESIS', () => {
  beforeAll(async () => {
    const module = await import('ergo-lib-wasm-nodejs');
    wasm = module.default ?? module;
    const common = {
      trackerGenesisInputBoxIdHex: vector.input.tracker.trackerNftIdHex,
      profile,
      application: identity.application,
    };
    compilerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      ...common,
      template: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
        source: readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url), 'utf8'),
      },
    });
    const requestV1 = buildSubstrateFederatedTrackerCompilerRequestV1({
      ...common,
      template: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
        source: readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV1.es', import.meta.url), 'utf8'),
      },
    });
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const testNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      compilerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(compilerRequest);
      receiptV1 = await compileSubstrateFederatedTrackerWithPinnedJvmV1(requestV1);
    } finally {
      process.env.NODE_OPTIONS = testNodeOptions;
    }
    trackerInputBox = boxFromCandidate({
      value: '10000000',
      ergoTree: compilerReceipt.contract.propositionHex,
      assets: [{ tokenId: compilerRequest.trackerNftIdHex, amount: '1' }],
      creationHeight: 1_000,
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
        R5: encodeAvlTreeRegister(Buffer.from(tracker_application_v2_empty_digest(), 'hex'), 1, 370),
        R6: encodeCollByteRegister(Buffer.from(statement.sidechainIdHex, 'hex')),
        R7: encodeLongRegister(0n),
        R8: encodeIntRegister(0),
        R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')),
      },
    });
    input = {
      compilerRequest, compilerReceipt, trackerInputBox,
      encodedStatementHex: statement.encodedStatementHex,
      ...anchorInput(statement.encodedStatementHex),
    };
    context = await build(input);
    firstSuccessor = boxFromCandidate(trackerOutputCandidate(context));
    secondStatement = buildSubstrateFederatedCheckpointStatementV1({
      ...vector.input.statement,
      sourceNativeBlockHeight: '1001',
      sourceNativeBlockHashHex: '13'.repeat(32),
      executionBlockHashHex: '14'.repeat(32),
      bridgeEventRootHex: '15'.repeat(32),
      profile,
    });
    continuationInput = {
      compilerRequest,
      compilerReceipt,
      previousContext: context,
      trackerInputBox: firstSuccessor,
      encodedStatementHex: secondStatement.encodedStatementHex,
      ...anchorInput(secondStatement.encodedStatementHex, '0401', 1_040),
    };
    continuationContext = await buildContinuation(continuationInput);
  }, 90_000);

  it('binds genuine V2 compiled bytes and absolute height, preserving V1 admission512/370', async () => {
    const anchor = input.observedHeaderContext.anchorHeader;
    expect(context.schema).toBe('e2s.substrate-federated-v2-tracker-context');
    expect(context.version).toBe(2);
    expect(context.trustModel).toBe('federated_non_trustless');
    expect(context.compilerRequestDigestHex).toBe(compilerRequest.requestDigestHex);
    expect(context.compilerReceiptDigestHex).toBe(compilerReceipt.receiptDigestHex);
    expect(context.contract).toEqual({ ...compilerReceipt.contract, trackerNftIdHex: compilerRequest.trackerNftIdHex });
    expect(context.contract.propositionHex).not.toBe(receiptV1.contract.propositionHex);
    expect(context.trackerTransition.anchorHeight).toBe(1_028);
    expect(context.trackerTransition).not.toHaveProperty('anchorContextIndex');
    expect(context.trackerTransition.anchorContextProvenance)
      .toBe(BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE);
    expect(context.contextExtension.keys).toEqual([0, 1, 2]);
    expect(context.contextExtension.eip12Values['2']).toBe(encodeIntRegister(anchor.height));
    expect(context.contextExtension.eip12Values['2']).not.toBe(encodeIntRegister(1));
    expect(context.statement.encodedHex).toHaveLength(512 * 2);
    const admission = buildSubstrateFederatedTrackerAdmissionV1({
      profile, encodedStatementHex: statement.encodedStatementHex,
      currentErgoHeight: 1_030, anchorHeaderIdHex: anchor.id, anchorHeaderHeight: anchor.height,
    });
    expect(context.trackerTransition.trackerKeyHex).toBe(admission.trackerKeyHex);
    expect(context.trackerTransition.trackerValueHex).toBe(admission.trackerValueHex);
    expect(context.trackerTransition.trackerValueHex).toHaveLength(370 * 2);
    expect(JSON.parse(tracker_application_v2_verify_insert(
      context.trackerTransition.inputDigestHex, admission.trackerKeyHex,
      admission.trackerValueHex, context.trackerTransition.avlInsertProofHex,
    )).new_digest_hex).toBe(context.trackerTransition.successorDigestHex);
    expect(context.trackerTransition.inputRegisters).toEqual(trackerInputBox.additionalRegisters);
    expect(context.trackerTransition.successorRegisters).toEqual({
      ...trackerInputBox.additionalRegisters,
      R5: encodeAvlTreeRegister(Buffer.from(context.trackerTransition.successorDigestHex, 'hex'), 1, 370),
      R7: encodeLongRegister(1_000n), R8: encodeIntRegister(1_030),
    });
    const bundle = Buffer.from(context.trackerTransition.transitionProofBundleHex, 'hex');
    const extensionBytes = Buffer.from(input.extensionMembershipProofHex, 'hex');
    expect(bundle.readBigUInt64BE()).toBe(BigInt(extensionBytes.length));
    expect(bundle.subarray(8, 8 + extensionBytes.length)).toEqual(extensionBytes);
    expect(bundle.subarray(8 + extensionBytes.length).toString('hex'))
      .toBe(context.trackerTransition.avlInsertProofHex);
    expect(await build(input)).toEqual(context);
  });

  it('round-trips exact WASM bytes and hash without fee or authority claims', async () => {
    let tx = wasm.UnsignedTransaction.from_json(JSON.stringify(context.eip12UnsignedTransaction));
    const txId = tx.id();
    const box = wasm.ErgoBox.from_json(JSON.stringify(trackerInputBox));
    let proofless: any;
    try {
      expect(tx.to_js_eip12()).toEqual(context.eip12UnsignedTransaction);
      expect(txId.to_str()).toBe(context.unsignedTransactionIdHex);
      expect(Buffer.from(box.sigma_serialize_bytes()).toString('hex')).toBe(context.inputBoxSigmaHex);
      const consumed = tx;
      tx = undefined;
      proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array()]);
      const bytes = Buffer.from(proofless.sigma_serialize_bytes());
      expect(bytes.toString('hex')).toBe(context.prooflessTransactionHex);
      expect(bytes.length).toBe(context.prooflessTransactionBytes);
      expect(Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex'))
        .toBe(context.unsignedTransactionIdHex);
    } finally {
      proofless?.free?.();
      tx?.free?.();
      txId.free?.();
      box.free?.();
    }
    expect(context.eip12UnsignedTransaction.outputs).toHaveLength(1);
    for (const field of [
      'feesIncluded', 'profileActivated', 'jvmReductionAccepted', 'nodeCheckPerformed',
      'targetNodeAcceptanceEstablished', 'signingPerformed', 'submissionPerformed',
      'broadcastPerformed', 'sourceSignaturesVerifiedOnChain', 'fundsAuthorityEstablished',
      'gate5Closed', 'trustlessStatusEstablished',
    ] as const) expect(context.boundaries[field], field).toBe(false);
    await expect(assertExactSubstrateFederatedTrackerV2InputBox(context, trackerInputBox))
      .resolves.toEqual(trackerInputBox);
    expectDeepFrozen(context);
  });

  it('rejects cloned or cross-version authority and observed context substitution', async () => {
    expect(() => assertSubstrateFederatedTrackerV2Context(structuredClone(context))).toThrow(/provenance/);
    expect(() => assertSubstrateFederatedTrackerV2Context({ ...context, version: 1 })).toThrow(/provenance/);
    await expect(build({ ...input, compilerRequest: structuredClone(compilerRequest) })).rejects.toThrow(/provenance/);
    await expect(build({ ...input, compilerReceipt: structuredClone(compilerReceipt) })).rejects.toThrow(/provenance/);
    // Exercise the untyped caller boundary without casting a V1 receipt to V2.
    await expect(Reflect.apply(build, undefined, [{ ...input, compilerReceipt: receiptV1 }]))
      .rejects.toThrow(/provenance/);
    await expect(build({ ...input, observedHeaderContext: structuredClone(input.observedHeaderContext) }))
      .rejects.toThrow(/provenance/);
    const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
      currentHeight: 1_030, anchorContextIndex: 1,
      anchorExtensionRootHex: input.observedHeaderContext.anchorHeader.extensionRootHex,
    });
    await expect(Reflect.apply(build, undefined, [{ ...input, observedHeaderContext: synthetic }]))
      .rejects.toThrow(/provenance/);
    const otherRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      template: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
        source: readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url), 'utf8'),
      },
      profile, application: identity.application, trackerGenesisInputBoxIdHex: '9d'.repeat(32),
    });
    await expect(build({ ...input, compilerRequest: otherRequest })).rejects.toThrow(/binding drifted/);
  });

  const candidateMutations: Array<[string, (candidate: Candidate) => void]> = [
    ['value', box => { box.value = '10000001'; }],
    ['tree', box => { box.ergoTree = identity.propositionHex; }],
    ['asset cardinality', box => { box.assets = []; }],
    ['NFT ID', box => { box.assets[0]!.tokenId = 'ff'.repeat(32); }],
    ['NFT amount', box => { box.assets[0]!.amount = '2'; }],
    ['R4 profile', box => { box.additionalRegisters.R4 = encodeCollByteRegister(Buffer.alloc(32, 1)); }],
    ['R5 digest', box => { box.additionalRegisters.R5 = encodeAvlTreeRegister(Buffer.alloc(33, 1), 1, 370); }],
    ['R5 operations', box => { box.additionalRegisters.R5 = encodeAvlTreeRegister(Buffer.from(tracker_application_v2_empty_digest(), 'hex'), 7, 370); }],
    ['R5 key size', box => {
      const bytes = Buffer.from(box.additionalRegisters.R5!, 'hex');
      // AvlTree type (1), digest (33), flags (1), then the one-byte key length.
      bytes[35] = 33;
      box.additionalRegisters.R5 = bytes.toString('hex');
    }],
    ['R5 value size', box => { box.additionalRegisters.R5 = encodeAvlTreeRegister(Buffer.from(tracker_application_v2_empty_digest(), 'hex'), 1, 369); }],
    ['R6 chain', box => { box.additionalRegisters.R6 = encodeCollByteRegister(Buffer.alloc(32, 1)); }],
    ['R7 source height', box => { box.additionalRegisters.R7 = encodeLongRegister(1n); }],
    ['R8 admission height', box => { box.additionalRegisters.R8 = encodeIntRegister(1); }],
    ['R9 keys', box => { box.additionalRegisters.R9 = encodeCollByteRegister(Buffer.alloc(32, 1)); }],
    ['register cardinality', box => { delete box.additionalRegisters.R9; }],
    ['creation height', box => { box.creationHeight = 1_030; }],
  ];
  it.each(candidateMutations)('rejects independently rematerialized genesis drift: %s', async (_name, mutate) => {
    const candidate = candidateFromBox(trackerInputBox);
    mutate(candidate);
    await expect(build({ ...input, trackerInputBox: boxFromCandidate(candidate) }))
      .rejects.toThrow(/differs from genesis state/);
  });

  it.each(['boxId', 'transactionId', 'index', 'creationHeight', 'value', 'extra'] as const)(
    'rejects raw input field drift and exact-consumer mismatch: %s', async field => {
      const box = structuredClone(trackerInputBox);
      const changed = { ...box, [field]: field === 'index' ? 1
        : field === 'creationHeight' ? -1 : field === 'value' ? '010000000' : 'ff'.repeat(32) };
      await expect(build({ ...input, trackerInputBox: changed })).rejects.toThrow();
      await expect(assertExactSubstrateFederatedTrackerV2InputBox(context, changed)).rejects.toThrow();
    },
  );

  it('rejects a different valid genesis in the exact input consumer', async () => {
    const other = boxFromCandidate({ ...candidateFromBox(trackerInputBox), creationHeight: 1_001 });
    await expect(build({ ...input, trackerInputBox: other })).resolves.toBeDefined();
    await expect(assertExactSubstrateFederatedTrackerV2InputBox(context, other)).rejects.toThrow(/ID differs/);
  });

  it.each(Object.keys(identity.application))('rejects fully encoded application drift: %s', async key => {
    const original = vector.input.statement[key];
    const changed = buildSubstrateFederatedCheckpointStatementV1({
      ...vector.input.statement, profile,
      [key]: typeof original === 'number' ? original + 1 : 'ee'.repeat(original.length / 2),
    });
    await expect(build({
      ...input, encodedStatementHex: changed.encodedStatementHex,
      ...anchorInput(changed.encodedStatementHex),
    })).rejects.toThrow(/compiled application/);
  });

  it('rejects profile, membership key/value/proof, anchor and admission horizon drift', async () => {
    const otherProfile = buildSubstrateFederatedCheckpointProfileV1({ ...vector.input.profile, federationEpoch: '8' });
    const changed = buildSubstrateFederatedCheckpointStatementV1({ ...vector.input.statement, profile: otherProfile });
    await expect(build({ ...input, encodedStatementHex: changed.encodedStatementHex,
      ...anchorInput(changed.encodedStatementHex) })).rejects.toThrow(/profile/);
    await expect(build({ ...input, extensionMembershipProofHex: 'ff' })).rejects.toThrow();
    await expect(build({ ...input, ...anchorInput(statement.encodedStatementHex, '0402') }))
      .rejects.toThrow(/membership/);
    const otherStatement = buildSubstrateFederatedCheckpointStatementV1({
      ...vector.input.statement, profile, bridgeEventRootHex: 'ee'.repeat(32),
    });
    await expect(build({ ...input, ...anchorInput(otherStatement.encodedStatementHex) }))
      .rejects.toThrow(/membership/);
    const headers = input.observedHeaderContext.headers;
    const wrongAnchor = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders: headers.map(header => header.raw), anchorContextIndex: 2,
      expectedAnchorHeaderIdHex: headers[2]!.id,
      expectedAnchorExtensionRootHex: headers[2]!.extensionRootHex,
    });
    await expect(build({ ...input, observedHeaderContext: wrongAnchor })).rejects.toThrow(/membership/);
    await expect(build({ ...input, ...anchorInput(statement.encodedStatementHex, '0401', 1_060) }))
      .rejects.toThrow(/admission horizon/);
    await expect(build({ ...input, ...anchorInput(statement.encodedStatementHex, '0401', 1_011) }))
      .rejects.toThrow(/anchor.*horizon/);
  });

  it('snapshots mutable caller parameters and exact-consumer input before awaiting', async () => {
    const box = structuredClone(trackerInputBox);
    const caller = { ...input, trackerInputBox: box };
    const pending = build(caller);
    box.value = '1';
    box.assets[0]!.amount = '2';
    box.additionalRegisters.R4 = encodeIntRegister(1);
    caller.encodedStatementHex = '00';
    caller.extensionMembershipProofHex = 'ff';
    caller.observedHeaderContext = structuredClone(input.observedHeaderContext);
    caller.compilerRequest = structuredClone(compilerRequest);
    caller.compilerReceipt = structuredClone(compilerReceipt);
    expect(await pending).toEqual(context);
    const exactBox = structuredClone(trackerInputBox);
    const exactPending = assertExactSubstrateFederatedTrackerV2InputBox(context, exactBox);
    exactBox.value = '1';
    await expect(exactPending).resolves.toEqual(trackerInputBox);
  });

  it('replays the retained nonempty AVL history and preserves the public V2 shape', () => {
    expect(() => assertSubstrateFederatedTrackerV2ContinuationContext(
      continuationContext, context,
    )).not.toThrow();
    expect(Object.keys(continuationContext).sort()).toEqual(Object.keys(context).sort());
    expect(continuationContext.trackerTransition.inputDigestHex)
      .toBe(context.trackerTransition.successorDigestHex);
    expect(continuationContext.trackerTransition.inputRegisters)
      .toEqual(context.trackerTransition.successorRegisters);
    expect(continuationContext.trackerTransition.successorRegisters).toEqual({
      ...context.trackerTransition.successorRegisters,
      R5: encodeAvlTreeRegister(
        Buffer.from(continuationContext.trackerTransition.successorDigestHex, 'hex'), 1, 370,
      ),
      R7: encodeLongRegister(1_001n),
      R8: encodeIntRegister(1_040),
    });
    const direct = JSON.parse(tracker_application_v2_insert(JSON.stringify([{
      key: context.trackerTransition.trackerKeyHex,
      value: context.trackerTransition.trackerValueHex,
    }]), continuationContext.trackerTransition.trackerKeyHex,
    continuationContext.trackerTransition.trackerValueHex));
    expect(direct.new_digest_hex).toBe(continuationContext.trackerTransition.successorDigestHex);
    expect(direct.insert_proof_hex).toBe(continuationContext.trackerTransition.avlInsertProofHex);
    expect(JSON.parse(tracker_application_v2_verify_insert(
      context.trackerTransition.successorDigestHex,
      continuationContext.trackerTransition.trackerKeyHex,
      continuationContext.trackerTransition.trackerValueHex,
      continuationContext.trackerTransition.avlInsertProofHex,
    )).new_digest_hex).toBe(continuationContext.trackerTransition.successorDigestHex);
    expectDeepFrozen(continuationContext);
  });

  it('feeds the exact nonempty transition body to the existing external-fee composer', async () => {
    const feePayerPublicKeyHex = profile.ergoAdmissionPublicKeysHex[0]!;
    const feeBox = boxFromCandidate({
      value: '1100000',
      ergoTree: `0008cd${feePayerPublicKeyHex}`,
      assets: [], additionalRegisters: {}, creationHeight: 1_039,
    });
    const composed = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
      trackerContext: continuationContext,
      trackerInputBox: firstSuccessor,
      feeInputBox: feeBox,
      feePayerPublicKeyHex,
    });
    expect(composed.inputBoxes[0]).toEqual(firstSuccessor);
    expect(composed.eip12UnsignedTransaction.inputs[0].extension)
      .toEqual(continuationContext.contextExtension.eip12Values);
    expect(composed.eip12UnsignedTransaction.outputs[0])
      .toEqual(trackerOutputCandidate(continuationContext));
    expect(composed.trackerUnsignedTransactionIdHex)
      .toBe(continuationContext.unsignedTransactionIdHex);
  });

  it('requires a previous context even when every genesis input is valid', async () => {
    const outcome = await buildContinuation({ ...input, previousContext: undefined as never })
      .then(() => 'accepted without a parent', (error: Error) => error.message);
    expect(outcome).toMatch(/continuation previous context is required/);
  });

  it('binds continuation provenance to the exact parent object', async () => {
    const equalButForeignParent = await build(input);
    expect(equalButForeignParent).toEqual(context);
    expect(equalButForeignParent).not.toBe(context);
    expect(() => assertSubstrateFederatedTrackerV2ContinuationContext(
      continuationContext, equalButForeignParent,
    )).toThrow(/parent differs/);
    expect(() => assertSubstrateFederatedTrackerV2ContinuationContext(
      continuationContext, structuredClone(context),
    )).toThrow(/provenance/);
    expect(() => assertSubstrateFederatedTrackerV2ContinuationContext(
      context, context,
    )).toThrow(/parent differs/);
    await expect(buildContinuation({
      ...continuationInput,
      previousContext: structuredClone(context),
    })).rejects.toThrow(/provenance/);
  });

  const predecessorRegisterMutations: Array<[string, (box: Candidate) => void]> = [
    ['R4 profile', box => { box.additionalRegisters.R4 = encodeCollByteRegister(Buffer.alloc(32, 1)); }],
    ['R5 empty history', box => { box.additionalRegisters.R5 = encodeAvlTreeRegister(
      Buffer.from(tracker_application_v2_empty_digest(), 'hex'), 1, 370,
    ); }],
    ['R5 substituted digest', box => { box.additionalRegisters.R5 = encodeAvlTreeRegister(
      Buffer.alloc(33, 1), 1, 370,
    ); }],
    ['R6 chain', box => { box.additionalRegisters.R6 = encodeCollByteRegister(Buffer.alloc(32, 1)); }],
    ['R7 source height', box => { box.additionalRegisters.R7 = encodeLongRegister(0n); }],
    ['R8 admission height', box => { box.additionalRegisters.R8 = encodeIntRegister(0); }],
    ['R9 keys', box => { box.additionalRegisters.R9 = encodeCollByteRegister(Buffer.alloc(32, 1)); }],
  ];
  it.each(predecessorRegisterMutations)(
    'rejects retained predecessor register/history drift: %s', async (_name, mutate) => {
      const candidate = candidateFromBox(firstSuccessor);
      mutate(candidate);
      await expect(buildContinuation({
        ...continuationInput, trackerInputBox: boxFromCandidate(candidate),
      }))
        .rejects.toThrow(/retained predecessor state/);
    },
  );

  const predecessorShapeMutations: Array<[string, (box: Candidate) => void]> = [
    ['value', box => { box.value = '10000001'; }],
    ['tree', box => { box.ergoTree = identity.propositionHex; }],
    ['token id', box => { box.assets[0]!.tokenId = 'ff'.repeat(32); }],
    ['token amount', box => { box.assets[0]!.amount = '2'; }],
    ['creation height', box => { box.creationHeight = 1_039; }],
  ];
  it.each(predecessorShapeMutations)(
    'rejects retained predecessor candidate drift: %s', async (_name, mutate) => {
      const candidate = candidateFromBox(firstSuccessor);
      mutate(candidate);
      await expect(buildContinuation({
        ...continuationInput, trackerInputBox: boxFromCandidate(candidate),
      }))
        .rejects.toThrow(/retained predecessor state/);
    },
  );

  it.each(['1000', '999'])(
    'rejects duplicate or reversed source-native height: %s', async sourceNativeBlockHeight => {
      const changed = buildSubstrateFederatedCheckpointStatementV1({
        ...vector.input.statement,
        sourceNativeBlockHeight,
        sourceNativeBlockHashHex: '23'.repeat(32),
        executionBlockHashHex: '24'.repeat(32),
        bridgeEventRootHex: '25'.repeat(32),
        profile,
      });
      await expect(buildContinuation({
        ...continuationInput,
        encodedStatementHex: changed.encodedStatementHex,
        ...anchorInput(changed.encodedStatementHex, '0401', 1_040),
      })).rejects.toThrow(/heights must strictly increase/);
    },
  );

  it('rejects a non-increasing admission stamp and a stale predecessor box', async () => {
    await expect(buildContinuation({
      ...continuationInput,
      ...anchorInput(secondStatement.encodedStatementHex, '0401', 1_030),
    })).rejects.toThrow(/heights must strictly increase/);
    const later = buildSubstrateFederatedCheckpointStatementV1({
      ...vector.input.statement,
      sourceNativeBlockHeight: '1002',
      sourceNativeBlockHashHex: '43'.repeat(32),
      executionBlockHashHex: '44'.repeat(32),
      bridgeEventRootHex: '45'.repeat(32),
      profile,
    });
    await expect(buildContinuation({
      ...continuationInput,
      previousContext: continuationContext,
      trackerInputBox: firstSuccessor,
      encodedStatementHex: later.encodedStatementHex,
      ...anchorInput(later.encodedStatementHex, '0401', 1_050),
    })).rejects.toThrow(/retained predecessor state/);
  });

  it('rejects a second genuine receipt for the same compiler request', async () => {
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const testNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    let secondReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
    try {
      secondReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(compilerRequest);
    } finally {
      process.env.NODE_OPTIONS = testNodeOptions;
    }
    expect(secondReceipt).toEqual(compilerReceipt);
    expect(secondReceipt).not.toBe(compilerReceipt);
    await expect(buildContinuation({ ...continuationInput, compilerReceipt: secondReceipt }))
      .rejects.toThrow(/compiler lineage differs/);
  }, 30_000);

  it('rejects compiler, observed-header and compiled-application lineage drift', async () => {
    await expect(buildContinuation({
      ...continuationInput,
      compilerRequest: structuredClone(compilerRequest),
    })).rejects.toThrow(/provenance/);
    await expect(buildContinuation({
      ...continuationInput,
      compilerReceipt: structuredClone(compilerReceipt),
    })).rejects.toThrow(/provenance/);
    const equalButForeignRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      trackerGenesisInputBoxIdHex: vector.input.tracker.trackerNftIdHex,
      profile,
      application: identity.application,
      template: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
        source: readFileSync(new URL(
          '../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url,
        ), 'utf8'),
      },
    });
    expect(equalButForeignRequest).toEqual(compilerRequest);
    expect(equalButForeignRequest).not.toBe(compilerRequest);
    await expect(buildContinuation({
      ...continuationInput,
      compilerRequest: equalButForeignRequest,
    })).rejects.toThrow(/compiler lineage differs/);
    await expect(buildContinuation({
      ...continuationInput,
      observedHeaderContext: structuredClone(continuationInput.observedHeaderContext),
    })).rejects.toThrow(/provenance/);
    const changed = buildSubstrateFederatedCheckpointStatementV1({
      ...vector.input.statement,
      sourceNativeBlockHeight: '1001',
      sidechainIdHex: 'ee'.repeat(32),
      profile,
    });
    await expect(buildContinuation({
      ...continuationInput,
      encodedStatementHex: changed.encodedStatementHex,
      ...anchorInput(changed.encodedStatementHex, '0401', 1_040),
    })).rejects.toThrow(/compiled application/);
  });

  it('snapshots continuation parent, mutable ingress and predecessor before awaiting', async () => {
    const third = buildSubstrateFederatedCheckpointStatementV1({
      ...vector.input.statement,
      sourceNativeBlockHeight: '1002',
      sourceNativeBlockHashHex: '33'.repeat(32),
      executionBlockHashHex: '34'.repeat(32),
      bridgeEventRootHex: '35'.repeat(32),
      profile,
    });
    const secondSuccessor = boxFromCandidate(trackerOutputCandidate(continuationContext));
    const caller = {
      compilerRequest, compilerReceipt,
      previousContext: continuationContext,
      trackerInputBox: secondSuccessor,
      encodedStatementHex: third.encodedStatementHex,
      ...anchorInput(third.encodedStatementHex, '0401', 1_050),
    };
    const pending = buildContinuation(caller);
    secondSuccessor.value = '1';
    secondSuccessor.additionalRegisters.R5 = encodeAvlTreeRegister(Buffer.alloc(33, 1), 1, 370);
    caller.previousContext = context;
    caller.encodedStatementHex = '00';
    caller.extensionMembershipProofHex = 'ff';
    caller.observedHeaderContext = structuredClone(caller.observedHeaderContext);
    caller.compilerRequest = structuredClone(compilerRequest);
    caller.compilerReceipt = structuredClone(compilerReceipt);
    const thirdContext = await pending;
    expect(() => assertSubstrateFederatedTrackerV2ContinuationContext(
      thirdContext, continuationContext,
    )).not.toThrow();
    expect(thirdContext.trackerTransition.inputDigestHex)
      .toBe(continuationContext.trackerTransition.successorDigestHex);
  });
});

function anchorInput(encodedHex: string, keyHex = '0401', currentHeight = 1_030) {
  const membership = buildErgoExtensionMembershipProof([
    { key: Buffer.from('0100', 'hex'), value: Buffer.from('bounded-v2-fixture', 'ascii') },
    { key: Buffer.from(keyHex, 'hex'), value: Buffer.from(encodeSubstrateFederatedCheckpointExtensionValueV1(encodedHex), 'hex') },
  ], Buffer.from(keyHex, 'hex'));
  const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight, anchorContextIndex: 1, anchorExtensionRootHex: membership.root.toString('hex'),
  });
  return {
    extensionMembershipProofHex: membership.proof.toString('hex'),
    observedHeaderContext: buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders: synthetic.headers.map(header => header.raw), anchorContextIndex: 1,
      expectedAnchorHeaderIdHex: synthetic.anchorHeader.id,
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    }),
  };
}

function candidateFromBox(box: Eip12Box): Candidate {
  return structuredClone({ value: box.value, ergoTree: box.ergoTree, assets: box.assets,
    additionalRegisters: box.additionalRegisters, creationHeight: box.creationHeight });
}

function trackerOutputCandidate(
  trackerContext: Readonly<SubstrateFederatedTrackerV2Context>,
): Candidate {
  const outputs = (trackerContext.eip12UnsignedTransaction as { readonly outputs?: unknown }).outputs;
  if (!Array.isArray(outputs) || outputs.length !== 1) {
    throw new Error('tracker context must have exactly one output candidate');
  }
  return structuredClone(outputs[0]) as Candidate;
}

function boxFromCandidate(candidate: Candidate): Eip12Box {
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{ boxId: '67'.repeat(32), extension: {} }], dataInputs: [], outputs: [candidate],
  }));
  const id = unsigned.id();
  const candidates = unsigned.output_candidates();
  const output = candidates.get(0);
  let box: any;
  try {
    box = wasm.ErgoBox.from_box_candidate(output, id, 0);
    return box.to_js_eip12() as Eip12Box;
  } finally {
    box?.free?.();
    output.free?.();
    candidates.free?.();
    id.free?.();
    unsigned.free?.();
  }
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}
