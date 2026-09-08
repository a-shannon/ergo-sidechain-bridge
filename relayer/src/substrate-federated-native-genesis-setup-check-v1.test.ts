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
import * as deposits from './substrate-federated-pooled-reserve-deposit-v2.js';
import { buildSubstrateFederatedNativeGenesisPegInPacketV1 as buildNativePegIn,
  assertSubstrateFederatedNativeGenesisPegInPacketV1 as assertNativePegIn,
  buildSubstrateFederatedIsolatedDevnetPegInCandidateV2 as buildLegacyPegIn }
  from './substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import { MINER_FEE_TREE } from './ergo-encoding.js';
import { executeSubstrateFederatedNativeGenesisBatchV1, executeSubstrateFederatedNativeGenesisPegInSourceLockV1 as executeNativeSourceLock,
  executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1 as executeNativeVault }
  from './apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import * as rewardDiscovery from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import * as sourceLockAuthority from './substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js';
import * as vaultAuthority from './substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js';
import { assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1 as assertNativeSourceOutputs }
  from './substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js';
import { assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1 as assertNativeVaultOutputs }
  from './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';

const ORIGIN = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const ROLES = ['tracker', 'duplicate-prevention', 'pooled-reserve'] as const;
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
const BASE = { boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5', value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`, assets: [], additionalRegisters: {}, creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0 };
function freezeFixture<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeFixture(child);
    Object.freeze(value);
  }
  return value;
}
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
      predictedStateOutput: { boxIdHex: transaction.outputs[0]!.boxId,
        transactionIdHex: transaction.outputs[0]!.transactionId, index: 0,
        creationHeight: transaction.outputs[0]!.creationHeight,
        bodyDigestHex: sha256CanonicalJson(transaction.outputs[0], 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_OUTPUT_BODY_V2') },
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
      familyReceipt: { profile: { familyIdHex: '81'.repeat(32),
        duplicatePreventionNftIdHex: request.orderedIssuances[1]!.genesisInputBoxIdHex,
        pooledReserveNftIdHex: request.orderedIssuances[2]!.genesisInputBoxIdHex },
        trackerCompilerRequestDigestHex: '82'.repeat(32), trackerCompilerReceiptDigestHex: '83'.repeat(32),
        familyCompilerRequestDigestHex: '84'.repeat(32), receiptDigestHex: '85'.repeat(32), compilerLockDigestHex: '86'.repeat(32) },
      discovery: { signer: session.signer,
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

  // Deposit semantics and JVM contract evaluation have their own matrices.
  // Here canonical transaction materialization, root signatures, check-byte
  // custody and both native session state machines are real.
  async function nativePegInFixture() {
    const batch = await session.runNativeGenesisRetainingSigner(compiled, target);
    const reserve = await materializeUnsignedTransaction(
      batch.orderedTransactions[2]!.issuance.unsignedTransactionBody as never, 'native peg-in fixture reserve');
    const sourceFunding = await materializeUnsignedTransaction({ inputs: [{ ...BASE, extension: {} }], dataInputs: [],
      outputs: [30, 270].map(amount => ({ value: String(amount * 1_000_000),
        ergoTree: session.signer.p2pkErgoTreeHex, creationHeight: 1000 })) }, 'native peg-in fixture funding');
    const sourceLockCreation = await materializeUnsignedTransaction({
      inputs: [{ ...sourceFunding.outputs[0]!, extension: {} }], dataInputs: [],
      outputs: [
        { value: '20000000', ergoTree: session.signer.p2pkErgoTreeHex, creationHeight: 1000 },
        { value: '2000000', ergoTree: session.signer.p2pkErgoTreeHex, creationHeight: 1000 },
        { value: '8000000', ergoTree: MINER_FEE_TREE, creationHeight: 1000 },
      ],
    }, 'native peg-in fixture source lock');
    const reserveTransition = await materializeUnsignedTransaction({
      inputs: [{ ...reserve.outputs[0]!, extension: { '0': '0e0100' } },
        { ...sourceLockCreation.outputs[0]!, extension: {} }, { ...sourceLockCreation.outputs[1]!, extension: {} }],
      dataInputs: [], outputs: [
        { value: '30000000', ergoTree: session.signer.p2pkErgoTreeHex, creationHeight: 1000,
          assets: reserve.outputs[0]!.assets, additionalRegisters: reserve.outputs[0]!.additionalRegisters },
        { value: '2000000', ergoTree: MINER_FEE_TREE, creationHeight: 1000 },
      ],
    }, 'native peg-in fixture reserve transition');
    const family = compiled.familyReceipt;
    const packet = freezeFixture({ schema: 'e2s.substrate-federated-pooled-reserve-deposit.v2', version: 2,
      familyIdHex: family.profile.familyIdHex, familyCompiler: {
        trackerRequestDigestHex: family.trackerCompilerRequestDigestHex,
        trackerReceiptDigestHex: family.trackerCompilerReceiptDigestHex,
        familyRequestDigestHex: family.familyCompilerRequestDigestHex,
        familyReceiptDigestHex: family.receiptDigestHex, compilerLockDigestHex: family.compilerLockDigestHex,
      }, boxes: { sourceFundingInput: sourceFunding.outputs[0], sourceLock: sourceLockCreation.outputs[0],
        transitionFeeFunding: sourceLockCreation.outputs[1], reservePredecessor: reserve.outputs[0],
        reserveSuccessor: reserveTransition.outputs[0] }, transactions: { sourceLockCreation, reserveTransition },
    }) as unknown as Readonly<deposits.SubstrateFederatedPooledReserveDepositV2Packet>;
    const packets = new WeakSet<object>([packet]);
    vi.spyOn(deposits, 'assertSubstrateFederatedPooledReserveDepositV2Packet').mockImplementation(value => {
      if (value === null || typeof value !== 'object' || !packets.has(value)) throw new Error('fixture deposit provenance absent');
    });
    const builder = vi.spyOn(deposits, 'buildSubstrateFederatedPooledReserveDepositV2').mockResolvedValue(packet);
    return { batch, packet, packets, builder, input: { batch, target, sourceFundingInput: packet.boxes.sourceFundingInput,
      sourceIntent: {} as never, depositorErgoTreeHex: session.signer.p2pkErgoTreeHex,
      creationHeights: { sourceLockCreation: 1000, reserveTransition: 1000 } as never } };
  }

  it('binds native setup to the unchanged deposit packet and checks both transactions in order', async () => {
    const { batch, packet, builder, input } = await nativePegInFixture();
    expect(await buildNativePegIn(input)).toBe(packet);
    expect(builder).toHaveBeenCalledWith({ familyCompilerInput: {
      trackerRequest: compiled.familyCompilerInput.trackerRequest, trackerReceipt: compiled.familyCompilerInput.trackerReceipt,
      templates: compiled.familyCompilerInput.templates,
      duplicatePreventionGenesisInputBoxIdHex: compiled.familyReceipt.profile.duplicatePreventionNftIdHex,
      pooledReserveGenesisInputBoxIdHex: compiled.familyReceipt.profile.pooledReserveNftIdHex,
    }, familyCompilerReceipt: compiled.familyReceipt, sourceFundingInput: input.sourceFundingInput,
    reserveState: { predecessor: packet.boxes.reservePredecessor, depositHistory: [] }, sourceIntent: input.sourceIntent,
    depositorErgoTreeHex: input.depositorErgoTreeHex, creationHeights: input.creationHeights, fees: undefined });
    const source = await session.checkNativePegInSourceLockRetainingSignerV1(packet, target);
    const sourceHandle = execution.promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(source, target);
    const vault = await session.checkNativePegInCommittedVaultRetainingSignerV1(packet, target);
    const vaultHandle = execution.promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(vault, target);
    expect(source.unsignedTransactionIdHex).toBe(packet.transactions.sourceLockCreation.txId);
    expect(vault.unsignedTransactionIdHex).toBe(packet.transactions.reserveTransition.txId);
    expect(vault.boundaries.mintAuthorized).toBe(false);
    expect(vault.boundaries.broadcastAuthorityEstablished).toBe(false);
    expect(helpers.ncheck).toHaveBeenCalledTimes(5);
    execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target);
    execution.assertSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1(sourceHandle, target);
    execution.assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1(vaultHandle, target);
    session.dispose();
    expect(() => execution.assertSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1(sourceHandle, target)).toThrow(/inactive/);
    expect(() => execution.assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1(vaultHandle, target)).toThrow(/inactive/);
    for (const handle of [sourceHandle, vaultHandle]) {
      const consumer = vi.fn();
      await expect(fleet.consumeLocalWasmCheckedSubmissionHandleV1(handle.checkedAcceptance.submissionHandle,
        handle.signedCandidate, consumer)).rejects.toThrow(/inactive/);
      expect(consumer).not.toHaveBeenCalled();
    }
  });

  it.each(['batch clone', 'target clone', 'legacy factory', 'extra key', 'accessor', 'symbol', 'missing key', 'disposed during construction'])
    ('rejects native construction with %s', async fault => {
      const { input, builder } = await nativePegInFixture();
      const value: any = { ...input };
      if (fault === 'batch clone') value.batch = { ...input.batch };
      if (fault === 'target clone') value.target = { ...target };
      if (fault === 'extra key') value.reserveState = {};
      if (fault === 'accessor') Object.defineProperty(value, 'batch', { get() { throw new Error('getter executed'); } });
      if (fault === 'symbol') value[Symbol('extra')] = true;
      if (fault === 'missing key') delete value.sourceIntent;
      if (fault === 'disposed during construction') builder.mockImplementationOnce(async () => { session.dispose(); return {} as never; });
      await expect(fault === 'legacy factory' ? buildLegacyPegIn(value) : buildNativePegIn(value)).rejects.toThrow(
        fault === 'disposed during construction' ? /inactive/ : /provenance|exact own-data/);
      expect(builder).toHaveBeenCalledTimes(fault === 'disposed during construction' ? 1 : 0);
      expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    });

  it.each(['familyIdHex', 'trackerRequestDigestHex', 'trackerReceiptDigestHex', 'familyRequestDigestHex',
    'familyReceiptDigestHex', 'compilerLockDigestHex', 'reserve predecessor', 'packet clone', 'target clone'])
    ('rejects native peg-in with changed %s before signing', async field => {
      const { packet, packets } = await nativePegInFixture();
      const changed: any = structuredClone(packet);
      if (field === 'familyIdHex') changed.familyIdHex = 'ff'.repeat(32);
      else if (field === 'reserve predecessor') changed.boxes.reservePredecessor.value = '11000000';
      else if (field !== 'packet clone' && field !== 'target clone') changed.familyCompiler[field] = 'ff'.repeat(32);
      if (field !== 'packet clone') packets.add(changed);
      const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
      await expect(session.checkNativePegInSourceLockRetainingSignerV1(changed,
        field === 'target clone' ? { ...target } : target)).rejects.toThrow(/compiler|reserve|provenance/);
      expect(signatures).not.toHaveBeenCalled(); expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    });

  it.each(['vault first', 'repeat source', 'different packet', 'legacy source', 'legacy vault'])
    ('rejects the %s native state transition and revokes custody', async fault => {
      const { packet, packets, batch } = await nativePegInFixture();
      if (fault !== 'vault first' && fault !== 'legacy source') await session.checkNativePegInSourceLockRetainingSignerV1(packet, target);
      const before = vi.mocked(helpers.ncheck).mock.calls.length;
      const other = freezeFixture(structuredClone(packet)); packets.add(other);
      const operation = fault === 'repeat source' ? () => session.checkNativePegInSourceLockRetainingSignerV1(packet, target)
        : fault === 'legacy source' ? () => session.checkPegInSourceLockV2RetainingSigner(packet, target)
          : fault === 'legacy vault' ? () => session.checkPegInCommittedVaultV2RetainingSigner(packet, target)
            : () => session.checkNativePegInCommittedVaultRetainingSignerV1(fault === 'different packet' ? other : packet, target);
      await expect(operation()).rejects.toThrow(/absent|differs/);
      expect(helpers.ncheck).toHaveBeenCalledTimes(before);
      expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).toThrow(/inactive/);
    });

  it.each(['boxId', 'transactionId', 'index', 'creationHeight', 'ergoTree', 'assets', 'additionalRegisters'])
    ('binds native reserve predecessor field %s before signing', async field => {
      const { packet, packets } = await nativePegInFixture();
      const changed: any = structuredClone(packet);
      changed.boxes.reservePredecessor[field] = field === 'index' ? 1 : field === 'creationHeight' ? 1001
        : field === 'ergoTree' ? MINER_FEE_TREE : field === 'assets' ? []
          : field === 'additionalRegisters' ? { R4: '0e0100' } : 'ff'.repeat(32);
      packets.add(changed);
      const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
      await expect(session.checkNativePegInSourceLockRetainingSignerV1(changed, target)).rejects.toThrow(/reserve differs/);
      expect(signatures).not.toHaveBeenCalled(); expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    });

  it('retains one-shot native handle use while its session remains active', async () => {
    const { packet } = await nativePegInFixture();
    const receipt = await session.checkNativePegInSourceLockRetainingSignerV1(packet, target);
    const promoted = execution.promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(receipt, target);
    const consumer = vi.fn(async (value: Readonly<Record<string, unknown>>) => value.id);
    await expect(fleet.consumeLocalWasmCheckedSubmissionHandleV1(promoted.checkedAcceptance.submissionHandle,
      promoted.signedCandidate, consumer)).resolves.toBe(packet.transactions.sourceLockCreation.txId);
    await expect(fleet.consumeLocalWasmCheckedSubmissionHandleV1(promoted.checkedAcceptance.submissionHandle,
      promoted.signedCandidate, consumer)).rejects.toThrow(/already consumed/);
    expect(consumer).toHaveBeenCalledTimes(1);
    await session.checkNativePegInCommittedVaultRetainingSignerV1(packet, target);
    await expect(session.checkNativePegInCommittedVaultRetainingSignerV1(packet, target)).rejects.toThrow(/absent/);
  });

  for (const stage of ['source', 'vault'] as const) {
    it(`rejects native ${stage} node-check failure without retaining a continuation`, async () => {
      const { packet, batch } = await nativePegInFixture();
      if (stage === 'vault') await session.checkNativePegInSourceLockRetainingSignerV1(packet, target);
      vi.mocked(helpers.ncheck).mockResolvedValueOnce(null);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(stage === 'source' ? session.checkNativePegInSourceLockRetainingSignerV1(packet, target)
        : session.checkNativePegInCommittedVaultRetainingSignerV1(packet, target)).rejects.toThrow(/check failed/);
      expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).toThrow(/inactive/);
    });

    it.each(['headers', 'signature', 'checker', 'response'])
      (`cancels native ${stage} custody at %s without promoting a check`, async boundaryName => {
        const { packet, batch } = await nativePegInFixture();
        if (stage === 'vault') await session.checkNativePegInSourceLockRetainingSignerV1(packet, target);
        const before = vi.mocked(helpers.ncheck).mock.calls.length;
        const originalSign = wasm.Wallet.prototype.sign_transaction;
        const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
        if (boundaryName === 'headers') {
          vi.mocked(helpers.ngetDirect).mockImplementationOnce(async () => {
            expect(() => session.dispose()).toThrow(/running/); return headers;
          });
        } else if (boundaryName === 'signature') {
          signatures.mockImplementation(function (this: unknown, ...args) {
            const result = originalSign.apply(this, args);
            expect(() => privateSession.dispose()).toThrow(/running/); return result;
          });
        } else if (boundaryName === 'checker') {
          const original = fleet.checkSignedTransaction;
          vi.spyOn(fleet, 'checkSignedTransaction').mockImplementation(async (...args) => {
            expect(() => session.dispose()).toThrow(/running/); return original(...args);
          });
        } else {
          const original = vi.mocked(helpers.ncheck).getMockImplementation()!;
          vi.mocked(helpers.ncheck).mockImplementation(async (...args) => {
            const result = await original(...args);
            expect(() => privateSession.dispose()).toThrow(/running/); return result;
          });
        }
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(stage === 'source' ? session.checkNativePegInSourceLockRetainingSignerV1(packet, target)
          : session.checkNativePegInCommittedVaultRetainingSignerV1(packet, target)).rejects.toThrow(/inactive|active process provenance/);
        if (boundaryName === 'headers') expect(signatures).not.toHaveBeenCalled();
        expect(helpers.ncheck).toHaveBeenCalledTimes(before + (boundaryName === 'response' ? 1 : 0));
        expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).toThrow(/inactive/);
      });

    it(`rejects promotion of a native ${stage} check after disposal`, async () => {
      const { packet } = await nativePegInFixture();
      const source = await session.checkNativePegInSourceLockRetainingSignerV1(packet, target);
      const vault = stage === 'vault' ? await session.checkNativePegInCommittedVaultRetainingSignerV1(packet, target) : undefined;
      session.dispose();
      expect(() => vault === undefined ? execution.promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(source, target)
        : execution.promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(vault, target)).toThrow(/inactive/);
    });
  }

  async function withNativeSourceLock(runTest: (context: {
    input: Parameters<typeof executeNativeSourceLock>[0] & { state: StateTracker };
    post: MockInstance<typeof axios.post>;
    funding: any;
    onFunding: (callback: (count: number) => void) => void;
    onPost: (callback: () => void) => void;
    onConfirmation: (callback: (count: number) => number) => void;
    onBoxRead: (callback: (id: string, count: number) => void) => void;
    onTip: (callback: (origin: string, count: number) => { height: number; id: string }) => void;
  }) => Promise<void>) {
    const fixture = await nativePegInFixture();
    const packet = await buildNativePegIn(fixture.input);
    const extra = await materializeUnsignedTransaction({ inputs: [{ ...BASE, extension: {} }], dataInputs: [],
      outputs: [100, 200].map(value => ({ value: String(value * 1_000_000),
        ergoTree: session.signer.p2pkErgoTreeHex, creationHeight: 1000 })) }, 'source-lock extra fixture funding');
    const inputs = { tracker: packet.boxes.sourceFundingInput, duplicatePrevention: extra.outputs[0]!, pooledReserve: extra.outputs[1]! };
    const funding: any = { sources: { primaryNodeOrigin: ORIGIN, witnessNodeOrigin: WITNESS },
      signer: session.signer, target: { network: 'devnet', genesisHeaderIdHex: request.target.genesisHeaderIdHex,
        tipHeight: 1020, tipHeaderIdHex: '70'.repeat(32) },
      genesisBoxIds: Object.fromEntries(Object.entries(inputs).map(([key, box]) => [key, box.boxId])),
      genesisInputs: structuredClone(inputs), reportDigestHex: 'a0'.repeat(32),
      boundary: { fixedDualLoopbackOrigins: true, targetBinaryRevalidationRequired: true } };
    const observations = new WeakSet<object>();
    let fundingCount = 0;
    let fundingCallback = (_count: number) => {};
    let postCallback = () => {};
    let confirmationCount = 0;
    let confirmationCallback = (_count: number) => 20;
    let boxReadCount = 0;
    let boxReadCallback = (_id: string, _count: number) => {};
    const tipCounts = new Map<string, number>();
    let tipCallback = (_origin: string, _count: number) => ({ height: 1020, id: '70'.repeat(32) });
    vi.spyOn(rewardDiscovery, 'discoverSubstrateFederatedRewardInputsV2').mockImplementation(async () => {
      fundingCallback(++fundingCount);
      const snapshot = freezeFixture(structuredClone(funding)); observations.add(snapshot); return snapshot as never;
    });
    vi.spyOn(rewardDiscovery, 'assertSubstrateFederatedRewardInputDiscoveryV2Provenance').mockImplementation(value => {
      if (value === null || typeof value !== 'object' || !observations.has(value)) throw new Error('fixture funding provenance absent');
    });
    const directory = mkdtempSync(join(tmpdir(), 'e2s-native-source-lock-test-'));
    const state = new StateTracker(join(directory, 'state.sqlite'));
    let sent = false;
    let vaultSent = false;
    const headerId = (height: number): string => height === 1000 ? '71'.repeat(32)
      : height === 1020 ? '70'.repeat(32) : height.toString(16).padStart(64, '0');
    vi.spyOn(axios, 'create').mockImplementation(options => ({ get: async (path: string) => {
      if (path === '/info') return { data: { network: 'devnet', fullHeight: 1020 } };
      if (path === '/blocks/at/1') return { data: [request.target.genesisHeaderIdHex] };
      if (path === '/blocks/at/1000') return { data: ['71'.repeat(32)] };
      if (path === '/blocks/lastHeaders/1') {
        const origin = options?.baseURL ?? '';
        const count = (tipCounts.get(origin) ?? 0) + 1;
        tipCounts.set(origin, count);
        return { status: 200, data: Buffer.from(JSON.stringify([tipCallback(origin, count)])) };
      }
      const headerMatch = /^\/blocks\/([0-9a-f]{64})\/header$/.exec(path);
      if (headerMatch) {
        const height = Array.from({ length: 21 }, (_, index) => 1000 + index).find(value => headerId(value) === headerMatch[1]);
        if (height === undefined) throw new Error('unexpected source-lock fixture header');
        return { status: 200, data: Buffer.from(JSON.stringify({ height, id: headerId(height), parentId: headerId(height - 1) })) };
      }
      const boxMatch = /^\/utxo\/byId\/([0-9a-f]{64})$/.exec(path);
      if (boxMatch) {
        const id = boxMatch[1]!;
        boxReadCallback(id, ++boxReadCount);
        const box = id === packet.boxes.sourceFundingInput.boxId ? (sent ? null : packet.boxes.sourceFundingInput)
          : vaultSent ? [packet.boxes.reserveSuccessor].find(value => value.boxId === id) ?? null
          : [packet.boxes.reservePredecessor, ...(sent ? [packet.boxes.sourceLock, packet.boxes.transitionFeeFunding] : [])]
            .find(value => value.boxId === id) ?? null;
        return { status: box === null ? 404 : 200, data: Buffer.from(JSON.stringify(box)) };
      }
      const confirmedId = path === `/blockchain/transaction/byId/${packet.transactions.sourceLockCreation.txId}` && sent
        ? packet.transactions.sourceLockCreation.txId
        : path === `/blockchain/transaction/byId/${packet.transactions.reserveTransition.txId}` && vaultSent
          ? packet.transactions.reserveTransition.txId : null;
      if (confirmedId !== null) {
        return { data: { id: confirmedId,
          numConfirmations: confirmationCallback(++confirmationCount),
          inclusionHeight: 1000, headerId: '71'.repeat(32) } };
      }
      throw new Error(`unexpected source-lock fixture observation ${path}`);
    } }) as ReturnType<typeof axios.create>);
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url, body) => {
      expect(url).toBe(`${ORIGIN}/transactions`);
      if (body === null || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string') {
        throw new Error('source-lock fixture requires exact signed transaction ID');
      }
      expect([packet.transactions.sourceLockCreation.txId, packet.transactions.reserveTransition.txId]).toContain(body.id);
      expect(state.getErgoOperationalTransactionAttempt(body.id)?.status).toBe('pending');
      const signed = wasm.Transaction.from_json(JSON.stringify(body)); const id = signed.id();
      try { expect(id.to_str()).toBe(body.id); } finally { id.free(); signed.free(); }
      if (body.id === packet.transactions.sourceLockCreation.txId) sent = true;
      else vaultSent = true;
      postCallback();
      return { status: 200, data: body.id };
    });
    try { await runTest({ input: { target, batch: fixture.batch, packet, setupSession: session, state }, post, funding,
      onFunding: callback => { fundingCallback = callback; }, onPost: callback => { postCallback = callback; },
      onConfirmation: callback => { confirmationCount = 0; confirmationCallback = callback; },
      onBoxRead: callback => { boxReadCount = 0; boxReadCallback = callback; },
      onTip: callback => { tipCounts.clear(); tipCallback = callback; } }); }
    finally { state.close(); rmSync(directory, { recursive: true, force: true }); }
  }

  it('executes native source-lock checking, authorization, durable transport and exact confirmed outputs', async () => {
    await withNativeSourceLock(async ({ input, post }) => {
      const create = sourceLockAuthority.createSubstrateFederatedNativeGenesisPegInSourceLockBroadcastAuthorizerV1;
      const scopes: string[] = [];
      vi.spyOn(sourceLockAuthority, 'createSubstrateFederatedNativeGenesisPegInSourceLockBroadcastAuthorizerV1')
        .mockImplementation(value => {
          const original = create(value);
          // Observe the port without replacing its provenance-bearing authorizer.
          const authorize = original.authorize;
          const artifactAssert = sourceLockAuthority.assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1;
          vi.spyOn(sourceLockAuthority, 'assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1')
            .mockImplementation((authorizer, authorization) => {
              artifactAssert(authorizer, authorization);
              scopes.push((authorization.authorizationArtifact as { authorizationScope: string }).authorizationScope);
            });
          expect(authorize).toBeTypeOf('function');
          return original;
        });
      const result = await executeNativeSourceLock(input);
      expect(post).toHaveBeenCalledTimes(1);
      expect(helpers.ncheck).toHaveBeenCalledTimes(4);
      expect(result.transportStatus).toBe('accepted');
      expect(input.state.getErgoOperationalTransactionAttempt(result.expectedTxId)?.status).toBe('confirmed');
      expect(scopes.length).toBeGreaterThan(0);
      expect(new Set(scopes)).toEqual(new Set(['fed-6-native-local-synthetic-peg-in-source-lock-creation-only']));
      expect(result.outputObservation.boundaries.sourceLockStillRefundable).toBe(true);
      expect(result.outputObservation.boundaries.mintAuthorized).toBe(false);
      assertNativeSourceOutputs(result.outputObservation, target, input.batch, input.packet);
      await session.checkNativePegInCommittedVaultRetainingSignerV1(input.packet, target);
      expect(helpers.ncheck).toHaveBeenCalledTimes(5);
      session.dispose();
      expect(() => assertNativeSourceOutputs(result.outputObservation, target, input.batch, input.packet)).toThrow(/inactive/);
    });
  });

  it.each(['packet clone', 'batch clone', 'target clone', 'disposed'])('rejects %s before native source-lock checking', async fault => {
    await withNativeSourceLock(async ({ input, post }) => {
      const changed = { ...input };
      if (fault === 'packet clone') changed.packet = { ...input.packet };
      if (fault === 'batch clone') changed.batch = { ...input.batch };
      if (fault === 'target clone') changed.target = { ...target };
      if (fault === 'disposed') session.dispose();
      await expect(executeNativeSourceLock(changed)).rejects.toThrow(/provenance|inactive/);
      expect(helpers.ncheck).toHaveBeenCalledTimes(3); expect(post).not.toHaveBeenCalled();
    });
  });

  it.each(['value', 'genesis', 'signer', 'height', 'disposed after check', 'disposed after funding'])
    ('rejects changed %s before native authorization', async fault => {
      await withNativeSourceLock(async ({ input, post, funding, onFunding }) => {
        onFunding(count => {
          if (fault === 'value') funding.genesisInputs.tracker.value = '31000000';
          if (fault === 'genesis') funding.target.genesisHeaderIdHex = 'ff'.repeat(32);
          if (fault === 'signer') funding.signer = { ...funding.signer, publicKeyHex: `02${'ff'.repeat(32)}` };
          if (fault === 'height' && count === 2) funding.target.tipHeight = 1019;
          if (fault === 'disposed after check' || (fault === 'disposed after funding' && count === 2)) session.dispose();
        });
        await expect(executeNativeSourceLock(input)).rejects.toThrow(/funding|inactive|provenance/);
        expect(post).not.toHaveBeenCalled();
        expect(input.state.getErgoOperationalTransactionAttempt(input.packet.transactions.sourceLockCreation.txId)).toBeNull();
      });
    });

  it('retains durable ambiguity and reconciles an accepted native source lock after a lost response', async () => {
    await withNativeSourceLock(async ({ input, post, onPost }) => {
      onPost(() => { throw new Error('fixture response lost'); });
      const result = await executeNativeSourceLock(input);
      expect(result.transportStatus).toBe('reconciled'); expect(post).toHaveBeenCalledTimes(1);
      expect(input.state.getErgoOperationalTransactionAttempt(result.expectedTxId)?.status).toBe('confirmed');
    });
  });

  it('does not transport when native journal reservation fails', async () => {
    await withNativeSourceLock(async ({ input, post }) => {
      vi.spyOn(input.state, 'reserveErgoOperationalTransactionAttempt').mockImplementation(() => { throw new Error('fixture journal failure'); });
      await expect(executeNativeSourceLock(input)).rejects.toThrow(/fixture journal failure/);
      expect(post).not.toHaveBeenCalled();
    });
  });

  it('rechecks native custody at the exact transport callback without reusing the consumed handle', async () => {
    await withNativeSourceLock(async ({ input, post }) => {
      const consume = fleet.consumeLocalWasmCheckedSubmissionHandleV1;
      vi.spyOn(fleet, 'consumeLocalWasmCheckedSubmissionHandleV1').mockImplementation(async (handle, candidate, callback) =>
        consume(handle, candidate, async signed => { session.dispose(); return callback(signed); }));
      await expect(executeNativeSourceLock(input)).rejects.toThrow(/not transported|inactive/);
      expect(post).not.toHaveBeenCalled();
      expect(input.state.getErgoOperationalTransactionAttempt(input.packet.transactions.sourceLockCreation.txId)).not.toBeNull();
    });
  });

  it('retains the transported journal but issues no completion receipt after native custody is disposed', async () => {
    await withNativeSourceLock(async ({ input, post, onPost }) => {
      onPost(() => session.dispose());
      await expect(executeNativeSourceLock(input)).rejects.toThrow(/inactive/);
      expect(post).toHaveBeenCalledTimes(1);
      expect(input.state.getErgoOperationalTransactionAttempt(input.packet.transactions.sourceLockCreation.txId)).not.toBeNull();
    });
  });

  it('rejects a second native source-lock execution without a second transport', async () => {
    await withNativeSourceLock(async ({ input, post }) => {
      await executeNativeSourceLock(input);
      await expect(executeNativeSourceLock(input)).rejects.toThrow(/absent/);
      expect(post).toHaveBeenCalledTimes(1);
      expect(() => assertNativePegIn(input.packet, input.batch, target)).toThrow(/inactive/);
    });
  });

  it.each([
    { stage: 'pending confirmation', stopAfter: 2, status: 'accepted' },
    { stage: 'journal reconciliation', stopAfter: 4, status: 'confirmed' },
    { stage: 'confirmed journal revalidation', stopAfter: 6, status: 'confirmed' },
  ])('stops after the current $stage read when custody is disposed', async ({ stage, stopAfter, status }) => {
    await withNativeSourceLock(async ({ input, post, onConfirmation }) => {
      let reads = 0;
      onConfirmation(count => {
        reads = count;
        if (count === stopAfter) session.dispose();
        return stage === 'pending confirmation' ? 1 : 20;
      });
      await expect(executeNativeSourceLock(input)).rejects.toThrow(/inactive/);
      expect(reads).toBe(stopAfter);
      expect(post).toHaveBeenCalledTimes(1);
      expect(input.state.getErgoOperationalTransactionAttempt(input.packet.transactions.sourceLockCreation.txId)?.status)
        .toBe(status);
    });
  });

  async function withNativeVault(runTest: (context: {
    input: Parameters<typeof executeNativeVault>[0] & { state: StateTracker };
    post: MockInstance<typeof axios.post>;
    onPost: (callback: () => void) => void;
    onConfirmation: (callback: (count: number) => number) => void;
    onBoxRead: (callback: (id: string, count: number) => void) => void;
    onTip: (callback: (origin: string, count: number) => { height: number; id: string }) => void;
  }) => Promise<void>) {
    await withNativeSourceLock(async context => {
      const source = await executeNativeSourceLock(context.input);
      context.onConfirmation(() => 20);
      await runTest({ ...context, input: { ...context.input, sourceLockObservation: source.outputObservation } });
    });
  }

  it('executes native deposit-to-reserve with external fees, exact checked transport and confirmed lineage', async () => {
    await withNativeVault(async ({ input, post }) => {
      const artifactAssert = vaultAuthority.assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1;
      const scopes: string[] = [];
      vi.spyOn(vaultAuthority, 'assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1')
        .mockImplementation((authorizer, authorization) => {
          artifactAssert(authorizer, authorization);
          scopes.push((authorization.authorizationArtifact as { authorizationScope: string }).authorizationScope);
        });
      const result = await executeNativeVault(input);
      expect(post).toHaveBeenCalledTimes(2);
      expect(helpers.ncheck).toHaveBeenCalledTimes(6);
      expect(new Set(scopes)).toEqual(new Set(['fed-6-native-local-synthetic-peg-in-committed-vault-transition-only']));
      expect(scopes.length).toBeGreaterThan(0);
      expect(result.transportStatus).toBe('accepted');
      expect(input.state.getErgoOperationalTransactionAttempt(result.expectedTxId)?.status).toBe('confirmed');
      expect(result.outputObservation.boundaries.sourceLockConsumptionEstablished).toBe(true);
      expect(result.outputObservation.boundaries.reserveLineageEstablished).toBe(true);
      expect(result.outputObservation.boundaries.mintAuthorized).toBe(false);
      expect(BigInt(input.packet.boxes.reserveSuccessor.value) - BigInt(input.packet.boxes.reservePredecessor.value))
        .toBe(BigInt(input.packet.boxes.sourceLock.value));
      assertNativeVaultOutputs(result.outputObservation, target, input.batch, input.packet);
      session.dispose();
      expect(() => assertNativeVaultOutputs(result.outputObservation, target, input.batch, input.packet)).toThrow(/inactive/);
    });
  });

  it.each(['packet clone', 'batch clone', 'target clone', 'source observation clone', 'disposed'])
    ('rejects native reserve %s before checking', async fault => {
      await withNativeVault(async ({ input, post }) => {
        const changed = { ...input };
        if (fault === 'packet clone') changed.packet = { ...input.packet };
        if (fault === 'batch clone') changed.batch = { ...input.batch };
        if (fault === 'target clone') changed.target = { ...input.target };
        if (fault === 'source observation clone') changed.sourceLockObservation = { ...input.sourceLockObservation };
        if (fault === 'disposed') session.dispose();
        await expect(executeNativeVault(changed)).rejects.toThrow(/provenance|inactive/);
        expect(post).toHaveBeenCalledTimes(1); expect(helpers.ncheck).toHaveBeenCalledTimes(4);
      });
    });

  it.each(['reserve', 'source lock', 'fee funding', 'restored funding'])('rejects changed native %s before reserve transport', async fault => {
    await withNativeVault(async ({ input, post }) => {
      const boxes = input.packet.boxes;
      const id = fault === 'reserve' ? boxes.reservePredecessor.boxId : fault === 'source lock' ? boxes.sourceLock.boxId
        : fault === 'fee funding' ? boxes.transitionFeeFunding.boxId : boxes.sourceFundingInput.boxId;
      const read = readOnlyNode.AuthenticatedSpvTrackerReadOnlyNodeClient.prototype.getBoxByIdOrNull;
      vi.spyOn(readOnlyNode.AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBoxByIdOrNull')
        .mockImplementation(async function(this: readOnlyNode.AuthenticatedSpvTrackerReadOnlyNodeClient, boxId) {
          const value = await read.call(this, boxId);
          return boxId === id ? fault === 'restored funding' ? boxes.sourceFundingInput
            : { ...(value as object), value: '1' } : value;
        });
      await expect(executeNativeVault(input)).rejects.toThrow(/original source funding|bytes changed|box/);
      expect(post).toHaveBeenCalledTimes(1);
      expect(input.state.getErgoOperationalTransactionAttempt(input.packet.transactions.reserveTransition.txId)).toBeNull();
    });
  });

  it('rejects a failed fresh native reserve check without transport', async () => {
    await withNativeVault(async ({ input, post }) => {
      const check = vi.mocked(helpers.ncheck).getMockImplementation()!;
      let calls = 0;
      vi.mocked(helpers.ncheck).mockImplementation(async (...args) => ++calls === 2 ? null : check(...args));
      await expect(executeNativeVault(input)).rejects.toThrow(/fresh JVM check rejected/);
      expect(post).toHaveBeenCalledTimes(1);
    });
  });

  it.each(['input observation', 'fresh check', 'transport callback'])('stops native reserve after disposal at %s', async stage => {
    await withNativeVault(async ({ input, post, onBoxRead }) => {
      if (stage === 'input observation') onBoxRead((_id, count) => { if (count === 1) session.dispose(); });
      if (stage === 'fresh check') {
        const check = vi.mocked(helpers.ncheck).getMockImplementation()!;
        let calls = 0;
        vi.mocked(helpers.ncheck).mockImplementation(async (...args) => {
          const result = await check(...args);
          if (++calls === 2) session.dispose();
          return result;
        });
      }
      if (stage === 'transport callback') {
        const consume = fleet.consumeLocalWasmCheckedSubmissionHandleV1;
        vi.spyOn(fleet, 'consumeLocalWasmCheckedSubmissionHandleV1').mockImplementation((handle, candidate, callback) =>
          consume(handle, candidate, async signed => { session.dispose(); return callback(signed); }));
      }
      await expect(executeNativeVault(input)).rejects.toThrow(/inactive|not transported/);
      expect(post).toHaveBeenCalledTimes(1);
    });
  });

  it('retains and reconciles a native reserve attempt after response loss without resubmission', async () => {
    await withNativeVault(async ({ input, post, onPost }) => {
      onPost(() => { throw new Error('fixture reserve response lost'); });
      const result = await executeNativeVault(input);
      expect(result.transportStatus).toBe('reconciled'); expect(post).toHaveBeenCalledTimes(2);
      expect(input.state.getErgoOperationalTransactionAttempt(result.expectedTxId)?.status).toBe('confirmed');
    });
  });

  it.each([ORIGIN, WITNESS])('retains native input header history when %s advances first', async leader => {
    await withNativeVault(async ({ input, post, onTip }) => {
      onTip((origin, count) => {
        const height = origin === leader ? Math.min(1020 + count, 1022) : 1019 + count;
        return { height, id: origin !== leader && count === 2 ? 'ff'.repeat(32) : height.toString(16).padStart(64, '0') };
      });
      await expect(executeNativeVault(input)).rejects.toThrow(/previously observed height/);
      expect(post).toHaveBeenCalledTimes(1);
      expect(helpers.ncheck).toHaveBeenCalledTimes(5);
    });
  });

  it('does not transport a native reserve when journal reservation fails', async () => {
    await withNativeVault(async ({ input, post }) => {
      vi.spyOn(input.state, 'reserveErgoOperationalTransactionAttempt').mockImplementation(() => { throw new Error('fixture reserve journal failure'); });
      await expect(executeNativeVault(input)).rejects.toThrow('fixture reserve journal failure');
      expect(post).toHaveBeenCalledTimes(1);
    });
  });

  it.each([ORIGIN, WITNESS])('rejects a historical header ID reused after an intervening tip from %s', async first => {
    await withNativeVault(async ({ input, post, onTip }) => {
      onTip((origin, count) => {
        const height = Math.min((origin === first ? 1019 : 1020) + count, 1022);
        return { height, id: height === 1021 ? 'b1'.repeat(32) : 'a0'.repeat(32) };
      });
      await expect(executeNativeVault(input)).rejects.toThrow(/reused a historical header ID/);
      expect(post).toHaveBeenCalledTimes(1);
      expect(helpers.ncheck).toHaveBeenCalledTimes(5);
    });
  });

  it('rejects another native reserve execution after its one-shot checker is consumed', async () => {
    await withNativeVault(async ({ input, post }) => {
      await executeNativeVault(input);
      await expect(executeNativeVault(input)).rejects.toThrow(/absent|unavailable|inactive|state/);
      expect(post).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    { stage: 'pending confirmation', stopAfter: 2, status: 'accepted' },
    { stage: 'journal reconciliation', stopAfter: 4, status: 'confirmed' },
    { stage: 'confirmed journal revalidation', stopAfter: 6, status: 'confirmed' },
  ])('preserves reserve bookkeeping and stops after disposal during $stage', async ({ stage, stopAfter, status }) => {
    await withNativeVault(async ({ input, post, onConfirmation }) => {
      let reads = 0;
      onConfirmation(count => { reads = count; if (count === stopAfter) session.dispose(); return stage === 'pending confirmation' ? 1 : 20; });
      await expect(executeNativeVault(input)).rejects.toThrow(/inactive/);
      expect(reads).toBe(stopAfter); expect(post).toHaveBeenCalledTimes(2);
      expect(input.state.getErgoOperationalTransactionAttempt(input.packet.transactions.reserveTransition.txId)?.status).toBe(status);
    });
  });

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
