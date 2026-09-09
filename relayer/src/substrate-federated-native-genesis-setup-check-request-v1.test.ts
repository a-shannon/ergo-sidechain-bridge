import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import blakejs from 'blakejs';

// Compiler/custody and node reads are explicit component stubs. The observer,
// profile registry, EIP-12 codecs and WASM transaction/box serialization are real.
const boundary = vi.hoisted(() => ({
  compiled: new WeakMap<object, object>(), targets: new WeakSet<object>(),
  setupActive: true, sourceActive: true, targetActive: true,
  processDigest: '81'.repeat(32),
  boxes: new Map<string, unknown>(), binary: new Map<string, string>(),
  network: 'devnet', genesis: '71'.repeat(32), tip: '72'.repeat(32), height: 120,
  anchor: '72'.repeat(32), anchorHeight: 120,
  reads: [] as { origin: string; method: string; height?: number }[],
  onRead: undefined as undefined | (() => void),
  onCompiledAssert: undefined as undefined | (() => void),
}));
vi.mock('./substrate-federated-observed-genesis-v1.js', () => ({
  assertObservedSubstrateFederatedGenesisV1(value: object, target: object) {
    if (boundary.compiled.get(value) !== target) throw new Error('stub compiler provenance');
    if (!boundary.setupActive) throw new Error('stub setup disposed');
    if (!boundary.sourceActive) throw new Error('stub source disposed');
    if (!boundary.targetActive) throw new Error('stub target disposed');
    boundary.onCompiledAssert?.();
  },
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target: object) {
    if (!boundary.targets.has(target) || !boundary.targetActive) throw new Error('stub target not owned');
    return { processBindingDigestHex: boundary.processDigest, executionTargetIdentityDigestHex: '82'.repeat(32) };
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
  buildSubstrateFederatedNativeGenesisSetupCheckRequestV1 as build,
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1 as assertRequest,
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1RuntimeProvenance as assertRuntime,
  reobserveSubstrateFederatedNativeGenesisSetupCheckRequestV1 as reobserve,
} from './substrate-federated-native-genesis-setup-check-request-v1.js';
import * as observationApi from './substrate-federated-genesis-observation-v1.js';
import { materializeUnsignedTransaction, type Eip12Box } from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 } from './substrate-federated-genesis-issuance-materialization-v1.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_REQUEST_V1';
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const TREE = `0008cd02${'22'.repeat(32)}`;
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
type Input = Parameters<typeof build>[0];
let input: Input;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  boundary.setupActive = boundary.sourceActive = boundary.targetActive = true;
  boundary.processDigest = '81'.repeat(32);
  boundary.network = 'devnet'; boundary.genesis = '71'.repeat(32);
  boundary.tip = boundary.anchor = '72'.repeat(32); boundary.height = boundary.anchorHeight = 120;
  boundary.onRead = undefined; boundary.reads.length = 0;
  boundary.onCompiledAssert = undefined;
  boundary.boxes.clear(); boundary.binary.clear();
  const base: Eip12Box = {
    boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
    value: '300000000', ergoTree: TREE, assets: [], additionalRegisters: {}, creationHeight: 110,
    transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
  };
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...base, extension: {} }], dataInputs: [],
    outputs: [50, 100, 150].map(value => ({ value: String(value * 1_000_000), ergoTree: TREE, creationHeight: 110 })),
  }, 'native setup funding fixture');
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
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
      label: `native ${role} fixture`, genesisInput, expectedNftIdHex: genesisInput.boxId,
      propositionHex: TREE, registers: {}, singletonValue: 25_000_000n, fee: 1_100_000n, creationHeight: 121,
    }) });
  }
  const target = Object.freeze({ primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS,
    primaryMining: true, witnessReadOnly: true });
  const compiled = {
    candidate: { familyIdHex: '31'.repeat(32), runtimeProfileIdHex: '32'.repeat(32),
      genesisJson: '{}', genesisJsonSha256Hex: '33'.repeat(32), sourceRuntimeCodeSha256Hex: '34'.repeat(32) },
    familyCompilerInput: { trackerRequest: { requestDigestHex: '41'.repeat(32) },
      trackerReceipt: { receiptDigestHex: '42'.repeat(32) } },
    familyReceipt: { familyCompilerRequestDigestHex: '43'.repeat(32), receiptDigestHex: '44'.repeat(32) },
    discovery: {
      reportDigestHex: '51'.repeat(32), sources: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS },
      target: { network: 'devnet', genesisHeaderIdHex: boundary.genesis, tipHeaderIdHex: boundary.tip, tipHeight: boundary.height },
      genesisInputs: Object.fromEntries(KEYS.map((key, i) => [key, funding.outputs[i]])),
      genesisBoxIds: Object.fromEntries(KEYS.map((key, i) => [key, funding.outputs[i]!.boxId])),
    },
    history: { receipt: { receiptDigestHex: '52'.repeat(32) } },
    issuance: { creationHeight: 121, orderedTransactions,
      greenfieldReplayBaselineEstablished: false, targetNodeAcceptanceEstablished: false, issuanceEstablished: false },
  };
  boundary.compiled.set(compiled, target); boundary.targets.add(target);
  input = { compiled, target } as unknown as Input;
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('native FED setup request with stubbed compiler custody and node reads', () => {
  it('freezes real WASM bytes under a distinct native identity with every authority flag false', async () => {
    const request = await build(input);
    expect(assertRequest(request, input.target)).toBeUndefined();
    await expect(assertRuntime(request)).resolves.toBeUndefined();
    expect(request.schema).toBe('e2s.substrate-federated-native-genesis-setup-check-request.v1');
    const { requestDigestHex, ...body } = request;
    expect(requestDigestHex).toBe(sha256CanonicalJson(body, DOMAIN));
    expect(request.orderedIssuances.map(item => item.role)).toEqual(['tracker', 'duplicate-prevention', 'pooled-reserve']);
    expect(request.sourceBindings).not.toHaveProperty('provisioningPlanDigestHex');
    expect(request.sourceBindings.historicalReplayBaselineEstablished).toBe(false);
    expect(request.sourceBindings.independentOperatorsEstablished).toBe(false);
    expect(Object.values(request.boundaries).every(value => value === false)).toBe(true);
    expect(request.target.maximumObservationAgeMs).toBe(60_000);
    expect(request.target.observedAt).toBe(NOW.toISOString());
    expect(request.checkPolicy.nodeCheck.path).toBe('/transactions/check');
    expect(request.checkPolicy.stateContext.path).toBe('/blocks/lastHeaders/10');
    const checkFrozen = (value: unknown) => {
      if (value !== null && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) checkFrozen(child);
      }
    };
    checkFrozen(request);
    for (const [index, item] of request.orderedIssuances.entries()) {
      const tx = input.compiled.issuance.orderedTransactions[index]!.transaction;
      expect(item.unsignedTransactionIdHex).toBe(tx.txId);
      expect(item.bytesToSignBlake2b256Hex).toBe(tx.txId);
      const bytes = Buffer.from(item.bytesToSignHex, 'hex');
      expect(item.bytesToSignBytes).toBe(bytes.length);
      expect(Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')).toBe(tx.txId);
      expect(item.predictedStateOutput.boxIdHex).toBe(tx.outputs[0]!.boxId);
      expect(canonicalJson(item.unsignedTransactionBody)).toBe(canonicalJson(tx.eip12Tx));
    }
  });

  it('returns a genuine new observation and preserves the original anchor at a higher tip', async () => {
    const spy = vi.spyOn(observationApi, 'observeSubstrateFederatedGenesisV1');
    const request = await build(input);
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    boundary.height = 121; boundary.tip = '73'.repeat(32);
    const observation = await reobserve(request);
    expect(observation).toBe(await spy.mock.results[1]!.value);
    observationApi.assertSubstrateFederatedGenesisObservationV1Provenance(spy.mock.calls[1]![0], observation);
    expect(() => observationApi.assertSubstrateFederatedGenesisObservationV1Provenance(
      spy.mock.calls[1]![0], structuredClone(observation))).toThrow('same-process provenance');
    expect(observation.observedAt).toBe(new Date(NOW.getTime() + 1000).toISOString());
    expect(request.target.preSetupAnchor).toEqual({ height: 120, headerIdHex: '72'.repeat(32) });
    expect(observation.boundary.independentNodeControlVerified).toBe(false);
    expect(new Set(boundary.reads.map(read => read.origin))).toEqual(new Set([PRIMARY, WITNESS]));
    expect(boundary.reads.filter(read => read.method === 'height' && read.height === 120)
      .map(read => read.origin)).toEqual([PRIMARY, WITNESS, PRIMARY, WITNESS]);
  });

  it('rejects cloned compiler results before observation', async () => {
    await expect(build({ ...input, compiled: structuredClone(input.compiled) })).rejects.toThrow('stub compiler provenance');
    expect(boundary.reads).toHaveLength(0);
  });
  it('rejects a compiler result paired with a foreign target before observation', async () => {
    await expect(build({ ...input, target: { ...input.target } })).rejects.toThrow('stub compiler provenance');
    expect(boundary.reads).toHaveLength(0);
  });
  it('rejects cloned, foreign and proxy request handles synchronously', async () => {
    const request = await build(input);
    for (const value of [structuredClone(request), { ...request }, {}, null, new Proxy(request, {})]) {
      expect(() => assertRequest(value)).toThrow('process provenance');
    }
    expect(() => assertRequest(request, { ...input.target })).toThrow('another target');
  });
  it.each(['setupActive', 'sourceActive', 'targetActive'] as const)('rejects disposed %s before and after observation awaits', async key => {
    const request = await build(input);
    boundary[key] = false;
    expect(() => assertRequest(request)).toThrow(/disposed/);
    boundary[key] = true;
    boundary.onRead = () => { boundary[key] = false; };
    await expect(reobserve(request)).rejects.toThrow(/disposed/);
  });
  it('reasserts custody after the build serialization await', async () => {
    const pending = build(input);
    boundary.setupActive = false;
    await expect(pending).rejects.toThrow('stub setup disposed');
    expect(boundary.reads).toHaveLength(0);
  });
  it('reasserts custody after the initial observation await', async () => {
    boundary.onRead = () => { boundary.sourceActive = false; };
    await expect(build(input)).rejects.toThrow('stub source disposed');
  });
  it.each([PRIMARY, WITNESS])('reasserts custody after the captured anchor read on %s', async origin => {
    boundary.onRead = () => {
      const read = boundary.reads.at(-1)!;
      if (read.origin === origin && read.method === 'height' && read.height === 120) {
        boundary.targetActive = false;
      }
    };
    await expect(build(input)).rejects.toThrow('stub target disposed');
  });
  it('reasserts custody after the runtime serialization await', async () => {
    const request = await build(input);
    const pending = assertRuntime(request);
    boundary.sourceActive = false;
    await expect(pending).rejects.toThrow('stub source disposed');
  });
  it('reasserts freshness after the runtime serialization await', async () => {
    const request = await build(input);
    const pending = assertRuntime(request);
    vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    await expect(pending).rejects.toThrow('freshness window');
  });
  it('rejects a changed owned process binding', async () => {
    const request = await build(input);
    boundary.processDigest = '83'.repeat(32);
    expect(() => assertRequest(request)).toThrow('compiler or process binding drifted');
  });
  it('rejects compiler data drift without relying on request mutation', async () => {
    const request = await build(input);
    (input.compiled.candidate as any).runtimeProfileIdHex = '99'.repeat(32);
    expect(() => assertRequest(request)).toThrow('compiler or process binding drifted');
  });
  it('keeps the inclusive 60-second limit and never renews an expired handle', async () => {
    const request = await build(input);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(() => assertRequest(request)).not.toThrow();
    vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    expect(() => assertRequest(request)).toThrow('freshness window');
    const reads = boundary.reads.length;
    await expect(reobserve(request)).rejects.toThrow('freshness window');
    expect(boundary.reads).toHaveLength(reads);
  });
  it('rejects when source validation itself crosses the fixed freshness deadline', async () => {
    const request = await build(input);
    vi.setSystemTime(new Date(NOW.getTime() + 59_999));
    boundary.onCompiledAssert = () => vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    const reads = boundary.reads.length;
    expect(() => assertRequest(request)).toThrow('freshness window');
    expect(boundary.reads).toHaveLength(reads);
  });
  it('rejects clock regression', async () => {
    const request = await build(input);
    vi.setSystemTime(new Date(NOW.getTime() - 1));
    expect(() => assertRequest(request)).toThrow('freshness window');
  });
  it('rejects expiry during a reobservation await', async () => {
    const request = await build(input);
    boundary.onRead = () => vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    await expect(reobserve(request)).rejects.toThrow('freshness window');
  });
  it('rejects a broader origin even when compiler and target stubs accept the handle', async () => {
    const target = { ...input.target, primaryNodeOrigin: 'http://127.0.0.1:9999' };
    boundary.targets.add(target); boundary.compiled.set(input.compiled, target);
    await expect(build({ ...input, target: target as Input['target'] })).rejects.toThrow('exact fixed managed devnet origins');
    expect(boundary.reads).toHaveLength(0);
  });
  it.each(['greenfieldReplayBaselineEstablished', 'targetNodeAcceptanceEstablished', 'issuanceEstablished'] as const)(
    'rejects a compiled %s authority claim', async key => {
      (input.compiled.issuance as any)[key] = true;
      await expect(build(input)).rejects.toThrow('remain non-authorizing');
    });
  it('rejects a missing current UTXO through the real observer', async () => {
    boundary.boxes.delete(input.compiled.discovery.genesisBoxIds.tracker);
    await expect(build(input)).rejects.toThrow('not present in the current UTXO view');
  });
  it('rejects body inequality against a genuine observation with the same requested box ID', async () => {
    // The compiler stub deliberately retains an inconsistent body. The real
    // observer still returns the original canonical box, isolating this join.
    const compiled = input.compiled as any;
    compiled.discovery.genesisInputs.tracker = {
      ...compiled.discovery.genesisInputs.tracker, value: '51000000',
    };
    compiled.issuance.orderedTransactions[0].transaction.eip12Tx.inputs[0].value = '51000000';
    await expect(build(input)).rejects.toThrow('tracker observed input body differs from compilation');
  });
  it('captures the original input handles before awaiting and ignores caller authority callbacks', async () => {
    const callback = vi.fn(() => { throw new Error('caller callback must not run'); });
    const supplied = { ...input, reobserve: callback };
    const target = input.target;
    const pending = build(supplied);
    supplied.compiled = {} as Input['compiled'];
    supplied.target = {} as Input['target'];
    const request = await pending;
    expect(() => assertRequest(request, target)).not.toThrow();
    await reobserve(request);
    expect(callback).not.toHaveBeenCalled();
  });
  it('rejects a wrong genesis through the real observer', async () => {
    boundary.genesis = '99'.repeat(32);
    await expect(build(input)).rejects.toThrow('observed genesis header does not match');
  });
  it('rejects a regressed tip without relying on freshness or missing inputs', async () => {
    boundary.height = 119;
    await expect(build(input)).rejects.toThrow('regressed or changed the captured anchor');
  });
  it('rejects a changed same-height anchor', async () => {
    boundary.tip = '99'.repeat(32);
    await expect(build(input)).rejects.toThrow('regressed or changed the captured anchor');
  });
  it('rejects a replaced captured anchor despite a higher stable tip', async () => {
    boundary.height = 121; boundary.tip = '73'.repeat(32); boundary.anchor = '99'.repeat(32);
    await expect(build(input)).rejects.toThrow('captured anchor left the best chain');
  });
  it('rejects a copied observer result at the genuine provenance boundary', async () => {
    const original = observationApi.observeSubstrateFederatedGenesisV1;
    vi.spyOn(observationApi, 'observeSubstrateFederatedGenesisV1').mockImplementation(async profile =>
      structuredClone(await original(profile)));
    await expect(build(input)).rejects.toThrow('same-process provenance');
  });
  it.each([
    ['role', (compiled: any) => { compiled.issuance.orderedTransactions[0].role = 'pooledReserve'; }, 'role or input shape'],
    ['transaction ID', (compiled: any) => { compiled.issuance.orderedTransactions[0].transaction.txId = '99'.repeat(32); }, 'transaction ID differs from WASM'],
    ['predicted output', (compiled: any) => { compiled.issuance.orderedTransactions[0].transaction.outputs[0].boxId = '99'.repeat(32); }, 'predicted outputs differ from WASM'],
    ['input body', (compiled: any) => { compiled.issuance.orderedTransactions[0].transaction.eip12Tx.inputs[0].value = '1'; }, 'issuance input differs'],
    ['extension', (compiled: any) => { compiled.issuance.orderedTransactions[0].transaction.eip12Tx.inputs[0].extension = { 0: '0401' }; }, 'role or input shape'],
  ] as const)('rejects isolated %s drift before observation', async (_label, mutate, message) => {
    mutate(input.compiled);
    await expect(build(input)).rejects.toThrow(message);
    expect(boundary.reads).toHaveLength(0);
  });
});
