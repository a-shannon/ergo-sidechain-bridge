import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { tracker_application_v2_empty_digest } from '../../wasm-avl/pkg/bridge_avl.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  ERGO_NODE_CHECKER_PROFILE, ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
  LOCAL_WASM_CHECK_SIGNER_PROFILE, LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
} from './ergo-check-profiles.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister } from './ergo-encoding.js';
import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import type { LocalWasmOpaqueCheckResult } from './fleet-signer.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import { buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context } from './substrate-federated-tracker-v2.js';
import { buildSubstrateFederatedTrackerV2ExternalFeeTransaction } from './substrate-federated-tracker-v2-external-fee.js';
import {
  executeSubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1 as execute,
  type SubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1Input as Input,
} from './substrate-federated-isolated-devnet-tracker-v2-check-kernel-v1.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url,
), 'utf8'));
const identity = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json', import.meta.url,
), 'utf8'));
const PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const OTHER_KEY = `03${PUBLIC_KEY.slice(2)}`;
const TREE = `0008cd${PUBLIC_KEY}`;
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const HEIGHT = 1030;
const hex = (byte: string): string => byte.repeat(32);
type Candidate = Pick<Eip12Box, 'value' | 'ergoTree' | 'assets' | 'additionalRegisters' | 'creationHeight'>;
type Fixture = Awaited<ReturnType<typeof buildFixture>>;
type Mutation = readonly [string, (value: any) => void];
let wasm: any;
let base: Fixture;
let manyKeys: Fixture;
let thresholdTwo: Fixture;
let otherTransaction: Fixture['transaction'];
let otherFeeTransaction: Fixture['transaction'];

beforeAll(async () => {
  const module = await import('ergo-lib-wasm-nodejs');
  wasm = module.default ?? module;
  // Genuine, resolver-free compiler/context fixtures, once per profile scope.
  // The public golden profile is not the synthetic single-signer LAB profile.
  base = await buildFixture(1, [PUBLIC_KEY]);
  manyKeys = await buildFixture(1, [PUBLIC_KEY, OTHER_KEY]);
  thresholdTwo = await buildFixture(2, [PUBLIC_KEY, OTHER_KEY]);
  const anotherTracker = boxFromCandidate({ ...candidateFromBox(base.trackerInputBox), creationHeight: 1001 });
  const otherContext = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
    compilerRequest: base.compilerRequest, compilerReceipt: base.compilerReceipt,
    trackerInputBox: anotherTracker, encodedStatementHex: base.statement.encodedStatementHex,
    observedHeaderContext: base.observedHeaderContext,
    extensionMembershipProofHex: base.membership.proof.toString('hex'),
  });
  otherTransaction = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
    trackerContext: otherContext, trackerInputBox: anotherTracker,
    feeInputBox: base.feeInputBox, feePayerPublicKeyHex: PUBLIC_KEY,
  });
  const otherFee = boxFromCandidate({ ...candidateFromBox(base.feeInputBox), ergoTree: `0008cd${OTHER_KEY}` });
  otherFeeTransaction = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
    trackerContext: base.context, trackerInputBox: base.trackerInputBox,
    feeInputBox: otherFee, feePayerPublicKeyHex: OTHER_KEY,
  });
}, 180_000);

async function buildFixture(threshold: number, keys: string[]) {
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    ...vector.input.profile, ergoAdmissionThreshold: threshold, ergoAdmissionPublicKeysHex: keys,
  });
  const statement = buildSubstrateFederatedCheckpointStatementV1({ ...vector.input.statement, profile });
  const compilerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
    trackerGenesisInputBoxIdHex: vector.input.tracker.trackerNftIdHex,
    profile, application: identity.application,
    template: { relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
      source: readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url), 'utf8') },
  });
  if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
    throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
  }
  const options = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  let compilerReceipt;
  try {
    compilerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(compilerRequest);
  } finally { process.env.NODE_OPTIONS = options; }
  const trackerInputBox = boxFromCandidate({
    value: '10000000', ergoTree: compilerReceipt.contract.propositionHex,
    assets: [{ tokenId: compilerRequest.trackerNftIdHex, amount: '1' }], creationHeight: 1000,
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
      R5: encodeAvlTreeRegister(Buffer.from(tracker_application_v2_empty_digest(), 'hex'), 1, 370),
      R6: encodeCollByteRegister(Buffer.from(statement.sidechainIdHex, 'hex')),
      R7: encodeLongRegister(0n), R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')),
    },
  });
  const membership = buildErgoExtensionMembershipProof([
    { key: Buffer.from('0100', 'hex'), value: Buffer.from('tracker-v2-kernel-double', 'ascii') },
    { key: Buffer.from('0401', 'hex'), value: Buffer.from(
      encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex), 'hex') },
  ], Buffer.from('0401', 'hex'));
  const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: HEIGHT, anchorContextIndex: 1, anchorExtensionRootHex: membership.root.toString('hex'),
  });
  const observedHeaderContext = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
    rawHeaders: synthetic.headers.map(header => header.raw), anchorContextIndex: 1,
    expectedAnchorHeaderIdHex: synthetic.anchorHeader.id,
    expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
  });
  const context = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
    compilerRequest, compilerReceipt, trackerInputBox, observedHeaderContext,
    encodedStatementHex: statement.encodedStatementHex,
    extensionMembershipProofHex: membership.proof.toString('hex'),
  });
  const feeInputBox = boxFromCandidate({ value: '1100000', ergoTree: TREE, creationHeight: 1000,
    assets: [], additionalRegisters: {} });
  const transaction = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
    trackerContext: context, trackerInputBox, feeInputBox, feePayerPublicKeyHex: PUBLIC_KEY,
  });
  return { compilerRequest, compilerReceipt, statement, membership, trackerInputBox,
    feeInputBox, observedHeaderContext, context, transaction };
}

function harness(fixture = base) {
  const events: string[] = [];
  const binding = { processBindingDigestHex: hex('81'), executionTargetIdentityDigestHex: hex('82') };
  const signerContext = {
    profile: LOCAL_WASM_CHECK_SIGNER_PROFILE, pubKeyHex: PUBLIC_KEY, ergoTreeHex: TREE,
    networkPrefix: 16, stateContextTipHeight: HEIGHT - 1,
    stateContextTipIdHex: fixture.observedHeaderContext.headers[0]!.id,
  };
  // Signer/checker/observation ports are explicit I/O doubles, not node evidence.
  const signedCandidate = {
    profile: LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
    txId: fixture.transaction.unsignedTransactionIdHex, signedTransactionDigestHex: hex('91'),
    signedTransactionBytesSha256Hex: hex('92'), signedTransactionBytesLength: 4096,
    nodeOrigin: PRIMARY, signerContext: structuredClone(signerContext),
  };
  const checkedResult = {
    txId: signedCandidate.txId, checkResult: { acceptedByDouble: true },
    signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex: signedCandidate.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: signedCandidate.signedTransactionBytesLength,
    signerContext: structuredClone(signerContext),
    checkerIdentity: {
      profile: ERGO_NODE_CHECKER_PROFILE, sourceAdapterProfile: ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
      nodeOrigin: PRIMARY, path: '/transactions/check' as const, method: 'POST' as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
    },
  };
  const batch = {
    derivation: 'wasm-root' as const, pubKeyHex: PUBLIC_KEY, ergoTreeHex: TREE,
    stateContextTipHeight: HEIGHT - 1, stateContextTipIdHex: signerContext.stateContextTipIdHex,
    candidates: [{ role: 'tracker-v2-external-fee', expectedTxId: signedCandidate.txId, signedCandidate }],
  };
  const operations = {
    captureTargetBinding: vi.fn<Input['operations']['captureTargetBinding']>(() => binding),
    observeInputBox: vi.fn<Input['operations']['observeInputBox']>(async (boxId, origin) => {
      events.push(`observe:${origin}:${boxId}`);
      const box = fixture.transaction.inputBoxes.find(candidate => candidate.boxId === boxId);
      if (!box) throw new Error('unexpected input observation');
      return structuredClone(box);
    }),
    prepareCandidate: vi.fn<Input['operations']['prepareCandidate']>(async () => {
      events.push('prepare'); return batch;
    }),
    checkCandidate: vi.fn<Input['operations']['checkCandidate']>(async () => {
      events.push('check'); return checkedResult;
    }),
  };
  const input = {
    compilerRequest: fixture.compilerRequest, context: fixture.context, transaction: fixture.transaction,
    observedHeaderContext: fixture.observedHeaderContext,
    target: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS, primaryMining: false,
      primaryReadOnly: true, witnessReadOnly: true, miningStopped: true, checkpointBound: true } as const,
    expectedSigner: { publicKeyHex: PUBLIC_KEY, p2pkErgoTreeHex: TREE, networkPrefix: 16 }, operations,
  } satisfies Input;
  return { input, events, binding, signedCandidate, checkedResult, batch, operations };
}

describe('fixed frozen protocol-V2 tracker check kernel', () => {
  it('joins genuine V2 bytes with both fresh input pairs and preserves exact opaque objects', async () => {
    const h = harness();
    const result = await execute(h.input);
    const observations = [PRIMARY, WITNESS].flatMap(origin =>
      base.transaction.inputBoxes.map(box => `observe:${origin}:${box.boxId}`));
    expect(h.events).toEqual([...observations, 'prepare', 'check', ...observations]);
    expect(result.context).toBe(base.context);
    expect(result.transaction).toBe(base.transaction);
    expect(result.observedHeaderContext).toBe(base.observedHeaderContext);
    expect(result.signedCandidate).toBe(h.signedCandidate);
    expect(result.checkedResult).toBe(h.checkedResult);
    expect(result.targetBinding).toEqual(h.binding);
    expect(result.targetBinding).not.toBe(h.binding);
    const prepared = h.operations.prepareCandidate.mock.calls[0]![0];
    expect(prepared).toEqual({
      networkPrefix: 16, nodeOrigin: PRIMARY, role: 'tracker-v2-external-fee',
      headers: base.observedHeaderContext.headers.map(header => header.raw),
      eip12Tx: base.transaction.eip12UnsignedTransaction,
      expectedTxId: base.transaction.unsignedTransactionIdHex,
    });
    expect(prepared.expectedTxId).not.toBe(base.context.unsignedTransactionIdHex);
    expect(prepared.eip12Tx.inputs[0]!.extension['2']).toBe(encodeIntRegister(base.context.trackerTransition.anchorHeight));
    expect(prepared.eip12Tx.inputs).toHaveLength(2);
    expect(prepared.eip12Tx.outputs).toHaveLength(2);
    expectFrozen(prepared);
    expectFrozen(result);
    const { checkDigestHex, ...bound } = result;
    expect(checkDigestHex).toBe(sha256CanonicalJson(bound,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_V2_CHECK_KERNEL_V1'));
    expect(Object.keys(result).sort()).toEqual(['context', 'transaction', 'observedHeaderContext',
      'signedCandidate', 'checkedResult', 'targetBinding', 'checkDigestHex'].sort());
  });

  it.each(['context', 'transaction', 'observedHeaderContext', 'compilerRequest'] as const)(
    'rejects copied %s at its genuine producer guard', async field => {
      const h = harness();
      const input = { ...h.input, [field]: Object.freeze({ ...h.input[field] }) };
      await expect(execute(input)).rejects.toThrow(/provenance/);
      expect(h.events).toEqual([]);
    },
  );

  it.each(['context', 'transaction'] as const)('rejects a relabelled V1 %s without I/O', async field => {
    const h = harness();
    await expect(execute({ ...h.input, [field]: { ...h.input[field], version: 1 } }))
      .rejects.toThrow(/provenance/);
    expect(h.events).toEqual([]);
  });

  it('rejects an unrelated genuine compiler request before I/O', async () => {
    const h = harness();
    await expect(execute({ ...h.input, compilerRequest: manyKeys.compilerRequest }))
      .rejects.toThrow(/compiler request differs/);
    expect(h.events).toEqual([]);
  });

  it.each(['manyKeys', 'thresholdTwo'] as const)('rejects genuine non-LAB profile %s', async name => {
    const h = harness(name === 'manyKeys' ? manyKeys : thresholdTwo);
    await expect(execute(h.input)).rejects.toThrow(/sole 1-of-1 admission key/);
    expect(h.events).toEqual([]);
  });

  it('rejects a genuine external transaction constructed for another tracker context', async () => {
    const h = harness();
    await expect(execute({ ...h.input, transaction: otherTransaction })).rejects.toThrow(/differs from the context/);
    expect(h.events).toEqual([]);
  });

  it('rejects a genuine external transaction with a different fee owner', async () => {
    const h = harness();
    await expect(execute({ ...h.input, transaction: otherFeeTransaction })).rejects.toThrow(/fee input box/);
    expect(h.events).toEqual([]);
  });

  it.each([
    ['network', (value: any) => { value.networkPrefix = 0; }],
    ['P2PK tree', (value: any) => { value.p2pkErgoTreeHex = `0008cd${OTHER_KEY}`; }],
    ['compressed key', (value: any) => { value.publicKeyHex = 'ff'; }],
    ['another valid signer', (value: any) => { value.publicKeyHex = OTHER_KEY; value.p2pkErgoTreeHex = `0008cd${OTHER_KEY}`; }],
  ] satisfies Mutation[])('rejects expected signer drift: %s', async (_name, mutate) => {
    const h = harness(); mutate(h.input.expectedSigner);
    await expect(execute(h.input)).rejects.toThrow(/LAB P2PK signer|sole 1-of-1 admission key/);
    expect(h.events).toEqual([]);
  });

  it.each(['anchor', 'window', 'root'] as const)('rejects a different genuine observed %s', async mode => {
    const h = harness();
    let headers = base.observedHeaderContext.headers;
    let index = 1;
    if (mode === 'anchor') index = 0;
    else {
      headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
        currentHeight: mode === 'window' ? HEIGHT + 1 : HEIGHT,
        anchorContextIndex: 1,
        anchorExtensionRootHex: mode === 'root' ? hex('ad') : base.membership.root.toString('hex'),
      }).headers;
    }
    const observed = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders: headers.map(header => header.raw), anchorContextIndex: index,
      expectedAnchorHeaderIdHex: headers[index]!.id,
      expectedAnchorExtensionRootHex: headers[index]!.extensionRootHex,
    });
    await expect(execute({ ...h.input, observedHeaderContext: observed })).rejects.toThrow(/observed headers or absolute anchor/);
    expect(h.events).toEqual([]);
  });

  it.each([
    ['primaryNodeOrigin', WITNESS], ['witnessNodeOrigin', PRIMARY], ['primaryMining', true],
    ['primaryReadOnly', false], ['witnessReadOnly', false], ['miningStopped', false],
    ['checkpointBound', false], ['reservationFreshnessRevalidation', true],
  ])('rejects isolated frozen target field %s', async (field, value) => {
    const h = harness();
    await expect(execute({ ...h.input, target: { ...h.input.target, [String(field)]: value } } as Input))
      .rejects.toThrow(/frozen.*target/);
    expect(h.events).toEqual([]);
  });

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'rejects malformed %s before I/O', async field => {
      const h = harness(); h.binding[field] = 'invalid';
      await expect(execute(h.input)).rejects.toThrow(/canonical 32-byte hex/);
      expect(h.events).toEqual([]);
    },
  );

  it.each(Array.from({ length: 8 }, (_, index) => index))(
    'refuses independently replaced input at observation slot %i', async slot => {
      const h = harness();
      const original = h.operations.observeInputBox.getMockImplementation()!;
      let calls = 0;
      h.operations.observeInputBox.mockImplementation(async (boxId, origin) => {
        const raw = await original(boxId, origin) as Eip12Box;
        return calls++ === slot ? boxFromCandidate({ ...candidateFromBox(raw), creationHeight: 999 }) : raw;
      });
      await expect(execute(h.input)).rejects.toThrow(/live input differs/);
      expect(h.operations.prepareCandidate).toHaveBeenCalledTimes(slot < 4 ? 0 : 1);
      expect(h.operations.checkCandidate).toHaveBeenCalledTimes(slot < 4 ? 0 : 1);
    },
  );

  it.each(Array.from({ length: 8 }, (_, index) => index))(
    'refuses missing input at observation slot %i', async slot => {
      const h = harness();
      const original = h.operations.observeInputBox.getMockImplementation()!;
      let calls = 0;
      h.operations.observeInputBox.mockImplementation(async (boxId, origin) =>
        calls++ === slot ? null : original(boxId, origin));
      await expect(execute(h.input)).rejects.toThrow(/live input/);
      expect(h.operations.prepareCandidate).toHaveBeenCalledTimes(slot < 4 ? 0 : 1);
    },
  );

  const batchMutations: Mutation[] = [
    ['derivation', value => { value.derivation = 'other'; }],
    ['public key', value => { value.pubKeyHex = OTHER_KEY; }],
    ['tree', value => { value.ergoTreeHex = `0008cd${OTHER_KEY}`; }],
    ['tip height', value => { value.stateContextTipHeight--; }],
    ['tip ID', value => { value.stateContextTipIdHex = hex('a1'); }],
    ['zero candidates', value => { value.candidates = []; }],
    ['two candidates', value => { value.candidates.push(value.candidates[0]); }],
    ['candidate role', value => { value.candidates[0].role = 'observed-anchor-tracker'; }],
    ['tracker-only ID', value => { value.candidates[0].expectedTxId = base.context.unsignedTransactionIdHex; }],
  ];
  it.each(batchMutations)('rejects isolated batch metadata: %s', async (_name, mutate) => {
    const h = harness(); mutate(h.batch);
    await expect(execute(h.input)).rejects.toThrow(/signer batch binding|prepared role or transaction ID/);
    expect(h.operations.checkCandidate).not.toHaveBeenCalled();
  });

  const signerContextMutations: Mutation[] = [
    ['profile', value => { value.profile = 'other'; }],
    ['public key', value => { value.pubKeyHex = OTHER_KEY; }],
    ['tree', value => { value.ergoTreeHex = `0008cd${OTHER_KEY}`; }],
    ['network', value => { value.networkPrefix = 0; }],
    ['tip height', value => { value.stateContextTipHeight--; }],
    ['tip ID', value => { value.stateContextTipIdHex = hex('a2'); }],
    ['extra field', value => { value.extra = true; }],
  ];
  it.each(signerContextMutations)('rejects isolated signed signer metadata: %s', async (_name, mutate) => {
    const h = harness(); mutate(h.signedCandidate.signerContext);
    await expect(execute(h.input)).rejects.toThrow(/signed candidate metadata/);
    expect(h.operations.checkCandidate).not.toHaveBeenCalled();
  });
  it.each(signerContextMutations)('rejects isolated checked signer metadata: %s', async (_name, mutate) => {
    const h = harness(); mutate(h.checkedResult.signerContext);
    await expect(execute(h.input)).rejects.toThrow(/signer and checker metadata disagree/);
    expect(h.operations.observeInputBox).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['profile', (value: any) => { value.profile = 'other'; }],
    ['transaction ID', (value: any) => { value.txId = base.context.unsignedTransactionIdHex; }],
    ['origin', (value: any) => { value.nodeOrigin = WITNESS; }],
    ['JSON digest', (value: any) => { value.signedTransactionDigestHex = 'ff'; }],
    ['bytes digest', (value: any) => { value.signedTransactionBytesSha256Hex = 'ff'; }],
    ['zero bytes', (value: any) => { value.signedTransactionBytesLength = 0; }],
    ['fractional bytes', (value: any) => { value.signedTransactionBytesLength = 1.5; }],
    ['oversized bytes', (value: any) => { value.signedTransactionBytesLength = 262145; }],
  ] satisfies Mutation[])('rejects isolated signed candidate metadata: %s', async (_name, mutate) => {
    const h = harness(); mutate(h.signedCandidate);
    await expect(execute(h.input)).rejects.toThrow(/signed candidate metadata|canonical 32-byte hex|ingress bound/);
    expect(h.operations.checkCandidate).not.toHaveBeenCalled();
  });

  it.each([
    ['txId', hex('b1')], ['signedTransactionDigestHex', hex('b2')],
    ['signedTransactionBytesSha256Hex', hex('b3')], ['signedTransactionBytesLength', 4097],
  ] as const)('rejects isolated check result field %s', async (field, value) => {
    const h = harness(); Object.assign(h.checkedResult, { [field]: value });
    await expect(execute(h.input)).rejects.toThrow(/signer and checker metadata disagree/);
    expect(h.operations.observeInputBox).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['profile', 'other'], ['sourceAdapterProfile', 'other'], ['nodeOrigin', WITNESS],
    ['path', '/transactions'], ['method', 'GET'], ['transportPolicy', 'allow-proxy'], ['extra', true],
  ])('rejects isolated checker identity %s', async (field, value) => {
    const h = harness(); Object.assign(h.checkedResult.checkerIdentity, { [String(field)]: value });
    await expect(execute(h.input)).rejects.toThrow(/signer and checker metadata disagree/);
  });

  it.each(['null', 'throw'] as const)('does not turn a %s check into a result', async mode => {
    const h = harness();
    h.operations.checkCandidate.mockImplementation(async () => {
      if (mode === 'throw') throw new Error('synthetic check failure');
      return null;
    });
    await expect(execute(h.input)).rejects.toThrow(/JVM node check rejected|synthetic check failure/);
    expect(h.operations.observeInputBox).toHaveBeenCalledTimes(4);
  });

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'detects mutation of the same returned binding object: %s', async field => {
      const h = harness();
      h.operations.checkCandidate.mockImplementation(async () => {
        h.binding[field] = hex('c1'); return h.checkedResult;
      });
      await expect(execute(h.input)).rejects.toThrow(/target binding changed/);
    },
  );

  it('checks target binding before signing when it changes during input observation', async () => {
    const h = harness();
    h.operations.observeInputBox.mockImplementationOnce(async () => {
      h.binding.processBindingDigestHex = hex('c2'); return base.trackerInputBox;
    });
    await expect(execute(h.input)).rejects.toThrow(/target binding changed/);
    expect(h.operations.prepareCandidate).not.toHaveBeenCalled();
  });

  it('checks target shape again after asynchronous preparation', async () => {
    const h = harness();
    h.operations.prepareCandidate.mockImplementation(async () => {
      Object.assign(h.input.target, { primaryMining: true }); return h.batch;
    });
    await expect(execute(h.input)).rejects.toThrow(/exact frozen checkpoint target/);
    expect(h.operations.checkCandidate).not.toHaveBeenCalled();
  });

  it('captures caller fields and functions before its first await', async () => {
    const h = harness();
    const pending = execute(h.input);
    h.input.context = manyKeys.context;
    h.input.transaction = otherTransaction;
    h.input.compilerRequest = manyKeys.compilerRequest;
    h.input.expectedSigner.publicKeyHex = OTHER_KEY;
    h.input.expectedSigner.p2pkErgoTreeHex = `0008cd${OTHER_KEY}`;
    h.input.operations.prepareCandidate = vi.fn(async () => { throw new Error('replaced operation'); });
    h.input.operations.observeInputBox = vi.fn(async () => { throw new Error('replaced operation'); });
    const result = await pending;
    expect(result.context).toBe(base.context);
    expect(result.transaction).toBe(base.transaction);
    expect(result.signedCandidate.signerContext.pubKeyHex).toBe(PUBLIC_KEY);
  });

  it('freezes nested metadata even when an I/O double has frozen only its outer object', async () => {
    const h = harness();
    Object.freeze(h.signedCandidate);
    Object.freeze(h.checkedResult);
    const result = await execute(h.input);
    expectFrozen(result);
  });

  it('binds opaque check response bytes into a separate digest', async () => {
    const a = harness();
    const first = await execute(a.input);
    const b = harness();
    b.checkedResult.checkResult = { acceptedByDouble: false };
    const second = await execute(b.input);
    expect(first.checkDigestHex).not.toBe(second.checkDigestHex);
  });
});

function boxFromCandidate(candidate: Candidate): Eip12Box {
  let unsigned: any;
  let id: any;
  let outputs: any;
  let output: any;
  let box: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
      inputs: [{ boxId: hex('67'), extension: {} }], dataInputs: [], outputs: [candidate],
    }));
    id = unsigned.id(); outputs = unsigned.output_candidates(); output = outputs.get(0);
    box = wasm.ErgoBox.from_box_candidate(output, id, 0);
    return box.to_js_eip12() as Eip12Box;
  } finally { box?.free?.(); output?.free?.(); outputs?.free?.(); id?.free?.(); unsigned?.free?.(); }
}

function candidateFromBox(box: Eip12Box): Candidate {
  return structuredClone({ value: box.value, ergoTree: box.ergoTree, assets: box.assets,
    additionalRegisters: box.additionalRegisters, creationHeight: box.creationHeight });
}

function expectFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectFrozen(child);
  }
}
