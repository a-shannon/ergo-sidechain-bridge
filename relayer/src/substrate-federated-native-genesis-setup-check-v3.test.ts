import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mnemonic } from 'ethers';
import * as wasm from 'ergo-lib-wasm-nodejs';

// The compiler custody and HTTP node are explicit doubles. Request custody,
// canonical transaction materialization, WASM signing and receipt custody are real.
const boundary = vi.hoisted(() => ({
  compiled: new WeakMap<object, object>(), active: true,
  processDigest: '81'.repeat(32), targetDigest: '82'.repeat(32),
  boxes: new Map<string, unknown>(), binary: new Map<string, string>(),
  network: 'devnet', genesis: '71'.repeat(32), tip: '', height: 1000,
  reads: [] as string[], onRead: undefined as undefined | (() => void),
}));
vi.mock('./substrate-federated-observed-genesis-v3.js', () => ({
  validateObservedSubstrateFederatedGenesisV3(value: object, target: object) {
    if (boundary.compiled.get(value) !== target || !boundary.active) {
      throw new Error('V3 compiled custody is absent');
    }
    return { compiled: value, processBinding: {
      processBindingDigestHex: boundary.processDigest,
      executionTargetIdentityDigestHex: boundary.targetDigest,
    } };
  },
}));
vi.mock('./authenticated-spv-tracker-read-only-node-client.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-spv-tracker-read-only-node-client.js')>(),
  createBoundedAuthenticatedSpvTrackerReadOnlySource(origin: string) {
    const read = (name: string) => { boundary.reads.push(origin + ':' + name); boundary.onRead?.(); };
    return {
      async getInfo() { read('info'); return { network: boundary.network, fullHeight: boundary.height }; },
      async getBestHeader() { read('tip'); return { id: boundary.tip, height: boundary.height }; },
      async getBlockHeaderIdsAtHeight(height: number) {
        read('height'); return [height === 1 ? boundary.genesis : boundary.tip];
      },
      async getBoxByIdOrNull(id: string) { read('box'); return boundary.boxes.get(id) ?? null; },
      async getBoxBinaryByIdOrNull(id: string) { read('binary'); return { bytes: boundary.binary.get(id) }; },
    };
  },
}));

import { buildSubstrateFederatedNativeGenesisSetupCheckRequestV3 as buildRequest,
  type SubstrateFederatedNativeGenesisSetupCheckRequestV3 as Request }
  from './substrate-federated-native-genesis-setup-check-request-v3.js';
import { runSubstrateFederatedNativeGenesisSetupCheckV3 as run,
  takeSubstrateFederatedNativeGenesisSetupCheckExecutionMaterialV3 as take,
  validateSubstrateFederatedNativeGenesisSetupCheckReceiptV3 as validate,
  takeSubstrateFederatedNativeGenesisSetupCheckExecutionMaterialV1 as takeV1,
  validateSubstrateFederatedNativeGenesisSetupCheckReceiptV1 as validateV1 }
  from './substrate-federated-isolated-devnet-setup-check-v2.js';
import { materializeUnsignedTransaction, type Eip12Box } from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 } from './substrate-federated-genesis-issuance-materialization-v1.js';
import { deriveLocalWasmRootSignerPublicIdentity } from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 } from './bridge-validity-tracker-header-context-v1.js';
import { sha256CanonicalJson } from './strict-json.js';
import * as helpers from './ergo-helpers.js';
import * as fleet from './fleet-signer.js';
import * as unsigned from './ergo-unsigned-transaction.js';

const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
const ROLES = ['tracker', 'duplicate-prevention', 'pooled-reserve'] as const;
const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_RECEIPT_V3';
let headers: Record<string, any>[];
let mnemonic: string;
let request: Request;
let target: any;
let compiled: any;

beforeAll(() => {
  headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: 1000, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => header.raw);
});
beforeEach(async () => {
  boundary.active = true; boundary.processDigest = '81'.repeat(32); boundary.targetDigest = '82'.repeat(32);
  boundary.genesis = '71'.repeat(32); boundary.tip = headers[0]!.id; boundary.height = headers[0]!.height;
  boundary.network = 'devnet'; boundary.reads.length = 0; boundary.onRead = undefined;
  boundary.boxes.clear(); boundary.binary.clear();
  mnemonic = Mnemonic.fromEntropy(randomBytes(32)).phrase;
  const signer = await deriveLocalWasmRootSignerPublicIdentity(mnemonic);
  const controlledTree = deriveDevnetRewardErgoTreeHexForDelay(signer.publicKeyHex, 1);
  const base: Eip12Box = { boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
    value: '300000000', ergoTree: '0008cd02' + '22'.repeat(32), assets: [], additionalRegisters: {},
    creationHeight: 110, transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0 };
  const funding = await materializeUnsignedTransaction({ inputs: [{ ...base, extension: {} }], dataInputs: [],
    outputs: [50, 100, 150].map(value => ({ value: String(value * 1_000_000),
      ergoTree: controlledTree, creationHeight: 110 })) }, 'native V3 check funding fixture');
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
      label: 'native V3 ' + role + ' check fixture', genesisInput, expectedNftIdHex: genesisInput.boxId,
      propositionHex: signer.p2pkErgoTreeHex, registers: {}, singletonValue: 25_000_000n,
      fee: 1_100_000n, creationHeight: 1001,
    }) });
  }
  target = Object.freeze({ primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS,
    primaryMining: true, witnessReadOnly: true });
  compiled = {
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
    discovery: { sources: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS },
      target: { network: 'devnet', genesisHeaderIdHex: boundary.genesis,
        tipHeaderIdHex: boundary.tip, tipHeight: boundary.height },
      genesisInputs: Object.fromEntries(KEYS.map((key, i) => [key, funding.outputs[i]])),
      genesisBoxIds: Object.fromEntries(KEYS.map((key, i) => [key, funding.outputs[i]!.boxId])) },
    history: { receipt: { receiptDigestHex: '52'.repeat(32) } },
    issuance: { creationHeight: 1001, orderedTransactions,
      greenfieldReplayBaselineEstablished: false, targetNodeAcceptanceEstablished: false,
      issuanceEstablished: false },
  };
  boundary.compiled.set(compiled, target);
  request = await buildRequest({ compiled, target });
  vi.spyOn(helpers, 'ngetDirect').mockResolvedValue(headers);
  vi.spyOn(helpers, 'ncheck').mockImplementation(async (_path, body) => {
    const tx = wasm.Transaction.from_json(JSON.stringify(body)); const id = tx.id();
    try { return id.to_str(); } finally { id.free(); tx.free(); }
  });
});
afterEach(() => { mnemonic = ''; vi.restoreAllMocks(); vi.useRealTimers(); });

describe('native FED V3 setup-check receipt', () => {
  it('checks three exact signed issuances and consumes only the original V3 material once', async () => {
    const receipt = await run(request, mnemonic);
    expect(receipt.schema).toBe('e2s.substrate-federated-native-genesis-setup-check-receipt.v3');
    expect(receipt.version).toBe(3);
    expect(receipt.sourceBindings).toEqual(request.sourceBindings);
    expect(receipt.orderedChecks.map(check => check.unsignedTransactionIdHex))
      .toEqual(request.orderedIssuances.map(issuance => issuance.unsignedTransactionIdHex));
    expect(helpers.ngetDirect).toHaveBeenCalledWith('/blocks/lastHeaders/10', PRIMARY);
    expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    expect(receipt.stages.submission).toBe('not-authorized');
    expect(Object.values(receipt.boundaries).some(value => value === true)).toBe(true);
    expect(receipt.boundaries.fundsAuthorityEstablished).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain(mnemonic);
    const { receiptDigestHex, ...body } = receipt;
    expect(receiptDigestHex).toBe(sha256CanonicalJson(body, DOMAIN));
    expect(() => validateV1(receipt as never, request as never)).toThrow();
    expect(() => takeV1(receipt as never, request as never, target)).toThrow();
    expect(() => take(structuredClone(receipt), request, target)).toThrow(/exact process provenance/);
    expect(validate(structuredClone(receipt), request)).toEqual(receipt);
    expect(() => take(receipt, request, { ...target })).toThrow(/another target/);
    const material = take(receipt, request, target);
    expect(material.request).toBe(request);
    expect(material.orderedTransactions.map(value => value.checked.txId))
      .toEqual(request.orderedIssuances.map(issuance => issuance.unsignedTransactionIdHex));
    expect(() => take(receipt, request, target)).toThrow(/exact process provenance/);
  });

  it('rejects a copied or V1-shaped request before signing or node check', async () => {
    const sign = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates');
    for (const supplied of [structuredClone(request), { ...request },
      { ...request, schema: 'e2s.substrate-federated-native-genesis-setup-check-request.v1', version: 1 }]) {
      await expect(run(supplied as Request, mnemonic)).rejects.toThrow(/process provenance/);
    }
    expect(sign).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('rejects retained compiler and target drift before signing', async () => {
    const sign = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates');
    compiled.preparation.preparationIdHex = '99'.repeat(32);
    await expect(run(request, mnemonic)).rejects.toThrow(/compiler or process binding drifted/);
    compiled.preparation.preparationIdHex = '30'.repeat(32);
    boundary.processDigest = '98'.repeat(32);
    await expect(run(request, mnemonic)).rejects.toThrow(/compiler or process binding drifted/);
    expect(sign).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('rejects a changed current input box at EIP-12 parsing before signing', async () => {
    const boxId = request.orderedIssuances[0]!.genesisInputBoxIdHex;
    boundary.boxes.set(boxId, { ...boundary.boxes.get(boxId) as object, value: '49000000' });
    const sign = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates');
    await expect(run(request, mnemonic)).rejects.toThrow(
      /tracker genesis box is not a valid EIP-12 box: Box id parsed from JSON/);
    expect(sign).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('rejects an independently derived unsigned ID mismatch before signing', async () => {
    const sign = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates');
    vi.spyOn(unsigned, 'deriveUnsignedTransactionId').mockResolvedValueOnce('ff'.repeat(32));
    await expect(run(request, mnemonic)).rejects.toThrow(/independently derived transaction ID drifted/);
    expect(sign).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('rejects a signed-body node mismatch and never returns a V3 receipt', async () => {
    vi.mocked(helpers.ncheck).mockResolvedValueOnce('ff'.repeat(32));
    await expect(run(request, mnemonic)).rejects.toThrow(/JVM node check failed/);
    expect(helpers.ncheck).toHaveBeenCalledTimes(1);
  });

  it('rejects pre-entry cancellation before V3 provenance or node reads', async () => {
    const signal = new AbortController(); signal.abort();
    await expect(run(request, mnemonic, signal.signal)).rejects.toThrow(/session was cancelled/);
    expect(helpers.ngetDirect).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('rejects cancellation during the first node check before a second signed-body POST', async () => {
    const signal = new AbortController();
    const check = vi.mocked(helpers.ncheck).getMockImplementation()!;
    vi.mocked(helpers.ncheck).mockImplementation(async (...args) => {
      const result = await check(...args);
      signal.abort();
      return result;
    });
    await expect(run(request, mnemonic, signal.signal)).rejects.toThrow(/session was cancelled/);
    expect(helpers.ncheck).toHaveBeenCalledTimes(1);
  });

  it('rechecks V3 custody after an observation await before signer entry', async () => {
    const sign = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates');
    boundary.onRead = () => { boundary.active = false; };
    await expect(run(request, mnemonic)).rejects.toThrow(/compiled custody is absent/);
    expect(sign).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('rejects a re-digested receipt whose request, V3 source or signed check differs', async () => {
    const receipt = await run(request, mnemonic);
    for (const fault of ['request', 'source', 'check'] as const) {
      const copy: any = structuredClone(receipt);
      if (fault === 'request') copy.requestDigestHex = 'aa'.repeat(32);
      else if (fault === 'source') copy.sourceBindings.preparationDigestHex = 'bb'.repeat(32);
      else copy.orderedChecks[0].signedTransactionBytesLength++;
      const { receiptDigestHex: _old, ...body } = copy;
      copy.receiptDigestHex = sha256CanonicalJson(body, DOMAIN);
      expect(() => validate(copy, request)).toThrow(fault === 'check'
        ? /signer receipt is invalid/ : /does not bind the exact request/);
    }
    expect(take(receipt, request, target).request).toBe(request);
  });
});
