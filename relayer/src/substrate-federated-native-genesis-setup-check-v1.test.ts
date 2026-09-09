import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios from 'axios';
import { Mnemonic, SigningKey, HDNodeWallet, Transaction, Interface } from 'ethers';
import blakejs from 'blakejs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

// Request provenance and observations are component doubles. WASM signing and
// exact checked-byte custody are real; the HTTP checker is not a JVM oracle.
const boundary = vi.hoisted(() => ({
  requests: new WeakMap<object, object>(), active: true, observe: vi.fn(), build: vi.fn(),
  failSourceSignature: false, failSourceVerification: false,
  custody: undefined as (() => void) | undefined,
  assert(value: unknown, target?: object) {
    const retained = value !== null && typeof value === 'object' ? this.requests.get(value) : undefined;
    if (!this.active || retained === undefined || (target !== undefined && retained !== target)) {
      throw new Error('native request lacks active exact provenance');
    }
    this.custody?.();
  },
}));
vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual,
    sign: vi.fn((...args: Parameters<typeof actual.sign>) => {
      if (boundary.failSourceSignature) throw new Error('injected native source signature failure');
      return actual.sign(...args);
    }),
    verify: vi.fn((...args: Parameters<typeof actual.verify>) => {
      if (boundary.failSourceVerification) return false;
      return actual.verify(...args);
    }),
  };
});
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
import { executeFrontierNativeProofBoundReservationAndMintV1 } from './apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.js';
import { encodeFederatedNativeMintExtrinsicV1Hex } from './federated-native-mint-runtime-state-v1.js';
import { encodePooledReserveMintReservationPendingV4ScaleHex } from './pooled-reserve-mint-reservation-runtime-state-v4.js';
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
import { encodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1 as buildNativeMintDraft,
  assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV1 as assertNativeMintDraft,
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2 as assertLegacyMintDraft,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV1 as collectNativeReserveEvidence,
  consumeSubstrateFederatedNativeGenesisCommittedReserveEvidenceForDraftV1 as consumeNativeReserveEvidence,
} from './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2 as createSourceSession,
  readSubstrateFederatedGenesisProfilesFromSessionV2 as readSourceProfiles,
  produceSubstrateFederatedNativeGenesisMintSourceProofV1 as produceNativeMintProof,
  assertSubstrateFederatedNativeGenesisMintSourceProofReceiptV1 as assertNativeMintProof,
  assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2Provenance as assertLegacyMintProof,
  type ProduceSubstrateFederatedNativeGenesisMintSourceProofV1Input,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex as decodeRuntimeProfile,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex as encodeRuntimeProfile,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex as runtimeProfileId,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex as decodeSourceEnvelope,
  verifyFederatedPooledReserveSourceProofSignaturesForProfileV1 as verifySourceSignatures,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import { createFederatedGenesisOperatorV1, disposeFederatedGenesisOperatorV1 }
  from './adapters/federated-genesis-operator-v1.js';
import * as nativeOperator from './adapters/federated-genesis-operator-v1.js';
import * as frontierOwner from './substrate-federated-authority-safe-devnet-process-v1.js';
import { signFrontierNativeProofBoundReservationV1, executeFrontierNativeProofBoundReservationV1 }
  from './apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.js';
import { derivePooledReserveMintReservationRuntimeStorageKeysV4 }
  from './pooled-reserve-mint-reservation-runtime-state-v4.js';

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
  boundary.failSourceSignature = false;
  boundary.failSourceVerification = false;
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
afterEach(() => { mnemonic = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
  let nativeMintRecipient: string;
  let mintOperator: ReturnType<typeof createFederatedGenesisOperatorV1> | undefined;
  beforeEach(async () => {
    const create = execution.createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2;
    const fromEntropy = Mnemonic.fromEntropy;
    sessionMnemonic = '';
    nativeMintRecipient = '89'.repeat(20); mintOperator = undefined;
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
  afterEach(() => { session?.dispose(); sessionMnemonic = ''; if (mintOperator) disposeFederatedGenesisOperatorV1(mintOperator); });

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
    const sourceIntent = { formatVersion: 2 as const, sourceNetworkIdHex: request.target.genesisHeaderIdHex,
      sidechainIdHex: '87'.repeat(32), bridgeAddressHex: '33'.repeat(20), tokenAddressHex: '44'.repeat(20),
      settlementProfileIdHex: '88'.repeat(32), admissionProfileIdHex: family.profile.familyIdHex,
      sourceAssetIdHex: '00'.repeat(32), amountNanoErg: sourceLockCreation.outputs[0]!.value,
      recipientAddressHex: nativeMintRecipient };
    const packet = freezeFixture({ schema: 'e2s.substrate-federated-pooled-reserve-deposit.v2', version: 2,
      familyIdHex: family.profile.familyIdHex, familyCompiler: {
        trackerRequestDigestHex: family.trackerCompilerRequestDigestHex,
        trackerReceiptDigestHex: family.trackerCompilerReceiptDigestHex,
        familyRequestDigestHex: family.familyCompilerRequestDigestHex,
        familyReceiptDigestHex: family.receiptDigestHex, compilerLockDigestHex: family.compilerLockDigestHex,
      }, sourceIntentHex: encodePegInSourceIntentV2Hex(sourceIntent), depositCommitmentHex: '8a'.repeat(32),
      reserve: { outputDigestHex: `01${'8b'.repeat(32)}`, outputLiabilityNanoErg: sourceIntent.amountNanoErg },
      boxes: { sourceFundingInput: sourceFunding.outputs[0], sourceLock: sourceLockCreation.outputs[0],
        transitionFeeFunding: sourceLockCreation.outputs[1], reservePredecessor: reserve.outputs[0],
        reserveSuccessor: reserveTransition.outputs[0] }, transactions: { sourceLockCreation, reserveTransition },
    }) as unknown as Readonly<deposits.SubstrateFederatedPooledReserveDepositV2Packet>;
    const packets = new WeakSet<object>([packet]);
    vi.spyOn(deposits, 'assertSubstrateFederatedPooledReserveDepositV2Packet').mockImplementation(value => {
      if (value === null || typeof value !== 'object' || !packets.has(value)) throw new Error('fixture deposit provenance absent');
    });
    const builder = vi.spyOn(deposits, 'buildSubstrateFederatedPooledReserveDepositV2').mockResolvedValue(packet);
    return { batch, packet, packets, builder, input: { batch, target, sourceFundingInput: packet.boxes.sourceFundingInput,
      sourceIntent, depositorErgoTreeHex: session.signer.p2pkErgoTreeHex,
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

  it('collects and consumes native mint evidence from the composed confirmed reserve without mint authority', async () => {
    await withNativeVault(async ({ input, post }) => {
      const reserve = await executeNativeVault(input);
      const joined = { target, batch: input.batch, packet: input.packet,
        committedVaultObservation: reserve.outputObservation };
      const draft = buildNativeMintDraft(joined);
      assertNativeMintDraft(draft);
      expect(() => assertLegacyMintDraft(draft)).toThrow(/provenance/);
      expect(draft.statement.sourceIntentHex).toBe(`0x${input.packet.sourceIntentHex.replace(/^0x/, '')}`);
      expect(draft.statement.reserveTransitionTransactionIdHex).toBe(`0x${reserve.expectedTxId}`);
      expect(draft.statement.successorReserveBoxIdHex).toBe(`0x${input.packet.boxes.reserveSuccessor.boxId}`);
      expect(draft.statement.successorReserveLiabilityNanoErg).toBe('20000000');
      expect(draft.statement.inclusionHeight).toBe(1000);
      expect(draft.statement.targetHeight).toBe(1010);
      const receipt = collectNativeReserveEvidence({ ...joined, draft });
      const evidence = consumeNativeReserveEvidence(receipt, draft);
      const decode = (hex: string) => JSON.parse(Buffer.from(hex.replace(/^0x/, ''), 'hex').toString('utf8'));
      expect(decode(evidence.sourceLockBoxCanonicalHex).box).toEqual(input.packet.boxes.sourceLock);
      expect(decode(evidence.reserveTransitionTransactionCanonicalHex).transaction)
        .toEqual(input.packet.transactions.reserveTransition.eip12Tx);
      expect(decode(evidence.successorReserveBoxCanonicalHex).box).toEqual(input.packet.boxes.reserveSuccessor);
      expect(decode(evidence.inclusionProofCanonicalHex).confirmationHeaderIdHex)
        .toBe(`0x${reserve.outputObservation.confirmationHeaderIdHex}`);
      expect(decode(evidence.checkpointAncestryCanonicalHex).pathHeaderIdsHex).toHaveLength(11);
      expect(decode(evidence.finalityProofCanonicalHex).ergoPowAuthenticated).toBe(false);
      expect(receipt.boundaries.mintAuthorized).toBe(false);
      expect(receipt.boundaries.fundsAuthorityEstablished).toBe(false);
      expect(() => consumeNativeReserveEvidence(receipt, draft)).toThrow(/consumed/);
      expect(post).toHaveBeenCalledTimes(2);
      expect(helpers.ncheck).toHaveBeenCalledTimes(6);
    });
  });

  async function withNativeMintProof(runTest: (context: {
    source: ReturnType<typeof createSourceSession>;
    proofInput: ProduceSubstrateFederatedNativeGenesisMintSourceProofV1Input;
    post: MockInstance;
  }) => Promise<void>) {
    const source = createSourceSession({ ergoAdmissionThreshold: 1,
      ergoAdmissionPublicKeysHex: [session.signer.publicKeyHex] });
    const profiles = readSourceProfiles(source);
    const runtimeProfileScaleHex = encodeRuntimeProfile({ formatVersion: 4,
      lineageProfileIdHex: `0x${compiled.familyReceipt.profile.familyIdHex}`,
      sourceNetworkIdHex: `0x${request.target.genesisHeaderIdHex}`, sidechainIdHex: `0x${'87'.repeat(32)}`,
      bridgeAddressHex: `0x${'33'.repeat(20)}`, tokenAddressHex: `0x${'44'.repeat(20)}`,
      bridgeRuntimeCodeSha256Hex: `0x${createHash('sha256').update(Buffer.alloc(100, 0x60)).digest('hex')}`, bridgeRuntimeCodeBytes: 100,
      tokenRuntimeCodeSha256Hex: `0x${createHash('sha256').update(Buffer.alloc(200, 0x60)).digest('hex')}`, tokenRuntimeCodeBytes: 200,
      settlementProfileIdHex: `0x${'88'.repeat(32)}`,
      ergoDepositFinalityPolicyIdHex: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
      sourceProofSystemIdHex: source.binding.federatedMintProfile.proofSystemIdHex,
      sourceProofProfileIdHex: source.binding.federatedMintProfile.proofProfileIdHex,
      activationHeight: '0', maxPendingBlocks: 64 });
    const runtimeProfile = decodeRuntimeProfile(runtimeProfileScaleHex);
    // Genesis compilation is a double; draft/evidence custody, codecs and threshold signatures are real.
    Object.assign(compiled, { preparation: { checkpointProfile: profiles.checkpointProfile, evmChainId: '4242',
      application: { sourceNetworkIdHex: runtimeProfile.sourceNetworkIdHex.slice(2), sidechainIdHex: runtimeProfile.sidechainIdHex.slice(2),
        bridgeAddressHex: '33'.repeat(20), tokenAddressHex: '44'.repeat(20), settlementProfileIdHex: '88'.repeat(32),
        bridgeRuntimeCodeSha256Hex: runtimeProfile.bridgeRuntimeCodeSha256Hex.slice(2), bridgeRuntimeCodeBytes: 100,
        tokenRuntimeCodeSha256Hex: runtimeProfile.tokenRuntimeCodeSha256Hex.slice(2), tokenRuntimeCodeBytes: 200 } },
      candidate: Object.freeze({ runtimeProfile, runtimeProfileScaleHex,
        runtimeProfileIdHex: runtimeProfileId(runtimeProfile), genesisJsonSha256Hex: '93'.repeat(32) }) });
    boundary.custody = () => { assertSigner(session.signer); readSourceProfiles(source); };
    try {
      await withNativeVault(async ({ input, post }) => {
        const reserve = await executeNativeVault(input);
        const draftInputs = { target, batch: input.batch, packet: input.packet,
          committedVaultObservation: reserve.outputObservation };
        const draft = buildNativeMintDraft(draftInputs);
        const evidenceReceipt = collectNativeReserveEvidence({ ...draftInputs, draft });
        await runTest({ source, proofInput: { draftInputs, draft, evidenceReceipt,
          issuedAtNativeHeight: '0', expiresAtNativeHeight: '32' }, post });
      });
    } finally { source.dispose(); }
  }

  it('produces the native height-zero proof from the composed confirmed reserve and retained federation', async () => {
    await withNativeMintProof(async ({ source, proofInput, post }) => {
      const receipt = produceNativeMintProof(source, proofInput);
      assertNativeMintProof(receipt, source, proofInput.draft);
      const profiles = readSourceProfiles(source);
      const verified = verifySourceSignatures(profiles.mintProofProfile, receipt.request, receipt.result,
        receipt.signatureVerification.signatures);
      const decoded = decodeSourceEnvelope(profiles.mintProofProfile, receipt.request, receipt.sourceProofEnvelopeScaleHex);
      expect(verified.resultIdHex).toBe(receipt.signatureVerification.resultIdHex);
      expect(verified.signatures).toHaveLength(2);
      expect(decoded.proofProfileIdHex).toBe(source.binding.federatedMintProfile.proofProfileIdHex);
      expect(receipt.runtimeProfileScaleHex).toBe(compiled.candidate.runtimeProfileScaleHex);
      expect(receipt.request.runtimeProfile.activationHeight).toBe('0');
      expect(receipt.request.statementHex).toBe(proofInput.draft.statementHex);
      expect(receipt.request.evidence).toEqual(proofInput.evidenceReceipt.evidence);
      expect(receipt.provenance).toEqual(proofInput.draft.provenance);
      expect(receipt.boundary.sourceCanonicalityIndependentlyVerified).toBe(false);
      expect(receipt.boundary.runtimeReservationWritten).toBe(false);
      expect(receipt.boundary.mintExecuted).toBe(false);
      expect(receipt.boundary.broadcastAuthorized).toBe(false);
      expect(receipt.boundary.fundsAuthorityEstablished).toBe(false);
      expect(() => assertLegacyMintProof(receipt)).toThrow(/provenance/);
      expect(() => consumeNativeReserveEvidence(proofInput.evidenceReceipt, proofInput.draft)).toThrow(/consumed/);
      expect(() => produceNativeMintProof(source, proofInput)).toThrow(/consumed/);
      expect(() => source.signLaunchStatement({} as never)).toThrow(/already signed/);
      execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(proofInput.draftInputs.batch, target);
      expect(post).toHaveBeenCalledTimes(2);
      expect(helpers.ncheck).toHaveBeenCalledTimes(6);
      source.dispose();
      expect(() => assertNativeMintProof(receipt, source, proofInput.draft)).toThrow(/disposed/);
    });
  });

  function reservationTarget(operator: ReturnType<typeof createFederatedGenesisOperatorV1>,
    targetFields: Partial<frontierOwner.OwnedFederatedGenesisDevnetTargetV1> = {}) {
    const runtime = Buffer.from('0061736d01000000', 'hex');
    Object.assign(compiled, { preparation: { ...compiled.preparation,
      operatorAddressHex: operator.addressHex, launchDomainHex: operator.launchDomainHex,
      application: { ...compiled.preparation.application, sourceRuntimeCodeSha256Hex: createHash('sha256').update(runtime).digest('hex'),
        sourceRuntimeCodeBytes: runtime.length } } });
    const frontierTarget = Object.freeze({ primaryRpcUrl: 'http://127.0.0.1:19955',
      witnessRpcUrl: 'http://127.0.0.1:19956', genesisJsonSha256Hex: compiled.candidate.genesisJsonSha256Hex,
      ...targetFields });
    let active = true;
    // Child custody is a double here; its real producer is covered by process lifecycle tests.
    vi.spyOn(frontierOwner, 'assertOwnedFederatedGenesisDevnetTargetV1').mockImplementation(value => {
      if (!active || value !== frontierTarget) throw new Error('FED target lacks active original provenance');
    });
    const expectedStorage: Record<string, string> = {
      '0x3a636f6465': `0x${runtime.toString('hex')}`,
      '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde': compiled.candidate.runtimeProfileScaleHex,
      '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1': '0x01',
      [operator.nativeFunding.storageKeyHex]: operator.nativeFunding.accountInfoScaleHex,
    };
    const expectedGenesisHashHex = `0x${'94'.repeat(32)}`;
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      const { method, params } = JSON.parse(init.body as string);
      const result = method === 'chain_getBlockHash' ? expectedGenesisHashHex
        : method === 'chain_getHeader' ? { number: '0x0' }
          : method === 'author_pendingExtrinsics' ? []
            : method === 'state_getStorage' ? expectedStorage[params[0]] ?? null : undefined;
      if (result === undefined) throw new Error('unexpected fixture RPC method');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
    });
    vi.stubGlobal('fetch', fetcher);
    return { fields: { frontierTarget, expectedStorage, expectedGenesisHashHex }, fetcher,
      dispose() { active = false; } };
  }

  it('signs the exact native reservation from the composed reserve proof without mint or broadcast authority', async () => {
    await withNativeMintProof(async ({ source, proofInput, post }) => {
      const operator = createFederatedGenesisOperatorV1();
      const observed = reservationTarget(operator);
      try {
        const proof = produceNativeMintProof(source, proofInput);
        const signing = { operator, sourceSession: source, draft: proofInput.draft, proof, compiled, target,
          ...observed.fields };
        const result = await signFrontierNativeProofBoundReservationV1(signing);
        expect(result.callScaleHex).toBe(`0x0c066d09${proof.request.statementHex.slice(2)}${proof.sourceProofEnvelopeScaleHex.slice(2)}`);
        expect(result.sourceProofReceiptDigestHex).toBe(proof.receiptDigestHex);
        expect(result.mintIdentityHex).toBe(proofInput.draft.reservationKeyHex);
        expect(result.runtimeReservationEstablished).toBe(false);
        expect(result.mintExecuted).toBe(false);
        expect(result.broadcastAuthorized).toBe(false);
        expect(result.genesisHashHex).toBe(observed.fields.expectedGenesisHashHex);
        expect(result.nonce).toBe(0);
        expect(new Set(observed.fetcher.mock.calls.map(call => call[0])))
          .toEqual(new Set([observed.fields.frontierTarget.primaryRpcUrl, observed.fields.frontierTarget.witnessRpcUrl]));
        await expect(signFrontierNativeProofBoundReservationV1(signing)).rejects.toThrow(/consumed/);
        expect(post).toHaveBeenCalledTimes(2);
      } finally { disposeFederatedGenesisOperatorV1(operator); }
    });
  });

  it.each(['none', 'missing scope', 'proof clone', 'before transport', 'after submission',
    'after seal', 'pending drift', 'request digest drift', 'result digest drift', 'proof digest drift'])
    ('executes the proof-bound native reservation with %s', async defect => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const operator = createFederatedGenesisOperatorV1();
        const observed = reservationTarget(operator);
        const directory = mkdtempSync(join(tmpdir(), 'bridge-native-composed-reservation-'));
        try {
          const proof = produceNativeMintProof(source, proofInput);
          const keys = derivePooledReserveMintReservationRuntimeStorageKeysV4(proof.mintIdentityHex);
          const bytes = (hex: string) => Buffer.from(hex.slice(2), 'hex');
          const u64 = (value: string | number | bigint) => { const out = Buffer.alloc(8); out.writeBigUInt64LE(BigInt(value)); return out; };
          const digest = (value: Uint8Array) => Buffer.from(blakejs.blake2b(value, undefined, 32));
          // Independent field concatenation, not the production pending encoder.
          const pending = Buffer.concat([Buffer.from([4]), bytes(proof.runtimeProfileIdHex), Buffer.from('6d09', 'hex'),
            bytes(proof.request.statementHex), bytes(proof.mintReservationStatementIdHex), bytes(proof.mintIdentityHex),
            digest(bytes(proof.request.statementHex)), bytes(proof.request.runtimeProfile.sourceProofSystemIdHex),
            bytes(proof.sourceProofProfileIdHex), u64(proof.result.issuedAtNativeHeight), bytes(proof.requestDigestHex),
            bytes(proof.signatureVerification.resultIdHex), digest(Buffer.concat([
              Buffer.from('E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_ENVELOPE_V1', 'ascii'),
              bytes(proof.signatureVerification.resultIdHex), bytes(proof.signatureVerification.signatureSetDigestHex),
            ])), u64(1), u64(proof.result.expiresAtNativeHeight)]);
          expect(pending).toHaveLength(918);
          if (defect === 'request digest drift') pending[806] ^= 1;
          if (defect === 'result digest drift') pending[838] ^= 1;
          if (defect === 'proof digest drift') pending[870] ^= 1;
          let signed = false, submitted = false, sealed = false, extrinsic = '', extrinsicHash = '';
          const blockHash = `0x${'a1'.repeat(32)}`;
          const header = { parentHash: observed.fields.expectedGenesisHashHex, number: '0x1',
            stateRoot: `0x${'a2'.repeat(32)}`, extrinsicsRoot: `0x${'a3'.repeat(32)}`, digest: { logs: [] } };
          const primitive = SigningKey.prototype.sign;
          vi.spyOn(SigningKey.prototype, 'sign').mockImplementation(function (this: SigningKey, hash) {
            const result = primitive.call(this, hash); signed = true; return result;
          });
          const state: Record<string, string | null> = { ...observed.fields.expectedStorage,
            [keys.pendingKeysStorageKeyHex]: `0x04${proof.mintIdentityHex.slice(2)}`,
            [keys.pendingReservationStorageKeyHex]: `0x${pending.toString('hex')}` };
          const account = bytes(operator.nativeFunding.accountInfoScaleHex); account.writeUInt32LE(1, 0);
          state[operator.nativeFunding.storageKeyHex] = `0x${account.toString('hex')}`;
          const genesisRpc = observed.fetcher.getMockImplementation()!;
          observed.fetcher.mockImplementation(async (url, init) => {
            const { method, params } = JSON.parse(init.body as string);
            if (signed && !submitted && defect === 'before transport') source.dispose();
            let result: unknown;
            if (method === 'author_submitExtrinsic') {
              submitted = true; extrinsic = params[0]; extrinsicHash = `0x${digest(bytes(extrinsic)).toString('hex')}`;
              result = extrinsicHash;
              if (defect === 'after submission') observed.dispose();
            } else if (method === 'engine_createBlock') {
              sealed = true; result = { hash: blockHash, aux: { isNewBest: true } };
              if (defect === 'after seal') source.dispose();
            } else if (method === 'author_pendingExtrinsics' && submitted) result = sealed ? [] : [extrinsic];
            else if (sealed && method === 'chain_getBlockHash') result = params[0] === 0 ? observed.fields.expectedGenesisHashHex : blockHash;
            else if (sealed && method === 'chain_getHeader') result = header;
            else if (sealed && method === 'chain_getBlock') result = { block: { header, extrinsics: ['0x1005010028', extrinsic] } };
            else if (sealed && method === 'state_getStorage') result = defect === 'pending drift' && params[0] === keys.pendingReservationStorageKeyHex
              ? '0x04' : state[params[0]] ?? null;
            else return genesisRpc(url, init);
            return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
          });
          const input: Parameters<typeof executeFrontierNativeProofBoundReservationV1>[0] = {
            signing: { operator, sourceSession: source, draft: proofInput.draft, proof, compiled, target, ...observed.fields },
            attemptDirectory: directory, broadcastScope: 'fed-native-local-synthetic-reservation-only',
          };
          if (defect === 'missing scope') (input as any).broadcastScope = undefined;
          if (defect === 'proof clone') (input.signing as any).proof = { ...proof };
          if (defect === 'none') {
            const result = await executeFrontierNativeProofBoundReservationV1(input);
            expect(result).toMatchObject({ blockHashHex: blockHash, blockHeight: 1, extrinsicIndex: 1,
              sourceFinalityEstablished: false, mintAuthorized: false, mintExecuted: false,
              runtimeReservationObserved: true, sourceProofReceiptDigestHex: proof.receiptDigestHex,
              pendingReservationScaleHex: `0x${pending.toString('hex')}` });
          } else await expect(executeFrontierNativeProofBoundReservationV1(input))
            .rejects.toThrow(/scope|provenance|disposed|state differs/);
          const methods = observed.fetcher.mock.calls.map(([, init]) => JSON.parse(init.body as string).method);
          expect(methods.filter(value => value === 'author_submitExtrinsic')).toHaveLength(submitted ? 1 : 0);
          expect(methods.filter(value => value === 'engine_createBlock')).toHaveLength(sealed ? 1 : 0);
          if (['missing scope', 'proof clone', 'before transport'].includes(defect)) expect(submitted).toBe(false);
          if (defect === 'after submission') expect(sealed).toBe(false);
          expect(readdirSync(directory)).toHaveLength(signed ? 1 : 0);
        } finally { disposeFederatedGenesisOperatorV1(operator); rmSync(directory, { recursive: true, force: true }); }
      });
    });

  it.each(['none', 'chain mismatch', 'recipient mismatch', 'missing scope', 'after mint signing', 'after mint submission',
    'after mint sealing', 'consumed statement', 'consumed identity', 'consumed height', 'consumed Ethereum block', 'consumed transaction', 'consumed event'])
    ('composes native reservation and mint from the retained reserve proof with %s', async defect => {
      const operator = mintOperator = createFederatedGenesisOperatorV1();
      if (defect !== 'recipient mismatch') nativeMintRecipient = operator.addressHex;
      await withNativeMintProof(async ({ source, proofInput }) => {
        const observed = reservationTarget(operator);
        const proof = produceNativeMintProof(source, proofInput);
        const keys = derivePooledReserveMintReservationRuntimeStorageKeysV4(proof.mintIdentityHex);
        const digest = (bytes: Uint8Array) => `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}`;
        const raw = (hex: string) => Buffer.from(hex.slice(2), 'hex');
        const pending = encodePooledReserveMintReservationPendingV4ScaleHex({ profileIdHex: proof.runtimeProfileIdHex,
          statementHex: proof.request.statementHex, statementIdHex: proof.mintReservationStatementIdHex, mintIdentityHex: proof.mintIdentityHex,
          sourceStatementBytesDigestHex: digest(raw(proof.request.statementHex)), sourceProofSystemIdHex: proof.request.runtimeProfile.sourceProofSystemIdHex,
          sourceProofProfileIdHex: proof.sourceProofProfileIdHex, sourceProofIssuedAtNativeHeight: proof.result.issuedAtNativeHeight,
          sourceProofRequestDigestHex: proof.requestDigestHex, sourceProofResultIdHex: proof.signatureVerification.resultIdHex,
          sourceProofDigestHex: digest(Buffer.concat([Buffer.from('E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_ENVELOPE_V1', 'ascii'),
            raw(proof.signatureVerification.resultIdHex), raw(proof.signatureVerification.signatureSetDigestHex)])),
          reservedAtNativeHeight: '1', expiresAtNativeHeight: proof.result.expiresAtNativeHeight });
        const state: Record<string, string | null> = { ...observed.fields.expectedStorage,
          [keys.pendingKeysStorageKeyHex]: `0x04${proof.mintIdentityHex.slice(2)}`, [keys.pendingReservationStorageKeyHex]: pending };
        const parent = `0x${'a1'.repeat(32)}`, child = `0x${'a2'.repeat(32)}`, ethParent = `0x${'a3'.repeat(32)}`, ethChild = `0x${'a4'.repeat(32)}`;
        const bridge = `0x${'33'.repeat(20)}`, token = `0x${'44'.repeat(20)}`, recipient = `0x${operator.addressHex}`, amount = 20000000n;
        const abi = new Interface(['function owner() view returns(address)', 'function sergToken() view returns(address)',
          'function paused() view returns(bool)', 'function totalSupply() view returns(uint256)', 'function balanceOf(address) view returns(uint256)',
          'function processedPegIns(bytes32) view returns(bool)', 'function mintSERG(address,uint256,bytes32)',
          'event Transfer(address indexed from,address indexed to,uint256 value)', 'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)']);
        let height = 0, reservationSubmitted = false, mintSubmitted = false, nativeCall = '', mintCall = '', txHash = '', consumed = '';
        const genesisRpc = observed.fetcher.getMockImplementation()!;
        observed.fetcher.mockImplementation(async (url, init) => {
          const { method, params } = JSON.parse(init.body as string);
          let result: unknown;
          if (method === 'author_submitExtrinsic') { reservationSubmitted = true; nativeCall = params[0]; result = digest(raw(nativeCall)); }
          else if (method === 'eth_sendRawTransaction') {
            const tx = Transaction.from(params[0]); expect(tx.chainId).toBe(4242n); expect(tx.nonce).toBe(1);
            expect(tx.from?.toLowerCase()).toBe(recipient);
            expect(tx.data).toBe(abi.encodeFunctionData('mintSERG', [recipient, amount, proof.mintIdentityHex]));
            mintSubmitted = true; txHash = tx.hash!; mintCall = encodeFederatedNativeMintExtrinsicV1Hex(params[0]); result = txHash;
            if (defect === 'after mint submission') source.dispose();
          } else if (method === 'engine_createBlock') {
            expect(params).toEqual([false, false, height === 0 ? observed.fields.expectedGenesisHashHex : parent]);
            height++; result = { hash: height === 1 ? parent : child };
            if (height === 2) {
              const heightBytes = Buffer.alloc(8); heightBytes.writeBigUInt64LE(2n);
              const eventBytes = Buffer.alloc(4); eventBytes.writeUInt32LE(1);
              const bytes = Buffer.concat([Buffer.from([4]), raw(proof.runtimeProfileIdHex), raw(proof.mintReservationStatementIdHex),
                raw(proof.mintIdentityHex), heightBytes, raw(ethChild), raw(txHash), eventBytes]);
              expect(bytes).toHaveLength(173);
              const offsets: Record<string, number> = { 'consumed statement': 33, 'consumed identity': 65, 'consumed height': 97,
                'consumed Ethereum block': 105, 'consumed transaction': 137, 'consumed event': 169 };
              if (Object.hasOwn(offsets, defect)) bytes[offsets[defect]] ^= 1;
              consumed = `0x${bytes.toString('hex')}`;
              if (defect === 'after mint sealing') source.dispose();
            }
          } else if (method === 'author_pendingExtrinsics') result = height === 0 && reservationSubmitted ? [nativeCall]
            : height === 1 && mintSubmitted ? [mintCall] : [];
          else if (height === 0) return genesisRpc(url, init);
          else if (method === 'chain_getBlockHash') result = params[0] === 0 ? observed.fields.expectedGenesisHashHex
            : params[0] === 1 ? parent : height === 1 ? parent : child;
          else if (method === 'chain_getHeader') result = { number: `0x${height}` };
          else if (method === 'chain_getBlock') result = { block: { header: {
            parentHash: params[0] === parent ? observed.fields.expectedGenesisHashHex : parent, number: params[0] === parent ? '0x1' : '0x2',
            stateRoot: `0x${'a5'.repeat(32)}`, extrinsicsRoot: `0x${'a6'.repeat(32)}`, digest: { logs: [] } },
            extrinsics: ['0x1005010028', params[0] === parent ? nativeCall : mintCall] } };
          else if (method === 'state_getStorage') {
            const at = params[1] === parent ? 1 : 2, account = raw(operator.nativeFunding.accountInfoScaleHex); account.writeUInt32LE(at);
            result = params[0] === operator.nativeFunding.storageKeyHex ? `0x${account.toString('hex')}`
              : at === 2 && params[0] === keys.pendingKeysStorageKeyHex ? '0x00'
                : at === 2 && params[0] === keys.pendingReservationStorageKeyHex ? null
                  : at === 2 && params[0] === keys.consumedReservationStorageKeyHex ? consumed : state[params[0]] ?? null;
          } else if (method === 'eth_chainId') result = '0x1092';
          else if (method === 'eth_getBlockByNumber') result = { number: params[0], hash: params[0] === '0x1' ? ethParent : ethChild,
            transactions: params[0] === '0x1' ? [] : [txHash] };
          else if (method === 'eth_getBlockByHash') result = { number: params[0] === ethParent ? '0x1' : '0x2', hash: params[0],
            transactions: params[0] === ethParent ? [] : [txHash] };
          else if (method === 'eth_getTransactionCount') result = params[1].blockHash === ethParent ? '0x1' : '0x2';
          else if (method === 'eth_getCode') result = `0x${'60'.repeat(params[0] === bridge ? 100 : 200)}`;
          else if (method === 'eth_call') {
            const name = abi.parseTransaction({ data: params[0].data })!.name, minted = params[1].blockHash === ethChild;
            result = abi.encodeFunctionResult(name, [name === 'owner' ? params[0].to === bridge ? recipient : bridge
              : name === 'sergToken' ? token : name === 'paused' ? false : name === 'processedPegIns' ? minted : minted ? amount : 0n]);
          } else if (method === 'eth_getTransactionReceipt') result = { transactionHash: txHash, blockHash: ethChild, blockNumber: '0x2',
            transactionIndex: '0x0', status: '0x1', from: recipient, to: bridge,
            logs: [ { address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [`0x${'00'.repeat(20)}`, recipient, amount]) },
              { address: bridge, ...abi.encodeEventLog(abi.getEvent('PegIn')!, [recipient, amount, proof.mintIdentityHex]) } ].map((log, index) => ({ ...log,
              transactionHash: txHash, blockHash: ethChild, blockNumber: '0x2', transactionIndex: '0x0', logIndex: `0x${index}`, removed: false })) };
          else throw new Error(`unexpected composed mint RPC ${method}`);
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
        });
        if (defect === 'chain mismatch') Object.assign(compiled.preparation, { evmChainId: '42' });
        if (defect === 'after mint signing') {
          const original = HDNodeWallet.prototype.signTransaction;
          vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
            const result = await original.call(this, tx); source.dispose(); return result;
          });
        }
        const directory = mkdtempSync(join(tmpdir(), 'bridge-native-composed-mint-'));
        try {
          const input = { signing: { operator, sourceSession: source, draft: proofInput.draft, proof, compiled, target, ...observed.fields },
            attemptDirectory: directory, broadcastScope: 'fed-native-local-synthetic-reservation-and-mint-only' as const };
          if (defect === 'missing scope') (input as any).broadcastScope = 'fed-native-local-synthetic-reservation-only';
          if (defect === 'none') expect(await executeFrontierNativeProofBoundReservationAndMintV1(input)).toMatchObject({
            mintExecuted: true, runtimeReservationConsumed: true, sourceFinalityEstablished: false, trustless: false,
            amountNanoErg: '20000000', recipientAddressHex: recipient, mintIdentityHex: proof.mintIdentityHex,
            transactionHashHex: txHash, consumedReservationScaleHex: consumed });
          else await expect(executeFrontierNativeProofBoundReservationAndMintV1(input)).rejects.toThrow(/scope|differs|disposed/);
          if (['chain mismatch', 'recipient mismatch', 'missing scope'].includes(defect)) expect(reservationSubmitted).toBe(false);
          if (['chain mismatch', 'recipient mismatch', 'missing scope', 'after mint signing'].includes(defect)) expect(mintSubmitted).toBe(false);
          if (defect === 'after mint submission') expect(height).toBe(1);
          if (defect === 'none') expect(readdirSync(directory).sort()).toEqual(['native-mint-attempt.json', 'native-reservation-attempt.json']);
        } finally { rmSync(directory, { recursive: true, force: true }); }
      });
    });

  it.each(['proof clone', 'draft clone', 'session clone', 'compiled clone', 'target clone', 'operator clone',
    'operator identity', 'launch domain', 'genesis JSON', 'runtime profile', 'profile ID',
    'source disposal', 'setup disposal', 'operator disposal', 'extra field', 'accessor', 'symbol',
    'Frontier clone', 'Frontier disposal', 'Frontier genesis', 'Frontier primary', 'Frontier witness',
    'expected genesis', 'runtime code', 'unfunded account'])
    ('rejects native reservation composition with %s', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const operator = createFederatedGenesisOperatorV1();
        const observed = reservationTarget(operator, fault === 'Frontier genesis' ? { genesisJsonSha256Hex: 'fe'.repeat(32) }
          : fault === 'Frontier primary' ? { primaryRpcUrl: 'http://127.0.0.1:19957' }
            : fault === 'Frontier witness' ? { witnessRpcUrl: 'http://127.0.0.1:19958' } : {});
        try {
          const proof = produceNativeMintProof(source, proofInput);
          const changed: any = { operator, sourceSession: source, draft: proofInput.draft, proof, compiled, target,
            ...observed.fields };
          if (fault === 'proof clone') changed.proof = { ...proof };
          if (fault === 'draft clone') changed.draft = { ...proofInput.draft };
          if (fault === 'session clone') changed.sourceSession = { ...source };
          if (fault === 'compiled clone') changed.compiled = { ...compiled };
          if (fault === 'target clone') changed.target = { ...target };
          if (fault === 'operator clone') changed.operator = { ...operator };
          if (fault === 'operator identity') Object.assign(compiled.preparation, { operatorAddressHex: 'fe'.repeat(20) });
          if (fault === 'launch domain') Object.assign(compiled.preparation, { launchDomainHex: 'fe'.repeat(32) });
          if (fault === 'genesis JSON') Object.assign(compiled, { candidate: { ...compiled.candidate, genesisJsonSha256Hex: 'fe'.repeat(32) } });
          if (fault === 'runtime profile') Object.assign(compiled, { candidate: { ...compiled.candidate, runtimeProfileScaleHex: '0xfe' } });
          if (fault === 'profile ID') Object.assign(compiled, { candidate: { ...compiled.candidate, runtimeProfileIdHex: `0x${'fe'.repeat(32)}` } });
          if (fault === 'source disposal') source.dispose();
          if (fault === 'setup disposal') session.dispose();
          if (fault === 'operator disposal') disposeFederatedGenesisOperatorV1(operator);
          if (fault === 'Frontier clone') changed.frontierTarget = { ...changed.frontierTarget };
          if (fault === 'Frontier disposal') observed.dispose();
          if (fault === 'expected genesis') changed.expectedGenesisHashHex = `0x${'fe'.repeat(32)}`;
          if (fault === 'runtime code') changed.expectedStorage['0x3a636f6465'] = '0x0061736d01000001';
          if (fault === 'unfunded account') changed.expectedStorage[operator.nativeFunding.storageKeyHex] = `0x${'00'.repeat(80)}`;
          if (fault === 'extra field') changed.signature = 'supplied';
          if (fault === 'accessor') Object.defineProperty(changed, 'proof', { enumerable: true,
            get() { throw new Error('getter executed'); } });
          if (fault === 'symbol') changed[Symbol('extra')] = true;
          const adapterSign = vi.spyOn(nativeOperator, 'signFederatedGenesisReservationV1');
          const primitiveSign = vi.spyOn(SigningKey.prototype, 'sign');
          await expect(signFrontierNativeProofBoundReservationV1(changed))
            .rejects.toThrow(/provenance|changed|inactive|disposed|custody|differs|own-data/);
          expect(adapterSign).not.toHaveBeenCalled();
          expect(primitiveSign).not.toHaveBeenCalled();
          if (fault.startsWith('Frontier')) expect(observed.fetcher).not.toHaveBeenCalled();
        } finally { disposeFederatedGenesisOperatorV1(operator); }
      });
    });

  it.each(['source', 'setup', 'Frontier'])('withholds native reservation bytes after %s disposal during signing', async fault => {
    await withNativeMintProof(async ({ source, proofInput, post }) => {
      const operator = createFederatedGenesisOperatorV1();
      const observed = reservationTarget(operator);
      try {
        const proof = produceNativeMintProof(source, proofInput);
        const signing = { operator, sourceSession: source, draft: proofInput.draft, proof, compiled, target,
          ...observed.fields };
        const sign = SigningKey.prototype.sign;
        const primitiveSign = vi.spyOn(SigningKey.prototype, 'sign').mockImplementation(function (this: SigningKey, digest) {
          if (fault === 'source') source.dispose(); else if (fault === 'setup') session.dispose(); else observed.dispose();
          return sign.call(this, digest);
        });
        await expect(signFrontierNativeProofBoundReservationV1(signing)).rejects.toThrow(/disposed|provenance/);
        expect(primitiveSign).toHaveBeenCalledTimes(1);
        expect(() => nativeOperator.signFederatedGenesisReservationV1(operator, {
          genesisHashHex: signing.expectedGenesisHashHex, nonce: 0, statementHex: proof.request.statementHex,
          sourceProofEnvelopeScaleHex: proof.sourceProofEnvelopeScaleHex,
        })).toThrow(/consumed/);
        expect(primitiveSign).toHaveBeenCalledTimes(1);
        expect(post).toHaveBeenCalledTimes(2);
      } finally { disposeFederatedGenesisOperatorV1(operator); }
    });
  });

  it.each(['source', 'setup', 'operator', 'Frontier'])
    ('rejects %s disposal during reservation RPC observation before signing', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const operator = createFederatedGenesisOperatorV1();
        const observed = reservationTarget(operator);
        try {
          const proof = produceNativeMintProof(source, proofInput);
          const rpc = observed.fetcher.getMockImplementation()!;
          observed.fetcher.mockImplementationOnce(async (...args) => {
            if (fault === 'source') source.dispose();
            if (fault === 'setup') session.dispose();
            if (fault === 'operator') disposeFederatedGenesisOperatorV1(operator);
            if (fault === 'Frontier') observed.dispose();
            return rpc(...args);
          });
          const adapterSign = vi.spyOn(nativeOperator, 'signFederatedGenesisReservationV1');
          const primitiveSign = vi.spyOn(SigningKey.prototype, 'sign');
          await expect(signFrontierNativeProofBoundReservationV1({ operator, sourceSession: source,
            draft: proofInput.draft, proof, compiled, target, ...observed.fields })).rejects.toThrow(/disposed|provenance|inactive/);
          expect(adapterSign).not.toHaveBeenCalled();
          expect(primitiveSign).not.toHaveBeenCalled();
        } finally { disposeFederatedGenesisOperatorV1(operator); }
      });
    });

  it.each(['draft clone', 'batch clone', 'target clone', 'packet clone', 'observation clone',
    'extra field', 'accessor', 'symbol', 'negative issue', 'unsafe issue', 'expiry overflow', 'empty window', 'long window'])
    ('rejects native mint preflight %s before consuming the evidence', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const changed: any = { ...proofInput, draftInputs: { ...proofInput.draftInputs } };
        if (fault === 'draft clone') changed.draft = { ...proofInput.draft };
        if (fault === 'batch clone') changed.draftInputs.batch = { ...proofInput.draftInputs.batch };
        if (fault === 'target clone') changed.draftInputs.target = { ...target };
        if (fault === 'packet clone') changed.draftInputs.packet = { ...proofInput.draftInputs.packet };
        if (fault === 'observation clone') changed.draftInputs.committedVaultObservation = { ...proofInput.draftInputs.committedVaultObservation };
        if (fault === 'extra field') changed.runtimeProfile = compiled.candidate.runtimeProfile;
        if (fault === 'accessor') Object.defineProperty(changed, 'draft', { enumerable: true, get() { throw new Error('getter executed'); } });
        if (fault === 'symbol') changed[Symbol('extra')] = true;
        if (fault === 'negative issue') changed.issuedAtNativeHeight = '-1';
        if (fault === 'unsafe issue') changed.issuedAtNativeHeight = Number.MAX_SAFE_INTEGER + 1;
        if (fault === 'expiry overflow') changed.expiresAtNativeHeight = '18446744073709551616';
        if (fault === 'empty window') changed.expiresAtNativeHeight = '0';
        if (fault === 'long window') changed.expiresAtNativeHeight = '65';
        expect(() => produceNativeMintProof(source, changed)).toThrow(/provenance|original inputs|exactly|own-data|uint64|profile bounds/);
        const receipt = produceNativeMintProof(source, proofInput);
        assertNativeMintProof(receipt, source, proofInput.draft);
      });
    });

  it.each(['activationHeight', 'profile ID', 'source profile', 'source system', 'checkpoint federation'])
    ('rejects a different retained native %s before signing', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const original = compiled.candidate;
        const originalPreparation = compiled.preparation;
        const profile = { ...original.runtimeProfile };
        if (fault === 'activationHeight') profile.activationHeight = '4';
        if (fault === 'source profile') profile.sourceProofProfileIdHex = `0x${'fe'.repeat(32)}`;
        if (fault === 'source system') profile.sourceProofSystemIdHex = `0x${'fe'.repeat(32)}`;
        Object.assign(compiled, { candidate: { ...original, runtimeProfileScaleHex: encodeRuntimeProfile(profile),
          runtimeProfileIdHex: fault === 'profile ID' ? `0x${'fe'.repeat(32)}` : runtimeProfileId(profile) } });
        if (fault === 'checkpoint federation') Object.assign(compiled, { preparation: {
          checkpointProfile: { ...originalPreparation.checkpointProfile, ergoAdmissionThreshold: 2 } } });
        expect(() => produceNativeMintProof(source, proofInput)).toThrow(/height-zero federation profile/);
        Object.assign(compiled, { candidate: original, preparation: originalPreparation });
        expect(() => produceNativeMintProof(source, proofInput)).not.toThrow();
      });
    });

  it.each(['receipt clone', 'different draft', 'consumed receipt', 'source disposal', 'setup disposal'])
    ('rejects native signing with %s', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const changed = { ...proofInput };
        if (fault === 'receipt clone') changed.evidenceReceipt = { ...proofInput.evidenceReceipt };
        if (fault === 'different draft') changed.draft = buildNativeMintDraft(proofInput.draftInputs);
        if (fault === 'consumed receipt') consumeNativeReserveEvidence(proofInput.evidenceReceipt, proofInput.draft);
        if (fault === 'source disposal') source.dispose();
        if (fault === 'setup disposal') session.dispose();
        expect(() => produceNativeMintProof(source, changed)).toThrow(/provenance|different|consumed|disposed|inactive/);
        expect(() => produceNativeMintProof(source, proofInput)).toThrow(/disposed|inactive/);
      });
    });

  it.each(['receipt clone', 'session clone', 'draft clone', 'genesis replacement', 'setup disposal'])
    ('rejects native proof continuation after %s', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const receipt = produceNativeMintProof(source, proofInput);
        if (fault === 'genesis replacement') Object.assign(compiled, { candidate: { ...compiled.candidate } });
        if (fault === 'setup disposal') session.dispose();
        expect(() => assertNativeMintProof(fault === 'receipt clone' ? { ...receipt } : receipt,
          fault === 'session clone' ? { ...source } : source,
          fault === 'draft clone' ? { ...proofInput.draft } : proofInput.draft)).toThrow(/provenance|changed|inactive/);
      });
    });

  it.each(['signature', 'verification'])('revokes native source custody after %s failure', async fault => {
    await withNativeMintProof(async ({ source, proofInput, post }) => {
      if (fault === 'signature') boundary.failSourceSignature = true;
      else boundary.failSourceVerification = true;
      expect(() => produceNativeMintProof(source, proofInput)).toThrow(/signature failure|signature is invalid/);
      expect(() => readSourceProfiles(source)).toThrow(/disposed/);
      expect(() => produceNativeMintProof(source, proofInput)).toThrow(/disposed/);
      expect(post).toHaveBeenCalledTimes(2);
    });
  });

  it('rejects an unrelated source session without consuming the original native proof capability', async () => {
    await withNativeMintProof(async ({ source, proofInput }) => {
      const other = createSourceSession({ ergoAdmissionThreshold: 1,
        ergoAdmissionPublicKeysHex: [session.signer.publicKeyHex] });
      try {
        expect(() => produceNativeMintProof(other, proofInput)).toThrow(/height-zero federation profile/);
        expect(() => produceNativeMintProof({ ...source }, proofInput)).toThrow(/provenance/);
        expect(() => produceNativeMintProof(source, proofInput)).not.toThrow();
      } finally { other.dispose(); }
    });
  });

  it.each(['packet clone', 'batch clone', 'target clone', 'observation clone', 'disposed'])
    ('rejects native mint draft %s after actual reserve composition', async fault => {
      await withNativeVault(async ({ input, post }) => {
        const reserve = await executeNativeVault(input);
        const joined = { target, batch: input.batch, packet: input.packet,
          committedVaultObservation: reserve.outputObservation };
        if (fault === 'packet clone') joined.packet = { ...input.packet };
        if (fault === 'batch clone') joined.batch = { ...input.batch };
        if (fault === 'target clone') joined.target = { ...target };
        if (fault === 'observation clone') joined.committedVaultObservation = { ...reserve.outputObservation };
        if (fault === 'disposed') session.dispose();
        expect(() => buildNativeMintDraft(joined)).toThrow(/provenance|inactive/);
        expect(post).toHaveBeenCalledTimes(2);
        expect(helpers.ncheck).toHaveBeenCalledTimes(6);
      });
    });

  it.each(['collection', 'consumption'])('revokes native reserve evidence after custody disposal before %s', async stage => {
    await withNativeVault(async ({ input, post }) => {
      const reserve = await executeNativeVault(input);
      const joined = { target, batch: input.batch, packet: input.packet,
        committedVaultObservation: reserve.outputObservation };
      const draft = buildNativeMintDraft(joined);
      const receipt = stage === 'consumption' ? collectNativeReserveEvidence({ ...joined, draft }) : undefined;
      session.dispose();
      expect(() => assertNativeMintDraft(draft)).toThrow(/inactive/);
      expect(() => receipt === undefined ? collectNativeReserveEvidence({ ...joined, draft })
        : consumeNativeReserveEvidence(receipt, draft)).toThrow(/inactive/);
      expect(post).toHaveBeenCalledTimes(2);
      expect(helpers.ncheck).toHaveBeenCalledTimes(6);
    });
  });

  it.each(['draft clone', 'receipt clone', 'different draft'])('rejects %s at native evidence consumption', async fault => {
    await withNativeVault(async ({ input, post }) => {
      const reserve = await executeNativeVault(input);
      const joined = { target, batch: input.batch, packet: input.packet,
        committedVaultObservation: reserve.outputObservation };
      const draft = buildNativeMintDraft(joined);
      const receipt = collectNativeReserveEvidence({ ...joined, draft });
      const selectedDraft = fault === 'draft clone' ? { ...draft }
        : fault === 'different draft' ? buildNativeMintDraft(joined) : draft;
      expect(() => consumeNativeReserveEvidence(fault === 'receipt clone' ? { ...receipt } : receipt,
        selectedDraft)).toThrow(/provenance|different/);
      expect(consumeNativeReserveEvidence(receipt, draft)).toEqual(receipt.evidence);
      expect(post).toHaveBeenCalledTimes(2);
      expect(helpers.ncheck).toHaveBeenCalledTimes(6);
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
