import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, statfsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { materializeUnsignedTransaction, type Eip12Box, type Eip12UnsignedTransaction } from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 } from './substrate-federated-genesis-issuance-materialization-v1.js';
import { deriveLocalWasmRootSignerPublicIdentity } from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import { getDupTreeDigest, getPooledReserveEmptyDigest, verifyPooledReserveCommitmentInsert } from './avl-bridge.js';
import { getSubstrateFederatedTrackerDigestV1Hex } from './substrate-federated-burn-settlement-v1.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister } from './ergo-encoding.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2 } from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { buildSubstrateFederatedCheckpointProfileV1, buildSubstrateFederatedCheckpointStatementV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1 } from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from './substrate-federated-settlement-family-v1.js';
import { assertSubstrateFederatedNativeGenesisPegInPacketV1,
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV1,
  buildSubstrateFederatedNativeContinuationPegInPacketV1,
  buildSubstrateFederatedNativeGenesisPegInPacketV1 } from './substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import { buildTrustlessBurnInclusionProof, deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1, buildBridgeValidityTrackerObservedHeaderContextV1,
  serializeCanonicalErgoHeaderV2 }
  from './bridge-validity-tracker-header-context-v1.js';
import { buildWasmSimplifiedUpcomingPreHeaderCarrier } from './ergo-upcoming-state-context.js';
import { buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context,
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContinuationContext } from './substrate-federated-tracker-v2.js';
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
  confirmSubstrateFederatedIsolatedDevnetWithdrawalV2 as confirmWithdrawal,
  reserveSubstrateFederatedIsolatedDevnetWithdrawalV2 as reserveWithdrawal }
  from './substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js';
import { authorizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1 as authorizeTrackerFee,
  authorizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1 as authorizeWithdrawalFee,
  reserveSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1 as reserveWithdrawalFee }
  from './substrate-federated-isolated-devnet-tracker-fee-funding-authority-v1.js';
import { submitSubstrateFederatedIsolatedDevnetWithdrawalV2 as submitWithdrawal,
  finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2 as finalizeWithdrawal,
  submitSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1 as submitWithdrawalFee,
  finalizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1 as finalizeWithdrawalFee }
  from './substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import { createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1 as createObserver }
  from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import { executeSubstrateFederatedNativeContinuationPegInSourceLockV1 as executeContinuationSourceLock,
  executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1 as executeContinuationVault,
  executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1 as executeWithdrawalFeeFunding,
  executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1 as executeTrackerFeeFunding }
  from './apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import * as rewardDiscovery from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import { buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1 as buildNativeMintDraft }
  from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import { collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV1 as collectNativeReserveEvidence,
  consumeSubstrateFederatedNativeGenesisCommittedReserveEvidenceForDraftV1 as consumeNativeReserveEvidence }
  from './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import * as nativeVaultObserver
  from './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import { SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1 as REQUIRED_SUCCESSOR_DEPTH }
  from './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import { StateTracker } from './state-tracker.js';
import { buildSubstrateFederatedBurnSettlementV2 } from './substrate-federated-burn-settlement-v2.js';
import { PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE }
  from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import {
  createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2 as createSourceSession,
  readSubstrateFederatedGenesisProfilesFromSessionV2 as readSourceProfiles,
  createSubstrateFederatedNativeGenesisSourceAttestationOperationV1 as createNativeSourceOperation,
  produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1 as produceNativeOperationMintProof,
  assertSubstrateFederatedNativeGenesisContinuationMintSourceProofPairV1 as assertNativeProofPair,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex as encodeRuntimeProfile,
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex as decodeRuntimeProfile,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex as runtimeProfileId,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import { SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX }
  from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import { createFederatedGenesisOperatorV1, disposeFederatedGenesisOperatorV1 }
  from './adapters/federated-genesis-operator-v1.js';
import * as frontierOwner from './substrate-federated-authority-safe-devnet-process-v1.js';
import {
  executeFrontierNativeProofBoundReservationMintAndBurnV1,
  attestFrontierNativeBurnCheckpointV1,
  executeFrontierNativeProofBoundContinuationReservationV1,
  executeFrontierNativeProofBoundContinuationMintAndBurnV1,
} from './apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.js';
import { createNativeContinuationRpcFixtureV1 }
  from './test-fixtures/native-continuation-rpc-fixture.js';

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
const secondFrozenBinding = binding('52');
const secondFreshBinding = binding('72');
const secondConfirmBinding = binding('93');
const secondTransportBinding = Object.freeze({ ...binding('82'),
  reservationFreshnessProcessBindingDigestHex: secondFreshBinding.processBindingDigestHex,
  reservationFreshnessExecutionTargetIdentityDigestHex: secondFreshBinding.executionTargetIdentityDigestHex });
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

function createPersistentNativeAttemptDirectory(prefix: string) {
  const quarantineRoot = process.platform === 'win32'
    ? join(parse(process.cwd()).root, 'A EFFACER')
    : join(tmpdir(), 'A EFFACER');
  mkdirSync(quarantineRoot, { recursive: true });
  const canonicalRoot = realpathSync(quarantineRoot);
  const directory = realpathSync(mkdtempSync(join(canonicalRoot, prefix)));
  const fromRoot = relative(canonicalRoot, directory);
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error('native attempt directory escaped quarantine root');
  }
  return directory;
}

// Extend the original mined chain; rebuilding a synthetic window at another
// height would change the attested anchor's ID even if its extension were equal.
function appendSyntheticMinedHeader(headers: readonly Readonly<Record<string, unknown>>[]) {
  const tip = headers[0]!;
  const next = { ...structuredClone(tip), parentId: tip.id,
    height: Number(tip.height) + 1, timestamp: Number(tip.timestamp) + 120_000,
    extensionHash: '95'.repeat(32) };
  const id = Buffer.from(blakejs.blake2b(serializeCanonicalErgoHeaderV2(next), undefined, 32)).toString('hex');
  return [Object.freeze({ ...next, id }), ...headers.slice(0, 9)];
}

function verifyRetainedTrackerAtHeaders(input: Readonly<{
  signedBody: Record<string, unknown>;
  signedCandidate: Readonly<{ txId: string; signedTransactionBytesSha256Hex: string; signedTransactionBytesLength: number }>;
  boxes: readonly Readonly<Eip12Box>[];
  dataBoxes?: readonly Readonly<Eip12Box>[];
  headers: readonly Readonly<Record<string, unknown>>[];
  minedHeader?: Readonly<Record<string, unknown>>;
}>) {
  const { signedBody, signedCandidate, boxes, headers } = input;
  expect(headers).toHaveLength(10);
  for (const [index, header] of headers.entries()) {
    expect(header.id).toBe(Buffer.from(blakejs.blake2b(serializeCanonicalErgoHeaderV2(header), undefined, 32)).toString('hex'));
    if (index > 0) {
      expect(headers[index - 1]!.parentId).toBe(header.id);
      expect(Number(headers[index - 1]!.height)).toBe(Number(header.height) + 1);
    }
  }
  const preHeaderRaw = input.minedHeader ?? buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0]!);
  expect(preHeaderRaw.parentId).toBe(headers[0]!.id);
  expect(preHeaderRaw.height).toBe(Number(headers[0]!.height) + 1);
  const tx = wasm.Transaction.from_json(JSON.stringify(signedBody));
  const txId = tx.id();
  const bytes = Buffer.from(tx.sigma_serialize_bytes());
  expect(txId.to_str()).toBe(signedCandidate.txId);
  expect(bytes.length).toBe(signedCandidate.signedTransactionBytesLength);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(signedCandidate.signedTransactionBytesSha256Hex);
  expect((signedBody.inputs as { boxId: string }[]).map(value => value.boxId)).toEqual(boxes.map(box => box.boxId));
  const carrier = wasm.BlockHeader.from_json(JSON.stringify(preHeaderRaw));
  const preHeader = wasm.PreHeader.from_block_header(carrier);
  const context = new wasm.ErgoStateContext(preHeader, wasm.BlockHeaders.from_json(headers), wasm.Parameters.default_parameters());
  const inputs = wasm.ErgoBoxes.from_boxes_json(boxes);
  const dataInputs = input.dataBoxes === undefined
    ? wasm.ErgoBoxes.empty() : wasm.ErgoBoxes.from_boxes_json(input.dataBoxes);
  try {
    const proofs = boxes.map((_box, index) => wasm.verify_tx_input_proof(index, context, tx, inputs, dataInputs));
    let transactionError: string | null = null;
    try { wasm.validate_tx(tx, context, inputs, dataInputs); }
    catch (error) { transactionError = String(error); }
    return { proofs, transactionError };
  } finally { dataInputs.free(); inputs.free(); context.free(); txId.free(); tx.free(); }
}

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
  vi.restoreAllMocks(); vi.unstubAllGlobals(); boundary.assertSigner = undefined; boundary.request = undefined;
  boundary.target = undefined; boundary.observation = undefined;
});

type Fault = 'valid' | 'foreign native origin' | 'source disposed during tracker' | 'source disposed during payout' | 'foreign confirmation'
  | 'source disposed before tracker authorization' | 'source disposed before tracker reservation' | 'source disposed before tracker transport'
  | 'source disposed inside tracker preparation' | 'source disposed inside tracker checker'
  | 'source disposed inside payout preparation' | 'source disposed inside payout checker' | 'tracker WASM expiry';

const SECOND_TRACKER_CASES = ['continuation second tracker valid', 'continuation second tracker foreign parent',
  'continuation second tracker substituted predecessor', 'continuation second tracker first fee',
  'continuation second tracker unclaimed fee', 'continuation second tracker unclaimed withdrawal fee',
  'continuation second tracker custody during preparation',
  'continuation second tracker custody during checker', 'continuation second tracker target during preparation',
  'continuation second tracker custody before transport', 'continuation second tracker foreign origin'] as const;
type SecondTrackerFault = typeof SECOND_TRACKER_CASES[number];
const SECOND_PAYOUT_CASES = ['continuation second payout valid', 'continuation second payout replay old claim',
  'continuation second payout wrong current target', 'continuation second payout stale reserve predecessor',
  'continuation second payout custody during preparation', 'continuation second payout custody during checker'] as const;
type SecondPayoutFault = typeof SECOND_PAYOUT_CASES[number];
type ContinuationFault = SecondTrackerFault | SecondPayoutFault | 'continuation valid' | 'continuation old terminal signer' | 'continuation copied withdrawal check'
  | 'continuation copied withdrawal attempt' | 'continuation unconfirmed payout' | 'continuation old packet'
  | 'continuation foreign target' | 'continuation duplicate source invocation' | 'continuation disposed during source preparation'
  | 'continuation disposed during source checker' | 'continuation wrong vault packet'
  | 'continuation disposed during vault preparation' | 'continuation disposed during vault checker'
  | 'continuation disposed during builder' | 'continuation successor changes during source'
  | 'continuation successor changes during vault' | 'continuation builder snapshots caller input'
  | 'continuation legacy replay' | 'continuation foreign observation before draft'
  | 'continuation copied observation before evidence' | 'continuation mismatched reservation draft'
  | 'continuation current target lost before transport' | 'continuation custody lost after funding await'
  | 'continuation ambiguous source transport' | 'continuation source proof native mint join'
  | 'continuation external fees valid' | 'continuation external fees unclaimed first check'
  | 'continuation external fees copied check' | 'continuation external fees foreign target'
  | 'continuation external fees spent first change' | 'continuation external fees custody during preparation'
  | 'continuation external fees custody during checker' | 'continuation external fees ambiguous withdrawal';

describe('native FED withdrawal continuation', () => {
  it.each<Fault | ContinuationFault>(['valid', 'foreign native origin', 'source disposed during tracker',
    'source disposed during payout', 'foreign confirmation', 'source disposed before tracker authorization',
    'source disposed before tracker reservation', 'source disposed before tracker transport',
    'source disposed inside tracker preparation', 'source disposed inside tracker checker',
    'source disposed inside payout preparation', 'source disposed inside payout checker',
    'tracker WASM expiry', 'continuation valid', 'continuation old terminal signer',
    'continuation copied withdrawal check', 'continuation copied withdrawal attempt', 'continuation unconfirmed payout',
    'continuation old packet', 'continuation foreign target', 'continuation duplicate source invocation',
    'continuation disposed during source preparation', 'continuation disposed during source checker',
    'continuation wrong vault packet', 'continuation disposed during vault preparation',
    'continuation disposed during vault checker', 'continuation disposed during builder',
    'continuation successor changes during source', 'continuation successor changes during vault',
    'continuation builder snapshots caller input', 'continuation legacy replay',
    'continuation foreign observation before draft', 'continuation copied observation before evidence',
    'continuation mismatched reservation draft', 'continuation current target lost before transport',
    'continuation custody lost after funding await', 'continuation ambiguous source transport',
    'continuation source proof native mint join', 'continuation external fees valid',
    'continuation external fees unclaimed first check', 'continuation external fees copied check',
    'continuation external fees foreign target', 'continuation external fees spent first change',
    'continuation external fees custody during preparation', 'continuation external fees custody during checker',
    'continuation external fees ambiguous withdrawal', ...SECOND_TRACKER_CASES, ...SECOND_PAYOUT_CASES])(
    'preserves native custody through payout and a second source deposit: %s', async fault => {
    vi.spyOn(Mnemonic, 'fromEntropy').mockReturnValue(testMnemonic);
    const session = await createSession();
    const state = new StateTracker(':memory:');
    let phase = 'setup';
    let payoutStarted = false;
    const continuation = { stage: 'none' as 'none' | 'builder' | 'source' | 'vault' | 'withdrawal-fee' | 'tracker-fee' };
    const continuationFault = fault.startsWith('continuation ');
    const secondTrackerFault = fault.startsWith('continuation second tracker ');
    const secondPayoutFault = fault.startsWith('continuation second payout ');
    const feeContinuationFault = fault.startsWith('continuation external fees ') || secondTrackerFault || secondPayoutFault;
    let secondTrackerHandled = false;
    let secondPayoutHandled = false;
    let secondPayoutStarted = false;
    let secondFrozenActive = true;
    let signingHeaders = headerContext(1000);
    let injectionCount = 0;
    let injectedSignCalls: number | undefined;
    let injectedCheckCalls: number | undefined;
    let continuationReserveId: string | undefined;
    let mutateContinuationBuilderInput: (() => void) | undefined;
    let continuationFundingObservation: object | undefined;
    let continuationFundingReads = 0;
    let currentTargetActive = true;
    let loseCurrentTargetAtTransport = false;
    let loseCustodyAfterFundingAwait = false;
    let loseSourceTransportResponse = false;
    let secondSourceInclusionHeight: number | undefined;
    let secondVaultInclusionHeight: number | undefined;
    let secondContinuationPacket: Awaited<ReturnType<typeof buildSubstrateFederatedNativeContinuationPegInPacketV1>> | undefined;
    const boxes = new Map<string, Eip12Box>();
    const confirmed = new Map<string, number>();
    const checkBodies: Record<string, unknown>[] = [];
    const submissionBodies: Record<string, unknown>[] = [];
    const feeSubmissionBodies: Record<string, unknown>[] = [];
    const feeTransactions = new Map<string, Readonly<{
      inputs: readonly Readonly<{ boxId: string }>[];
      outputs: readonly Readonly<Eip12Box>[];
    }>>();
    let loseFeeTransportResponse = false;
    let feeContinuationHandled = false;
    const firstFeeRowSnapshots = new Map<string, Readonly<{ txId: string; snapshot: string }>>();
    const publish = (...values: Eip12Box[]) => { for (const value of values) boxes.set(value.boxId, value); };
    const tip = () => Math.max(...signingHeaders.map(header => Number(header.height)));
    const headerId = (height: number) => createHash('sha256').update(`native continuation confirmation ${height}`).digest('hex');
    const setupTarget = Object.freeze({ primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS,
      primaryMining: true as const, witnessReadOnly: true as const });
    const frozenTarget = Object.freeze({ primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS,
      primaryMining: false as const, primaryReadOnly: true as const, witnessReadOnly: true as const,
      miningStopped: true as const, checkpointBound: true as const });
    const freshnessTarget = Object.freeze({ ...frozenTarget, reservationFreshnessRevalidation: true as const });
    let transportTarget: Parameters<typeof submitTracker>[0];
    const confirmationTarget = Object.freeze({ ...setupTarget });
    const secondFrozenTarget = Object.freeze({ ...frozenTarget });
    const secondFreshnessTarget = Object.freeze({ ...freshnessTarget });
    const secondConfirmationTarget = Object.freeze({ ...confirmationTarget });
    let secondTransportTarget: Parameters<typeof submitTracker>[0];
    let secondTrackerTxId: string | undefined;
    const foreignTarget = Object.freeze({ ...confirmationTarget });
    const foreignSetupTarget = Object.freeze({ ...setupTarget });
    const nativeParents = new WeakMap<object, object>([[frozenTarget,
      fault === 'foreign native origin' ? foreignSetupTarget : setupTarget]]);
    nativeParents.set(secondFrozenTarget,
      fault === 'continuation second tracker foreign origin' ? foreignSetupTarget : setupTarget);
    boundary.sourceActive = true; boundary.setupActive = true; boundary.target = setupTarget;
    boundary.assertSigner = () => assertSigner(session.signer);
    const joinedFault = fault === 'continuation source proof native mint join';
    const joinedFeeFault = fault === 'continuation external fees valid' || secondTrackerFault || secondPayoutFault;
    const joinedSourceFault = joinedFault || joinedFeeFault;
    const joinedSource = joinedSourceFault ? createSourceSession({
      ergoAdmissionThreshold: trackerRequest.profile.ergoAdmissionThreshold,
      ergoAdmissionPublicKeysHex: trackerRequest.profile.ergoAdmissionPublicKeysHex,
    }) : undefined;
    const joinedProfiles = joinedSource ? readSourceProfiles(joinedSource) : undefined;
    let activeTrackerRequest = trackerRequest;
    let activeTrackerReceipt = trackerReceipt;
    let activeFamilyReceipt = familyReceipt;
    let activeIssuances = issuances;
    if (joinedProfiles) {
      activeTrackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
        trackerGenesisInputBoxIdHex: funding[0]!.boxId,
        profile: joinedProfiles.checkpointProfile,
        application: { ...trackerRequest.application,
          bridgeRuntimeCodeSha256Hex: createHash('sha256').update(Buffer.alloc(100, 0x60)).digest('hex'),
          bridgeRuntimeCodeBytes: 100,
          tokenRuntimeCodeSha256Hex: createHash('sha256').update(Buffer.alloc(200, 0x60)).digest('hex'),
          tokenRuntimeCodeBytes: 200,
          sourceRuntimeCodeSha256Hex: createHash('sha256').update(Buffer.from('0061736d01000000', 'hex')).digest('hex'),
          sourceRuntimeCodeBytes: 8 },
        template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
      });
      const nodeOptions = process.env.NODE_OPTIONS;
      delete process.env.NODE_OPTIONS;
      try {
        activeTrackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(activeTrackerRequest);
        activeFamilyReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2({
          trackerRequest: activeTrackerRequest,
          trackerReceipt: activeTrackerReceipt,
          templates,
          duplicatePreventionGenesisInputBoxIdHex: funding[1]!.boxId,
          pooledReserveGenesisInputBoxIdHex: funding[2]!.boxId,
        });
      } finally { process.env.NODE_OPTIONS = nodeOptions; }
      const activeFamilyRegister = encodeCollByteRegister(Buffer.from(activeFamilyReceipt.profile.familyIdHex, 'hex'));
      const activeRegisters: Readonly<Record<string, string>>[] = [
        { R4: encodeCollByteRegister(Buffer.from(joinedProfiles.checkpointProfile.profileIdHex, 'hex')),
          R5: encodeAvlTreeRegister(Buffer.from(getSubstrateFederatedTrackerDigestV1Hex([]), 'hex'), 1, 370),
          R6: encodeCollByteRegister(Buffer.from(activeTrackerRequest.application.sidechainIdHex, 'hex')),
          R7: encodeLongRegister(0n), R8: encodeIntRegister(0),
          R9: encodeCollByteRegister(Buffer.from(joinedProfiles.checkpointProfile.ergoAdmissionKeySetDigestHex, 'hex')) },
        { R4: activeFamilyRegister, R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'), 1, 1) },
        { R4: activeFamilyRegister, R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'), 1, 32),
          R6: encodeLongRegister(0n) },
      ];
      const activeTrees = [activeTrackerReceipt.contract.propositionHex,
        activeFamilyReceipt.contracts.duplicatePrevention.propositionHex,
        activeFamilyReceipt.contracts.pooledReserve.propositionHex];
      activeIssuances = [];
      for (const [index, role] of ROLES.entries()) activeIssuances.push(await materializeSubstrateFederatedSingletonIssuanceV1({
        label: role, genesisInput: funding[index]!, expectedNftIdHex: funding[index]!.boxId,
        propositionHex: activeTrees[index]!, registers: activeRegisters[index]!, singletonValue: 10_000_000n,
        fee: 1_100_000n, creationHeight: 1000,
      }));
    }
    const compiled = { familyCompilerInput: { trackerRequest: activeTrackerRequest,
      trackerReceipt: activeTrackerReceipt, templates }, familyReceipt: activeFamilyReceipt,
      discovery: { signer: session.signer, sources: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS } },
    } as unknown as compiledGenesis.ObservedSubstrateFederatedGenesisV1;
    const family = decodeSubstrateFederatedSettlementFamilyV1Profile(activeFamilyReceipt.profile);
    let joinedOperator: ReturnType<typeof createFederatedGenesisOperatorV1> | undefined;
    let joinedPreviousOperation: ReturnType<typeof createNativeSourceOperation> | undefined;
    let joinedCurrentOperation: ReturnType<typeof createNativeSourceOperation> | undefined;
    let joinedPreviousProof: ReturnType<typeof produceNativeOperationMintProof> | undefined;
    let joinedPreviousCheckpoint: Awaited<ReturnType<typeof attestFrontierNativeBurnCheckpointV1>>['attestation'] | undefined;
    let joinedPreviousExecution: Awaited<ReturnType<typeof executeFrontierNativeProofBoundReservationMintAndBurnV1>> | undefined;
    let joinedRpc: ReturnType<typeof createNativeContinuationRpcFixtureV1> | undefined;
    let joinedFrontierTarget: frontierOwner.OwnedFederatedGenesisDevnetTargetV1 | undefined;
    let joinedForeignCompiled: unknown;
    let joinedCompleted = false;
    let joinedFailed = false;
    if (joinedSource && joinedProfiles) {
      expect(canonicalJson(joinedProfiles.checkpointProfile)).toBe(canonicalJson(activeTrackerRequest.profile));
      joinedOperator = createFederatedGenesisOperatorV1();
      const sourceRuntime = Buffer.from('0061736d01000000', 'hex');
      const application = Object.freeze({
        sourceNetworkIdHex: family.sourceNetworkIdHex,
        sidechainIdHex: family.sidechainIdHex,
        bridgeAddressHex: family.bridgeAddressHex,
        tokenAddressHex: family.tokenAddressHex,
        settlementProfileIdHex: family.settlementProfileIdHex,
        bridgeRuntimeCodeSha256Hex: activeTrackerRequest.application.bridgeRuntimeCodeSha256Hex,
        bridgeRuntimeCodeBytes: activeTrackerRequest.application.bridgeRuntimeCodeBytes,
        tokenRuntimeCodeSha256Hex: activeTrackerRequest.application.tokenRuntimeCodeSha256Hex,
        tokenRuntimeCodeBytes: activeTrackerRequest.application.tokenRuntimeCodeBytes,
        sourceRuntimeCodeSha256Hex: createHash('sha256').update(sourceRuntime).digest('hex'),
        sourceRuntimeCodeBytes: sourceRuntime.length,
        runtimeProfileIdHex: activeTrackerRequest.application.runtimeProfileIdHex,
      });
      const runtimeProfileScaleHex = encodeRuntimeProfile({
        formatVersion: 4,
        lineageProfileIdHex: `0x${activeFamilyReceipt.profile.familyIdHex}`,
        sourceNetworkIdHex: `0x${application.sourceNetworkIdHex}`,
        sidechainIdHex: `0x${application.sidechainIdHex}`,
        bridgeAddressHex: `0x${application.bridgeAddressHex}`,
        tokenAddressHex: `0x${application.tokenAddressHex}`,
        bridgeRuntimeCodeSha256Hex: `0x${application.bridgeRuntimeCodeSha256Hex}`,
        bridgeRuntimeCodeBytes: application.bridgeRuntimeCodeBytes,
        tokenRuntimeCodeSha256Hex: `0x${application.tokenRuntimeCodeSha256Hex}`,
        tokenRuntimeCodeBytes: application.tokenRuntimeCodeBytes,
        settlementProfileIdHex: `0x${application.settlementProfileIdHex}`,
        ergoDepositFinalityPolicyIdHex: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
        sourceProofSystemIdHex: joinedSource.binding.federatedMintProfile.proofSystemIdHex,
        sourceProofProfileIdHex: joinedSource.binding.federatedMintProfile.proofProfileIdHex,
        activationHeight: '0',
        maxPendingBlocks: 64,
      });
      const runtimeProfile = decodeRuntimeProfile(runtimeProfileScaleHex);
      const candidateRuntimeProfileIdHex = runtimeProfileId(runtimeProfile);
      const exactApplication = application;
      const candidate = Object.freeze({ runtimeProfile, runtimeProfileScaleHex,
        runtimeProfileIdHex: candidateRuntimeProfileIdHex,
        genesisJsonSha256Hex: sha256CanonicalJson({ runtimeProfileScaleHex, application: exactApplication }) });
      Object.assign(compiled, {
        preparation: Object.freeze({ checkpointProfile: joinedProfiles.checkpointProfile, evmChainId: '4242',
          operatorAddressHex: joinedOperator.addressHex, launchDomainHex: joinedOperator.launchDomainHex,
          application: exactApplication }),
        candidate,
      });
      // The application identity is compiled before the candidate's V4 runtime
      // profile, which includes that compiled settlement family's identity.
      expect(exactApplication).toEqual(activeTrackerRequest.application);
      expect(candidate.runtimeProfileIdHex).not.toBe(`0x${exactApplication.runtimeProfileIdHex}`);
      expect(runtimeProfile.lineageProfileIdHex).toBe(`0x${activeFamilyReceipt.profile.familyIdHex}`);
      expect(runtimeProfile.sourceNetworkIdHex).toBe(`0x${family.sourceNetworkIdHex}`);
      expect(runtimeProfile.sourceProofProfileIdHex).toBe(joinedSource.binding.federatedMintProfile.proofProfileIdHex);
    }
    const orderedIssuances = activeIssuances.map((tx, ordinal) => ({ ordinal, role: ROLES[ordinal],
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
      if ((value !== compiled && (!joinedSourceFault || value !== joinedForeignCompiled)) || target !== setupTarget) {
        throw new Error('synthetic compiled read origin differs');
      }
      boundary.read();
    });
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1').mockImplementation(target => {
      if (target === setupTarget && boundary.setupActive) return setupBinding;
      if (phase === 'confirmation' && target === confirmationTarget && currentTargetActive) return confirmBinding;
      if (phase === 'confirmation' && target === foreignTarget) return binding('92');
      if (phase === 'second-confirmation' && target === secondConfirmationTarget) return secondConfirmBinding;
      throw new Error('synthetic initial execution target expired');
    });
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2').mockImplementation(target => {
      if (phase === 'second-frozen' && secondFrozenActive && target === secondFrozenTarget) return secondFrozenBinding;
      if (phase !== 'frozen' || target !== frozenTarget) throw new Error('synthetic frozen target expired');
      return frozenBinding;
    });
    const nativeLineage = vi.spyOn(owned, 'assertSubstrateFederatedNativeSetupTrackerLineageV1').mockImplementation((target, original) => {
      if (nativeParents.get(target) !== original) { injectionCount++; throw new Error('synthetic private native origin differs'); }
      expect(original).toBe(setupTarget);
      return owned.assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(target);
    });
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetTrackerFreshnessLineageV2').mockImplementation((target, parent) => {
      if (target === secondFreshnessTarget) {
        expect(parent).toEqual(secondFrozenBinding); expect(phase).toBe('second-freshness'); return secondFreshBinding;
      }
      expect(target).toBe(freshnessTarget); expect(parent).toEqual(frozenBinding); expect(phase).toBe('freshness'); return freshBinding;
    });
    vi.spyOn(owned, 'issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1').mockImplementation(target => {
      expect(target).toBe(phase === 'second-freshness' ? secondFreshnessTarget : freshnessTarget);
      return Object.freeze({ schema: 'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-completion.v1', version: 1 });
    });
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2').mockImplementation(target => {
      if (target === secondTransportTarget && secondTransportTarget !== undefined) {
        expect(phase).toBe('second-transport'); return secondTransportBinding;
      }
      expect(target).toBe(transportTarget); expect(phase).toBe('transport'); return transportBinding;
    });
    let trackerTxId: string | undefined;
    vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetTrackerConfirmationLineageV2').mockImplementation((target, parent, txId) => {
      const currentBinding = owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      if (target === secondConfirmationTarget) {
        expect(parent).toEqual(secondTransportBinding); expect(txId).toBe(secondTrackerTxId);
        expect(phase).toBe('second-confirmation'); expect(currentBinding).toEqual(secondConfirmBinding);
        return currentBinding;
      }
      expect(parent).toEqual(transportBinding); expect(txId).toBe(trackerTxId); expect(phase).toBe('confirmation');
      if (target !== confirmationTarget) throw new Error('synthetic foreign confirmation lineage');
      expect(currentBinding).toEqual(confirmBinding);
      return currentBinding;
    });
    const read = async (path: string, origin: string): Promise<any> => {
      if (![PRIMARY, WITNESS].includes(origin)) throw new Error('unexpected synthetic RPC origin');
      if (!injectionCount && ((fault === 'source disposed during tracker' && phase === 'frozen' && path === '/blocks/at/1')
        || (fault === 'source disposed during payout' && payoutStarted && path.startsWith('/utxo/byId/')))) {
        injectionCount++; boundary.sourceActive = false;
      }
      if (path === '/blocks/lastHeaders/10') return [...signingHeaders].reverse();
      if (path === '/blocks/lastHeaders/1') return [{ height: tip(), id: headerId(tip()), parentId: headerId(tip() - 1) }];
      if (path === '/blocks/at/1') return [GENESIS];
      if (path === '/info') return { network: 'devnet', fullHeight: tip() };
      if (path.startsWith('/utxo/byId/')) {
        const box = boxes.get(path.slice('/utxo/byId/'.length));
        if (box) {
          const observed = structuredClone(box);
          const successorStage = fault === 'continuation successor changes during source' ? 'source'
            : fault === 'continuation successor changes during vault' ? 'vault' : undefined;
          if (!injectionCount && successorStage === continuation.stage && box.boxId === continuationReserveId) {
            injectionCount++;
            boxes.set(box.boxId, { ...box, value: String(BigInt(box.value) + 1n) });
          }
          if (!injectionCount && fault === 'continuation disposed during builder'
            && continuation.stage === 'builder' && box.boxId === continuationReserveId) {
            injectionCount++;
            boundary.sourceActive = false;
          }
          if (!injectionCount && fault === 'continuation builder snapshots caller input'
            && continuation.stage === 'builder' && box.boxId === continuationReserveId) {
            injectionCount++;
            mutateContinuationBuilderInput?.();
          }
          return observed;
        }
        if (fault === 'continuation external fees spent first change') {
          throw new Error('synthetic spent first fee change input');
        }
      }
      if (path.startsWith('/blockchain/transaction/byId/')) {
        const id = path.slice('/blockchain/transaction/byId/'.length);
        const inclusionHeight = confirmed.get(id);
        if (inclusionHeight !== undefined) return { id, inclusionHeight, headerId: headerId(inclusionHeight), numConfirmations: tip() - inclusionHeight };
      }
      if (/^\/blocks\/at\/[0-9]+$/.test(path)) return [headerId(Number(path.slice('/blocks/at/'.length)))];
      const headerMatch = /^\/blocks\/([0-9a-f]{64})\/header$/.exec(path);
      if (headerMatch) {
        const height = Array.from({ length: 64 }, (_, index) => tip() - index)
          .find(value => headerId(value) === headerMatch[1]);
        if (height !== undefined) return { height, id: headerId(height), parentId: headerId(height - 1) };
      }
      throw new Error(`unexpected synthetic RPC path ${path}`);
    };
    const signedId = (body: Record<string, unknown>) => {
      const tx = wasm.Transaction.from_json(JSON.stringify(body)); const id = tx.id();
      try { return id.to_str() as string; } finally { id.free(); tx.free(); }
    };
    const registerFeeTransaction = (checked: Readonly<{
      transaction: Readonly<{
        txId: string;
        eip12Tx: Readonly<{ inputs: readonly Readonly<{ boxId: string }>[] }>;
        outputs: readonly Readonly<Eip12Box>[];
      }>;
    }>) => feeTransactions.set(checked.transaction.txId, Object.freeze({
      inputs: checked.transaction.eip12Tx.inputs,
      outputs: checked.transaction.outputs,
    }));
    const feeProfiles = [SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE,
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE] as const;
    const captureFirstFeeRows = () => {
      for (const profile of feeProfiles) {
        const rows = state.getConfirmedErgoOperationalTransactionAttempts(profile);
        expect(rows).toHaveLength(1);
        firstFeeRowSnapshots.set(profile, { txId: rows[0]!.expectedTxId, snapshot: canonicalJson(rows[0]) });
      }
    };
    const assertFirstFeeRowsUnchanged = (expectedProfileCount = 1) => {
      for (const profile of feeProfiles) {
        const rows = state.getConfirmedErgoOperationalTransactionAttempts(profile);
        expect(rows).toHaveLength(expectedProfileCount);
        const first = firstFeeRowSnapshots.get(profile);
        expect(first).toBeDefined();
        const original = rows.find(row => row.expectedTxId === first!.txId);
        expect(original).toBeDefined();
        expect(canonicalJson(original)).toBe(first!.snapshot);
      }
    };
    vi.spyOn(helpers, 'ngetDirect').mockImplementation((path, origin) => read(path, origin!));
    const fundingObservations = new WeakSet<object>();
    vi.spyOn(rewardDiscovery, 'discoverSubstrateFederatedRewardInputsV2').mockImplementation(async () => {
      if (continuationFundingObservation === undefined) throw new Error('synthetic continuation funding unavailable');
      const observed = structuredClone(continuationFundingObservation);
      fundingObservations.add(observed);
      continuationFundingReads++;
      if (loseCustodyAfterFundingAwait && continuationFundingReads === 2) boundary.sourceActive = false;
      return observed as never;
    });
    vi.spyOn(rewardDiscovery, 'assertSubstrateFederatedRewardInputDiscoveryV2Provenance').mockImplementation(value => {
      if (value === null || typeof value !== 'object' || !fundingObservations.has(value)) {
        throw new Error('synthetic continuation funding provenance absent');
      }
    });
    vi.spyOn(helpers, 'ncheck').mockImplementation(async (path, body, origin) => {
      expect(path).toBe('/transactions/check'); expect(origin).toBe(PRIMARY);
      checkBodies.push(body as Record<string, unknown>); return signedId(body as Record<string, unknown>);
    });
    const signCalls = vi.spyOn(wasm.Wallet.prototype, 'sign_transaction');
    const prepare = fleet.prepareLocalWasmRootCheckCandidates;
    const prepareFromNode = fleet.prepareLocalWasmRootCheckCandidatesFromNode;
    const check = fleet.checkSignedTransaction;
    const internalFault = /^source disposed inside (tracker|payout) (preparation|checker)$/.exec(fault);
    const continuationInternal = /^continuation disposed during (source|vault) (preparation|checker)$/.exec(fault);
    const continuationFeeInternal = /^continuation external fees custody during (preparation|checker)$/.exec(fault);
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
      if (continuationFeeInternal?.[1] === 'preparation' && continuation.stage === 'withdrawal-fee') {
        disposeInside(input.assertActive);
      }
      if (phase === 'second-frozen' && fault === 'continuation second tracker custody during preparation') {
        disposeInside(input.assertActive);
      }
      if (secondPayoutStarted && fault === 'continuation second payout custody during preparation') {
        disposeInside(input.assertActive);
      }
      if (phase === 'second-frozen' && fault === 'continuation second tracker target during preparation') {
        expect(input.assertActive).not.toThrow();
        injectionCount++; injectedSignCalls = signCalls.mock.calls.length;
        injectedCheckCalls = checkBodies.length; secondFrozenActive = false;
      }
      return pending;
    });
    vi.spyOn(fleet, 'prepareLocalWasmRootCheckCandidatesFromNode').mockImplementation(async input => {
      const pending = prepareFromNode(input);
      if (continuationInternal?.[1] === continuation.stage && continuationInternal[2] === 'preparation') {
        disposeInside(input.assertActive);
      }
      return pending;
    });
    vi.spyOn(fleet, 'checkSignedTransaction').mockImplementation(async (...args) => {
      const pending = check(...args);
      // The real checker passed its entry veto and suspended at its import.
      if (internalStage('checker')) disposeInside(args[3]);
      if (continuationInternal?.[1] === continuation.stage && continuationInternal[2] === 'checker') {
        disposeInside(args[3]);
      }
      if (continuationFeeInternal?.[1] === 'checker' && continuation.stage === 'withdrawal-fee') {
        disposeInside(args[3]);
      }
      if (phase === 'second-frozen' && fault === 'continuation second tracker custody during checker') {
        disposeInside(args[3]);
      }
      if (secondPayoutStarted && fault === 'continuation second payout custody during checker') {
        disposeInside(args[3]);
      }
      return pending;
    });
    if (internalFault?.[2] === 'checker' || continuationInternal?.[2] === 'checker'
      || continuationFeeInternal?.[1] === 'checker' || fault === 'continuation second tracker custody during checker'
      || fault === 'continuation second payout custody during checker') {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    }
    vi.spyOn(axios, 'create').mockImplementation(config => ({
      get: async (path: string, request?: { responseType?: string }) => {
        try {
          const data = await read(path, config!.baseURL!);
          return { status: 200, data: request?.responseType === 'arraybuffer'
            ? Buffer.from(JSON.stringify(data)) : data };
        }
        catch (error) {
          if (path.startsWith('/utxo/byId/')) return { status: 404,
            data: request?.responseType === 'arraybuffer' ? Buffer.from('null') : null };
          throw error;
        }
      },
    }) as never);
    vi.spyOn(axios, 'get').mockImplementation(async url => {
      const value = String(url);
      const origin = value.startsWith(PRIMARY) ? PRIMARY : value.startsWith(WITNESS) ? WITNESS : undefined;
      const prefix = origin === undefined ? undefined : `${origin}/utxo/byId/`;
      const box = prefix !== undefined && value.startsWith(prefix) ? boxes.get(value.slice(prefix.length)) : undefined;
      if (box !== undefined) return { data: structuredClone(box) } as never;
      throw Object.assign(new Error('synthetic spent input'), { isAxiosError: true, response: { status: 404 } });
    });
    vi.spyOn(axios, 'post').mockImplementation(async (url, body) => {
      expect(url).toBe(`${PRIMARY}/transactions`);
      const payload = body as Record<string, unknown>;
      const id = signedId(payload);
      const feeTransaction = feeTransactions.get(id);
      if (feeTransaction !== undefined) {
        expect(['setup', 'confirmation']).toContain(phase);
        feeSubmissionBodies.push(payload);
        const inclusionHeight = tip() + 1;
        for (const input of feeTransaction.inputs) boxes.delete(input.boxId);
        publish(...feeTransaction.outputs);
        confirmed.set(id, inclusionHeight);
        signingHeaders = headerContext(inclusionHeight + 11);
        if (loseFeeTransportResponse) throw new Error('synthetic continuation fee response lost');
        return { status: 200, data: id };
      }
      expect(['transport', 'confirmation', 'second-transport', 'second-confirmation']).toContain(phase);
      submissionBodies.push(payload);
      if (id === secondContinuationPacket?.transactions.sourceLockCreation.txId) {
        secondSourceInclusionHeight = tip() + 1;
        confirmed.set(id, secondSourceInclusionHeight);
        boxes.delete(secondContinuationPacket.boxes.sourceFundingInput.boxId);
        publish(secondContinuationPacket.boxes.sourceLock, secondContinuationPacket.boxes.transitionFeeFunding);
        signingHeaders = headerContext(secondSourceInclusionHeight + REQUIRED_SUCCESSOR_DEPTH + 1);
        if (loseSourceTransportResponse) throw new Error('synthetic continuation source response lost');
      } else if (id === secondContinuationPacket?.transactions.reserveTransition.txId) {
        secondVaultInclusionHeight = tip() + 1;
        confirmed.set(id, secondVaultInclusionHeight);
        boxes.delete(secondContinuationPacket.boxes.reservePredecessor.boxId);
        boxes.delete(secondContinuationPacket.boxes.sourceLock.boxId);
        boxes.delete(secondContinuationPacket.boxes.transitionFeeFunding.boxId);
        publish(secondContinuationPacket.boxes.reserveSuccessor);
        signingHeaders = headerContext(secondVaultInclusionHeight + REQUIRED_SUCCESSOR_DEPTH + 1);
      } else {
        if (feeContinuationFault && payoutStarted) {
          const inclusionHeight = tip() + 1;
          confirmed.set(id, inclusionHeight);
          signingHeaders = headerContext(inclusionHeight + 11);
        } else {
          confirmed.set(id, feeContinuationFault ? 1039 : 1031);
        }
      }
      return { status: 200, data: id };
    });
    try {
      const batch = await session.runNativeGenesisRetainingSigner(compiled, setupTarget);
      const sourceFundingOutputs = (await materializeUnsignedTransaction({ inputs: [{ ...funding[0]!, extension: {} }], dataInputs: [],
        outputs: [{ value: '26000000', ergoTree: signer.p2pkErgoTreeHex, creationHeight: 1000 },
          { value: '24000000', ergoTree: signer.p2pkErgoTreeHex, creationHeight: 1000 }] }, 'native deposit funding')).outputs;
      const sourceFunding = sourceFundingOutputs[0]!;
      const firstSourceIntent = { formatVersion: 2 as const, sourceNetworkIdHex: family.sourceNetworkIdHex,
        sidechainIdHex: family.sidechainIdHex, bridgeAddressHex: family.bridgeAddressHex, tokenAddressHex: family.tokenAddressHex,
        settlementProfileIdHex: family.settlementProfileIdHex, admissionProfileIdHex: activeFamilyReceipt.profile.familyIdHex,
        sourceAssetIdHex: family.settlementAssetIdHex, amountNanoErg: '20000000',
        recipientAddressHex: joinedOperator?.addressHex ?? '61'.repeat(20) };
      const packet = await buildSubstrateFederatedNativeGenesisPegInPacketV1({ batch, target: setupTarget,
        sourceFundingInput: sourceFunding, sourceIntent: firstSourceIntent,
        depositorErgoTreeHex: signer.p2pkErgoTreeHex,
        creationHeights: { currentErgoHeight: 1001, sourceLockCreation: 1001, reserveTransition: 1001 } });
      signingHeaders = headerContext(1001);
      publish(packet.boxes.sourceFundingInput);
      const firstSourceCheck = await session.checkNativePegInSourceLockRetainingSignerV1(packet, setupTarget);
      publish(packet.boxes.reservePredecessor, packet.boxes.sourceLock, packet.boxes.transitionFeeFunding);
      const firstVaultCheck = await session.checkNativePegInCommittedVaultRetainingSignerV1(packet, setupTarget);
      if (joinedSource && joinedOperator) {
        const firstPath = Array.from({ length: REQUIRED_SUCCESSOR_DEPTH + 1 }, (_value, index) => headerId(1001 + index));
        const firstObservation = Object.freeze({
          schema: 'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1' as const,
          version: 1 as const,
          status: 'exact_transition_inputs_spent_and_reserve_successor_unspent' as const,
          expectedTxId: packet.transactions.reserveTransition.txId,
          sourceFundingBoxIdHex: packet.boxes.sourceFundingInput.boxId,
          reservePredecessorBoxIdHex: packet.boxes.reservePredecessor.boxId,
          sourceLockBoxIdHex: packet.boxes.sourceLock.boxId,
          transitionFeeFundingBoxIdHex: packet.boxes.transitionFeeFunding.boxId,
          reserveSuccessorBoxIdHex: packet.boxes.reserveSuccessor.boxId,
          confirmationHeight: 1001,
          confirmationHeaderIdHex: firstPath[0]!,
          confirmationObservationDigestHex: sha256CanonicalJson({ txId: packet.transactions.reserveTransition.txId, height: 1001 }),
          finalityTargetHeight: 1011,
          finalityTargetHeaderIdHex: firstPath.at(-1)!,
          requiredSuccessorDepth: REQUIRED_SUCCESSOR_DEPTH,
          finalityPathHeaderIdsHex: firstPath,
          observedTipHeight: 1011,
          observedTipHeaderIdHex: firstPath.at(-1)!,
          processBindingDigestHex: setupBinding.processBindingDigestHex,
          executionTargetIdentityDigestHex: setupBinding.executionTargetIdentityDigestHex,
          primaryObservationDigestHex: sha256CanonicalJson({ side: 'primary', txId: packet.transactions.reserveTransition.txId }),
          witnessObservationDigestHex: sha256CanonicalJson({ side: 'witness', txId: packet.transactions.reserveTransition.txId }),
          boundaries: Object.freeze({ exactDualLoopbackNodesAgreed: true as const,
            originalSourceFundingRemainsSpent: true as const, exactReservePredecessorSpent: true as const,
            exactSourceLockSpent: true as const, exactTransitionFeeFundingSpent: true as const,
            exactReserveSuccessorUnspent: true as const, sourceLockConsumptionEstablished: true as const,
            reserveLineageEstablished: true as const, depositCommitmentStateEstablished: true as const,
            exactRequiredDepthAncestryObserved: true as const, exactFinalityTargetSelected: true as const,
            ergoPowAuthenticated: false as const, mintAuthorized: false as const,
            fundsAuthorityEstablished: false as const, gate5Closed: false as const }),
          observationDigestHex: sha256CanonicalJson({ txId: packet.transactions.reserveTransition.txId, firstPath }),
        });
        const assertVaultObservation = nativeVaultObserver
          .assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1;
        vi.spyOn(nativeVaultObserver, 'assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1')
          .mockImplementation((value, currentTarget, currentBatch, currentPacket) =>
            value === firstObservation && currentTarget === setupTarget && currentBatch === batch && currentPacket === packet
              ? packet : assertVaultObservation(value, currentTarget, currentBatch, currentPacket));
        const firstDraftInputs = Object.freeze({ target: setupTarget, batch, packet,
          committedVaultObservation: firstObservation });
        const firstDraft = buildNativeMintDraft(firstDraftInputs);
        const firstEvidenceReceipt = collectNativeReserveEvidence({ ...firstDraftInputs, draft: firstDraft });
        joinedPreviousOperation = createNativeSourceOperation(joinedSource);
        joinedPreviousProof = produceNativeOperationMintProof(joinedPreviousOperation, {
          draftInputs: firstDraftInputs, draft: firstDraft, evidenceReceipt: firstEvidenceReceipt,
          issuedAtNativeHeight: '0', expiresAtNativeHeight: '32',
        });
        const sourceRuntimeCodeHex = '0061736d01000000';
        const joinedRecipientErgoTreeHex = `0x${signer.p2pkErgoTreeHex.replace(/^0x/, '')}`;
        joinedRpc = createNativeContinuationRpcFixtureV1({
          operator: joinedOperator,
          firstProof: joinedPreviousProof,
          runtimeProfileScaleHex: (compiled as any).candidate.runtimeProfileScaleHex,
          sourceRuntimeCodeHex,
          sidechainIdHex: family.sidechainIdHex,
          bridgeAddressHex: family.bridgeAddressHex,
          tokenAddressHex: family.tokenAddressHex,
          ergoRecipientTreeHex: joinedRecipientErgoTreeHex,
          mintAmountNanoErg: 20_000_000n,
          burnGrossAmountNanoErg: 15_000_000n,
          evmChainId: 4242n,
        });
        joinedFrontierTarget = Object.freeze({ primaryRpcUrl: 'http://127.0.0.1:19955',
          witnessRpcUrl: 'http://127.0.0.1:19956',
          genesisJsonSha256Hex: (compiled as any).candidate.genesisJsonSha256Hex });
        vi.spyOn(frontierOwner, 'assertOwnedFederatedGenesisDevnetTargetV1').mockImplementation(value => {
          if (value !== joinedFrontierTarget) throw new Error('joined native target lacks exact fixture provenance');
        });
        vi.stubGlobal('fetch', vi.fn(joinedRpc.fetch));
        const firstDirectory = createPersistentNativeAttemptDirectory('bridge-native-real-source-parent-');
        joinedPreviousExecution = await executeFrontierNativeProofBoundReservationMintAndBurnV1({
          signing: { operator: joinedOperator, sourceOperation: joinedPreviousOperation, draft: firstDraft,
            proof: joinedPreviousProof, compiled, target: setupTarget, frontierTarget: joinedFrontierTarget,
            expectedStorage: joinedRpc.expectedStorage, expectedGenesisHashHex: joinedRpc.expectedGenesisHashHex },
          attemptDirectory: firstDirectory,
          broadcastScope: 'fed-native-local-synthetic-reservation-mint-and-burn-only',
          grossAmountNanoErg: '15000000', recipientErgoTreeHex: joinedRecipientErgoTreeHex,
        });
        const firstCheckpoint = await attestFrontierNativeBurnCheckpointV1({
          execution: joinedPreviousExecution,
          admissionValidFromErgoHeight: '100', admissionExpiresAtErgoHeight: '120',
        });
        joinedPreviousCheckpoint = firstCheckpoint.attestation;
        expect(joinedPreviousExecution).toMatchObject({
          mint: { mintExecuted: true, amountNanoErg: '20000000' },
          burn: { blockHeight: 4, grossAmountNanoErg: '15000000', netAmountNanoErg: '10000000' },
          burnExecuted: true,
        });
        expect(joinedPreviousCheckpoint.checkpointStatement.sourceNativeBlockHeight).toBe('4');
        expect(readdirSync(firstDirectory).sort()).toEqual(['native-approve-attempt.json', 'native-burn-attempt.json',
          'native-mint-attempt.json', 'native-reservation-attempt.json']);
      }
      signingHeaders = headerContext(1012);
      publish(activeIssuances[0]!.outputs[1]!, activeIssuances[1]!.outputs[1]!);
      const withdrawalFee = await session.checkNativeWithdrawalFeeFundingV1(setupTarget);
      const trackerFee = await session.checkNativeTrackerFeeFundingV1(setupTarget);
      expect(withdrawalFee.transaction.eip12Tx.inputs[0]!.boxId).toBe(activeIssuances[1]!.outputs[1]!.boxId);
      expect(trackerFee.transaction.eip12Tx.inputs[0]!.boxId).toBe(activeIssuances[0]!.outputs[1]!.boxId);
      expect(withdrawalFee.transaction.outputs[0]!.boxId).not.toBe(trackerFee.transaction.outputs[0]!.boxId);
      expect(checkBodies).toHaveLength(7);
      if (feeContinuationFault && fault !== 'continuation external fees unclaimed first check') {
        registerFeeTransaction(withdrawalFee);
        registerFeeTransaction(trackerFee);
        const firstWithdrawalFee = await executeWithdrawalFeeFunding({ target: setupTarget, checked: withdrawalFee, state });
        const firstTrackerFee = await executeTrackerFeeFunding({ target: setupTarget, checked: trackerFee, state });
        expect(firstWithdrawalFee).toMatchObject({ expectedTxId: withdrawalFee.transaction.txId,
          feeInputBox: withdrawalFee.transaction.outputs[0] });
        expect(firstTrackerFee).toMatchObject({ expectedTxId: trackerFee.transaction.txId,
          feeInputBox: trackerFee.transaction.outputs[0] });
        expect(feeSubmissionBodies.map(signedId)).toEqual([withdrawalFee.transaction.txId, trackerFee.transaction.txId]);
        captureFirstFeeRows();
      }
      const firstFeeExecutorCheckOffset = checkBodies.length - 7;
      const leaf = { sidechainIdHex: family.sidechainIdHex, sidechainBlockHashHex: 'a2'.repeat(32),
        sidechainTxHashHex: 'a4'.repeat(32), eventIndex: 2,
        burnIdHex: deriveTrustlessBurnIdHex({ sidechainIdHex: family.sidechainIdHex, sidechainTxHashHex: 'a4'.repeat(32), eventIndex: 2 }),
        recipientErgoTreeHashHex: Buffer.from(blakejs.blake2b(Buffer.from(signer.p2pkErgoTreeHex, 'hex'), undefined, 32)).toString('hex'),
        amountNanoErg: continuationFault ? '15000000' : '20000000', assetIdHex: '00'.repeat(32) };
      const proof = buildTrustlessBurnInclusionProof([leaf], leaf.burnIdHex);
      const statement = buildSubstrateFederatedCheckpointStatementV1({ ...vector.input.statement,
        ...activeTrackerRequest.application, profile: activeTrackerRequest.profile, sourceNativeBlockHeight: '4',
        sourceNativeBlockHashHex: 'a1'.repeat(32), executionBlockHashHex: leaf.sidechainBlockHashHex,
        bridgeEventRootHex: proof.bridgeEventRootHex, burnLeafCount: proof.leafCount,
        ...(fault === 'tracker WASM expiry' ? { admissionExpiresAtErgoHeight: '1031' } : {}) });
      const membership = buildErgoExtensionMembershipProof([{ key: Buffer.from('0401', 'hex'),
        value: Buffer.from(encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex), 'hex') }], Buffer.from('0401', 'hex'));
      signingHeaders = headerContext(feeContinuationFault ? 1040 : 1030, membership.root.toString('hex'), 1);
      const observedHeaderContext = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, { rawHeaders: signingHeaders,
        anchorContextIndex: 1, expectedAnchorHeaderIdHex: String(signingHeaders[1]!.id),
        expectedAnchorExtensionRootHex: membership.root.toString('hex') });
      publish(activeIssuances[0]!.outputs[0]!, trackerFee.transaction.outputs[0]!);
      const context = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
        compilerRequest: activeTrackerRequest, compilerReceipt: activeTrackerReceipt,
        trackerInputBox: activeIssuances[0]!.outputs[0]!,
        observedHeaderContext, encodedStatementHex: statement.encodedStatementHex, extensionMembershipProofHex: membership.proof.toString('hex') });
      const transaction = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({ trackerContext: context,
        trackerInputBox: activeIssuances[0]!.outputs[0]!, feeInputBox: trackerFee.transaction.outputs[0]!,
        feePayerPublicKeyHex: signer.publicKeyHex });
      trackerTxId = transaction.unsignedTransactionIdHex;
      transportTarget = Object.freeze({ ...setupTarget, checkpointBound: true as const,
        reservationFreshnessCheckBound: true as const, trackerTransport: true as const,
        sameProcessCanonicalConfirmation: true as const,
        candidateMiningRequiresExpectedTransaction: true as const,
        expectedTransactionIdHex: trackerTxId });
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
      expect(nativeLineage).toHaveBeenCalled(); expect(checkBodies).toHaveLength(8 + firstFeeExecutorCheckOffset);
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
      if (fault === 'valid' || fault === 'tracker WASM expiry') {
        const retained = { signedBody: submissionBodies[0]!, signedCandidate: checked.result.signedCandidate,
          boxes: transaction.inputBoxes };
        const originalHeaders = observedHeaderContext.headers.map(header => header.raw);
        const anchor = observedHeaderContext.anchorHeader;
        const expectAnchor = (headers: readonly Readonly<Record<string, unknown>>[], index: number) => {
          expect(headers[index]!.id).toBe(anchor.id);
          expect(headers[index]!.height).toBe(anchor.height);
          expect(headers[index]!.extensionHash).toBe(anchor.extensionRootHex);
        };
        expectAnchor(originalHeaders, 1);
        expect(verifyRetainedTrackerAtHeaders({ ...retained, headers: originalHeaders })).toEqual({
          proofs: [true, true], transactionError: null });
        if (fault === 'valid' && process.env.BRIDGE_NATIVE_TRACKER_MEMPOOL_FIXTURE !== undefined) {
          // Explicit JVM fixture export from this fresh synthetic component run.
          // Only public signed bytes, input boxes and headers leave the test.
          const output = process.env.BRIDGE_NATIVE_TRACKER_MEMPOOL_FIXTURE;
          expect(isAbsolute(output)).toBe(true);
          const parent = realpathSync(dirname(output));
          expect(parent.toLowerCase()).toBe(resolve(dirname(output)).toLowerCase());
          const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
          const location = relative(root, parent);
          expect(isAbsolute(location) || location === '..' || location.startsWith('..\\') || location.startsWith('../')).toBe(true);
          const space = statfsSync(parent, { bigint: true });
          expect(space.bavail * space.bsize).toBeGreaterThanOrEqual(10n * 1024n ** 3n);
          const signed = wasm.Transaction.from_json(JSON.stringify(retained.signedBody));
          let signedBytes: Buffer;
          try { signedBytes = Buffer.from(signed.sigma_serialize_bytes()); } finally { signed.free(); }
          expect(createHash('sha256').update(signedBytes).digest('hex')).toBe(retained.signedCandidate.signedTransactionBytesSha256Hex);
          const fixture = Buffer.from(JSON.stringify({
            schema: 'e2s.substrate-federated-native-tracker-mempool-fixture.v1', version: 1,
            transaction: { id: attempt.expectedTxId, signedBytesHex: signedBytes.toString('hex'),
              signedBytesSha256Hex: retained.signedCandidate.signedTransactionBytesSha256Hex,
              signedBytesLength: signedBytes.length, json: retained.signedBody },
            inputs: transaction.inputBoxSigmaHex.map((serializedHex, index) => ({ id: transaction.inputBoxes[index]!.boxId, serializedHex })),
            headers: observedHeaderContext.headers.map(header => ({ id: header.id, serializedHex: header.serializedHex })),
            anchor: { id: anchor.id, height: anchor.height, index: 1, extensionRootHex: anchor.extensionRootHex },
            checkpointExpiryHeight: Number(statement.admissionExpiresAtErgoHeight),
          }) + '\n', 'utf8');
          expect(fixture.length).toBeLessThanOrEqual(1024 * 1024);
          expect(fixture.every(byte => byte < 128)).toBe(true);
          writeFileSync(output, fixture, { flag: 'wx', mode: 0o600 });
          expect(readFileSync(output)).toEqual(fixture);
          console.info(`native_tracker_mempool_fixture_sha256=${createHash('sha256').update(fixture).digest('hex')}`);
        }
        const firstMined = appendSyntheticMinedHeader(originalHeaders);
        expectAnchor(firstMined, 2);
        // Same parents as the check, actual synthetic H1030 preheader instead
        // of simplifiedUpcoming. This verifies bytes, not node inclusion.
        expect(verifyRetainedTrackerAtHeaders({ ...retained, headers: originalHeaders, minedHeader: firstMined[0] })).toEqual({
          proofs: [true, true], transactionError: null });
        const next = verifyRetainedTrackerAtHeaders({ ...retained, headers: firstMined,
          minedHeader: appendSyntheticMinedHeader(firstMined)[0] });
        if (fault === 'tracker WASM expiry') {
          expect(Number(firstMined[0]!.height) + 1).toBe(Number(statement.admissionExpiresAtErgoHeight));
          expect(next.proofs).toEqual([false, true]);
          expect(next.transactionError).not.toBeNull();
          expect(submissionBodies).toHaveLength(1);
          finalizeTracker(attempt, submitted);
          return;
        }
        expect(next).toEqual({ proofs: [true, true], transactionError: null });
        let lastAnchorHeaders = firstMined;
        for (let index = 1; index < 8; index++) lastAnchorHeaders = appendSyntheticMinedHeader(lastAnchorHeaders);
        expectAnchor(lastAnchorHeaders, 9);
        expect(verifyRetainedTrackerAtHeaders({ ...retained, headers: lastAnchorHeaders })).toEqual({
          proofs: [true, true], transactionError: null });
        const retiredHeaders = appendSyntheticMinedHeader(lastAnchorHeaders);
        expect(retiredHeaders.some(header => header.id === anchor.id)).toBe(false);
        expect(Number(retiredHeaders[0]!.height) + 1).toBeLessThan(Number(statement.admissionExpiresAtErgoHeight));
        const retired = verifyRetainedTrackerAtHeaders({ ...retained, headers: retiredHeaders });
        expect(retired.proofs).toEqual([false, true]);
        expect(retired.transactionError).not.toBeNull();
      }
      finalizeTracker(attempt, submitted);
      const admitted = await materializeUnsignedTransaction(transaction.eip12UnsignedTransaction as never, 'native admitted tracker');
      signingHeaders = headerContext(1050);
      publish(admitted.outputs[0]!, packet.boxes.reserveSuccessor, activeIssuances[1]!.outputs[0]!,
        withdrawalFee.transaction.outputs[0]!);
      for (const tx of [packet.transactions.reserveTransition, activeIssuances[1]!, withdrawalFee.transaction]) confirmed.set(tx.txId, 1020);
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
      const withdrawalClaim = { trackerIdentity: { sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
        sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex, executionBlockHashHex: statement.executionBlockHashHex },
        burnLeaf: leaf, leafIndex: proof.leafIndex, leafCount: proof.leafCount, burnProof: proof.proof,
        recipientErgoTreeHex: signer.p2pkErgoTreeHex };
      const payout = continuationFault && fault !== 'continuation old terminal signer'
        ? session.checkNativeWithdrawalRetainingContinuationSignerV2(withdrawalClaim, confirmationTarget)
        : session.checkNativeWithdrawalV2(withdrawalClaim, confirmationTarget);
      if (fault === 'source disposed during payout' || internalFault?.[1] === 'payout') {
        await expect(payout).rejects.toThrow(internalFault?.[2] === 'checker' ? /withdrawal JVM node check failed/ : /source custody disposed/);
        expect(injectionCount).toBe(1); expect(checkBodies).toHaveLength(10);
        if (internalFault) expect(checkBodies).toHaveLength(injectedCheckCalls!);
        if (internalFault?.[2] === 'preparation') expect(signCalls).toHaveBeenCalledTimes(injectedSignCalls!);
      } else {
        const result = await payout;
        expect(result.checkedResult.txId).toBe(result.packet.transaction.txId);
        expect(result.packet.transaction.eip12Tx.inputs.map(box => box.boxId)).toEqual([
          packet.boxes.reserveSuccessor.boxId, activeIssuances[1]!.outputs[0]!.boxId,
          withdrawalFee.transaction.outputs[0]!.boxId]);
        expect(result.packet.transaction.eip12Tx.dataInputs.map(box => box.boxId)).toEqual([admitted.outputs[0]!.boxId]);
        expect(BigInt(result.packet.reserve.inputValueNanoErg) - BigInt(result.packet.reserve.outputValueNanoErg))
          .toBe(continuationFault ? 15_000_000n : 20_000_000n);
        expect(result.packet.reserve.outputLiabilityNanoErg).toBe(continuationFault ? '5000000' : '0');
        expect(signedId(checkBodies.at(-1)!)).toBe(result.packet.transaction.txId);
        expect(checkBodies).toHaveLength(11 + firstFeeExecutorCheckOffset);
        if (continuationFault && fault !== 'continuation old terminal signer') expect(() => assertSigner(session.signer)).not.toThrow();
        else expect(() => assertSigner(session.signer)).toThrow();
        await expect(authorizeWithdrawal({ ...result }, confirmationTarget)).rejects.toThrow(/provenance/);
        const payoutAuthorization = await authorizeWithdrawal(result, confirmationTarget);
        const payoutAttempt = reserveWithdrawal(payoutAuthorization, state);
        expect(state.getErgoOperationalTransactionAttempt(payoutAttempt.expectedTxId)?.status).toBe('pending');
        await expect(authorizeWithdrawal(result, confirmationTarget)).rejects.toThrow(/already claimed/);
        if (continuationFault) {
          if (fault === 'continuation legacy replay') {
            await expect(session.checkNativeWithdrawalV2(withdrawalClaim, confirmationTarget)).rejects.toThrow(/absent|consumed|disposed/);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          phase = 'confirmation';
          const payoutSubmission = await submitWithdrawal(confirmationTarget, payoutAttempt);
          expect(payoutSubmission.status).toBe('accepted');
          finalizeWithdrawal(payoutAttempt, payoutSubmission);
          for (const input of result.packet.transaction.eip12Tx.inputs) boxes.delete(input.boxId);
          publish(result.packet.boxes.reserveSuccessor, result.packet.boxes.duplicatePreventionSuccessor,
            result.packet.boxes.payout, result.packet.boxes.trackerDataInput);
          if (!confirmed.has(result.packet.transaction.txId)) confirmed.set(result.packet.transaction.txId, 1032);
          phase = 'confirmation';
          const payoutConfirmation = await createObserver(confirmationTarget, GENESIS)
            .observe(payoutAttempt.expectedTxId, PRIMARY);
          expect(payoutConfirmation?.status).toBe('confirmed');

          const secondSourceFunding = sourceFundingOutputs[1]!;
          const secondCreationHeight = feeContinuationFault ? tip() + 1 : 1051;
          const secondInput = {
            batch, target: confirmationTarget, previousPacket: packet,
            withdrawal: { check: result, attempt: payoutAttempt },
            sourceFundingInput: secondSourceFunding,
            sourceIntent: { ...firstSourceIntent, amountNanoErg: '20000000',
              recipientAddressHex: joinedOperator?.addressHex ?? '62'.repeat(20) },
            depositorErgoTreeHex: signer.p2pkErgoTreeHex,
            creationHeights: { currentErgoHeight: secondCreationHeight,
              sourceLockCreation: secondCreationHeight, reserveTransition: secondCreationHeight },
          };
          if (fault === 'continuation unconfirmed payout') {
            continuation.stage = 'builder';
            await expect(buildSubstrateFederatedNativeContinuationPegInPacketV1(secondInput))
              .rejects.toThrow(/confirmed|in-process provenance/);
            expect(state.getErgoOperationalTransactionAttempt(payoutAttempt.expectedTxId)?.status).toBe('accepted');
            expect(() => assertSigner(session.signer)).not.toThrow();
            return;
          }
          await confirmWithdrawal(payoutAttempt, confirmationTarget, payoutConfirmation!);
          expect(state.getErgoOperationalTransactionAttempt(payoutAttempt.expectedTxId)?.status).toBe('confirmed');
          boxes.delete(result.packet.boxes.payout.boxId);
          expect(boundary.setupActive).toBe(false);
          expect(session.signer.publicKeyHex).toBe(signer.publicKeyHex);
          if (fault === 'continuation valid') {
            expect(() => assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(packet, batch, setupTarget)).not.toThrow();
            expect(() => assertSubstrateFederatedNativeGenesisPegInPacketV1(packet, batch, setupTarget)).toThrow(/expired|inactive|target/);
          }
          if (fault === 'continuation old terminal signer') {
            continuation.stage = 'builder';
            await expect(buildSubstrateFederatedNativeContinuationPegInPacketV1(secondInput))
              .rejects.toThrow(/disposed|custody|provenance|inactive/);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          continuation.stage = 'builder';
          continuationReserveId = result.packet.boxes.reserveSuccessor.boxId;
          if (fault === 'continuation disposed during builder') {
            const beforeBuilderSigns = signCalls.mock.calls.length;
            const beforeBuilderChecks = checkBodies.length;
            await expect(buildSubstrateFederatedNativeContinuationPegInPacketV1(secondInput))
              .rejects.toThrow(/source custody disposed/);
            expect(injectionCount).toBe(1);
            expect(signCalls).toHaveBeenCalledTimes(beforeBuilderSigns);
            expect(checkBodies).toHaveLength(beforeBuilderChecks);
            expect(() => assertSigner(session.signer)).not.toThrow();
            session.dispose();
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          if (fault === 'continuation copied withdrawal check') {
            await expect(buildSubstrateFederatedNativeContinuationPegInPacketV1({ ...secondInput,
              withdrawal: { ...secondInput.withdrawal, check: { ...result } } }))
              .rejects.toThrow(/provenance/);
            expect(() => assertSigner(session.signer)).not.toThrow();
            return;
          }
          if (fault === 'continuation copied withdrawal attempt') {
            await expect(buildSubstrateFederatedNativeContinuationPegInPacketV1({ ...secondInput,
              withdrawal: { ...secondInput.withdrawal, attempt: { ...payoutAttempt } } }))
              .rejects.toThrow(/provenance/);
            expect(() => assertSigner(session.signer)).not.toThrow();
            return;
          }
          if (fault === 'continuation foreign target') {
            await expect(buildSubstrateFederatedNativeContinuationPegInPacketV1({ ...secondInput,
              target: foreignTarget })).rejects.toThrow(/provenance|target|origin/);
            expect(() => assertSigner(session.signer)).not.toThrow();
            return;
          }
          if (fault === 'continuation builder snapshots caller input') {
            mutateContinuationBuilderInput = () => {
              secondInput.target = foreignTarget;
              secondInput.withdrawal.check = { ...result };
              secondInput.withdrawal.attempt = { ...payoutAttempt };
              secondInput.sourceFundingInput = { ...secondSourceFunding, boxId: 'b9'.repeat(32) };
              secondInput.sourceIntent.amountNanoErg = '1';
              secondInput.creationHeights.currentErgoHeight = 9999;
              secondInput.creationHeights.sourceLockCreation = 9999;
              secondInput.creationHeights.reserveTransition = 9999;
            };
          }
          const second = await buildSubstrateFederatedNativeContinuationPegInPacketV1(secondInput);
          secondContinuationPacket = second;
          if (fault === 'continuation builder snapshots caller input') {
            expect(injectionCount).toBe(1);
            expect(second.boxes.sourceFundingInput.boxId).toBe(secondSourceFunding.boxId);
            expect(second.transactions.sourceLockCreation.outputs[0]!.creationHeight).toBe(secondCreationHeight);
            expect(second.transactions.reserveTransition.outputs[0]!.creationHeight).toBe(secondCreationHeight);
          }
          expect(canonicalJson(second.boxes.reservePredecessor)).toBe(canonicalJson(result.packet.boxes.reserveSuccessor));
          expect(second.reserve).toMatchObject({ inputValueNanoErg: '15000000', outputValueNanoErg: '35000000',
            inputLiabilityNanoErg: '5000000', outputLiabilityNanoErg: '25000000',
            protectedSeedNanoErg: packet.reserve.protectedSeedNanoErg,
            predecessorDepositCount: 1, successorDepositCount: 2, inputDigestHex: packet.reserve.outputDigestHex });
          expect(verifyPooledReserveCommitmentInsert(second.reserve.inputDigestHex, second.boxes.sourceLock.boxId,
            second.depositCommitmentHex, second.depositInsertProofHex)).toBe(second.reserve.outputDigestHex);
          expect(second.reserve.outputDigestHex).not.toBe(packet.reserve.outputDigestHex);
          expect(second.transactions.reserveTransition.eip12Tx.inputs[0]!.assets)
            .toEqual(second.transactions.reserveTransition.outputs[0]!.assets);
          expect(activeIssuances).toHaveLength(3);
          expect(() => assertSigner(session.signer)).not.toThrow();
          if (fault === 'continuation old packet') {
            await expect(session.checkNativeContinuationPegInSourceLockRetainingSignerV1(packet, confirmationTarget))
              .rejects.toThrow(/continuation|provenance|payout/);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          publish(second.boxes.sourceFundingInput);
          signingHeaders = headerContext(secondCreationHeight);
          continuation.stage = 'source';
          const transportCompositionFault = new Set<ContinuationFault>([
            'continuation valid', 'continuation foreign observation before draft',
            'continuation copied observation before evidence', 'continuation mismatched reservation draft',
            'continuation current target lost before transport', 'continuation custody lost after funding await',
            'continuation ambiguous source transport', 'continuation source proof native mint join',
            'continuation external fees valid', 'continuation external fees unclaimed first check',
            'continuation external fees copied check', 'continuation external fees foreign target',
            'continuation external fees spent first change', 'continuation external fees custody during preparation',
            'continuation external fees custody during checker', 'continuation external fees ambiguous withdrawal',
            ...SECOND_TRACKER_CASES, ...SECOND_PAYOUT_CASES,
          ]).has(fault as ContinuationFault);
          if (transportCompositionFault) {
            // Seed resolved durable history from the first checked deposit. Its
            // transport is historical fixture input; these rows grant no authority.
            const historicalRows = [
              { operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
                transaction: packet.transactions.sourceLockCreation, check: firstSourceCheck,
                inputBoxIds: [packet.boxes.sourceFundingInput.boxId], confirmationHeight: 1002,
                reconciliationIdentityDigestHex: setupBinding.executionTargetIdentityDigestHex },
              { operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
                transaction: packet.transactions.reserveTransition, check: firstVaultCheck,
                inputBoxIds: [packet.boxes.reservePredecessor.boxId, packet.boxes.sourceLock.boxId,
                  packet.boxes.transitionFeeFunding.boxId], confirmationHeight: 1020,
                reconciliationIdentityDigestHex: null },
            ].map(previous => {
              const historicalDigest = sha256CanonicalJson({ transactionId: previous.transaction.txId },
                'TEST_RESOLVED_PEG_IN_JOURNAL_HISTORY');
              const attempt = state.reserveErgoOperationalTransactionAttempt({
                operationProfile: previous.operationProfile, expectedTxId: previous.transaction.txId,
                sourceBoxId: previous.inputBoxIds[0]!, inputBoxIds: previous.inputBoxIds,
                attemptedAtHeight: previous.check.signer.stateContextTipHeight,
                targetSidechainHeight: null, targetSidechainBlockHashHex: null, heartbeatKeyHex: null,
                reconciliationIdentityDigestHex: previous.reconciliationIdentityDigestHex,
                bindingDigestHex: historicalDigest,
                signedTransactionDigestHex: previous.check.signedTransactionCanonicalJsonSha256Hex,
                checkResponseDigestHex: previous.check.checkResponseSha256Hex,
                revalidationDigestHex: historicalDigest, authorizationDigestHex: historicalDigest,
              });
              state.finalizeErgoOperationalTransactionAttempt({ expectedTxId: attempt.expectedTxId,
                durableAttemptDigestHex: attempt.durableAttemptDigestHex, disposition: 'accepted',
                submittedTxId: attempt.expectedTxId, responseDigestHex: historicalDigest });
              state.confirmErgoOperationalTransactionAttempt({ expectedTxId: attempt.expectedTxId,
                confirmationHeight: previous.confirmationHeight,
                confirmationHeaderId: headerId(previous.confirmationHeight) });
              confirmed.set(attempt.expectedTxId, previous.confirmationHeight);
              return { expectedTxId: attempt.expectedTxId,
                snapshot: canonicalJson(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId)) };
            });
            const assertHistoricalRowsUnchanged = () => {
              for (const previous of historicalRows) {
                expect(canonicalJson(state.getErgoOperationalTransactionAttempt(previous.expectedTxId)))
                  .toBe(previous.snapshot);
              }
            };
            if (!feeContinuationFault) signingHeaders = headerContext(1062);
            const otherFunding = sourceFundingOutputs[0]!;
            const thirdFunding = result.packet.boxes.payout;
            continuationFundingObservation = {
              schema: 'e2s.substrate-federated-reward-input-discovery.v2', version: 2,
              status: 'agreed_non_authorizing_snapshot_anchored_reward_inputs', reportDigestHex: 'ab'.repeat(32),
              observedAt: new Date().toISOString(),
              sources: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS },
              target: { network: 'devnet', genesisHeaderHeight: 1, genesisHeaderIdHex: GENESIS,
                tipHeight: tip(), tipHeaderIdHex: headerId(tip()) },
              signer: { publicKeyHex: signer.publicKeyHex, p2pkErgoTreeHex: signer.p2pkErgoTreeHex,
                rewardDelayBlocks: 1, rewardInputErgoTreeHex: secondSourceFunding.ergoTree,
                rewardAddress: 'synthetic-continuation-reward-address' },
              inventory: { anchorRewardBoxCount: 3, matureRewardBoxCount: 3,
                usableRewardBoxCount: 3, requiredAgeBlocks: 2 },
              genesisBoxIds: { tracker: secondSourceFunding.boxId,
                duplicatePrevention: otherFunding.boxId, pooledReserve: thirdFunding.boxId },
              genesisInputs: { tracker: secondSourceFunding,
                duplicatePrevention: otherFunding, pooledReserve: thirdFunding },
              boundary: { fixedDualLoopbackOrigins: true, getOnlyNodeRequests: true,
                exactPublicSignerBinding: true, matchingSnapshotAnchor: true,
                canonicalExtensionBeyondAnchorAllowed: true, discoveryAnchorRetained: true,
                postAnchorRewardBoxesExcluded: true, exactCanonicalBoxIdsRecomputed: true,
                exactRewardTreeMatched: true, pairwiseDistinctPureErgRegisterFreeInputs: true,
                targetBinaryRevalidationRequired: true, signerOrWalletMaterialRead: false,
                sessionSignerProvenanceAuthenticated: false, tipAndUtxoObservedAtomically: false,
                nodeExecutableIdentityAuthenticated: false, independentNodeControlVerified: false,
                canonicalConsensusEstablished: false },
              authorization: { constructSetup: false, check: false, sign: false, submit: false,
                broadcast: false, deploy: false, activate: false, fundsAuthority: false,
                gate5Closed: false, productionReady: false },
            };
            loseCustodyAfterFundingAwait = fault === 'continuation custody lost after funding await';
            loseSourceTransportResponse = fault === 'continuation ambiguous source transport';
            loseCurrentTargetAtTransport = fault === 'continuation current target lost before transport';
            if (loseCurrentTargetAtTransport) {
              const reserveAttempt = state.reserveErgoOperationalTransactionAttempt.bind(state);
              vi.spyOn(state, 'reserveErgoOperationalTransactionAttempt').mockImplementation(input => {
                const attempt = reserveAttempt(input);
                if (input.expectedTxId === second.transactions.sourceLockCreation.txId) {
                  currentTargetActive = false;
                }
                return attempt;
              });
            }
            const beforeTransportSubmissions = submissionBodies.length;
            const sourcePromise = executeContinuationSourceLock({
              target: confirmationTarget, batch, packet: second, setupSession: session, state,
            });
            if (loseCustodyAfterFundingAwait) {
              await expect(sourcePromise).rejects.toThrow(/custody|disposed|inactive|provenance/);
              expect(state.getErgoOperationalTransactionAttempt(second.transactions.sourceLockCreation.txId)).toBeNull();
              expect(submissionBodies).toHaveLength(beforeTransportSubmissions);
              assertHistoricalRowsUnchanged();
              return;
            }
            if (loseCurrentTargetAtTransport) {
              await expect(sourcePromise).rejects.toThrow(/target|provenance|inactive|not transported/);
              expect(state.getErgoOperationalTransactionAttempt(second.transactions.sourceLockCreation.txId))
                .toMatchObject({ status: 'ambiguous', submissionDisposition: 'ambiguous',
                  submittedTxId: null, responseDigestHex: null });
              expect(submissionBodies).toHaveLength(beforeTransportSubmissions);
              await expect(executeContinuationSourceLock({
                target: confirmationTarget, batch, packet: second, setupSession: session, state,
              })).rejects.toThrow(/target|provenance|inactive/);
              expect(submissionBodies).toHaveLength(beforeTransportSubmissions);
              assertHistoricalRowsUnchanged();
              return;
            }
            const sourceExecution = await sourcePromise;
            expect(sourceExecution.expectedTxId).toBe(second.transactions.sourceLockCreation.txId);
            expect(sourceExecution.transportStatus).toBe(loseSourceTransportResponse ? 'reconciled' : 'accepted');
            expect(state.getErgoOperationalTransactionAttempt(sourceExecution.expectedTxId)?.status).toBe('confirmed');
            expect(submissionBodies).toHaveLength(beforeTransportSubmissions + 1);
            continuation.stage = 'vault';
            const vaultExecution = await executeContinuationVault({
              target: confirmationTarget, batch, packet: second,
              sourceLockObservation: sourceExecution.outputObservation, setupSession: session, state,
            });
            expect(vaultExecution.expectedTxId).toBe(second.transactions.reserveTransition.txId);
            expect(vaultExecution.transportStatus).toBe('accepted');
            expect(state.getErgoOperationalTransactionAttempt(vaultExecution.expectedTxId)?.status).toBe('confirmed');
            expect(submissionBodies).toHaveLength(beforeTransportSubmissions + 2);
            expect(second.transactions.sourceLockCreation.outputs[0]!.creationHeight)
              .toBeLessThanOrEqual(secondSourceInclusionHeight!);
            expect(sourceExecution.outputObservation.confirmationHeight).toBe(secondSourceInclusionHeight);
            expect(second.transactions.reserveTransition.outputs[0]!.creationHeight)
              .toBeLessThanOrEqual(secondVaultInclusionHeight!);
            expect(vaultExecution.outputObservation.confirmationHeight).toBe(secondVaultInclusionHeight);
            expect(secondSourceInclusionHeight!).toBeLessThan(secondVaultInclusionHeight!);
            assertHistoricalRowsUnchanged();
            expect(state.getConfirmedErgoOperationalTransactionAttempts(
              SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE)).toHaveLength(2);
            expect(state.getConfirmedErgoOperationalTransactionAttempts(
              PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE)).toHaveLength(2);
            const checkSecondFeeFunding = async () => {
              continuation.stage = 'withdrawal-fee';
              const secondWithdrawalFee = await session
                .checkNativeContinuationWithdrawalFeeFundingV1(confirmationTarget);
              continuation.stage = 'tracker-fee';
              const secondTrackerFee = await session
                .checkNativeContinuationTrackerFeeFundingV1(confirmationTarget);
              expect(secondWithdrawalFee.transaction.eip12Tx.inputs[0]!.boxId)
                .toBe(withdrawalFee.transaction.outputs[1]!.boxId);
              expect(secondTrackerFee.transaction.eip12Tx.inputs[0]!.boxId)
                .toBe(trackerFee.transaction.outputs[1]!.boxId);
              expect(secondWithdrawalFee.transaction.outputs[0]!.boxId)
                .not.toBe(withdrawalFee.transaction.outputs[0]!.boxId);
              expect(secondTrackerFee.transaction.outputs[0]!.boxId)
                .not.toBe(trackerFee.transaction.outputs[0]!.boxId);
              return { secondWithdrawalFee, secondTrackerFee };
            };
            if (feeContinuationFault && !joinedFeeFault) {
              const beforeFeePosts = feeSubmissionBodies.length;
              const beforeFeeChecks = checkBodies.length;
              if (fault === 'continuation external fees unclaimed first check') {
                continuation.stage = 'withdrawal-fee';
                await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(confirmationTarget))
                  .rejects.toThrow('native continuation withdrawal fee funding requires its retained claimed first fee check');
                expect(checkBodies).toHaveLength(beforeFeeChecks);
                expect(feeSubmissionBodies).toHaveLength(beforeFeePosts);
                for (const profile of feeProfiles) {
                  expect(state.getConfirmedErgoOperationalTransactionAttempts(profile)).toHaveLength(0);
                }
                feeContinuationHandled = true;
                return;
              }
              if (fault === 'continuation external fees spent first change') {
                boxes.delete(withdrawalFee.transaction.outputs[1]!.boxId);
                continuation.stage = 'withdrawal-fee';
                await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(confirmationTarget))
                  .rejects.toThrow(/spent|source|404|not found/);
                expect(checkBodies).toHaveLength(beforeFeeChecks);
                expect(feeSubmissionBodies).toHaveLength(beforeFeePosts);
                assertFirstFeeRowsUnchanged();
                feeContinuationHandled = true;
                return;
              }
              if (continuationFeeInternal !== null) {
                continuation.stage = 'withdrawal-fee';
                await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(confirmationTarget))
                  .rejects.toThrow(/custody|disposed|inactive|fee funding/);
                expect(injectionCount).toBe(1);
                expect(feeSubmissionBodies).toHaveLength(beforeFeePosts);
                assertFirstFeeRowsUnchanged();
                feeContinuationHandled = true;
                return;
              }
              const { secondWithdrawalFee, secondTrackerFee } = await checkSecondFeeFunding();
              if (fault === 'continuation external fees copied check') {
                await expect(executeWithdrawalFeeFunding({ target: confirmationTarget,
                  checked: { ...secondWithdrawalFee }, state }))
                  .rejects.toThrow(/unconsumed exact provenance/);
                expect(feeSubmissionBodies).toHaveLength(beforeFeePosts);
                assertFirstFeeRowsUnchanged();
                feeContinuationHandled = true;
                return;
              }
              if (fault === 'continuation external fees foreign target') {
                await expect(executeWithdrawalFeeFunding({ target: foreignTarget,
                  checked: secondWithdrawalFee, state }))
                  .rejects.toThrow(/unconsumed exact provenance|target differs/);
                expect(feeSubmissionBodies).toHaveLength(beforeFeePosts);
                assertFirstFeeRowsUnchanged();
                feeContinuationHandled = true;
                return;
              }
              expect(fault).toBe('continuation external fees ambiguous withdrawal');
              registerFeeTransaction(secondWithdrawalFee);
              const secondAuthorization = await authorizeWithdrawalFee(secondWithdrawalFee, confirmationTarget);
              const secondAttempt = reserveWithdrawalFee(secondAuthorization, state);
              loseFeeTransportResponse = true;
              continuation.stage = 'withdrawal-fee';
              const secondSubmission = await submitWithdrawalFee(confirmationTarget, secondAttempt);
              expect(secondSubmission).toMatchObject({ status: 'ambiguous', submittedTxId: null });
              finalizeWithdrawalFee(secondAttempt, secondSubmission);
              expect(state.getErgoOperationalTransactionAttempt(secondAttempt.expectedTxId))
                .toMatchObject({ status: 'ambiguous', submissionDisposition: 'ambiguous', submittedTxId: null });
              expect(feeSubmissionBodies).toHaveLength(beforeFeePosts + 1);
              await expect(submitWithdrawalFee(confirmationTarget, secondAttempt))
                .rejects.toThrow(/consumed|transport target differs/);
              expect(feeSubmissionBodies).toHaveLength(beforeFeePosts + 1);
              expect(secondTrackerFee.transaction.eip12Tx.inputs[0]!.boxId)
                .toBe(trackerFee.transaction.outputs[1]!.boxId);
              assertFirstFeeRowsUnchanged();
              feeContinuationHandled = true;
              return;
            }
            const joined = { batch, target: confirmationTarget, packet: second,
              committedVaultObservation: vaultExecution.outputObservation };
            if (fault === 'continuation foreign observation before draft') {
              expect(() => buildNativeMintDraft({ ...joined,
                committedVaultObservation: sourceExecution.outputObservation as never }))
                .toThrow(/observation|reserve|provenance|status/);
              return;
            }
            const draft = buildNativeMintDraft(joined);
            expect(draft.statement.reserveTransitionTransactionIdHex).toBe(`0x${vaultExecution.expectedTxId}`);
            expect(draft.statement.successorReserveBoxIdHex).toBe(`0x${second.boxes.reserveSuccessor.boxId}`);
            expect(draft.statement.successorReserveLiabilityNanoErg).toBe('25000000');
            if (fault === 'continuation copied observation before evidence') {
              expect(() => collectNativeReserveEvidence({ ...joined,
                committedVaultObservation: { ...vaultExecution.outputObservation }, draft }))
                .toThrow(/observation|provenance|lineage|original inputs/);
              return;
            }
            const evidenceReceipt = collectNativeReserveEvidence({ ...joined, draft });
            if (fault === 'continuation mismatched reservation draft') {
              const otherDraft = buildNativeMintDraft(joined);
              expect(() => consumeNativeReserveEvidence(evidenceReceipt, otherDraft))
                .toThrow(/different mint-reservation draft/);
              return;
            }
            if (joinedSourceFault) {
              expect(joinedSource).toBeDefined();
              expect(joinedOperator).toBeDefined();
              expect(joinedPreviousOperation).toBeDefined();
              expect(joinedPreviousProof).toBeDefined();
              expect(joinedPreviousExecution).toBeDefined();
              expect(joinedPreviousCheckpoint).toBeDefined();
              expect(joinedRpc).toBeDefined();
              expect(joinedFrontierTarget).toBeDefined();
              expect(() => execution.assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, setupTarget))
                .toThrow(/expired|inactive/);
              expect(() => execution.assertSubstrateFederatedNativeGenesisSetupReadCustodyV1(batch, setupTarget))
                .not.toThrow();
              joinedCurrentOperation = createNativeSourceOperation(joinedSource!);
              const currentProof = produceNativeOperationMintProof(joinedCurrentOperation, {
                draftInputs: joined, draft, evidenceReceipt,
                issuedAtNativeHeight: '4', expiresAtNativeHeight: '32',
              });
              const pair = assertNativeProofPair(currentProof, joinedCurrentOperation, draft,
                joinedPreviousCheckpoint!, joinedPreviousOperation!, joinedPreviousProof!);
              expect(pair.currentTarget).toBe(confirmationTarget);
              expect(pair.originalSetupTarget).toBe(setupTarget);
              expect(pair.candidate).toBe((compiled as any).candidate);
              expect(pair.application).toBe((compiled as any).preparation.application);
              expect(currentProof.mintIdentityHex).not.toBe(joinedPreviousProof!.mintIdentityHex);
              expect(currentProof.request.statementHex).toBe(draft.statementHex);
              expect(currentProof.request.evidence).toEqual(evidenceReceipt.evidence);
              expect(() => consumeNativeReserveEvidence(evidenceReceipt, draft)).toThrow(/already consumed/);
              const pendingScaleHex = joinedRpc!.attachCurrentProof(currentProof);
              const continuationDirectory = createPersistentNativeAttemptDirectory(
                'bridge-native-real-source-continuation-');
              const signing = { operator: joinedOperator!, sourceOperation: joinedCurrentOperation, draft,
                proof: currentProof, compiled, target: confirmationTarget, frontierTarget: joinedFrontierTarget!,
                expectedStorage: joinedRpc!.expectedStorage,
                expectedGenesisHashHex: joinedRpc!.expectedGenesisHashHex };
              const continuationInput = {
                previousExecution: joinedPreviousExecution!, signing,
                attemptDirectory: continuationDirectory,
                broadcastScope: 'fed-native-local-synthetic-continuation-reservation-only' as const,
              };
              const beforeRejectedRpc = joinedRpc!.calls.length;
              await expect(executeFrontierNativeProofBoundContinuationReservationV1({ ...continuationInput,
                signing: { ...signing, target: { ...confirmationTarget } } as never }))
                .rejects.toThrow(/native continuation proof differs from retained operator or genesis/);
              expect(joinedRpc!.calls).toHaveLength(beforeRejectedRpc);
              const foreignCompiled = { ...compiled, candidate: { ...(compiled as any).candidate },
                preparation: { ...(compiled as any).preparation,
                  application: { ...(compiled as any).preparation.application } } };
              joinedForeignCompiled = foreignCompiled;
              await expect(executeFrontierNativeProofBoundContinuationReservationV1({ ...continuationInput,
                signing: { ...signing, compiled: foreignCompiled } as never }))
                .rejects.toThrow(/native continuation proof differs from retained operator or genesis/);
              joinedForeignCompiled = undefined;
              expect(joinedRpc!.calls).toHaveLength(beforeRejectedRpc);
              const continuationReservation = await executeFrontierNativeProofBoundContinuationReservationV1(continuationInput);
              expect(continuationReservation).toMatchObject({
                blockHeight: 5, runtimeReservationObserved: true, mintExecuted: false,
                mintIdentityHex: currentProof.mintIdentityHex,
                pendingReservationScaleHex: pendingScaleHex,
              });
              const continuationCycle = await executeFrontierNativeProofBoundContinuationMintAndBurnV1({
                reservationExecution: continuationReservation,
                grossAmountNanoErg: '15000000', recipientErgoTreeHex: `0x${signer.p2pkErgoTreeHex.replace(/^0x/, '')}`,
                broadcastScope: 'fed-native-local-synthetic-continuation-mint-and-burn-only',
              });
              expect(continuationCycle).toMatchObject({
                mint: { blockHeight: 6, amountNanoErg: '20000000', mintIdentityHex: currentProof.mintIdentityHex,
                  mintExecuted: true, runtimeReservationConsumed: true },
                burn: { blockHeight: 8, grossAmountNanoErg: '15000000', netAmountNanoErg: '10000000' },
                burnExecuted: true,
              });
              expect(joinedRpc!.snapshot()).toMatchObject({ height: 8,
                currentPendingScaleHex: pendingScaleHex });
              expect(readdirSync(continuationDirectory).sort()).toEqual(['native-approve-attempt.json',
                'native-burn-attempt.json', 'native-mint-attempt.json', 'native-reservation-attempt.json']);
              if (joinedFeeFault) {
                const beforeCrossPurposeChecks = checkBodies.length;
                const beforeSecondFeePosts = feeSubmissionBodies.length;
                const { secondWithdrawalFee, secondTrackerFee } = await checkSecondFeeFunding();
                await expect(authorizeWithdrawalFee(secondTrackerFee, confirmationTarget))
                  .rejects.toThrow(/unconsumed exact provenance/);
                await expect(authorizeTrackerFee(secondWithdrawalFee, confirmationTarget))
                  .rejects.toThrow(/unconsumed exact provenance/);
                expect(feeSubmissionBodies).toHaveLength(beforeSecondFeePosts);
                expect(checkBodies).toHaveLength(beforeCrossPurposeChecks + 2);
                registerFeeTransaction(secondWithdrawalFee);
                registerFeeTransaction(secondTrackerFee);
                const secondWithdrawalExecution = fault === 'continuation second tracker unclaimed withdrawal fee' ? undefined : await executeWithdrawalFeeFunding({
                  target: confirmationTarget, checked: secondWithdrawalFee, state,
                });
                const secondTrackerExecution = fault === 'continuation second tracker unclaimed fee' ? undefined : await executeTrackerFeeFunding({
                  target: confirmationTarget, checked: secondTrackerFee, state,
                });
                if (secondWithdrawalExecution !== undefined) {
                  expect(secondWithdrawalExecution).toMatchObject({
                    expectedTxId: secondWithdrawalFee.transaction.txId,
                    feeInputBox: secondWithdrawalFee.transaction.outputs[0],
                  });
                }
                if (secondTrackerExecution !== undefined) {
                  expect(secondTrackerExecution).toMatchObject({
                    expectedTxId: secondTrackerFee.transaction.txId,
                    feeInputBox: secondTrackerFee.transaction.outputs[0],
                  });
                }
                expect(feeSubmissionBodies.map(signedId)).toEqual([
                  withdrawalFee.transaction.txId, trackerFee.transaction.txId,
                  ...(secondWithdrawalExecution === undefined ? [] : [secondWithdrawalFee.transaction.txId]),
                  ...(secondTrackerExecution === undefined ? [] : [secondTrackerFee.transaction.txId]),
                ]);
                if (secondWithdrawalExecution !== undefined && secondTrackerExecution !== undefined) assertFirstFeeRowsUnchanged(2);
                const continuationCheckpoint = await attestFrontierNativeBurnCheckpointV1({
                  execution: continuationCycle,
                  admissionValidFromErgoHeight: secondTrackerFault || secondPayoutFault ? String(tip() + 1) : '121',
                  admissionExpiresAtErgoHeight: secondTrackerFault || secondPayoutFault ? String(tip() + 20) : '140',
                });
                expect(continuationCheckpoint.attestation.checkpointStatement.sourceNativeBlockHeight).toBe('8');
                feeContinuationHandled = true;
                if (secondTrackerFault || secondPayoutFault) {
                  const firstRow = state.getErgoOperationalTransactionAttempt(attempt.expectedTxId);
                  expect(firstRow?.status).toBe('confirmed');
                  const firstRowSnapshot = canonicalJson(firstRow);
                  const secondStatement = continuationCheckpoint.attestation.checkpointStatement;
                  const secondMembership = buildErgoExtensionMembershipProof([{ key: Buffer.from('0401', 'hex'),
                    value: Buffer.from(encodeSubstrateFederatedCheckpointExtensionValueV1(secondStatement.encodedStatementHex), 'hex'),
                  }], Buffer.from('0401', 'hex'));
                  signingHeaders = headerContext(tip() + 3, secondMembership.root.toString('hex'), 1);
                  const secondHeaders = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
                    rawHeaders: signingHeaders, anchorContextIndex: 1,
                    expectedAnchorHeaderIdHex: String(signingHeaders[1]!.id),
                    expectedAnchorExtensionRootHex: secondMembership.root.toString('hex'),
                  });
                  let previousContext = context;
                  if (fault === 'continuation second tracker foreign parent') {
                    previousContext = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
                      compilerRequest: activeTrackerRequest, compilerReceipt: activeTrackerReceipt,
                      trackerInputBox: activeIssuances[0]!.outputs[0]!, observedHeaderContext,
                      encodedStatementHex: statement.encodedStatementHex,
                      extensionMembershipProofHex: membership.proof.toString('hex'),
                    });
                    expect(previousContext).toEqual(context); expect(previousContext).not.toBe(context);
                  }
                  let secondTrackerInput = result.packet.boxes.trackerDataInput;
                  if (fault === 'continuation second tracker substituted predecessor') {
                    const foreignBody = structuredClone(transaction.eip12UnsignedTransaction) as unknown as Eip12UnsignedTransaction;
                    const foreignPredecessor = await materializeUnsignedTransaction({
                      ...foreignBody,
                      outputs: foreignBody.outputs.map((output, index) =>
                        index === 1 ? { ...output, creationHeight: output.creationHeight + 1 } : output),
                    }, 'canonical foreign tracker predecessor');
                    secondTrackerInput = foreignPredecessor.outputs[0]!;
                    expect(secondTrackerInput.boxId).not.toBe(result.packet.boxes.trackerDataInput.boxId);
                    expect(secondTrackerInput.additionalRegisters).toEqual(result.packet.boxes.trackerDataInput.additionalRegisters);
                  }
                  const secondContext = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContinuationContext({
                    previousContext, compilerRequest: activeTrackerRequest, compilerReceipt: activeTrackerReceipt,
                    trackerInputBox: secondTrackerInput, observedHeaderContext: secondHeaders,
                    encodedStatementHex: secondStatement.encodedStatementHex,
                    extensionMembershipProofHex: secondMembership.proof.toString('hex'),
                  });
                  expect(secondContext.trackerTransition.inputDigestHex).toBe(context.trackerTransition.successorDigestHex);
                  expect(secondContext.trackerTransition.trackerKeyHex).not.toBe(context.trackerTransition.trackerKeyHex);
                  expect(secondContext.trackerTransition.successorDigestHex).toBe(getSubstrateFederatedTrackerDigestV1Hex([
                    { key: context.trackerTransition.trackerKeyHex, value: context.trackerTransition.trackerValueHex },
                    { key: secondContext.trackerTransition.trackerKeyHex, value: secondContext.trackerTransition.trackerValueHex },
                  ]));
                  const secondTransaction = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
                    trackerContext: secondContext, trackerInputBox: secondTrackerInput,
                    feeInputBox: fault === 'continuation second tracker first fee'
                      ? trackerFee.transaction.outputs[0]! : secondTrackerFee.transaction.outputs[0]!,
                    feePayerPublicKeyHex: signer.publicKeyHex,
                  });
                  secondTrackerTxId = secondTransaction.unsignedTransactionIdHex;
                  secondTransportTarget = Object.freeze({ ...transportTarget, expectedTransactionIdHex: secondTrackerTxId });
                  // The original confirmation callback has returned. Its target must
                  // fail even though the private read custody is retained.
                  currentTargetActive = false; phase = 'second-frozen';
                  expect(() => owned.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(confirmationTarget))
                    .toThrow(/target expired/);
                  const beforeSecondChecks = checkBodies.length;
                  const beforeSecondPosts = submissionBodies.length;
                  const pendingSecond = session.checkNativeContinuationFrozenTrackerV2CandidateRetainingWithdrawalSigner({
                    context: secondContext, transaction: secondTransaction, observedHeaderContext: secondHeaders,
                  }, secondFrozenTarget);
                  const earlyErrors: Partial<Record<SecondTrackerFault, RegExp>> = {
                    'continuation second tracker foreign parent': /parent differs/,
                    'continuation second tracker substituted predecessor': /inputs differ from retained/,
                    'continuation second tracker first fee': /inputs differ from retained/,
                    'continuation second tracker unclaimed fee': /claimed second fees/,
                    'continuation second tracker unclaimed withdrawal fee': /claimed second fees/,
                    'continuation second tracker foreign origin': /private native origin differs/,
                    'continuation second tracker custody during preparation': /source custody disposed/,
                    'continuation second tracker custody during checker': /JVM node check rejected/,
                    'continuation second tracker target during preparation': /frozen target expired/,
                  };
                  const earlyError = earlyErrors[fault as SecondTrackerFault];
                  if (earlyError !== undefined) {
                    await expect(pendingSecond).rejects.toThrow(earlyError);
                    expect(checkBodies).toHaveLength(beforeSecondChecks);
                    expect(submissionBodies).toHaveLength(beforeSecondPosts);
                    expect(state.getErgoOperationalTransactionAttempt(secondTrackerTxId)).toBeNull();
                    expect(canonicalJson(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId))).toBe(firstRowSnapshot);
                    if (fault.includes('during')) {
                      expect(injectionCount).toBe(1); expect(injectedCheckCalls).toBe(beforeSecondChecks);
                      if (fault.endsWith('preparation')) expect(signCalls).toHaveBeenCalledTimes(injectedSignCalls!);
                    }
                    expect(() => assertSigner(session.signer)).toThrow();
                    secondTrackerHandled = true; return;
                  }
                  const secondChecked = await pendingSecond;
                  const secondCheckedBody = canonicalJson(checkBodies.at(-1));
                  expect(verifyRetainedTrackerAtHeaders({ signedBody: checkBodies.at(-1)!,
                    signedCandidate: secondChecked.result.signedCandidate,
                    boxes: secondTransaction.inputBoxes, headers: signingHeaders,
                  })).toEqual({ proofs: [true, true], transactionError: null });
                  const secondAuthorization = await authorizeTracker(secondChecked, secondFrozenTarget);
                  const secondAttempt = reserveTracker(secondAuthorization, state);
                  expect(state.getErgoOperationalTransactionAttempt(secondTrackerTxId)?.status).toBe('pending');
                  phase = 'second-freshness'; secondFrozenActive = false;
                  expect(() => owned.assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(secondFrozenTarget))
                    .toThrow(/frozen target expired/);
                  await revalidateTracker(secondAttempt, secondFreshnessTarget);
                  phase = 'second-transport';
                  if (fault === 'continuation second tracker custody before transport') {
                    const reserved = state.getErgoOperationalTransactionAttempt(secondTrackerTxId);
                    const checksBeforeLoss = checkBodies.length;
                    boundary.sourceActive = false;
                    await expect(submitTracker(secondTransportTarget, secondAttempt)).rejects.toThrow(/source custody disposed/);
                    expect(checkBodies).toHaveLength(checksBeforeLoss);
                    expect(submissionBodies).toHaveLength(beforeSecondPosts);
                    expect(state.getErgoOperationalTransactionAttempt(secondTrackerTxId)).toEqual(reserved);
                  } else {
                    const secondSubmitted = await submitTracker(secondTransportTarget, secondAttempt);
                    expect(secondSubmitted.status).toBe('accepted');
                    expect(canonicalJson(submissionBodies.at(-1))).toBe(secondCheckedBody);
                    finalizeTracker(secondAttempt, secondSubmitted);
                    const secondAdmitted = await materializeUnsignedTransaction(
                      secondTransaction.eip12UnsignedTransaction as never, 'native second admitted tracker');
                    for (const input of secondTransaction.inputBoxes) boxes.delete(input.boxId);
                    publish(secondAdmitted.outputs[0]!);
                    phase = 'second-confirmation';
                    const secondConfirmation = await createObserver(secondConfirmationTarget, GENESIS)
                      .observe(secondAttempt.expectedTxId, PRIMARY);
                    expect(secondConfirmation?.status).toBe('confirmed');
                    await confirmTracker(secondAttempt, secondConfirmationTarget, secondConfirmation!);
                    expect(state.getErgoOperationalTransactionAttempt(secondTrackerTxId)?.status).toBe('confirmed');
                    expect(secondAdmitted.outputs[0]!.additionalRegisters.R5)
                      .toBe(secondContext.trackerTransition.successorRegisters.R5);
                    assertFirstFeeRowsUnchanged(2);
                    if (secondPayoutFault) {
                      const firstPayoutRows = state.getConfirmedErgoOperationalTransactionAttempts(
                        SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE,
                      );
                      expect(firstPayoutRows).toHaveLength(1);
                      const firstPayoutRow = firstPayoutRows.find(row => row.expectedTxId === payoutAttempt.expectedTxId);
                      expect(firstPayoutRow).toBeDefined();
                      const firstPayoutSnapshot = canonicalJson(firstPayoutRow);
                      const secondProof = continuationCheckpoint.commitment.burnProof;
                      const secondLeaf = secondProof.leaf;
                      const secondClaim: Parameters<typeof session.checkNativeContinuationWithdrawalV2>[0] = Object.freeze({
                        trackerIdentity: Object.freeze({
                          sourceNativeBlockHeight: secondStatement.sourceNativeBlockHeight,
                          sourceNativeBlockHashHex: secondStatement.sourceNativeBlockHashHex,
                          executionBlockHashHex: secondStatement.executionBlockHashHex,
                        }),
                        burnLeaf: Object.freeze({
                          sidechainIdHex: secondLeaf.sidechainIdHex,
                          sidechainBlockHashHex: secondLeaf.sidechainBlockHashHex,
                          sidechainTxHashHex: secondLeaf.sidechainTxHashHex,
                          eventIndex: secondLeaf.eventIndex,
                          burnIdHex: secondLeaf.burnIdHex,
                          recipientErgoTreeHashHex: secondLeaf.recipientErgoTreeHashHex,
                          amountNanoErg: secondLeaf.amountNanoErg,
                          assetIdHex: secondLeaf.assetIdHex,
                        }),
                        leafIndex: secondProof.leafIndex,
                        leafCount: secondProof.leafCount,
                        burnProof: secondProof.proof,
                        recipientErgoTreeHex: continuationCheckpoint.commitment.burnEvent.recipientErgoTreeHex,
                      });
                      if (fault === 'continuation second payout stale reserve predecessor') {
                        // A canonical prior box, not a fabricated box with a stale ID.
                        boxes.set(second.boxes.reserveSuccessor.boxId, result.packet.boxes.reserveSuccessor);
                      }
                      secondPayoutStarted = true;
                      const beforeSecondPayoutChecks = checkBodies.length;
                      const beforeSecondPayoutPosts = submissionBodies.length;
                      const pendingPayout = session.checkNativeContinuationWithdrawalV2(
                        fault === 'continuation second payout replay old claim' ? withdrawalClaim : secondClaim,
                        fault === 'continuation second payout wrong current target'
                          ? Object.freeze({ ...secondConfirmationTarget }) : secondConfirmationTarget,
                      );
                      const payoutErrors: Partial<Record<SecondPayoutFault, RegExp>> = {
                        'continuation second payout replay old claim': /already in replay history/,
                        'continuation second payout wrong current target': /target expired|binding|lineage/,
                        'continuation second payout stale reserve predecessor': /live input differs/,
                        'continuation second payout custody during preparation': /source custody disposed|inactive/,
                        'continuation second payout custody during checker': /withdrawal JVM node check failed|source custody disposed|inactive/,
                      };
                      const payoutError = payoutErrors[fault as SecondPayoutFault];
                      if (payoutError !== undefined) {
                        await expect(pendingPayout).rejects.toThrow(payoutError);
                        expect(submissionBodies).toHaveLength(beforeSecondPayoutPosts);
                        expect(state.getConfirmedErgoOperationalTransactionAttempts(
                          SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE,
                        ).map(row => canonicalJson(row))).toEqual([firstPayoutSnapshot]);
                        if (fault === 'continuation second payout custody during preparation'
                          || fault === 'continuation second payout custody during checker') {
                          expect(injectionCount).toBe(1);
                          expect(checkBodies).toHaveLength(beforeSecondPayoutChecks);
                          if (fault.endsWith('preparation')) {
                            expect(signCalls).toHaveBeenCalledTimes(injectedSignCalls!);
                          }
                        }
                        expect(() => assertSigner(session.signer)).toThrow();
                        secondPayoutHandled = true;
                        return;
                      }
                      const secondPayout = await pendingPayout;
                      expect(secondPayout.packet.transaction.eip12Tx.inputs.map(box => box.boxId)).toEqual([
                        second.boxes.reserveSuccessor.boxId,
                        result.packet.boxes.duplicatePreventionSuccessor.boxId,
                        secondWithdrawalFee.transaction.outputs[0]!.boxId,
                      ]);
                      expect(secondPayout.packet.transaction.eip12Tx.dataInputs.map(box => box.boxId))
                        .toEqual([secondAdmitted.outputs[0]!.boxId]);
                      expect(verifyRetainedTrackerAtHeaders({
                        signedBody: checkBodies.at(-1)!, signedCandidate: secondPayout.signedCandidate,
                        boxes: secondPayout.packet.transaction.eip12Tx.inputs,
                        dataBoxes: secondPayout.packet.transaction.eip12Tx.dataInputs,
                        headers: signingHeaders,
                      })).toEqual({ proofs: [true, true, true], transactionError: null });
                      const firstDupKey = result.packet.burn.duplicatePreventionKeyHex;
                      expect(secondPayout.packet.boxes.duplicatePreventionSuccessor.additionalRegisters.R5)
                        .toBe(encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([
                          firstDupKey, secondPayout.packet.burn.duplicatePreventionKeyHex,
                        ]), 'hex'), 1, 1));
                      expect(BigInt(secondPayout.packet.reserve.inputValueNanoErg)
                        - BigInt(secondPayout.packet.reserve.outputValueNanoErg))
                        .toBe(BigInt(secondLeaf.amountNanoErg));
                      expect(BigInt(secondPayout.packet.reserve.inputLiabilityNanoErg)
                        - BigInt(secondPayout.packet.reserve.outputLiabilityNanoErg))
                        .toBe(BigInt(secondLeaf.amountNanoErg));
                      expect(BigInt(secondPayout.packet.reserve.inputValueNanoErg)
                        - BigInt(secondPayout.packet.reserve.inputLiabilityNanoErg))
                        .toBe(BigInt(secondPayout.packet.reserve.outputValueNanoErg)
                          - BigInt(secondPayout.packet.reserve.outputLiabilityNanoErg));
                      expect(() => assertSigner(session.signer)).toThrow();
                      const secondAuthorization = await authorizeWithdrawal(secondPayout, secondConfirmationTarget);
                      const secondPayoutAttempt = reserveWithdrawal(secondAuthorization, state);
                      const secondSubmission = await submitWithdrawal(secondConfirmationTarget, secondPayoutAttempt);
                      expect(secondSubmission.status).toBe('accepted');
                      finalizeWithdrawal(secondPayoutAttempt, secondSubmission);
                      for (const input of secondPayout.packet.transaction.eip12Tx.inputs) boxes.delete(input.boxId);
                      publish(secondPayout.packet.boxes.reserveSuccessor,
                        secondPayout.packet.boxes.duplicatePreventionSuccessor,
                        secondPayout.packet.boxes.payout, secondPayout.packet.boxes.trackerDataInput);
                      const secondPayoutConfirmation = await createObserver(secondConfirmationTarget, GENESIS)
                        .observe(secondPayoutAttempt.expectedTxId, PRIMARY);
                      expect(secondPayoutConfirmation?.status).toBe('confirmed');
                      await confirmWithdrawal(secondPayoutAttempt, secondConfirmationTarget, secondPayoutConfirmation!);
                      const payoutRows = state.getConfirmedErgoOperationalTransactionAttempts(
                        SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE,
                      );
                      expect(payoutRows).toHaveLength(2);
                      expect(canonicalJson(payoutRows.find(row => row.expectedTxId === payoutAttempt.expectedTxId)))
                        .toBe(firstPayoutSnapshot);
                      expect(payoutRows.find(row => row.expectedTxId === secondPayoutAttempt.expectedTxId)?.status)
                        .toBe('confirmed');
                      // Construction-only replay probes use the actual accumulated
                      // successors. They create no authority, signing or transport.
                      for (const replayClaim of [withdrawalClaim, secondClaim]) {
                        await expect(buildSubstrateFederatedBurnSettlementV2({
                          familyCompilerInput: { trackerRequest: activeTrackerRequest,
                            trackerReceipt: activeTrackerReceipt, templates,
                            duplicatePreventionGenesisInputBoxIdHex: funding[1]!.boxId,
                            pooledReserveGenesisInputBoxIdHex: funding[2]!.boxId },
                          familyCompilerReceipt: activeFamilyReceipt,
                          trackerState: { dataInput: secondPayout.packet.boxes.trackerDataInput, history: [
                            { key: context.trackerTransition.trackerKeyHex, value: context.trackerTransition.trackerValueHex },
                            { key: secondContext.trackerTransition.trackerKeyHex, value: secondContext.trackerTransition.trackerValueHex },
                          ] },
                          reserveState: { predecessor: secondPayout.packet.boxes.reserveSuccessor },
                          duplicatePreventionState: { predecessor: secondPayout.packet.boxes.duplicatePreventionSuccessor,
                            historyKeys: [firstDupKey, secondPayout.packet.burn.duplicatePreventionKeyHex] },
                          feeFundingInput: secondWithdrawalFee.transaction.outputs[0]!, claim: replayClaim,
                          currentErgoHeight: tip() + 1, creationHeight: tip() + 1,
                        })).rejects.toThrow(/already in replay history/);
                      }
                      assertFirstFeeRowsUnchanged(2);
                      secondPayoutHandled = true;
                    }
                  }
                  expect(canonicalJson(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId))).toBe(firstRowSnapshot);
                  secondTrackerHandled = true;
                }
              }
              joinedCompleted = true;
              return;
            }
            const evidence = consumeNativeReserveEvidence(evidenceReceipt, draft);
            expect(evidence.sourceLockBoxCanonicalHex.length).toBeGreaterThan(0);
            expect(evidence.reserveTransitionTransactionCanonicalHex.length).toBeGreaterThan(0);
            expect(() => consumeNativeReserveEvidence(evidenceReceipt, draft)).toThrow(/already consumed/);
            expect(() => assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(second, batch, confirmationTarget)).not.toThrow();
            expect(() => assertSubstrateFederatedNativeGenesisPegInPacketV1(second, batch, confirmationTarget))
              .not.toThrow();
            phase = 'expired-current-action';
            expect(() => assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(second, batch, confirmationTarget))
              .not.toThrow();
            expect(() => assertSubstrateFederatedNativeGenesisPegInPacketV1(second, batch, confirmationTarget))
              .toThrow(/expired|target|lineage/);
            session.dispose();
            expect(() => assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(second, batch, confirmationTarget))
              .toThrow(/disposed|custody|provenance|inactive/);
            expect(() => assertSubstrateFederatedNativeGenesisPegInPacketV1(second, batch, confirmationTarget))
              .toThrow(/disposed|custody|provenance|inactive/);
            return;
          }
          if (fault === 'continuation duplicate source invocation') {
            const beforeDuplicateSigns = signCalls.mock.calls.length;
            const beforeDuplicateChecks = checkBodies.length;
            // Exercise the inner execution cancellation, not the public signer-binding veto.
            boundary.assertSigner = undefined;
            const pending = session.checkNativeContinuationPegInSourceLockRetainingSignerV1(second, confirmationTarget);
            await expect(session.checkNativeContinuationPegInSourceLockRetainingSignerV1(second, confirmationTarget))
              .rejects.toThrow(/absent|consumed|disposed/);
            await expect(pending).rejects.toThrow(/disposed|consumed|cancelled|invalidated|inactive/);
            expect(signCalls).toHaveBeenCalledTimes(beforeDuplicateSigns);
            expect(checkBodies).toHaveLength(beforeDuplicateChecks);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          const beforeSecondChecks = checkBodies.length;
          const sourceCheck = session.checkNativeContinuationPegInSourceLockRetainingSignerV1(second, confirmationTarget);
          if (fault === 'continuation disposed during source preparation' || fault === 'continuation disposed during source checker') {
            await expect(sourceCheck).rejects.toThrow(/source custody disposed|source-lock JVM node check failed/);
            expect(signCalls).toHaveBeenCalledTimes(injectedSignCalls!);
            expect(checkBodies).toHaveLength(injectedCheckCalls!);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          if (fault === 'continuation successor changes during source') {
            await expect(sourceCheck).rejects.toThrow(/output differs|not a valid EIP-12 box/);
            expect(injectionCount).toBe(1);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          await sourceCheck;
          publish(second.boxes.reservePredecessor, second.boxes.sourceLock, second.boxes.transitionFeeFunding);
          continuation.stage = 'vault';
          if (fault === 'continuation wrong vault packet') {
            await expect(session.checkNativeContinuationPegInCommittedVaultRetainingSignerV1({ ...second }, confirmationTarget))
              .rejects.toThrow(/differs|provenance/);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          const vaultCheck = session.checkNativeContinuationPegInCommittedVaultRetainingSignerV1(second, confirmationTarget);
          if (fault === 'continuation disposed during vault preparation' || fault === 'continuation disposed during vault checker') {
            await expect(vaultCheck).rejects.toThrow(/source custody disposed|committed-vault JVM node check failed/);
            expect(signCalls).toHaveBeenCalledTimes(injectedSignCalls!);
            expect(checkBodies).toHaveLength(injectedCheckCalls!);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          if (fault === 'continuation successor changes during vault') {
            await expect(vaultCheck).rejects.toThrow(/output differs|not a valid EIP-12 box/);
            expect(injectionCount).toBe(1);
            expect(() => assertSigner(session.signer)).toThrow();
            return;
          }
          await vaultCheck;
          expect(checkBodies).toHaveLength(beforeSecondChecks + 2);
          expect(signedId(checkBodies.at(-2)!)).toBe(second.transactions.sourceLockCreation.txId);
          expect(signedId(checkBodies.at(-1)!)).toBe(second.transactions.reserveTransition.txId);
          expect(submissionBodies).toHaveLength(2);
          expect(() => assertSigner(session.signer)).not.toThrow();
        }
      }
      if (!continuationFault) {
        expect(() => assertSigner(session.signer)).toThrow();
        expect(submissionBodies).toHaveLength(1);
      }
      expect(statement.sourceNativeBlockHashHex).not.toBe(statement.executionBlockHashHex);
      expect(statement.sourceNetworkIdHex).toBe(GENESIS);
    } catch (error) {
      joinedFailed = true;
      throw error;
    } finally {
      joinedCurrentOperation?.dispose();
      joinedPreviousOperation?.dispose();
      joinedSource?.dispose();
      if (joinedOperator) disposeFederatedGenesisOperatorV1(joinedOperator);
      session.dispose();
      state.close();
      if (joinedFault && !joinedFailed) expect(joinedCompleted).toBe(true);
      if (feeContinuationFault && !joinedFailed) expect(feeContinuationHandled).toBe(true);
      if (secondTrackerFault && !joinedFailed) expect(secondTrackerHandled).toBe(true);
      if (secondPayoutFault && !joinedFailed) expect(secondPayoutHandled).toBe(true);
    }
  }, 60_000);
});
