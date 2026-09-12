import { randomBytes } from 'node:crypto';
import { Mnemonic } from 'ethers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The request, observations, checker and WASM signer are real. Compiler/process
// custody and node responses are component doubles, not JVM or campaign evidence.
const boundary = vi.hoisted(() => ({
  compiled: new WeakMap<object, object>(), active: true, processDigest: '81'.repeat(32),
  validations: 0, validationCostMs: 0, onValidation: undefined as (() => void) | undefined,
  boxes: new Map<string, unknown>(), binary: new Map<string, string>(),
  tip: '', height: 999, genesis: '71'.repeat(32),
  onRead: undefined as (() => void) | undefined,
}));
vi.mock('./substrate-federated-observed-genesis-v1.js', () => ({
  validateObservedSubstrateFederatedGenesisV1(value: object, target: object) {
    if (boundary.compiled.get(value) !== target) throw new Error('component compiler provenance');
    if (!boundary.active) throw new Error('component custody disposed');
    boundary.validations++;
    vi.setSystemTime(new Date(Date.now() + boundary.validationCostMs));
    boundary.onValidation?.();
    return { compiled: value, processBinding: {
      processBindingDigestHex: boundary.processDigest, executionTargetIdentityDigestHex: '82'.repeat(32),
    } };
  },
}));
vi.mock('./authenticated-spv-tracker-read-only-node-client.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-spv-tracker-read-only-node-client.js')>(),
  createBoundedAuthenticatedSpvTrackerReadOnlySource() {
    const read = () => boundary.onRead?.();
    return {
      async getInfo() { read(); return { network: 'devnet', fullHeight: boundary.height }; },
      async getBestHeader() { read(); return { id: boundary.tip, height: boundary.height }; },
      async getBlockHeaderIdsAtHeight(height: number) { read(); return [height === 1 ? boundary.genesis : boundary.tip]; },
      async getBoxByIdOrNull(id: string) { read(); return boundary.boxes.get(id) ?? null; },
      async getBoxBinaryByIdOrNull(id: string) { read(); return { bytes: boundary.binary.get(id) }; },
    };
  },
}));

import { buildSubstrateFederatedNativeGenesisSetupCheckRequestV1 as build,
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1 as assertRequest }
  from './substrate-federated-native-genesis-setup-check-request-v1.js';
import { runSubstrateFederatedNativeGenesisSetupCheckV1 as run,
  takeSubstrateFederatedNativeGenesisSetupCheckExecutionMaterialV1 as take }
  from './substrate-federated-isolated-devnet-setup-check-v2.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 } from './bridge-validity-tracker-header-context-v1.js';
import { materializeUnsignedTransaction, type Eip12Box } from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 } from './substrate-federated-genesis-issuance-materialization-v1.js';
import { deriveLocalWasmRootSignerPublicIdentity } from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import * as helpers from './ergo-helpers.js';
import * as owned from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import * as observations from './substrate-federated-genesis-observation-v1.js';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
let wasm: any;
let headers: Record<string, any>[];
let mnemonic: string;
let input: Parameters<typeof build>[0];

beforeAll(async () => {
  const imported = await import('ergo-lib-wasm-nodejs'); wasm = imported.default ?? imported;
  headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: 1000, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => header.raw);
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  boundary.active = true; boundary.processDigest = '81'.repeat(32);
  boundary.validations = 0; boundary.validationCostMs = 0;
  boundary.onValidation = undefined; boundary.onRead = undefined;
  boundary.tip = headers[0]!.id; boundary.height = 999;
  boundary.boxes.clear(); boundary.binary.clear();
  mnemonic = Mnemonic.fromEntropy(randomBytes(32)).phrase;
  const signer = await deriveLocalWasmRootSignerPublicIdentity(mnemonic);
  const tree = deriveDevnetRewardErgoTreeHexForDelay(signer.publicKeyHex, 1);
  const base: Eip12Box = {
    boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
    value: '300000000', ergoTree: `0008cd02${'22'.repeat(32)}`, assets: [], additionalRegisters: {}, creationHeight: 110,
    transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
  };
  const funding = (await materializeUnsignedTransaction({ inputs: [{ ...base, extension: {} }], dataInputs: [],
    outputs: [50, 100, 150].map(amount => ({ value: String(amount * 1_000_000), ergoTree: tree, creationHeight: 120 })),
  }, 'native request checker composition')).outputs;
  const orderedTransactions = [];
  for (const [index, role] of KEYS.entries()) {
    const box = funding[index]!;
    boundary.boxes.set(box.boxId, box);
    const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
    try { boundary.binary.set(box.boxId, Buffer.from(parsed.sigma_serialize_bytes()).toString('hex')); }
    finally { parsed.free(); }
    orderedTransactions.push({ role, transaction: await materializeSubstrateFederatedSingletonIssuanceV1({
      label: role, genesisInput: box, expectedNftIdHex: box.boxId, propositionHex: signer.p2pkErgoTreeHex,
      registers: {}, singletonValue: 25_000_000n, fee: 1_100_000n, creationHeight: 1000,
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
    discovery: { reportDigestHex: '51'.repeat(32), sources: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS },
      target: { network: 'devnet', genesisHeaderIdHex: boundary.genesis, tipHeaderIdHex: boundary.tip, tipHeight: boundary.height },
      genesisInputs: Object.fromEntries(KEYS.map((key, index) => [key, funding[index]])),
      genesisBoxIds: Object.fromEntries(KEYS.map((key, index) => [key, funding[index]!.boxId])) },
    history: { receipt: { receiptDigestHex: '52'.repeat(32) } },
    issuance: { creationHeight: 1000, orderedTransactions, greenfieldReplayBaselineEstablished: false,
      targetNodeAcceptanceEstablished: false, issuanceEstablished: false },
  };
  boundary.compiled.set(compiled, target);
  input = { compiled, target } as unknown as Parameters<typeof build>[0];
  vi.spyOn(helpers, 'ngetDirect').mockResolvedValue(headers);
  vi.spyOn(helpers, 'ncheck').mockImplementation(async (_path, body) => {
    const parsed = wasm.Transaction.from_json(JSON.stringify(body)); const id = parsed.id();
    try { return id.to_str(); } finally { id.free(); parsed.free(); }
  });
  vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1').mockImplementation(value => {
    if (value !== target || !boundary.active) throw new Error('component target custody');
    return { processBindingDigestHex: boundary.processDigest, executionTargetIdentityDigestHex: '82'.repeat(32) };
  });
});
afterEach(() => { mnemonic = ''; vi.restoreAllMocks(); vi.useRealTimers(); });

describe('native request producer joined to the checking engine', () => {
  it('checks and consumes original material within the fixed window under a modeled traversal cost', async () => {
    const request = await build(input);
    boundary.validations = 0;
    // A deterministic cost model exposes duplicate composition traversals. This
    // is not a measurement of Windows probes or a predicted campaign duration.
    boundary.validationCostMs = 1000;
    const receipt = await run(request, mnemonic);
    expect(boundary.validations).toBe(58);
    expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    expect(receipt.postCheckObservation.observedAt).not.toBe(request.target.observedAt);
    expect(receipt.target.maximumObservationAgeMs).toBe(60_000);
    expect(receipt.stages.submission).toBe('not-authorized');
    const material = take(receipt, request, input.target);
    expect(material.request).toBe(request);
    expect(material.orderedTransactions.map(value => value.checked.txId))
      .toEqual(request.orderedIssuances.map(value => value.unsignedTransactionIdHex));
    expect(() => take(receipt, request, input.target)).toThrow(/exact process provenance/);
  });

  it.each([0, 1, 2])('rejects expiry during check %i without checking a sibling or promoting material', async ordinal => {
    const request = await build(input);
    const check = vi.mocked(helpers.ncheck).getMockImplementation()!;
    let count = 0;
    vi.mocked(helpers.ncheck).mockImplementation(async (...args) => {
      const result = await check(...args);
      if (count++ === ordinal) vi.setSystemTime(new Date(NOW.getTime() + 60_001));
      return result;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(request, mnemonic)).rejects.toThrow(/expired|freshness window/);
    expect(helpers.ncheck).toHaveBeenCalledTimes(ordinal + 1);
    expect(() => assertRequest(request)).toThrow('freshness window');
  });

  it.each(['disposed', 'process drift', 'expired'] as const)
    ('rejects %s during the final genuine observation before returning a receipt', async fault => {
      const request = await build(input);
      const observe = observations.observeSubstrateFederatedGenesisV1;
      let count = 0;
      vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1').mockImplementation(async (...args) => {
        const result = await observe(...args);
        if (++count === 3) {
          if (fault === 'disposed') boundary.active = false;
          else if (fault === 'process drift') boundary.processDigest = '83'.repeat(32);
          else vi.setSystemTime(new Date(NOW.getTime() + 60_001));
        }
        return result;
      });
      await expect(run(request, mnemonic)).rejects.toThrow(fault === 'disposed' ? /disposed/
        : fault === 'process drift' ? /binding drifted/ : /freshness window/);
      expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    });
});
