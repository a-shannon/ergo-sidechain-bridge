import { randomBytes } from 'node:crypto';
import { Mnemonic } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as wasm from 'ergo-lib-wasm-nodejs';

// Compiler/target custody and node HTTP are explicit component doubles. Native
// registry, request/reobserver, issuance codecs, WASM signing and checker remain
// real. Counts describe this traversal, not Windows cost or a historical cause.
const boundary = vi.hoisted(() => ({
  compiled: new WeakMap<object, object>(), setupActive: true,
  processDigest: '81'.repeat(32), targetDigest: '82'.repeat(32),
  boxes: new Map<string, unknown>(), binary: new Map<string, string>(),
  genesis: '71'.repeat(32), tip: '', height: 120,
  phase: 'request-build', runtimeCalls: 0, observationCalls: 0, checkCalls: 0,
  trace: [] as string[], markers: [] as string[], reads: [] as string[],
  finalHook: undefined as (() => void) | undefined, finalHookUsed: false,
}));
vi.mock('./substrate-federated-observed-genesis-v1.js', () => ({
  validateObservedSubstrateFederatedGenesisV1(value: object, target: object) {
    boundary.trace.push(boundary.phase);
    if (boundary.phase === 'final-request-validation' && !boundary.finalHookUsed) {
      boundary.finalHookUsed = true;
      boundary.finalHook?.();
    }
    if (boundary.compiled.get(value) !== target) throw new Error('fixture compiler provenance');
    if (!boundary.setupActive) throw new Error('fixture setup disposed');
    return { compiled: value, processBinding: {
      processBindingDigestHex: boundary.processDigest,
      executionTargetIdentityDigestHex: boundary.targetDigest,
    } };
  },
}));
vi.mock('./substrate-federated-native-genesis-setup-check-request-v1.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./substrate-federated-native-genesis-setup-check-request-v1.js')>();
  return {
    ...actual,
    async assertSubstrateFederatedNativeGenesisSetupCheckRequestV1RuntimeProvenance(value: unknown) {
      const saved = boundary.phase;
      boundary.phase = ++boundary.runtimeCalls === 1 ? 'request-validation' : 'final-request-validation';
      boundary.markers.push(boundary.phase);
      try { return await actual.assertSubstrateFederatedNativeGenesisSetupCheckRequestV1RuntimeProvenance(value); }
      finally { boundary.phase = saved; }
    },
    async reobserveSubstrateFederatedNativeGenesisSetupCheckRequestV1(value: unknown) {
      const saved = boundary.phase;
      boundary.phase = ['pre-sign-observation', 'pre-check-observation', 'post-check-observation'][boundary.observationCalls++]!;
      boundary.markers.push(boundary.phase);
      try { return await actual.reobserveSubstrateFederatedNativeGenesisSetupCheckRequestV1(value); }
      finally { boundary.phase = saved; }
    },
  };
});
vi.mock('./authenticated-spv-tracker-read-only-node-client.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-spv-tracker-read-only-node-client.js')>(),
  createBoundedAuthenticatedSpvTrackerReadOnlySource(origin: string) {
    const read = (operation: string) => { boundary.reads.push(`${boundary.phase}:${origin}:${operation}`); };
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
import { deriveLocalWasmRootSignerPublicIdentity } from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import * as helpers from './ergo-helpers.js';
import * as fleet from './fleet-signer.js';
import { projectOwnNativeGenesisSetupFailureStageV1 as ownStage }
  from './substrate-federated-native-genesis-setup-stage-v1.js';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
type Input = Parameters<typeof build>[0];
let input: Input;
let mnemonic = '';
let nodeCheck: MockInstance<typeof helpers.ncheck>;
let signatures: MockInstance<typeof wasm.Wallet.prototype.sign_transaction>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  boundary.setupActive = true; boundary.phase = 'request-build';
  boundary.runtimeCalls = boundary.observationCalls = boundary.checkCalls = 0;
  boundary.trace.length = boundary.markers.length = boundary.reads.length = 0;
  boundary.finalHook = undefined; boundary.finalHookUsed = false;
  boundary.boxes.clear(); boundary.binary.clear();
  const entropy = randomBytes(32);
  try { mnemonic = Mnemonic.fromEntropy(`0x${entropy.toString('hex')}`).phrase; }
  finally { entropy.fill(0); }
  const identity = await deriveLocalWasmRootSignerPublicIdentity(mnemonic);
  const tree = deriveDevnetRewardErgoTreeHexForDelay(identity.publicKeyHex, 1);
  const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: 121, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => ({ ...header.raw }));
  boundary.tip = String(headers[0]!.id);
  const parsedBase = wasm.ErgoBox.from_json(JSON.stringify({
    value: '300000000', ergoTree: tree, assets: [], additionalRegisters: {}, creationHeight: 110,
    transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
  }));
  let base: Eip12Box;
  try { base = parsedBase.to_js_eip12() as Eip12Box; }
  finally { parsedBase.free(); }
  const funding = (await materializeUnsignedTransaction({
    inputs: [{ ...base, extension: {} }], dataInputs: [],
    outputs: [50, 100, 150].map(value => ({
      value: String(value * 1_000_000), ergoTree: tree, creationHeight: 110,
    })),
  }, 'native final validation funding fixture')).outputs;
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
      label: `native ${role} final validation fixture`, genesisInput, expectedNftIdHex: genesisInput.boxId,
      propositionHex: identity.p2pkErgoTreeHex, registers: {}, singletonValue: 25_000_000n,
      fee: 1_100_000n, creationHeight: 121,
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
  boundary.compiled.set(compiled, target); input = { compiled, target } as unknown as Input;
  signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
  const prepare = fleet.prepareLocalWasmRootCheckCandidates;
  vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates').mockImplementation(async args => {
    const saved = boundary.phase; boundary.phase = 'wasm-signing'; boundary.markers.push(boundary.phase);
    try { return await prepare(args); } finally { boundary.phase = saved; }
  });
  const check = fleet.checkSignedTransaction;
  vi.spyOn(fleet, 'checkSignedTransaction').mockImplementation(async (...args) => {
    const saved = boundary.phase; boundary.phase = `node-check-${boundary.checkCalls++}`;
    boundary.markers.push(boundary.phase);
    try { return await check(...args); } finally { boundary.phase = saved; }
  });
  vi.spyOn(helpers, 'ngetDirect').mockImplementation(async (path, origin) => {
    expect(path).toBe('/blocks/lastHeaders/10'); expect(origin).toBe(PRIMARY); return headers;
  });
  nodeCheck = vi.spyOn(helpers, 'ncheck').mockImplementation(async (path, signed, origin) => {
    expect(path).toBe('/transactions/check'); expect(origin).toBe(PRIMARY);
    expect(signed.inputs[0].spendingProof.proofBytes).toMatch(/^[0-9a-f]+$/);
    return signed.id; // A bounded transport double, not a JVM/node verdict.
  });
});
afterEach(() => {
  mnemonic = ''; // Worker-local synthetic keys; no physical-erasure claim.
  vi.restoreAllMocks(); vi.useRealTimers();
});

async function request() {
  const value = await build(input);
  boundary.phase = 'checker-active';
  return value;
}
function assertCompleteTraversal() {
  expect(signatures).toHaveBeenCalledTimes(3); expect(nodeCheck).toHaveBeenCalledTimes(3);
  expect(boundary.runtimeCalls).toBe(2); expect(boundary.observationCalls).toBe(3);
  expect(boundary.markers).toEqual(['request-validation', 'pre-sign-observation', 'wasm-signing',
    'pre-check-observation', 'node-check-0', 'node-check-1', 'node-check-2',
    'post-check-observation', 'final-request-validation']);
  expect(boundary.finalHookUsed).toBe(true);
  for (const phase of ['pre-sign-observation', 'pre-check-observation', 'post-check-observation']) {
    expect(boundary.reads.some(read => read === `${phase}:${PRIMARY}:box`)).toBe(true);
    expect(boundary.reads.some(read => read === `${phase}:${WITNESS}:binary`)).toBe(true);
  }
}

describe('genuine native setup traversal through final request validation', () => {
  it.each([0, 60_000])('finishes with real WASM/checker at final age %i ms', async finalAge => {
    const value = await request();
    boundary.finalHook = () => vi.setSystemTime(new Date(NOW.getTime() + finalAge));
    const receipt = await run(value, mnemonic);
    expect(receipt.status).toBe('PASS'); expect(receipt.requestDigestHex).toBe(value.requestDigestHex);
    expect(receipt.orderedChecks.map(check => check.unsignedTransactionIdHex))
      .toEqual(value.orderedIssuances.map(issuance => issuance.unsignedTransactionIdHex));
    assertCompleteTraversal();
    if (finalAge === 0) {
      const counts: Record<string, number> = {};
      for (const phase of boundary.trace) counts[phase] = (counts[phase] ?? 0) + 1;
      console.info(JSON.stringify({ fixture: 'native-final-validation-traversal',
        validateObservedCalls: boundary.trace.length, byPhase: counts,
        windowsObserverCostMeasured: false, compilerAndCustodyAreDoubles: true, nodeAcceptanceEstablished: false }));
    }
  });

  it.each(['freshness', 'custody', 'compiler identity'] as const)
  ('rejects only the selected %s fault inside final validation after three checks', async fault => {
    const value = await request();
    boundary.finalHook = () => {
      if (fault === 'freshness') vi.setSystemTime(new Date(NOW.getTime() + 60_001));
      else if (fault === 'custody') boundary.setupActive = false;
      else (input.compiled.candidate as { sourceRuntimeCodeSha256Hex: string }).sourceRuntimeCodeSha256Hex = '35'.repeat(32);
    };
    const failure: unknown = await run(value, mnemonic).then(() => undefined, error => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(fault === 'freshness' ? /fixed freshness window/
      : fault === 'custody' ? /fixture setup disposed/ : /compiler or process binding drifted/);
    expect(ownStage(failure)).toBe('final-request-validation');
    assertCompleteTraversal();
  });
});
