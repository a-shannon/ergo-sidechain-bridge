import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as wasm from 'ergo-lib-wasm-nodejs';

// Only compiler/target custody and bounded node reads are component doubles.
// The native request registry, reobserver, profile/box codecs and unsigned-ID
// derivation remain real. The sentinel ends the join before signer preparation.
const boundary = vi.hoisted(() => ({
  compiled: new WeakMap<object, object>(),
  setupActive: true, sourceActive: true, targetActive: true,
  processDigest: '81'.repeat(32), targetDigest: '82'.repeat(32),
  boxes: new Map<string, unknown>(), binary: new Map<string, string>(),
  genesis: '71'.repeat(32), tip: '', height: 120,
  reads: [] as string[],
}));
vi.mock('./substrate-federated-observed-genesis-v1.js', () => ({
  validateObservedSubstrateFederatedGenesisV1(value: object, target: object) {
    if (boundary.compiled.get(value) !== target) throw new Error('fixture compiler provenance');
    if (!boundary.setupActive) throw new Error('fixture setup disposed');
    if (!boundary.sourceActive) throw new Error('fixture source disposed');
    if (!boundary.targetActive) throw new Error('fixture target disposed');
    return { compiled: value, processBinding: {
      processBindingDigestHex: boundary.processDigest,
      executionTargetIdentityDigestHex: boundary.targetDigest,
    } };
  },
}));
vi.mock('./authenticated-spv-tracker-read-only-node-client.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-spv-tracker-read-only-node-client.js')>(),
  createBoundedAuthenticatedSpvTrackerReadOnlySource(origin: string) {
    const read = (operation: string) => { boundary.reads.push(`${origin}:${operation}`); };
    return {
      async getInfo() { read('info'); return { network: 'devnet', fullHeight: boundary.height }; },
      async getBestHeader() { read('tip'); return { id: boundary.tip, height: boundary.height }; },
      async getBlockHeaderIdsAtHeight(height: number) {
        read('height'); return [height === 1 ? boundary.genesis : boundary.tip];
      },
      async getBoxByIdOrNull(id: string) { read('box'); return boundary.boxes.get(id) ?? null; },
      async getBoxBinaryByIdOrNull(id: string) { read('binary'); return { bytes: boundary.binary.get(id) }; },
    };
  },
}));

import { buildSubstrateFederatedNativeGenesisSetupCheckRequestV1 as build }
  from './substrate-federated-native-genesis-setup-check-request-v1.js';
import { runSubstrateFederatedNativeGenesisSetupCheckV1 as run }
  from './substrate-federated-isolated-devnet-setup-check-v2.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 }
  from './bridge-validity-tracker-header-context-v1.js';
import { materializeUnsignedTransaction, type Eip12Box } from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 }
  from './substrate-federated-genesis-issuance-materialization-v1.js';
import * as helpers from './ergo-helpers.js';
import * as fleet from './fleet-signer.js';
import * as unsigned from './ergo-unsigned-transaction.js';
import { projectOwnNativeGenesisSetupFailureStageV1 as ownStage, type NativeGenesisSetupFailureStageV1 }
  from './substrate-federated-native-genesis-setup-stage-v1.js';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const TREE = `0008cd02${'22'.repeat(32)}`;
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
const SIGNER_BOUNDARY = new Error('native setup join reached signer preparation sentinel');
// Nonempty text reaches the sentinel; it is never parsed as signer material.
const SENTINEL_INPUT = 'fixture sentinel input';
type Input = Parameters<typeof build>[0];
let input: Input;
let headers: Record<string, unknown>[];
let funding: readonly Eip12Box[];
let prepare: MockInstance<typeof fleet.prepareLocalWasmRootCheckCandidates>;
let derive: MockInstance<typeof unsigned.deriveUnsignedTransactionId>;
let checker: MockInstance<typeof fleet.checkSignedTransaction>;
let nodeCheck: MockInstance<typeof helpers.ncheck>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  boundary.setupActive = boundary.sourceActive = boundary.targetActive = true;
  boundary.processDigest = '81'.repeat(32); boundary.targetDigest = '82'.repeat(32);
  boundary.height = 120; boundary.boxes.clear(); boundary.binary.clear(); boundary.reads.length = 0;
  headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: 121, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => ({ ...header.raw }));
  boundary.tip = String(headers[0]!.id);
  const base: Eip12Box = {
    boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
    value: '300000000', ergoTree: TREE, assets: [], additionalRegisters: {}, creationHeight: 110,
    transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
  };
  funding = (await materializeUnsignedTransaction({
    inputs: [{ ...base, extension: {} }], dataInputs: [],
    outputs: [50, 100, 150].map(value => ({
      value: String(value * 1_000_000), ergoTree: TREE, creationHeight: 110,
    })),
  }, 'native setup join funding fixture')).outputs;
  for (const box of funding) {
    boundary.boxes.set(box.boxId, box);
    const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
    try { boundary.binary.set(box.boxId, Buffer.from(parsed.sigma_serialize_bytes()).toString('hex')); }
    finally { parsed.free(); }
  }
  const orderedTransactions = [];
  for (const [index, role] of KEYS.entries()) {
    const genesisInput = funding[index]!;
    orderedTransactions.push({ role, transaction: await materializeSubstrateFederatedSingletonIssuanceV1({
      label: `native ${role} join fixture`, genesisInput, expectedNftIdHex: genesisInput.boxId,
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
      target: { network: 'devnet', genesisHeaderIdHex: boundary.genesis,
        tipHeaderIdHex: boundary.tip, tipHeight: boundary.height },
      genesisInputs: Object.fromEntries(KEYS.map((key, index) => [key, funding[index]])),
      genesisBoxIds: Object.fromEntries(KEYS.map((key, index) => [key, funding[index]!.boxId])),
    },
    history: { receipt: { receiptDigestHex: '52'.repeat(32) } },
    issuance: { creationHeight: 121, orderedTransactions,
      greenfieldReplayBaselineEstablished: false, targetNodeAcceptanceEstablished: false, issuanceEstablished: false },
  };
  boundary.compiled.set(compiled, target);
  input = { compiled, target } as unknown as Input;
  prepare = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates').mockRejectedValue(SIGNER_BOUNDARY);
  derive = vi.spyOn(unsigned, 'deriveUnsignedTransactionId');
  checker = vi.spyOn(fleet, 'checkSignedTransaction').mockImplementation(async () => {
    throw new Error('join fixture must not reach the checker');
  });
  nodeCheck = vi.spyOn(helpers, 'ncheck').mockImplementation(async () => {
    throw new Error('join fixture must not POST a signed transaction');
  });
  vi.spyOn(helpers, 'ngetDirect').mockImplementation(async (path, origin) => {
    expect(path).toBe('/blocks/lastHeaders/10'); expect(origin).toBe(PRIMARY);
    return headers;
  });
});
afterEach(() => {
  expect(checker).not.toHaveBeenCalled(); expect(nodeCheck).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.useRealTimers();
});

async function rejectBeforeSigner(request: Awaited<ReturnType<typeof build>>, message: RegExp,
  stage: NativeGenesisSetupFailureStageV1 = 'request-validation') {
  const failure: unknown = await run(request, SENTINEL_INPUT).then(() => undefined, error => error);
  expect(failure).toBeInstanceOf(Error); expect((failure as Error).message).toMatch(message);
  expect(ownStage(failure)).toBe(stage);
  expect(prepare).not.toHaveBeenCalled();
}

describe('native setup producer to pre-sign consumer join', () => {
  it('reaches signer preparation with a genuinely registered request and exact observed inputs', async () => {
    const request = await build(input);
    boundary.reads.length = 0;
    await expect(run(request, SENTINEL_INPUT)).rejects.toBe(SIGNER_BOUNDARY);
    expect(ownStage(SIGNER_BOUNDARY)).toBe('wasm-signing');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]![0].candidates).toEqual(request.orderedIssuances.map(issuance => ({
      role: issuance.role, eip12Tx: issuance.unsignedTransactionBody, expectedTxId: issuance.unsignedTransactionIdHex,
    })));
    expect(derive).toHaveBeenCalledTimes(3);
    for (const [index, call] of derive.mock.calls.entries()) {
      expect(call[0]).toBe(request.orderedIssuances[index]!.unsignedTransactionBody);
      expect(await derive.mock.results[index]!.value).toBe(request.orderedIssuances[index]!.unsignedTransactionIdHex);
    }
    expect(boundary.reads.some(read => read === `${PRIMARY}:box`)).toBe(true);
    expect(boundary.reads.some(read => read === `${WITNESS}:box`)).toBe(true);
    expect(helpers.ngetDirect).toHaveBeenCalledTimes(1);
  });

  it('rejects a changed retained compiler candidate before observation or signing', async () => {
    const request = await build(input);
    boundary.reads.length = 0;
    (input.compiled.candidate as { sourceRuntimeCodeSha256Hex: string }).sourceRuntimeCodeSha256Hex = '35'.repeat(32);
    await rejectBeforeSigner(request, /compiler or process binding drifted/);
    expect(boundary.reads).toHaveLength(0);
  });

  it('rejects changed retained process identity before observation or signing', async () => {
    const request = await build(input);
    boundary.reads.length = 0; boundary.processDigest = '83'.repeat(32);
    await rejectBeforeSigner(request, /compiler or process binding drifted/);
    expect(boundary.reads).toHaveLength(0);
  });

  it.each(['setupActive', 'sourceActive', 'targetActive'] as const)('rejects disposed %s on a genuine request', async key => {
    const request = await build(input);
    boundary.reads.length = 0; boundary[key] = false;
    await rejectBeforeSigner(request, /fixture (setup|source|target) disposed/);
    expect(boundary.reads).toHaveLength(0);
  });

  it('rejects an input absent from the reobserved UTXO view', async () => {
    const request = await build(input);
    boundary.boxes.delete(funding[0]!.boxId);
    await rejectBeforeSigner(request, /tracker genesis box is not present in the current UTXO view/, 'pre-sign-observation');
    expect(helpers.ngetDirect).not.toHaveBeenCalled();
  });

  it('rejects independently mismatched Sigma bytes during real box reobservation', async () => {
    const request = await build(input);
    boundary.binary.set(funding[0]!.boxId, boundary.binary.get(funding[1]!.boxId)!);
    await rejectBeforeSigner(request, /tracker genesis box JSON and binary observations do not match/, 'pre-sign-observation');
    expect(helpers.ngetDirect).not.toHaveBeenCalled();
  });

  it.each(['short window', 'parent link', 'observation tip'] as const)('rejects a changed %s after native reobservation', async fault => {
    const request = await build(input);
    if (fault === 'short window') headers.pop();
    else if (fault === 'parent link') headers[0] = { ...headers[0], parentId: '96'.repeat(32) };
    else headers[0] = { ...headers[0], id: '97'.repeat(32) };
    await rejectBeforeSigner(request, fault === 'short window' ? /requires exactly 10 headers/
      : fault === 'parent link' ? /not one contiguous chain/ : /observation tip is absent from signer headers/, 'signing-context');
    expect(helpers.ngetDirect).toHaveBeenCalledTimes(1);
    expect(derive).not.toHaveBeenCalled();
  });

  it('rejects an independently derived ID mismatch after genuine request revalidation', async () => {
    const request = await build(input);
    derive.mockResolvedValueOnce('98'.repeat(32));
    await rejectBeforeSigner(request, /tracker independently derived transaction ID drifted/, 'unsigned-id-validation');
    expect(derive).toHaveBeenCalledTimes(3);
  });

  it('rejects fixed freshness expiry before further node reads', async () => {
    const request = await build(input);
    boundary.reads.length = 0; vi.setSystemTime(new Date(NOW.getTime() + 60_001));
    await rejectBeforeSigner(request, /expired during execution/, 'check-entry');
    expect(boundary.reads).toHaveLength(0);
  });

  it('rejects cancellation before any provenance reobservation or signer preparation', async () => {
    const request = await build(input);
    boundary.reads.length = 0;
    const cancellation = new AbortController(); cancellation.abort();
    const failure: unknown = await run(request, SENTINEL_INPUT, cancellation.signal).then(() => undefined, error => error);
    expect(failure).toBeInstanceOf(Error); expect((failure as Error).message).toMatch(/session was cancelled/);
    expect(ownStage(failure)).toBe('check-entry');
    expect(boundary.reads).toHaveLength(0); expect(prepare).not.toHaveBeenCalled();
    expect(derive).not.toHaveBeenCalled(); expect(helpers.ngetDirect).not.toHaveBeenCalled();
  });
});
