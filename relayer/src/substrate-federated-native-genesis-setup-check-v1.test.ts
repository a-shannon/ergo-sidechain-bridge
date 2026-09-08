import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios from 'axios';
import { Mnemonic } from 'ethers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

// Request provenance and observations are component doubles. WASM signing and
// exact checked-byte custody are real; the HTTP checker is not a JVM oracle.
const boundary = vi.hoisted(() => ({
  requests: new WeakMap<object, object>(), active: true, observe: vi.fn(), build: vi.fn(),
  custody: undefined as (() => void) | undefined,
  assert(value: unknown, target?: object) {
    const retained = value !== null && typeof value === 'object' ? this.requests.get(value) : undefined;
    if (!this.active || retained === undefined || (target !== undefined && retained !== target)) {
      throw new Error('native request lacks active exact provenance');
    }
    this.custody?.();
  },
}));
vi.mock('./substrate-federated-native-genesis-setup-check-request-v1.js', () => ({
  buildSubstrateFederatedNativeGenesisSetupCheckRequestV1: (...args: unknown[]) => boundary.build(...args),
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1: (value: unknown, target?: object) => boundary.assert(value, target),
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1RuntimeProvenance: async (value: unknown) => boundary.assert(value),
  reobserveSubstrateFederatedNativeGenesisSetupCheckRequestV1: async (value: unknown) => {
    boundary.assert(value); return boundary.observe(value);
  },
}));

import type { SubstrateFederatedNativeGenesisSetupCheckRequestV1 } from './substrate-federated-native-genesis-setup-check-request-v1.js';
import {
  runSubstrateFederatedNativeGenesisSetupCheckV1 as run,
  takeSubstrateFederatedNativeGenesisSetupCheckExecutionMaterialV1 as take,
  validateSubstrateFederatedNativeGenesisSetupCheckReceiptV1 as validate,
  takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV2 as takeV2,
  takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV3 as takeV3,
  validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV3 as validateV3,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';
import * as helpers from './ergo-helpers.js';
import * as owned from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import * as fleet from './fleet-signer.js';
import * as unsigned from './ergo-unsigned-transaction.js';
import { materializeUnsignedTransaction } from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 } from './substrate-federated-genesis-issuance-materialization-v1.js';
import { deriveLocalWasmRootSignerPublicIdentity } from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 } from './bridge-validity-tracker-header-context-v1.js';
import { sha256CanonicalJson } from './strict-json.js';
import * as execution from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import * as compiledGenesis from './substrate-federated-observed-genesis-v1.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2 } from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance as assertSigner }
  from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import * as readOnlyNode from './authenticated-spv-tracker-read-only-node-client.js';
import { StateTracker } from './state-tracker.js';
import { executeSubstrateFederatedNativeGenesisBatchV1 }
  from './apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';

const ORIGIN = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const ROLES = ['tracker', 'duplicate-prevention', 'pooled-reserve'] as const;
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
const BASE = { boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5', value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`, assets: [], additionalRegisters: {}, creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0 };
let wasm: any;
let mnemonic: string;
let headers: Record<string, any>[];
let request: SubstrateFederatedNativeGenesisSetupCheckRequestV1;
let observation: any;
let target: any;

beforeAll(async () => {
  const module = await import('ergo-lib-wasm-nodejs'); wasm = module.default ?? module;
  headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: 1000, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => header.raw);
});
beforeEach(async () => {
  boundary.active = true;
  boundary.custody = undefined;
  boundary.observe.mockReset();
  boundary.build.mockReset();
  mnemonic = Mnemonic.fromEntropy(randomBytes(32)).phrase;
  const signer = await deriveLocalWasmRootSignerPublicIdentity(mnemonic);
  await configureFixture(signer);
});

async function configureFixture(signer: { publicKeyHex: string; p2pkErgoTreeHex: string }) {
  const tree = deriveDevnetRewardErgoTreeHexForDelay(signer.publicKeyHex, 1);
  const funding = (await materializeUnsignedTransaction({ inputs: [{ ...BASE, extension: {} }], dataInputs: [],
    outputs: [50, 60, 70, 120].map(amount => ({ value: String(amount * 1_000_000), ergoTree: tree, creationHeight: 120 })),
  }, 'native checker funding')).outputs;
  const issuances = [];
  for (const [ordinal, role] of ROLES.entries()) {
    const transaction = await materializeSubstrateFederatedSingletonIssuanceV1({
      label: role, genesisInput: funding[ordinal]!, expectedNftIdHex: funding[ordinal]!.boxId,
      propositionHex: signer.p2pkErgoTreeHex, registers: {}, singletonValue: 10_000_000n, fee: 1_100_000n, creationHeight: 1000,
    });
    issuances.push({ ordinal, role, genesisInputBoxIdHex: funding[ordinal]!.boxId, requiredInputErgoTreeHex: tree,
      unsignedTransactionIdHex: transaction.txId, unsignedTransactionBody: transaction.eip12Tx,
      predictedStateOutput: transaction.outputs[0],
      bytesToSignBlake2b256Hex: transaction.txId });
  }
  target = { primaryNodeOrigin: ORIGIN, witnessNodeOrigin: WITNESS, primaryMining: true, witnessReadOnly: true };
  request = { schema: 'e2s.substrate-federated-native-genesis-setup-check-request.v1', version: 1,
    requestDigestHex: '60'.repeat(32), sourceBindings: { fixtureNativeCompilerDigestHex: '61'.repeat(32) },
    target: { sourceNetworkScope: 'isolated-devnet', settlementNetworkScope: 'ergo-local-devnet', environment: 'devnet',
      nodeReportedNetwork: 'devnet', genesisHeaderIdHex: '62'.repeat(32), profileIdHex: '63'.repeat(32), profileDigestHex: '64'.repeat(32),
      preSetupAnchor: { height: 999, headerIdHex: headers[0]!.id }, observedAt: new Date().toISOString(), maximumObservationAgeMs: 60_000,
      primary: { nodeOrigin: ORIGIN, sourceIdHex: '65'.repeat(32) }, witness: { nodeOrigin: WITNESS, sourceIdHex: '66'.repeat(32) } },
    checkPolicy: { signingNetworkPrefix: 16, stateContext: { nodeOrigin: ORIGIN, method: 'GET', path: '/blocks/lastHeaders/10' },
      nodeCheck: { nodeOrigin: ORIGIN, method: 'POST', path: '/transactions/check', transactionOrder: ROLES },
      sameOriginRequired: true, transportPolicy: 'no-redirect-no-proxy', submissionEndpointPresent: false, broadcastEndpointPresent: false },
    orderedIssuances: issuances,
  } as unknown as SubstrateFederatedNativeGenesisSetupCheckRequestV1;
  boundary.requests.set(request, target);
  observation = { status: 'AGREED', reportDigestHex: '67'.repeat(32), observedAt: request.target.observedAt,
    profile: { profileIdHex: request.target.profileIdHex, profileDigestHex: request.target.profileDigestHex, environment: 'devnet' },
    target: { network: 'devnet', genesisHeaderIdHex: request.target.genesisHeaderIdHex, tipHeight: 999, tipHeaderIdHex: headers[0]!.id },
    sources: { primary: { endpointOrigin: ORIGIN, sourceIdHex: '65'.repeat(32) }, witness: { endpointOrigin: WITNESS, sourceIdHex: '66'.repeat(32) } },
    agreement: { fixtureAgreement: true }, boundary: { readOnlyNodeRequestsOnly: true, signerOrWalletMaterialRead: false,
      targetAcceptanceEstablished: false }, authorization: { fixtureAuthority: false },
    boxes: Object.fromEntries(KEYS.map((key, index) => [key, { role: ROLES[index], box: funding[index],
      sigmaSerializedSha256Hex: createHash('sha256').update(JSON.stringify(funding[index])).digest('hex'),
      checks: { presentInCurrentUtxoView: true, boxIdRecomputedFromJson: true, sigmaBytesCanonical: true } }])),
  };
  boundary.observe.mockImplementation(async () => structuredClone(observation));
  vi.spyOn(helpers, 'ngetDirect').mockResolvedValue(headers);
  vi.spyOn(helpers, 'ncheck').mockImplementation(async (_path, body) => {
    const parsed = wasm.Transaction.from_json(JSON.stringify(body)); const id = parsed.id();
    try { return id.to_str(); } finally { id.free(); parsed.free(); }
  });
  vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
    .mockReturnValue({ processBindingDigestHex: '68'.repeat(32), executionTargetIdentityDigestHex: '69'.repeat(32) });
}
afterEach(() => { mnemonic = ''; vi.restoreAllMocks(); });

describe('native FED request through the retained checking engine', () => {
  it('signs exact bodies, keeps receipt families separate and consumes checked material once', async () => {
    const receipt = await run(request, mnemonic);
    expect(receipt.schema).toBe('e2s.substrate-federated-native-genesis-setup-check-receipt.v1');
    expect(receipt.version).toBe(1);
    expect(receipt.sourceBindings).toEqual(request.sourceBindings);
    expect(receipt.orderedChecks.map(check => check.unsignedTransactionIdHex)).toEqual(request.orderedIssuances.map(value => value.unsignedTransactionIdHex));
    expect(helpers.ngetDirect).toHaveBeenCalledWith('/blocks/lastHeaders/10', ORIGIN);
    expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(helpers.ncheck).mock.calls) {
      expect(call[0]).toBe('/transactions/check'); expect(call[2]).toBe(ORIGIN);
    }
    expect(boundary.observe).toHaveBeenCalledTimes(3);
    expect(receipt.stages.submission).toBe('not-authorized');
    expect(receipt.stages.broadcast).toBe('not-authorized');
    expect(receipt.boundaries.fundsAuthorityEstablished).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain(mnemonic);
    expect(() => validateV3(structuredClone(receipt) as never, request as never)).toThrow(/exact request/);
    for (const wrong of [takeV2, takeV3]) {
      expect(() => wrong(receipt as never, request as never, target)).toThrow(/exact process provenance/);
    }
    expect(() => take(receipt, request, { ...target })).toThrow(/active exact provenance/);
    const replay = validate(structuredClone(receipt), request);
    expect(replay).toEqual(receipt);
    expect(() => take(replay, request, target)).toThrow(/exact process provenance/);
    const material = take(receipt, request, target);
    expect(material.request).toBe(request);
    expect(material.orderedTransactions.map(value => value.checked.txId)).toEqual(request.orderedIssuances.map(value => value.unsignedTransactionIdHex));
    expect(() => take(receipt, request, target)).toThrow(/exact process provenance/);
  });

  it.each(['clone', 'expired', 'foreign origin', 'broadcast endpoint'])('rejects %s before signing', async fault => {
    let candidate = request;
    if (fault === 'clone') candidate = { ...request };
    else if (fault === 'expired') (request.target as any).observedAt = new Date(Date.now() - 60_001).toISOString();
    else if (fault === 'foreign origin') (request.checkPolicy.nodeCheck as any).nodeOrigin = WITNESS;
    else (request.checkPolicy as any).broadcastEndpointPresent = true;
    const signing = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates');
    await expect(run(candidate, mnemonic)).rejects.toThrow(fault === 'clone' ? /active exact provenance/ : fault === 'expired' ? /expired/ : /beyond check-only/);
    expect(signing).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('refuses checked material after retained custody expires', async () => {
    const receipt = await run(request, mnemonic);
    boundary.active = false;
    expect(() => take(receipt, request, target)).toThrow(/active exact provenance/);
  });

  it.each(['header read', 'transaction identity'])('rechecks custody after %s before invoking the signer', async stage => {
    if (stage === 'header read') {
      vi.mocked(helpers.ngetDirect).mockImplementation(async () => { boundary.active = false; return headers; });
    } else {
      const derive = unsigned.deriveUnsignedTransactionId;
      vi.spyOn(unsigned, 'deriveUnsignedTransactionId').mockImplementation(async value => {
        const id = await derive(value); boundary.active = false; return id;
      });
    }
    const signing = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates');
    await expect(run(request, mnemonic)).rejects.toThrow(/active exact provenance/);
    expect(signing).not.toHaveBeenCalled();
    expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('passes retained custody into signer preparation', async () => {
    const prepare = fleet.prepareLocalWasmRootCheckCandidates;
    const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
    vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates').mockImplementation(async input => {
      boundary.active = false;
      return prepare(input);
    });
    await expect(run(request, mnemonic)).rejects.toThrow(/active exact provenance/);
    expect(signatures).not.toHaveBeenCalled();
    expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('passes retained custody into the checker before any signed-body POST', async () => {
    const check = fleet.checkSignedTransaction;
    vi.spyOn(fleet, 'checkSignedTransaction').mockImplementation(async (...args) => {
      boundary.active = false;
      return check(...args);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(request, mnemonic)).rejects.toThrow(/active exact provenance/);
    expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])('stops after custody expires during target check %i', async ordinal => {
    const implementation = vi.mocked(helpers.ncheck).getMockImplementation()!;
    let count = 0;
    vi.mocked(helpers.ncheck).mockImplementation(async (...args) => {
      const result = await implementation(...args);
      if (count++ === ordinal) boundary.active = false;
      return result;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(request, mnemonic)).rejects.toThrow(/active exact provenance/);
    expect(helpers.ncheck).toHaveBeenCalledTimes(ordinal + 1);
  });

  it.each([0, 1, 2])('stops at failed target check %i', async ordinal => {
    const check = helpers.ncheck;
    const implementation = vi.mocked(check).getMockImplementation()!;
    let count = 0;
    vi.mocked(check).mockImplementation(async (...args) => count++ === ordinal ? 'ff'.repeat(32) : implementation(...args));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(request, mnemonic)).rejects.toThrow(/JVM node check failed/);
    expect(check).toHaveBeenCalledTimes(ordinal + 1);
  });

  it.each(['pre-sign', 'pre-check', 'post-check'])('requires custody at %s reobservation', async stage => {
    const ordinal = ['pre-sign', 'pre-check', 'post-check'].indexOf(stage);
    let count = 0;
    boundary.observe.mockImplementation(async () => {
      if (count++ === ordinal) { boundary.active = false; throw new Error('native custody expired'); }
      return structuredClone(observation);
    });
    await expect(run(request, mnemonic)).rejects.toThrow(/custody expired/);
    expect(helpers.ncheck).toHaveBeenCalledTimes(ordinal === 2 ? 3 : 0);
  });

  it.each(['request', 'source', 'target', 'signed bytes'])('rejects re-digested receipt %s drift', async fault => {
    const receipt = structuredClone(await run(request, mnemonic)) as any;
    if (fault === 'request') receipt.requestDigestHex = 'ab'.repeat(32);
    else if (fault === 'source') receipt.sourceBindings = {};
    else if (fault === 'target') receipt.target.genesisHeaderIdHex = 'ab'.repeat(32);
    else receipt.orderedChecks[0].signedTransactionBytesLength++;
    const { receiptDigestHex: _digest, ...body } = receipt;
    receipt.receiptDigestHex = sha256CanonicalJson(body, 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_RECEIPT_V1');
    expect(() => validate(receipt, request)).toThrow(fault === 'signed bytes'
      ? /signer receipt is invalid/ : /does not bind the exact request/);
  });
});

describe('native FED managed setup session', () => {
  let session: Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>>;
  let privateSession: Awaited<ReturnType<typeof execution.createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2>>;
  let compiled: compiledGenesis.ObservedSubstrateFederatedGenesisV1;
  let sessionMnemonic: string;
  beforeEach(async () => {
    const create = execution.createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2;
    const fromEntropy = Mnemonic.fromEntropy;
    sessionMnemonic = '';
    vi.spyOn(Mnemonic, 'fromEntropy').mockImplementationOnce((...args) => {
      const result = fromEntropy(...args);
      sessionMnemonic = result.phrase;
      return result;
    });
    vi.spyOn(execution, 'createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2')
      .mockImplementation(async () => { privateSession = await create(); return privateSession; });
    session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await configureFixture(session.signer);
    compiled = { familyCompilerInput: { trackerRequest: { profile: { ergoAdmissionThreshold: 1,
      ergoAdmissionPublicKeysHex: [session.signer.publicKeyHex] } }, trackerReceipt: {}, templates: { fixture: 'native' } },
      familyReceipt: {}, discovery: { signer: session.signer,
        sources: { primaryNodeOrigin: ORIGIN, witnessNodeOrigin: WITNESS } },
    } as unknown as compiledGenesis.ObservedSubstrateFederatedGenesisV1;
    boundary.custody = () => assertSigner(session.signer);
    vi.spyOn(compiledGenesis, 'assertObservedSubstrateFederatedGenesisV1').mockImplementation((value, expectedTarget) => {
      if (value !== compiled || expectedTarget !== target || !boundary.active) throw new Error('native compiled provenance absent');
      boundary.custody!();
    });
    boundary.build.mockImplementation(async value => {
      compiledGenesis.assertObservedSubstrateFederatedGenesisV1(value.compiled, value.target);
      return request;
    });
  });
  afterEach(() => { session?.dispose(); sessionMnemonic = ''; });

  async function withNativeIssuance(
    runTest: (context: {
      input: Parameters<typeof executeSubstrateFederatedNativeGenesisBatchV1>[0] & { state: StateTracker };
      post: MockInstance<typeof axios.post>;
      markers: string;
      sent: Set<string>;
      beforeBoxRead: (callback: () => void) => void;
      afterPost: (callback: () => void) => void;
    }) => Promise<void>,
  ) {
    const batch = await session.runNativeGenesisRetainingSigner(compiled, target);
    const root = mkdtempSync(join(tmpdir(), 'e2s-native-issuance-test-'));
    const markers = join(root, 'markers');
    mkdirSync(markers);
    const state = new StateTracker(join(root, 'state.sqlite'));
    const sent = new Set<string>();
    let onBoxRead = () => {};
    let onPost = () => {};
    const boxes = new Map(batch.orderedTransactions.map(transaction => {
      const input = (transaction.issuance.unsignedTransactionBody.inputs as any[])[0];
      const { extension: _extension, ...box } = input;
      return [box.boxId, box] as const;
    }));
    // Only observations and HTTP are simulated. Signing, byte checks, both
    // authorizers, confirmation provenance and the durable journal are real.
    vi.spyOn(readOnlyNode, 'createBoundedAuthenticatedSpvTrackerReadOnlySource')
      .mockImplementation(() => ({
        getInfo: async () => ({ network: 'devnet', fullHeight: 1020 }),
        getBestHeader: async () => ({ height: 1020, id: '70'.repeat(32) }),
        getBlockHeaderIdsAtHeight: async () => [request.target.genesisHeaderIdHex],
        getIndexedHeight: async () => { throw new Error('unexpected indexed-height read'); },
        getIndexedBoxesByTokenId: async () => { throw new Error('unexpected indexed-token read'); },
        getTransaction: async () => { throw new Error('unexpected transaction read'); },
        getBlockHeaderById: async () => { throw new Error('unexpected header read'); },
        getBoxByIdOrNull: async id => { onBoxRead(); return boxes.get(id) ?? null; },
        getBoxBinaryByIdOrNull: async id => {
          const box = boxes.get(id);
          if (!box) return null;
          const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
          try { return { bytes: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex') }; }
          finally { parsed.free(); }
        },
      }) as ReturnType<typeof readOnlyNode.createBoundedAuthenticatedSpvTrackerReadOnlySource>);
    vi.spyOn(axios, 'create').mockImplementation(() => ({
      get: async (path: string) => {
        if (path === '/info') return { data: { network: 'devnet', fullHeight: 1020 } };
        if (path === '/blocks/at/1') return { data: [request.target.genesisHeaderIdHex] };
        if (path === '/blocks/at/1000') return { data: ['71'.repeat(32)] };
        const match = /^\/blockchain\/transaction\/byId\/([0-9a-f]{64})$/.exec(path);
        if (match && sent.has(match[1]!)) return { data: {
          id: match[1], numConfirmations: 20, inclusionHeight: 1000, headerId: '71'.repeat(32),
        } };
        throw new Error(`unexpected component observation ${path}`);
      },
    }) as ReturnType<typeof axios.create>);
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url, body) => {
      expect(url).toBe(`${ORIGIN}/transactions`);
      if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string') {
        throw new Error('component transport requires a signed transaction ID');
      }
      const expected = batch.orderedTransactions[sent.size]!;
      expect(body.id).toBe(expected.issuance.unsignedTransactionIdHex);
      expect(state.getErgoOperationalTransactionAttempt(body.id)).not.toBeNull();
      expect(readdirSync(markers)).toHaveLength(sent.size + 1);
      for (const predecessor of sent) {
        expect(state.getErgoOperationalTransactionAttempt(predecessor)?.status).toBe('confirmed');
      }
      sent.add(body.id);
      onPost();
      return { status: 200, data: body.id };
    });
    try {
      await runTest({ input: { target, batch, state, markerDirectory: markers },
        post, markers, sent, beforeBoxRead: callback => { onBoxRead = callback; },
        afterPost: callback => { onPost = callback; } });
    } finally {
      state.close();
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('composes native checked custody through durable ordered issuance and canonical confirmation', async () => {
    await withNativeIssuance(async ({ input, post, markers, sent }) => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 60_001);
      const result = await executeSubstrateFederatedNativeGenesisBatchV1(input);
      expect(result.map(value => value.role)).toEqual(KEYS);
      expect(result.map(value => value.expectedTxId)).toEqual([...sent]);
      expect(result.every(value => value.transportStatus === 'accepted' && value.confirmationHeight === 1000)).toBe(true);
      expect(result.every(value => value.confirmationHeaderIdHex === '71'.repeat(32))).toBe(true);
      expect(result.every(value => input.state.getErgoOperationalTransactionAttempt(value.expectedTxId)?.status === 'confirmed')).toBe(true);
      expect(Object.isFrozen(result)).toBe(true);
      expect(post).toHaveBeenCalledTimes(3);
      expect(readdirSync(markers)).toHaveLength(3);
      expect(helpers.ncheck).toHaveBeenCalledTimes(3);
      expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(input.batch, target)).not.toThrow();
      await expect(executeSubstrateFederatedNativeGenesisBatchV1(input)).rejects.toThrow();
      expect(post).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(result).includes(sessionMnemonic)).toBe(false);
    });
  });

  it('stops native issuance when custody expires during pre-transport reobservation', async () => {
    await withNativeIssuance(async ({ input, post, markers, beforeBoxRead }) => {
      let reads = 0;
      beforeBoxRead(() => { if (++reads === 3) session.dispose(); });
      await expect(executeSubstrateFederatedNativeGenesisBatchV1(input)).rejects.toThrow(/inactive/);
      expect(reads).toBe(4);
      expect(post).not.toHaveBeenCalled();
      expect(readdirSync(markers)).toHaveLength(0);
    });
  });

  it('retains the durable first attempt without authorizing a successor after custody loss at transport', async () => {
    await withNativeIssuance(async ({ input, post, markers, sent, afterPost }) => {
      afterPost(() => session.dispose());
      await expect(executeSubstrateFederatedNativeGenesisBatchV1(input)).rejects.toThrow(/inactive/);
      expect(post).toHaveBeenCalledTimes(1);
      expect(sent.size).toBe(1);
      expect(readdirSync(markers)).toHaveLength(1);
      const first = input.batch.orderedTransactions[0]!.issuance.unsignedTransactionIdHex;
      const retained = input.state.getErgoOperationalTransactionAttempt(first);
      expect(retained).not.toBeNull();
      expect(retained?.status).not.toBe('confirmed');
      expect(input.state.getErgoOperationalTransactionAttempt(input.batch.orderedTransactions[1]!.issuance.unsignedTransactionIdHex)).toBeNull();
    });
  });

  it('retains exact checked transactions and compiler custody without granting transport', async () => {
    const batch = await session.runNativeGenesisRetainingSigner(compiled, target);
    expect(batch.profile).toBe('fed-native-height-zero-v1');
    expect(batch.request).toBe(request);
    expect(batch.orderedTransactions).toHaveLength(3);
    expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).not.toThrow();
    expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1({ ...batch }, target)).toThrow(/exact process provenance/);
    expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, { ...target })).toThrow(/exact process provenance/);
    expect(() => execution.assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(batch as never, target)).toThrow(/exact process provenance/);
    expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1({ version: 3 } as never, target)).toThrow(/exact process provenance/);
    const compiler = execution.getSubstrateFederatedNativeGenesisSetupCompilerInputV1(batch, target);
    expect(compiler.trackerRequest).toBe(compiled.familyCompilerInput.trackerRequest);
    expect(compiler.trackerReceipt).toBe(compiled.familyCompilerInput.trackerReceipt);
    expect(compiler.familyReceipt).toBe(compiled.familyReceipt);
    expect(compiler.familyTemplates).toEqual(compiled.familyCompilerInput.templates);
    expect(compiler.familyTemplates).not.toBe(compiled.familyCompilerInput.templates);
    expect(() => take(batch.receipt, request, target)).toThrow(/exact process provenance/);
    expect(batch.receipt.stages.submission).toBe('not-authorized');
    expect(batch.receipt.stages.broadcast).toBe('not-authorized');
    expect(Object.keys(session)).not.toContain('mnemonic');
    expect(sessionMnemonic.length).toBeGreaterThan(0);
    expect(JSON.stringify(batch).includes(sessionMnemonic)).toBe(false);
    expect(JSON.stringify(session).includes(sessionMnemonic)).toBe(false);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_001);
    expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).not.toThrow();
    session.dispose();
    expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).toThrow(/inactive/);
    expect(() => execution.getSubstrateFederatedNativeGenesisSetupCompilerInputV1(batch, target)).toThrow(/inactive/);
  });

  it.each(['compiler clone', 'target clone', 'foreign signer'])('rejects %s before building or signing', async fault => {
    const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
    let other: typeof session | undefined;
    try {
      if (fault === 'foreign signer') other = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
      await expect((other ?? session).runNativeGenesisRetainingSigner(
        fault === 'compiler clone' ? { ...compiled } : compiled,
        fault === 'target clone' ? { ...target } : target,
      )).rejects.toThrow(fault === 'foreign signer' ? /exact retained synthetic signer/ : /compiled provenance absent/);
      expect(boundary.build).not.toHaveBeenCalled(); expect(signatures).not.toHaveBeenCalled();
      expect(helpers.ncheck).not.toHaveBeenCalled();
    } finally { other?.dispose(); }
  });

  it.each(['repeat', 'legacy', 'dispose', 'private dispose'])('cancels %s before any signature at the preparation await', async fault => {
    const prepare = fleet.prepareLocalWasmRootCheckCandidates;
    const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
    vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates').mockImplementation(async args => {
      if (fault === 'repeat') await expect(session.runNativeGenesisRetainingSigner(compiled, target)).rejects.toThrow(/consumed/);
      else if (fault === 'legacy') await expect(session.run({} as never)).rejects.toThrow(/consumed/);
      else expect(() => (fault === 'private dispose' ? privateSession : session).dispose()).toThrow(/running/);
      return prepare(args);
    });
    const error = await session.runNativeGenesisRetainingSigner(compiled, target).then(() => undefined, value => value);
    expect(signatures).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/cancelled|active process provenance/);
    expect(() => assertSigner(session.signer)).toThrow(/active process provenance/);
  });

  it('cancels during request construction before invoking signing', async () => {
    const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
    boundary.build.mockImplementation(async () => {
      expect(() => session.dispose()).toThrow(/running/);
      return request;
    });
    await expect(session.runNativeGenesisRetainingSigner(compiled, target)).rejects.toThrow(/inactive/);
    expect(signatures).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])('stops after actual signature %i when its private owner cancels', async ordinal => {
    const sign = wasm.Wallet.prototype.sign_transaction;
    let count = 0;
    const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction').mockImplementation(function (this: unknown, ...args) {
      const result = sign.apply(this, args);
      if (count++ === ordinal) expect(() => privateSession.dispose()).toThrow(/running/);
      return result;
    });
    const error = await session.runNativeGenesisRetainingSigner(compiled, target).then(() => undefined, value => value);
    expect(signatures).toHaveBeenCalledTimes(ordinal + 1);
    expect(helpers.ncheck).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/cancelled/);
  });

  it('propagates private-session cancellation into checking before any POST', async () => {
    const check = fleet.checkSignedTransaction;
    vi.spyOn(fleet, 'checkSignedTransaction').mockImplementation(async (...args) => {
      expect(() => privateSession.dispose()).toThrow(/running/);
      return check(...args);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = await session.runNativeGenesisRetainingSigner(compiled, target).then(() => undefined, value => value);
    expect(helpers.ncheck).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/cancelled/);
  });

  it.each([0, 1, 2])('invalidates cancellation during check %i before the next action or promotion', async ordinal => {
    const check = vi.mocked(helpers.ncheck).getMockImplementation()!;
    let count = 0;
    vi.mocked(helpers.ncheck).mockImplementation(async (...args) => {
      const result = await check(...args);
      if (count++ === ordinal) expect(() => session.dispose()).toThrow(/running/);
      return result;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const promote = vi.spyOn(fleet, 'promoteLocalWasmCheckedTransactionForSubmissionV1');
    await expect(session.runNativeGenesisRetainingSigner(compiled, target)).rejects.toThrow(/cancelled|active process provenance/);
    expect(helpers.ncheck).toHaveBeenCalledTimes(ordinal + 1); expect(promote).not.toHaveBeenCalled();
  });

  it('rejects process-binding drift before promoting checked material', async () => {
    const observe = boundary.observe.getMockImplementation()!;
    let count = 0;
    boundary.observe.mockImplementation(async (...args) => {
      const result = await observe(...args);
      if (++count === 3) vi.mocked(owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1)
        .mockReturnValue({ processBindingDigestHex: 'ab'.repeat(32), executionTargetIdentityDigestHex: '69'.repeat(32) });
      return result;
    });
    const promote = vi.spyOn(fleet, 'promoteLocalWasmCheckedTransactionForSubmissionV1');
    await expect(session.runNativeGenesisRetainingSigner(compiled, target)).rejects.toThrow(/process binding changed/);
    expect(promote).not.toHaveBeenCalled();
  });

  it.each(['repeat', 'legacy'])('revokes a retained native batch on a %s transition', async fault => {
    const batch = await session.runNativeGenesisRetainingSigner(compiled, target);
    await expect(fault === 'repeat' ? session.runNativeGenesisRetainingSigner(compiled, target)
      : session.checkPegInSourceLockV2RetainingSigner({} as never, target)).rejects.toThrow(/consumed|absent/);
    expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).toThrow(/inactive/);
    expect(() => execution.getSubstrateFederatedNativeGenesisSetupCompilerInputV1(batch, target)).toThrow(/inactive/);
    expect(helpers.ncheck).toHaveBeenCalledTimes(3);
  });

  it.each(['threshold', 'key count', 'admission key', 'observation key', 'observation tree'])
    ('rejects independently changed %s before request construction', async fault => {
      const other = await deriveLocalWasmRootSignerPublicIdentity(mnemonic);
      const profile = compiled.familyCompilerInput.trackerRequest.profile as any;
      if (fault === 'threshold') profile.ergoAdmissionThreshold = 0;
      else if (fault === 'key count') profile.ergoAdmissionPublicKeysHex.push(other.publicKeyHex);
      else if (fault === 'admission key') profile.ergoAdmissionPublicKeysHex = [other.publicKeyHex];
      else (compiled.discovery as any).signer = { ...session.signer,
        ...(fault === 'observation key' ? { publicKeyHex: other.publicKeyHex } : { p2pkErgoTreeHex: other.p2pkErgoTreeHex }) };
      const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
      await expect(session.runNativeGenesisRetainingSigner(compiled, target)).rejects.toThrow(/exact retained synthetic signer/);
      expect(boundary.build).not.toHaveBeenCalled(); expect(signatures).not.toHaveBeenCalled();
      expect(helpers.ncheck).not.toHaveBeenCalled();
    });
});
