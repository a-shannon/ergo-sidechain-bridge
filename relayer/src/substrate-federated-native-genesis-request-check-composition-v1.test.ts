import { randomBytes } from 'node:crypto';
import { Mnemonic } from 'ethers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The request, observations, checker and WASM signer are real. Compiler/process
// custody and node responses are component doubles, not JVM or campaign evidence.
const boundary = vi.hoisted(() => ({
  compiled: new WeakMap<object, object>(), active: true, processDigest: '81'.repeat(32), targetDigest: '82'.repeat(32),
  validations: 0, targetValidations: 0, validationCostMs: 0,
  signer: undefined as object | undefined,
  onValidation: undefined as (() => void) | undefined,
  boxes: new Map<string, unknown>(), binary: new Map<string, string>(),
  tip: '', height: 999, genesis: '71'.repeat(32),
  onRead: undefined as (() => void) | undefined,
}));
vi.mock('./substrate-federated-observed-genesis-v1.js', () => {
  const assertCustody = (value: object, target: object) => {
    if (boundary.compiled.get(value) !== target) throw new Error('component compiler provenance');
    if (!boundary.active) throw new Error('component custody disposed');
    if (boundary.signer !== undefined) assertSigner(boundary.signer as never);
  };
  const validate = (value: object, target: object) => {
    assertCustody(value, target);
    const processBinding = owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target as never);
    boundary.validations++;
    boundary.onValidation?.();
    return { compiled: value, processBinding };
  };
  return { validateObservedSubstrateFederatedGenesisV1: validate,
    assertObservedSubstrateFederatedGenesisV1: validate,
    assertObservedSubstrateFederatedGenesisReadCustodyV1: assertCustody };
});
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
import * as requestApi from './substrate-federated-native-genesis-setup-check-request-v1.js';
import * as checking from './substrate-federated-isolated-devnet-setup-check-v2.js';
import * as execution from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import * as fleet from './fleet-signer.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2 as createSession }
  from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance as assertSigner }
  from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';

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
  boundary.active = true; boundary.processDigest = '81'.repeat(32); boundary.targetDigest = '82'.repeat(32);
  boundary.validations = 0; boundary.targetValidations = 0; boundary.validationCostMs = 0;
  boundary.signer = undefined;
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
    boundary.targetValidations++;
    vi.setSystemTime(new Date(Date.now() + boundary.validationCostMs));
    return { processBindingDigestHex: boundary.processDigest, executionTargetIdentityDigestHex: boundary.targetDigest };
  });
});
afterEach(() => { mnemonic = ''; vi.restoreAllMocks(); vi.useRealTimers(); });

async function managedSession() {
  vi.spyOn(Mnemonic, 'fromEntropy').mockReturnValueOnce(Mnemonic.fromPhrase(mnemonic));
  const session = await createSession();
  boundary.signer = session.signer;
  const compiled = input.compiled as any;
  compiled.discovery.signer = session.signer;
  compiled.familyCompilerInput.trackerRequest.profile = {
    ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [session.signer.publicKeyHex],
  };
  return session;
}

describe('native request producer joined to the checking engine', () => {
  it('builds, checks and promotes a managed native batch with construction age and three RPC costs included', async () => {
    const session = await managedSession();
    const samples: { phase: string; ageMs: number; targetValidations: number }[] = [];
    const sample = (phase: string, request: Parameters<typeof run>[0]) => samples.push({ phase,
      ageMs: Date.now() - Date.parse(request.target.observedAt), targetValidations: boundary.targetValidations });
    const buildOriginal = requestApi.buildSubstrateFederatedNativeGenesisSetupCheckRequestV1;
    vi.spyOn(requestApi, 'buildSubstrateFederatedNativeGenesisSetupCheckRequestV1').mockImplementation(async (...args) => {
      const request = await buildOriginal(...args); sample('built', request); return request;
    });
    const runOriginal = checking.runSubstrateFederatedNativeGenesisSetupCheckV1;
    vi.spyOn(checking, 'runSubstrateFederatedNativeGenesisSetupCheckV1').mockImplementation(async (...args) => {
      const receipt = await runOriginal(...args); sample('checked', args[0]); return receipt;
    });
    const takeOriginal = checking.takeSubstrateFederatedNativeGenesisSetupCheckExecutionMaterialV1;
    vi.spyOn(checking, 'takeSubstrateFederatedNativeGenesisSetupCheckExecutionMaterialV1').mockImplementation((...args) => {
      const material = takeOriginal(...args); sample('consumed', args[1]); return material;
    });
    const promote = vi.spyOn(fleet, 'promoteLocalWasmCheckedTransactionForSubmissionV1');
    const check = vi.mocked(helpers.ncheck).getMockImplementation()!;
    vi.mocked(helpers.ncheck).mockImplementation(async (...args) => {
      const result = await check(...args);
      vi.setSystemTime(new Date(Date.now() + 1000));
      return result;
    });
    // Count the original request's age from its real observation during build.
    // Target probes and each check cost one modeled second; this is not a benchmark.
    boundary.validationCostMs = 1000;
    try {
      const batch = await session.runNativeGenesisRetainingSigner(input.compiled, input.target);
      sample('promoted', batch.request);
      expect(samples).toEqual([
        { phase: 'built', ageMs: 4000, targetValidations: 8 },
        { phase: 'checked', ageMs: 56000, targetValidations: 57 },
        { phase: 'consumed', ageMs: 58000, targetValidations: 59 },
        { phase: 'promoted', ageMs: 59000, targetValidations: 60 },
      ]);
      expect(samples[2]!.ageMs).toBeLessThanOrEqual(60_000);
      expect(helpers.ncheck).toHaveBeenCalledTimes(3);
      expect(promote).toHaveBeenCalledTimes(3);
      expect(batch.orderedTransactions.map(value => value.checkedAcceptance.submissionHandle)).toHaveLength(3);
      execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, input.target);
      expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1({ ...batch }, input.target))
        .toThrow('exact process provenance');
      // Retained custody has its own action checks; request expiry never renews it.
      boundary.validationCostMs = 0;
      expect(() => takeOriginal(batch.receipt, batch.request, input.target)).toThrow('exact process provenance');
      session.dispose();
      expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, input.target)).toThrow(/inactive/);
    } finally { session.dispose(); }
  });

  it.each(['checker return', 'first promotion'].flatMap(stage =>
    ['setup custody', 'source custody', 'process binding', 'target binding'].map(fault => ({ stage, fault })) ))(
    'rejects $fault at $stage without returning a managed batch', async ({ stage, fault }) => {
      const session = await managedSession();
      const mutate = vi.fn(() => {
        if (fault === 'setup custody') expect(() => session.dispose()).toThrow(/running/);
        else if (fault === 'source custody') boundary.active = false;
        else if (fault === 'process binding') boundary.processDigest = '83'.repeat(32);
        else boundary.targetDigest = '84'.repeat(32);
      });
      const runOriginal = checking.runSubstrateFederatedNativeGenesisSetupCheckV1;
      vi.spyOn(checking, 'runSubstrateFederatedNativeGenesisSetupCheckV1').mockImplementation(async (...args) => {
        const receipt = await runOriginal(...args);
        if (stage === 'checker return') mutate();
        return receipt;
      });
      const promoteOriginal = fleet.promoteLocalWasmCheckedTransactionForSubmissionV1;
      const promote = vi.spyOn(fleet, 'promoteLocalWasmCheckedTransactionForSubmissionV1').mockImplementation((...args) => {
        const result = promoteOriginal(...args);
        if (stage === 'first promotion' && mutate.mock.calls.length === 0) mutate();
        return result;
      });
      try {
        await expect(session.runNativeGenesisRetainingSigner(input.compiled, input.target))
          .rejects.toThrow(/inactive|disposed|binding changed/);
        expect(mutate).toHaveBeenCalledTimes(1);
        expect(helpers.ncheck).toHaveBeenCalledTimes(3);
        expect(promote).toHaveBeenCalledTimes(stage === 'checker return' ? 0 : 3);
        await expect(session.runNativeGenesisRetainingSigner(input.compiled, input.target)).rejects.toThrow();
        expect(helpers.ncheck).toHaveBeenCalledTimes(3);
      } finally { session.dispose(); }
    },
  );

  it('checks and consumes original material within the fixed window under a modeled traversal cost', async () => {
    const request = await build(input);
    boundary.validations = 0;
    // A deterministic cost model exposes duplicate composition traversals. This
    // is not a measurement of Windows probes or a predicted campaign duration.
    boundary.validationCostMs = 1000;
    const receipt = await run(request, mnemonic);
    expect(boundary.validations).toBe(49);
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
