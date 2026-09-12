import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import axios from 'axios';
import blakejs from 'blakejs';
import { Mnemonic } from 'ethers';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Observed setup/compiler provenance, source custody and node/process observations
// are explicit component doubles. Compilers, contracts, AVL witnesses, transaction
// construction, WASM signatures, retained capabilities and journals are real.
const boundary = vi.hoisted(() => ({
  request: undefined as object | undefined, target: undefined as object | undefined,
  observation: undefined as unknown, sourceActive: true, setupActive: true,
  assertSigner: undefined as (() => void) | undefined,
  assert(value: unknown, target?: object) {
    if (value !== this.request || (target !== undefined && target !== this.target)
      || !this.setupActive) throw new Error('synthetic native request provenance expired');
    this.read();
  },
  read() {
    if (!this.sourceActive) throw new Error('synthetic native source custody disposed');
    this.assertSigner?.();
  },
}));
vi.mock('./substrate-federated-native-genesis-setup-check-request-v1.js', () => ({
  buildSubstrateFederatedNativeGenesisSetupCheckRequestV1: async () => boundary.request,
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1: (value: unknown, target?: object) => boundary.assert(value, target),
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1RuntimeProvenance: async (value: unknown) => boundary.assert(value),
  reobserveSubstrateFederatedNativeGenesisSetupCheckRequestV1: async (value: unknown) => {
    boundary.assert(value); return structuredClone(boundary.observation);
  },
}));

import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import * as helpers from './ergo-helpers.js';
import * as fleet from './fleet-signer.js';
import * as owned from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import * as compiledGenesis from './substrate-federated-observed-genesis-v1.js';
import * as execution from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2 as createSession }
  from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance as assertSigner }
  from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import { materializeUnsignedTransaction, type Eip12Box } from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 } from './substrate-federated-genesis-issuance-materialization-v1.js';
import { deriveLocalWasmRootSignerPublicIdentity } from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import { getDupTreeDigest, getPooledReserveEmptyDigest } from './avl-bridge.js';
import { getSubstrateFederatedTrackerDigestV1Hex } from './substrate-federated-burn-settlement-v1.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister } from './ergo-encoding.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2 } from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { buildSubstrateFederatedCheckpointProfileV1, buildSubstrateFederatedCheckpointStatementV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1 } from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from './substrate-federated-settlement-family-v1.js';
import { buildSubstrateFederatedNativeGenesisPegInPacketV1 } from './substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import { buildTrustlessBurnInclusionProof, deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1, buildBridgeValidityTrackerObservedHeaderContextV1 }
  from './bridge-validity-tracker-header-context-v1.js';
import { buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context } from './substrate-federated-tracker-v2.js';
import { buildSubstrateFederatedTrackerV2ExternalFeeTransaction } from './substrate-federated-tracker-v2-external-fee.js';
import { authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission as authorizeTracker,
  reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission as reserveTracker,
  revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission as revalidateTracker,
  confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission as confirmTracker }
  from './substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js';
import { submitSubstrateFederatedIsolatedDevnetTrackerV2Admission as submitTracker,
  finalizeSubstrateFederatedIsolatedDevnetTrackerV2Admission as finalizeTracker }
  from './substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import { authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2 as authorizeWithdrawal,
  reserveSubstrateFederatedIsolatedDevnetWithdrawalV2 as reserveWithdrawal }
  from './substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js';
import { createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1 as createObserver }
  from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import { StateTracker } from './state-tracker.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';

const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const GENESIS = '62'.repeat(32);
const ROLES = ['tracker', 'duplicate-prevention', 'pooled-reserve'] as const;
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
const vector = JSON.parse(readFileSync(new URL('../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url), 'utf8'));
const template = (relativePath: string) => ({ relativePath,
  source: readFileSync(new URL('../../' + relativePath, import.meta.url), 'utf8') });
const templates = {
  duplicatePrevention: template('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
  sourceLock: template('contracts/MainChainLockPooledReserveV6.es'),
  pooledReserve: template('contracts/MainChainPooledReserveValidityApplicationV6.es'),
};
const binding = (byte: string) => Object.freeze({ processBindingDigestHex: byte.repeat(32),
  executionTargetIdentityDigestHex: createHash('sha256').update(byte).digest('hex') });
const setupBinding = binding('68');
const frozenBinding = binding('51');
const freshBinding = binding('71');
const confirmBinding = binding('91');
const transportBinding = Object.freeze({ ...binding('81'),
  reservationFreshnessProcessBindingDigestHex: freshBinding.processBindingDigestHex,
  reservationFreshnessExecutionTargetIdentityDigestHex: freshBinding.executionTargetIdentityDigestHex });
let wasm: any;
let testMnemonic: Mnemonic;
let signer: Awaited<ReturnType<typeof deriveLocalWasmRootSignerPublicIdentity>>;
let funding: readonly Eip12Box[];
let trackerRequest: ReturnType<typeof buildSubstrateFederatedTrackerCompilerRequestV2>;
let trackerReceipt: Awaited<ReturnType<typeof compileSubstrateFederatedTrackerWithPinnedJvmV2>>;
let familyReceipt: Awaited<ReturnType<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2>>;
let issuances: Awaited<ReturnType<typeof materializeUnsignedTransaction>>[];
const metrics = { trackerCalls: 0, familyCalls: 0, milliseconds: 0 };
const headerContext = (height: number, extension = '94'.repeat(32), index = 0) =>
  buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: height, anchorContextIndex: index, anchorExtensionRootHex: extension,
  }).headers.map(header => header.raw);

beforeAll(async () => {
  const module = await import('ergo-lib-wasm-nodejs'); wasm = module.default ?? module;
  // This fresh in-memory test seed is reused only to share the exact compiler inputs.
  testMnemonic = Mnemonic.fromEntropy((await import('node:crypto')).randomBytes(32));
  signer = await deriveLocalWasmRootSignerPublicIdentity(testMnemonic.phrase);
  funding = (await materializeUnsignedTransaction({ inputs: [{
    boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5', value: '300000000',
    ergoTree: `0008cd02${'22'.repeat(32)}`, assets: [], additionalRegisters: {}, creationHeight: 110,
    transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0, extension: {},
  }], dataInputs: [], outputs: [50, 100, 150].map(value => ({
    value: String(value * 1_000_000), ergoTree: deriveDevnetRewardErgoTreeHexForDelay(signer.publicKeyHex, 1), creationHeight: 120,
  })) }, 'native continuation synthetic funding')).outputs;
  const profile = buildSubstrateFederatedCheckpointProfileV1({ ...vector.input.profile,
    ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [signer.publicKeyHex] });
  trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
    trackerGenesisInputBoxIdHex: funding[0]!.boxId, profile,
    application: { sourceNetworkIdHex: GENESIS, sidechainIdHex: '42'.repeat(32), bridgeAddressHex: '06'.repeat(20),
      tokenAddressHex: '07'.repeat(20), bridgeRuntimeCodeSha256Hex: '09'.repeat(32), bridgeRuntimeCodeBytes: 4104,
      tokenRuntimeCodeSha256Hex: '0a'.repeat(32), tokenRuntimeCodeBytes: 2356,
      sourceRuntimeCodeSha256Hex: '08'.repeat(32), sourceRuntimeCodeBytes: 1969685,
      runtimeProfileIdHex: '43'.repeat(32), settlementProfileIdHex: '44'.repeat(32) },
    template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
  });
  if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
    throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
  }
  const nodeOptions = process.env.NODE_OPTIONS;
  const started = performance.now();
  delete process.env.NODE_OPTIONS;
  try {
    metrics.trackerCalls++;
    trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
    metrics.familyCalls++;
    familyReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2({
      trackerRequest, trackerReceipt, templates, duplicatePreventionGenesisInputBoxIdHex: funding[1]!.boxId,
      pooledReserveGenesisInputBoxIdHex: funding[2]!.boxId,
    });
  } finally { process.env.NODE_OPTIONS = nodeOptions; metrics.milliseconds = Math.round(performance.now() - started); }
  const familyRegister = encodeCollByteRegister(Buffer.from(familyReceipt.profile.familyIdHex, 'hex'));
  const registers: Readonly<Record<string, string>>[] = [
    { R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
      R5: encodeAvlTreeRegister(Buffer.from(getSubstrateFederatedTrackerDigestV1Hex([]), 'hex'), 1, 370),
      R6: encodeCollByteRegister(Buffer.from(trackerRequest.application.sidechainIdHex, 'hex')),
      R7: encodeLongRegister(0n), R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')) },
    { R4: familyRegister, R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'), 1, 1) },
    { R4: familyRegister, R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'), 1, 32), R6: encodeLongRegister(0n) },
  ];
  const trees = [trackerReceipt.contract.propositionHex, familyReceipt.contracts.duplicatePrevention.propositionHex,
    familyReceipt.contracts.pooledReserve.propositionHex];
  issuances = [];
  for (const [index, role] of ROLES.entries()) issuances.push(await materializeSubstrateFederatedSingletonIssuanceV1({
    label: role, genesisInput: funding[index]!, expectedNftIdHex: funding[index]!.boxId,
    propositionHex: trees[index]!, registers: registers[index]!, singletonValue: 10_000_000n,
    fee: 1_100_000n, creationHeight: 1000,
  }));
}, 120_000);
afterAll(() => { console.info('Native continuation JVM preparation:', JSON.stringify(metrics)); });
afterEach(() => {
  vi.restoreAllMocks(); boundary.assertSigner = undefined; boundary.request = undefined;
  boundary.target = undefined; boundary.observation = undefined;
});

type Fault = 'valid' | 'foreign native origin' | 'source disposed during tracker' | 'source disposed during payout' | 'foreign confirmation'
  | 'source disposed before tracker authorization' | 'source disposed before tracker reservation' | 'source disposed before tracker transport'
  | 'source disposed inside tracker preparation' | 'source disposed inside tracker checker'
  | 'source disposed inside payout preparation' | 'source disposed inside payout checker';

describe('native FED withdrawal continuation', () => {
  it.each<Fault>(['valid', 'foreign native origin', 'source disposed during tracker',
    'source disposed during payout', 'foreign confirmation', 'source disposed before tracker authorization',
    'source disposed before tracker reservation', 'source disposed before tracker transport',
    'source disposed inside tracker preparation', 'source disposed inside tracker checker',
    'source disposed inside payout preparation', 'source disposed inside payout checker'])('preserves native custody through terminal payout: %s', async fault => {
    vi.spyOn(Mnemonic, 'fromEntropy').mockReturnValue(testMnemonic);
    const session = await createSession();
    const state = new StateTracker(':memory:');
    let phase = 'setup';
    let payoutStarted = false;
    let signingHeaders = headerContext(1000);
    let injectionCount = 0;
    let injectedSignCalls: number | undefined;
    let injectedCheckCalls: number | undefined;
    const boxes = new Map<string, Eip12Box>();
    const confirmed = new Map<string, number>();
    const checkBodies: Record<string, unknown>[] = [];
    const submissionBodies: Record<string, unknown>[] = [];
    const publish = (...values: Eip12Box[]) => { for (const value of values) boxes.set(value.boxId, value); };
    const tip = () => Math.max(...signingHeaders.map(header => Number(header.height)));
    const headerId = (height: number) => createHash('sha256').update(`native continuation confirmation ${height}`).digest('hex');
    const setupTarget = Object.freeze({ primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS,
      primaryMining: true as const, witnessReadOnly: true as const });
    const frozenTarget = Object.freeze({ primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS,
      primaryMining: false as const, primaryReadOnly: true as const, witnessReadOnly: true as const,
      miningStopped: true as const, checkpointBound: true as const });
    const freshnessTarget = Object.freeze({ ...frozenTarget, reservationFreshnessRevalidation: true as const });
    const transportTarget = Object.freeze({ ...setupTarget, checkpointBound: true as const,
      reservationFreshnessCheckBound: true as const, trackerTransport: true as const, sameProcessCanonicalConfirmation: true as const });
    const confirmationTarget = Object.freeze({ ...setupTarget });
    const foreignTarget = Object.freeze({ ...confirmationTarget });
    const foreignSetupTarget = Object.freeze({ ...setupTarget });
    const nativeParents = new WeakMap<object, object>([[frozenTarget,
      fault === 'foreign native origin' ? foreignSetupTarget : setupTarget]]);
    boundary.sourceActive = true; boundary.setupActive = true; boundary.target = setupTarget;
    boundary.assertSigner = () => assertSigner(session.signer);
    const compiled = { familyCompilerInput: { trackerRequest, trackerReceipt, templates }, familyReceipt,
      discovery: { signer: session.signer, sources: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS } },
    } as unknown as compiledGenesis.ObservedSubstrateFederatedGenesisV1;
    const orderedIssuances = issuances.map((tx, ordinal) => ({ ordinal, role: ROLES[ordinal],
      genesisInputBoxIdHex: funding[ordinal]!.boxId, requiredInputErgoTreeHex: funding[ordinal]!.ergoTree,
      unsignedTransactionIdHex: tx.txId, unsignedTransactionBody: tx.eip12Tx,
      predictedStateOutput: { boxIdHex: tx.outputs[0]!.boxId, transactionIdHex: tx.txId, index: 0, creationHeight: 1000,
        bodyDigestHex: sha256CanonicalJson(tx.outputs[0], 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_OUTPUT_BODY_V2') },
      bytesToSignBlake2b256Hex: tx.txId }));
    const request = { schema: 'e2s.substrate-federated-native-genesis-setup-check-request.v1', version: 1,
      requestDigestHex: '60'.repeat(32), sourceBindings: { fixtureNativeCompilerDigestHex: '61'.repeat(32) },
      target: { sourceNetworkScope: 'isolated-devnet', settlementNetworkScope: 'ergo-local-devnet', environment: 'devnet',
        nodeReportedNetwork: 'devnet', genesisHeaderIdHex: GENESIS, profileIdHex: '63'.repeat(32), profileDigestHex: '64'.repeat(32),
        preSetupAnchor: { height: 999, headerIdHex: signingHeaders[0]!.id }, observedAt: new Date().toISOString(), maximumObservationAgeMs: 60_000,
        primary: { nodeOrigin: PRIMARY, sourceIdHex: '65'.repeat(32) }, witness: { nodeOrigin: WITNESS, sourceIdHex: '66'.repeat(32) } },
      checkPolicy: { signingNetworkPrefix: 16, stateContext: { nodeOrigin: PRIMARY, method: 'GET', path: '/blocks/lastHeaders/10' },
        nodeCheck: { nodeOrigin: PRIMARY, method: 'POST', path: '/transactions/check', transactionOrder: ROLES },
        sameOriginRequired: true, transportPolicy: 'no-redirect-no-proxy', submissionEndpointPresent: false, broadcastEndpointPresent: false },
      orderedIssuances };
    boundary.request = request;
    boundary.observation = { status: 'AGREED', reportDigestHex: '67'.repeat(32), observedAt: request.target.observedAt,
      profile: { profileIdHex: request.target.profileIdHex, profileDigestHex: request.target.profileDigestHex, environment: 'devnet' },
      target: { network: 'devnet', genesisHeaderIdHex: GENESIS, tipHeight: 999, tipHeaderIdHex: signingHeaders[0]!.id },
      sources: { primary: { endpointOrigin: PRIMARY, sourceIdHex: '65'.repeat(32) }, witness: { endpointOrigin: WITNESS, sourceIdHex: '66'.repeat(32) } },
      agreement: { fixtureAgreement: true }, boundary: { readOnlyNodeRequestsOnly: true, signerOrWalletMaterialRead: false,
        targetAcceptanceEstablished: false }, authorization: { fixtureAuthority: false },
      boxes: Object.fromEntries(KEYS.map((key, index) => [key, { role: ROLES[index], box: funding[index],
        sigmaSerializedSha256Hex: createHash('sha256').update(JSON.stringify(funding[index])).digest('hex'),
        checks: { presentInCurrentUtxoView: true, boxIdRecomputedFromJson: true, sigmaBytesCanonical: true } }])) };
    const validateCompiled: typeof compiledGenesis.validateObservedSubstrateFederatedGenesisV1 = (value, target) => {
      if (value !== compiled || target !== setupTarget || !boundary.setupActive) throw new Error('synthetic compiled origin expired');
      boundary.read();
      return Object.freeze({ compiled, processBinding: owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target) });
    };
    vi.spyOn(compiledGenesis, 'validateObservedSubstrateFederatedGenesisV1').mockImplementation(validateCompiled);
    vi.spyOn(compiledGenesis, 'assertObservedSubstrateFederatedGenesisV1').mockImplementation((value, target) => {
      validateCompiled(value, target);
    });
    vi.spyOn(compiledGenesis, 'assertObservedSubstrateFederatedGenesisReadCustodyV1').mockImplementation((value, target) => {
      if (value !== compiled || target !== setupTarget) throw new Error('synthetic compiled read origin differs');
      boundary.read();
    });
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1').mockImplementation(target => {
      if (target === setupTarget && boundary.setupActive) return setupBinding;
      if (phase === 'confirmation' && target === confirmationTarget) return confirmBinding;
      if (phase === 'confirmation' && target === foreignTarget) return binding('92');
      throw new Error('synthetic initial execution target expired');
    });
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2').mockImplementation(target => {
      if (phase !== 'frozen' || target !== frozenTarget) throw new Error('synthetic frozen target expired');
      return frozenBinding;
    });
    const nativeLineage = vi.spyOn(owned, 'assertSubstrateFederatedNativeSetupTrackerLineageV1').mockImplementation((target, original) => {
      if (nativeParents.get(target) !== original) { injectionCount++; throw new Error('synthetic private native origin differs'); }
      expect(original).toBe(setupTarget);
      return owned.assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(target);
    });
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetTrackerFreshnessLineageV2').mockImplementation((target, parent) => {
      expect(target).toBe(freshnessTarget); expect(parent).toEqual(frozenBinding); expect(phase).toBe('freshness'); return freshBinding;
    });
    vi.spyOn(owned, 'issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1').mockImplementation(target => {
      expect(target).toBe(freshnessTarget);
      return Object.freeze({ schema: 'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-completion.v1', version: 1 });
    });
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2').mockImplementation(target => {
      expect(target).toBe(transportTarget); expect(phase).toBe('transport'); return transportBinding;
    });
    let trackerTxId: string | undefined;
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetTrackerConfirmationLineageV2').mockImplementation((target, parent, txId) => {
      expect(parent).toEqual(transportBinding); expect(txId).toBe(trackerTxId); expect(phase).toBe('confirmation');
      if (target !== confirmationTarget) throw new Error('synthetic foreign confirmation lineage');
      return confirmBinding;
    });
    const read = async (path: string, origin: string): Promise<any> => {
      if (![PRIMARY, WITNESS].includes(origin)) throw new Error('unexpected synthetic RPC origin');
      if (!injectionCount && ((fault === 'source disposed during tracker' && phase === 'frozen' && path === '/blocks/at/1')
        || (fault === 'source disposed during payout' && payoutStarted && path.startsWith('/utxo/byId/')))) {
        injectionCount++; boundary.sourceActive = false;
      }
      if (path === '/blocks/lastHeaders/10') return [...signingHeaders].reverse();
      if (path === '/blocks/at/1') return [GENESIS];
      if (path === '/info') return { network: 'devnet', fullHeight: tip() };
      if (path.startsWith('/utxo/byId/')) {
        const box = boxes.get(path.slice('/utxo/byId/'.length));
        if (box) return structuredClone(box);
      }
      if (path.startsWith('/blockchain/transaction/byId/')) {
        const id = path.slice('/blockchain/transaction/byId/'.length);
        const inclusionHeight = confirmed.get(id);
        if (inclusionHeight !== undefined) return { id, inclusionHeight, headerId: headerId(inclusionHeight), numConfirmations: tip() - inclusionHeight };
      }
      if (/^\/blocks\/at\/[0-9]+$/.test(path)) return [headerId(Number(path.slice('/blocks/at/'.length)))];
      throw new Error(`unexpected synthetic RPC path ${path}`);
    };
    const signedId = (body: Record<string, unknown>) => {
      const tx = wasm.Transaction.from_json(JSON.stringify(body)); const id = tx.id();
      try { return id.to_str() as string; } finally { id.free(); tx.free(); }
    };
    vi.spyOn(helpers, 'ngetDirect').mockImplementation((path, origin) => read(path, origin!));
    vi.spyOn(helpers, 'ncheck').mockImplementation(async (path, body, origin) => {
      expect(path).toBe('/transactions/check'); expect(origin).toBe(PRIMARY);
      checkBodies.push(body as Record<string, unknown>); return signedId(body as Record<string, unknown>);
    });
    const signCalls = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
    const prepare = fleet.prepareLocalWasmRootCheckCandidates;
    const check = fleet.checkSignedTransaction;
    const internalFault = /^source disposed inside (tracker|payout) (preparation|checker)$/.exec(fault);
    const internalStage = (stage: string) => internalFault?.[2] === stage
      && (internalFault[1] === 'tracker' ? phase === 'frozen' : payoutStarted);
    const disposeInside = (assertActive: (() => void) | undefined) => {
      expect(typeof assertActive).toBe('function');
      expect(assertActive).not.toThrow();
      injectedSignCalls = signCalls.mock.calls.length; injectedCheckCalls = checkBodies.length;
      injectionCount++; boundary.sourceActive = false;
    };
    vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidates').mockImplementation(async input => {
      const pending = prepare(input);
      // The real helper passed its entry veto and suspended at getWasm().
      if (internalStage('preparation')) disposeInside(input.assertActive);
      return pending;
    });
    vi.spyOn(fleet, 'checkSignedTransaction').mockImplementation(async (...args) => {
      const pending = check(...args);
      // The real checker passed its entry veto and suspended at its import.
      if (internalStage('checker')) disposeInside(args[3]);
      return pending;
    });
    if (internalFault?.[2] === 'checker') vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(axios, 'create').mockImplementation(config => ({
      get: async (path: string) => ({ data: await read(path, config!.baseURL!) }),
    }) as never);
    vi.spyOn(axios, 'post').mockImplementation(async (url, body) => {
      expect(url).toBe(`${PRIMARY}/transactions`); expect(phase).toBe('transport');
      const payload = body as Record<string, unknown>;
      const id = signedId(payload); submissionBodies.push(payload);
      confirmed.set(id, 1031);
      return { status: 200, data: id };
    });
    try {
      const batch = await session.runNativeGenesisRetainingSigner(compiled, setupTarget);
      const family = decodeSubstrateFederatedSettlementFamilyV1Profile(familyReceipt.profile);
      const sourceFunding = (await materializeUnsignedTransaction({ inputs: [{ ...funding[0]!, extension: {} }], dataInputs: [],
        outputs: [{ value: '30000000', ergoTree: signer.p2pkErgoTreeHex, creationHeight: 1000 },
          { value: '20000000', ergoTree: signer.p2pkErgoTreeHex, creationHeight: 1000 }] }, 'native deposit funding')).outputs[0]!;
      const packet = await buildSubstrateFederatedNativeGenesisPegInPacketV1({ batch, target: setupTarget,
        sourceFundingInput: sourceFunding, sourceIntent: { formatVersion: 2, sourceNetworkIdHex: family.sourceNetworkIdHex,
          sidechainIdHex: family.sidechainIdHex, bridgeAddressHex: family.bridgeAddressHex, tokenAddressHex: family.tokenAddressHex,
          settlementProfileIdHex: family.settlementProfileIdHex, admissionProfileIdHex: familyReceipt.profile.familyIdHex,
          sourceAssetIdHex: family.settlementAssetIdHex, amountNanoErg: '20000000', recipientAddressHex: '61'.repeat(20) },
        depositorErgoTreeHex: signer.p2pkErgoTreeHex,
        creationHeights: { currentErgoHeight: 1001, sourceLockCreation: 1001, reserveTransition: 1001 } });
      signingHeaders = headerContext(1001);
      publish(packet.boxes.sourceFundingInput);
      await session.checkNativePegInSourceLockRetainingSignerV1(packet, setupTarget);
      publish(packet.boxes.reservePredecessor, packet.boxes.sourceLock, packet.boxes.transitionFeeFunding);
      await session.checkNativePegInCommittedVaultRetainingSignerV1(packet, setupTarget);
      signingHeaders = headerContext(1012);
      publish(issuances[0]!.outputs[1]!, issuances[1]!.outputs[1]!);
      const withdrawalFee = await session.checkNativeWithdrawalFeeFundingV1(setupTarget);
      const trackerFee = await session.checkNativeTrackerFeeFundingV1(setupTarget);
      expect(withdrawalFee.transaction.eip12Tx.inputs[0]!.boxId).toBe(issuances[1]!.outputs[1]!.boxId);
      expect(trackerFee.transaction.eip12Tx.inputs[0]!.boxId).toBe(issuances[0]!.outputs[1]!.boxId);
      expect(withdrawalFee.transaction.outputs[0]!.boxId).not.toBe(trackerFee.transaction.outputs[0]!.boxId);
      expect(checkBodies).toHaveLength(7);
      const leaf = { sidechainIdHex: family.sidechainIdHex, sidechainBlockHashHex: 'a2'.repeat(32),
        sidechainTxHashHex: 'a4'.repeat(32), eventIndex: 2,
        burnIdHex: deriveTrustlessBurnIdHex({ sidechainIdHex: family.sidechainIdHex, sidechainTxHashHex: 'a4'.repeat(32), eventIndex: 2 }),
        recipientErgoTreeHashHex: Buffer.from(blakejs.blake2b(Buffer.from(signer.p2pkErgoTreeHex, 'hex'), undefined, 32)).toString('hex'),
        amountNanoErg: '20000000', assetIdHex: '00'.repeat(32) };
      const proof = buildTrustlessBurnInclusionProof([leaf], leaf.burnIdHex);
      const statement = buildSubstrateFederatedCheckpointStatementV1({ ...vector.input.statement,
        ...trackerRequest.application, profile: trackerRequest.profile, sourceNativeBlockHeight: '4',
        sourceNativeBlockHashHex: 'a1'.repeat(32), executionBlockHashHex: leaf.sidechainBlockHashHex,
        bridgeEventRootHex: proof.bridgeEventRootHex, burnLeafCount: proof.leafCount });
      const membership = buildErgoExtensionMembershipProof([{ key: Buffer.from('0401', 'hex'),
        value: Buffer.from(encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex), 'hex') }], Buffer.from('0401', 'hex'));
      signingHeaders = headerContext(1030, membership.root.toString('hex'), 1);
      const observedHeaderContext = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, { rawHeaders: signingHeaders,
        anchorContextIndex: 1, expectedAnchorHeaderIdHex: String(signingHeaders[1]!.id),
        expectedAnchorExtensionRootHex: membership.root.toString('hex') });
      publish(issuances[0]!.outputs[0]!, trackerFee.transaction.outputs[0]!);
      const context = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
        compilerRequest: trackerRequest, compilerReceipt: trackerReceipt, trackerInputBox: issuances[0]!.outputs[0]!,
        observedHeaderContext, encodedStatementHex: statement.encodedStatementHex, extensionMembershipProofHex: membership.proof.toString('hex') });
      const transaction = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({ trackerContext: context,
        trackerInputBox: issuances[0]!.outputs[0]!, feeInputBox: trackerFee.transaction.outputs[0]!, feePayerPublicKeyHex: signer.publicKeyHex });
      trackerTxId = transaction.unsignedTransactionIdHex;
      boundary.setupActive = false; phase = 'frozen';
      expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, setupTarget)).toThrow(/expired/);
      const pendingTracker = session.checkNativeFrozenTrackerV2CandidateRetainingWithdrawalSigner({ context, transaction, observedHeaderContext }, frozenTarget);
      if (fault === 'foreign native origin' || fault === 'source disposed during tracker' || internalFault?.[1] === 'tracker') {
        await expect(pendingTracker).rejects.toThrow(fault === 'foreign native origin' ? /private native origin differs/
          : internalFault?.[2] === 'checker' ? /JVM node check rejected/ : /source custody disposed/);
        expect(injectionCount).toBe(1); expect(checkBodies).toHaveLength(7); expect(submissionBodies).toHaveLength(0);
        if (internalFault) expect(checkBodies).toHaveLength(injectedCheckCalls!);
        if (internalFault?.[2] === 'preparation') expect(signCalls).toHaveBeenCalledTimes(injectedSignCalls!);
        expect(() => assertSigner(session.signer)).toThrow(); return;
      }
      const checked = await pendingTracker;
      expect(nativeLineage).toHaveBeenCalled(); expect(checkBodies).toHaveLength(8);
      expect(() => assertSigner(session.signer)).not.toThrow();
      const checkedBody = canonicalJson(checkBodies.at(-1));
      if (fault === 'source disposed before tracker authorization') {
        boundary.sourceActive = false;
        await expect(authorizeTracker(checked, frozenTarget)).rejects.toThrow(/source custody disposed/);
        expect(state.getErgoOperationalTransactionAttempt(trackerTxId)).toBeNull();
        expect(submissionBodies).toHaveLength(0); return;
      }
      const authorization = await authorizeTracker(checked, frozenTarget);
      if (fault === 'source disposed before tracker reservation') {
        boundary.sourceActive = false;
        expect(() => reserveTracker(authorization, state)).toThrow(/source custody disposed/);
        expect(state.getErgoOperationalTransactionAttempt(trackerTxId)).toBeNull();
        expect(submissionBodies).toHaveLength(0); return;
      }
      const attempt = reserveTracker(authorization, state);
      expect(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId)?.status).toBe('pending');
      phase = 'freshness';
      await revalidateTracker(attempt, freshnessTarget);
      phase = 'transport';
      if (fault === 'source disposed before tracker transport') {
        const reserved = state.getErgoOperationalTransactionAttempt(attempt.expectedTxId);
        const beforeChecks = checkBodies.length;
        boundary.sourceActive = false;
        await expect(submitTracker(transportTarget, attempt)).rejects.toThrow(/source custody disposed/);
        expect(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId)).toEqual(reserved);
        expect(checkBodies).toHaveLength(beforeChecks); expect(submissionBodies).toHaveLength(0); return;
      }
      const submitted = await submitTracker(transportTarget, attempt);
      expect(submitted.status).toBe('accepted');
      expect(canonicalJson(submissionBodies[0])).toBe(checkedBody);
      finalizeTracker(attempt, submitted);
      const admitted = await materializeUnsignedTransaction(transaction.eip12UnsignedTransaction as never, 'native admitted tracker');
      signingHeaders = headerContext(1050);
      publish(admitted.outputs[0]!, packet.boxes.reserveSuccessor, issuances[1]!.outputs[0]!, withdrawalFee.transaction.outputs[0]!);
      for (const tx of [packet.transactions.reserveTransition, issuances[1]!, withdrawalFee.transaction]) confirmed.set(tx.txId, 1020);
      phase = 'confirmation';
      const confirmation = await createObserver(confirmationTarget, GENESIS).observe(attempt.expectedTxId, PRIMARY);
      expect(confirmation?.status).toBe('confirmed');
      if (fault === 'foreign confirmation') {
        const foreign = await createObserver(foreignTarget, GENESIS).observe(attempt.expectedTxId, PRIMARY);
        const before = state.getErgoOperationalTransactionAttempt(attempt.expectedTxId);
        await expect(confirmTracker(attempt, confirmationTarget, foreign!)).rejects.toThrow(/binding|artifact|observer|target/);
        expect(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId)).toEqual(before);
        expect(checkBodies).toHaveLength(10); return;
      }
      await confirmTracker(attempt, confirmationTarget, confirmation!);
      expect(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId)?.status).toBe('confirmed');
      payoutStarted = true;
      const payout = session.checkNativeWithdrawalV2({ trackerIdentity: { sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
        sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex, executionBlockHashHex: statement.executionBlockHashHex },
        burnLeaf: leaf, leafIndex: proof.leafIndex, leafCount: proof.leafCount, burnProof: proof.proof,
        recipientErgoTreeHex: signer.p2pkErgoTreeHex }, confirmationTarget);
      if (fault === 'source disposed during payout' || internalFault?.[1] === 'payout') {
        await expect(payout).rejects.toThrow(internalFault?.[2] === 'checker' ? /withdrawal JVM node check failed/ : /source custody disposed/);
        expect(injectionCount).toBe(1); expect(checkBodies).toHaveLength(10);
        if (internalFault) expect(checkBodies).toHaveLength(injectedCheckCalls!);
        if (internalFault?.[2] === 'preparation') expect(signCalls).toHaveBeenCalledTimes(injectedSignCalls!);
      } else {
        const result = await payout;
        expect(result.checkedResult.txId).toBe(result.packet.transaction.txId);
        expect(result.packet.transaction.eip12Tx.inputs.map(box => box.boxId)).toEqual([
          packet.boxes.reserveSuccessor.boxId, issuances[1]!.outputs[0]!.boxId, withdrawalFee.transaction.outputs[0]!.boxId]);
        expect(result.packet.transaction.eip12Tx.dataInputs.map(box => box.boxId)).toEqual([admitted.outputs[0]!.boxId]);
        expect(BigInt(result.packet.reserve.inputValueNanoErg) - BigInt(result.packet.reserve.outputValueNanoErg)).toBe(20_000_000n);
        expect(result.packet.reserve.outputLiabilityNanoErg).toBe('0');
        expect(signedId(checkBodies.at(-1)!)).toBe(result.packet.transaction.txId);
        expect(checkBodies).toHaveLength(11);
        expect(() => assertSigner(session.signer)).toThrow();
        await expect(authorizeWithdrawal({ ...result }, confirmationTarget)).rejects.toThrow(/provenance/);
        const payoutAuthorization = await authorizeWithdrawal(result, confirmationTarget);
        const payoutAttempt = reserveWithdrawal(payoutAuthorization, state);
        expect(state.getErgoOperationalTransactionAttempt(payoutAttempt.expectedTxId)?.status).toBe('pending');
        await expect(authorizeWithdrawal(result, confirmationTarget)).rejects.toThrow(/already claimed/);
      }
      expect(() => assertSigner(session.signer)).toThrow();
      expect(submissionBodies).toHaveLength(1);
      expect(statement.sourceNativeBlockHashHex).not.toBe(statement.executionBlockHashHex);
      expect(statement.sourceNetworkIdHex).toBe(GENESIS);
    } finally { session.dispose(); state.close(); }
  }, 60_000);
});
