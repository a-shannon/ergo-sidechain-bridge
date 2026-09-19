import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
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
  requests: new WeakMap<object, object>(), active: true, targetActive: true, observe: vi.fn(), build: vi.fn(),
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
import * as feeAuthority from './substrate-federated-isolated-devnet-tracker-fee-funding-authority-v1.js';
import * as checkedTransport from './substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import * as compiledGenesis from './substrate-federated-observed-genesis-v1.js';
import { executeFrontierNativeProofBoundReservationAndMintV1, executeFrontierNativeProofBoundReservationMintAndBurnV1,
  attestFrontierNativeBurnCheckpointV1, assertFrontierNativeBurnCheckpointV1 }
  from './apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.js';
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
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV1 as assertNativeReadCustody,
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
  createSubstrateFederatedNativeGenesisSourceAttestationOperationV1 as createNativeSourceOperation,
  produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1 as produceNativeOperationMintProof,
  produceSubstrateFederatedNativeGenesisCheckpointAttestationV1 as produceNativeCheckpoint,
  assertSubstrateFederatedNativeGenesisCheckpointAttestationV1 as assertNativeCheckpoint,
  assertSubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1Provenance as assertLegacyCheckpoint,
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
  boundary.targetActive = true;
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
    .mockImplementation(value => {
      if (value !== target || !boundary.targetActive) throw new Error('native execution target expired or lacks exact provenance');
      return { processBindingDigestHex: '68'.repeat(32), executionTargetIdentityDigestHex: '69'.repeat(32) };
    });
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

describe('native checker boundary reductions', () => {
  beforeEach(() => {
    // Model the original request's full compiler -> owned-target validation.
    // The real request producer and its await counters have a separate composition.
    boundary.custody = () => {
      const current = owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      if (current.processBindingDigestHex !== '68'.repeat(32)
        || current.executionTargetIdentityDigestHex !== '69'.repeat(32)) {
        throw new Error('native request target binding drifted');
      }
    };
  });

  it('does not duplicate the native runtime entry assertion', async () => {
    const assertions = vi.spyOn(boundary, 'assert');
    let entryCalls = 0;
    boundary.observe.mockImplementationOnce(async () => {
      entryCalls = assertions.mock.calls.length;
      throw new Error('entry observation reached');
    });
    await expect(run(request, mnemonic)).rejects.toThrow('entry observation reached');
    // One synchronous assertion inside the runtime double, then reobservation's entry.
    expect(entryCalls).toBe(2);
    expect(helpers.ngetDirect).not.toHaveBeenCalled();
    expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('uses one complete target traversal when consuming native material', async () => {
    const receipt = await run(request, mnemonic);
    const assertions = vi.spyOn(boundary, 'assert');
    const probe = vi.mocked(owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1);
    probe.mockClear();
    const material = take(receipt, request, target);
    expect(material.request).toBe(request);
    expect(assertions).toHaveBeenCalledExactlyOnceWith(request, target);
    expect(probe).toHaveBeenCalledExactlyOnceWith(target);
    expect(() => take(receipt, request, target)).toThrow(/exact process provenance/);
  });

  it.each(['future', 'expired'] as const)('rejects %s request time before native runtime provenance', async fault => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    (request.target as any).observedAt = new Date(now + (fault === 'future' ? 1 : -60_001)).toISOString();
    const assertions = vi.spyOn(boundary, 'assert');
    const signing = vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates');
    await expect(run(request, mnemonic)).rejects.toThrow(/expired during execution/);
    expect(assertions).not.toHaveBeenCalled();
    expect(boundary.observe).not.toHaveBeenCalled();
    expect(signing).not.toHaveBeenCalled();
    expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it('rejects prior cancellation before request getters or runtime provenance', async () => {
    const cancellation = new AbortController(); cancellation.abort();
    const get = vi.fn((object: object, key: PropertyKey, receiver: unknown) => Reflect.get(object, key, receiver));
    const supplied = new Proxy<typeof request>(request, { get });
    const assertions = vi.spyOn(boundary, 'assert');
    await expect(run(supplied, mnemonic, cancellation.signal)).rejects.toThrow(/session was cancelled/);
    expect(get).not.toHaveBeenCalled(); expect(assertions).not.toHaveBeenCalled();
    expect(boundary.observe).not.toHaveBeenCalled(); expect(helpers.ncheck).not.toHaveBeenCalled();
  });

  it.each(['custody', 'target expiry', 'process digest', 'target digest', 'request copy', 'receipt copy', 'receipt proxy'] as const)(
    'rejects %s before consuming original native material', async fault => {
      const receipt = await run(request, mnemonic);
      const probe = vi.mocked(owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1);
      const original = probe.getMockImplementation()!;
      const receiptGet = vi.fn((object: object, key: PropertyKey, receiver: unknown) => Reflect.get(object, key, receiver));
      const suppliedReceipt = fault === 'receipt copy' ? { ...receipt }
        : fault === 'receipt proxy' ? new Proxy<typeof receipt>(receipt, { get: receiptGet }) : receipt;
      const suppliedRequest = fault === 'request copy' ? { ...request } : request;
      if (fault === 'custody') boundary.active = false;
      else if (fault === 'target expiry') boundary.targetActive = false;
      else if (fault === 'process digest' || fault === 'target digest') {
        const field = fault === 'process digest' ? 'processBindingDigestHex' : 'executionTargetIdentityDigestHex';
        probe.mockImplementation(value => ({ ...original(value), [field]: 'ff'.repeat(32) }));
      }
      expect(() => take(suppliedReceipt, suppliedRequest, target)).toThrow(/provenance|expired|binding drifted/);
      expect(receiptGet).not.toHaveBeenCalled();
      boundary.active = true; boundary.targetActive = true; probe.mockImplementation(original);
      expect(take(receipt, request, target).request).toBe(request);
      expect(() => take(receipt, request, target)).toThrow(/exact process provenance/);
    },
  );

  it.each(['primaryNodeOrigin', 'witnessNodeOrigin', 'primaryMining', 'witnessReadOnly'] as const)(
    'retains the native material %s guard after full request validation', async field => {
      const receipt = await run(request, mnemonic);
      const original = target[field];
      // Keep the process double accepting the original identity to isolate this guard.
      target[field] = typeof original === 'boolean' ? false : 'http://127.0.0.1:9999';
      expect(() => take(receipt, request, target)).toThrow(/execution target differs from its request/);
      target[field] = original;
      expect(take(receipt, request, target).request).toBe(request);
    },
  );

  it('rejects a foreign target before inspecting its origin getter or consuming material', async () => {
    const receipt = await run(request, mnemonic);
    const get = vi.fn(() => target.primaryNodeOrigin);
    const foreign = { ...target, get primaryNodeOrigin() { return get(); } };
    expect(() => take(receipt, request, foreign)).toThrow(/active exact provenance/);
    expect(get).not.toHaveBeenCalled();
    expect(take(receipt, request, target).request).toBe(request);
  });

  it.each([['V2', takeV2], ['V3', takeV3]] as const)('retains direct target validation at the %s material boundary', async (_name, consume) => {
    const receipt = await run(request, mnemonic);
    const assertions = vi.spyOn(boundary, 'assert');
    const probe = vi.mocked(owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1);
    probe.mockClear();
    expect(() => consume(receipt as never, request as never, target)).toThrow(/exact process provenance/);
    expect(probe).toHaveBeenCalledExactlyOnceWith(target);
    expect(assertions).not.toHaveBeenCalled();
    expect(take(receipt, request, target).request).toBe(request);
  });
});

describe('native FED managed setup session', () => {
  let session: Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>>;
  let privateSession: Awaited<ReturnType<typeof execution.createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2>>;
  let compiled: compiledGenesis.ObservedSubstrateFederatedGenesisV1;
  let sessionMnemonic: string;
  let nativeMintRecipient: string;
  let compiledActive: boolean;
  let mintOperator: ReturnType<typeof createFederatedGenesisOperatorV1> | undefined;
  beforeEach(async () => {
    const create = execution.createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2;
    const fromEntropy = Mnemonic.fromEntropy;
    sessionMnemonic = '';
    compiledActive = true;
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
    const validateCompiled: typeof compiledGenesis.validateObservedSubstrateFederatedGenesisV1 = (value, expectedTarget) => {
      if (value !== compiled || expectedTarget !== target || !boundary.active || !compiledActive) throw new Error('native compiled provenance absent');
      boundary.custody!();
      return Object.freeze({ compiled, processBinding: owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(expectedTarget) });
    };
    vi.spyOn(compiledGenesis, 'validateObservedSubstrateFederatedGenesisV1').mockImplementation(validateCompiled);
    vi.spyOn(compiledGenesis, 'assertObservedSubstrateFederatedGenesisV1').mockImplementation((value, expectedTarget) => {
      validateCompiled(value, expectedTarget);
    });
    vi.spyOn(compiledGenesis, 'assertObservedSubstrateFederatedGenesisReadCustodyV1').mockImplementation((value, expectedTarget) => {
      if (value !== compiled || expectedTarget !== target) throw new Error('native compiled read custody absent');
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
    revokePacketProvenance: () => void;
    funding: any;
    onFunding: (callback: (count: number) => void) => void;
    onPost: (callback: () => void) => void;
    onConfirmation: (callback: (count: number) => number) => void;
    onBoxRead: (callback: (id: string, count: number) => void) => void;
    onTip: (callback: (origin: string, count: number) => { height: number; id: string }) => void;
    onHeight: (callback: () => number) => void;
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
    let heightCallback = () => 1020;
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
    vi.spyOn(axios, 'create').mockImplementation(options => ({ get: async (path: string, config?: { responseType?: string }) => {
      if (path === '/info') return { data: { network: 'devnet', fullHeight: heightCallback() } };
      const atHeight = /^\/blocks\/at\/(1000|1020)$/.exec(path);
      if (atHeight && config?.responseType === 'arraybuffer') {
        return { status: 200, data: Buffer.from(JSON.stringify([headerId(Number(atHeight[1]))])) };
      }
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
        const height = Array.from({ length: 23 }, (_, index) => 1000 + index).find(value => headerId(value) === headerMatch[1]);
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
      revokePacketProvenance: () => { fixture.packets.delete(packet); },
      onFunding: callback => { fundingCallback = callback; }, onPost: callback => { postCallback = callback; },
      onConfirmation: callback => { confirmationCount = 0; confirmationCallback = callback; },
      onBoxRead: callback => { boxReadCount = 0; boxReadCallback = callback; },
      onTip: callback => { tipCounts.clear(); tipCallback = callback; },
      onHeight: callback => { heightCallback = callback; } }); }
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
    revokePacketProvenance: () => void;
    onPost: (callback: () => void) => void;
    onConfirmation: (callback: (count: number) => number) => void;
    onBoxRead: (callback: (id: string, count: number) => void) => void;
    onTip: (callback: (origin: string, count: number) => { height: number; id: string }) => void;
    onHeight: (callback: () => number) => void;
  }) => Promise<void>) {
    await withNativeSourceLock(async context => {
      const source = await executeNativeSourceLock(context.input);
      context.onConfirmation(() => 20);
      await runTest({ ...context, input: { ...context.input, sourceLockObservation: source.outputObservation } });
    });
  }

  it('executes native deposit-to-reserve with external fees, exact checked transport and confirmed lineage', async () => {
    await withNativeVault(async ({ input, post }) => {
      const targetProbe = vi.mocked(owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1);
      const beforeRoot = targetProbe.mock.calls.length;
      let afterCheck: number | undefined;
      const checkVault = input.setupSession.checkNativePegInCommittedVaultRetainingSignerV1;
      const promoteVault = execution.promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1;
      const promotion = vi.spyOn(execution, 'promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1')
        .mockImplementation((receipt, currentTarget) => {
          expect(afterCheck).toBeDefined();
          expect(targetProbe.mock.calls.length - afterCheck!).toBe(1);
          return promoteVault(receipt, currentTarget);
        });
      // Only the test session facade measures entry and return. The actual checker
      // and its original receipt/handle are retained through promotion.
      const setupSession = { ...input.setupSession,
        checkNativePegInCommittedVaultRetainingSignerV1: async (...args: Parameters<typeof checkVault>) => {
          // Packet + original observation + the confirmation observer's own check.
          expect(targetProbe.mock.calls.length - beforeRoot).toBe(3);
          const receipt = await checkVault(...args);
          afterCheck = targetProbe.mock.calls.length;
          return receipt;
        } };
      const artifactAssert = vaultAuthority.assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1;
      const scopes: string[] = [];
      vi.spyOn(vaultAuthority, 'assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1')
        .mockImplementation((authorizer, authorization) => {
          artifactAssert(authorizer, authorization);
          scopes.push((authorization.authorizationArtifact as { authorizationScope: string }).authorizationScope);
        });
      const result = await executeNativeVault({ ...input, setupSession });
      expect(promotion).toHaveBeenCalledTimes(1);
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
        tokenRuntimeCodeSha256Hex: runtimeProfile.tokenRuntimeCodeSha256Hex.slice(2), tokenRuntimeCodeBytes: 200,
        sourceRuntimeCodeSha256Hex: '94'.repeat(32), sourceRuntimeCodeBytes: 1000,
        runtimeProfileIdHex: '95'.repeat(32) } },
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

  const nativeCheckpointFields = () => ({ sourceNativeBlockHeight: '4', sourceNativeBlockHashHex: 'a1'.repeat(32),
    executionBlockHashHex: 'a2'.repeat(32), bridgeEventRootHex: 'a3'.repeat(32), burnLeafCount: 1,
    admissionValidFromErgoHeight: '100', admissionExpiresAtErgoHeight: '120' });

  it('attests a native checkpoint from the original source custody and application profile', async () => {
    await withNativeMintProof(async ({ source, proofInput }) => {
      const proof = produceNativeMintProof(source, proofInput);
      const fields = nativeCheckpointFields();
      const receipt = produceNativeCheckpoint(source, { proof, checkpoint: fields });
      assertNativeCheckpoint(receipt, source, proof);
      expect(receipt.checkpointStatement).toMatchObject({ ...fields,
        runtimeProfileIdHex: compiled.preparation.application.runtimeProfileIdHex,
        sourceNetworkIdHex: compiled.preparation.application.sourceNetworkIdHex,
        sidechainIdHex: compiled.preparation.application.sidechainIdHex });
      expect(receipt.checkpointStatement.runtimeProfileIdHex).not.toBe(proof.runtimeProfileIdHex.replace(/^0x/, ''));
      expect(receipt.signatures).toHaveLength(2);
      for (const signature of receipt.signatures) {
        expect(verify(null, Buffer.from(receipt.attestationDigestHex.replace(/^0x/, ''), 'hex'),
          createPublicKey({ key: Buffer.from(`302a300506032b6570032100${signature.signerPublicKeyHex}`, 'hex'),
            format: 'der', type: 'spki' }), Buffer.from(signature.signatureHex, 'hex'))).toBe(true);
      }
      expect(() => assertLegacyCheckpoint(receipt)).toThrow(/provenance/);
      expect(() => assertNativeCheckpoint({ ...receipt }, source, proof)).toThrow(/provenance/);
      expect(() => produceNativeCheckpoint(source, { proof, checkpoint: fields })).toThrow(/consumed/);
      expect(() => source.produceCheckpointAttestation(fields)).toThrow(/launch/);
      source.dispose();
      expect(() => assertNativeCheckpoint(receipt, source, proof)).toThrow(/disposed/);
    });
  });

  async function nativeFeeFixture() {
    const fixture = await nativePegInFixture();
    await session.checkNativePegInSourceLockRetainingSignerV1(fixture.packet, target);
    await session.checkNativePegInCommittedVaultRetainingSignerV1(fixture.packet, target);
    const transactions = await Promise.all(fixture.batch.orderedTransactions.map(item =>
      materializeUnsignedTransaction(item.issuance.unsignedTransactionBody as never, 'native retained fee source')));
    const sourceBoxes = [transactions[0]!.outputs[1]!, transactions[1]!.outputs[1]!] as const;
    const feeHeaders = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
      currentHeight: 1002, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
    }).headers.map(header => header.raw);
    vi.mocked(helpers.ngetDirect).mockImplementation(async (path, origin) => {
      if (![ORIGIN, WITNESS].includes(origin!)) throw new Error('unexpected fee observation origin');
      if (path === '/blocks/lastHeaders/10') return feeHeaders;
      const box = sourceBoxes.find(value => path === `/utxo/byId/${value.boxId}`);
      if (!box) throw new Error(`unexpected native fee observation: ${path}`);
      return structuredClone(box);
    });
    return { ...fixture, sourceBoxes };
  }

  it('native fees retain distinct genesis inputs through original authorization and durable transport claims', async () => {
    const fixture = await nativeFeeFixture();
    const withdrawal = await session.checkNativeWithdrawalFeeFundingV1(target);
    const tracker = await session.checkNativeTrackerFeeFundingV1(target);
    const directory = mkdtempSync(join(tmpdir(), 'native-fee-journal-'));
    const state = new StateTracker(join(directory, 'state.sqlite'));
    try {
      const checks = [tracker, withdrawal] as const;
      const authorize = [feeAuthority.authorizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1,
        feeAuthority.authorizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1] as const;
      const reserve = [feeAuthority.reserveSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1,
        feeAuthority.reserveSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1] as const;
      const transport = [feeAuthority.claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingTransportV1,
        feeAuthority.claimSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingTransportV1] as const;
      expect(tracker.transaction.outputs[0]!.boxId).not.toBe(withdrawal.transaction.outputs[0]!.boxId);
      for (const [index, checked] of checks.entries()) {
        expect(checked.transaction.eip12Tx.inputs[0]!.boxId).toBe(fixture.sourceBoxes[index]!.boxId);
        expect(checked.transaction.outputs[0]!.value).toBe('1100000');
        expect(checked.transaction.outputs[0]!.ergoTree).toBe(session.signer.p2pkErgoTreeHex);
        expect(checked.transaction.outputs.reduce((sum, box) => sum + BigInt(box.value), 0n))
          .toBe(BigInt(fixture.sourceBoxes[index]!.value));
        await expect(authorize[index]!({ ...checked }, target)).rejects.toThrow(/exact provenance/);
        await expect(authorize[index]!(checked, { ...target })).rejects.toThrow(/exact provenance/);
        await expect(authorize[1 - index]!(checked, target)).rejects.toThrow(/exact provenance/);
        const authorization = await authorize[index]!(checked, target);
        expect(authorization.genesisHeaderIdHex).toBe(request.target.genesisHeaderIdHex);
        const attempt = reserve[index]!(authorization, state);
        expect(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId)?.status).toBe('pending');
        const claimed = await transport[index]!(attempt, target);
        expect(claimed.check).toBe(checked);
        await expect(transport[index]!(attempt, target)).rejects.toThrow(/consumed/);
        await expect(authorize[index]!(checked, target)).rejects.toThrow(/exact provenance/);
      }
      execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(fixture.batch, target);
      expect(() => assertSigner(session.signer)).not.toThrow();
    } finally {
      state.close();
      if (!directory.startsWith(join(tmpdir(), 'native-fee-journal-'))) throw new Error('unexpected fee test root');
      rmSync(directory, { recursive: true, force: true });
    }
  });

  describe.each(['withdrawal', 'tracker'] as const)('native %s fee transition', purpose => {
    it.each(['signer-await', 'checker-await'])('revokes custody inside %s before a new signature or check', async stage => {
      await nativeFeeFixture();
      if (purpose === 'tracker') await session.checkNativeWithdrawalFeeFundingV1(target);
      const signatures = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
      const beforeChecks = vi.mocked(helpers.ncheck).mock.calls.length;
      const dispose = () => { expect(() => session.dispose()).toThrow(/running/); };
      if (stage === 'signer-await') {
        const prepare = fleet.prepareLocalWasmRootCheckCandidates;
        vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates').mockImplementationOnce(async input => {
          const pending = prepare(input); dispose(); return pending;
        });
      } else {
        const check = fleet.checkSignedTransaction;
        vi.spyOn(fleet, 'checkSignedTransaction').mockImplementationOnce(async (...args) => {
          const pending = check(...args); dispose(); return pending;
        });
      }
      const runCheck = purpose === 'tracker' ? session.checkNativeTrackerFeeFundingV1 : session.checkNativeWithdrawalFeeFundingV1;
      await expect(runCheck(target)).rejects.toThrow(/inactive|node check failed|invalidated/);
      if (stage === 'signer-await') expect(signatures).not.toHaveBeenCalled();
      expect(helpers.ncheck).toHaveBeenCalledTimes(beforeChecks);
      expect(() => assertSigner(session.signer)).toThrow(/active process provenance/);
    });

    it.each(['target', 'source-primary', 'source-witness', 'late-primary', 'late-witness', 'headers',
      'node-check', 'disposed-primary', 'disposed-witness', 'disposed-headers', 'disposed-signing', 'disposed-check', 'concurrent'])
      ('rejects %s without returning signing authority', async fault => {
        const fixture = await nativeFeeFixture();
        if (purpose === 'tracker') await session.checkNativeWithdrawalFeeFundingV1(target);
        const runCheck = purpose === 'tracker' ? session.checkNativeTrackerFeeFundingV1 : session.checkNativeWithdrawalFeeFundingV1;
        const source = fixture.sourceBoxes[purpose === 'tracker' ? 0 : 1];
        const other = fixture.sourceBoxes[purpose === 'tracker' ? 1 : 0];
        const beforeChecks = vi.mocked(helpers.ncheck).mock.calls.length;
        const get = vi.mocked(helpers.ngetDirect).getMockImplementation()!;
        let injected = false;
        const dispose = () => { injected = true; expect(() => session.dispose()).toThrow(/running/); };
        vi.mocked(helpers.ngetDirect).mockImplementation(async (path, origin) => {
          const boxRead = path === `/utxo/byId/${source.boxId}`;
          const side = origin === WITNESS ? 'witness' : 'primary';
          if (boxRead && (fault === `source-${side}` || (fault === `late-${side}`
            && vi.mocked(helpers.ncheck).mock.calls.length > beforeChecks))) { injected = true; return other; }
          if (!injected && ((boxRead && fault === `disposed-${side}`)
            || (path === '/blocks/lastHeaders/10' && fault === 'disposed-headers'))) dispose();
          if (path === '/blocks/lastHeaders/10' && fault === 'headers') { injected = true; return headers.slice(1); }
          return get(path, origin);
        });
        if (fault === 'node-check') vi.spyOn(fleet, 'checkSignedTransaction').mockImplementationOnce(async () => {
          injected = true; return null;
        });
        if (fault === 'disposed-signing') {
          const prepare = fleet.prepareLocalWasmRootCheckCandidates;
          vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates').mockImplementationOnce(async value => {
            const result = await prepare(value); dispose(); return result;
          });
        }
        if (fault === 'disposed-check') {
          const check = fleet.checkSignedTransaction;
          vi.spyOn(fleet, 'checkSignedTransaction').mockImplementationOnce(async (...args) => {
            const result = await check(...args); dispose(); return result;
          });
        }
        const pending = runCheck(fault === 'target' ? { ...target } : target);
        if (fault === 'concurrent') await expect(runCheck(target)).rejects.toThrow(/continuation/);
        await expect(pending).rejects.toThrow(fault === 'target' ? /target differs|process provenance/
          : fault.includes('source-') || fault.startsWith('late-') ? /live source differs/
            : fault === 'headers' ? /ten signing headers/
              : fault === 'node-check' ? /node check failed/ : /inactive|active process provenance|invalidated/);
        if (!['target', 'concurrent'].includes(fault)) expect(injected).toBe(true);
        expect(() => assertSigner(session.signer)).toThrow(/active process provenance/);
        await expect(runCheck(target)).rejects.toThrow(/continuation/);
      });
  });

  it.each(['tracker-first', 'legacy-withdrawal', 'legacy-tracker', 'tracker-before-fees', 'withdrawal-before-tracker'])
    ('native fee ordering closes custody for %s', async fault => {
      await nativeFeeFixture();
      const operation = fault === 'tracker-first' ? () => session.checkNativeTrackerFeeFundingV1(target)
        : fault === 'legacy-withdrawal' ? () => session.checkWithdrawalFeeFundingV3(target)
          : fault === 'legacy-tracker' ? () => session.checkTrackerFeeFundingV3(target)
            : fault === 'tracker-before-fees' ? () => session.checkNativeFrozenTrackerV2CandidateRetainingWithdrawalSigner({} as never, {} as never)
              : () => session.checkNativeWithdrawalV2({} as never, target);
      const before = vi.mocked(helpers.ncheck).mock.calls.length;
      await expect(operation()).rejects.toThrow(/continuation/);
      expect(helpers.ncheck).toHaveBeenCalledTimes(before);
      expect(() => assertSigner(session.signer)).toThrow(/active process provenance/);
    });

  describe.each(['withdrawal', 'tracker'] as const)('native %s fee custody after checking', purpose => {
    it.each(['authorization-read', 'reservation', 'transport-entry', 'transport-read', 'transport-check', 'transport-checker-await', 'transport-claim-return'])
      ('blocks a new capability after disposal at %s and preserves any durable hold', async stage => {
        await nativeFeeFixture();
        const withdrawal = await session.checkNativeWithdrawalFeeFundingV1(target);
        const checked = purpose === 'withdrawal' ? withdrawal : await session.checkNativeTrackerFeeFundingV1(target);
        const authorize = purpose === 'withdrawal' ? feeAuthority.authorizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1
          : feeAuthority.authorizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1;
        const reserve = purpose === 'withdrawal' ? feeAuthority.reserveSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1
          : feeAuthority.reserveSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1;
        const transport = purpose === 'withdrawal' ? feeAuthority.claimSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingTransportV1
          : feeAuthority.claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingTransportV1;
        const directory = mkdtempSync(join(tmpdir(), 'native-fee-custody-'));
        const state = new StateTracker(join(directory, 'state.sqlite'));
        let disposed = false;
        const dispose = () => { session.dispose(); disposed = true; };
        const disposeAtRead = () => {
          const get = vi.mocked(helpers.ngetDirect).getMockImplementation()!;
          vi.mocked(helpers.ngetDirect).mockImplementationOnce(async (...args) => {
            const value = await get(...args); dispose(); return value;
          });
        };
        try {
          if (stage === 'authorization-read') {
            disposeAtRead();
            await expect(authorize(checked, target)).rejects.toThrow(/inactive/);
            expect(state.getErgoOperationalTransactionAttempt(checked.transaction.txId)).toBeNull();
          } else {
            const authorization = await authorize(checked, target);
            if (stage === 'reservation') {
              dispose();
              expect(() => reserve(authorization, state)).toThrow(/inactive/);
              expect(state.getErgoOperationalTransactionAttempt(checked.transaction.txId)).toBeNull();
            } else {
              const attempt = reserve(authorization, state);
              if (stage === 'transport-entry') dispose();
              else if (stage === 'transport-read') disposeAtRead();
              else if (stage === 'transport-claim-return') {
                const name = purpose === 'withdrawal' ? 'claimSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingTransportV1'
                  : 'claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingTransportV1';
                vi.spyOn(feeAuthority, name).mockImplementationOnce(async (...args: Parameters<typeof transport>) => {
                  const value = await transport(...args); dispose(); return value;
                });
              }
              else {
                const check = fleet.checkSignedTransaction;
                vi.spyOn(fleet, 'checkSignedTransaction').mockImplementationOnce(async (...args) => {
                  if (stage === 'transport-checker-await') { const pending = check(...args); dispose(); return pending; }
                  const value = await check(...args); dispose(); return value;
                });
              }
              const beforeChecks = vi.mocked(helpers.ncheck).mock.calls.length;
              const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('unexpected fee transport'));
              const beforePosts = post.mock.calls.length;
              const submit = purpose === 'withdrawal' ? checkedTransport.submitSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1
                : checkedTransport.submitSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1;
              await expect(stage === 'transport-claim-return' ? submit(target, attempt) : transport(attempt, target))
                .rejects.toThrow(/inactive|node check failed/);
              if (stage === 'transport-checker-await') expect(helpers.ncheck).toHaveBeenCalledTimes(beforeChecks);
              expect(post).toHaveBeenCalledTimes(beforePosts);
              expect(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId)?.status).toBe('pending');
            }
          }
          expect(disposed).toBe(true);
          expect(() => assertSigner(session.signer)).toThrow(/active process provenance/);
        } finally {
          state.close();
          if (!directory.startsWith(join(tmpdir(), 'native-fee-custody-'))) throw new Error('unexpected fee custody test root');
          rmSync(directory, { recursive: true, force: true });
        }
      });
  });

  it.each(['height zero', 'height unsafe', 'native hash', 'execution hash', 'root', 'count zero', 'count above bound',
    'count fractional', 'start negative', 'expiry before start', 'horizon', 'extra', 'symbol', 'accessor',
    'proof clone', 'session clone', 'foreign session', 'source disposal', 'setup disposal', 'signature', 'verification'])
    ('rejects native checkpoint %s at its owning boundary', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const proof = produceNativeMintProof(source, proofInput), checkpoint: any = nativeCheckpointFields();
        const input: any = { proof, checkpoint };
        const other = createSourceSession({ ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [session.signer.publicKeyHex] });
        try {
          if (fault === 'height zero') checkpoint.sourceNativeBlockHeight = '0';
          if (fault === 'height unsafe') checkpoint.sourceNativeBlockHeight = Number.MAX_SAFE_INTEGER + 1;
          if (fault === 'native hash') checkpoint.sourceNativeBlockHashHex = 'aa';
          if (fault === 'execution hash') checkpoint.executionBlockHashHex = 'aa';
          if (fault === 'root') checkpoint.bridgeEventRootHex = 'aa';
          if (fault === 'count zero') checkpoint.burnLeafCount = 0;
          if (fault === 'count above bound') checkpoint.burnLeafCount = 257;
          if (fault === 'count fractional') checkpoint.burnLeafCount = 1.5;
          if (fault === 'start negative') checkpoint.admissionValidFromErgoHeight = '-1';
          if (fault === 'expiry before start') checkpoint.admissionExpiresAtErgoHeight = '99';
          if (fault === 'horizon') checkpoint.admissionExpiresAtErgoHeight = '100000';
          if (fault === 'extra') checkpoint.extra = true;
          if (fault === 'symbol') checkpoint[Symbol('extra')] = true;
          if (fault === 'accessor') Object.defineProperty(checkpoint, 'burnLeafCount', { enumerable: true, get: () => 1 });
          if (fault === 'proof clone') input.proof = { ...proof };
          if (fault === 'source disposal') source.dispose();
          if (fault === 'setup disposal') session.dispose();
          if (fault === 'signature') boundary.failSourceSignature = true;
          if (fault === 'verification') boundary.failSourceVerification = true;
          expect(() => produceNativeCheckpoint(fault === 'session clone' ? { ...source } : fault === 'foreign session' ? other : source,
            input)).toThrow(/native checkpoint|burn leaf count|uint|admission|exactly|provenance|disposed|inactive|signature/i);
          boundary.failSourceSignature = false; boundary.failSourceVerification = false;
          if (['source disposal', 'setup disposal', 'signature', 'verification'].includes(fault)) {
            expect(() => produceNativeCheckpoint(source, { proof, checkpoint: nativeCheckpointFields() })).toThrow(/disposed|inactive/);
          } else {
            expect(() => produceNativeCheckpoint(source, { proof, checkpoint: nativeCheckpointFields() })).not.toThrow();
          }
        } finally { other.dispose(); }
      });
    });

  it.each(['input inspection', 'field inspection', 'input disposal', 'field disposal'])
    ('closes native checkpoint reentrancy at %s', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const proof = produceNativeMintProof(source, proofInput), normal = { proof, checkpoint: nativeCheckpointFields() };
        let triggered = false, winning: ReturnType<typeof produceNativeCheckpoint> | undefined;
        const handler = { ownKeys<T extends object>(object: T) {
          if (!triggered) {
            triggered = true;
            if (fault.endsWith('disposal')) source.dispose();
            else winning = produceNativeCheckpoint(source, normal);
          }
          return Reflect.ownKeys(object);
        } };
        const input = fault.startsWith('input') ? new Proxy<typeof normal>({ ...normal }, handler)
          : { proof, checkpoint: new Proxy<typeof normal.checkpoint>({ ...normal.checkpoint }, handler) };
        expect(() => produceNativeCheckpoint(source, input)).toThrow(/consumed|disposed/);
        expect(triggered).toBe(true);
        if (winning) expect(() => assertNativeCheckpoint(winning, source, proof)).not.toThrow();
      });
    });

  it('produces the native height-zero proof from the composed confirmed reserve and retained federation', async () => {
    await withNativeMintProof(async ({ source, proofInput, post }) => {
      const receipt = produceNativeMintProof(source, proofInput);
      const targetProbe = vi.mocked(owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1);
      const before = targetProbe.mock.calls.length;
      assertNativeMintProof(receipt, source, proofInput.draft);
      expect(targetProbe.mock.calls.length - before).toBe(2);
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

  it('retains native packet read custody without replacing full target validation', async () => {
    const { batch, packet, packets, input } = await nativePegInFixture();
    await buildNativePegIn(input);
    expect(assertNativeReadCustody(packet, batch, target)).toBe(packet);
    expect(() => assertNativeReadCustody({ ...packet }, batch, target)).toThrow(/read custody/);
    expect(() => assertNativeReadCustody(packet, { ...batch }, target)).toThrow(/read custody/);
    expect(() => assertNativeReadCustody(packet, batch, { ...target })).toThrow(/read custody/);
    boundary.active = false;
    expect(assertNativeReadCustody(packet, batch, target)).toBe(packet);
    expect(() => assertNativePegIn(packet, batch, target)).toThrow();
    boundary.active = true;
    packets.delete(packet);
    expect(() => assertNativeReadCustody(packet, batch, target)).toThrow(/deposit provenance/);
    packets.add(packet);
    session.dispose();
    expect(() => assertNativeReadCustody(packet, batch, target)).toThrow(/inactive/);
  });

  it('does not replace compiled custody with a native batch status', async () => {
    const { batch, packet, input } = await nativePegInFixture();
    await buildNativePegIn(input);
    boundary.custody = () => { throw new Error('retained signer revoked'); };
    expect(() => assertNativeReadCustody(packet, batch, target)).toThrow('retained signer revoked');
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
    'after mint sealing', 'consumed statement', 'consumed identity', 'consumed height', 'consumed Ethereum block', 'consumed transaction', 'consumed event',
    'full burn', 'burn scope', 'burn amount', 'burn amount low', 'burn recipient', 'burn recipient curve',
    'after approval submission', 'after burn signing', 'checkpoint', 'checkpoint clone', 'checkpoint source disposal',
    'checkpoint setup disposal', 'checkpoint operator disposal', 'checkpoint frontier disposal', 'checkpoint runtime mismatch',
    'checkpoint during storage disposal', 'checkpoint concurrent', 'checkpoint operation', 'checkpoint operation disposal',
    'checkpoint operation during storage disposal'])
    ('composes native reservation and mint from the retained reserve proof with %s', async defect => {
      const operator = mintOperator = createFederatedGenesisOperatorV1();
      if (defect !== 'recipient mismatch') nativeMintRecipient = operator.addressHex;
      await withNativeMintProof(async ({ source, proofInput }) => {
        const observed = reservationTarget(operator);
        const operation = defect.startsWith('checkpoint operation') ? createNativeSourceOperation(source) : undefined;
        const proof = operation ? produceNativeOperationMintProof(operation, proofInput) : produceNativeMintProof(source, proofInput);
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
        const nativeBlocks = [observed.fields.expectedGenesisHashHex, parent, child, `0x${'b3'.repeat(32)}`, `0x${'b4'.repeat(32)}`];
        const ethBlocks = ['', ethParent, ethChild, `0x${'c3'.repeat(32)}`, `0x${'c4'.repeat(32)}`];
        const nativeCalls: string[] = [], txHashes: string[] = [];
        const ergoRecipient = `0x0008cd${new SigningKey(`0x${'01'.repeat(32)}`).compressedPublicKey.slice(2)}`;
        const burnPreflightCase = ['burn scope', 'burn amount', 'burn amount low', 'burn recipient', 'burn recipient curve'].includes(defect);
        const checkpointCase = defect.startsWith('checkpoint');
        const burnCase = checkpointCase || burnPreflightCase || ['full burn', 'after approval submission', 'after burn signing'].includes(defect);
        const bridge = `0x${'33'.repeat(20)}`, token = `0x${'44'.repeat(20)}`, recipient = `0x${operator.addressHex}`, amount = 20000000n;
        const abi = new Interface(['function owner() view returns(address)', 'function sergToken() view returns(address)',
          'function paused() view returns(bool)', 'function totalSupply() view returns(uint256)', 'function balanceOf(address) view returns(uint256)',
          'function processedPegIns(bytes32) view returns(bool)', 'function mintSERG(address,uint256,bytes32)',
          'function approve(address,uint256)', 'function pegOut(uint256,bytes)', 'function allowance(address,address) view returns(uint256)',
          'function accumulatedFees() view returns(uint256)', 'event Approval(address indexed owner,address indexed spender,uint256 value)',
          'event PegOut(address indexed from,uint256 amount,bytes ergoRecipientPubKey)',
          'event Transfer(address indexed from,address indexed to,uint256 value)', 'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)']);
        let height = 0, reservationSubmitted = false, mintSubmitted = false, nativeCall = '', mintCall = '', txHash = '', consumed = '';
        let checkpointCollection = false;
        const commitmentKey = '0xaf86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5';
        const leavesKey = '0xaf86fef4216ac2bcd1c592b204011ad08ba92642ec2dee14a0170da020901c7f';
        const eventsKey = '0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7';
        const nativeCommitmentStorage = (): Record<string, string> => {
          const le = (value: bigint, size: number) => { const result = Buffer.alloc(size); result.writeBigUInt64LE(value); return result; };
          const compact = (size: number) => size < 64 ? Buffer.from([size * 4]) : Buffer.from([(size * 4 + 1) & 255, (size * 4 + 1) >>> 8]);
          const sidechain = raw(`0x${compiled.preparation.application.sidechainIdHex}`), eventIndex = Buffer.from('00000002', 'hex');
          const burnId = raw(digest(Buffer.concat([Buffer.from('E2S_TRUSTLESS_BURN_ID_V1'), sidechain, raw(txHashes[4]), eventIndex])));
          const leaf = Buffer.concat([Buffer.from([1]), sidechain, raw(ethBlocks[4]), burnId, raw(txHashes[4]), eventIndex,
            raw(digest(raw(ergoRecipient))), Buffer.from('0000000000989680', 'hex'), Buffer.alloc(32)]);
          const root = raw(digest(Buffer.concat([Buffer.from('E2S_TRUSTLESS_BURN_LEAF_V1'), leaf])));
          const commitment = Buffer.concat([Buffer.from([1]), sidechain, le(4n, 8), raw(ethBlocks[4]), root, Buffer.from('01000000', 'hex')]);
          if (defect === 'checkpoint runtime mismatch') raw(nativeBlocks[0]).copy(commitment, 1);
          const apply = (index: number) => Buffer.from([0, index, 0, 0, 0]);
          const event = (phase: Buffer, pallet: number, variant: number, ...fields: Buffer[]) =>
            Buffer.concat([phase, Buffer.from([pallet, variant]), ...fields, Buffer.from([0])]);
          const operatorBytes = raw(recipient), phase = apply(1);
          const records = [event(apply(0), 0, 0, Buffer.from([0, 0, 2, 0])),
            event(phase, 4, 8, operatorBytes, le(7_119_140_625_000_000n, 16)),
            event(phase, 4, 7, operatorBytes, le(7_000_000_000_000_000n, 16)),
            event(phase, 4, 7, Buffer.alloc(20), le(0n, 16))];
          const logs = [ { address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [recipient, `0x${'00'.repeat(20)}`, 10000000n]) },
            { address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [recipient, bridge, 5000000n]) },
            { address: bridge, ...abi.encodeEventLog(abi.getEvent('PegOut')!, [recipient, 10000000n, ergoRecipient]) } ];
          for (const log of logs) records.push(event(phase, 8, 0, raw(log.address), compact(log.topics.length),
            ...log.topics.map(raw), compact(raw(log.data).length), raw(log.data)));
          records.push(event(phase, 7, 0, operatorBytes, raw(bridge), raw(txHashes[4]), Buffer.from([0, 0, 0])),
            event(phase, 0, 0, Buffer.from([0, 0, 0, 1])),
            event(Buffer.from([1]), 12, 1, Buffer.from([1]), raw(ethBlocks[4]), root, Buffer.from('01000000', 'hex')));
          return { [commitmentKey]: `0x${commitment.toString('hex')}`, [leavesKey]: `0x04${root.toString('hex')}`,
            [eventsKey]: `0x${Buffer.concat([compact(records.length), ...records]).toString('hex')}` };
        };
        const genesisRpc = observed.fetcher.getMockImplementation()!;
        observed.fetcher.mockImplementation(async (url, init) => {
          const { method, params } = JSON.parse(init.body as string);
          let result: unknown;
          if (method === 'author_submitExtrinsic') { reservationSubmitted = true; nativeCall = params[0]; result = digest(raw(nativeCall)); }
          else if (method === 'eth_sendRawTransaction') {
            const tx = Transaction.from(params[0]); expect(tx.chainId).toBe(4242n); expect(tx.nonce).toBe(height);
            expect(tx.from?.toLowerCase()).toBe(recipient);
            if (height === 1) {
              expect(tx.data).toBe(abi.encodeFunctionData('mintSERG', [recipient, amount, proof.mintIdentityHex]));
              mintSubmitted = true; txHash = tx.hash!; mintCall = encodeFederatedNativeMintExtrinsicV1Hex(params[0]);
            } else expect(tx.data).toBe(height === 2 ? abi.encodeFunctionData('approve', [bridge, 15000000n])
              : abi.encodeFunctionData('pegOut', [15000000n, ergoRecipient]));
            nativeCalls[height + 1] = encodeFederatedNativeMintExtrinsicV1Hex(params[0]); txHashes[height + 1] = tx.hash!;
            result = tx.hash!;
            if (defect === 'after mint submission') source.dispose();
            if (height === 2 && defect === 'after approval submission') source.dispose();
          } else if (method === 'engine_createBlock') {
            expect(params).toEqual([false, false, nativeBlocks[height]]);
            height++; result = { hash: nativeBlocks[height] };
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
            : height === 1 && mintSubmitted ? [mintCall] : nativeCalls[height + 1] ? [nativeCalls[height + 1]] : [];
          else if (height === 0) return genesisRpc(url, init);
          else if (method === 'chain_getBlockHash') result = nativeBlocks[params.length === 0 ? height : params[0]];
          else if (method === 'chain_getHeader') result = { number: `0x${height}` };
          else if (method === 'chain_getBlock') result = { block: { header: {
            parentHash: nativeBlocks[nativeBlocks.indexOf(params[0]) - 1], number: `0x${nativeBlocks.indexOf(params[0])}`,
            stateRoot: `0x${'a5'.repeat(32)}`, extrinsicsRoot: `0x${'a6'.repeat(32)}`, digest: { logs: [] } },
            extrinsics: ['0x1005010028', params[0] === parent ? nativeCall : nativeCalls[nativeBlocks.indexOf(params[0])]] } };
          else if (method === 'state_getStorage') {
            const at = nativeBlocks.indexOf(params[1]), account = raw(operator.nativeFunding.accountInfoScaleHex); account.writeUInt32LE(at);
            if (checkpointCollection && defect === 'checkpoint during storage disposal' && params[0] === commitmentKey) source.dispose();
            if (checkpointCollection && defect === 'checkpoint operation during storage disposal' && params[0] === commitmentKey) operation!.dispose();
            result = at === 4 && [commitmentKey, leavesKey, eventsKey].includes(params[0]) ? nativeCommitmentStorage()[params[0]]
              : params[0] === operator.nativeFunding.storageKeyHex ? `0x${account.toString('hex')}`
              : at >= 2 && params[0] === keys.pendingKeysStorageKeyHex ? '0x00'
                : at >= 2 && params[0] === keys.pendingReservationStorageKeyHex ? null
                  : at >= 2 && params[0] === keys.consumedReservationStorageKeyHex ? consumed : state[params[0]] ?? null;
          } else if (method === 'eth_chainId') result = '0x1092';
          else if (method === 'eth_getBlockByNumber') result = { number: params[0], hash: ethBlocks[Number(params[0])],
            parentHash: ethBlocks[Number(params[0]) - 1], baseFeePerGas: '0x3b9aca00',
            transactions: params[0] === '0x1' ? [] : [txHashes[Number(params[0])]] };
          else if (method === 'eth_getBlockByHash') result = { number: `0x${ethBlocks.indexOf(params[0])}`, hash: params[0],
            transactions: params[0] === ethParent ? [] : [txHashes[ethBlocks.indexOf(params[0])]] };
          else if (method === 'eth_getTransactionCount') result = `0x${ethBlocks.indexOf(params[1].blockHash)}`;
          else if (method === 'eth_getCode') result = `0x${'60'.repeat(params[0] === bridge ? 100 : 200)}`;
          else if (method === 'eth_call') {
            const call = abi.parseTransaction({ data: params[0].data })!, name = call.name;
            const at = ethBlocks.indexOf(params[1].blockHash), minted = at >= 2;
            result = abi.encodeFunctionResult(name, [name === 'owner' ? params[0].to === bridge ? recipient : bridge
              : name === 'sergToken' ? token : name === 'paused' ? false : name === 'processedPegIns' ? minted
                : name === 'allowance' ? at === 2 ? 0n : at === 3 ? 15000000n : 10000000n
                  : name === 'accumulatedFees' ? at === 4 ? 5000000n : 0n
                    : name === 'balanceOf' && call.args[0].toLowerCase() === bridge ? at === 4 ? 5000000n : 0n
                      : at === 4 ? name === 'totalSupply' ? 10000000n : 5000000n : minted ? amount : 0n]);
          } else if (method === 'eth_getTransactionReceipt' && params[0] !== txHash) {
            const at = txHashes.indexOf(params[0]);
            const logs = at === 3 ? [{ address: token, ...abi.encodeEventLog(abi.getEvent('Approval')!, [recipient, bridge, 15000000n]) }]
              : [{ address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [recipient, `0x${'00'.repeat(20)}`, 10000000n]) },
              { address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [recipient, bridge, 5000000n]) },
              { address: bridge, ...abi.encodeEventLog(abi.getEvent('PegOut')!, [recipient, 10000000n, ergoRecipient]) }];
            result = { transactionHash: params[0], blockHash: ethBlocks[at], blockNumber: `0x${at}`, transactionIndex: '0x0', status: '0x1',
              from: recipient, to: at === 3 ? token : bridge, logs: logs.map((log, index) => ({ ...log, transactionHash: params[0],
                blockHash: ethBlocks[at], blockNumber: `0x${at}`, transactionIndex: '0x0', logIndex: `0x${index}`, removed: false })) };
          } else if (method === 'eth_getTransactionReceipt') result = { transactionHash: txHash, blockHash: ethChild, blockNumber: '0x2',
            transactionIndex: '0x0', status: '0x1', from: recipient, to: bridge,
            logs: [ { address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [`0x${'00'.repeat(20)}`, recipient, amount]) },
              { address: bridge, ...abi.encodeEventLog(abi.getEvent('PegIn')!, [recipient, amount, proof.mintIdentityHex]) } ].map((log, index) => ({ ...log,
              transactionHash: txHash, blockHash: ethChild, blockNumber: '0x2', transactionIndex: '0x0', logIndex: `0x${index}`, removed: false })) };
          else throw new Error(`unexpected composed mint RPC ${method}`);
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
        });
        if (defect === 'chain mismatch') Object.assign(compiled.preparation, { evmChainId: '42' });
        if (defect === 'after mint signing' || defect === 'after burn signing') {
          const original = HDNodeWallet.prototype.signTransaction;
          vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
            const result = await original.call(this, tx);
            if (defect === 'after mint signing' || tx.nonce === 3) source.dispose();
            return result;
          });
        }
        const directory = mkdtempSync(join(tmpdir(), 'bridge-native-composed-mint-'));
        try {
          const input = { signing: { operator, ...(operation ? { sourceOperation: operation } : { sourceSession: source }),
            draft: proofInput.draft, proof, compiled, target, ...observed.fields },
            attemptDirectory: directory, broadcastScope: 'fed-native-local-synthetic-reservation-and-mint-only' as const };
          if (defect === 'missing scope') (input as any).broadcastScope = 'fed-native-local-synthetic-reservation-only';
          if (burnCase) {
            const full = { ...input, broadcastScope: 'fed-native-local-synthetic-reservation-mint-and-burn-only' as const,
              grossAmountNanoErg: '15000000', recipientErgoTreeHex: ergoRecipient };
            if (defect === 'burn scope') (full as any).broadcastScope = input.broadcastScope;
            if (defect === 'burn amount') full.grossAmountNanoErg = '20000001';
            if (defect === 'burn amount low') full.grossAmountNanoErg = '14999999';
            if (defect === 'burn recipient') full.recipientErgoTreeHex = '0x00';
            if (defect === 'burn recipient curve') full.recipientErgoTreeHex = `0x0008cd02${'ff'.repeat(32)}`;
            const signProbe = burnPreflightCase ? vi.spyOn(HDNodeWallet.prototype, 'signTransaction') : undefined;
            const nativeSignProbe = burnPreflightCase ? vi.spyOn(SigningKey.prototype, 'sign') : undefined;
            if (defect === 'full burn' || checkpointCase) {
              const executionResult = await executeFrontierNativeProofBoundReservationMintAndBurnV1(full);
              expect(executionResult).toMatchObject({
                mint: { mintExecuted: true, runtimeReservationConsumed: true }, burn: { phase: 'burn', blockHeight: 4, eventIndex: 2,
                  transactionHashHex: txHashes[4], netAmountNanoErg: '10000000', recipientErgoTreeHex: ergoRecipient },
                burnExecuted: true, checkpointAttested: false, ergoPayoutExecuted: false, trustless: false });
              expect(readdirSync(directory).sort()).toEqual(['native-approve-attempt.json', 'native-burn-attempt.json',
                'native-mint-attempt.json', 'native-reservation-attempt.json']);
              expect(height).toBe(4);
              if (checkpointCase) {
                checkpointCollection = true;
                const checkpointInput = { execution: executionResult, admissionValidFromErgoHeight: '100', admissionExpiresAtErgoHeight: '120' };
                if (defect === 'checkpoint clone') checkpointInput.execution = { ...executionResult };
                if (defect === 'checkpoint source disposal') source.dispose();
                if (defect === 'checkpoint operation disposal') operation!.dispose();
                if (defect === 'checkpoint setup disposal') session.dispose();
                if (defect === 'checkpoint operator disposal') disposeFederatedGenesisOperatorV1(operator);
                if (defect === 'checkpoint frontier disposal') observed.dispose();
                if (defect === 'checkpoint' || defect === 'checkpoint concurrent' || defect === 'checkpoint operation') {
                  const pending = attestFrontierNativeBurnCheckpointV1(checkpointInput);
                  if (defect === 'checkpoint concurrent') await expect(attestFrontierNativeBurnCheckpointV1(checkpointInput)).rejects.toThrow(/consumed/);
                  const result = await pending;
                  assertFrontierNativeBurnCheckpointV1(result);
                  expect(result.attestation.checkpointStatement).toMatchObject({ sourceNativeBlockHeight: '4',
                    sourceNativeBlockHashHex: nativeBlocks[4].slice(2), executionBlockHashHex: ethBlocks[4].slice(2),
                    bridgeEventRootHex: result.commitment.bridgeEventRootHex.slice(2), burnLeafCount: 1,
                    runtimeProfileIdHex: compiled.preparation.application.runtimeProfileIdHex });
                  expect(result.commitment.burnEvent.eventIndex).toBe(2);
                  expect(result.commitment.burnProof.leafIndex).toBe(0);
                  expect(result.checkpointAttested).toBe(true);
                  expect(result.ergoPayoutExecuted).toBe(false);
                  expect(() => assertFrontierNativeBurnCheckpointV1({ ...result })).toThrow(/provenance/);
                  await expect(attestFrontierNativeBurnCheckpointV1(checkpointInput)).rejects.toThrow(/consumed/);
                  if (operation) operation.dispose();
                  else source.dispose();
                  expect(() => assertFrontierNativeBurnCheckpointV1(result)).toThrow(/disposed/);
                } else await expect(attestFrontierNativeBurnCheckpointV1(checkpointInput)).rejects.toThrow(/provenance|disposed|inactive|commitment/);
              }
            } else await expect(executeFrontierNativeProofBoundReservationMintAndBurnV1(full)).rejects.toThrow(/scope|differs|disposed/);
            if (burnPreflightCase) {
              expect(height).toBe(0); expect(reservationSubmitted).toBe(false); expect(mintSubmitted).toBe(false);
              expect(signProbe).not.toHaveBeenCalled(); expect(nativeSignProbe).not.toHaveBeenCalled(); expect(readdirSync(directory)).toEqual([]);
              const methods = observed.fetcher.mock.calls.map(([, init]) => JSON.parse(init.body as string).method);
              expect(methods).not.toContain('author_submitExtrinsic'); expect(methods).not.toContain('eth_sendRawTransaction');
              expect(methods).not.toContain('engine_createBlock');
            }
            if (defect === 'after approval submission') expect(height).toBe(2);
            if (defect === 'after burn signing') expect(height).toBe(3);
          } else if (defect === 'none') expect(await executeFrontierNativeProofBoundReservationAndMintV1(input)).toMatchObject({
            mintExecuted: true, runtimeReservationConsumed: true, sourceFinalityEstablished: false, trustless: false,
            amountNanoErg: '20000000', recipientAddressHex: recipient, mintIdentityHex: proof.mintIdentityHex,
            transactionHashHex: txHash, consumedReservationScaleHex: consumed });
          else await expect(executeFrontierNativeProofBoundReservationAndMintV1(input)).rejects.toThrow(/scope|differs|disposed/);
          if (['chain mismatch', 'recipient mismatch', 'missing scope'].includes(defect)) expect(reservationSubmitted).toBe(false);
          if (['chain mismatch', 'recipient mismatch', 'missing scope', 'after mint signing'].includes(defect)) expect(mintSubmitted).toBe(false);
          if (defect === 'after mint submission') expect(height).toBe(1);
          if (defect === 'none') expect(readdirSync(directory).sort()).toEqual(['native-mint-attempt.json', 'native-reservation-attempt.json']);
        } finally { operation?.dispose(); rmSync(directory, { recursive: true, force: true }); }
      });
    });

  it.each(['clone', 'foreign operation', 'disposed operation', 'disposed parent', 'legacy authority', 'both authorities', 'accessor'])
    ('rejects operation-scoped native signing with %s before RPC or signing', async fault => {
      await withNativeMintProof(async ({ source, proofInput }) => {
        const operator = createFederatedGenesisOperatorV1();
        const observed = reservationTarget(operator);
        const operation = createNativeSourceOperation(source);
        let foreign: ReturnType<typeof createSourceSession> | undefined;
        try {
          const proof = produceNativeOperationMintProof(operation, proofInput);
          const changed: any = { operator, sourceOperation: operation, draft: proofInput.draft, proof, compiled, target,
            ...observed.fields };
          const getter = vi.fn(() => operation);
          if (fault === 'clone') changed.sourceOperation = { ...operation };
          if (fault === 'foreign operation') {
            foreign = createSourceSession({ ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [session.signer.publicKeyHex] });
            changed.sourceOperation = createNativeSourceOperation(foreign);
          }
          if (fault === 'disposed operation') operation.dispose();
          if (fault === 'disposed parent') source.dispose();
          if (fault === 'legacy authority') { delete changed.sourceOperation; changed.sourceSession = source; }
          if (fault === 'both authorities') changed.sourceSession = source;
          if (fault === 'accessor') Object.defineProperty(changed, 'sourceOperation', { enumerable: true, get: getter });
          const sign = vi.spyOn(SigningKey.prototype, 'sign');
          await expect(signFrontierNativeProofBoundReservationV1(changed)).rejects.toThrow(/provenance|operation|disposed|own-data/);
          expect(sign).not.toHaveBeenCalled(); expect(observed.fetcher).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled();
        } finally { operation.dispose(); foreign?.dispose(); disposeFederatedGenesisOperatorV1(operator); }
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
        if (fault === 'checkpoint federation') Object.assign(compiled, { preparation: { ...originalPreparation,
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

  it.each(['packet clone', 'batch clone', 'target clone', 'observation clone', 'packet revoked', 'disposed'])
    ('rejects native mint draft %s after actual reserve composition', async fault => {
      await withNativeVault(async ({ input, post, revokePacketProvenance }) => {
        const reserve = await executeNativeVault(input);
        const joined = { target, batch: input.batch, packet: input.packet,
          committedVaultObservation: reserve.outputObservation };
        const originalDraft = fault === 'packet revoked' || fault === 'disposed' ? buildNativeMintDraft(joined) : undefined;
        if (fault === 'packet clone') joined.packet = { ...input.packet };
        if (fault === 'batch clone') joined.batch = { ...input.batch };
        if (fault === 'target clone') joined.target = { ...target };
        if (fault === 'observation clone') joined.committedVaultObservation = { ...reserve.outputObservation };
        if (fault === 'packet revoked') revokePacketProvenance();
        if (fault === 'disposed') session.dispose();
        await Promise.resolve();
        expect(() => buildNativeMintDraft(joined)).toThrow(/provenance|inactive/);
        if (originalDraft !== undefined) expect(() => assertNativeMintDraft(originalDraft)).toThrow(/provenance|inactive/);
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

  it('rejects revoked native packet custody before inspecting a forged source observation getter', async () => {
    await withNativeVault(async ({ input, post }) => {
      const observation = { ...input.sourceLockObservation };
      const getter = vi.fn(() => input.sourceLockObservation.observationDigestHex);
      Object.defineProperty(observation, 'observationDigestHex', { enumerable: true, get: getter });
      session.dispose();
      await expect(executeNativeVault({ ...input, sourceLockObservation: observation })).rejects.toThrow(/inactive/);
      expect(getter).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledTimes(1);
      expect(helpers.ncheck).toHaveBeenCalledTimes(4);
    });
  });

  it.each(['process binding', 'target binding', 'target expiry', 'compiler custody', 'setup custody', 'source custody'] as const)(
    'vetoes native reserve %s after the original check returns and before promotion', async fault => {
      const source = retainNativeBindingSource(fault);
      try {
        await withNativeVault(async ({ input, post }) => {
          const checkVault = input.setupSession.checkNativePegInCommittedVaultRetainingSignerV1;
          const promotion = vi.spyOn(execution, 'promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1');
          let expected: RegExp | undefined;
          const setupSession = { ...input.setupSession,
            checkNativePegInCommittedVaultRetainingSignerV1: async (...args: Parameters<typeof checkVault>) => {
              const receipt = await checkVault(...args);
              expected = invalidateNativeBinding(fault, false, source);
              return receipt;
            } };
          const failure = await executeNativeVault({ ...input, setupSession }).then(() => undefined, error => error);
          expect(expected).toBeDefined();
          expect(failure).toBeInstanceOf(Error);
          expect(failure.message).toMatch(expected!);
          expect(promotion).not.toHaveBeenCalled();
          expect(post).toHaveBeenCalledTimes(1);
          expect(helpers.ncheck).toHaveBeenCalledTimes(5);
          expect(input.state.getErgoOperationalTransactionAttempt(input.packet.transactions.reserveTransition.txId)).toBeNull();
        });
      } finally { source?.dispose(); }
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

  it.each(['descendant', 'fork'])('binds native reserve inputs to the %s after a fresh check', async branch => {
    await withNativeVault(async ({ input, post, onTip, onHeight, onConfirmation }) => {
      let advanced = false;
      onHeight(() => advanced ? 1022 : 1020);
      onConfirmation(() => advanced ? 22 : 20);
      onTip(() => advanced ? { height: 1022, id: (1022).toString(16).padStart(64, '0') }
        : { height: 1020, id: '70'.repeat(32) });
      const check = vi.mocked(helpers.ncheck).getMockImplementation()!;
      let checks = 0;
      vi.mocked(helpers.ncheck).mockImplementation(async (...args) => {
        const result = await check(...args);
        if (++checks === 2) advanced = true;
        return result;
      });
      const read = readOnlyNode.AuthenticatedSpvTrackerReadOnlyNodeClient.prototype.getBlockHeaderById;
      const headers = vi.spyOn(readOnlyNode.AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBlockHeaderById')
        .mockImplementation(async function(this: readOnlyNode.AuthenticatedSpvTrackerReadOnlyNodeClient, id) {
          if (branch === 'fork' && advanced && id === 'ef'.repeat(32)) {
            return { id, height: 1020, parentId: (1019).toString(16).padStart(64, '0') };
          }
          const value = await read.call(this, id);
          return branch === 'fork' && advanced && id === (1021).toString(16).padStart(64, '0')
            ? { ...(value as object), parentId: 'ef'.repeat(32) } : value;
        });
      if (branch === 'descendant') {
        const result = await executeNativeVault(input);
        expect(result.transportStatus).toBe('accepted');
        expect(result.preTransportObservation.observedTipHeight).toBe(1022);
        expect(input.state.getErgoOperationalTransactionAttempt(result.expectedTxId)?.status).toBe('confirmed');
        expect(post).toHaveBeenCalledTimes(2);
      } else {
        await expect(executeNativeVault(input)).rejects.toThrow(/previously observed height/);
        expect(headers).toHaveBeenCalledWith('ef'.repeat(32));
        expect(input.state.getErgoOperationalTransactionAttempt(input.packet.transactions.reserveTransition.txId)).toBeNull();
        expect(post).toHaveBeenCalledTimes(1);
      }
      expect(headers).toHaveBeenCalledWith((1022).toString(16).padStart(64, '0'));
      expect(helpers.ncheck).toHaveBeenCalledTimes(6);
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

  const nativeBindingFaults = ['process binding', 'target binding', 'primary origin', 'witness origin',
    'primary mining', 'witness read-only', 'target expiry', 'compiler custody', 'setup custody', 'source custody'] as const;
  function retainNativeBindingSource(fault: typeof nativeBindingFaults[number]) {
    if (fault !== 'source custody') return undefined;
    const source = createSourceSession({ ergoAdmissionThreshold: 1,
      ergoAdmissionPublicKeysHex: [session.signer.publicKeyHex] });
    const assertCurrentCustody = boundary.custody!;
    boundary.custody = () => { assertCurrentCustody(); readSourceProfiles(source); };
    return source;
  }
  function invalidateNativeBinding(fault: typeof nativeBindingFaults[number], checking: boolean,
    source: ReturnType<typeof createSourceSession> | undefined): RegExp {
    if (fault === 'process binding' || fault === 'target binding') {
      const current = owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      vi.mocked(owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1).mockReturnValue({ ...current,
        [fault === 'process binding' ? 'processBindingDigestHex' : 'executionTargetIdentityDigestHex']: 'ab'.repeat(32) });
      return /process binding changed/;
    }
    if (fault === 'primary origin') target.primaryNodeOrigin = 'http://127.0.0.1:19051';
    else if (fault === 'witness origin') target.witnessNodeOrigin = 'http://127.0.0.1:19052';
    else if (fault === 'primary mining') target.primaryMining = false;
    else if (fault === 'witness read-only') target.witnessReadOnly = false;
    else if (fault === 'target expiry') { boundary.targetActive = false; return /execution target expired/; }
    else if (fault === 'compiler custody') { compiledActive = false; return /compiled provenance absent/; }
    else if (fault === 'setup custody') {
      if (checking) expect(() => session.dispose()).toThrow(/running/);
      else session.dispose();
      return /inactive|cancelled|active process provenance/;
    } else if (fault === 'source custody') {
      if (source === undefined) throw new Error('native binding fixture did not retain its source');
      source.dispose();
      return /disposed/;
    }
    return /execution target differs from its request/;
  }

  it('uses one fresh complete target traversal per retained native batch assertion', async () => {
    const batch = await session.runNativeGenesisRetainingSigner(compiled, target);
    const probe = vi.mocked(owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1);
    for (let index = 0; index < 2; index++) {
      const before = probe.mock.calls.length;
      expect(execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).toEqual(batch.targetBinding);
      expect(probe.mock.calls.length - before).toBe(1);
      await Promise.resolve();
    }
  });

  it.each(nativeBindingFaults)('rechecks native batch %s after an intervening await', async fault => {
    const source = retainNativeBindingSource(fault);
    try {
      const batch = await session.runNativeGenesisRetainingSigner(compiled, target);
      expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).not.toThrow();
      await Promise.resolve();
      const expected = invalidateNativeBinding(fault, false, source);
      expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target)).toThrow(expected);
      expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    } finally { source?.dispose(); }
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

  it.each(nativeBindingFaults)('rejects fresh native %s after checking before promotion', async fault => {
    const source = retainNativeBindingSource(fault);
    const observe = boundary.observe.getMockImplementation()!;
    let count = 0;
    let expected: RegExp | undefined;
    boundary.observe.mockImplementation(async (...args) => {
      const result = await observe(...args);
      if (++count === 3) expected = invalidateNativeBinding(fault, true, source);
      return result;
    });
    const promote = vi.spyOn(fleet, 'promoteLocalWasmCheckedTransactionForSubmissionV1');
    try {
      const failure = await session.runNativeGenesisRetainingSigner(compiled, target).then(() => undefined, error => error);
      expect(count).toBe(3);
      expect(expected).toBeDefined();
      expect(failure).toBeInstanceOf(Error);
      expect(failure.message).toMatch(expected!);
      expect(promote).not.toHaveBeenCalled();
      expect(helpers.ncheck).toHaveBeenCalledTimes(3);
    } finally { source?.dispose(); }
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
