import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Builds, compilers, observations and processes are stubs. Session/key custody,
// root control flow, journal ownership, box codecs and bounded FED RPC decoding stay real.
// Downstream deposit, burn, checkpoint, tracker and payout are component doubles, not crypto evidence.
const mocked = vi.hoisted(() => ({
  frontier: vi.fn(), ergoBuild: vi.fn(), process: vi.fn(), owned: vi.fn(),
  discover: vi.fn(), history: vi.fn(), compile: vi.fn(), materialize: vi.fn(),
  pin: vi.fn(), nodes: vi.fn(), environment: vi.fn(),
  check: vi.fn(), batch: vi.fn(), execute: vi.fn(), source: vi.fn(), confirmation: vi.fn(),
  frontierOwned: vi.fn(), fundingOwned: vi.fn(), packet: vi.fn(), sourceLock: vi.fn(), committedVault: vi.fn(),
  draft: vi.fn(), evidence: vi.fn(), proof: vi.fn(), mint: vi.fn(),
  nativeRead: vi.fn(), withdrawalFeeCheck: vi.fn(), trackerFeeCheck: vi.fn(), withdrawalFee: vi.fn(), trackerFee: vi.fn(),
  checkpoint: vi.fn(), checkpointAssert: vi.fn(), anchor: vi.fn(), anchorAssert: vi.fn(), frozenObservation: vi.fn(), observationAssert: vi.fn(),
  headers: vi.fn(), context: vi.fn(), trackerTx: vi.fn(), trackerCheck: vi.fn(), trackerAuthorize: vi.fn(), trackerReserve: vi.fn(),
  trackerFreshness: vi.fn(), trackerSubmit: vi.fn(), trackerFinalize: vi.fn(), trackerConfirm: vi.fn(),
  projectConfirmation: vi.fn(), projectSubmission: vi.fn(), projectProgress: vi.fn(),
  payoutCheck: vi.fn(), payoutAuthorize: vi.fn(), payoutReserve: vi.fn(), payoutSubmit: vi.fn(), payoutFinalize: vi.fn(), payoutConfirm: vi.fn(), wait: vi.fn(),
}));
vi.mock('../../substrate-federated-genesis-node-build-v1.js', () => ({ buildSubstrateFederatedGenesisNodeV1: mocked.frontier }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({ buildSubstrateFederatedIsolatedDevnetErgoNodeV1: mocked.ergoBuild }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js')>(),
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2: mocked.process,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: mocked.owned,
}));
vi.mock('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1: mocked.discover,
  assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1: mocked.fundingOwned,
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js', () => ({
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2: mocked.history,
}));
vi.mock('../../substrate-federated-observed-genesis-v1.js', () => ({ compileObservedSubstrateFederatedGenesisV1: mocked.compile }));
vi.mock('../../pinned-local-native-verifier-build.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../pinned-local-native-verifier-build.js')>(), runBoundedProcess: mocked.materialize,
}));
vi.mock('../../native-executable-pin.js', () => ({ verifyExecutableSha256: mocked.pin }));
vi.mock('../../substrate-federated-authority-safe-devnet-build-environment-v1.js', () => ({
  buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1: mocked.environment,
}));
vi.mock('../../substrate-federated-authority-safe-devnet-process-v1.js', () => ({
  withOwnedFederatedGenesisDevnetProcessesV1: mocked.nodes,
  assertOwnedFederatedGenesisDevnetTargetV1: mocked.frontierOwned,
}));
vi.mock('./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', () => ({
  executeSubstrateFederatedNativeGenesisBatchV1: mocked.execute,
  executeSubstrateFederatedNativeGenesisPegInSourceLockV1: mocked.sourceLock,
  executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1: mocked.committedVault,
  executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: mocked.withdrawalFee,
  executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: mocked.trackerFee,
  waitForCanonicalConfirmation: mocked.wait,
  projectTrackerCanonicalConfirmationFailureDiagnosticV1: mocked.projectConfirmation,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js', () => ({
  buildSubstrateFederatedNativeGenesisPegInPacketV1: mocked.packet,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js')>(),
  buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1: mocked.draft,
}));
vi.mock('../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js')>(),
  collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV1: mocked.evidence,
}));
vi.mock('./frontier-native-proof-bound-reservation-signing-v1.js', () => ({
  executeFrontierNativeProofBoundReservationMintAndBurnV1: mocked.mint,
  attestFrontierNativeBurnCheckpointV1: mocked.checkpoint,
  assertFrontierNativeBurnCheckpointV1: mocked.checkpointAssert,
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js')>(),
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1: mocked.batch,
  assertSubstrateFederatedNativeGenesisSetupReadCustodyV1: mocked.nativeRead,
}));
vi.mock('../../authenticated-spv-tracker-read-only-node-client.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../authenticated-spv-tracker-read-only-node-client.js')>(),
  createBoundedAuthenticatedSpvTrackerReadOnlySource: mocked.source,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js')>(),
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: mocked.confirmation,
  projectSubstrateFederatedIsolatedDevnetConfirmationProgressV1: mocked.projectProgress,
}));

vi.mock('../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js', () => ({
  observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1: mocked.anchor,
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1: mocked.anchorAssert,
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2: mocked.frozenObservation,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2: mocked.observationAssert,
}));
vi.mock('../../bridge-validity-tracker-header-context-v1.js', () => ({ buildBridgeValidityTrackerObservedHeaderContextV1: mocked.headers }));
vi.mock('../../substrate-federated-tracker-v2.js', () => ({ buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context: mocked.context }));
vi.mock('../../substrate-federated-tracker-v2-external-fee.js', () => ({ buildSubstrateFederatedTrackerV2ExternalFeeTransaction: mocked.trackerTx }));
vi.mock('../../substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js', () => ({
  authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission: mocked.trackerAuthorize,
  reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission: mocked.trackerReserve,
  revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission: mocked.trackerFreshness,
  confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission: mocked.trackerConfirm,
}));
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', () => ({
  submitSubstrateFederatedIsolatedDevnetTrackerV2Admission: mocked.trackerSubmit,
  finalizeSubstrateFederatedIsolatedDevnetTrackerV2Admission: mocked.trackerFinalize,
  submitSubstrateFederatedIsolatedDevnetWithdrawalV2: mocked.payoutSubmit,
  finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2: mocked.payoutFinalize,
  projectSubstrateFederatedIsolatedDevnetCheckedSubmissionDiagnostic: mocked.projectSubmission,
}));
vi.mock('../../substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js', () => ({
  authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2: mocked.payoutAuthorize,
  reserveSubstrateFederatedIsolatedDevnetWithdrawalV2: mocked.payoutReserve,
  confirmSubstrateFederatedIsolatedDevnetWithdrawalV2: mocked.payoutConfirm,
}));

import { runSubstrateFederatedGenesisTargetRootV1, projectSubstrateFederatedNativeTrackerConfirmationFailureV1,
  projectSubstrateFederatedNativeTrackerConfirmationProgressV1,
  type RunSubstrateFederatedGenesisTargetRootV1Input } from './substrate-federated-genesis-target-root-v1.js';
import * as setups from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import * as sources from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import * as operators from '../../adapters/federated-genesis-operator-v1.js';
import { observeFederatedGenesisTargetsV1 } from '../../adapters/federated-genesis-target-observation-v1.js';
import { assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance } from '../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import { StateTracker } from '../../state-tracker.js';
import * as ergoWasm from 'ergo-lib-wasm-nodejs';
import type { Eip12Box } from '../../unsigned-ergo-transaction.js';
import { buildSubstrateFederatedCheckpointStatementV1 } from '../../profiles/substrate-federated-v1/checkpoint-statement.js';

const KEYS = {
  code: '0x3a636f6465',
  profile: '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde',
  enforced: '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1',
  bridge: '0xaf86fef4216ac2bcd1c592b204011ad0c1586bde54b249fb7f521faf831ade45',
  sudo: '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b',
};
const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const genesis = '0x' + '71'.repeat(32);
const wasm = Buffer.from('0061736d01000000', 'hex');
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const makeSetup = setups.createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2;
const makeSource = sources.createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2;
const makeOperator = operators.createFederatedGenesisOperatorV1;
const claimMining = setups.claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2;
let setup: Awaited<ReturnType<typeof makeSetup>> | undefined;
let source: ReturnType<typeof makeSource> | undefined;
let operator: ReturnType<typeof makeOperator> | undefined;
let miningCredential: ReturnType<typeof claimMining> | undefined;
let compiledGenesisBytes: Buffer | undefined;
let directory: string;
let input: RunSubstrateFederatedGenesisTargetRootV1Input;
let top: Record<string, string>;
let order: string[];
let active: boolean;
let started: boolean;
let calls: { url: string; method: string; params: unknown[] }[];
let readResult: (url: string, method: string, params: unknown[]) => unknown;
let stop: ReturnType<typeof vi.fn>;
let compiled: any;
let batch: any;
let receipts: any[];
let journalState: StateTracker | undefined;
let observeConfirmation: ReturnType<typeof vi.fn>;
let readErgoBox: (origin: string, id: string) => unknown;
let readErgoTip: (origin: string) => unknown;
let readErgoInclusion: (origin: string, height: number) => unknown;
let readErgoAnchor: (origin: string, height: number) => unknown;
let retainedSetup: any;
let frontierEndpoints: Readonly<{ primaryRpcUrl: string; witnessRpcUrl: string }>;
let frontierActive: boolean;
let batchActive: boolean;
let journalDirectory: string;
let attemptFiles: string[];
let funding: any;
let packet: any;
let sourceLock: any;
let committedVault: any;
let draftInputs: any;
let draft: any;
let evidence: any;
let proof: any;
let mint: any;
let burn: any;
let checkpoint: any;
let phase: string;
let returnValues: Record<string, any>;
const downstreamStages = ['funding', 'packet', 'sourceLock', 'committedVault', 'draft', 'evidence', 'proof', 'mint'] as const;
type DownstreamStage = typeof downstreamStages[number];
const target = Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052' });
const phaseTargets = Object.freeze(Object.fromEntries(['anchor', 'frozen', 'freshness', 'transport', 'confirmation'].map(name =>
  [name, Object.freeze({ ...target, componentPhase: name })])));
const discovery = Object.freeze({ observation: Object.freeze({ genesisBoxIds: Object.freeze({
  tracker: '81'.repeat(32), duplicatePrevention: '82'.repeat(32), pooledReserve: '83'.repeat(32),
}) }) });
const history = Object.freeze({ observation: 'history component stub' });

function assertCustodyActive() {
  operators.assertFederatedGenesisOperatorV1(operator!);
  sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!);
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer);
}
function assertDisposed() {
  if (operator) expect(() => operators.assertFederatedGenesisOperatorV1(operator!)).toThrow(/disposed/);
  if (source) expect(() => sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!)).toThrow(/disposed/);
  if (setup) expect(() => assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer)).toThrow(/active process provenance/);
}
function stageMock(stage: DownstreamStage) { return stage === 'funding' ? mocked.discover : mocked[stage]; }
function assertDownstreamPrefix(stage: DownstreamStage) {
  const last = downstreamStages.indexOf(stage);
  for (const [index, name] of downstreamStages.entries()) {
    expect(stageMock(name)).toHaveBeenCalledTimes(name === 'funding' ? 2 : index <= last ? 1 : 0);
  }
  expect(mocked.check).toHaveBeenCalledOnce(); expect(mocked.execute).toHaveBeenCalledOnce();
}
function assertDownstreamCleanup() {
  expect(StateTracker.prototype.close).toHaveBeenCalledOnce();
  expect(vi.mocked(StateTracker.prototype.close).mock.contexts[0]).toBe(journalState);
  expect(order).toContain('nodes-stop'); expect(order.at(-1)).toBe('stop');
  expect(stop).toHaveBeenCalledOnce(); assertDisposed();
  expect(setups.createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2).toHaveBeenCalledOnce();
  expect(sources.createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2).toHaveBeenCalledOnce();
  expect(operators.createFederatedGenesisOperatorV1).toHaveBeenCalledOnce();
  expect(readdirSync(join(directory, 'target')).filter(name => name.startsWith('issuance-journal-'))).toHaveLength(1);
  for (const file of attemptFiles) expect(readFileSync(file, 'utf8')).toBe('synthetic retained attempt');
}
function retainAttempt(name: string, parent = journalDirectory) {
  const path = join(parent, name);
  writeFileSync(path, 'synthetic retained attempt', { flag: 'wx' });
  attemptFiles.push(path);
}
function rawSpec() {
  return { id: 'bridge_federated_v4_genesis', bootNodes: [], genesis: { raw: { top, childrenDefault: {} } } };
}
function response(result: unknown) { return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result })); }
function confirmationProgress() {
  const node = Object.freeze({ fullHeightBefore: 165, fullHeightAfter: 166,
    index: Object.freeze({ status: 'observed' as const, indexedHeight: 166, fullHeight: 166 }),
    pool: Object.freeze({ status: 'present' as const }) });
  return Object.freeze({ schema: 'e2s.substrate-federated-isolated-devnet-confirmation-progress.v1', version: 1,
    expectedErgoTransactionIdHex: 'e3'.repeat(32), executionTargetIdentityDigestHex: 'ca'.repeat(32),
    targetGenesisHeaderIdHex: '91'.repeat(32), observationSequence: 3, observedAtUnixMs: 1800000000000,
    primary: node, witness: node, diagnosticDigestHex: 'a4'.repeat(32) });
}
function canonicalBox(fields: Omit<Eip12Box, 'boxId'>): Eip12Box {
  const owned: { free(): void }[] = [];
  const own = <T extends { free(): void }>(value: T): T => { owned.push(value); return value; };
  try {
    const amount = own(ergoWasm.I64.from_str(fields.value));
    const value = own(ergoWasm.BoxValue.from_i64(amount));
    const tree = own(ergoWasm.ErgoTree.from_base16_bytes(fields.ergoTree));
    const contract = own(ergoWasm.Contract.new(tree));
    owned.splice(owned.indexOf(tree), 1);
    const builder = own(new ergoWasm.ErgoBoxCandidateBuilder(value, contract, fields.creationHeight));
    for (const asset of fields.assets) builder.add_token(
      own(ergoWasm.TokenId.from_str(asset.tokenId)),
      own(ergoWasm.TokenAmount.from_i64(own(ergoWasm.I64.from_str(asset.amount)))),
    );
    for (const [register, bytes] of Object.entries(fields.additionalRegisters)) {
      builder.set_register_value(Number(register.slice(1)), own(ergoWasm.Constant.decode_from_base16(bytes)));
    }
    const candidate = own(builder.build());
    const id = own(ergoWasm.TxId.from_str(fields.transactionId));
    return own(ergoWasm.ErgoBox.from_box_candidate(candidate, id, fields.index)).to_js_eip12();
  } finally { for (const value of owned.reverse()) value.free(); }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.projectConfirmation.mockReturnValue(null); mocked.projectSubmission.mockReturnValue(null);
  mocked.projectProgress.mockReturnValue(null);
  vi.spyOn(StateTracker.prototype, 'close');
  setup = undefined; source = undefined; operator = undefined;
  miningCredential = undefined; compiledGenesisBytes = undefined;
  compiled = undefined; batch = undefined; receipts = []; journalState = undefined;
  retainedSetup = undefined; draftInputs = undefined; journalDirectory = ''; attemptFiles = [];
  phase = 'setup'; returnValues = {}; checkpoint = undefined;
  frontierActive = false; batchActive = true;
  frontierEndpoints = Object.freeze({ primaryRpcUrl: PRIMARY, witnessRpcUrl: WITNESS });
  funding = Object.freeze({ observation: Object.freeze({
    target: Object.freeze({ tipHeight: 137, genesisHeaderIdHex: '91'.repeat(32) }),
    genesisInputs: Object.freeze({ tracker: Object.freeze({ component: 'fresh reward funding double', boxId: 'a1'.repeat(32) }) }),
  }) });
  packet = Object.freeze({ component: 'native peg-in packet double',
    boxes: Object.freeze({ sourceLock: Object.freeze({ boxId: 'a2'.repeat(32) }),
      reserveSuccessor: Object.freeze({ boxId: 'a3'.repeat(32) }) }),
    transactions: Object.freeze({ sourceLockCreation: Object.freeze({ txId: 'a4'.repeat(32) }),
      reserveTransition: Object.freeze({ txId: 'a5'.repeat(32) }) }),
  });
  sourceLock = Object.freeze({ expectedTxId: 'a4'.repeat(32),
    outputObservation: Object.freeze({ component: 'native source-lock observation double', sourceLockBoxIdHex: 'a2'.repeat(32) }) });
  committedVault = Object.freeze({ expectedTxId: 'a5'.repeat(32),
    outputObservation: Object.freeze({ component: 'native committed reserve observation double',
      confirmationHeight: 130, confirmationHeaderIdHex: '96'.repeat(32),
      sourceLockBoxIdHex: 'a2'.repeat(32), reserveSuccessorBoxIdHex: 'a3'.repeat(32) }) });
  draft = Object.freeze({ component: 'native reservation draft double', reservationKeyHex: '0x' + 'a6'.repeat(32) });
  evidence = Object.freeze({ component: 'native reserve evidence double' });
  proof = Object.freeze({ component: 'native source proof double', mintIdentityHex: draft.reservationKeyHex,
    receiptDigestHex: 'a7'.repeat(32), result: Object.freeze({ issuedAtNativeHeight: '0', expiresAtNativeHeight: '32' }) });
  mint = Object.freeze({ mintExecuted: true, runtimeReservationConsumed: true, amountNanoErg: '20000000',
    mintIdentityHex: proof.mintIdentityHex, sourceProofReceiptDigestHex: proof.receiptDigestHex,
    sourceFinalityEstablished: false, trustless: false });
  burn = Object.freeze({ mint, burn: Object.freeze({ netAmountNanoErg: '10000000', grossAmountNanoErg: '15000000' }), burnExecuted: true });
  vi.spyOn(sources, 'produceSubstrateFederatedNativeGenesisMintSourceProofV1').mockImplementation(mocked.proof);
  order = []; calls = []; active = false; started = false;
  directory = mkdtempSync(join(tmpdir(), 'fed-root-component-'));
  const bridgeRoot = join(directory, 'bridge');
  mkdirSync(bridgeRoot);
  mkdirSync(join(directory, 'target'));
  writeFileSync(join(directory, 'runtime.wasm'), wasm);
  input = {
    frontierBuild: { bridgeRoot, frontierSourcePath: directory, buildParentDirectory: directory,
      cargoHomeDirectory: directory, cargoExecutablePath: 'cargo', rustcExecutablePath: 'rustc',
      gitExecutablePath: 'git', protocExecutablePath: 'protoc' },
    ergoBuild: { bridgeRoot, worktreeRoot: directory, ergoSourcePath: directory,
      gitExecutablePath: 'git', javaExecutablePath: 'java', sbtLauncherJarPath: 'launcher' },
  };
  top = { [KEYS.code]: '0x' + wasm.toString('hex'), [KEYS.profile]: '0x0102',
    [KEYS.enforced]: '0x01', [KEYS.bridge]: '0x' + '33'.repeat(20), '0x1234': '0x5678' };
  vi.spyOn(setups, 'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2').mockImplementation(async () => {
    order.push('setup'); setup = await makeSetup();
    retainedSetup = { ...setup, runNativeGenesisRetainingSigner: mocked.check,
      checkNativeWithdrawalFeeFundingV1: mocked.withdrawalFeeCheck, checkNativeTrackerFeeFundingV1: mocked.trackerFeeCheck,
      checkNativeFrozenTrackerV2CandidateRetainingWithdrawalSigner: mocked.trackerCheck,
      checkNativeWithdrawalV2: mocked.payoutCheck };
    return retainedSetup;
  });
  vi.spyOn(sources, 'createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2').mockImplementation(value => {
    order.push('source'); source = makeSource(value); return source;
  });
  vi.spyOn(operators, 'createFederatedGenesisOperatorV1').mockImplementation(() => {
    order.push('operator'); operator = makeOperator();
    top[operator.nativeFunding.storageKeyHex] = operator.nativeFunding.accountInfoScaleHex;
    return operator;
  });
  vi.spyOn(setups, 'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2').mockImplementation(value => {
    expect(value.signer).toBe(setup!.signer); miningCredential = claimMining(setup!); return miningCredential;
  });
  mocked.frontier.mockImplementation(async value => {
    order.push('frontier-build'); expect(value.sourceSession).toBe(source); assertCustodyActive();
    return { sourceDirectory: directory, targetDirectory: join(directory, 'target'),
      node: { path: join(directory, 'node.exe'), sha256Hex: '51'.repeat(32) },
      wasm: { path: join(directory, 'runtime.wasm'), sha256Hex: sha256(wasm) },
      sourceProofProfileScaleHex: source!.binding.federatedMintProfileScaleHex,
      sourceProofProfileIdHex: source!.binding.federatedMintProfile.proofProfileIdHex };
  });
  mocked.ergoBuild.mockImplementation(async () => {
    order.push('ergo-build'); assertCustodyActive();
    return { javaExecutablePath: 'java', nodeAssemblyJarPath: 'node.jar', receipt: {
      toolchain: { javaExecutableSha256Hex: '52'.repeat(32) }, build: { artifactSha256Hex: '53'.repeat(32) },
      buildIdentityDigestHex: '54'.repeat(32),
    } };
  });
  stop = vi.fn(async () => { order.push('stop'); active = false; });
  mocked.process.mockImplementation((build, binding, credential, checkpointCredential, admissionCredential, confirmationCredential) => {
    order.push('process'); assertCustodyActive();
    expect(build).toEqual({ javaExecutablePath: 'java', expectedJavaExecutableSha256Hex: '52'.repeat(32),
      nodeAssemblyJarPath: 'node.jar', expectedNodeAssemblyJarSha256Hex: '53'.repeat(32), buildIdentityDigestHex: '54'.repeat(32) });
    expect(binding).toEqual({ miningTargetPublicKeyHex: setup!.signer.publicKeyHex,
      p2pkErgoTreeHex: setup!.signer.p2pkErgoTreeHex, rewardInputErgoTrees: setup!.signer.rewardInputErgoTrees,
      networkPrefix: 16, primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052' });
    expect(miningCredential).toBeDefined(); expect(credential).toBe(miningCredential!.miningCredential);
    expect(checkpointCredential).toBe(miningCredential!.checkpointMiningCredential);
    expect(admissionCredential).toBe(miningCredential!.trackerAdmissionMiningCredential);
    expect(confirmationCredential).toBe(miningCredential!.trackerConfirmationMiningCredential);
    const invoke = async (name: string, callback: (value: any) => Promise<unknown>) => {
      phase = name; order.push(`${name}-phase`); expect(active).toBe(false);
      expect(StateTracker.prototype.close).not.toHaveBeenCalled();
      const value = await callback(phaseTargets[name]); return { value, receipt: { component: `${name} process stub` } };
    };
    return { startMining: async () => { order.push('mine'); started = true; }, stop,
      withMiningActiveExecutionTarget: async (callback: (value: object) => Promise<unknown>) => {
        expect(started).toBe(true); active = true;
        try { return { value: await callback(target), receipt: { component: 'ergo process stub',
          finalSnapshot: { fullHeight: 140, headerIdHex: '97'.repeat(32) } } }; }
        finally { active = false; }
      },
      withCheckpointExtensionMiningTarget: async (_extension: string, policy: unknown, callback: (value: any) => Promise<unknown>) => {
        expect(order.indexOf('withdrawalFee')).toBeLessThan(order.indexOf('checkpoint'));
        expect(order.indexOf('trackerFee')).toBeLessThan(order.indexOf('checkpoint'));
        expect(policy).toEqual({ minimumTipHeight: 11 }); return invoke('anchor', callback);
      },
      withCheckpointBoundMiningStoppedExecutionTarget: (callback: (value: any) => Promise<unknown>) => invoke('frozen', callback),
      withCheckpointBoundReservationFreshnessRevalidationTarget: (callback: (value: any) => Promise<unknown>) => invoke('freshness', callback),
      withCheckpointBoundTrackerTransportTarget: (completion: unknown, callback: (value: any) => Promise<unknown>) => {
        expect(completion).toBe(returnValues.freshness); return invoke('transport', callback);
      },
      withTrackerTransportConfirmationMiningTarget: (txId: string, callback: (value: any) => Promise<unknown>) => {
        expect(txId).toBe(returnValues.trackerAttempt.expectedTxId); return invoke('confirmation', callback);
      } };
  });
  mocked.owned.mockImplementation(value => { if (!active || value !== target) throw new Error('target inactive'); });
  mocked.discover.mockImplementation(async (signer, value) => {
    expect(signer).toBe(setup!.signer); expect(value).toBe(target); expect(active).toBe(true);
    if (order.includes('execute')) {
      order.push('funding');
      expect(observeConfirmation.mock.calls.length).toBeGreaterThanOrEqual(6);
      expect(calls.filter(call => call.method === 'state_getStorage')).toHaveLength(28);
      return funding;
    }
    order.push('discover');
    return discovery;
  });
  mocked.history.mockImplementation(async value => { order.push('history'); expect(value).toBe(discovery.observation); return history; });
  mocked.compile.mockImplementation(async value => {
    order.push('compile'); assertCustodyActive(); expect(active).toBe(true);
    expect(value.setupSigner).toBe(setup!.signer); expect(value.sourceSession).toBe(source);
    expect(value.target).toBe(target); expect(value.ownedDiscovery).toBe(discovery); expect(value.history).toBe(history);
    expect(value.genesis.operatorAddressHex).toBe(operator!.addressHex);
    expect(value.genesis.launchDomainHex).toBe(operator!.launchDomainHex);
    expect(value.genesis.endowments).toEqual([{ addressHex: operator!.addressHex, balance: '100000000000000000000' }]);
    expect(value.genesis.runtimeWasm).toEqual(wasm);
    expect(value.genesis.evmChainId).toBe('4242');
    const profiles = sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!);
    const genesisJson = JSON.stringify({ component: 'typed compiler stub', operatorAddressHex: operator!.addressHex });
    compiledGenesisBytes = Buffer.from(genesisJson);
    compiled = { preparation: { ...profiles, mintProofProfile: source!.binding.federatedMintProfile,
      mintProofProfileScaleHex: source!.binding.federatedMintProfileScaleHex,
      application: { bridgeAddressHex: '33'.repeat(20) } },
      familyCompilerInput: { trackerRequest: Object.freeze({ component: 'tracker compiler request double' }),
        trackerReceipt: Object.freeze({ component: 'tracker compiler receipt double' }) },
      candidate: { genesisJson, genesisJsonSha256Hex: sha256(genesisJson), runtimeProfileScaleHex: '0x0102',
        runtimeProfile: Object.freeze({ sourceNetworkIdHex: '0x' + 'b1'.repeat(32), sidechainIdHex: '0x' + 'b2'.repeat(32),
          bridgeAddressHex: '0x' + '33'.repeat(20), tokenAddressHex: '0x' + '44'.repeat(20),
          settlementProfileIdHex: '0x' + 'b3'.repeat(32), lineageProfileIdHex: '0x' + 'b4'.repeat(32) }),
        runtimeProfileIdHex: '55'.repeat(32), familyIdHex: '56'.repeat(32) }, discovery: discovery.observation,
      issuance: { orderedTransactions: ['tracker', 'duplicatePrevention', 'pooledReserve'].map((role, i) => {
        const txId = String(i + 4).repeat(64);
        const box = canonicalBox({
          transactionId: txId, index: 0,
          value: '10000000', ergoTree: setup!.signer.p2pkErgoTreeHex, creationHeight: 100,
          assets: [{ tokenId: discovery.observation.genesisBoxIds[role as keyof typeof discovery.observation.genesisBoxIds], amount: '1' }],
          additionalRegisters: { R4: '0402' },
        });
        return { role, transaction: { txId, outputs: [box] } };
      }) } };
    return compiled;
  });
  mocked.check.mockImplementation(async (value, executionTarget) => {
    order.push('check'); assertCustodyActive(); expect(active).toBe(true);
    expect(value).toBe(compiled); expect(executionTarget).toBe(target);
    batch = { profile: 'fed-native-height-zero-v1', request: { target: { genesisHeaderIdHex: '91'.repeat(32) } },
      orderedTransactions: Object.values(discovery.observation.genesisBoxIds).map(genesisInputBoxIdHex => ({ issuance: { genesisInputBoxIdHex } })) };
    return batch;
  });
  mocked.batch.mockImplementation((value, executionTarget) => {
    if (!active) throw new Error('target inactive');
    assertCustodyActive(); expect(active).toBe(true);
    if (value !== batch || executionTarget !== target) throw new Error('wrong native batch');
    if (!batchActive) throw new Error('native batch inactive');
  });
  mocked.nativeRead.mockImplementation((value, executionTarget) => {
    expect(value).toBe(batch); expect(executionTarget).toBe(target); assertCustodyActive();
    if (!batchActive) throw new Error('native batch inactive');
  });
  mocked.execute.mockImplementation(async value => {
    order.push('execute'); assertCustodyActive(); expect(active).toBe(true);
    expect(order).toContain('nodes'); expect(order).not.toContain('nodes-stop');
    expect(value.batch).toBe(batch); expect(value.target).toBe(target);
    expect(value.state).toBeInstanceOf(StateTracker); journalState = value.state;
    expect(existsSync(value.markerDirectory)).toBe(true);
    expect(value.markerDirectory.startsWith(join(directory, 'target', 'issuance-journal-'))).toBe(true);
    journalDirectory = dirname(value.markerDirectory);
    retainAttempt('issuance-attempt', value.markerDirectory);
    receipts = compiled.issuance.orderedTransactions.map(({ role, transaction }: any, ordinal: number) => ({
      ordinal, role, expectedTxId: transaction.txId, confirmationHeight: 100,
      confirmationHeaderIdHex: '92'.repeat(32),
    }));
    return receipts;
  });
  observeConfirmation = vi.fn(async (id: string, origin: string) => {
    assertCustodyActive(); expect(active).toBe(true); expect(origin).toBe(target.primaryNodeOrigin);
    expect(receipts.some(receipt => receipt.expectedTxId === id)).toBe(true);
    return { status: 'confirmed', confirmationHeight: 100, confirmationHeaderIdHex: '92'.repeat(32) };
  });
  mocked.confirmation.mockImplementation((value, headerId, progressTransactionIdHex) => {
    expect([target, phaseTargets.confirmation]).toContain(value); expect(headerId).toBe(batch.request.target.genesisHeaderIdHex);
    expect(progressTransactionIdHex).toBe(value === phaseTargets.confirmation ? 'e3'.repeat(32) : undefined);
    return { observe: observeConfirmation, reconciliationIdentityDigestHex: 'ca'.repeat(32) };
  });
  readErgoBox = (_origin, id) => {
    const value = compiled.issuance.orderedTransactions.find(({ transaction }: any) => transaction.outputs[0].boxId === id);
    return value ? structuredClone(value.transaction.outputs[0]) : null;
  };
  readErgoTip = () => ({ height: 120, id: '93'.repeat(32) });
  readErgoInclusion = () => ['92'.repeat(32)];
  const observedTips = new Map<string, Map<number, string>>();
  readErgoAnchor = (origin, height) => [observedTips.get(origin)?.get(height)];
  mocked.source.mockImplementation(origin => {
    expect([target.primaryNodeOrigin, target.witnessNodeOrigin]).toContain(origin);
    return { getBestHeader: async () => {
      assertCustodyActive();
      const tip: any = await readErgoTip(origin);
      if (tip && typeof tip.height === 'number' && typeof tip.id === 'string') {
        if (!observedTips.has(origin)) observedTips.set(origin, new Map());
        observedTips.get(origin)!.set(tip.height, tip.id);
      }
      return tip;
    },
      getBoxByIdOrNull: async (id: string) => { assertCustodyActive(); return readErgoBox(origin, id); },
      getBlockHeaderIdsAtHeight: async (height: number) => {
        assertCustodyActive();
        return receipts.some(receipt => receipt.confirmationHeight === height)
          ? readErgoInclusion(origin, height) : readErgoAnchor(origin, height);
      } };
  });
  mocked.environment.mockReturnValue({ bounded: 'environment stub' });
  mocked.pin.mockResolvedValue(undefined);
  mocked.materialize.mockImplementation(async value => {
    order.push('materialize'); assertCustodyActive(); expect(active).toBe(true);
    expect(value.args).toEqual(['build-spec', '--chain', `fed-genesis:${join(directory, 'target', 'fed-genesis.json')}`, '--disable-default-bootnode', '--raw']);
    expect(JSON.parse(readFileSync(join(directory, 'target', 'fed-genesis.json'), 'utf8')).operatorAddressHex).toBe(operator!.addressHex);
    return { stdout: JSON.stringify(rawSpec()), stderr: '' };
  });
  mocked.nodes.mockImplementation(async (value, callback) => {
    order.push('nodes'); assertCustodyActive(); expect(active).toBe(true);
    expect(value.primaryRpcUrl).toBe(PRIMARY); expect(value.witnessRpcUrl).toBe(WITNESS);
    expect(value.nodeBinaryPath).toBe(join(directory, 'node.exe'));
    expect(value.expectedNodeBinarySha256Hex).toBe('51'.repeat(32));
    expect(value.genesisJsonBytes).toEqual(compiledGenesisBytes);
    expect([value.primaryP2pPort, value.witnessP2pPort, value.primaryPrometheusPort, value.witnessPrometheusPort])
      .toEqual([30355, 30356, 19615, 19616]);
    expect(sha256(value.genesisJsonBytes)).toBe(value.expectedGenesisJsonSha256Hex);
    frontierActive = true;
    try { return { value: await callback(frontierEndpoints), receipt: { component: 'FED process stub' } }; }
    finally { frontierActive = false; order.push('nodes-stop'); }
  });
  mocked.frontierOwned.mockImplementation(value => {
    if (!frontierActive || value !== frontierEndpoints) throw new Error('FED target inactive');
  });
  mocked.fundingOwned.mockImplementation((value, executionTarget) => {
    expect(value).toBe(funding); expect(executionTarget).toBe(target); return funding.observation;
  });
  mocked.packet.mockImplementation(async value => {
    order.push('packet');
    expect(Object.keys(value).sort()).toEqual(['batch', 'target', 'sourceFundingInput', 'sourceIntent', 'depositorErgoTreeHex', 'creationHeights'].sort());
    expect(value.batch).toBe(batch); expect(value.target).toBe(target);
    expect(value.sourceFundingInput).toBe(funding.observation.genesisInputs.tracker);
    const profile = compiled.candidate.runtimeProfile;
    expect(value.sourceIntent).toEqual({ formatVersion: 2, sourceNetworkIdHex: profile.sourceNetworkIdHex,
      sidechainIdHex: profile.sidechainIdHex, bridgeAddressHex: profile.bridgeAddressHex,
      tokenAddressHex: profile.tokenAddressHex, settlementProfileIdHex: profile.settlementProfileIdHex,
      admissionProfileIdHex: profile.lineageProfileIdHex, sourceAssetIdHex: '00'.repeat(32),
      amountNanoErg: '20000000', recipientAddressHex: operator!.addressHex });
    expect(value.depositorErgoTreeHex).toBe(setup!.signer.p2pkErgoTreeHex);
    expect(value.creationHeights).toEqual({ currentErgoHeight: 137, sourceLockCreation: 137, reserveTransition: 137 });
    return packet;
  });
  mocked.sourceLock.mockImplementation(async value => {
    order.push('sourceLock');
    expect(value).toEqual({ target, batch, packet, setupSession: retainedSetup, state: journalState });
    expect(value.target).toBe(target); expect(value.batch).toBe(batch);
    expect(value.setupSession).toBe(retainedSetup); expect(value.packet).toBe(packet); expect(value.state).toBe(journalState);
    retainAttempt('source-lock-attempt'); return sourceLock;
  });
  mocked.committedVault.mockImplementation(async value => {
    order.push('committedVault');
    expect(value).toEqual({ target, batch, packet, sourceLockObservation: sourceLock.outputObservation,
      setupSession: retainedSetup, state: journalState });
    expect(value.target).toBe(target); expect(value.batch).toBe(batch);
    expect(value.packet).toBe(packet); expect(value.sourceLockObservation).toBe(sourceLock.outputObservation);
    expect(value.setupSession).toBe(retainedSetup); expect(value.state).toBe(journalState);
    retainAttempt('reserve-transition-attempt'); return committedVault;
  });
  mocked.draft.mockImplementation(value => {
    order.push('draft'); draftInputs = value;
    expect(value).toEqual({ target, batch, packet, committedVaultObservation: committedVault.outputObservation });
    expect(value.target).toBe(target); expect(value.batch).toBe(batch);
    expect(value.packet).toBe(packet); expect(value.committedVaultObservation).toBe(committedVault.outputObservation);
    return draft;
  });
  mocked.evidence.mockImplementation(value => {
    order.push('evidence'); expect(value).toEqual({ ...draftInputs, draft });
    expect(value.target).toBe(target); expect(value.batch).toBe(batch);
    expect(value.draft).toBe(draft); expect(value.packet).toBe(packet);
    expect(value.committedVaultObservation).toBe(committedVault.outputObservation); return evidence;
  });
  mocked.proof.mockImplementation((session, value) => {
    order.push('proof'); expect(session).toBe(source);
    expect(value).toEqual({ draftInputs, draft, evidenceReceipt: evidence, issuedAtNativeHeight: '0', expiresAtNativeHeight: '32' });
    expect(value.draftInputs).toBe(draftInputs); expect(value.draft).toBe(draft); expect(value.evidenceReceipt).toBe(evidence);
    return proof;
  });
  mocked.mint.mockImplementation(async value => {
    order.push('mint');
    expect(Object.keys(value).sort()).toEqual(['attemptDirectory', 'broadcastScope', 'grossAmountNanoErg', 'recipientErgoTreeHex', 'signing']);
    expect(value.signing).toEqual({ operator, sourceSession: source, draft, proof, compiled, target,
      frontierTarget: frontierEndpoints, expectedStorage: top, expectedGenesisHashHex: genesis });
    for (const [key, original] of Object.entries({ operator, sourceSession: source, draft, proof, compiled, target, frontierTarget: frontierEndpoints })) {
      expect(value.signing[key]).toBe(original);
    }
    expect(value.broadcastScope).toBe('fed-native-local-synthetic-reservation-mint-and-burn-only');
    expect(value.grossAmountNanoErg).toBe('15000000'); expect(value.recipientErgoTreeHex).toBe(`0x${setup!.signer.p2pkErgoTreeHex}`);
    expect(dirname(value.attemptDirectory)).toBe(journalDirectory);
    expect(basename(value.attemptDirectory)).toMatch(/^native-mint-.+/);
    expect(readdirSync(value.attemptDirectory)).toEqual([]);
    retainAttempt('native-reservation-attempt', value.attemptDirectory);
    retainAttempt('native-mint-attempt', value.attemptDirectory);
    retainAttempt('native-approval-attempt', value.attemptDirectory); retainAttempt('native-burn-attempt', value.attemptDirectory);
    return burn;
  });
  configureNativeReturnMocks();
  readResult = (_url, method, params) => {
    if (method === 'chain_getBlockHash') return genesis;
    if (method === 'chain_getHeader') return { number: '0x0' };
    if (method === 'author_pendingExtrinsics') return [];
    if (method === 'state_getStorage') { expect(params[1]).toBe(genesis); return top[params[0] as string] ?? null; }
    throw new Error('unreviewed RPC method');
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    assertCustodyActive(); expect(active).toBe(true); expect([PRIMARY, WITNESS]).toContain(url);
    expect(init.redirect).toBe('error'); expect(init.method).toBe('POST'); expect(init.signal).toBeInstanceOf(AbortSignal);
    const { method, params } = JSON.parse(init.body as string);
    calls.push({ url, method, params }); return response(readResult(url, method, params));
  }));
});
afterEach(() => {
  if (operator) operators.disposeFederatedGenesisOperatorV1(operator);
  source?.dispose(); setup?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  rmSync(directory, { recursive: true, force: true });
});

function configureNativeReturnMocks() {
  const confirmedFee = (name: 'withdrawal' | 'tracker', byte: string, height: number) => {
    const checkName = `${name}FeeCheck` as const;
    const executeName = `${name}Fee` as const;
    mocked[checkName].mockImplementation(async value => {
      order.push(checkName); expect(value).toBe(target); expect(active).toBe(true); assertCustodyActive();
      const feeInputBox = Object.freeze({ boxId: byte.repeat(32), value: '1100000', ergoTree: setup!.signer.p2pkErgoTreeHex });
      const checked = Object.freeze({ transaction: Object.freeze({ txId: byte.repeat(32), outputs: [feeInputBox] }) });
      returnValues[checkName] = checked; return checked;
    });
    mocked[executeName].mockImplementation(async value => {
      order.push(executeName); expect(value.target).toBe(target); expect(value.checked).toBe(returnValues[checkName]);
      expect(value.state).toBe(journalState); assertCustodyActive(); expect(active).toBe(true);
      retainAttempt(`${name}-fee-attempt`);
      returnValues[executeName] = Object.freeze({ expectedTxId: value.checked.transaction.txId,
        durableAttemptDigestHex: 'de'.repeat(32), transportStatus: 'accepted', journalDigestHex: 'dd'.repeat(32),
        confirmationDigestHex: 'dc'.repeat(32), confirmationHeight: height, confirmationHeaderIdHex: 'db'.repeat(32),
        feeInputBox: value.checked.transaction.outputs[0] });
      return returnValues[executeName];
    });
  };
  confirmedFee('withdrawal', 'e1', 138); confirmedFee('tracker', 'e2', 139);
  mocked.wait.mockImplementation(async (_observer, txId, _deadline, stage, assertActive) => {
    assertActive?.();
    if (stage === 'native-checkpoint-admission') {
      expect(txId).toBe(committedVault.expectedTxId); expect(active).toBe(true);
      expect(order).toContain('withdrawalFee'); expect(order).toContain('trackerFee');
      return { status: 'confirmed', observedAtHeight: 140, confirmationHeight: 130, confirmationHeaderIdHex: '96'.repeat(32) };
    }
    expect(phase).toBe('confirmation');
    expect(txId).toBe(stage === 'native-tracker-admission' ? returnValues.trackerAttempt.expectedTxId : returnValues.payoutAttempt.expectedTxId);
    returnValues[stage] = Object.freeze({ status: 'confirmed', observedAtHeight: 165,
      confirmationHeight: 150, confirmationHeaderIdHex: 'f1'.repeat(32), observationDigestHex: 'f2'.repeat(32) });
    return returnValues[stage];
  });
  mocked.checkpoint.mockImplementation(async value => {
    order.push('checkpoint'); expect(value.execution).toBe(burn); assertCustodyActive();
    expect(active).toBe(true); expect(frontierActive).toBe(true);
    expect(value.admissionValidFromErgoHeight).toBe('140'); expect(value.admissionExpiresAtErgoHeight).toBe('204');
    const statement = buildSubstrateFederatedCheckpointStatementV1({ profile: compiled.preparation.checkpointProfile,
      sourceNetworkIdHex: 'b1'.repeat(32), sidechainIdHex: 'b2'.repeat(32), sourceNativeBlockHeight: '4',
      sourceNativeBlockHashHex: 'a1'.repeat(32), executionBlockHashHex: 'a2'.repeat(32), bridgeEventRootHex: 'a3'.repeat(32), burnLeafCount: 1,
      bridgeAddressHex: '33'.repeat(20), tokenAddressHex: '44'.repeat(20), bridgeRuntimeCodeSha256Hex: 'b5'.repeat(32), bridgeRuntimeCodeBytes: 4104,
      tokenRuntimeCodeSha256Hex: 'b6'.repeat(32), tokenRuntimeCodeBytes: 2356, sourceRuntimeCodeSha256Hex: 'b7'.repeat(32), sourceRuntimeCodeBytes: 1000,
      runtimeProfileIdHex: 'b8'.repeat(32), settlementProfileIdHex: 'b3'.repeat(32),
      admissionValidFromErgoHeight: value.admissionValidFromErgoHeight, admissionExpiresAtErgoHeight: value.admissionExpiresAtErgoHeight });
    const leaf = Object.freeze({ sidechainIdHex: statement.sidechainIdHex, sidechainBlockHashHex: statement.executionBlockHashHex,
      sidechainTxHashHex: 'a4'.repeat(32), burnIdHex: 'a5'.repeat(32), eventIndex: 2, recipientErgoTreeHashHex: 'a6'.repeat(32),
      amountNanoErg: '10000000', assetIdHex: '00'.repeat(32) });
    checkpoint = Object.freeze({ execution: burn, attestation: Object.freeze({ checkpointStatement: statement }),
      commitment: Object.freeze({ blockHashHex: `0x${statement.sourceNativeBlockHashHex}`, burnEvent: Object.freeze({ recipientErgoTreeHex: setup!.signer.p2pkErgoTreeHex }),
        burnProof: Object.freeze({ leaf, bridgeEventRootHex: statement.bridgeEventRootHex, leafIndex: 0, leafCount: 1, proof: [] }) }) });
    return checkpoint;
  });
  mocked.checkpointAssert.mockImplementation(value => {
    expect(value).toBe(checkpoint); expect(active).toBe(true); expect(frontierActive).toBe(true); assertCustodyActive();
  });
  mocked.anchor.mockImplementation(async value => {
    order.push('anchor'); expect(value.target).toBe(phaseTargets.anchor); expect(active).toBe(false);
    expect(value.expectedPriorHeight).toBe(140); expect(value.expectedPriorHeaderIdHex).toBe('97'.repeat(32));
    returnValues.anchor = Object.freeze({ anchorHeaderIdHex: 'c1'.repeat(32), anchorHeight: 141, anchorExtensionRootHex: 'c2'.repeat(32) });
    return returnValues.anchor;
  });
  mocked.anchorAssert.mockImplementation(value => { expect(value).toBe(returnValues.anchor); });
  mocked.frozenObservation.mockImplementation(async value => {
    order.push('frozenObservation'); expect(value.target).toBe(phaseTargets.frozen);
    expect(value.expectedAnchorHeaderIdHex).toBe(returnValues.anchor.anchorHeaderIdHex);
    returnValues.observation = Object.freeze({ ...returnValues.anchor, headers: [{ raw: { height: 141 } }], anchorContextIndex: 0,
      extensionMembershipProofHex: 'c3' }); return returnValues.observation;
  });
  mocked.observationAssert.mockImplementation(value => { expect(value).toBe(returnValues.observation); });
  mocked.headers.mockImplementation(() => (returnValues.headers = Object.freeze({ component: 'observed headers double' })));
  mocked.context.mockImplementation(async value => {
    order.push('context'); expect(value.trackerInputBox).toBe(compiled.issuance.orderedTransactions[0].transaction.outputs[0]);
    expect(value.observedHeaderContext).toBe(returnValues.headers); expect(value.encodedStatementHex).toBe(checkpoint.attestation.checkpointStatement.encodedStatementHex);
    returnValues.context = Object.freeze({ component: 'tracker context double' }); return returnValues.context;
  });
  mocked.trackerTx.mockImplementation(async value => {
    order.push('trackerTx'); expect(value.trackerContext).toBe(returnValues.context); expect(value.feeInputBox).toBe(returnValues.trackerFee.feeInputBox);
    returnValues.trackerTx = Object.freeze({ unsignedTransactionIdHex: 'e3'.repeat(32) }); return returnValues.trackerTx;
  });
  mocked.trackerCheck.mockImplementation(async (value, ownedTarget) => {
    order.push('trackerCheck'); expect(ownedTarget).toBe(phaseTargets.frozen); expect(value.transaction).toBe(returnValues.trackerTx);
    expect(() => mocked.batch(batch, target)).toThrow('target inactive'); assertCustodyActive();
    returnValues.trackerCheck = Object.freeze({ result: Object.freeze({ checkDigestHex: 'd1'.repeat(32) }) }); return returnValues.trackerCheck;
  });
  mocked.trackerAuthorize.mockImplementation(async (value, ownedTarget) => {
    order.push('trackerAuthorize'); expect(value).toBe(returnValues.trackerCheck); expect(ownedTarget).toBe(phaseTargets.frozen);
    returnValues.trackerAuthorization = Object.freeze({ authorizationDigestHex: 'd2'.repeat(32) }); return returnValues.trackerAuthorization;
  });
  mocked.trackerReserve.mockImplementation((value, state) => {
    order.push('trackerReserve'); expect(value).toBe(returnValues.trackerAuthorization); expect(state).toBe(journalState);
    retainAttempt('tracker-admission-attempt'); returnValues.trackerAttempt = Object.freeze({ expectedTxId: 'e3'.repeat(32), durableAttemptDigestHex: 'd3'.repeat(32) });
    return returnValues.trackerAttempt;
  });
  mocked.trackerFreshness.mockImplementation(async (value, ownedTarget) => {
    order.push('trackerFreshness'); expect(value).toBe(returnValues.trackerAttempt); expect(ownedTarget).toBe(phaseTargets.freshness);
    returnValues.freshness = Object.freeze({ component: 'freshness completion double' }); return returnValues.freshness;
  });
  for (const name of ['tracker', 'payout'] as const) {
    mocked[`${name}Submit`].mockImplementation(async (ownedTarget, value) => {
      order.push(`${name}Submit`); expect(value).toBe(returnValues[`${name}Attempt`]);
      expect(ownedTarget).toBe(name === 'tracker' ? phaseTargets.transport : phaseTargets.confirmation);
      expect(StateTracker.prototype.close).not.toHaveBeenCalled(); retainAttempt(`${name}-transport-attempt`);
      returnValues[`${name}Submission`] = Object.freeze({ status: 'accepted', responseDigestHex: 'f3'.repeat(32) }); return returnValues[`${name}Submission`];
    });
    mocked[`${name}Finalize`].mockImplementation((attempt, submission) => {
      order.push(`${name}Finalize`); expect(attempt).toBe(returnValues[`${name}Attempt`]); expect(submission).toBe(returnValues[`${name}Submission`]);
      return Object.freeze({ journalDigestHex: 'f4'.repeat(32) });
    });
    mocked[`${name}Confirm`].mockImplementation(async (attempt, ownedTarget, confirmation) => {
      order.push(`${name}Confirm`); expect(attempt).toBe(returnValues[`${name}Attempt`]); expect(ownedTarget).toBe(phaseTargets.confirmation);
      expect(confirmation).toBe(returnValues[name === 'tracker' ? 'native-tracker-admission' : 'native-withdrawal']);
      return Object.freeze({ expectedTxId: attempt.expectedTxId, status: 'confirmed', confirmationHeight: confirmation.confirmationHeight,
        confirmationHeaderId: confirmation.confirmationHeaderIdHex });
    });
  }
  mocked.payoutCheck.mockImplementation(async (claim, ownedTarget) => {
    order.push('payoutCheck'); expect(ownedTarget).toBe(phaseTargets.confirmation); assertCustodyActive();
    expect(claim.burnLeaf).toEqual(checkpoint.commitment.burnProof.leaf);
    expect(claim.burnProof).toBe(checkpoint.commitment.burnProof.proof);
    expect(claim.recipientErgoTreeHex).toBe(setup!.signer.p2pkErgoTreeHex); setup!.dispose();
    returnValues.payoutCheck = Object.freeze({ packet: Object.freeze({ transaction: Object.freeze({ txId: 'e4'.repeat(32) }),
      burn: Object.freeze({ leaf: claim.burnLeaf }), boxes: Object.freeze({ payout: { boxId: 'f5'.repeat(32) },
        reserveSuccessor: { boxId: 'f6'.repeat(32) }, duplicatePreventionSuccessor: { boxId: 'f7'.repeat(32) } }) }) });
    return returnValues.payoutCheck;
  });
  mocked.payoutAuthorize.mockImplementation(async (value, ownedTarget) => {
    order.push('payoutAuthorize'); expect(value).toBe(returnValues.payoutCheck); expect(ownedTarget).toBe(phaseTargets.confirmation);
    expect(() => assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer)).toThrow(/active process provenance/);
    returnValues.payoutAuthorization = Object.freeze({ authorizationDigestHex: 'f8'.repeat(32) }); return returnValues.payoutAuthorization;
  });
  mocked.payoutReserve.mockImplementation((value, state) => {
    order.push('payoutReserve'); expect(value).toBe(returnValues.payoutAuthorization); expect(state).toBe(journalState);
    retainAttempt('payout-attempt'); returnValues.payoutAttempt = Object.freeze({ expectedTxId: 'e4'.repeat(32), durableAttemptDigestHex: 'f9'.repeat(32) });
    return returnValues.payoutAttempt;
  });
}

describe('fresh FED target composition', () => {
  function assertNativeReturnHeldBeforeAnchor() {
    expect(mocked.withdrawalFee).toHaveBeenCalledOnce(); expect(mocked.trackerFee).toHaveBeenCalledOnce();
    expect(mocked.checkpoint).toHaveBeenCalledOnce(); expect(mocked.checkpointAssert).toHaveBeenCalledOnce();
    expect(order).not.toContain('anchor-phase');
    for (const name of ['anchor', 'trackerCheck', 'trackerAuthorize', 'trackerReserve', 'trackerSubmit',
      'payoutCheck', 'payoutAuthorize', 'payoutReserve', 'payoutSubmit'] as const) expect(mocked[name]).not.toHaveBeenCalled();
    assertDownstreamCleanup();
  }

  function replaceCheckpointField(value: any, path: readonly string[], replacement: unknown): any {
    const [field, ...rest] = path;
    return Object.freeze({ ...value, [field!]: rest.length ? replaceCheckpointField(value[field!], rest, replacement) : replacement });
  }

  it.each([
    { name: 'burn proof leaf count', path: ['commitment', 'burnProof', 'leafCount'], value: 2 },
    { name: 'burn proof leaf index', path: ['commitment', 'burnProof', 'leafIndex'], value: 1 },
    { name: 'global burn event index', path: ['commitment', 'burnProof', 'leaf', 'eventIndex'], value: 3 },
    { name: 'proof root agreement', path: ['commitment', 'burnProof', 'bridgeEventRootHex'], value: 'af'.repeat(32) },
    { name: 'statement leaf count agreement', path: ['attestation', 'checkpointStatement', 'burnLeafCount'], value: 2 },
    { name: 'native hash in the Ethereum leaf', path: ['commitment', 'burnProof', 'leaf', 'sidechainBlockHashHex'], value: 'a1'.repeat(32) },
    { name: 'Ethereum hash in the native commitment', path: ['commitment', 'blockHashHex'], value: `0x${'a2'.repeat(32)}` },
    { name: 'gross amount in the net burn leaf', path: ['commitment', 'burnProof', 'leaf', 'amountNanoErg'], value: '15000000' },
    { name: 'burn recipient', path: ['commitment', 'burnEvent', 'recipientErgoTreeHex'],
      value: '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' },
  ])('rejects native return guard field $name before the anchor', async ({ path, value }) => {
    const original = mocked.checkpoint.getMockImplementation()!;
    mocked.checkpoint.mockImplementation(async (...args) => {
      // The producer double owns this result; change one field without copying the retained execution or custody.
      checkpoint = replaceCheckpointField(await original(...args), path, value);
      return checkpoint;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toMatchObject({
      message: 'FED native withdrawal differs from its attested burn or confirmed fee window',
    });
    assertNativeReturnHeldBeforeAnchor();
  });

  it.each([
    { purpose: 'withdrawal', boundary: 'final snapshot', bound: 139 },
    { purpose: 'tracker', boundary: 'final snapshot', bound: 138 },
    { purpose: 'withdrawal', boundary: 'attested window', bound: 139 },
    { purpose: 'tracker', boundary: 'attested window', bound: 138 },
  ] as const)('rejects native return guard field $purpose fee beyond $boundary before the anchor', async ({ purpose, boundary, bound }) => {
    if (purpose === 'withdrawal') {
      // Both fees still precede the initial height-140 window; only the withdrawal fee exceeds the tested bound.
      const original = mocked.withdrawalFee.getMockImplementation()!;
      mocked.withdrawalFee.mockImplementation(async (...args) => {
        returnValues.withdrawalFee = Object.freeze({ ...await original(...args), confirmationHeight: 140 });
        return returnValues.withdrawalFee;
      });
    }
    if (boundary === 'final snapshot') {
      const original = mocked.process.getMockImplementation()!;
      mocked.process.mockImplementation((...args) => {
        const owner = original(...args);
        return { ...owner, withMiningActiveExecutionTarget: async (...phaseArgs: any[]) => {
          const result = await owner.withMiningActiveExecutionTarget(...phaseArgs);
          return { ...result, receipt: { ...result.receipt, finalSnapshot: { ...result.receipt.finalSnapshot, fullHeight: bound } } };
        } };
      });
    } else {
      const original = mocked.checkpoint.getMockImplementation()!;
      mocked.checkpoint.mockImplementation(async (...args) => {
        checkpoint = replaceCheckpointField(await original(...args), ['attestation', 'checkpointStatement', 'admissionValidFromErgoHeight'], String(bound));
        return checkpoint;
      });
    }
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toMatchObject({
      message: 'FED native withdrawal differs from its attested burn or confirmed fee window',
    });
    assertNativeReturnHeldBeforeAnchor();
  });

  it.each(['withdrawal', 'tracker'] as const)('holds the anchor until %s fee confirmation is exact', async purpose => {
    const consume = mocked[`${purpose}Fee`];
    const original = consume.getMockImplementation()!;
    consume.mockImplementation(async (...args) => ({ ...await original(...args), confirmationHeight: null }));
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('external fee funding lacks canonical confirmation');
    expect(mocked.checkpoint).not.toHaveBeenCalled(); expect(mocked.anchor).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledOnce(); assertDownstreamCleanup();
  });

  it.each(['overlap', 'transaction', 'output'] as const)('rejects %s in the two retained fee receipts before attestation', async fault => {
    const original = mocked.trackerFee.getMockImplementation()!;
    mocked.trackerFee.mockImplementation(async (...args) => {
      const value = await original(...args);
      return fault === 'transaction' ? { ...value, expectedTxId: 'ff'.repeat(32) }
        : { ...value, feeInputBox: fault === 'overlap' ? returnValues.withdrawalFee.feeInputBox
          : { ...value.feeInputBox, boxId: 'ff'.repeat(32) } };
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('external fee inputs differ');
    expect(mocked.checkpoint).not.toHaveBeenCalled(); expect(mocked.anchor).not.toHaveBeenCalled(); assertDownstreamCleanup();
  });

  it.each(['height', 'header', 'window'] as const)('rejects changed reserve %s before native checkpoint attestation', async fault => {
    const original = mocked.wait.getMockImplementation()!;
    mocked.wait.mockImplementation(async (...args) => {
      const value = await original(...args);
      return args[3] !== 'native-checkpoint-admission' ? value : fault === 'height' ? { ...value, confirmationHeight: 129 }
        : fault === 'header' ? { ...value, confirmationHeaderIdHex: 'ff'.repeat(32) } : { ...value, observedAtHeight: 138 };
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('admission window does not follow');
    expect(mocked.checkpoint).not.toHaveBeenCalled(); expect(mocked.anchor).not.toHaveBeenCalled(); assertDownstreamCleanup();
  });

  it.each(['checkpoint', 'withdrawalFeeCheck', 'trackerCheck', 'payoutCheck'] as const)
    ('does not convert a JSON copy of %s into continuation authority', async stage => {
      const original = mocked[stage].getMockImplementation()!;
      mocked[stage].mockImplementation(async (...args) => JSON.parse(JSON.stringify(await original(...args))));
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow();
      expect(mocked.payoutConfirm).not.toHaveBeenCalled(); assertDownstreamCleanup();
    });

  for (const stage of ['anchor', 'trackerCheck', 'trackerFreshness', 'trackerSubmit'] as const) {
    it.each(['source', 'setup', 'operator'] as const)(`holds the native return after %s disposal at awaited ${stage}`, async owner => {
      const original = mocked[stage].getMockImplementation()!;
      mocked[stage].mockImplementation(async (...args) => {
        const value = await original(...args);
        if (owner === 'source') source!.dispose();
        if (owner === 'setup') setup!.dispose();
        if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
        return value;
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/disposed|active process provenance/);
      expect(mocked[stage]).toHaveBeenCalledOnce(); expect(mocked.payoutCheck).not.toHaveBeenCalled();
      if (stage === 'trackerSubmit') expect(mocked.trackerFinalize).toHaveBeenCalledOnce();
      assertDownstreamCleanup();
    });
  }

  it.each(['source', 'operator'] as const)('records the payout response then holds confirmation after %s disposal', async owner => {
    const original = mocked.payoutSubmit.getMockImplementation()!;
    mocked.payoutSubmit.mockImplementation(async (...args) => {
      const value = await original(...args);
      if (owner === 'source') source!.dispose(); else operators.disposeFederatedGenesisOperatorV1(operator!);
      return value;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/disposed/);
    expect(mocked.payoutSubmit).toHaveBeenCalledOnce(); expect(mocked.payoutFinalize).toHaveBeenCalledOnce();
    expect(mocked.payoutConfirm).not.toHaveBeenCalled(); assertDownstreamCleanup();
  });

  it.each(['accepted', 'ambiguous_http_response'] as const)('retains native tracker failure diagnostic after %s without retry or payout', async outcome => {
    const failure = new Error('native tracker confirmation deadline');
    const originalSubmission = mocked.trackerSubmit.getMockImplementation()!;
    mocked.trackerSubmit.mockImplementation(async (...args) => {
      const value = await originalSubmission(...args);
      returnValues.trackerSubmission = Object.freeze({ ...value, status: outcome === 'accepted' ? 'accepted' : 'ambiguous' });
      return returnValues.trackerSubmission;
    });
    const transport = Object.freeze({ outcome, httpStatus: outcome === 'accepted' ? 200 : 400,
      expectedTxId: 'e3'.repeat(32), durableAttemptDigestHex: 'd3'.repeat(32), responseDigestHex: 'f3'.repeat(32) });
    const confirmation = Object.freeze({ category: 'not_found_at_deadline', expectedTransactionIdHex: 'e3'.repeat(32),
      executionTargetIdentityDigestHex: 'ca'.repeat(32), confirmationBudgetMs: 120000, observationCount: 3,
      lastObservation: Object.freeze({ status: 'not_found', confirmations: 0, observedAtHeight: 165,
        observationDigestHex: 'f2'.repeat(32) }) });
    mocked.projectSubmission.mockImplementation(value => value === returnValues.trackerSubmission ? transport : null);
    mocked.projectConfirmation.mockImplementation(value => value === failure ? confirmation : null);
    const progress = confirmationProgress();
    mocked.projectProgress.mockImplementation((observer, txId, targetIdentity) => {
      expect(observer).toBe(mocked.confirmation.mock.results.at(-1)!.value);
      expect(txId).toBe('e3'.repeat(32)); expect(targetIdentity).toBe('ca'.repeat(32));
      expect(mocked.projectConfirmation).toHaveBeenCalledWith(failure);
      // V1 evidence is registered before the optional progress producer runs.
      expect(projectSubstrateFederatedNativeTrackerConfirmationFailureV1(failure)).toEqual({ transport, confirmation });
      return progress;
    });
    const original = mocked.wait.getMockImplementation()!;
    mocked.wait.mockImplementation(async (...args) => {
      if (args[3] === 'native-tracker-admission') throw failure;
      return original(...args);
    });
    expect(await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error)).toBe(failure);
    const diagnostic = projectSubstrateFederatedNativeTrackerConfirmationFailureV1(failure);
    expect(diagnostic).toEqual({ transport, confirmation });
    expect(diagnostic?.transport).toBe(transport); expect(diagnostic?.confirmation).toEqual(confirmation);
    expect(Object.isFrozen(diagnostic?.confirmation)).toBe(true);
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(projectSubstrateFederatedNativeTrackerConfirmationProgressV1(failure)).toBe(progress);
    expect(projectSubstrateFederatedNativeTrackerConfirmationProgressV1(new Error(failure.message))).toBeNull();
    expect(projectSubstrateFederatedNativeTrackerConfirmationProgressV1(structuredClone(progress))).toBeNull();
    expect(projectSubstrateFederatedNativeTrackerConfirmationFailureV1(new Error(failure.message))).toBeNull();
    expect(projectSubstrateFederatedNativeTrackerConfirmationFailureV1(structuredClone(diagnostic))).toBeNull();
    expect(mocked.trackerSubmit).toHaveBeenCalledOnce(); expect(mocked.trackerFinalize).toHaveBeenCalledOnce();
    expect(mocked.trackerConfirm).not.toHaveBeenCalled(); expect(mocked.payoutCheck).not.toHaveBeenCalled();
    expect(mocked.payoutSubmit).not.toHaveBeenCalled(); assertDownstreamCleanup();
  });

  it.each(['missing transport', 'missing confirmation', 'transport transaction', 'transport attempt',
    'confirmation transaction', 'confirmation target', 'throwing transport projector', 'throwing confirmation projector'] as const)(
    'refuses native tracker failure diagnostic for %s while preserving the original failure', async fault => {
      const failure = new Error('original native tracker deadline');
      const transport = Object.freeze({ outcome: 'accepted', httpStatus: 200, expectedTxId: 'e3'.repeat(32),
        durableAttemptDigestHex: 'd3'.repeat(32), responseDigestHex: 'f3'.repeat(32) });
      const confirmation = Object.freeze({ category: 'not_found_at_deadline', expectedTransactionIdHex: 'e3'.repeat(32),
        executionTargetIdentityDigestHex: 'ca'.repeat(32) });
      mocked.projectProgress.mockReturnValue(confirmationProgress());
      mocked.projectSubmission.mockImplementation(value => {
        expect(value).toBe(returnValues.trackerSubmission);
        if (fault === 'throwing transport projector') throw new Error('diagnostic projection failure');
        return fault === 'missing transport' ? null : fault === 'transport transaction'
          ? { ...transport, expectedTxId: 'ff'.repeat(32) } : fault === 'transport attempt'
          ? { ...transport, durableAttemptDigestHex: 'ff'.repeat(32) } : transport;
      });
      mocked.projectConfirmation.mockImplementation(value => {
        expect(value).toBe(failure);
        if (fault === 'throwing confirmation projector') throw new Error('diagnostic projection failure');
        return fault === 'missing confirmation' ? null : fault === 'confirmation transaction'
          ? { ...confirmation, expectedTransactionIdHex: 'ff'.repeat(32) } : fault === 'confirmation target'
          ? { ...confirmation, executionTargetIdentityDigestHex: 'ff'.repeat(32) } : confirmation;
      });
      const original = mocked.wait.getMockImplementation()!;
      mocked.wait.mockImplementation(async (...args) => {
        if (args[3] === 'native-tracker-admission') throw failure;
        return original(...args);
      });
      expect(await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error)).toBe(failure);
      expect(projectSubstrateFederatedNativeTrackerConfirmationFailureV1(failure)).toBeNull();
      expect(projectSubstrateFederatedNativeTrackerConfirmationProgressV1(failure)).toBeNull();
      expect(mocked.projectProgress).not.toHaveBeenCalled();
      expect(mocked.trackerSubmit).toHaveBeenCalledOnce(); expect(mocked.trackerFinalize).toHaveBeenCalledOnce();
      expect(mocked.trackerConfirm).not.toHaveBeenCalled(); expect(mocked.payoutCheck).not.toHaveBeenCalled();
      assertDownstreamCleanup();
    });

  it.each(['missing', 'transaction', 'target', 'genesis', 'throwing projector'] as const)(
    'refuses native confirmation progress for %s while retaining V1 evidence and original failure', async fault => {
      const failure = new Error('original native tracker deadline');
      const transport = Object.freeze({ outcome: 'accepted', httpStatus: 200, expectedTxId: 'e3'.repeat(32),
        durableAttemptDigestHex: 'd3'.repeat(32), responseDigestHex: 'f3'.repeat(32) });
      const confirmation = Object.freeze({ category: 'not_found_at_deadline', expectedTransactionIdHex: 'e3'.repeat(32),
        executionTargetIdentityDigestHex: 'ca'.repeat(32) });
      mocked.projectSubmission.mockImplementation(value => value === returnValues.trackerSubmission ? transport : null);
      mocked.projectConfirmation.mockImplementation(value => value === failure ? confirmation : null);
      const progress = confirmationProgress();
      mocked.projectProgress.mockImplementation(() => {
        if (fault === 'throwing projector') throw new Error('optional progress producer failure');
        return fault === 'missing' ? null : fault === 'transaction'
          ? { ...progress, expectedErgoTransactionIdHex: 'ff'.repeat(32) } : fault === 'target'
          ? { ...progress, executionTargetIdentityDigestHex: 'ff'.repeat(32) } : fault === 'genesis'
          ? { ...progress, targetGenesisHeaderIdHex: 'ff'.repeat(32) } : progress;
      });
      const original = mocked.wait.getMockImplementation()!;
      mocked.wait.mockImplementation(async (...args) => args[3] === 'native-tracker-admission'
        ? Promise.reject(failure) : original(...args));
      expect(await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error)).toBe(failure);
      expect(projectSubstrateFederatedNativeTrackerConfirmationFailureV1(failure)).toEqual({ transport, confirmation });
      expect(projectSubstrateFederatedNativeTrackerConfirmationProgressV1(failure)).toBeNull();
      expect(mocked.trackerSubmit).toHaveBeenCalledOnce(); expect(mocked.trackerFinalize).toHaveBeenCalledOnce();
      expect(mocked.trackerConfirm).not.toHaveBeenCalled(); expect(mocked.payoutCheck).not.toHaveBeenCalled();
      expect(mocked.payoutSubmit).not.toHaveBeenCalled(); assertDownstreamCleanup();
    });

  it.each(['primary', 'nested primary', 'secondary', 'over depth', 'cause', 'getter', 'proxy'] as const)(
    'projects genuine native tracker diagnostics through the %s failure boundary', async shape => {
      const real = await vi.importActual<typeof import('./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js')>(
        './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js');
      mocked.projectConfirmation.mockImplementation(real.projectTrackerCanonicalConfirmationFailureDiagnosticV1);
      const progress = confirmationProgress();
      mocked.projectProgress.mockReturnValue(progress);
      mocked.projectSubmission.mockImplementation(value => value === returnValues.trackerSubmission
        ? Object.freeze({ outcome: 'accepted', httpStatus: 200, expectedTxId: 'e3'.repeat(32),
          durableAttemptDigestHex: 'd3'.repeat(32), responseDigestHex: 'f3'.repeat(32) }) : null);
      const originalWait = mocked.wait.getMockImplementation()!;
      mocked.wait.mockImplementation(async (...args) => args[3] === 'native-tracker-admission'
        ? real.waitForCanonicalConfirmation(args[0], args[1], performance.now() - 1, args[3], args[4])
        : originalWait(...args));
      const originalProcess = mocked.process.getMockImplementation()!;
      let originalFailure: unknown;
      let returnedFailure: unknown;
      const trap = vi.fn(() => { throw new Error('failure accessor must not execute'); });
      mocked.process.mockImplementation((...args) => {
        const process = originalProcess(...args);
        return { ...process, withTrackerTransportConfirmationMiningTarget: async (...confirmationArgs: unknown[]) => {
          try { return await process.withTrackerTransportConfirmationMiningTarget(...confirmationArgs); }
          catch (failure) {
            originalFailure = failure;
            const cleanup = new Error('process cleanup failure');
            returnedFailure = new AggregateError([failure, cleanup], 'confirmation and cleanup failed');
            if (shape === 'nested primary' || shape === 'over depth') {
              for (let i = 1; i < (shape === 'nested primary' ? 3 : 4); i += 1) {
                returnedFailure = new AggregateError([returnedFailure, cleanup], 'outer cleanup failed');
              }
            } else if (shape === 'secondary') returnedFailure = new AggregateError([cleanup, failure], 'secondary only');
            else if (shape === 'cause') returnedFailure = new Error('cause only', { cause: failure });
            else if (shape === 'getter') Object.defineProperty(returnedFailure, 'errors', { get: trap });
            else if (shape === 'proxy') returnedFailure = new Proxy(returnedFailure as object, { getOwnPropertyDescriptor: trap });
            throw returnedFailure;
          }
        } };
      });
      const caught = await runSubstrateFederatedGenesisTargetRootV1(input).catch(failure => failure);
      expect(caught).toBe(returnedFailure);
      const direct = projectSubstrateFederatedNativeTrackerConfirmationFailureV1(originalFailure);
      expect(direct?.confirmation.category).toBe('managed_deadline_elapsed');
      expect(direct?.confirmation.observationCount).toBe(0);
      expect(projectSubstrateFederatedNativeTrackerConfirmationFailureV1(caught))
        .toBe(shape === 'primary' || shape === 'nested primary' ? direct : null);
      expect(projectSubstrateFederatedNativeTrackerConfirmationProgressV1(originalFailure)).toBe(progress);
      expect(projectSubstrateFederatedNativeTrackerConfirmationProgressV1(caught))
        .toBe(shape === 'primary' || shape === 'nested primary' ? progress : null);
      expect(trap).not.toHaveBeenCalled();
      expect(mocked.trackerSubmit).toHaveBeenCalledOnce(); expect(mocked.trackerFinalize).toHaveBeenCalledOnce();
      expect(mocked.trackerConfirm).not.toHaveBeenCalled(); expect(mocked.payoutCheck).not.toHaveBeenCalled();
      assertDownstreamCleanup();
    });

  it('retains a pending payout attempt without retry or terminal success', async () => {
    const original = mocked.wait.getMockImplementation()!;
    mocked.wait.mockImplementation(async (...args) => {
      if (args[3] === 'native-withdrawal') throw new Error('native payout confirmation pending; retained attempt');
      return original(...args);
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('native payout confirmation pending');
    expect(mocked.payoutSubmit).toHaveBeenCalledOnce(); expect(mocked.payoutFinalize).toHaveBeenCalledOnce();
    expect(mocked.payoutConfirm).not.toHaveBeenCalled(); assertDownstreamCleanup();
  });

  it.each(['status', 'transaction', 'height', 'header'] as const)('requires canonical payout %s before returning success', async fault => {
    const original = mocked.payoutConfirm.getMockImplementation()!;
    mocked.payoutConfirm.mockImplementation(async (...args) => {
      const result = await original(...args);
      return fault === 'status' ? { ...result, status: 'pending' } : fault === 'transaction' ? { ...result, expectedTxId: 'ff'.repeat(32) }
        : fault === 'height' ? { ...result, confirmationHeight: null } : { ...result, confirmationHeaderId: null };
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('return lacks its exact canonical payout');
    expect(mocked.payoutSubmit).toHaveBeenCalledOnce(); expect(mocked.payoutConfirm).toHaveBeenCalledOnce(); assertDownstreamCleanup();
  });

  it('binds retained custody, actual component handles and both target views, then disposes them', async () => {
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(result.status).toBe('fresh-federated-round-trip-confirmed');
    expect(result.nativeGenesisHashHex).toBe(genesis);
    expect(result.operatorAddressHex).toBe(operator!.addressHex);
    expect(result.issuanceInputBoxIds).toEqual(discovery.observation.genesisBoxIds);
    expect(result.unsignedIssuance).toEqual(compiled.issuance.orderedTransactions.map(({ role, transaction }: any) => ({
      role, transactionIdHex: transaction.txId, predictedSingletonBoxIdHex: transaction.outputs[0].boxId,
    })));
    expect(result.singletonIssuanceEstablished).toBe(true); expect(result.operationalMintEstablished).toBe(true);
    expect(result.canonicalPayoutEstablished).toBe(true); expect(result.withdrawal.payout.amountNanoErg).toBe('10000000');
    expect(result.sourceFinalityEstablished).toBe(false); expect(result.trustless).toBe(false);
    expect(mocked.projectConfirmation).not.toHaveBeenCalled(); expect(mocked.projectSubmission).not.toHaveBeenCalled();
    expect(mocked.projectProgress).not.toHaveBeenCalled();
    expect(projectSubstrateFederatedNativeTrackerConfirmationProgressV1(result)).toBeNull();
    expect(result.pegIn).toEqual({ sourceLockTransactionIdHex: sourceLock.expectedTxId,
      reserveTransitionTransactionIdHex: committedVault.expectedTxId, sourceLockBoxIdHex: packet.boxes.sourceLock.boxId,
      reserveSuccessorBoxIdHex: packet.boxes.reserveSuccessor.boxId, mintIdentityHex: mint.mintIdentityHex,
      sourceProofReceiptDigestHex: proof.receiptDigestHex });
    expect(Object.isFrozen(result.pegIn)).toBe(true); expect(result.mint).toBe(mint);
    expect(result.issuedTransactions).toBe(receipts); expect(observeConfirmation).toHaveBeenCalledTimes(6);
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce();
    expect(readdirSync(join(directory, 'target')).filter(name => name.startsWith('issuance-journal-'))).toHaveLength(1);
    expect(result.storageKeysChecked).toBe(6); expect(Object.isFrozen(result)).toBe(true);
    expect(order).toEqual(['setup', 'source', 'operator', 'frontier-build', 'ergo-build', 'process', 'mine',
      'discover', 'history', 'compile', 'materialize', 'nodes', 'check', 'execute',
      ...downstreamStages, 'withdrawalFeeCheck', 'withdrawalFee', 'trackerFeeCheck', 'trackerFee', 'checkpoint', 'nodes-stop',
      'anchor-phase', 'anchor', 'frozen-phase', 'frozenObservation', 'context', 'trackerTx', 'trackerCheck', 'trackerAuthorize', 'trackerReserve',
      'freshness-phase', 'trackerFreshness', 'transport-phase', 'trackerSubmit', 'trackerFinalize', 'confirmation-phase', 'trackerConfirm',
      'payoutCheck', 'payoutAuthorize', 'payoutReserve', 'payoutSubmit', 'payoutFinalize', 'payoutConfirm', 'stop']);
    expect(calls.filter(call => call.method === 'state_getStorage')).toHaveLength(28);
    expect(new Set(calls.map(call => call.url))).toEqual(new Set([PRIMARY, WITNESS]));
    expect(mocked.pin).toHaveBeenCalledTimes(2); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    assertDownstreamPrefix('mint'); assertDownstreamCleanup();
    expect(mocked.fundingOwned).toHaveBeenCalledOnce();
    expect(mocked.frontierOwned).toHaveBeenCalledWith(frontierEndpoints);
    expect(readdirSync(journalDirectory).filter(name => name.startsWith('native-mint-'))).toHaveLength(1);
  });

  it('returns only public receipt data, never portable custody or downstream handles', async () => {
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(Object.keys(result).sort()).toEqual(['status', 'nativeGenesisHashHex', 'frontierProcess',
      'typedGenesisSha256Hex', 'rawSpecSha256Hex', 'runtimeProfileIdHex', 'familyIdHex', 'sourceProofProfileIdHex',
      'nodeSha256Hex', 'wasmSha256Hex', 'operatorAddressHex', 'storageKeysChecked', 'issuanceInputBoxIds',
      'issuedTransactions', 'pegIn', 'mint', 'unsignedIssuance', 'ergoExecution', 'singletonIssuanceEstablished',
      'operationalMintEstablished', 'sourceFinalityEstablished', 'trustless', 'burn', 'withdrawal', 'canonicalPayoutEstablished'].sort());
    const privateHandles = new Set([setup, retainedSetup, source, operator, miningCredential, target,
      frontierEndpoints, batch, compiled, funding, packet, sourceLock, sourceLock.outputObservation,
      committedVault, committedVault.outputObservation, draftInputs, draft, evidence, proof, journalState]);
    const visit = (value: unknown) => {
      expect(typeof value).not.toBe('function'); expect(typeof value).not.toBe('symbol');
      if (value === null || typeof value !== 'object') return;
      expect(privateHandles.has(value)).toBe(false);
      expect(Object.getOwnPropertySymbols(value)).toEqual([]);
      expect([Object.prototype, Array.prototype, null]).toContain(Object.getPrototypeOf(value));
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
        expect(descriptor.get).toBeUndefined(); expect(descriptor.set).toBeUndefined(); visit(descriptor.value);
      }
    };
    visit(result); expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  for (const stage of ['funding', 'packet', 'sourceLock', 'committedVault', 'mint'] as const) {
    it.each(['source', 'setup', 'operator', 'Ergo target', 'FED target', 'batch'] as const)
      (`holds later transactions after losing %s at awaited ${stage}`, async owner => {
        const component = stageMock(stage);
        const run = component.getMockImplementation()!;
        component.mockImplementation(async (...args) => {
          const result = await run(...args);
          if (stage === 'funding' && result !== funding) return result;
          if (owner === 'source') source!.dispose();
          if (owner === 'setup') setup!.dispose();
          if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
          if (owner === 'Ergo target') active = false;
          if (owner === 'FED target') frontierActive = false;
          if (owner === 'batch') batchActive = false;
          return result;
        });
        await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(
          /disposed|active process provenance|target inactive|batch inactive/);
        assertDownstreamPrefix(stage); assertDownstreamCleanup();
      });
  }

  it.each(downstreamStages)('preserves attempts and disposes all owners on %s failure without retry', async stage => {
    const component = stageMock(stage);
    const run = component.getMockImplementation()!;
    const reject = () => { throw new Error(`downstream ${stage} failed`); };
    if (['draft', 'evidence', 'proof'].includes(stage)) {
      component.mockImplementation((...args) => { run(...args); return reject(); });
    } else {
      component.mockImplementation(async (...args) => {
        const result = await run(...args);
        if (stage === 'funding' && result !== funding) return result;
        return reject();
      });
    }
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(`downstream ${stage} failed`);
    assertDownstreamPrefix(stage); assertDownstreamCleanup();
    expect(readdirSync(journalDirectory).filter(name => name.startsWith('native-mint-'))).toHaveLength(stage === 'mint' ? 1 : 0);
  });

  for (const stage of ['draft', 'evidence', 'proof'] as const) {
    it.each(['source', 'setup', 'operator', 'Ergo target', 'FED target', 'batch'] as const)
      (`holds mint after losing %s during synchronous ${stage}`, async owner => {
        const component = stageMock(stage);
        const run = component.getMockImplementation()!;
        component.mockImplementation((...args) => {
          const result = run(...args);
          if (owner === 'source') source!.dispose();
          if (owner === 'setup') setup!.dispose();
          if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
          if (owner === 'Ergo target') active = false;
          if (owner === 'FED target') frontierActive = false;
          if (owner === 'batch') batchActive = false;
          return result;
        });
        await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(
          /disposed|active process provenance|target inactive|batch inactive/);
        // Synchronous doubles can finish, but no new transaction may follow them.
        assertDownstreamPrefix('proof'); assertDownstreamCleanup();
        expect(readdirSync(journalDirectory).filter(name => name.startsWith('native-mint-'))).toEqual([]);
      });
  }

  it('rejects lost FED endpoint ownership before observing genesis or allocating a journal', async () => {
    mocked.frontierOwned.mockImplementationOnce(() => { throw new Error('FED target inactive'); });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('FED target inactive');
    expect(fetch).not.toHaveBeenCalled(); expect(mocked.check).not.toHaveBeenCalled();
    expect(mocked.execute).not.toHaveBeenCalled(); expect(mocked.packet).not.toHaveBeenCalled();
    expect(StateTracker.prototype.close).not.toHaveBeenCalled();
    expect(readdirSync(join(directory, 'target')).filter(name => name.startsWith('issuance-journal-'))).toEqual([]);
    expect(order.slice(-2)).toEqual(['nodes-stop', 'stop']); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
  });

  it.each(['provenance', 'genesis', 'height'] as const)('rejects second funding %s before constructing a packet', async fault => {
    if (fault === 'provenance') mocked.fundingOwned.mockImplementationOnce(() => { throw new Error('funding provenance lost'); });
    else funding = { ...funding, observation: { ...funding.observation, target: { ...funding.observation.target,
      ...(fault === 'genesis' ? { genesisHeaderIdHex: '99'.repeat(32) } : { tipHeight: 99 }) } } };
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/funding provenance lost|does not follow/);
    expect(mocked.fundingOwned).toHaveBeenCalledOnce();
    assertDownstreamPrefix('funding'); assertDownstreamCleanup();
  });

  it.each(['top extra', 'top accessor', 'nested extra', 'nested accessor', 'different roots'])
    ('rejects %s before creating custody or building', async fault => {
      const getter = vi.fn(() => input.frontierBuild);
      const value: any = { ...input, frontierBuild: { ...input.frontierBuild } };
      if (fault === 'top extra') value.callback = () => undefined;
      if (fault === 'top accessor') Object.defineProperty(value, 'frontierBuild', { enumerable: true, get: getter });
      if (fault === 'nested extra') value.frontierBuild.sourceSession = {};
      if (fault === 'nested accessor') Object.defineProperty(value.frontierBuild, 'bridgeRoot', { enumerable: true, get: getter });
      if (fault === 'different roots') value.frontierBuild.bridgeRoot = directory;
      await expect(runSubstrateFederatedGenesisTargetRootV1(value)).rejects.toThrow(
        fault === 'different roots' ? /same bridge repository/ : /exact data fields/);
      expect(getter).not.toHaveBeenCalled(); expect(order).toEqual([]); expect(mocked.frontier).not.toHaveBeenCalled();
    });

  it('captures nested path data before awaiting setup', async () => {
    const expected = { ...input.frontierBuild };
    vi.mocked(setups.createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2).mockImplementationOnce(async () => {
      setup = await makeSetup(); (input.frontierBuild as any).cargoExecutablePath = 'changed';
      retainedSetup = { ...setup, runNativeGenesisRetainingSigner: mocked.check,
        checkNativeWithdrawalFeeFundingV1: mocked.withdrawalFeeCheck, checkNativeTrackerFeeFundingV1: mocked.trackerFeeCheck,
        checkNativeFrozenTrackerV2CandidateRetainingWithdrawalSigner: mocked.trackerCheck,
        checkNativeWithdrawalV2: mocked.payoutCheck };
      return retainedSetup;
    });
    await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(mocked.frontier.mock.calls[0][0]).toMatchObject(expected); assertDisposed();
  });

  it('does not allocate a journal or issue anything when the native checker fails', async () => {
    mocked.check.mockRejectedValueOnce(new Error('native check rejected'));
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('native check rejected');
    expect(mocked.execute).not.toHaveBeenCalled();
    expect(readdirSync(join(directory, 'target')).filter(name => name.startsWith('issuance-journal-'))).toEqual([]);
    expect(order).toContain('nodes-stop'); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
  });

  it('closes but preserves a fresh journal after an unresolved issuance failure', async () => {
    let marker = '';
    mocked.execute.mockImplementationOnce(async value => {
      journalState = value.state;
      marker = join(value.markerDirectory, 'unresolved-test-marker');
      writeFileSync(marker, 'synthetic unresolved attempt', { flag: 'wx' });
      throw new Error('issuance unresolved');
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('issuance unresolved');
    expect(readFileSync(marker, 'utf8')).toBe('synthetic unresolved attempt');
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce();
    expect(mocked.confirmation).not.toHaveBeenCalled();
    expect(order).toContain('nodes-stop'); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
  });

  it.each(['source', 'setup', 'operator'])('rejects lost %s custody between checking and issuance', async owner => {
    const check = mocked.check.getMockImplementation()!;
    mocked.check.mockImplementationOnce(async (...args) => {
      const result = await check(...args);
      if (owner === 'source') source!.dispose();
      if (owner === 'setup') setup!.dispose();
      if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
      return result;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/disposed|active process provenance/);
    expect(mocked.execute).not.toHaveBeenCalled(); assertDisposed();
  });

  it.each(['source', 'setup', 'operator'])('rejects lost %s custody during issuance and still closes the journal', async owner => {
    const execute = mocked.execute.getMockImplementation()!;
    mocked.execute.mockImplementationOnce(async value => {
      const result = await execute(value);
      if (owner === 'source') source!.dispose();
      if (owner === 'setup') setup!.dispose();
      if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
      return result;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/disposed|active process provenance/);
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce();
    expect(mocked.confirmation).not.toHaveBeenCalled(); assertDisposed();
  });

  it.each(['count', 'ordinal', 'role', 'transaction'])('rejects changed issuance receipt %s', fault => {
    const execute = mocked.execute.getMockImplementation()!;
    mocked.execute.mockImplementationOnce(async value => {
      const result = await execute(value);
      if (fault === 'count') result.pop();
      if (fault === 'ordinal') result[1].ordinal = 0;
      if (fault === 'role') result[1].role = 'tracker';
      if (fault === 'transaction') result[1].expectedTxId = '94'.repeat(32);
      return result;
    });
    return expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/receipt count|receipt identity differs/);
  });

  for (const phase of ['before', 'after'] as const) {
    it.each(['missing', 'pending', 'height', 'header'])(`rejects %s confirmation ${phase} observing outputs`, async fault => {
      const observe = observeConfirmation.getMockImplementation()!;
      let reads = 0;
      observeConfirmation.mockImplementation(async (...args) => {
        const value = await observe(...args);
        if (reads++ !== (phase === 'before' ? 0 : 3)) return value;
        if (fault === 'missing') return null;
        if (fault === 'pending') return { ...value, status: 'pending' };
        if (fault === 'height') return { ...value, confirmationHeight: 101 };
        return { ...value, confirmationHeaderIdHex: '94'.repeat(32) };
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/canonical inclusion changed/);
      expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
    });
  }

  for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
    for (const role of ['tracker', 'duplicatePrevention', 'pooledReserve'] as const) {
      it.each(['source present', 'missing', 'value', 'asset ID', 'asset amount', 'register', 'tree', 'creation height', 'transaction', 'index', 'box ID'])
        (`rejects %s for ${role} on ${origin}`, async fault => {
          const read = readErgoBox;
          readErgoBox = (url, id) => {
            const output: Eip12Box = compiled.issuance.orderedTransactions.find((item: any) => item.role === role).transaction.outputs[0];
            if (url !== origin) return read(url, id);
            if (fault === 'source present' && id === discovery.observation.genesisBoxIds[role]) return { present: true };
            if (id !== output.boxId || fault === 'source present') return read(url, id);
            if (fault === 'missing') return null;
            const changed = structuredClone(output);
            if (fault === 'box ID') return { ...changed, boxId: '96'.repeat(32) };
            if (fault === 'value') changed.value = '9999999';
            if (fault === 'asset ID') changed.assets[0]!.tokenId = '95'.repeat(32);
            if (fault === 'asset amount') changed.assets[0]!.amount = '2';
            if (fault === 'register') changed.additionalRegisters.R4 = '0404';
            if (fault === 'tree') changed.ergoTree = '0008cd02' + '22'.repeat(32);
            if (fault === 'creation height') changed.creationHeight = 101;
            if (fault === 'transaction') changed.transactionId = '94'.repeat(32);
            if (fault === 'index') changed.index = 1;
            return canonicalBox(changed);
          };
          await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(
            /source remains unspent|output is unavailable|output differs|valid EIP-12 box|boxId does not match/);
          expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
        });
    }
  }

  it.each(['null', 'height', 'ID', 'witness disagreement', 'primary moved', 'witness moved', 'future output'])
    ('rejects %s output-observation tip', async fault => {
      let reads = 0;
      if (fault === 'future output') {
        const execute = mocked.execute.getMockImplementation()!;
        mocked.execute.mockImplementationOnce(async value => {
          const result = await execute(value);
          for (const receipt of result) receipt.confirmationHeight = 80;
          return result;
        });
        observeConfirmation.mockResolvedValue({ status: 'confirmed', confirmationHeight: 80,
          confirmationHeaderIdHex: '92'.repeat(32) });
      }
      readErgoTip = origin => {
        reads++;
        if (fault === 'null') return null;
        if (fault === 'height') return { height: '120', id: '93'.repeat(32) };
        if (fault === 'ID') return { height: 120, id: '93' };
        if (fault === 'future output') return { height: 99, id: '93'.repeat(32) };
        const changed = (fault === 'witness disagreement' && origin === target.witnessNodeOrigin)
          || (fault === 'primary moved' && reads === 3) || (fault === 'witness moved' && reads === 4);
        return { height: 120, id: (changed ? '94' : '93').repeat(32) };
      };
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/object required|output-observation|output differs/);
      expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
    });

  it('reobserves FED genesis before returning a completed issuance', async () => {
    const execute = mocked.execute.getMockImplementation()!;
    mocked.execute.mockImplementationOnce(async value => {
      const result = await execute(value);
      const read = readResult;
      readResult = (url, method, params) => method === 'author_pendingExtrinsics' ? ['0x01'] : read(url, method, params);
      return result;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/pool is not empty/);
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
  });

  it.each(['initial pairing', 'output window', 'witness catchup'])('reobserves after ordinary mining advances during %s without issuing twice', async stage => {
    let tipReads = 0; let boxReads = 0;
    readErgoTip = () => {
      tipReads++;
      const advanced = stage === 'witness catchup' ? tipReads !== 2 : tipReads > (stage === 'initial pairing' ? 1 : 2);
      return { height: advanced ? 121 : 120, id: (advanced ? '94' : '93').repeat(32) };
    };
    const read = readErgoBox;
    readErgoBox = (origin, id) => { boxReads++; return read(origin, id); };
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(result.singletonIssuanceEstablished).toBe(true);
    expect(mocked.check).toHaveBeenCalledOnce(); expect(mocked.execute).toHaveBeenCalledOnce();
    expect(observeConfirmation).toHaveBeenCalledTimes(stage === 'output window' ? 12 : 9);
    expect(boxReads).toBe(stage === 'output window' ? 24 : 12);
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
  });

  it('stops after three unstable observation windows without repeating issuance', async () => {
    let reads = 0;
    readErgoTip = () => {
      const height = 120 + Math.floor(reads++ / 2);
      return { height, id: height.toString(16).padStart(64, '0') };
    };
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/did not stabilize/);
    expect(reads).toBe(12); expect(observeConfirmation).toHaveBeenCalledTimes(18);
    expect(mocked.check).toHaveBeenCalledOnce(); expect(mocked.execute).toHaveBeenCalledOnce();
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
  });

  it('keeps full confirmation work outside the exact output snapshot', async () => {
    let height = 120;
    let tipReads = 0;
    let inSnapshot = false;
    const observe = observeConfirmation.getMockImplementation()!;
    observeConfirmation.mockImplementation(async (...args) => {
      expect(inSnapshot).toBe(false);
      height++;
      return observe(...args);
    });
    readErgoTip = () => {
      tipReads++;
      inSnapshot = tipReads < 4;
      return { height, id: height.toString(16).padStart(64, '0') };
    };
    const assertBatch = mocked.batch.getMockImplementation()!;
    mocked.batch.mockImplementation((...args) => {
      expect(inSnapshot).toBe(false);
      return assertBatch(...args);
    });
    const inclusion = vi.fn((origin: string, at: number) => {
      expect(inSnapshot).toBe(true);
      expect([target.primaryNodeOrigin, target.witnessNodeOrigin]).toContain(origin);
      expect(at).toBe(100);
      return ['92'.repeat(32)];
    });
    readErgoInclusion = inclusion;
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(result.operationalMintEstablished).toBe(true);
    expect(inclusion).toHaveBeenCalledTimes(6);
    expect(tipReads).toBe(8);
    expect(observeConfirmation).toHaveBeenCalledTimes(6);
    expect(mocked.execute).toHaveBeenCalledOnce(); assertDisposed();
  });

  for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
    for (const role of ['tracker', 'duplicatePrevention', 'pooledReserve'] as const) {
      it.each(['missing', 'replacement', 'ambiguous'])(
        `rejects %s snapshot inclusion for ${role} on ${origin}`, async fault => {
          const execute = mocked.execute.getMockImplementation()!;
          mocked.execute.mockImplementationOnce(async value => {
            const result = await execute(value);
            for (const receipt of result) receipt.confirmationHeight = 100 + receipt.ordinal;
            return result;
          });
          observeConfirmation.mockImplementation(async id => {
            const receipt = receipts.find(value => value.expectedTxId === id)!;
            return { status: 'confirmed', confirmationHeight: receipt.confirmationHeight,
              confirmationHeaderIdHex: receipt.confirmationHeaderIdHex };
          });
          readErgoInclusion = (url, height) => {
            const receipt = receipts.find(value => value.role === role)!;
            if (url !== origin || height !== receipt.confirmationHeight) return ['92'.repeat(32)];
            if (fault === 'missing') return [];
            if (fault === 'replacement') return ['94'.repeat(32)];
            if (fault === 'ambiguous') return ['92'.repeat(32), '94'.repeat(32)];
            return ['92'.repeat(32)];
          };
          await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/snapshot inclusion|snapshot confirmation depth/);
          expect(mocked.packet).not.toHaveBeenCalled();
          expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
        },
      );
    }
  }

  it.each(['tracker', 'duplicatePrevention', 'pooledReserve'] as const)('rejects insufficient snapshot depth for %s alone', async role => {
    const execute = mocked.execute.getMockImplementation()!;
    mocked.execute.mockImplementationOnce(async value => {
      const result = await execute(value);
      for (const receipt of result) receipt.confirmationHeight = receipt.role === role ? 111 : 100;
      return result;
    });
    observeConfirmation.mockImplementation(async id => {
      const receipt = receipts.find(value => value.expectedTxId === id)!;
      return { status: 'confirmed', confirmationHeight: receipt.confirmationHeight,
        confirmationHeaderIdHex: receipt.confirmationHeaderIdHex };
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/snapshot confirmation depth/);
    expect(mocked.packet).not.toHaveBeenCalled();
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
  });

  it('binds distinct inclusion headers at the exact minimum snapshot depth', async () => {
    const execute = mocked.execute.getMockImplementation()!;
    mocked.execute.mockImplementationOnce(async value => {
      const result = await execute(value);
      for (const receipt of result) {
        receipt.confirmationHeight = 108 + receipt.ordinal;
        receipt.confirmationHeaderIdHex = (160 + receipt.ordinal).toString(16).repeat(32);
      }
      return result;
    });
    observeConfirmation.mockImplementation(async id => {
      const receipt = receipts.find(value => value.expectedTxId === id)!;
      return { status: 'confirmed', confirmationHeight: receipt.confirmationHeight,
        confirmationHeaderIdHex: receipt.confirmationHeaderIdHex };
    });
    const inclusion = vi.fn((_origin: string, height: number) => [
      receipts.find(receipt => receipt.confirmationHeight === height)!.confirmationHeaderIdHex,
    ]);
    readErgoInclusion = inclusion;
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(result.operationalMintEstablished).toBe(true);
    for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
      for (const height of [108, 109, 110]) expect(inclusion).toHaveBeenCalledWith(origin, height);
    }
    expect(inclusion).toHaveBeenCalledTimes(6); assertDisposed();
  });

  it('drains a pending tip read before closing after its peer fails', async () => {
    let enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    readErgoTip = async origin => {
      if (origin === target.primaryNodeOrigin) return null;
      enter();
      await pending;
      expect(active).toBe(true);
      return { height: 120, id: '93'.repeat(32) };
    };
    const running = runSubstrateFederatedGenesisTargetRootV1(input);
    let settled = false;
    void running.then(() => { settled = true; }, () => { settled = true; });
    const rejection = expect(running).rejects.toThrow('object required');
    await entered;
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(active).toBe(true); expect(frontierActive).toBe(true);
      expect(StateTracker.prototype.close).not.toHaveBeenCalled();
    } finally { release(); }
    await rejection;
    expect(mocked.packet).not.toHaveBeenCalled();
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
  });

  for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
    it.each(['regression', 'same-height replacement', 'higher replacement branch', 'missing anchor', 'ambiguous anchor'])(
      `rejects %s after closing confirmation on ${origin} with issuance blocks preserved`, async fault => {
        let closed = false;
        let confirmations = 0;
        const observe = observeConfirmation.getMockImplementation()!;
        observeConfirmation.mockImplementation(async (...args) => {
          const value = await observe(...args);
          if (++confirmations === 6) closed = true;
          return value;
        });
        const read = readErgoTip;
        readErgoTip = url => {
          if (!closed) return read(url);
          if (fault === 'higher replacement branch') return { height: 121, id: '94'.repeat(32) };
          if (url === origin && fault === 'regression') return { height: 119, id: '94'.repeat(32) };
          if (url === origin && fault === 'same-height replacement') return { height: 120, id: '94'.repeat(32) };
          return read(url);
        };
        const anchor = readErgoAnchor;
        readErgoAnchor = (url, height) => {
          if (url !== origin) return anchor(url, height);
          expect(height).toBe(120);
          if (fault === 'missing anchor') return [];
          if (fault === 'ambiguous anchor') return ['93'.repeat(32), '94'.repeat(32)];
          return ['95'.repeat(32)];
        };
        await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/tip changed|captured output anchor changed/);
        expect(confirmations).toBe(6);
        expect(mocked.packet).not.toHaveBeenCalled();
        expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
      },
    );
  }

  it('reobserves all outputs when mining advances during the final anchor check', async () => {
    let reads = 0;
    let boxes = 0;
    readErgoTip = () => {
      const advanced = ++reads > 6;
      return { height: advanced ? 121 : 120, id: (advanced ? '94' : '93').repeat(32) };
    };
    const read = readErgoBox;
    readErgoBox = (origin, id) => { boxes++; return read(origin, id); };
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(result.operationalMintEstablished).toBe(true);
    expect(boxes).toBe(24);
    expect(observeConfirmation).toHaveBeenCalledTimes(12);
    expect(mocked.execute).toHaveBeenCalledOnce(); assertDisposed();
  });

  it('drains a pending read before closing the target after another read fails', async () => {
    let enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const read = readErgoBox;
    readErgoBox = async (origin, id) => {
      if (id === discovery.observation.genesisBoxIds.tracker) {
        if (origin === target.primaryNodeOrigin) throw new Error('snapshot read failed');
        enter();
        await pending;
        expect(active).toBe(true);
      }
      return read(origin, id);
    };
    const running = runSubstrateFederatedGenesisTargetRootV1(input);
    let settled = false;
    void running.then(() => { settled = true; }, () => { settled = true; });
    const rejection = expect(running).rejects.toThrow('snapshot read failed');
    await entered;
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(active).toBe(true); expect(frontierActive).toBe(true);
      expect(StateTracker.prototype.close).not.toHaveBeenCalled();
    } finally { release(); }
    await rejection;
    expect(mocked.packet).not.toHaveBeenCalled();
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
  });

  it.each(['batch', 'Ergo target', 'Frontier target'])('rejects %s invalidation during provisional output reads', async fault => {
    const read = readErgoBox;
    let changed = false;
    readErgoBox = (origin, id) => {
      const result = read(origin, id);
      if (!changed) {
        changed = true;
        if (fault === 'batch') batchActive = false;
        if (fault === 'Ergo target') active = false;
        if (fault === 'Frontier target') frontierActive = false;
      }
      return result;
    };
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow();
    expect(mocked.packet).not.toHaveBeenCalled();
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
  });

  for (const node of ['primary', 'witness'] as const) {
    it.each(['regression', 'replacement'])(`rejects cross-window %s on ${node}`, async fault => {
      let reads = 0;
      readErgoTip = () => {
        reads++;
        if (reads <= 2) return { height: 120, id: '93'.repeat(32) };
        if (reads === (node === 'primary' ? 5 : 6)) {
          return fault === 'regression' ? { height: 120, id: '93'.repeat(32) }
            : { height: 121, id: '95'.repeat(32) };
        }
        return { height: 121, id: '94'.repeat(32) };
      };
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/output-observation tip changed/);
      expect(reads).toBe(6);
      expect(mocked.check).toHaveBeenCalledOnce(); expect(mocked.execute).toHaveBeenCalledOnce();
      expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
    });
  }

  it('does not reuse successful box reads from the window invalidated by mining', async () => {
    let reads = 0; let outputReads = 0;
    readErgoTip = () => {
      const advanced = ++reads > 2;
      return { height: advanced ? 121 : 120, id: (advanced ? '94' : '93').repeat(32) };
    };
    const read = readErgoBox;
    readErgoBox = (origin, id) => {
      const value = read(origin, id);
      if (value !== null && ++outputReads > 6) return null;
      return value;
    };
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/output is unavailable/);
    expect(mocked.check).toHaveBeenCalledOnce(); expect(mocked.execute).toHaveBeenCalledOnce();
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce(); assertDisposed();
  });

  it('disposes custody and nodes even if journal close fails', async () => {
    const close = StateTracker.prototype.close;
    vi.mocked(close).mockImplementationOnce(() => {
      throw new Error('journal close failed');
    });
    try {
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('journal close failed');
      expect(order).toContain('nodes-stop'); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    } finally {
      journalState?.close();
    }
  });

  it.each(['frontier', 'ergoBuild', 'process', 'discover', 'history', 'compile', 'materialize', 'nodes'] as const)
    ('cleans custody and stops only an acquired Ergo process after %s failure', async stage => {
      mocked[stage].mockImplementationOnce(() => { throw new Error(`failure at ${stage}`); });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(`failure at ${stage}`);
      expect(stop).toHaveBeenCalledTimes(['frontier', 'ergoBuild', 'process'].includes(stage) ? 0 : 1);
      if (stage !== 'nodes') expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
    });

  it('disposes every key owner even when process cleanup fails', async () => {
    stop.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('cleanup failed'); assertDisposed();
  });

  it.each(['source', 'operator', 'mining'])('cleans previously acquired owners after %s startup failure', async stage => {
    if (stage === 'source') vi.mocked(sources.createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2)
      .mockImplementationOnce(() => { throw new Error('source startup failed'); });
    if (stage === 'operator') vi.mocked(operators.createFederatedGenesisOperatorV1)
      .mockImplementationOnce(() => { throw new Error('operator startup failed'); });
    if (stage === 'mining') {
      const createProcess = mocked.process.getMockImplementation()!;
      mocked.process.mockImplementationOnce((...args) => ({ ...createProcess(...args),
        startMining: async () => { throw new Error('mining startup failed'); } }));
    }
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(`${stage} startup failed`);
    expect(stop).toHaveBeenCalledTimes(stage === 'mining' ? 1 : 0);
    expect(mocked.discover).not.toHaveBeenCalled(); expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
  });

  it('rejects an expired Ergo target before starting FED nodes', async () => {
    mocked.materialize.mockImplementationOnce(async () => { active = false; return { stdout: JSON.stringify(rawSpec()) }; });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('target inactive');
    expect(mocked.nodes).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
  });

  it.each(['empty', 'accessor', 'symbol', 'sudo', 'invalid key', 'invalid value'])
    ('rejects %s expected storage before any RPC request', async fault => {
      const expected: any = fault === 'empty' ? {} : { ...top };
      const getter = vi.fn(() => '0x5678');
      if (fault === 'accessor') Object.defineProperty(expected, '0x1234', { enumerable: true, get: getter });
      if (fault === 'symbol') expected[Symbol('extra')] = '0x00';
      if (fault === 'sudo') expected[KEYS.sudo] = '0x00';
      if (fault === 'invalid key') expected.invalid = '0x00';
      if (fault === 'invalid value') expected['0x1234'] = '0X00';
      await expect(observeFederatedGenesisTargetsV1(expected)).rejects.toThrow(/bounded exact data fields/);
      expect(fetch).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled(); expect(order).toEqual([]);
    });

  it.each(['source', 'setup', 'operator'])('rechecks %s custody after an awaited build', async owner => {
    const build = mocked.frontier.getMockImplementation()!;
    mocked.frontier.mockImplementationOnce(async value => {
      const built = await build(value);
      if (owner === 'source') source!.dispose();
      if (owner === 'setup') setup!.dispose();
      if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
      return built;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/disposed|active process provenance/);
    expect(mocked.ergoBuild).not.toHaveBeenCalled(); expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
  });

  it.each(['scale', 'id'])('rejects compiled federation %s drift before materialization', async field => {
    const compile = mocked.compile.getMockImplementation()!;
    mocked.compile.mockImplementationOnce(async value => {
      const result = await compile(value);
      if (field === 'scale') result.preparation.mintProofProfileScaleHex = '0xab';
      else result.preparation.mintProofProfile = { ...result.preparation.mintProofProfile, proofProfileIdHex: '0x' + 'ab'.repeat(32) };
      return result;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/federation differs/);
    expect(mocked.materialize).not.toHaveBeenCalled(); expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
  });

  it.each(['runtime', 'profile', 'enforced', 'bridge', 'sudo', 'children', 'peers', 'id', 'duplicate keys'])
    ('rejects raw %s mismatch before starting FED nodes', async fault => {
      mocked.materialize.mockImplementationOnce(async () => {
        const spec: any = rawSpec();
        if (fault === 'runtime') top[KEYS.code] = '0x0061736d01000001';
        if (fault === 'profile') top[KEYS.profile] = '0x0103';
        if (fault === 'enforced') top[KEYS.enforced] = '0x00';
        if (fault === 'bridge') top[KEYS.bridge] = '0x' + '34'.repeat(20);
        if (fault === 'sudo') top[KEYS.sudo] = '0x01';
        if (fault === 'children') spec.genesis.raw.childrenDefault = { child: {} };
        if (fault === 'peers') spec.bootNodes = ['peer'];
        if (fault === 'id') spec.id = 'legacy_lab';
        const text = JSON.stringify(spec);
        return { stdout: fault === 'duplicate keys' ? text.replace('"bootNodes":[]', '"bootNodes":[],"bootNodes":[]') : text };
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/raw storage differs|child storage|target or peers|duplicate JSON/);
      expect(mocked.nodes).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });

  it('rejects modified materialization input before starting FED nodes', async () => {
    mocked.materialize.mockImplementationOnce(async () => {
      writeFileSync(join(directory, 'target', 'fed-genesis.json'), '{}'); return { stdout: JSON.stringify(rawSpec()) };
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/typed genesis bytes changed/);
    expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
  });

  it.each(['account', 'balance', 'nonce', 'provider', 'reserved', 'frozen', 'flags', 'length'])
    ('rejects materialized operator %s drift before starting FED nodes', async fault => {
      mocked.materialize.mockImplementationOnce(async () => {
        const key = operator!.nativeFunding.storageKeyHex;
        if (fault === 'account') { top[key + '00'] = top[key]!; delete top[key]; }
        else {
          const account = Buffer.from(top[key]!.slice(2), 'hex');
          if (fault === 'length') top[key] += '00';
          else {
            const offsets = { balance: 16, nonce: 0, provider: 8, reserved: 32, frozen: 48, flags: 79 };
            account[offsets[fault as keyof typeof offsets]] ^= 1;
            top[key] = `0x${account.toString('hex')}`;
          }
        }
        return { stdout: JSON.stringify(rawSpec()) };
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/operator funding differs/);
      expect(mocked.nodes).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });

  it.each(['endpoint', 'genesis', 'height', 'storage', 'sudo', 'pool', 'changed genesis', 'advanced height'])
    ('rejects %s in the owned running-target observation', async fault => {
      const base = readResult;
      let genesisReads = 0; let headerReads = 0;
      readResult = (url, method, params) => {
        if (url === WITNESS) {
          if (method === 'chain_getBlockHash') {
            genesisReads++;
            if (fault === 'genesis' || (fault === 'changed genesis' && genesisReads === 2)) return '0x' + '72'.repeat(32);
          }
          if (method === 'chain_getHeader') {
            headerReads++;
            if (fault === 'height' || (fault === 'advanced height' && headerReads === 3)) return { number: '0x1' };
          }
          if (fault === 'storage' && method === 'state_getStorage' && params[0] === '0x1234') return '0x5679';
          if (fault === 'sudo' && method === 'state_getStorage' && params[0] === KEYS.sudo) return '0x01';
          if (fault === 'pool' && method === 'author_pendingExtrinsics') return ['0x01'];
        }
        if (fault === 'genesis' && method === 'state_getStorage') return top[params[0] as string] ?? null;
        return base(url, method, params);
      };
      if (fault === 'endpoint') frontierEndpoints = Object.freeze({
        primaryRpcUrl: 'http://127.0.0.1:19957', witnessRpcUrl: WITNESS,
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/endpoints changed|disagree on genesis|no longer at genesis|storage differs|pool is not empty|genesis changed/);
      expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });

  it.each(['HTTP', 'ID', 'extra field', 'duplicate field', 'malformed UTF8', 'oversized body'])
    ('rejects %s RPC responses and releases custody', async fault => {
      const cancel = vi.fn();
      vi.mocked(fetch).mockImplementationOnce(async () => {
        if (fault === 'HTTP') return new Response('unavailable', { status: 503 });
        if (fault === 'ID') return new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: genesis }));
        if (fault === 'extra field') return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: genesis, extra: true }));
        if (fault === 'duplicate field') return new Response(`{"jsonrpc":"2.0","id":1,"id":1,"result":"${genesis}"}`);
        if (fault === 'malformed UTF8') return new Response(new Uint8Array([0xff]));
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(34 * 1024 * 1024 + 1)); }, cancel }));
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/RPC failed|envelope mismatch|exact data fields|duplicate JSON|encoded data|byte limit/);
      if (fault === 'oversized body') expect(cancel).toHaveBeenCalledOnce();
      expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });
});
