import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import blakejs from 'blakejs';
import * as wasm from 'ergo-lib-wasm-nodejs';

// The V3 compiler custody and node reads are explicit component doubles.
// Observation, profile, EIP-12 and WASM serialization remain real.
const boundary = vi.hoisted(() => ({
  compiled: new WeakMap<object, object>(),
  active: true, processDigest: '81'.repeat(32), targetDigest: '82'.repeat(32),
  boxes: new Map<string, unknown>(), binary: new Map<string, string>(),
  network: 'devnet', genesis: '71'.repeat(32), tip: '72'.repeat(32), height: 120,
  anchor: '72'.repeat(32), reads: [] as { origin: string; method: string; height?: number }[],
  onRead: undefined as undefined | (() => void), validations: 0,
}));
vi.mock('./substrate-federated-observed-genesis-v3.js', () => ({
  validateObservedSubstrateFederatedGenesisV3(value: object, target: object) {
    if (boundary.compiled.get(value) !== target) throw new Error('stub V3 compiler provenance');
    if (!boundary.active) throw new Error('stub V3 custody disposed');
    boundary.validations++;
    return { compiled: value, processBinding: {
      processBindingDigestHex: boundary.processDigest,
      executionTargetIdentityDigestHex: boundary.targetDigest,
    } };
  },
}));
vi.mock('./authenticated-spv-tracker-read-only-node-client.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-spv-tracker-read-only-node-client.js')>(),
  createBoundedAuthenticatedSpvTrackerReadOnlySource(origin: string) {
    const read = (method: string, height?: number) => {
      boundary.reads.push({ origin, method, height });
      boundary.onRead?.();
    };
    return {
      async getInfo() { read('info'); return { network: boundary.network, fullHeight: boundary.height }; },
      async getBestHeader() { read('tip'); return { id: boundary.tip, height: boundary.height }; },
      async getBlockHeaderIdsAtHeight(height: number) {
        read('height', height);
        return [height === 1 ? boundary.genesis : boundary.anchor];
      },
      async getBoxByIdOrNull(id: string) { read('box'); return boundary.boxes.get(id) ?? null; },
      async getBoxBinaryByIdOrNull(id: string) { read('binary'); return { bytes: boundary.binary.get(id) }; },
    };
  },
}));

import {
  buildSubstrateFederatedNativeGenesisSetupCheckRequestV3 as build,
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV3 as assertRequest,
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV3RuntimeProvenance as assertRuntime,
  reobserveSubstrateFederatedNativeGenesisSetupCheckRequestV3 as reobserve,
} from './substrate-federated-native-genesis-setup-check-request-v3.js';
import * as observationApi from './substrate-federated-genesis-observation-v1.js';
import { materializeUnsignedTransaction, type Eip12Box } from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 } from './substrate-federated-genesis-issuance-materialization-v1.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_REQUEST_V3';
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const TREE = '0008cd02' + '22'.repeat(32);
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
type Input = Parameters<typeof build>[0];
let input: Input;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  boundary.active = true; boundary.processDigest = '81'.repeat(32); boundary.targetDigest = '82'.repeat(32);
  boundary.network = 'devnet'; boundary.genesis = '71'.repeat(32);
  boundary.tip = boundary.anchor = '72'.repeat(32); boundary.height = 120;
  boundary.onRead = undefined; boundary.reads.length = 0; boundary.validations = 0;
  boundary.boxes.clear(); boundary.binary.clear();
  const base: Eip12Box = {
    boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
    value: '300000000', ergoTree: TREE, assets: [], additionalRegisters: {}, creationHeight: 110,
    transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
  };
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...base, extension: {} }], dataInputs: [],
    outputs: [50, 100, 150].map(value => ({
      value: String(value * 1_000_000), ergoTree: TREE, creationHeight: 110,
    })),
  }, 'native V3 setup funding fixture');
  for (const box of funding.outputs) {
    boundary.boxes.set(box.boxId, box);
    const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
    try { boundary.binary.set(box.boxId, Buffer.from(parsed.sigma_serialize_bytes()).toString('hex')); }
    finally { parsed.free(); }
  }
  const orderedTransactions = [];
  for (const [index, role] of KEYS.entries()) {
    const genesisInput = funding.outputs[index]!;
    orderedTransactions.push({ role, transaction: await materializeSubstrateFederatedSingletonIssuanceV1({
      label: 'native V3 ' + role + ' fixture', genesisInput, expectedNftIdHex: genesisInput.boxId,
      propositionHex: TREE, registers: {}, singletonValue: 25_000_000n, fee: 1_100_000n, creationHeight: 121,
    }) });
  }
  const target = Object.freeze({ primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS,
    primaryMining: true, witnessReadOnly: true });
  const compiled = {
    preparation: { schema: 'e2s.substrate-federated-genesis-preparation.v3', preparationIdHex: '30'.repeat(32) },
    candidate: { schema: 'e2s.substrate-federated-typed-genesis-candidate.v3',
      familyIdHex: '31'.repeat(32), runtimeProfileIdHex: '32'.repeat(32),
      genesisJson: '{}', genesisJsonSha256Hex: '33'.repeat(32) },
    familyCompilerInput: { trackerRequest: { requestDigestHex: '41'.repeat(32) },
      trackerReceipt: { receiptDigestHex: '42'.repeat(32) },
      templates: { pooledReserve: { relativePath: 'contracts/MainChainPooledReserveValidityApplicationV7.es',
        source: 'V7 fixed fixture' } } },
    familyReceipt: { schema: 'e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v3',
      version: 3, profile: { familyIdHex: '31'.repeat(32) },
      familyCompilerRequestDigestHex: '43'.repeat(32), receiptDigestHex: '44'.repeat(32) },
    discovery: {
      reportDigestHex: '51'.repeat(32), sources: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS },
      target: { network: 'devnet', genesisHeaderIdHex: boundary.genesis,
        tipHeaderIdHex: boundary.tip, tipHeight: boundary.height },
      genesisInputs: Object.fromEntries(KEYS.map((key, i) => [key, funding.outputs[i]])),
      genesisBoxIds: Object.fromEntries(KEYS.map((key, i) => [key, funding.outputs[i]!.boxId])),
    },
    history: { receipt: { receiptDigestHex: '52'.repeat(32) } },
    issuance: { creationHeight: 121, orderedTransactions,
      greenfieldReplayBaselineEstablished: false, targetNodeAcceptanceEstablished: false, issuanceEstablished: false },
  };
  boundary.compiled.set(compiled, target);
  input = { compiled, target } as unknown as Input;
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('native FED V3 source-only setup request', () => {
  it('freezes a separate V3/V7 identity with three real WASM unsigned issuances and false authority flags', async () => {
    const request = await build(input);
    expect(() => assertRequest(request, input.target)).not.toThrow();
    await expect(assertRuntime(request)).resolves.toBeUndefined();
    expect(request.schema).toBe('e2s.substrate-federated-native-genesis-setup-check-request.v3');
    expect(request.version).toBe(3);
    expect(request.sourceBindings.compilerProfile).toBe('fed-native-height-zero-v3-reserve-v7');
    expect(request.sourceBindings.independentOperatorsEstablished).toBe(false);
    expect(request.sourceBindings.historicalReplayBaselineEstablished).toBe(false);
    expect(Object.values(request.boundaries).every(value => value === false)).toBe(true);
    expect(request.stages.nodeCheck).toBe('not-performed');
    expect(request.target.maximumObservationAgeMs).toBe(60_000);
    const { requestDigestHex, ...body } = request;
    expect(requestDigestHex).toBe(sha256CanonicalJson(body, DOMAIN));
    expect(request.orderedIssuances.map(item => item.role))
      .toEqual(['tracker', 'duplicate-prevention', 'pooled-reserve']);
    for (const [index, item] of request.orderedIssuances.entries()) {
      const tx = input.compiled.issuance.orderedTransactions[index]!.transaction;
      const bytes = Buffer.from(item.bytesToSignHex, 'hex');
      expect(item.unsignedTransactionIdHex).toBe(tx.txId);
      expect(item.bytesToSignBytes).toBe(bytes.length);
      expect(Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')).toBe(tx.txId);
      expect(item.predictedStateOutput.boxIdHex).toBe(tx.outputs[0]!.boxId);
      expect(canonicalJson(item.unsignedTransactionBody)).toBe(canonicalJson(tx.eip12Tx));
    }
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.orderedIssuances[2])).toBe(true);
  });

  it('rejects copied, foreign, V1-shaped and proxy compiled results before any node read', async () => {
    for (const compiled of [structuredClone(input.compiled), { ...input.compiled },
      { ...input.compiled, candidate: { ...input.compiled.candidate,
        schema: 'e2s.substrate-federated-typed-genesis-candidate.v1' } }]) {
      await expect(build({ ...input, compiled: compiled as Input['compiled'] }))
        .rejects.toThrow('stub V3 compiler provenance');
    }
    await expect(build({ ...input, target: { ...input.target } }))
      .rejects.toThrow('stub V3 compiler provenance');
    expect(boundary.reads).toHaveLength(0);
  });

  it('rejects V2 family and V6 reserve template even with a retained V3 handle', async () => {
    (input.compiled.familyReceipt as any).version = 2;
    await expect(build(input)).rejects.toThrow('requires its V3/V7 compiler profile');
    (input.compiled.familyReceipt as any).version = 3;
    (input.compiled.familyCompilerInput.templates.pooledReserve as any).relativePath =
      'contracts/MainChainPooledReserveValidityApplicationV6.es';
    await expect(build(input)).rejects.toThrow('requires its V3/V7 compiler profile');
    expect(boundary.reads).toHaveLength(0);
  });

  it('rejects a retained V3 candidate whose family ID differs from the compiler receipt', async () => {
    (input.compiled.candidate as any).familyIdHex = '98'.repeat(32);
    await expect(build(input)).rejects.toThrow('requires its V3/V7 compiler profile');
    expect(boundary.reads).toHaveLength(0);
  });

  it.each([
    ['preparation', 'e2s.substrate-federated-genesis-preparation.v1'],
    ['candidate', 'e2s.substrate-federated-typed-genesis-candidate.v1'],
    ['familyReceipt', 'e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v2'],
  ] as const)('rejects a retained V3 %s schema drift before any node read', async (field, schema) => {
    (input.compiled[field] as any).schema = schema;
    await expect(build(input)).rejects.toThrow('requires its V3/V7 compiler profile');
    expect(boundary.reads).toHaveLength(0);
  });

  it.each([
    ['role', 'issuance role or input shape differs'],
    ['txId', 'transaction ID differs from WASM'],
    ['output', 'predicted outputs differ from WASM'],
  ] as const)('rejects isolated third-issuance %s drift before any node read', async (fault, expected) => {
    const third = (input.compiled.issuance.orderedTransactions as any)[2];
    if (fault === 'role') third.role = 'tracker';
    if (fault === 'txId') third.transaction.txId = '97'.repeat(32);
    if (fault === 'output') third.transaction.outputs[0].boxId = '96'.repeat(32);
    await expect(build(input)).rejects.toThrow(expected);
    expect(boundary.reads).toHaveLength(0);
  });

  it('rejects copied V3 request handles and changed retained compiler bytes', async () => {
    const request = await build(input);
    for (const copy of [structuredClone(request), { ...request }, new Proxy(request, {})]) {
      expect(() => assertRequest(copy)).toThrow('process provenance');
      await expect(reobserve(copy)).rejects.toThrow('process provenance');
    }
    expect(() => assertRequest(request, { ...input.target })).toThrow('another target');
    (input.compiled.candidate as any).runtimeProfileIdHex = '99'.repeat(32);
    expect(() => assertRequest(request)).toThrow('compiler or process binding drifted');
  });

  it.each(['preparation', 'familyInput'] as const)(
    'rejects retained %s digest drift without a new node read', async field => {
      const request = await build(input);
      const reads = boundary.reads.length;
      if (field === 'preparation') {
        (input.compiled.preparation as any).preparationIdHex = '95'.repeat(32);
      } else {
        (input.compiled.familyCompilerInput.templates.pooledReserve as any).source = 'V7 changed fixture';
      }
      expect(() => assertRequest(request)).toThrow('compiler or process binding drifted');
      expect(boundary.reads).toHaveLength(reads);
    },
  );

  it('reobserves the original anchor at a higher tip and rejects reorg', async () => {
    const request = await build(input);
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    boundary.height = 121; boundary.tip = '73'.repeat(32);
    const observation = await reobserve(request);
    expect(observation.target.tipHeight).toBe(121);
    expect(request.target.preSetupAnchor).toEqual({ height: 120, headerIdHex: '72'.repeat(32) });
    expect(new Set(boundary.reads.map(read => read.origin))).toEqual(new Set([PRIMARY, WITNESS]));
    boundary.anchor = '99'.repeat(32);
    await expect(reobserve(request)).rejects.toThrow('captured anchor left the best chain');
  });

  it('rejects stale request and changed target custody before new observations', async () => {
    const request = await build(input);
    const reads = boundary.reads.length;
    vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    expect(() => assertRequest(request)).toThrow('freshness window');
    await expect(reobserve(request)).rejects.toThrow('freshness window');
    expect(boundary.reads).toHaveLength(reads);
    vi.setSystemTime(NOW);
    boundary.active = false;
    expect(() => assertRequest(request)).toThrow('stub V3 custody disposed');
  });

  it('rejects a missing current UTXO or altered body from the real observer', async () => {
    const boxId = input.compiled.discovery.genesisBoxIds.tracker;
    boundary.boxes.delete(boxId);
    await expect(build(input)).rejects.toThrow('not present in the current UTXO view');
    boundary.boxes.set(boxId, input.compiled.discovery.genesisInputs.tracker);
    const compiled = input.compiled as any;
    compiled.discovery.genesisInputs.tracker = {
      ...compiled.discovery.genesisInputs.tracker, value: '51000000',
    };
    (input.compiled.issuance.orderedTransactions[0]!.transaction.eip12Tx.inputs[0] as any).value = '51000000';
    await expect(build(input)).rejects.toThrow('tracker observed input body differs from compilation');
  });

  it('rechecks V3 custody after an observation await and after WASM cleanup', async () => {
    boundary.onRead = () => { boundary.active = false; };
    await expect(build(input)).rejects.toThrow('stub V3 custody disposed');
    expect(boundary.reads.length).toBeGreaterThan(0);
    boundary.active = true; boundary.onRead = undefined;
    const request = await build(input);
    const free = wasm.Transaction.prototype.free;
    let calls = 0;
    vi.spyOn(wasm.Transaction.prototype, 'free').mockImplementation(function (this: wasm.Transaction) {
      free.call(this);
      if (++calls === 3) boundary.active = false;
    });
    await expect(assertRuntime(request)).rejects.toThrow('stub V3 custody disposed');
  });

  it('rejects role, extension and output drift without entering observation', async () => {
    for (const fault of ['role', 'extension', 'output'] as const) {
      const compiled = input.compiled as any;
      const transaction = compiled.issuance.orderedTransactions[0].transaction;
      const oldRole = compiled.issuance.orderedTransactions[0].role;
      const oldExtension = transaction.eip12Tx.inputs[0].extension;
      const oldBoxId = transaction.outputs[0].boxId;
      if (fault === 'role') compiled.issuance.orderedTransactions[0].role = 'pooledReserve';
      if (fault === 'extension') transaction.eip12Tx.inputs[0].extension = { 0: '0401' };
      if (fault === 'output') transaction.outputs[0].boxId = '99'.repeat(32);
      await expect(build(input)).rejects.toThrow();
      compiled.issuance.orderedTransactions[0].role = oldRole;
      transaction.eip12Tx.inputs[0].extension = oldExtension;
      transaction.outputs[0].boxId = oldBoxId;
    }
    expect(boundary.reads).toHaveLength(0);
  });
});
