import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseErgoFullBlockObservationV1, assertErgoFullBlockHeaderProofV1 }
  from '../../ergo-settlement-core/ergo-full-block-observation-v1.js';

// Builds, compilers, observations and processes are stubs. Session/key custody,
// root control flow, journal ownership, box codecs and bounded FED RPC decoding stay real.
// Downstream deposit, burn, checkpoint, tracker and payout are component doubles, not crypto evidence.
const mocked = vi.hoisted(() => ({
  frontier: vi.fn(), ergoBuild: vi.fn(), process: vi.fn(), owned: vi.fn(), readOnlyOwned: vi.fn(),
  pause: vi.fn(), pauseRevalidate: vi.fn(), hold: vi.fn(),
  discover: vi.fn(), history: vi.fn(), compile: vi.fn(), materialize: vi.fn(),
  pin: vi.fn(), nodes: vi.fn(), environment: vi.fn(),
  check: vi.fn(), batch: vi.fn(), execute: vi.fn(), source: vi.fn(), confirmation: vi.fn(),
  frontierOwned: vi.fn(), fundingOwned: vi.fn(), packet: vi.fn(), continuationPacket: vi.fn(),
  sourceLock: vi.fn(), committedVault: vi.fn(), continuationSourceLock: vi.fn(), continuationVault: vi.fn(),
  draft: vi.fn(), evidence: vi.fn(), proof: vi.fn(), mint: vi.fn(), continuationReservation: vi.fn(), continuationMintBurn: vi.fn(),
  nativeRead: vi.fn(), withdrawalFeeCheck: vi.fn(), trackerFeeCheck: vi.fn(), continuationWithdrawalFeeCheck: vi.fn(),
  continuationTrackerFeeCheck: vi.fn(), withdrawalFee: vi.fn(), trackerFee: vi.fn(), miningAuthority: vi.fn(),
  checkpoint: vi.fn(), checkpointAssert: vi.fn(), anchor: vi.fn(), anchorAssert: vi.fn(), frozenObservation: vi.fn(), observationAssert: vi.fn(),
  headers: vi.fn(), context: vi.fn(), continuationContext: vi.fn(), trackerTx: vi.fn(), trackerCheck: vi.fn(),
  continuationTrackerCheck: vi.fn(), trackerAuthorize: vi.fn(), trackerReserve: vi.fn(),
  trackerFreshness: vi.fn(), trackerSubmit: vi.fn(), trackerFinalize: vi.fn(), trackerConfirm: vi.fn(),
  projectConfirmation: vi.fn(), projectSubmission: vi.fn(), projectProgress: vi.fn(),
  projectStartupPhase: vi.fn(),
  payoutCheck: vi.fn(), continuationPayoutCheck: vi.fn(), payoutAuthorize: vi.fn(), payoutReserve: vi.fn(),
  payoutSubmit: vi.fn(), payoutFinalize: vi.fn(), payoutConfirm: vi.fn(), wait: vi.fn(),
  recovery: vi.fn(),
}));
vi.mock('../../substrate-federated-genesis-node-build-v1.js', () => ({ buildSubstrateFederatedGenesisNodeV1: mocked.frontier }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({ buildSubstrateFederatedIsolatedDevnetErgoNodeV1: mocked.ergoBuild }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js')>(),
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2: mocked.process,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: mocked.owned,
  assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1: mocked.readOnlyOwned,
  pauseSubstrateFederatedIsolatedDevnetOwnedMiningSubmissionV1: mocked.pause,
  holdSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1: mocked.hold,
  revalidateSubstrateFederatedIsolatedDevnetMiningPauseObservationV1: mocked.pauseRevalidate,
  projectSubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseFailureV1: mocked.projectStartupPhase,
}));
vi.mock('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js')>(),
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1: mocked.discover,
  assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1: mocked.fundingOwned,
  discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1: mocked.discover,
  assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1: (...args: unknown[]) => {
    const observation = mocked.fundingOwned(...args);
    return { ...observation, requirements: args[2], fundingInput: observation.genesisInputs.tracker };
  },
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
  createOwnedFederatedGenesisDevnetProcessSessionV1: mocked.nodes,
  assertOwnedFederatedGenesisDevnetTargetV1: mocked.frontierOwned,
}));
vi.mock('./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', () => ({
  executeSubstrateFederatedNativeGenesisBatchV1: mocked.execute,
  executeSubstrateFederatedNativeGenesisPegInSourceLockV1: mocked.sourceLock,
  executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1: mocked.committedVault,
  executeSubstrateFederatedNativeContinuationPegInSourceLockV1: mocked.continuationSourceLock,
  executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1: mocked.continuationVault,
  executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: mocked.withdrawalFee,
  executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: mocked.trackerFee,
  waitForCanonicalConfirmation: mocked.wait,
  projectTrackerCanonicalConfirmationFailureDiagnosticV1: mocked.projectConfirmation,
}));
vi.mock('../../substrate-federated-two-cycle-recovery-capture-v1.js', () => ({
  captureSubstrateFederatedTwoCycleRecoveryV1: mocked.recovery,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js', () => ({
  buildSubstrateFederatedNativeGenesisPegInPacketV1: mocked.packet,
  buildSubstrateFederatedNativeContinuationPegInPacketV1: mocked.continuationPacket,
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
  executeFrontierNativeProofBoundContinuationReservationV1: mocked.continuationReservation,
  executeFrontierNativeProofBoundContinuationMintAndBurnV1: mocked.continuationMintBurn,
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
vi.mock('../../substrate-federated-tracker-v2.js', () => ({
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context: mocked.context,
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContinuationContext: mocked.continuationContext,
}));
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
import { projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from '../../substrate-federated-native-two-cycle-root-phase-v1.js';
import {
  projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2,
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2,
} from '../../substrate-federated-native-two-cycle-root-phase-v2.js';
import { projectNativeTwoCycleCycleStepFailureV1 }
  from '../../substrate-federated-native-two-cycle-cycle-step-v1.js';
import { tagNativeTwoCycleCycleStepFailureV1 }
  from '../../substrate-federated-native-two-cycle-cycle-step-v1.js';
import { NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1,
  projectNativeDepositFundingSubstageV1,
  type NativeDepositFundingSubstageV1 }
  from '../../substrate-federated-native-deposit-funding-substage-v1.js';
import { tagSubstrateFederatedTrackerV2BuildFailurePhaseV1,
  projectSubstrateFederatedTrackerV2BuildFailurePhaseV1,
  tagSubstrateFederatedTrackerV2StatementFailureCheckV1,
  projectSubstrateFederatedTrackerV2StatementFailureCheckV1 }
  from '../../substrate-federated-tracker-context-failure-v1.js';
import { tagSubstrateFederatedNativeSourceLockFailureStageV1,
  projectSubstrateFederatedNativeSourceLockFailureStageV1 }
  from '../../substrate-federated-native-source-lock-failure-v1.js';
import { projectNativeTwoCycleErgoNodePostCallbackStageV1,
  tagIsolatedErgoNodePostCallbackStageV1, tagIsolatedErgoNodeCompletionFailureReasonV1 }
  from '../../substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
import { projectNativeTwoCycleCallbackTimingFailureV1 }
  from '../../substrate-federated-native-two-cycle-callback-timing-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1,
} from '../../relayer-core/substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';

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
const makeSourceOperation = sources.createSubstrateFederatedNativeGenesisSourceAttestationOperationV1;
const makeOperator = operators.createFederatedGenesisOperatorV1;
const claimMining = setups.claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2;
let setup: Awaited<ReturnType<typeof makeSetup>> | undefined;
let source: ReturnType<typeof makeSource> | undefined;
let sourceOperation: ReturnType<typeof makeSourceOperation> | undefined;
let continuationSourceOperation: ReturnType<typeof makeSourceOperation> | undefined;
let operator: ReturnType<typeof makeOperator> | undefined;
let miningCredential: ReturnType<typeof claimMining> | undefined;
let compiledGenesisBytes: Buffer | undefined;
let directory: string;
let builtTargetDirectory: string;
let input: RunSubstrateFederatedGenesisTargetRootV1Input;
let top: Record<string, string>;
let order: string[];
let active: boolean;
let started: boolean;
let calls: { url: string; method: string; params: unknown[] }[];
let readResult: (url: string, method: string, params: unknown[]) => unknown;
let stop: ReturnType<typeof vi.fn<() => Promise<void>>>;
let compiled: any;
let batch: any;
let receipts: any[];
let journalState: StateTracker | undefined;
let observeConfirmation: ReturnType<typeof vi.fn<(id: string, origin: string) => Promise<Partial<{
  status: string;
  confirmationHeight: number;
  confirmationHeaderIdHex: string;
}> | null>>>;
let readErgoBox: (origin: string, id: string) => unknown;
let readErgoTip: (origin: string) => unknown;
let readErgoInclusion: (origin: string, height: number) => unknown;
let readErgoAnchor: (origin: string, height: number) => unknown;
let heldDepositTip: Readonly<{ height: number; id: string }> | null;
let readHeldDepositTip: (origin: string, held: Readonly<{ height: number; id: string }>) => unknown;
let retainedSetup: any;
let frontierEndpoints: Readonly<{ primaryRpcUrl: string; witnessRpcUrl: string }>;
let frontierActive: boolean;
let closeNative: ReturnType<typeof vi.fn<() => Promise<{ component: string }>>>;
let nativeAction: ReturnType<typeof vi.fn>;
let batchActive: boolean;
let journalDirectory: string;
let attemptFiles: string[];
let funding: any;
let continuationFunding: any;
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
let continuationPacket: any;
let continuationSourceLock: any;
let continuationVault: any;
let continuationDraftInputs: any;
let continuationDraft: any;
let continuationEvidence: any;
let continuationProof: any;
let continuationReservation: any;
let continuationExecution: any;
let continuationCheckpoint: any;
let continuationMiningAuthority: any;
let phase: string;
let returnValues: Record<string, any>;
const downstreamStages = ['funding', 'packet', 'sourceLock', 'committedVault', 'draft', 'evidence', 'proof', 'mint'] as const;
type DownstreamStage = typeof downstreamStages[number];
const target = Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052' });
const phaseTargets = Object.freeze(Object.fromEntries(['anchor', 'frozen', 'freshness', 'transport', 'confirmation',
  'readOnly', 'secondAnchor', 'secondFrozen', 'secondFreshness', 'secondTransport', 'secondConfirmation'].map(name =>
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
  if (sourceOperation && source) expect(() =>
    sources.assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1(sourceOperation!, source!)).toThrow(/disposed/);
  if (continuationSourceOperation && source) expect(() =>
    sources.assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1(
      continuationSourceOperation!, source!,
    )).toThrow(/disposed/);
  if (source) expect(() => sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!)).toThrow(/disposed/);
  if (setup) expect(() => assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer)).toThrow(/active process provenance/);
}
function stageMock(stage: DownstreamStage) { return stage === 'funding' ? mocked.discover : mocked[stage]; }
function injectDepositFundingSubstageFailure(
  second: boolean,
  substage: NativeDepositFundingSubstageV1,
  trigger: Error,
) {
  const executionTarget = second ? phaseTargets.confirmation : target;
  const originalHold = mocked.hold.getMockImplementation()!;
  let held = false;
  mocked.hold.mockImplementation(async (...args) => {
    if (args[0] !== executionTarget) return originalHold(...args);
    if (substage === 'owned-transaction-hold') throw trigger;
    const snapshot = await originalHold(...args);
    held = true;
    return snapshot;
  });

  const guard = second ? mocked.nativeRead : mocked.frontierOwned;
  const originalGuard = guard.getMockImplementation()!;
  let guardCallsAfterHold = 0;
  let closedRevalidationScopes = 0;
  let fundingDiscovered = false;
  let guardInjected = false;
  const originalSource = mocked.source.getMockImplementation()!;
  mocked.source.mockImplementation((...args) => {
    const client = originalSource(...args);
    const end = client.endAuthenticatedTrackerReconstruction;
    return { ...client, endAuthenticatedTrackerReconstruction: () => {
      end(); if (held) closedRevalidationScopes++;
    } };
  });
  guard.mockImplementation((...args) => {
    const isFundingGuard = held && (second ? args[1] === target : args[0] === frontierEndpoints);
    if (isFundingGuard) {
      guardCallsAfterHold++;
      if ((substage === 'post-hold-owner-custody-guard' && guardCallsAfterHold === 1)
        || (substage === 'post-revalidation-owner-custody-guard' && closedRevalidationScopes === 2 && !fundingDiscovered)
        || (substage === 'post-discovery-owner-custody-guard' && fundingDiscovered)) {
        guardInjected = true;
        throw trigger;
      }
    }
    return originalGuard(...args);
  });

  const originalHeldTip = readHeldDepositTip;
  readHeldDepositTip = (origin, snapshot) => {
    if (held && substage === 'prior-confirmation-revalidation'
      && origin === target.primaryNodeOrigin) throw trigger;
    return originalHeldTip(origin, snapshot);
  };

  const originalDiscovery = mocked.discover.getMockImplementation()!;
  mocked.discover.mockImplementation(async (...args) => {
    if (held && args[1] === executionTarget && substage === 'owned-reward-input-discovery') throw trigger;
    const observation = await originalDiscovery(...args);
    if (held && args[1] === executionTarget) fundingDiscovered = true;
    return observation;
  });

  const originalProvenance = mocked.fundingOwned.getMockImplementation()!;
  mocked.fundingOwned.mockImplementation((...args) => {
    if (held && args[1] === executionTarget && substage === 'owned-reward-input-provenance') throw trigger;
    const observation = originalProvenance(...args);
    if (!held || args[1] !== executionTarget || substage !== 'held-funding-equality') return observation;
    const fundingTarget = { ...observation.target };
    Object.defineProperty(fundingTarget, 'genesisHeaderIdHex', {
      enumerable: true,
      get: () => { throw trigger; },
    });
    return { ...observation, target: fundingTarget };
  });

  return () => {
    if (substage === 'post-hold-owner-custody-guard'
      || substage === 'post-revalidation-owner-custody-guard'
      || substage === 'post-discovery-owner-custody-guard') expect(guardInjected).toBe(true);
  };
}
function assertDownstreamPrefix(stage: DownstreamStage) {
  const last = downstreamStages.indexOf(stage);
  const continuationCalls: Partial<Record<DownstreamStage, string>> = {
    draft: 'continuationDraft', evidence: 'continuationEvidence', proof: 'continuationProof',
  };
  for (const [index, name] of downstreamStages.entries()) {
    expect(stageMock(name)).toHaveBeenCalledTimes(name === 'funding'
      ? (order.includes('continuationFunding') ? 3 : 2)
      : (index <= last ? 1 : 0) + Number(order.includes(continuationCalls[name] ?? '')));
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
  expect(readdirSync(builtTargetDirectory).filter(name => name.startsWith('issuance-journal-'))).toHaveLength(1);
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

function prepareRootFixture() {
  vi.clearAllMocks();
  mocked.continuationReservation.mockReset();
  mocked.projectConfirmation.mockReturnValue(null); mocked.projectSubmission.mockReturnValue(null);
  mocked.projectProgress.mockReturnValue(null);
  mocked.projectStartupPhase.mockReturnValue(null);
  vi.spyOn(StateTracker.prototype, 'close');
  setup = undefined; source = undefined; operator = undefined;
  sourceOperation = undefined; continuationSourceOperation = undefined;
  miningCredential = undefined; compiledGenesisBytes = undefined;
  compiled = undefined; batch = undefined; receipts = []; journalState = undefined;
  retainedSetup = undefined; draftInputs = undefined; journalDirectory = ''; attemptFiles = [];
  phase = 'setup'; returnValues = {}; checkpoint = undefined;
  frontierActive = false; batchActive = true;
  frontierEndpoints = Object.freeze({ primaryRpcUrl: PRIMARY, witnessRpcUrl: WITNESS });
  funding = Object.freeze({ observation: Object.freeze({
    target: Object.freeze({ tipHeight: 137, tipHeaderIdHex: '9a'.repeat(32), genesisHeaderIdHex: '91'.repeat(32) }),
    genesisInputs: Object.freeze({ tracker: Object.freeze({ component: 'fresh reward funding double', boxId: 'a1'.repeat(32) }) }),
  }) });
  continuationFunding = Object.freeze({ observation: Object.freeze({
    target: Object.freeze({ tipHeight: 166, tipHeaderIdHex: '9b'.repeat(32), genesisHeaderIdHex: '91'.repeat(32) }),
    genesisInputs: Object.freeze({ tracker: Object.freeze({ component: 'continuation reward funding double', boxId: 'b1'.repeat(32) }) }),
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
  continuationPacket = Object.freeze({ component: 'native continuation peg-in packet double',
    boxes: Object.freeze({ sourceLock: Object.freeze({ boxId: 'b2'.repeat(32) }),
      reserveSuccessor: Object.freeze({ boxId: 'b3'.repeat(32) }) }),
    transactions: Object.freeze({ sourceLockCreation: Object.freeze({ txId: 'b4'.repeat(32) }),
      reserveTransition: Object.freeze({ txId: 'b5'.repeat(32) }) }) });
  continuationSourceLock = Object.freeze({ expectedTxId: 'b4'.repeat(32),
    outputObservation: Object.freeze({ component: 'continuation source-lock observation double', sourceLockBoxIdHex: 'b2'.repeat(32) }) });
  continuationVault = Object.freeze({ expectedTxId: 'b5'.repeat(32),
    outputObservation: Object.freeze({ component: 'continuation committed reserve observation double', confirmationHeight: 170,
      confirmationHeaderIdHex: 'b6'.repeat(32), sourceLockBoxIdHex: 'b2'.repeat(32), reserveSuccessorBoxIdHex: 'b3'.repeat(32) }) });
  continuationDraft = Object.freeze({ component: 'continuation reservation draft double', reservationKeyHex: '0x' + 'b7'.repeat(32) });
  continuationEvidence = Object.freeze({ component: 'continuation reserve evidence double' });
  continuationProof = Object.freeze({ component: 'continuation source proof double', mintIdentityHex: continuationDraft.reservationKeyHex,
    receiptDigestHex: 'b8'.repeat(32), result: Object.freeze({ issuedAtNativeHeight: '4', expiresAtNativeHeight: '32' }) });
  continuationReservation = Object.freeze({ blockHeight: 5, runtimeReservationObserved: true, mintExecuted: false,
    mintIdentityHex: continuationProof.mintIdentityHex });
  continuationExecution = Object.freeze({ mint: Object.freeze({ blockHeight: 6, mintExecuted: true,
    runtimeReservationConsumed: true, amountNanoErg: '20000000', mintIdentityHex: continuationProof.mintIdentityHex }),
    burn: Object.freeze({ blockHeight: 8, netAmountNanoErg: '10000000', grossAmountNanoErg: '15000000' }), burnExecuted: true });
  continuationMiningAuthority = Object.freeze({ schema: 'native continuation authority double', version: 1 });
  vi.spyOn(sources, 'produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1').mockImplementation(mocked.proof);
  const assertSourceOperation = sources.assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1;
  let continuationOperationDisposed = false;
  let modeledContinuationOperation: ReturnType<typeof makeSourceOperation> | undefined;
  vi.spyOn(sources, 'createSubstrateFederatedNativeGenesisSourceAttestationOperationV1').mockImplementation(value => {
    expect(value).toBe(source);
    if (sourceOperation === undefined) return sourceOperation = makeSourceOperation(value);
    if (continuationSourceOperation !== undefined) throw new Error('unexpected third native source operation');
    sources.readSubstrateFederatedGenesisProfilesFromSessionV2(value);
    assertSourceOperation(sourceOperation, value);
    // The checkpoint double cannot complete the real operation's private state.
    // Model only operation 2 here; the composed suite uses both real operations.
    if (checkpoint === undefined) throw new Error('native source-attestation operation is already active');
    modeledContinuationOperation = Object.freeze({ dispose: () => { continuationOperationDisposed = true; } });
    continuationSourceOperation = modeledContinuationOperation;
    return continuationSourceOperation;
  });
  vi.spyOn(sources, 'assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1')
    .mockImplementation((operation, session) => {
      if (modeledContinuationOperation === undefined || operation !== modeledContinuationOperation) {
        return assertSourceOperation(operation, session);
      }
      expect(session).toBe(source);
      sources.readSubstrateFederatedGenesisProfilesFromSessionV2(session);
      if (continuationOperationDisposed) throw new Error('native source-attestation operation is disposed');
  });
  order = []; calls = []; active = false; started = false;
  directory = mkdtempSync(join(tmpdir(), 'fed-root-component-'));
  const bridgeRoot = join(directory, 'bridge');
  mkdirSync(bridgeRoot);
  builtTargetDirectory = join(directory, 'bridge-fed-genesis-Ab3D4e', 'target');
  mkdirSync(dirname(builtTargetDirectory), { recursive: true });
  mkdirSync(builtTargetDirectory);
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
      checkNativeWithdrawalRetainingContinuationSignerV2: mocked.payoutCheck,
      checkNativeContinuationWithdrawalFeeFundingV1: mocked.continuationWithdrawalFeeCheck,
      checkNativeContinuationTrackerFeeFundingV1: mocked.continuationTrackerFeeCheck,
      issueNativeContinuationMiningAuthorityV1: mocked.miningAuthority,
      checkNativeContinuationFrozenTrackerV2CandidateRetainingWithdrawalSigner: mocked.continuationTrackerCheck,
      checkNativeContinuationWithdrawalV2: mocked.continuationPayoutCheck };
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
    return { sourceDirectory: directory, targetDirectory: builtTargetDirectory,
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
    let readOnlyComplete = false;
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
        expect(policy).toEqual({ minimumTipHeight: 11, maximumBlockHeight: 202 });
        expect((policy as { maximumBlockHeight: number }).maximumBlockHeight)
          .toBe(Number(BigInt(checkpoint.attestation.checkpointStatement.admissionExpiresAtErgoHeight) - 2n));
        return invoke('anchor', callback);
      },
      withCheckpointBoundMiningStoppedExecutionTarget: (callback: (value: any) => Promise<unknown>) => invoke('frozen', callback),
      withCheckpointBoundReservationFreshnessRevalidationTarget: (callback: (value: any) => Promise<unknown>) => invoke('freshness', callback),
      withCheckpointBoundTrackerTransportTarget: (completion: unknown, txId: string, callback: (value: any) => Promise<unknown>) => {
        expect(completion).toBe(returnValues.freshness);
        expect(txId).toBe(returnValues.trackerAttempt.expectedTxId);
        return invoke('transport', callback);
      },
      withTrackerTransportConfirmationMiningTarget: (txId: string, callback: (value: any) => Promise<unknown>) => {
        expect(txId).toBe(returnValues.trackerAttempt.expectedTxId); return invoke('confirmation', callback);
      },
      withMiningStoppedReadOnlyTarget: async (callback: (value: any) => Promise<unknown>) => {
        const result = await invoke('readOnly', callback); readOnlyComplete = true;
        return { ...result, receipt: { ...result.receipt,
          finalSnapshot: { fullHeight: 190, headerIdHex: '98'.repeat(32) } } };
      },
      continueNativeTrackerCycleV1: (authority: unknown) => {
        expect(readOnlyComplete).toBe(true); expect(authority).toBe(continuationMiningAuthority);
        order.push('continue-cycle');
        return {
          withCheckpointExtensionMiningTarget: async (_extension: string, policy: unknown,
            callback: (value: any) => Promise<unknown>) => {
            expect(policy).toEqual({ minimumTipHeight: 191, maximumBlockHeight: 252 });
            expect((policy as { maximumBlockHeight: number }).maximumBlockHeight)
              .toBe(Number(BigInt(continuationCheckpoint.attestation.checkpointStatement.admissionExpiresAtErgoHeight) - 2n));
            return invoke('secondAnchor', callback);
          },
          withCheckpointBoundMiningStoppedExecutionTarget: (callback: (value: any) => Promise<unknown>) =>
            invoke('secondFrozen', callback),
          withCheckpointBoundReservationFreshnessRevalidationTarget: (callback: (value: any) => Promise<unknown>) =>
            invoke('secondFreshness', callback),
          withCheckpointBoundTrackerTransportTarget: (completion: unknown, txId: string,
            callback: (value: any) => Promise<unknown>) => {
            expect(completion).toBe(returnValues.secondFreshness);
            expect(txId).toBe(returnValues.secondTrackerAttempt.expectedTxId);
            return invoke('secondTransport', callback);
          },
          withTrackerTransportConfirmationMiningTarget: (txId: string, callback: (value: any) => Promise<unknown>) => {
            expect(txId).toBe(returnValues.secondTrackerAttempt.expectedTxId);
            return invoke('secondConfirmation', callback);
          },
        };
      } };
  });
  mocked.owned.mockImplementation(value => {
    const initial = active && value === target;
    const confirmation = phase === 'confirmation' && value === phaseTargets.confirmation;
    if (!initial && !confirmation) throw new Error('target inactive');
  });
  mocked.readOnlyOwned.mockImplementation(value => { expect(value).toBe(phaseTargets.readOnly); });
  mocked.discover.mockImplementation(async (signer, value) => {
    expect(signer).toBe(setup!.signer);
    if (value === phaseTargets.confirmation) {
      expect(phase).toBe('confirmation'); order.push('continuationFunding'); return continuationFunding;
    }
    expect(value).toBe(target); expect(active).toBe(true);
    if (order.includes('execute')) {
      order.push('funding');
      expect(observeConfirmation.mock.calls.length).toBeGreaterThanOrEqual(6);
      expect(calls.filter(call => call.method === 'state_getStorage')).toHaveLength(28);
      return funding;
    }
    order.push('discover');
    return discovery;
  });
  mocked.hold.mockImplementation(async value => {
    assertCustodyActive();
    const second = value === phaseTargets.confirmation;
    if (second) { expect(phase).toBe('confirmation'); expect(mocked.continuationPacket).not.toHaveBeenCalled(); }
    else { expect(value).toBe(target); expect(active).toBe(true); expect(mocked.packet).not.toHaveBeenCalled(); }
    const observation = (second ? continuationFunding : funding).observation;
    heldDepositTip = Object.freeze({ height: observation.target.tipHeight, id: observation.target.tipHeaderIdHex });
    return Object.freeze({ network: 'devnet', fullHeight: observation.target.tipHeight,
      indexedHeight: observation.target.tipHeight, headerIdHex: observation.target.tipHeaderIdHex });
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
    expect(value.markerDirectory.startsWith(join(builtTargetDirectory, 'issuance-journal-'))).toBe(true);
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
    expect([target, phaseTargets.confirmation, phaseTargets.secondConfirmation]).toContain(value);
    expect(headerId).toBe(batch.request.target.genesisHeaderIdHex);
    expect(progressTransactionIdHex).toBe(value === phaseTargets.confirmation ? 'e3'.repeat(32)
      : value === phaseTargets.secondConfirmation ? 'c3'.repeat(32) : undefined);
    return { observe: observeConfirmation, reconciliationIdentityDigestHex: 'ca'.repeat(32) };
  });
  readErgoBox = (_origin, id) => {
    const value = compiled.issuance.orderedTransactions.find(({ transaction }: any) => transaction.outputs[0].boxId === id);
    return value ? structuredClone(value.transaction.outputs[0]) : null;
  };
  heldDepositTip = null;
  readErgoTip = () => ({ height: 120, id: '93'.repeat(32) });
  readHeldDepositTip = (_origin, held) => held;
  readErgoInclusion = (_origin, height) => [height === 150 ? 'f1'.repeat(32) : '92'.repeat(32)];
  const observedTips = new Map<string, Map<number, string>>();
  readErgoAnchor = (origin, height) => [observedTips.get(origin)?.get(height)];
  mocked.source.mockImplementation(origin => {
    expect([target.primaryNodeOrigin, target.witnessNodeOrigin]).toContain(origin);
    const heldIdAt = (height: number): string => heldDepositTip?.height === height ? heldDepositTip.id
      : receipts.find(receipt => receipt.confirmationHeight === height)?.confirmationHeaderIdHex
        ?? (height === 150 ? 'f1'.repeat(32) : height.toString(16).padStart(64, '0'));
    // Native info and header observations share one fixture sample per bracket.
    // Existing held-state fault hooks still advance once, rather than once per GET.
    let pendingHeldTip: Promise<unknown> | undefined;
    let fullProofMembershipPending = false;
    return {
      beginAuthenticatedTrackerReconstruction: () => { assertCustodyActive(); },
      endAuthenticatedTrackerReconstruction: () => {},
      getInfo: async () => {
        assertCustodyActive();
        fullProofMembershipPending = heldDepositTip !== null;
        pendingHeldTip = Promise.resolve().then(() => heldDepositTip === null
          ? readErgoTip(origin) : readHeldDepositTip(origin, heldDepositTip));
        const tip = await pendingHeldTip as { height: number; id: string };
        return { network: 'devnet', fullHeight: tip.height, bestFullHeaderId: tip.id };
      },
      getBlockHeaderById: async (id: string) => {
        assertCustodyActive();
        for (let height = heldDepositTip?.height ?? 0; height >= 1; height--) {
          if (heldIdAt(height) === id) return { id, height, parentId: heldIdAt(height - 1) };
        }
        return null;
      },
      getBlockHeaderChainSlice: async (fromHeight: number, toHeight: number) => {
        assertCustodyActive();
        return Array.from({ length: toHeight - fromHeight }, (_, index) => {
          const height = fromHeight + index + 1;
          return { id: heldIdAt(height), height, parentId: heldIdAt(height - 1) };
        });
      },
      getBestHeader: async () => {
      assertCustodyActive();
      const tip: any = pendingHeldTip !== undefined ? await pendingHeldTip : heldDepositTip === null
        ? await readErgoTip(origin) : await readHeldDepositTip(origin, heldDepositTip);
      pendingHeldTip = undefined;
      if (tip && typeof tip.height === 'number' && typeof tip.id === 'string') {
        if (!observedTips.has(origin)) observedTips.set(origin, new Map());
        observedTips.get(origin)!.set(tip.height, tip.id);
      }
      return tip && typeof tip.height === 'number' && typeof tip.id === 'string'
        ? { parentId: heldIdAt(tip.height - 1), ...tip } : tip;
    },
      getBoxByIdOrNull: async (id: string) => { assertCustodyActive(); return readErgoBox(origin, id); },
      getBlockHeaderIdsAtHeight: async (height: number) => {
        assertCustodyActive();
        // Keep historical payout-receipt faults on the receipt revalidation
        // GET, even when the same height is also the new full-state anchor.
        if (fullProofMembershipPending && heldDepositTip !== null && height === heldDepositTip.height) {
          fullProofMembershipPending = false;
          return [heldDepositTip.id];
        }
        return receipts.some(receipt => receipt.confirmationHeight === height) || (heldDepositTip !== null && height === 150)
          ? readErgoInclusion(origin, height) : readErgoAnchor(origin, height);
      } };
  });
  mocked.environment.mockReturnValue({ bounded: 'environment stub' });
  mocked.pin.mockResolvedValue(undefined);
  mocked.materialize.mockImplementation(async value => {
    order.push('materialize'); assertCustodyActive(); expect(active).toBe(true);
    expect(value.args).toEqual(['build-spec', '--chain', `fed-genesis:${join(builtTargetDirectory, 'fed-genesis.json')}`, '--disable-default-bootnode', '--raw']);
    expect(JSON.parse(readFileSync(join(builtTargetDirectory, 'fed-genesis.json'), 'utf8')).operatorAddressHex).toBe(operator!.addressHex);
    return { stdout: JSON.stringify(rawSpec()), stderr: '' };
  });
  mocked.nodes.mockImplementation(async value => {
    order.push('nodes'); assertCustodyActive(); expect(active).toBe(true);
    expect(value.primaryRpcUrl).toBe(PRIMARY); expect(value.witnessRpcUrl).toBe(WITNESS);
    expect(value.nodeBinaryPath).toBe(join(directory, 'node.exe'));
    expect(value.expectedNodeBinarySha256Hex).toBe('51'.repeat(32));
    expect(value.genesisJsonBytes).toEqual(compiledGenesisBytes);
    expect([value.primaryP2pPort, value.witnessP2pPort, value.primaryPrometheusPort, value.witnessPrometheusPort])
      .toEqual([30355, 30356, 19615, 19616]);
    expect(sha256(value.genesisJsonBytes)).toBe(value.expectedGenesisJsonSha256Hex);
    frontierActive = true;
    let closing: Promise<{ component: string }> | undefined;
    closeNative = vi.fn(() => {
      if (closing) return closing;
      frontierActive = false;
      order.push('nodes-stop');
      closing = Promise.resolve({ component: 'FED process stub' });
      return closing;
    });
    nativeAction = vi.fn(async callback => {
      mocked.frontierOwned(frontierEndpoints);
      try {
        const result = await callback(frontierEndpoints);
        mocked.frontierOwned(frontierEndpoints);
        return result;
      } catch (error) {
        await closeNative();
        throw error;
      }
    });
    return Object.freeze({ withTarget: nativeAction, close: closeNative });
  });
  mocked.recovery.mockImplementation(async value => {
    order.push('recovery-capture');
    expect(value.targetDirectory).toBe(builtTargetDirectory);
    expect(value.journalDirectory).toBe(journalDirectory);
    expect(value.tracker).toBe(journalState);
    expect(value.expectedAttempts).toHaveLength(2);
    expect(value.expectedAttempts[0]).toMatchObject({
      expectedTxId: returnValues.trackerAttempt.expectedTxId,
      durableAttemptDigestHex: returnValues.trackerAttempt.durableAttemptDigestHex,
      authorizationDigestHex: returnValues.trackerAuthorization.authorizationDigestHex,
      transportDisposition: 'accepted',
    });
    expect(value.expectedAttempts[1]).toMatchObject({
      expectedTxId: returnValues.secondTrackerAttempt.expectedTxId,
      durableAttemptDigestHex: returnValues.secondTrackerAttempt.durableAttemptDigestHex,
      authorizationDigestHex: returnValues.secondTrackerAuthorization.authorizationDigestHex,
      transportDisposition: 'accepted',
    });
    expect(value.ergoSession).toBeDefined();
    expect(value.frontierSession).toBeDefined();
    const frontierProcess = await value.frontierSession.close();
    value.tracker.close();
    return Object.freeze({ frontierProcess,
      recoveryDirectory: 'two-cycle-recovery-Ab3D4e',
      manifestSha256Hex: 'ab'.repeat(32),
      manifest: Object.freeze({ schema: 'e2s.substrate-federated-two-cycle-recovery-capture.v1',
        nodeConsistencyEstablished: false, freshRestartValidated: false,
        executionAuthorityRestored: false }),
    });
  });
  mocked.frontierOwned.mockImplementation(value => {
    if (!frontierActive || value !== frontierEndpoints) throw new Error('FED target inactive');
  });
  mocked.fundingOwned.mockImplementation((value, executionTarget) => {
    if (value === continuationFunding) {
      expect(executionTarget).toBe(phaseTargets.confirmation); return continuationFunding.observation;
    }
    expect(value).toBe(funding); expect(executionTarget).toBe(target); return funding.observation;
  });
  mocked.packet.mockImplementation(async value => {
    order.push('packet');
    expect(Object.keys(value).sort()).toEqual(['batch', 'target', 'sourceFundingInput', 'sourceIntent', 'depositorErgoTreeHex', 'creationHeights', 'fees'].sort());
    expect(value.batch).toBe(batch); expect(value.target).toBe(target);
    expect(value.sourceFundingInput).toBe(funding.observation.genesisInputs.tracker);
    expect(value.fees).toEqual({ sourceLockCreationNanoErg: '1100000', reserveTransitionNanoErg: '1100000' });
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
  mocked.continuationPacket.mockImplementation(async value => {
    order.push('continuationPacket'); expect(value.batch).toBe(batch); expect(value.target).toBe(phaseTargets.confirmation);
    expect(value.previousPacket).toBe(packet); expect(value.withdrawal.check).toBe(returnValues.payoutCheck);
    expect(value.withdrawal.attempt).toBe(returnValues.payoutAttempt);
    expect(value.sourceFundingInput).toBe(continuationFunding.observation.genesisInputs.tracker);
    expect(value.fees).toEqual({ sourceLockCreationNanoErg: '1100000', reserveTransitionNanoErg: '1100000' });
    expect(value.creationHeights).toEqual({ currentErgoHeight: 166, sourceLockCreation: 166, reserveTransition: 166 });
    return continuationPacket;
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
      setupSession: retainedSetup, state: journalState,
      ...(input.captureCommittedReserveConfirmationProgress === true ? { captureConfirmationProgress: true } : {}) });
    expect(value.target).toBe(target); expect(value.batch).toBe(batch);
    expect(value.packet).toBe(packet); expect(value.sourceLockObservation).toBe(sourceLock.outputObservation);
    expect(value.setupSession).toBe(retainedSetup); expect(value.state).toBe(journalState);
    retainAttempt('reserve-transition-attempt'); return committedVault;
  });
  mocked.continuationSourceLock.mockImplementation(async value => {
    order.push('continuationSourceLock'); expect(value).toEqual({ target: phaseTargets.confirmation, batch,
      packet: continuationPacket, setupSession: retainedSetup, state: journalState });
    retainAttempt('continuation-source-lock-attempt'); return continuationSourceLock;
  });
  mocked.continuationVault.mockImplementation(async value => {
    order.push('continuationVault'); expect(value).toEqual({ target: phaseTargets.confirmation, batch,
      packet: continuationPacket, sourceLockObservation: continuationSourceLock.outputObservation,
      setupSession: retainedSetup, state: journalState,
      ...(input.captureCommittedReserveConfirmationProgress === true ? { captureConfirmationProgress: true } : {}) });
    retainAttempt('continuation-reserve-transition-attempt'); return continuationVault;
  });
  mocked.draft.mockImplementation(value => {
    if (value.packet === continuationPacket) {
      order.push('continuationDraft'); continuationDraftInputs = value;
      expect(value).toEqual({ target: phaseTargets.confirmation, batch, packet: continuationPacket,
        committedVaultObservation: continuationVault.outputObservation });
      return continuationDraft;
    }
    order.push('draft'); draftInputs = value;
    expect(value).toEqual({ target, batch, packet, committedVaultObservation: committedVault.outputObservation });
    expect(value.target).toBe(target); expect(value.batch).toBe(batch);
    expect(value.packet).toBe(packet); expect(value.committedVaultObservation).toBe(committedVault.outputObservation);
    return draft;
  });
  mocked.evidence.mockImplementation(value => {
    if (value.packet === continuationPacket) {
      order.push('continuationEvidence'); expect(value).toEqual({ ...continuationDraftInputs, draft: continuationDraft });
      return continuationEvidence;
    }
    order.push('evidence'); expect(value).toEqual({ ...draftInputs, draft });
    expect(value.target).toBe(target); expect(value.batch).toBe(batch);
    expect(value.draft).toBe(draft); expect(value.packet).toBe(packet);
    expect(value.committedVaultObservation).toBe(committedVault.outputObservation); return evidence;
  });
  mocked.proof.mockImplementation((operation, value) => {
    if (operation === continuationSourceOperation) {
      order.push('continuationProof'); expect(value).toEqual({ draftInputs: continuationDraftInputs,
        draft: continuationDraft, evidenceReceipt: continuationEvidence, issuedAtNativeHeight: '4', expiresAtNativeHeight: '32' });
      return continuationProof;
    }
    order.push('proof'); expect(operation).toBe(sourceOperation); expect(operation).toBeDefined();
    expect(value).toEqual({ draftInputs, draft, evidenceReceipt: evidence, issuedAtNativeHeight: '0', expiresAtNativeHeight: '32' });
    expect(value.draftInputs).toBe(draftInputs); expect(value.draft).toBe(draft); expect(value.evidenceReceipt).toBe(evidence);
    return proof;
  });
  mocked.mint.mockImplementation(async value => {
    order.push('mint');
    expect(Object.keys(value).sort()).toEqual(['attemptDirectory', 'broadcastScope', 'grossAmountNanoErg', 'recipientErgoTreeHex', 'signing']);
    expect(value.signing).toEqual({ operator, sourceOperation, draft, proof, compiled, target,
      frontierTarget: frontierEndpoints, expectedStorage: top, expectedGenesisHashHex: genesis });
    for (const [key, original] of Object.entries({ operator, sourceOperation, draft, proof, compiled, target, frontierTarget: frontierEndpoints })) {
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
  mocked.continuationReservation.mockImplementation(async value => {
    order.push('continuationReservation'); expect(value.previousExecution).toBe(burn);
    expect(value.signing).toMatchObject({ operator, sourceOperation: continuationSourceOperation,
      draft: continuationDraft, proof: continuationProof, compiled, target: phaseTargets.confirmation,
      frontierTarget: frontierEndpoints, expectedStorage: top, expectedGenesisHashHex: genesis });
    expect(dirname(value.attemptDirectory)).toBe(journalDirectory);
    expect(value.broadcastScope).toBe('fed-native-local-synthetic-continuation-reservation-only');
    retainAttempt('native-reservation-attempt', value.attemptDirectory); return continuationReservation;
  });
  mocked.continuationMintBurn.mockImplementation(async value => {
    order.push('continuationMintBurn'); expect(value.reservationExecution).toBe(continuationReservation);
    expect(value).toMatchObject({ grossAmountNanoErg: '15000000',
      recipientErgoTreeHex: `0x${setup!.signer.p2pkErgoTreeHex}`,
      broadcastScope: 'fed-native-local-synthetic-continuation-mint-and-burn-only' });
    return continuationExecution;
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
}
beforeEach(prepareRootFixture);
function disposeRootFixture() {
  if (operator) operators.disposeFederatedGenesisOperatorV1(operator);
  source?.dispose(); setup?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  rmSync(directory, { recursive: true, force: true });
}
afterEach(disposeRootFixture);

function configureNativeReturnMocks() {
  const confirmedFee = (name: 'withdrawal' | 'tracker', byte: string, height: number,
    secondByte: string, secondHeight: number) => {
    const checkName = `${name}FeeCheck` as const;
    const continuationCheckName = `continuation${name[0]!.toUpperCase()}${name.slice(1)}FeeCheck` as
      'continuationWithdrawalFeeCheck' | 'continuationTrackerFeeCheck';
    const executeName = `${name}Fee` as const;
    mocked[checkName].mockImplementation(async value => {
      order.push(checkName); expect(value).toBe(target); expect(active).toBe(true); assertCustodyActive();
      const feeInputBox = Object.freeze({ boxId: byte.repeat(32), value: '1100000', ergoTree: setup!.signer.p2pkErgoTreeHex });
      const change = Object.freeze({ boxId: `${byte[0]}f`.repeat(32), value: '1100000', ergoTree: setup!.signer.p2pkErgoTreeHex });
      const checked = Object.freeze({ transaction: Object.freeze({ txId: byte.repeat(32), outputs: [feeInputBox, change] }) });
      returnValues[checkName] = checked; return checked;
    });
    mocked[continuationCheckName].mockImplementation(async value => {
      order.push(continuationCheckName); expect(value).toBe(phaseTargets.confirmation); assertCustodyActive();
      const feeInputBox = Object.freeze({ boxId: secondByte.repeat(32), value: '1100000', ergoTree: setup!.signer.p2pkErgoTreeHex });
      const checked = Object.freeze({ transaction: Object.freeze({ txId: secondByte.repeat(32), outputs: [feeInputBox] }) });
      returnValues[continuationCheckName] = checked; return checked;
    });
    mocked[executeName].mockImplementation(async value => {
      const second = value.checked === returnValues[continuationCheckName];
      const resultName = `${second ? 'second' : ''}${second ? name[0]!.toUpperCase() + name.slice(1) : name}Fee`;
      order.push(resultName); expect(value.target).toBe(second ? phaseTargets.confirmation : target);
      expect(value.checked).toBe(returnValues[second ? continuationCheckName : checkName]);
      expect(value.transactionPermitsEnabled).toBe(true);
      expect(value.state).toBe(journalState); assertCustodyActive();
      if (!second) expect(active).toBe(true);
      retainAttempt(`${resultName}-attempt`);
      returnValues[resultName] = Object.freeze({ expectedTxId: value.checked.transaction.txId,
        durableAttemptDigestHex: 'de'.repeat(32), transportStatus: 'accepted', journalDigestHex: 'dd'.repeat(32),
        confirmationDigestHex: 'dc'.repeat(32), confirmationHeight: second ? secondHeight : height,
        confirmationHeaderIdHex: 'db'.repeat(32),
        feeInputBox: value.checked.transaction.outputs[0] });
      return returnValues[resultName];
    });
  };
  confirmedFee('withdrawal', 'e1', 138, 'c1', 172); confirmedFee('tracker', 'e2', 139, 'c2', 173);
  mocked.miningAuthority.mockImplementation(async value => {
    order.push('miningAuthority'); expect(value).toBe(phaseTargets.confirmation);
    expect(returnValues.secondWithdrawalFee.confirmationHeight).toBe(172);
    expect(returnValues.secondTrackerFee.confirmationHeight).toBe(173);
    assertCustodyActive(); return continuationMiningAuthority;
  });
  // These doubles enforce root forwarding and callback lifetime only; they do not
  // establish an actual process pause, indexed watermark or node acceptance.
  const pauseBindings = new WeakMap<object, object>();
  const assertPauseTarget = (value: object) => {
    if (value === target && active) return false;
    if (value === phaseTargets.confirmation && phase === 'confirmation') return true;
    throw new Error('pause fixture target is not the original active target');
  };
  mocked.pause.mockImplementation(async value => {
    const second = assertPauseTarget(value);
    assertCustodyActive();
    expect(order).toContain(second ? 'secondWithdrawalFee' : 'withdrawalFee');
    expect(order).toContain(second ? 'secondTrackerFee' : 'trackerFee');
    expect(mocked.checkpoint).toHaveBeenCalledTimes(second ? 1 : 0);
    order.push(second ? 'secondPause' : 'pause');
    const observation = Object.freeze({
      snapshot: Object.freeze({ fullHeight: second ? 190 : 140, headerIdHex: (second ? '98' : '97').repeat(32) }),
      pauseReceipt: Object.freeze({ schema: 'e2s.owned-mining-submission-pause.v1',
        operationId: (second ? 'd8' : 'd7').repeat(32), submissionPaused: true,
        maximumBlockHeight: null,
        latestAppliedBlock: Object.freeze({ height: second ? 190 : 140, headerId: (second ? '98' : '97').repeat(32) }) }),
    });
    pauseBindings.set(observation, value);
    returnValues[second ? 'secondPause' : 'pause'] = observation;
    return observation;
  });
  mocked.pauseRevalidate.mockImplementation(async (value, observation) => {
    const second = assertPauseTarget(value);
    assertCustodyActive();
    if (pauseBindings.get(observation) !== value) throw new Error('pause fixture observation is not bound to the original target');
    const prefix = second ? 'native-continuation-checkpoint-admission' : 'native-checkpoint-admission';
    expect(order.slice(-3)).toEqual([prefix, `${prefix}-withdrawal-fee`, `${prefix}-tracker-fee`]);
    expect(mocked.checkpoint).toHaveBeenCalledTimes(second ? 1 : 0);
    order.push(second ? 'secondPauseRevalidate' : 'pauseRevalidate');
  });
  mocked.wait.mockImplementation(async (_observer, txId, _deadline, stage, assertActive) => {
    assertActive?.();
    if (stage.startsWith('native-checkpoint-admission') || stage.startsWith('native-continuation-checkpoint-admission')) {
      const second = stage.startsWith('native-continuation-');
      const prefix = second ? 'native-continuation-checkpoint-admission' : 'native-checkpoint-admission';
      expect(_observer).toBe(mocked.confirmation.mock.results.at(-1)!.value);
      if (second) expect(phase).toBe('confirmation'); else expect(active).toBe(true);
      expect(order).toContain(second ? 'secondPause' : 'pause');
      const prior = stage === prefix ? { expectedTxId: (second ? continuationVault : committedVault).expectedTxId,
        ...(second ? continuationVault : committedVault).outputObservation }
        : returnValues[second ? (stage.endsWith('withdrawal-fee') ? 'secondWithdrawalFee' : 'secondTrackerFee')
          : (stage.endsWith('withdrawal-fee') ? 'withdrawalFee' : 'trackerFee')];
      expect(txId).toBe(prior.expectedTxId);
      order.push(stage);
      return { status: 'confirmed', observedAtHeight: second ? 190 : 140,
        confirmationHeight: prior.confirmationHeight, confirmationHeaderIdHex: prior.confirmationHeaderIdHex };
    }
    const second = stage.startsWith('native-continuation-');
    expect(phase).toBe(second ? 'secondConfirmation' : 'confirmation');
    const tracker = stage.endsWith('tracker-admission');
    expect(txId).toBe(returnValues[second ? (tracker ? 'secondTrackerAttempt' : 'secondPayoutAttempt')
      : (tracker ? 'trackerAttempt' : 'payoutAttempt')].expectedTxId);
    returnValues[stage] = Object.freeze({ status: 'confirmed', observedAtHeight: second ? 205 : 165,
      confirmationHeight: second ? 200 : 150, confirmationHeaderIdHex: (second ? 'f2' : 'f1').repeat(32),
      observationDigestHex: (second ? 'f3' : 'f2').repeat(32) });
    return returnValues[stage];
  });
  mocked.checkpoint.mockImplementation(async value => {
    const second = value.execution === continuationExecution;
    order.push(second ? 'continuationCheckpoint' : 'checkpoint');
    expect(value.execution).toBe(second ? continuationExecution : burn); assertCustodyActive();
    if (!second) expect(active).toBe(true); expect(frontierActive).toBe(true);
    expect(value.admissionValidFromErgoHeight).toBe(second ? '190' : '140');
    expect(value.admissionExpiresAtErgoHeight).toBe(second ? '254' : '204');
    const statement = buildSubstrateFederatedCheckpointStatementV1({ profile: compiled.preparation.checkpointProfile,
      sourceNetworkIdHex: 'b1'.repeat(32), sidechainIdHex: 'b2'.repeat(32), sourceNativeBlockHeight: second ? '8' : '4',
      sourceNativeBlockHashHex: (second ? 'd1' : 'a1').repeat(32), executionBlockHashHex: (second ? 'd2' : 'a2').repeat(32),
      bridgeEventRootHex: (second ? 'd3' : 'a3').repeat(32), burnLeafCount: 1,
      bridgeAddressHex: '33'.repeat(20), tokenAddressHex: '44'.repeat(20), bridgeRuntimeCodeSha256Hex: 'b5'.repeat(32), bridgeRuntimeCodeBytes: 4104,
      tokenRuntimeCodeSha256Hex: 'b6'.repeat(32), tokenRuntimeCodeBytes: 2356, sourceRuntimeCodeSha256Hex: 'b7'.repeat(32), sourceRuntimeCodeBytes: 1000,
      runtimeProfileIdHex: 'b8'.repeat(32), settlementProfileIdHex: 'b3'.repeat(32),
      admissionValidFromErgoHeight: value.admissionValidFromErgoHeight, admissionExpiresAtErgoHeight: value.admissionExpiresAtErgoHeight });
    const leaf = Object.freeze({ sidechainIdHex: statement.sidechainIdHex, sidechainBlockHashHex: statement.executionBlockHashHex,
      sidechainTxHashHex: (second ? 'd4' : 'a4').repeat(32), burnIdHex: (second ? 'd5' : 'a5').repeat(32), eventIndex: 2,
      recipientErgoTreeHashHex: (second ? 'd6' : 'a6').repeat(32),
      amountNanoErg: '10000000', assetIdHex: '00'.repeat(32) });
    const result = Object.freeze({ execution: value.execution, attestation: Object.freeze({ checkpointStatement: statement }),
      commitment: Object.freeze({ blockHashHex: `0x${statement.sourceNativeBlockHashHex}`, burnEvent: Object.freeze({ recipientErgoTreeHex: setup!.signer.p2pkErgoTreeHex }),
        burnProof: Object.freeze({ leaf, bridgeEventRootHex: statement.bridgeEventRootHex, leafIndex: 0, leafCount: 1, proof: [] }) }) });
    if (second) continuationCheckpoint = result; else checkpoint = result;
    return result;
  });
  mocked.checkpointAssert.mockImplementation(value => {
    expect([checkpoint, continuationCheckpoint]).toContain(value);
    if (value === checkpoint) expect(active).toBe(true);
    expect(frontierActive).toBe(true); assertCustodyActive();
  });
  mocked.anchor.mockImplementation(async value => {
    const second = value.target === phaseTargets.secondAnchor;
    order.push(second ? 'secondAnchor' : 'anchor'); expect(value.target).toBe(phaseTargets[second ? 'secondAnchor' : 'anchor']);
    expect(active).toBe(false);
    expect(value.expectedPriorHeight).toBe(second ? 190 : 140);
    expect(value.expectedPriorHeaderIdHex).toBe((second ? '98' : '97').repeat(32));
    const name = second ? 'secondAnchor' : 'anchor';
    returnValues[name] = Object.freeze({ anchorHeaderIdHex: (second ? 'd1' : 'c1').repeat(32),
      anchorHeight: second ? 191 : 141, anchorExtensionRootHex: (second ? 'd2' : 'c2').repeat(32) });
    return returnValues[name];
  });
  mocked.anchorAssert.mockImplementation(value => { expect([returnValues.anchor, returnValues.secondAnchor]).toContain(value); });
  mocked.frozenObservation.mockImplementation(async value => {
    const second = value.target === phaseTargets.secondFrozen;
    order.push(second ? 'secondFrozenObservation' : 'frozenObservation');
    const anchorName = second ? 'secondAnchor' : 'anchor'; const name = second ? 'secondObservation' : 'observation';
    expect(value.target).toBe(phaseTargets[second ? 'secondFrozen' : 'frozen']);
    expect(value.expectedAnchorHeaderIdHex).toBe(returnValues[anchorName].anchorHeaderIdHex);
    returnValues[name] = Object.freeze({ ...returnValues[anchorName], headers: [{ raw: { height: second ? 191 : 141 } }],
      anchorContextIndex: 0, extensionMembershipProofHex: second ? 'd3' : 'c3' }); return returnValues[name];
  });
  mocked.observationAssert.mockImplementation(value => {
    expect([returnValues.observation, returnValues.secondObservation]).toContain(value);
  });
  mocked.headers.mockImplementation((_module, value) => {
    const second = value.rawHeaders[0].height === 191; const name = second ? 'secondHeaders' : 'headers';
    returnValues[name] = Object.freeze({ component: `${name} double` }); return returnValues[name];
  });
  mocked.context.mockImplementation(async value => {
    order.push('context'); expect(value.trackerInputBox).toBe(compiled.issuance.orderedTransactions[0].transaction.outputs[0]);
    expect(value.observedHeaderContext).toBe(returnValues.headers); expect(value.encodedStatementHex).toBe(checkpoint.attestation.checkpointStatement.encodedStatementHex);
    returnValues.context = Object.freeze({ component: 'tracker context double' }); return returnValues.context;
  });
  mocked.continuationContext.mockImplementation(async value => {
    order.push('continuationContext'); expect(value.previousContext).toBe(returnValues.context);
    expect(value.trackerInputBox).toBe(returnValues.payoutCheck.packet.boxes.trackerDataInput);
    expect(value.observedHeaderContext).toBe(returnValues.secondHeaders);
    expect(value.encodedStatementHex).toBe(continuationCheckpoint.attestation.checkpointStatement.encodedStatementHex);
    returnValues.secondContext = Object.freeze({ component: 'continuation tracker context double' });
    return returnValues.secondContext;
  });
  mocked.trackerTx.mockImplementation(async value => {
    const second = returnValues.secondContext !== undefined && value.trackerContext === returnValues.secondContext;
    const name = second ? 'secondTrackerTx' : 'trackerTx';
    order.push(name); expect(value.trackerContext).toBe(returnValues[second ? 'secondContext' : 'context']);
    expect(value.feeInputBox).toBe(returnValues[second ? 'secondTrackerFee' : 'trackerFee'].feeInputBox);
    returnValues[name] = Object.freeze({ unsignedTransactionIdHex: (second ? 'c3' : 'e3').repeat(32) }); return returnValues[name];
  });
  mocked.trackerCheck.mockImplementation(async (value, ownedTarget) => {
    order.push('trackerCheck'); expect(ownedTarget).toBe(phaseTargets.frozen); expect(value.transaction).toBe(returnValues.trackerTx);
    expect(() => mocked.batch(batch, target)).toThrow('target inactive'); assertCustodyActive();
    returnValues.trackerCheck = Object.freeze({ result: Object.freeze({ checkDigestHex: 'd1'.repeat(32) }) }); return returnValues.trackerCheck;
  });
  mocked.continuationTrackerCheck.mockImplementation(async (value, ownedTarget) => {
    order.push('continuationTrackerCheck'); expect(ownedTarget).toBe(phaseTargets.secondFrozen);
    expect(value.context).toBe(returnValues.secondContext); expect(value.transaction).toBe(returnValues.secondTrackerTx);
    assertCustodyActive();
    returnValues.secondTrackerCheck = Object.freeze({ result: Object.freeze({ checkDigestHex: 'c4'.repeat(32) }) });
    return returnValues.secondTrackerCheck;
  });
  mocked.trackerAuthorize.mockImplementation(async (value, ownedTarget) => {
    const second = value === returnValues.secondTrackerCheck; const name = second ? 'secondTrackerAuthorization' : 'trackerAuthorization';
    order.push(second ? 'secondTrackerAuthorize' : 'trackerAuthorize');
    expect(value).toBe(returnValues[second ? 'secondTrackerCheck' : 'trackerCheck']);
    expect(ownedTarget).toBe(phaseTargets[second ? 'secondFrozen' : 'frozen']);
    returnValues[name] = Object.freeze({ authorizationDigestHex: (second ? 'c5' : 'd2').repeat(32) }); return returnValues[name];
  });
  mocked.trackerReserve.mockImplementation((value, state) => {
    const second = value === returnValues.secondTrackerAuthorization; const name = second ? 'secondTrackerAttempt' : 'trackerAttempt';
    order.push(second ? 'secondTrackerReserve' : 'trackerReserve');
    expect(value).toBe(returnValues[second ? 'secondTrackerAuthorization' : 'trackerAuthorization']); expect(state).toBe(journalState);
    retainAttempt(`${second ? 'second-' : ''}tracker-admission-attempt`);
    returnValues[name] = Object.freeze({ expectedTxId: (second ? 'c3' : 'e3').repeat(32),
      durableAttemptDigestHex: (second ? 'c6' : 'd3').repeat(32) }); return returnValues[name];
  });
  mocked.trackerFreshness.mockImplementation(async (value, ownedTarget) => {
    const second = value === returnValues.secondTrackerAttempt; const name = second ? 'secondFreshness' : 'freshness';
    order.push(second ? 'secondTrackerFreshness' : 'trackerFreshness');
    expect(value).toBe(returnValues[second ? 'secondTrackerAttempt' : 'trackerAttempt']);
    expect(ownedTarget).toBe(phaseTargets[second ? 'secondFreshness' : 'freshness']);
    returnValues[name] = Object.freeze({ component: `${name} completion double` }); return returnValues[name];
  });
  for (const name of ['tracker', 'payout'] as const) {
    mocked[`${name}Submit`].mockImplementation(async (ownedTarget, value) => {
      const second = value === returnValues[`second${name[0]!.toUpperCase()}${name.slice(1)}Attempt`];
      const stem = `${second ? 'second' : ''}${second ? name[0]!.toUpperCase() + name.slice(1) : name}`;
      order.push(`${stem}Submit`); expect(value).toBe(returnValues[`${stem}Attempt`]);
      expect(ownedTarget).toBe(phaseTargets[second ? (name === 'tracker' ? 'secondTransport' : 'secondConfirmation')
        : (name === 'tracker' ? 'transport' : 'confirmation')]);
      expect(StateTracker.prototype.close).not.toHaveBeenCalled(); retainAttempt(`${stem}-transport-attempt`);
      returnValues[`${stem}Submission`] = Object.freeze({ status: 'accepted', responseDigestHex: 'f3'.repeat(32) });
      return returnValues[`${stem}Submission`];
    });
    mocked[`${name}Finalize`].mockImplementation((attempt, submission) => {
      const second = attempt === returnValues[`second${name[0]!.toUpperCase()}${name.slice(1)}Attempt`];
      const stem = `${second ? 'second' : ''}${second ? name[0]!.toUpperCase() + name.slice(1) : name}`;
      order.push(`${stem}Finalize`); expect(attempt).toBe(returnValues[`${stem}Attempt`]);
      expect(submission).toBe(returnValues[`${stem}Submission`]);
      return Object.freeze({ journalDigestHex: 'f4'.repeat(32) });
    });
    mocked[`${name}Confirm`].mockImplementation(async (attempt, ownedTarget, confirmation) => {
      const second = attempt === returnValues[`second${name[0]!.toUpperCase()}${name.slice(1)}Attempt`];
      const stem = `${second ? 'second' : ''}${second ? name[0]!.toUpperCase() + name.slice(1) : name}`;
      order.push(`${stem}Confirm`); expect(attempt).toBe(returnValues[`${stem}Attempt`]);
      expect(ownedTarget).toBe(phaseTargets[second ? 'secondConfirmation' : 'confirmation']);
      const stage = second ? (name === 'tracker' ? 'native-continuation-tracker-admission' : 'native-continuation-withdrawal')
        : (name === 'tracker' ? 'native-tracker-admission' : 'native-withdrawal');
      expect(confirmation).toBe(returnValues[stage]);
      return Object.freeze({ expectedTxId: attempt.expectedTxId, status: 'confirmed', confirmationHeight: confirmation.confirmationHeight,
        confirmationHeaderId: confirmation.confirmationHeaderIdHex });
    });
  }
  mocked.payoutCheck.mockImplementation(async (claim, ownedTarget) => {
    order.push('payoutCheck'); expect(ownedTarget).toBe(phaseTargets.confirmation); assertCustodyActive();
    expect(claim.burnLeaf).toEqual(checkpoint.commitment.burnProof.leaf);
    expect(claim.burnProof).toBe(checkpoint.commitment.burnProof.proof);
    expect(claim.recipientErgoTreeHex).toBe(setup!.signer.p2pkErgoTreeHex);
    returnValues.payoutCheck = Object.freeze({ packet: Object.freeze({ transaction: Object.freeze({ txId: 'e4'.repeat(32) }),
      burn: Object.freeze({ leaf: claim.burnLeaf }), boxes: Object.freeze({ payout: { boxId: 'f5'.repeat(32) },
        reserveSuccessor: { boxId: 'f6'.repeat(32) }, duplicatePreventionSuccessor: { boxId: 'f7'.repeat(32) },
        trackerDataInput: { boxId: 'f8'.repeat(32) } }) }) });
    return returnValues.payoutCheck;
  });
  mocked.continuationPayoutCheck.mockImplementation(async (claim, ownedTarget) => {
    order.push('continuationPayoutCheck'); expect(ownedTarget).toBe(phaseTargets.secondConfirmation); assertCustodyActive();
    expect(claim.burnLeaf).toEqual(continuationCheckpoint.commitment.burnProof.leaf);
    returnValues.secondPayoutCheck = Object.freeze({ packet: Object.freeze({ transaction: Object.freeze({ txId: 'c7'.repeat(32) }),
      burn: Object.freeze({ leaf: claim.burnLeaf }), boxes: Object.freeze({ payout: { boxId: 'c8'.repeat(32) },
        reserveSuccessor: { boxId: 'c9'.repeat(32) }, duplicatePreventionSuccessor: { boxId: 'ca'.repeat(32) },
        trackerDataInput: { boxId: 'cb'.repeat(32) } }) }) });
    setup!.dispose(); return returnValues.secondPayoutCheck;
  });
  mocked.payoutAuthorize.mockImplementation(async (value, ownedTarget) => {
    const second = value === returnValues.secondPayoutCheck; const name = second ? 'secondPayoutAuthorization' : 'payoutAuthorization';
    order.push(second ? 'secondPayoutAuthorize' : 'payoutAuthorize');
    expect(value).toBe(returnValues[second ? 'secondPayoutCheck' : 'payoutCheck']);
    expect(ownedTarget).toBe(phaseTargets[second ? 'secondConfirmation' : 'confirmation']);
    if (second) expect(() => assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer))
      .toThrow(/active process provenance/);
    else expect(() => assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer)).not.toThrow();
    returnValues[name] = Object.freeze({ authorizationDigestHex: (second ? 'cc' : 'f8').repeat(32) }); return returnValues[name];
  });
  mocked.payoutReserve.mockImplementation((value, state) => {
    const second = value === returnValues.secondPayoutAuthorization; const name = second ? 'secondPayoutAttempt' : 'payoutAttempt';
    order.push(second ? 'secondPayoutReserve' : 'payoutReserve');
    expect(value).toBe(returnValues[second ? 'secondPayoutAuthorization' : 'payoutAuthorization']); expect(state).toBe(journalState);
    retainAttempt(`${second ? 'second-' : ''}payout-attempt`);
    returnValues[name] = Object.freeze({ expectedTxId: (second ? 'c7' : 'e4').repeat(32),
      durableAttemptDigestHex: (second ? 'cd' : 'f9').repeat(32) }); return returnValues[name];
  });
}

// Isolate the exact admission helper below earlier checked-funding joins. These
// synthetic inputs prove guard reachability, not producer/process/node admission.
function admissionHelperFixture(second: boolean,
  omitGuard?: 'distinct-transactions' | 'prior-height') {
  const sourceText = readFileSync(new URL('./substrate-federated-genesis-target-root-v1.ts', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('root.ts', sourceText, ts.ScriptTarget.ES2022, true);
  const name = 'observePausedNativeAdmissionHeightV1';
  const declarations = parsed.statements.filter((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  expect(declarations).toHaveLength(1);
  let body = declarations[0]!.getText(parsed);
  if (omitGuard) {
    const needle = omitGuard === 'distinct-transactions'
      ? 'new Set(expected.map(value => value.expectedTxId)).size !== 3'
      : 'prior.confirmationHeight > paused.snapshot.fullHeight';
    expect(body.split(needle)).toHaveLength(2);
    body = body.replace(needle, 'false');
  }
  const height = second ? 190 : 140;
  const reserve = { expectedTxId: '71'.repeat(32), outputObservation: {
    confirmationHeight: height - 10, confirmationHeaderIdHex: '72'.repeat(32),
  } };
  const withdrawalFee = { expectedTxId: '73'.repeat(32), confirmationHeight: height - 2,
    confirmationHeaderIdHex: '74'.repeat(32) };
  const trackerFee = { expectedTxId: '75'.repeat(32), confirmationHeight: height - 1,
    confirmationHeaderIdHex: '76'.repeat(32) };
  const originalTarget = Object.freeze({ component: 'exact admission helper target double' });
  const observer = Object.freeze({ component: 'exact admission helper observer double' });
  const paused = Object.freeze({ snapshot: Object.freeze({ fullHeight: height }) });
  const pause = vi.fn(async (value: object) => {
    expect(value).toBe(originalTarget);
    return paused;
  });
  const fresh = vi.fn(async (value: object, txId: string, _deadline: number, stage: string) => {
    expect(value).toBe(observer);
    const prior = stage.endsWith('-withdrawal-fee') ? withdrawalFee
      : stage.endsWith('-tracker-fee') ? trackerFee
        : { expectedTxId: reserve.expectedTxId, ...reserve.outputObservation };
    expect(txId).toBe(prior.expectedTxId);
    return { status: 'confirmed', observedAtHeight: height,
      confirmationHeight: prior.confirmationHeight, confirmationHeaderIdHex: prior.confirmationHeaderIdHex };
  });
  const revalidate = vi.fn(async (value: object, observation: object) => {
    expect(value).toBe(originalTarget); expect(observation).toBe(paused);
  });
  const compiledBody = ts.transpileModule(body, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  expect(compiledBody).not.toMatch(/\brequire\s*\(/u);
  const helper = new Function('pauseSubstrateFederatedIsolatedDevnetOwnedMiningSubmissionV1',
    'waitForCanonicalConfirmation', 'revalidateSubstrateFederatedIsolatedDevnetMiningPauseObservationV1',
    `${compiledBody}\nreturn ${name};`)(pause, fresh, revalidate) as (value: object) => Promise<number>;
  const request = { target: originalTarget, observer, reserve, withdrawalFee, trackerFee,
    stage: second ? 'native-continuation-checkpoint-admission' : 'native-checkpoint-admission',
    assertActive: vi.fn() };
  return { helper, request, height, pause, fresh, revalidate };
}

type HeldConfirmation = Readonly<{ confirmationHeight: number; confirmationHeaderIdHex: string }>;
type HeldConfirmationHelper = (target: Readonly<{ primaryNodeOrigin: string; witnessNodeOrigin: string }>,
  held: Readonly<{ fullHeight: number; headerIdHex: string }>, confirmations: readonly HeldConfirmation[],
  assertCustody: () => void, kind: 'issuance' | 'payout') => Promise<void>;

// Import-free exact production helper plus its all-settled read primitive.
function heldDepositConfirmationHelperFixture(options: {
  heldHeight?: number; confirmationHeight?: number; rewrite?: (source: string) => string;
} = {}) {
  const sourceText = readFileSync(new URL('./substrate-federated-genesis-target-root-v1.ts', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('root.ts', sourceText, ts.ScriptTarget.ES2022, true);
  const selected = ['assertHeldDepositConfirmationsV1', 'settleReads'];
  const declarations = selected.map(name => {
    const matches = parsed.statements.filter((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    expect(matches).toHaveLength(1); expect(matches[0]!.body).toBeDefined();
    return matches[0]!.getText(parsed);
  });
  const productionDeclarations = declarations.join('\n');
  const compiled = ts.transpileModule(options.rewrite?.(productionDeclarations) ?? productionDeclarations, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  expect(compiled).not.toMatch(/\brequire\s*\(/u);

  const target = Object.freeze({ primaryNodeOrigin: 'primary', witnessNodeOrigin: 'witness' });
  const held = Object.freeze({ fullHeight: options.heldHeight ?? 100, headerIdHex: 'aa'.repeat(32) });
  const confirmations: HeldConfirmation[] = [
    Object.freeze({ confirmationHeight: options.confirmationHeight ?? 80, confirmationHeaderIdHex: '11'.repeat(32) }),
  ];
  const tips = new Map<string, unknown[]>([
    ['primary', [{ height: held.fullHeight, id: held.headerIdHex }, { height: held.fullHeight, id: held.headerIdHex }]],
    ['witness', [{ height: held.fullHeight, id: held.headerIdHex }, { height: held.fullHeight, id: held.headerIdHex }]],
  ]);
  const membership = new Map<string, unknown>();
  const bestCalls = new Map<string, number>();
  const infoCalls = new Map<string, number>();
  const membershipCalls: [string, number][] = [];
  const headerCalls: [string, string][] = [];
  const sliceCalls: [string, number, number][] = [];
  const beginScope = vi.fn();
  const endScope = vi.fn();
  const headerIdAt = (height: number) => height === held.fullHeight ? held.headerIdHex
    : confirmations.find(value => value.confirmationHeight === height)?.confirmationHeaderIdHex
      ?? height.toString(16).padStart(64, '0');
  const behavior: {
    info(origin: string, call: number): Promise<unknown>;
    bestHeader(origin: string, call: number): Promise<unknown>;
    headers(origin: string, height: number): Promise<unknown>;
    blockHeader(origin: string, id: string): Promise<unknown>;
    slice(origin: string, fromHeight: number, toHeight: number): Promise<unknown>;
  } = {
    info: async (origin, call) => {
      const tip = tips.get(origin)![call] as { height: number; id: string };
      return { network: 'devnet', fullHeight: tip.height, bestFullHeaderId: tip.id };
    },
    bestHeader: async (origin, call) => {
      const tip = tips.get(origin)![call] as { height: number; id: string };
      return { parentId: headerIdAt(tip.height - 1), ...tip };
    },
    headers: async (_origin, height) => membership.has(String(height))
      ? membership.get(String(height))
      : height === held.fullHeight ? [held.headerIdHex]
        : [confirmations.find(value => value.confirmationHeight === height)!.confirmationHeaderIdHex],
    blockHeader: async (_origin, id) => {
      if (!/^[0-9a-f]{64}$/.test(id)) return null;
      const height = id === held.headerIdHex ? held.fullHeight
        : confirmations.find(value => value.confirmationHeaderIdHex === id)?.confirmationHeight
          ?? Number(BigInt(`0x${id}`));
      return Number.isSafeInteger(height) && height > 0 && height <= held.fullHeight && headerIdAt(height) === id
        ? { id, height, parentId: headerIdAt(height - 1) } : null;
    },
    slice: async (origin, fromHeight, toHeight) => {
      const result: unknown[] = [];
      for (let height = fromHeight + 1; height <= toHeight; height++) {
        const id = headerIdAt(height);
        headerCalls.push([origin, id]);
        result.push(await behavior.blockHeader(origin, id));
      }
      return result;
    },
  };
  let active = true;
  let custody = true;
  const owned = vi.fn((value: unknown) => {
    if (!active || value !== target) throw new Error('synthetic target custody lost');
  });
  const assertCustody = vi.fn(() => {
    if (!custody) throw new Error('synthetic signer custody lost');
  });
  const createSource = vi.fn((origin: string) => ({
    beginAuthenticatedTrackerReconstruction: () => beginScope(origin),
    endAuthenticatedTrackerReconstruction: () => endScope(origin),
    getInfo: vi.fn(async () => {
      const call = infoCalls.get(origin) ?? 0; infoCalls.set(origin, call + 1);
      return behavior.info(origin, call);
    }),
    getBestHeader: vi.fn(async () => {
      const call = bestCalls.get(origin) ?? 0; bestCalls.set(origin, call + 1);
      return behavior.bestHeader(origin, call);
    }),
    getBlockHeaderIdsAtHeight: vi.fn(async (height: number) => {
      membershipCalls.push([origin, height]);
      return behavior.headers(origin, height);
    }),
    getBlockHeaderById: vi.fn(async (id: string) => {
      headerCalls.push([origin, id]);
      return behavior.blockHeader(origin, id);
    }),
    getBlockHeaderChainSlice: vi.fn(async (fromHeight: number, toHeight: number) => {
      sliceCalls.push([origin, fromHeight, toHeight]);
      // Old receipt-fault doubles belong to the retained ancestry walk. The
      // separately validated full-state bracket gets a valid native W tuple.
      if (fromHeight === held.fullHeight - 1 && toHeight === held.fullHeight) {
        return [{ id: held.headerIdHex, height: held.fullHeight, parentId: headerIdAt(held.fullHeight - 1) }];
      }
      return behavior.slice(origin, fromHeight, toHeight);
    }),
  }));
  const recordValue = (value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('record required');
    return value;
  };
  const factory = new Function('assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1',
    'createBoundedAuthenticatedSpvTrackerReadOnlySource', 'record', 'parseErgoFullBlockObservationV1', 'assertErgoFullBlockHeaderProofV1',
    `${compiled}\nreturn assertHeldDepositConfirmationsV1;`);
  const helper = factory(owned, createSource, recordValue, parseErgoFullBlockObservationV1, assertErgoFullBlockHeaderProofV1) as HeldConfirmationHelper;
  return { helper, target, held, confirmations, tips, membership, bestCalls, infoCalls, membershipCalls,
    headerCalls, sliceCalls, beginScope, endScope, headerIdAt, behavior, owned, assertCustody, createSource,
    loseActive: () => { active = false; }, loseCustody: () => { custody = false; } };
}

function installHeldSliceFault(h: ReturnType<typeof heldDepositConfirmationHelperFixture>, fault: string) {
  if (fault === 'canonical first') {
    h.membership.set(String(h.confirmations[0]!.confirmationHeight), ['bb'.repeat(32), h.confirmations[0]!.confirmationHeaderIdHex]);
    return;
  }
  if (fault.startsWith('tip ')) {
    const stage = fault.endsWith('before') ? 0 : 1;
    const tip = h.tips.get('witness')![stage] as Record<string, unknown>;
    h.tips.get('witness')![stage] = fault.includes('height') ? { ...tip, height: h.held.fullHeight - 1 }
      : { ...tip, id: 'bb'.repeat(32) };
    return;
  }
  const original = h.behavior.slice;
  h.behavior.slice = async (origin, fromHeight, toHeight) => {
    const raw = await original(origin, fromHeight, toHeight);
    if (!Array.isArray(raw)) throw new Error('invalid slice fault fixture');
    const rows = raw.map(row => ({ ...row as Record<string, unknown> }));
    if (fault === 'malformed') return {};
    if (fault === 'missing') return rows.slice(0, -1);
    if (fault === 'extra') return [...rows, { height: toHeight + 1, id: 'cc'.repeat(32), parentId: h.headerIdAt(toHeight) }];
    if (fault === 'reordered') return rows.reverse();
    if (fault === 'custody') { h.loseCustody(); return rows; }
    if (fault === 'target') { h.loseActive(); return rows; }
    const oldest = rows[0]!;
    if (fault === 'height') oldest.height = Number(oldest.height) + 1;
    else if (fault === 'id') rows[rows.length - 1]!.id = 'bb'.repeat(32);
    else if (fault === 'oldest parent') oldest.parentId = 'BB'.repeat(32);
    else if (fault === 'self parent') oldest.parentId = oldest.id;
    else if (fault === 'paired parent') { if (origin === 'witness') oldest.parentId = 'cc'.repeat(32); }
    else if (fault === 'repeat id') {
      if (rows.length < 5) throw new Error('repeat-ID fixture requires an interior span');
      const repeatedAt = rows.length - 3;
      rows[repeatedAt - 2]!.id = rows[repeatedAt]!.id;
      rows[repeatedAt - 1]!.parentId = rows[repeatedAt]!.id;
    } else if (fault === 'page seam') {
      if (toHeight === 1126) rows[rows.length - 1]!.id = 'bb'.repeat(32);
    } else throw new Error(`unknown slice fault fixture: ${fault}`);
    return rows;
  };
}

describe('held deposit confirmation exact production helper', () => {
  it.each(['issuance', 'payout'] as const)(
    'accepts a canonical %s ancestor when the node retains a sibling fork', async kind => {
      const h = heldDepositConfirmationHelperFixture();
      h.membership.set('80', [h.confirmations[0]!.confirmationHeaderIdHex, 'bb'.repeat(32)]);
      await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, kind))
        .resolves.toBeUndefined();
    });
  it.each(['issuance', 'payout'] as const)('accepts exact held tips and singleton %s membership', async kind => {
    const h = heldDepositConfirmationHelperFixture();
    if (kind === 'issuance') h.confirmations.push(
      Object.freeze({ confirmationHeight: 81, confirmationHeaderIdHex: '22'.repeat(32) }),
      Object.freeze({ confirmationHeight: 82, confirmationHeaderIdHex: '33'.repeat(32) }),
    );
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, kind)).resolves.toBeUndefined();
    expect(h.createSource.mock.calls.map(call => call[0])).toEqual(['primary', 'witness']);
    expect(h.bestCalls).toEqual(new Map([['primary', 2], ['witness', 2]]));
    expect(h.infoCalls).toEqual(new Map([['primary', 2], ['witness', 2]]));
    const fullMembership = [['primary', 100], ['witness', 100]];
    expect(h.membershipCalls).toEqual([...fullMembership, ...[...h.confirmations]
      .sort((a, b) => b.confirmationHeight - a.confirmationHeight)
      .flatMap(value => ['primary', 'witness'].map(origin => [origin, value.confirmationHeight])), ...fullMembership]);
    expect(h.beginScope.mock.calls).toEqual([['primary'], ['witness']]);
    expect(h.endScope.mock.calls).toEqual([['primary'], ['witness']]);
  });

  it.each([
    ['empty confirmations', { confirmations: [] }],
    ['zero confirmation height', { confirmations: [{ confirmationHeight: 0, confirmationHeaderIdHex: '11'.repeat(32) }] }],
    ['future confirmation height', { confirmations: [{ confirmationHeight: 101, confirmationHeaderIdHex: '11'.repeat(32) }] }],
    ['fractional confirmation height', { confirmations: [{ confirmationHeight: 80.5, confirmationHeaderIdHex: '11'.repeat(32) }] }],
    ['short confirmation ID', { confirmations: [{ confirmationHeight: 80, confirmationHeaderIdHex: '11' }] }],
    ['uppercase confirmation ID', { confirmations: [{ confirmationHeight: 80, confirmationHeaderIdHex: 'AA'.repeat(32) }] }],
    ['non-string confirmation ID', { confirmations: [{ confirmationHeight: 80,
      confirmationHeaderIdHex: 1 as unknown as string }] }],
    ['zero held height', { held: { fullHeight: 0, headerIdHex: 'aa'.repeat(32) } }],
    ['short held ID', { held: { fullHeight: 100, headerIdHex: 'aa' } }],
    ['non-string held ID', { held: { fullHeight: 100, headerIdHex: 1 as unknown as string } }],
  ] as const)('rejects %s before node I/O', async (_name, change) => {
    const h = heldDepositConfirmationHelperFixture();
    const held = 'held' in change ? change.held : h.held;
    const confirmations = 'confirmations' in change ? change.confirmations : h.confirmations;
    await expect(h.helper(h.target, held, confirmations, h.assertCustody, 'issuance'))
      .rejects.toThrow('confirmation is not canonical');
    expect(h.createSource).not.toHaveBeenCalled();
  });

  it('rejects conflicting IDs claimed at one height before node I/O', async () => {
    const h = heldDepositConfirmationHelperFixture();
    h.confirmations.push(Object.freeze({ confirmationHeight: 80, confirmationHeaderIdHex: '22'.repeat(32) }));
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'issuance'))
      .rejects.toThrow('confirmation is not canonical');
    expect(h.createSource).not.toHaveBeenCalled();
  });

  it('deduplicates repeated claims with the same height and ID', async () => {
    const h = heldDepositConfirmationHelperFixture();
    h.confirmations.push(Object.freeze({ ...h.confirmations[0]! }));
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'issuance')).resolves.toBeUndefined();
    expect(h.membershipCalls).toEqual([['primary', 100], ['witness', 100],
      ['primary', 80], ['witness', 80], ['primary', 100], ['witness', 100]]);
  });

  it('accepts unsorted distinct receipts and a receipt exactly at the held tip', async () => {
    const h = heldDepositConfirmationHelperFixture();
    h.confirmations.unshift({ confirmationHeight: 100, confirmationHeaderIdHex: h.held.headerIdHex });
    h.confirmations.push({ confirmationHeight: 90, confirmationHeaderIdHex: '33'.repeat(32) });
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'issuance')).resolves.toBeUndefined();
    expect(h.membershipCalls).toEqual([100, 100, 90, 80, 100].flatMap(height => ['primary', 'witness'].map(origin => [origin, height])));
  });

  it.each(['expected second', 'expected absent', 'witness chooses sibling'] as const)(
    'rejects canonical height ordering: %s', async fault => {
      const h = heldDepositConfirmationHelperFixture();
      const expected = h.confirmations[0]!.confirmationHeaderIdHex;
      const original = h.behavior.headers;
      h.behavior.headers = async (origin, height) => height === h.held.fullHeight ? original(origin, height)
        : fault === 'expected second' ? ['bb'.repeat(32), expected]
          : fault === 'expected absent' || origin === 'witness' ? ['bb'.repeat(32)] : [expected];
      await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout')).rejects.toThrow('not canonical');
    });

  it('rejects a claimed first height ID when held ancestry reaches its sibling', async () => {
    const h = heldDepositConfirmationHelperFixture();
    const read = h.behavior.blockHeader;
    h.membership.set('80', [h.confirmations[0]!.confirmationHeaderIdHex, 'bb'.repeat(32)]);
    h.behavior.blockHeader = async (origin, id) => {
      if (id === 'bb'.repeat(32)) return { id, height: 80, parentId: h.headerIdAt(79) };
      const value = await read(origin, id) as Record<string, unknown>;
      return value.height === 81 ? { ...value, parentId: 'bb'.repeat(32) } : value;
    };
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout')).rejects.toThrow('not canonical');
    expect(h.endScope).toHaveBeenCalledTimes(2);
  });

  it.each(['wrong id', 'height jump', 'height plateau', 'height increase', 'missing parent',
    'uppercase parent', 'self parent', 'repeated parent', 'missing header', 'intermediate disagreement',
    'receipt-height disagreement'] as const)('rejects ancestry fault: %s', async fault => {
    const h = heldDepositConfirmationHelperFixture();
    const read = h.behavior.blockHeader;
    h.behavior.blockHeader = async (origin, id) => {
      const value = await read(origin, id) as Record<string, unknown>;
      const at = fault === 'receipt-height disagreement' ? 80 : 90;
      if (value.height !== at || (fault.includes('disagreement') && origin !== 'witness')) return value;
      if (fault === 'missing header') return null;
      if (fault === 'wrong id') return { ...value, id: 'bb'.repeat(32) };
      if (fault === 'height jump') return { ...value, height: at - 1 };
      if (fault === 'height plateau') return { ...value, height: at + 1 };
      if (fault === 'height increase') return { ...value, height: at + 2 };
      if (fault === 'missing parent') return { ...value, parentId: undefined };
      if (fault === 'uppercase parent') return { ...value, parentId: 'BB'.repeat(32) };
      if (fault === 'self parent') return { ...value, parentId: id };
      if (fault === 'repeated parent') return { ...value, parentId: h.held.headerIdHex };
      return { ...value, parentId: 'bb'.repeat(32) };
    };
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout')).rejects.toThrow();
    expect(h.beginScope).toHaveBeenCalledTimes(2); expect(h.endScope).toHaveBeenCalledTimes(2);
  });

  it.each(['custody', 'target'] as const)('rejects %s loss during the ancestry walk', async loss => {
    const h = heldDepositConfirmationHelperFixture();
    const read = h.behavior.blockHeader;
    h.behavior.blockHeader = async (origin, id) => {
      const value = await read(origin, id) as Record<string, unknown>;
      if (value.height === 90 && origin === 'primary') (loss === 'custody' ? h.loseCustody : h.loseActive)();
      return value;
    };
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'issuance')).rejects.toThrow('custody lost');
    expect(h.endScope).toHaveBeenCalledTimes(2);
  });

  it('closes the first bounded scope if the second begin fails', async () => {
    const h = heldDepositConfirmationHelperFixture();
    const failure = new Error('synthetic second begin');
    h.beginScope.mockImplementation(origin => { if (origin === 'witness') throw failure; });
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout')).rejects.toBe(failure);
    expect(h.endScope.mock.calls).toEqual([['primary']]); expect(h.bestCalls.size).toBe(0);
  });

  it.each(['begin', 'end'] as const)('refuses missing bounded scope %s before reads', async missing => {
    const h = heldDepositConfirmationHelperFixture();
    const create = h.createSource.getMockImplementation()!;
    h.createSource.mockImplementation(origin => {
      const client = create(origin);
      return { ...client, [missing === 'begin' ? 'beginAuthenticatedTrackerReconstruction'
        : 'endAuthenticatedTrackerReconstruction']: undefined } as unknown as ReturnType<typeof create>;
    });
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout')).rejects.toThrow('not canonical');
    expect(h.beginScope).not.toHaveBeenCalled(); expect(h.bestCalls.size).toBe(0);
  });

  it.each(['custody', 'target'] as const)('closes a begun scope after immediate %s loss', async loss => {
    const h = heldDepositConfirmationHelperFixture();
    h.beginScope.mockImplementation(() => { (loss === 'custody' ? h.loseCustody : h.loseActive)(); });
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout')).rejects.toThrow('custody lost');
    expect(h.endScope.mock.calls).toEqual([['primary']]); expect(h.bestCalls.size).toBe(0);
  });

  it('drains both ancestry reads before closing either scope after a rejection', async () => {
    const h = heldDepositConfirmationHelperFixture();
    const failure = new Error('synthetic primary ancestry failure');
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.behavior.blockHeader = async origin => {
      if (origin === 'primary') throw failure;
      entered(); await gate;
      return { id: h.held.headerIdHex, height: 100, parentId: h.headerIdAt(99) };
    };
    const pending = h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout');
    await enteredPromise; expect(h.endScope).not.toHaveBeenCalled(); release();
    await expect(pending).rejects.toBe(failure); expect(h.endScope).toHaveBeenCalledTimes(2);
  });

  it('retains the primary failure and drains both scope ends if cleanup also fails', async () => {
    const h = heldDepositConfirmationHelperFixture();
    const primary = new Error('synthetic primary header read');
    const cleanup = new Error('synthetic observation end');
    h.behavior.blockHeader = async () => { throw primary; };
    h.endScope.mockImplementation(origin => { if (origin === 'primary') throw cleanup; });
    const failure = await h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout').catch(value => value);
    expect(failure).toBeInstanceOf(AggregateError); expect(failure.errors).toEqual([primary, cleanup]);
    expect(h.endScope.mock.calls).toEqual([['primary'], ['witness']]);
  });

  it.each(['valid raw fork', 'request budget', 'byte budget', 'original deadline'] as const)(
    'uses the real raw node client and closes its bounded scopes: %s', async scenario => {
      const actual = await vi.importActual<typeof import('../../authenticated-spv-tracker-read-only-node-client.js')>(
        '../../authenticated-spv-tracker-read-only-node-client.js');
      expect(actual.AUTHENTICATED_TRACKER_RECONSTRUCTION_DEADLINE_MS).toBe(120_000);
      const h = heldDepositConfirmationHelperFixture();
      const expected = h.confirmations[0]!.confirmationHeaderIdHex;
      h.membership.set('80', [expected, 'bb'.repeat(32)]);
      const ends: ReturnType<typeof vi.spyOn>[] = [];
      let rawReads = 0;
      let clock = 1_000;
      const createStub = h.createSource.getMockImplementation()!;
      h.createSource.mockImplementation(origin => {
        const client = new actual.AuthenticatedSpvTrackerReadOnlyNodeClient(
          origin === 'primary' ? 'http://127.0.0.1:18551' : 'http://127.0.0.1:18552', {
            now: () => clock,
            ...(scenario === 'request budget' ? { maxReconstructionRequests: 1 } : {}),
            ...(scenario === 'byte budget' ? { maxReconstructionBytes: 100 } : {}),
          });
        let bestCall = 0;
        let infoCall = 0;
        (client as unknown as { client: { defaults: { adapter: unknown } } }).client.defaults.adapter = async (
          config: { url: string; params?: { fromHeight: number; toHeight: number } },
        ) => {
          rawReads++;
          let body: unknown;
          if (config.url === '/info') body = await h.behavior.info(origin, infoCall++);
          else if (config.url === '/blocks/lastHeaders/1') body = [await h.behavior.bestHeader(origin, bestCall++)];
          else if (config.url.startsWith('/blocks/at/')) body = await h.behavior.headers(origin, Number(config.url.slice(11)));
          else if (config.url === '/blocks/chainSlice') {
            const fromHeight = config.params!.fromHeight; const toHeight = config.params!.toHeight;
            const headers: unknown[] = [];
            for (let height = fromHeight + 1; height <= toHeight; height++) {
              headers.push(await h.behavior.blockHeader(origin, h.headerIdAt(height)));
            }
            body = headers;
          }
          else {
            const match = /^\/blocks\/([0-9a-f]{64})\/header$/.exec(config.url);
            if (!match) throw new Error('unexpected raw fixture route');
            body = await h.behavior.blockHeader(origin, match[1]!);
          }
          if (scenario === 'original deadline') clock = 121_001;
          return { data: Buffer.from(JSON.stringify(body)), status: body === null ? 404 : 200,
            statusText: 'synthetic public JSON fixture', headers: { 'content-encoding': 'identity' }, config };
        };
        ends.push(vi.spyOn(client, 'endAuthenticatedTrackerReconstruction'));
        return client as unknown as ReturnType<typeof createStub>;
      });
      const pending = h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'issuance');
      if (scenario === 'valid raw fork') await expect(pending).resolves.toBeUndefined();
      else await expect(pending).rejects.toThrow(/reconstruction/u);
      expect(rawReads).toBeGreaterThan(0); expect(ends).toHaveLength(2);
      for (const end of ends) expect(end).toHaveBeenCalledTimes(1);
    });

  it.each(['issuance', 'payout'] as const)(
    'keeps adjacent valid %s ancestry within the unchanged deadline using bounded slices', async kind => {
      const actual = await vi.importActual<typeof import('../../authenticated-spv-tracker-read-only-node-client.js')>(
        '../../authenticated-spv-tracker-read-only-node-client.js');
      expect(actual.AUTHENTICATED_TRACKER_RECONSTRUCTION_DEADLINE_MS).toBe(120_000);
      const observedCounts: number[] = [];
      for (const heldHeight of [137, 138]) {
        const h = heldDepositConfirmationHelperFixture();
        const headerId = (height: number) => height.toString(16).padStart(64, '0');
        const header = (height: number) => ({ height, id: headerId(height), parentId: headerId(height - 1) });
        const requests = new Map<string, number>();
        const clocks = new Map<string, number>();
        const ends: ReturnType<typeof vi.spyOn>[] = [];
        const createStub = h.createSource.getMockImplementation()!;
        h.createSource.mockImplementation(origin => {
          clocks.set(origin, 0); requests.set(origin, 0);
          const client = new actual.AuthenticatedSpvTrackerReadOnlyNodeClient(
            origin === 'primary' ? 'http://127.0.0.1:18551' : 'http://127.0.0.1:18552', {
              now: () => clocks.get(origin)!,
            });
          (client as unknown as { client: { defaults: { adapter: unknown } } }).client.defaults.adapter = async (
            config: { url: string; params?: { fromHeight: number; toHeight: number } },
          ) => {
            requests.set(origin, requests.get(origin)! + 1);
            let body: unknown;
            if (config.url === '/info') body = { network: 'devnet', fullHeight: heldHeight, bestFullHeaderId: headerId(heldHeight) };
            else if (config.url === '/blocks/lastHeaders/1') body = [header(heldHeight)];
            else if (config.url === '/blocks/at/100') body = [headerId(100), 'bb'.repeat(32)];
            else if (config.url === `/blocks/at/${heldHeight}`) body = [headerId(heldHeight)];
            else if (config.url === '/blocks/chainSlice') {
              expect(config.params!.toHeight).toBe(heldHeight);
              expect([99, heldHeight - 1]).toContain(config.params!.fromHeight);
              body = Array.from({ length: heldHeight - config.params!.fromHeight }, (_, index) => header(config.params!.fromHeight + index + 1));
            } else {
              const match = /^\/blocks\/([0-9a-f]{64})\/header$/.exec(config.url);
              if (!match) throw new Error('unexpected raw ancestry cost fixture route');
              body = header(Number(BigInt(`0x${match[1]!}`)));
            }
            clocks.set(origin, clocks.get(origin)! + 2_900);
            return { data: Buffer.from(JSON.stringify(body)), status: 200,
              statusText: 'synthetic canonical ancestry cost fixture', headers: { 'content-encoding': 'identity' }, config };
          };
          ends.push(vi.spyOn(client, 'endAuthenticatedTrackerReconstruction'));
          return client as unknown as ReturnType<typeof createStub>;
        });
        const confirmations = Array.from({ length: 3 }, () => Object.freeze({
          confirmationHeight: 100, confirmationHeaderIdHex: headerId(100),
        }));
        await expect(h.helper(h.target, { fullHeight: heldHeight, headerIdHex: headerId(heldHeight) },
          confirmations, h.assertCustody, kind)).resolves.toBeUndefined();
        expect(ends).toHaveLength(2);
        for (const end of ends) expect(end).toHaveBeenCalledTimes(1);
        observedCounts.push(requests.get('primary')!, requests.get('witness')!);
      }
      // The old walk passes137 but exceeds120s at138. Both complete tuples now
      // fit the original scope with both new four-GET full-state brackets and
      // the unchanged ancestor slice and receipt membership reads.
      expect(observedCounts).toEqual([10, 10, 10, 10]);
    });

  it.each([1123, 1124, 1125, 2150].flatMap(height =>
    (['issuance', 'payout'] as const).map(kind => [height, kind] as const)))(
    'validates complete bounded slice coverage through height %s for %s', async (height, kind) => {
      const h = heldDepositConfirmationHelperFixture({ heldHeight: height, confirmationHeight: 100 });
      await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, kind)).resolves.toBeUndefined();
      const fullProof: [string, number, number][] = [['primary', height - 1, height], ['witness', height - 1, height]];
      const expected: [string, number, number][] = [...fullProof];
      for (let upper = height; upper >= 100;) {
        const from = Math.max(99, upper - 1024);
        expected.push(['primary', from, upper], ['witness', from, upper]);
        upper = from;
      }
      expect(h.sliceCalls).toEqual([...expected, ...fullProof]);
      expect(h.membershipCalls).toEqual([['primary', height], ['witness', height],
        ['primary', 100], ['witness', 100], ['primary', height], ['witness', height]]);
      expect(h.endScope.mock.calls).toEqual([['primary'], ['witness']]);
    });

  it.each(['malformed', 'missing', 'extra', 'reordered', 'height', 'id', 'oldest parent',
    'self parent', 'paired parent', 'repeat id', 'page seam'].flatMap(fault =>
    (['issuance', 'payout'] as const).map(kind => [fault, kind] as const)))(
    'rejects the isolated %s slice fault in %s ancestry', async (fault, kind) => {
      const h = heldDepositConfirmationHelperFixture(fault === 'page seam'
        ? { heldHeight: 2150, confirmationHeight: 100 } : {});
      installHeldSliceFault(h, fault);
      await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, kind)).rejects.toThrow('not canonical');
      expect(h.endScope.mock.calls).toEqual([['primary'], ['witness']]);
    });

  it.each(['custody', 'target'] as const)('closes both scopes after %s loss at a range boundary', async fault => {
    const h = heldDepositConfirmationHelperFixture({ heldHeight: 2150, confirmationHeight: 100 });
    installHeldSliceFault(h, fault);
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'issuance')).rejects.toThrow('custody lost');
    expect(h.sliceCalls).toHaveLength(4);
    expect(h.endScope.mock.calls).toEqual([['primary'], ['witness']]);
  });

  it.each([
    { fault: 'extra', needle: 'raw.length !== expectedLength', replacement: 'false' },
    { fault: 'height', needle: 'header.height !== height', replacement: 'false' },
    { fault: 'id', needle: 'header.id !== currentId', replacement: 'false' },
    { fault: 'oldest parent', needle: "typeof header.parentId !== 'string' || !/^[0-9a-f]{64}$/.test(header.parentId)", replacement: 'false' },
    { fault: 'self parent', needle: 'header.parentId === currentId', replacement: 'false' },
    { fault: 'paired parent', needle: 'pair[0] !== pair[1]', replacement: 'false' },
    { fault: 'repeat id', needle: 'visited.has(currentId)', replacement: 'false' },
    { fault: 'page seam', needle: 'header.id !== currentId', replacement: 'false' },
    { fault: 'canonical first', needle: 'headers[0] !== confirmationId', replacement: 'false' },
    { fault: 'custody', needle: 'assertCustody();', replacement: '' },
    { fault: 'tip height before', needle: 'observation.fullHeight !== held.fullHeight', replacement: 'false' },
    { fault: 'tip height after', needle: 'observation.fullHeight !== held.fullHeight', replacement: 'false' },
    { fault: 'tip id before', needle: 'observation.fullHeaderIdHex !== held.headerIdHex', replacement: 'false' },
    { fault: 'tip id after', needle: 'observation.fullHeaderIdHex !== held.headerIdHex', replacement: 'false' },
  ].flatMap(rule => (['issuance', 'payout'] as const).map(kind => [rule.fault, kind, rule] as const)))(
    'isolates the %s guard in %s ancestry with an independently checked mutant and valid twin', async (_fault, kind, rule) => {
      const options = rule.fault === 'page seam' ? { heldHeight: 2150, confirmationHeight: 100 } : {};
      const original = heldDepositConfirmationHelperFixture(options);
      installHeldSliceFault(original, rule.fault);
      await expect(original.helper(original.target, original.held, original.confirmations, original.assertCustody, kind))
        .rejects.toThrow(rule.fault === 'custody' ? 'custody lost' : 'not canonical');
      expect(original.endScope).toHaveBeenCalledTimes(2);
      const mutant = heldDepositConfirmationHelperFixture({ ...options, rewrite: source => {
        // Source mutation and fixture construction are outside the rejection assertion.
        expect(source.split(rule.needle)).toHaveLength(2);
        return source.replace(rule.needle, rule.replacement);
      } });
      installHeldSliceFault(mutant, rule.fault);
      if (rule.fault.startsWith('tip ')) {
        // Omitting this early guard now reaches the independently strict proof.
        // A second check must not be weakened to recover obsolete acceptance.
        await expect(mutant.helper(mutant.target, mutant.held, mutant.confirmations, mutant.assertCustody, kind)).rejects.toThrow();
        const fullCalls = (h: typeof mutant) => h.membershipCalls.filter(([origin, height]) => origin === 'witness' && height === h.held.fullHeight).length;
        expect(fullCalls(mutant)).toBe(fullCalls(original) + 1);
        const proofCalls = (h: typeof mutant) => h.sliceCalls.filter(([origin, from]) => origin === 'witness' && from === h.held.fullHeight - 1).length;
        expect(proofCalls(mutant)).toBe(proofCalls(original) + 1);
      } else {
        await expect(mutant.helper(mutant.target, mutant.held, mutant.confirmations, mutant.assertCustody, kind)).resolves.toBeUndefined();
      }
      expect(mutant.endScope).toHaveBeenCalledTimes(2);
      const twin = heldDepositConfirmationHelperFixture(options);
      await expect(twin.helper(twin.target, twin.held, twin.confirmations, twin.assertCustody, kind))
        .resolves.toBeUndefined();
      expect(twin.endScope).toHaveBeenCalledTimes(2);
    });

  it.each(['malformed', 'missing', 'extra', 'wrong'] as const)(
    'rejects %s prior-confirmation membership', async fault => {
      const h = heldDepositConfirmationHelperFixture();
      h.membership.set('80', fault === 'malformed' ? null : fault === 'missing' ? []
        : fault === 'extra' ? ['11'.repeat(32), '11'.repeat(32)] : ['22'.repeat(32)]);
      await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout')).rejects.toThrow();
    });

  it.each([81, 82] as const)('rejects a wrong distinct issuance header at height %s', async height => {
    const h = heldDepositConfirmationHelperFixture();
    h.confirmations.push(
      Object.freeze({ confirmationHeight: 81, confirmationHeaderIdHex: '22'.repeat(32) }),
      Object.freeze({ confirmationHeight: 82, confirmationHeaderIdHex: '33'.repeat(32) }),
    );
    h.membership.set(String(height), ['44'.repeat(32)]);
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'issuance'))
      .rejects.toThrow('confirmation is not canonical');
  });

  it.each((['before', 'after'] as const).flatMap(stage => (['primary', 'witness'] as const)
    .flatMap(role => (['height', 'header'] as const).map(field => ({ stage, role, field }))))) (
    'rejects $role $field tip drift $stage membership reads', async ({ stage, role, field }) => {
    const h = heldDepositConfirmationHelperFixture();
    const call = stage === 'before' ? 0 : 1;
    h.tips.get(role)![call] = field === 'height'
      ? { height: 101, id: 'aa'.repeat(32), parentId: h.headerIdAt(h.held.fullHeight - 1) }
      : { height: 100, id: 'bb'.repeat(32) };
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout'))
      .rejects.toThrow('confirmation is not canonical');
    expect(h.membershipCalls.filter(([, height]) => height === 80)).toHaveLength(stage === 'before' ? 0 : 2);
    expect(h.membershipCalls.filter(([, height]) => height === 100)).toHaveLength(stage === 'before' ? 1 : 3);
  });

  it.each(['custody', 'target'] as const)('rejects pre-entry %s loss before node I/O', async loss => {
    const h = heldDepositConfirmationHelperFixture();
    (loss === 'custody' ? h.loseCustody : h.loseActive)();
    await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout'))
      .rejects.toThrow(loss === 'custody' ? 'signer custody lost' : 'target custody lost');
    expect(h.createSource).not.toHaveBeenCalled();
  });

  it.each((['best-header', 'membership'] as const).flatMap(stage =>
    (['custody', 'target'] as const).map(loss => ({ stage, loss }))))(
    'rejects $loss loss across a $stage await', async ({ stage, loss }) => {
      const h = heldDepositConfirmationHelperFixture();
      const lose = loss === 'custody' ? h.loseCustody : h.loseActive;
      if (stage === 'best-header') {
        const original = h.behavior.bestHeader;
        h.behavior.bestHeader = async (origin, call) => {
          const value = await original(origin, call); if (origin === 'primary' && call === 0) lose(); return value;
        };
      } else {
        const original = h.behavior.headers;
        h.behavior.headers = async (origin, height) => {
          const value = await original(origin, height); if (origin === 'primary' && height !== h.held.fullHeight) lose(); return value;
        };
      }
      await expect(h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout'))
        .rejects.toThrow(loss === 'custody' ? 'signer custody lost' : 'target custody lost');
    });

  it('drains paired membership reads and propagates the original rejection', async () => {
    const h = heldDepositConfirmationHelperFixture();
    const trigger = new Error('synthetic primary membership read failed');
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = h.behavior.headers;
    h.behavior.headers = async (origin, height) => {
      if (height === h.held.fullHeight) return original(origin, height);
      if (origin === 'primary') throw trigger;
      entered(); await gate; return ['11'.repeat(32)];
    };
    const pending = h.helper(h.target, h.held, h.confirmations, h.assertCustody, 'payout');
    await enteredPromise;
    let settled = false;
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(settled).toBe(false);
    release();
    await expect(pending).rejects.toBe(trigger);
  });
});

describe('fresh FED target composition', () => {
  for (const second of [false, true]) {
    const cycle = second ? 'continuation' : 'first';
    it.each(['reserve/withdrawal-fee', 'withdrawal-fee/tracker-fee'] as const)
      (`isolates ${cycle} helper duplicate %s below checked funding with a guard mutant`, async relation => {
        for (const omit of [false, true]) {
          const h = admissionHelperFixture(second, omit ? 'distinct-transactions' : undefined);
          if (relation === 'reserve/withdrawal-fee') h.request.withdrawalFee.expectedTxId = h.request.reserve.expectedTxId;
          else h.request.trackerFee.expectedTxId = h.request.withdrawalFee.expectedTxId;
          if (omit) {
            await expect(h.helper(h.request)).resolves.toBe(h.height);
            expect(h.fresh).toHaveBeenCalledTimes(3);
            expect(h.revalidate).toHaveBeenCalledOnce();
          } else {
            await expect(h.helper(h.request)).rejects.toThrow('reserve and fee transactions are not distinct');
            expect(h.fresh).not.toHaveBeenCalled();
            expect(h.revalidate).not.toHaveBeenCalled();
          }
          expect(h.pause).toHaveBeenCalledOnce();
        }
      });

    it.each(['withdrawalFee', 'trackerFee'] as const)
      (`isolates ${cycle} helper prior and fresh %s above the paused tip with a guard mutant`, async fee => {
        for (const omit of [false, true]) {
          const h = admissionHelperFixture(second, omit ? 'prior-height' : undefined);
          const prior = h.request[fee];
          const originalHeader = prior.confirmationHeaderIdHex;
          const originalTxId = prior.expectedTxId;
          prior.confirmationHeight = h.height + 1;
          if (omit) {
            await expect(h.helper(h.request)).resolves.toBe(h.height);
            expect(h.fresh).toHaveBeenCalledTimes(3);
            expect(h.revalidate).toHaveBeenCalledOnce();
          } else {
            await expect(h.helper(h.request)).rejects.toThrow('admission window does not follow unchanged reserve and fee confirmations');
            expect(h.fresh).toHaveBeenCalledTimes(fee === 'withdrawalFee' ? 2 : 3);
            expect(h.revalidate).not.toHaveBeenCalled();
          }
          const observed = h.fresh.mock.results[fee === 'withdrawalFee' ? 1 : 2]!.value;
          await expect(observed).resolves.toEqual({ status: 'confirmed', observedAtHeight: h.height,
            confirmationHeight: h.height + 1, confirmationHeaderIdHex: originalHeader });
          expect(prior.expectedTxId).toBe(originalTxId);
          expect(h.pause).toHaveBeenCalledOnce();
        }
      });
  }

  it.each([false, undefined, null, 0, 1, 'true', [], {}])(
    'rejects an invalid root confirmation progress opt-in %j before custody', async value => {
      const candidate = { ...input, captureCommittedReserveConfirmationProgress: value } as unknown as RunSubstrateFederatedGenesisTargetRootV1Input;
      await expect(runSubstrateFederatedGenesisTargetRootV1(candidate))
        .rejects.toThrow('confirmation progress option must be true or omitted');
      expect(mocked.frontier).not.toHaveBeenCalled();
      expect(mocked.ergoBuild).not.toHaveBeenCalled();
      expect(mocked.process).not.toHaveBeenCalled();
    });
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

  function assertPausedAdmissionHeldBeforeAttestation(second: boolean) {
    expect(mocked.checkpoint).toHaveBeenCalledTimes(second ? 1 : 0);
    expect(mocked.anchor).toHaveBeenCalledTimes(second ? 1 : 0);
    expect(order).not.toContain(second ? 'secondAnchor-phase' : 'anchor-phase');
    expect(mocked.continuationContext).not.toHaveBeenCalled();
    assertDownstreamCleanup();
  }

  for (const second of [false, true]) {
    const cycle = second ? 'continuation' : 'first';
    it.each(['pause rejection', 'foreign target', 'revalidation rejection', 'copied observation'] as const)
      (`holds ${cycle} checkpoint before attestation on %s`, async fault => {
        const priorCalls = second ? 1 : 0;
        const consume = fault === 'pause rejection' || fault === 'foreign target' ? mocked.pause : mocked.pauseRevalidate;
        const original = consume.getMockImplementation()!;
        const failure = new Error(`${cycle} pause boundary rejected`);
        consume.mockImplementation(async (...args) => {
          const selected = args[0] === (second ? phaseTargets.confirmation : target);
          if (!selected) return original(...args);
          if (fault === 'pause rejection' || fault === 'revalidation rejection') throw failure;
          if (fault === 'foreign target') return original({ ...args[0] });
          return original(args[0], { ...args[1] });
        });
        const caught = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
        if (fault === 'pause rejection' || fault === 'revalidation rejection') expect(caught).toBe(failure);
        else expect(caught.message).toContain(fault === 'foreign target'
          ? 'not the original active target' : 'not bound to the original target');
        expect(mocked.pause).toHaveBeenCalledTimes(priorCalls + 1);
        expect(mocked.pauseRevalidate).toHaveBeenCalledTimes(priorCalls
          + Number(fault === 'revalidation rejection' || fault === 'copied observation'));
        assertPausedAdmissionHeldBeforeAttestation(second);
      });

    const purposes = second ? ['reserve', 'withdrawal-fee', 'tracker-fee'] as const
      : ['withdrawal-fee', 'tracker-fee'] as const;
    for (const purpose of purposes) {
      it.each(['height', 'header', 'observed height'] as const)
        (`rejects ${cycle} fresh ${purpose} %s drift before checkpoint attestation`, async fault => {
          const original = mocked.wait.getMockImplementation()!;
          const prefix = second ? 'native-continuation-checkpoint-admission' : 'native-checkpoint-admission';
          const selectedStage = `${prefix}${purpose === 'reserve' ? '' : `-${purpose}`}`;
          mocked.wait.mockImplementation(async (...args) => {
            const value = await original(...args);
            if (args[3] !== selectedStage) return value;
            return fault === 'height' ? { ...value, confirmationHeight: value.confirmationHeight - 1 }
              : fault === 'header' ? { ...value, confirmationHeaderIdHex: 'ff'.repeat(32) }
                : { ...value, observedAtHeight: value.observedAtHeight - 1 };
          });
          await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('admission window does not follow');
          expect(mocked.pauseRevalidate).toHaveBeenCalledTimes(second ? 1 : 0);
          expect(mocked.wait.mock.calls.filter(args => args[3] === selectedStage)).toHaveLength(1);
          assertPausedAdmissionHeldBeforeAttestation(second);
        });
    }
  }

  it.each(['checkpoint', 'withdrawalFeeCheck', 'trackerCheck', 'payoutCheck'] as const)
    ('does not convert a JSON copy of %s into continuation authority', async stage => {
      const original = mocked[stage].getMockImplementation()!;
      mocked[stage].mockImplementation(async (...args) => JSON.parse(JSON.stringify(await original(...args))));
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow();
      expect(mocked.payoutConfirm).not.toHaveBeenCalled(); assertDownstreamCleanup();
    });

  for (const stage of ['anchor', 'trackerCheck', 'trackerFreshness', 'trackerSubmit'] as const) {
    it.each(['source', 'setup', 'operator', 'operation'] as const)(`holds the native return after %s disposal at awaited ${stage}`, async owner => {
      const original = mocked[stage].getMockImplementation()!;
      mocked[stage].mockImplementation(async (...args) => {
        const value = await original(...args);
        if (owner === 'source') source!.dispose();
        if (owner === 'setup') setup!.dispose();
        if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
        if (owner === 'operation') {
          sourceOperation!.dispose();
          expect(() => sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!)).not.toThrow();
        }
        return value;
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/disposed|active process provenance/);
      expect(mocked[stage]).toHaveBeenCalledOnce(); expect(mocked.payoutCheck).not.toHaveBeenCalled();
      if (stage === 'trackerSubmit') expect(mocked.trackerFinalize).toHaveBeenCalledOnce();
      assertDownstreamCleanup();
    });
  }

  it.each(['payoutCheck', 'payoutAuthorize'] as const)
    ('holds first payout after original operation disposal at awaited %s while setup custody remains retained', async stage => {
      const original = mocked[stage].getMockImplementation()!;
      mocked[stage].mockImplementation(async (...args) => {
        const value = await original(...args);
        expect(() => assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer))
          .not.toThrow();
        sourceOperation!.dispose();
        expect(() => sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!)).not.toThrow();
        return value;
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/operation is disposed/);
      expect(mocked[stage]).toHaveBeenCalledOnce();
      if (stage === 'payoutCheck') expect(mocked.payoutAuthorize).not.toHaveBeenCalled();
      expect(mocked.payoutReserve).not.toHaveBeenCalled(); expect(mocked.payoutSubmit).not.toHaveBeenCalled();
      assertDownstreamCleanup();
    });

  it.each(['native-tracker-admission', 'native-withdrawal'] as const)
    ('rejects operation disposal on successful %s wait before recording confirmation', async stage => {
      const original = mocked.wait.getMockImplementation()!;
      mocked.wait.mockImplementation(async (...args) => {
        const value = await original(...args);
        if (args[3] === stage) {
          sourceOperation!.dispose();
          expect(() => sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!)).not.toThrow();
        }
        return value;
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/operation is disposed/);
      expect(mocked[stage === 'native-tracker-admission' ? 'trackerConfirm' : 'payoutConfirm']).not.toHaveBeenCalled();
      if (stage === 'native-tracker-admission') expect(mocked.payoutCheck).not.toHaveBeenCalled();
      else { expect(mocked.payoutSubmit).toHaveBeenCalledOnce(); expect(mocked.payoutFinalize).toHaveBeenCalledOnce(); }
      assertDownstreamCleanup();
    });

  it.each(['source', 'operator', 'operation'] as const)('records the payout response then holds confirmation after %s disposal', async owner => {
    const original = mocked.payoutSubmit.getMockImplementation()!;
    mocked.payoutSubmit.mockImplementation(async (...args) => {
      const value = await original(...args);
      if (owner === 'source') source!.dispose();
      else if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
      else {
        sourceOperation!.dispose();
        expect(() => sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!)).not.toThrow();
      }
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

  it.each(['absent', 'foreign'] as const)('holds second admission when the continuation tracker rejects an %s predecessor', async fault => {
    if (fault === 'absent') {
      mocked.context.mockImplementationOnce(async value => {
        await Promise.resolve(); expect(value.trackerInputBox).toBe(compiled.issuance.orderedTransactions[0].transaction.outputs[0]);
        returnValues.context = undefined; return undefined;
      });
    }
    mocked.continuationContext.mockImplementationOnce(async value => {
      expect(value.previousContext).toBe(fault === 'absent' ? undefined : returnValues.context);
      throw new Error(`substrate federated tracker V2 continuation ${fault === 'absent' ? 'previous context is required' : 'parent differs'}`);
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(
      fault === 'absent' ? /previous context is required/ : /parent differs/,
    );
    expect(mocked.continuationTrackerCheck).not.toHaveBeenCalled();
    expect(mocked.continuationPayoutCheck).not.toHaveBeenCalled(); assertDownstreamCleanup();
  });

  it.each(['withdrawal', 'tracker'] as const)('holds the second anchor until the second %s fee is confirmed', async purpose => {
    const execute = mocked[`${purpose}Fee`]; const original = execute.getMockImplementation()!;
    execute.mockImplementation(async (...args) => {
      const value = await original(...args);
      return args[0].checked === returnValues[`continuation${purpose[0]!.toUpperCase()}${purpose.slice(1)}FeeCheck`]
        ? { ...value, confirmationHeight: null } : value;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('external fee funding lacks canonical confirmation');
    expect(mocked.anchor).toHaveBeenCalledOnce(); expect(order).not.toContain('secondAnchor-phase');
    expect(mocked.continuationPayoutCheck).not.toHaveBeenCalled(); assertDownstreamCleanup();
  });

  it('fails closed when retained source custody is lost during the second anchor await', async () => {
    const original = mocked.anchor.getMockImplementation()!;
    mocked.anchor.mockImplementation(async (...args) => {
      const value = await original(...args);
      if (args[0].target === phaseTargets.secondAnchor) continuationSourceOperation!.dispose();
      return value;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/operation is disposed/);
    expect(mocked.anchor).toHaveBeenCalledTimes(2); expect(mocked.continuationContext).not.toHaveBeenCalled();
    expect(mocked.continuationPayoutCheck).not.toHaveBeenCalled(); assertDownstreamCleanup();
  });

  it('preserves a first-return failure when continuation operation cleanup also fails', async () => {
    const primary = new Error('continuation reservation failed');
    const cleanup = new Error('continuation operation cleanup failed');
    const create = vi.mocked(sources.createSubstrateFederatedNativeGenesisSourceAttestationOperationV1)
      .getMockImplementation()!;
    const assertOperation = vi.mocked(sources.assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1)
      .getMockImplementation()!;
    let created = 0;
    let backing: ReturnType<typeof makeSourceOperation> | undefined;
    let wrapper: ReturnType<typeof makeSourceOperation> | undefined;
    vi.mocked(sources.createSubstrateFederatedNativeGenesisSourceAttestationOperationV1)
      .mockImplementation(value => {
        const operation = create(value);
        created += 1;
        if (created !== 2) return operation;
        backing = operation;
        wrapper = Object.freeze({ dispose: () => { throw cleanup; } });
        continuationSourceOperation = wrapper;
        return wrapper;
      });
    vi.spyOn(sources, 'assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1')
      .mockImplementation((operation, session) => assertOperation(operation === wrapper ? backing! : operation, session));
    mocked.continuationReservation.mockRejectedValueOnce(primary);
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toEqual([primary, cleanup]);
    expect(mocked.continuationReservation).toHaveBeenCalledOnce();
    expect(mocked.continuationMintBurn).not.toHaveBeenCalled();
    assertDownstreamCleanup();
  });

  it('retains a pending second payout attempt without retry or a two-cycle success result', async () => {
    const original = mocked.wait.getMockImplementation()!;
    mocked.wait.mockImplementation(async (...args) => {
      if (args[3] === 'native-continuation-withdrawal') {
        throw new Error('native continuation payout confirmation pending; retained attempt');
      }
      return original(...args);
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('continuation payout confirmation pending');
    expect(mocked.payoutSubmit).toHaveBeenCalledTimes(2); expect(mocked.payoutFinalize).toHaveBeenCalledTimes(2);
    expect(mocked.payoutConfirm).toHaveBeenCalledOnce(); expect(closeNative).toHaveBeenCalledTimes(2);
    assertDownstreamCleanup();
  });

  it.each(['status', 'transaction', 'height', 'header'] as const)(
    'does not report two completed cycles when terminal second payout %s is not canonical', async fault => {
    const original = mocked.payoutConfirm.getMockImplementation()!;
    mocked.payoutConfirm.mockImplementation(async (...args) => {
      const value = await original(...args);
      if (args[0] !== returnValues.secondPayoutAttempt) return value;
      return fault === 'status' ? { ...value, status: 'pending' }
        : fault === 'transaction' ? { ...value, expectedTxId: '00'.repeat(32) }
        : fault === 'height' ? { ...value, confirmationHeight: null }
        : { ...value, confirmationHeaderId: null };
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(
      'FED continuation return lacks its exact canonical payout',
    );
    expect(mocked.payoutConfirm).toHaveBeenCalledTimes(2); expect(mocked.continuationPayoutCheck).toHaveBeenCalledOnce();
    expect(() => assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer))
      .toThrow(/active process provenance/);
    assertDownstreamCleanup();
  });

  it('retains an ambiguous second tracker transport without retry or checking the second payout', async () => {
    const originalSubmission = mocked.trackerSubmit.getMockImplementation()!;
    mocked.trackerSubmit.mockImplementation(async (...args) => {
      const value = await originalSubmission(...args);
      if (args[1] !== returnValues.secondTrackerAttempt) return value;
      returnValues.secondTrackerSubmission = Object.freeze({ ...value, status: 'ambiguous' });
      return returnValues.secondTrackerSubmission;
    });
    const failure = new Error('second tracker confirmation pending; retained ambiguous attempt');
    const originalWait = mocked.wait.getMockImplementation()!;
    mocked.wait.mockImplementation(async (...args) => {
      if (args[3] === 'native-continuation-tracker-admission') throw failure;
      return originalWait(...args);
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toBe(failure);
    expect(mocked.trackerSubmit).toHaveBeenCalledTimes(2);
    expect(mocked.trackerFinalize).toHaveBeenCalledTimes(2);
    expect(order.filter(value => value === 'secondTrackerSubmit')).toHaveLength(1);
    expect(order.filter(value => value === 'secondTrackerFinalize')).toHaveLength(1);
    expect(mocked.trackerConfirm).toHaveBeenCalledOnce();
    expect(mocked.continuationPayoutCheck).not.toHaveBeenCalled();
    expect(mocked.payoutSubmit).toHaveBeenCalledOnce();
    assertDownstreamCleanup();
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

  it.each([false, true])('binds retained custody, actual component handles and both target views, then disposes them with progress %s', async capture => {
    if (capture) input = { ...input, captureCommittedReserveConfirmationProgress: true };
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    for (const call of [mocked.committedVault, mocked.continuationVault]) {
      expect(call).toHaveBeenCalledOnce();
      expect(Object.hasOwn(call.mock.calls[0]![0], 'captureConfirmationProgress')).toBe(capture);
      if (capture) expect(call.mock.calls[0]![0].captureConfirmationProgress).toBe(true);
    }
    expect(result.status).toBe('fresh-federated-round-trip-confirmed');
    expect(result.nativeGenesisHashHex).toBe(genesis);
    expect(result.operatorAddressHex).toBe(operator!.addressHex);
    expect(result.issuanceInputBoxIds).toEqual(discovery.observation.genesisBoxIds);
    expect(result.unsignedIssuance).toEqual(compiled.issuance.orderedTransactions.map(({ role, transaction }: any) => ({
      role, transactionIdHex: transaction.txId, predictedSingletonBoxIdHex: transaction.outputs[0].boxId,
    })));
    expect(result.singletonIssuanceEstablished).toBe(true); expect(result.operationalMintEstablished).toBe(true);
    expect(result.canonicalPayoutEstablished).toBe(true); expect(result.withdrawal.payout.amountNanoErg).toBe('10000000');
    expect(result.completedCycles).toBe(2); expect(result.secondCycle.payout.amountNanoErg).toBe('10000000');
    expect(result.secondCycle.mint).toBe(continuationExecution.mint); expect(result.secondCycle.burn).toBe(continuationExecution.burn);
    expect(result.secondCycle.feeFunding.withdrawal.feeInputBoxIdHex).toBe(returnValues.secondWithdrawalFee.feeInputBox.boxId);
    expect(result.secondCycle.feeFunding.tracker.feeInputBoxIdHex).toBe(returnValues.secondTrackerFee.feeInputBox.boxId);
    expect(result.sourceFinalityEstablished).toBe(false); expect(result.trustless).toBe(false);
    expect(result.recoveryEvidence).toEqual({
      buildDirectoryName: 'bridge-fed-genesis-Ab3D4e',
      directoryName: 'two-cycle-recovery-Ab3D4e', manifestSha256Hex: 'ab'.repeat(32),
    });
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
    expect(readdirSync(builtTargetDirectory).filter(name => name.startsWith('issuance-journal-'))).toHaveLength(1);
    expect(result.storageKeysChecked).toBe(6); expect(Object.isFrozen(result)).toBe(true);
    expect(order).toEqual(['setup', 'source', 'operator', 'frontier-build', 'ergo-build', 'process', 'mine',
      'discover', 'history', 'compile', 'materialize', 'nodes', 'check', 'execute',
      ...downstreamStages, 'withdrawalFeeCheck', 'withdrawalFee', 'trackerFeeCheck', 'trackerFee', 'pause',
      'native-checkpoint-admission', 'native-checkpoint-admission-withdrawal-fee', 'native-checkpoint-admission-tracker-fee',
      'pauseRevalidate', 'checkpoint',
      'anchor-phase', 'anchor', 'frozen-phase', 'frozenObservation', 'context', 'trackerTx', 'trackerCheck', 'trackerAuthorize', 'trackerReserve',
      'freshness-phase', 'trackerFreshness', 'transport-phase', 'trackerSubmit', 'trackerFinalize', 'confirmation-phase', 'trackerConfirm',
      'payoutCheck', 'payoutAuthorize', 'payoutReserve', 'payoutSubmit', 'payoutFinalize', 'payoutConfirm',
      'continuationFunding', 'continuationPacket', 'continuationSourceLock', 'continuationVault', 'continuationDraft',
      'continuationEvidence', 'continuationProof', 'continuationReservation', 'continuationMintBurn',
      'continuationWithdrawalFeeCheck', 'secondWithdrawalFee', 'continuationTrackerFeeCheck', 'secondTrackerFee',
      'miningAuthority', 'secondPause', 'native-continuation-checkpoint-admission',
      'native-continuation-checkpoint-admission-withdrawal-fee', 'native-continuation-checkpoint-admission-tracker-fee',
      'secondPauseRevalidate', 'continuationCheckpoint', 'readOnly-phase', 'continue-cycle',
      'secondAnchor-phase', 'secondAnchor', 'secondFrozen-phase', 'secondFrozenObservation', 'continuationContext',
      'secondTrackerTx', 'continuationTrackerCheck', 'secondTrackerAuthorize', 'secondTrackerReserve',
      'secondFreshness-phase', 'secondTrackerFreshness', 'secondTransport-phase', 'secondTrackerSubmit',
      'secondTrackerFinalize', 'secondConfirmation-phase', 'secondTrackerConfirm', 'continuationPayoutCheck',
      'secondPayoutAuthorize', 'secondPayoutReserve', 'secondPayoutSubmit', 'secondPayoutFinalize', 'secondPayoutConfirm',
      'recovery-capture', 'nodes-stop', 'stop']);
    expect(nativeAction).toHaveBeenCalledTimes(3);
    expect(mocked.pause.mock.calls).toEqual([[target], [phaseTargets.confirmation]]);
    expect(mocked.hold.mock.calls).toEqual([[target], [phaseTargets.confirmation]]);
    expect(mocked.pauseRevalidate.mock.calls).toEqual([[target, returnValues.pause],
      [phaseTargets.confirmation, returnValues.secondPause]]);
    expect(mocked.wait.mock.calls.filter(args => args[3].includes('checkpoint-admission')).map(args => [args[1], args[3]]))
      .toEqual([[committedVault.expectedTxId, 'native-checkpoint-admission'],
        [returnValues.withdrawalFee.expectedTxId, 'native-checkpoint-admission-withdrawal-fee'],
        [returnValues.trackerFee.expectedTxId, 'native-checkpoint-admission-tracker-fee'],
        [continuationVault.expectedTxId, 'native-continuation-checkpoint-admission'],
        [returnValues.secondWithdrawalFee.expectedTxId, 'native-continuation-checkpoint-admission-withdrawal-fee'],
        [returnValues.secondTrackerFee.expectedTxId, 'native-continuation-checkpoint-admission-tracker-fee']]);
    expect(closeNative).toHaveBeenCalledTimes(2);
    expect(result.frontierProcess).toEqual({ component: 'FED process stub' });
    expect(calls.filter(call => call.method === 'state_getStorage')).toHaveLength(28);
    expect(new Set(calls.map(call => call.url))).toEqual(new Set([PRIMARY, WITNESS]));
    expect(mocked.pin).toHaveBeenCalledTimes(2); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    assertDownstreamPrefix('mint'); assertDownstreamCleanup();
    expect(mocked.fundingOwned).toHaveBeenCalledTimes(2);
    expect(mocked.frontierOwned).toHaveBeenCalledWith(frontierEndpoints);
    expect(readdirSync(journalDirectory).filter(name => name.startsWith('native-mint-'))).toHaveLength(1);
  });

  it('returns only public receipt data, never portable custody or downstream handles', async () => {
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(Object.keys(result).sort()).toEqual(['status', 'nativeGenesisHashHex', 'frontierProcess',
      'typedGenesisSha256Hex', 'rawSpecSha256Hex', 'runtimeProfileIdHex', 'familyIdHex', 'sourceProofProfileIdHex',
      'nodeSha256Hex', 'wasmSha256Hex', 'operatorAddressHex', 'storageKeysChecked', 'issuanceInputBoxIds',
      'issuedTransactions', 'pegIn', 'mint', 'unsignedIssuance', 'ergoExecution', 'singletonIssuanceEstablished',
      'operationalMintEstablished', 'sourceFinalityEstablished', 'trustless', 'burn', 'withdrawal', 'canonicalPayoutEstablished',
      'completedCycles', 'secondCycle', 'recoveryEvidence'].sort());
    const privateHandles = new Set([setup, retainedSetup, source, operator, miningCredential, target,
      ...Object.values(phaseTargets),
      frontierEndpoints, batch, compiled, funding, packet, sourceLock, sourceLock.outputObservation,
      committedVault, committedVault.outputObservation, draftInputs, draft, evidence, proof, journalState,
      continuationFunding, continuationPacket, continuationSourceLock, continuationSourceLock.outputObservation,
      continuationVault, continuationVault.outputObservation, continuationDraftInputs, continuationDraft,
      continuationEvidence, continuationProof, continuationReservation, continuationExecution,
      continuationMiningAuthority, continuationSourceOperation]);
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

  it('withholds a successful round trip when the stopped-state capture fails', async () => {
    const failure = new Error('stopped-state capture failed');
    mocked.recovery.mockRejectedValueOnce(failure);
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toBe(failure);
    expect(mocked.recovery).toHaveBeenCalledOnce();
    expect(mocked.payoutConfirm).toHaveBeenCalledTimes(2);
    assertDownstreamCleanup();
  });

  it.each(['first', 'second'] as const)(
    'refuses a %s tracker admission without a confirmed header before recovery capture',
    async cycle => {
      const original = mocked.trackerConfirm.getMockImplementation()!;
      let calls = 0;
      mocked.trackerConfirm.mockImplementation(async (...args) => {
        const value = await original(...args);
        calls += 1;
        return calls === (cycle === 'first' ? 1 : 2)
          ? { ...value, confirmationHeaderId: null } : value;
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input))
        .rejects.toThrow('FED recovery capture requires two exact confirmed tracker admissions');
      expect(mocked.recovery).not.toHaveBeenCalled();
      assertDownstreamCleanup();
    },
  );

  it('keeps native ownership through the payout and awaits its final cleanup receipt', async () => {
    let releaseCleanup!: () => void;
    let cleanupEntered!: () => void;
    const entered = new Promise<void>(resolve => { cleanupEntered = resolve; });
    const held = new Promise<void>(resolve => { releaseCleanup = resolve; });
    const confirm = mocked.payoutConfirm.getMockImplementation()!;
    mocked.payoutConfirm.mockImplementation(async (...args) => {
      expect(frontierActive).toBe(true);
      expect(order).not.toContain('nodes-stop');
      const result = await confirm(...args);
      let closing: Promise<{ component: string }> | undefined;
      closeNative.mockImplementation(() => {
        if (closing) return closing;
        frontierActive = false;
        order.push('nodes-stop');
        cleanupEntered();
        closing = held.then(() => ({ component: 'FED process stub' }));
        return closing;
      });
      return result;
    });
    let settled = false;
    const running = runSubstrateFederatedGenesisTargetRootV1(input)
      .then(value => { settled = true; return value; });
    await entered;
    try {
      expect(settled).toBe(false);
      expect(stop).not.toHaveBeenCalled();
      expect(frontierActive).toBe(false);
    } finally { releaseCleanup(); }
    expect((await running).frontierProcess).toEqual({ component: 'FED process stub' });
    expect(closeNative).toHaveBeenCalledTimes(2);
    assertDownstreamCleanup();
  });

  it('awaits Ergo teardown after both payouts and native teardown before resolving success', async () => {
    const createProcess = mocked.process.getMockImplementation()!;
    let releaseStop!: () => void;
    let stopEntered!: () => void;
    const entered = new Promise<void>(resolve => { stopEntered = resolve; });
    const held = new Promise<void>(resolve => { releaseStop = resolve; });
    mocked.process.mockImplementation((...args) => {
      const owner = createProcess(...args);
      const originalStop = stop.getMockImplementation()!;
      stop.mockImplementation(async () => {
        stopEntered();
        await held;
        return originalStop();
      });
      return owner;
    });
    let settled = false;
    const running = runSubstrateFederatedGenesisTargetRootV1(input).then(
      value => { settled = true; return value; },
      failure => { settled = true; throw failure; },
    );
    await Promise.race([entered, running]);
    try {
      expect(mocked.payoutConfirm).toHaveBeenCalledTimes(2);
      expect(frontierActive).toBe(false);
      expect(stop).toHaveBeenCalledOnce();
      expect(settled).toBe(false);
    } finally { releaseStop(); }
    expect((await running).completedCycles).toBe(2);
    assertDownstreamCleanup();
  });

  it('closes native ownership when the Ergo setup fails after its first native action', async () => {
    const createProcess = mocked.process.getMockImplementation()!;
    const failure = new Error('setup post-action failure');
    mocked.process.mockImplementation((...args) => {
      const owner = createProcess(...args);
      return { ...owner, withMiningActiveExecutionTarget: async (...phaseArgs: any[]) => {
        await owner.withMiningActiveExecutionTarget(...phaseArgs);
        expect(frontierActive).toBe(true);
        throw failure;
      } };
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toBe(failure);
    expect(nativeAction).toHaveBeenCalledOnce();
    expect(closeNative).toHaveBeenCalledOnce();
    expect(mocked.anchor).not.toHaveBeenCalled();
    assertDownstreamCleanup();
  });

  it('rejects native ownership lost during the return instead of reporting success', async () => {
    const confirm = mocked.payoutConfirm.getMockImplementation()!;
    mocked.payoutConfirm.mockImplementation(async (...args) => {
      const result = await confirm(...args);
      if (mocked.payoutConfirm.mock.calls.length === 2) frontierActive = false;
      return result;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('FED target inactive');
    expect(mocked.payoutConfirm).toHaveBeenCalledTimes(2);
    expect(nativeAction).toHaveBeenCalledTimes(3);
    assertDownstreamCleanup();
  });

  it('preserves the original failure and both process cleanup failures while disposing every owner', async () => {
    const createProcess = mocked.process.getMockImplementation()!;
    const primary = new Error('setup post-action failure');
    const nativeFailure = new Error('native cleanup failed');
    const ergoFailure = new Error('Ergo cleanup failed');
    mocked.process.mockImplementation((...args) => {
      const owner = createProcess(...args);
      return { ...owner, withMiningActiveExecutionTarget: async (...phaseArgs: any[]) => {
        await owner.withMiningActiveExecutionTarget(...phaseArgs);
        closeNative.mockImplementation(() => {
          frontierActive = false;
          order.push('nodes-stop');
          return Promise.reject(nativeFailure);
        });
        throw primary;
      } };
    });
    stop.mockRejectedValueOnce(ergoFailure);
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toEqual([primary, nativeFailure, ergoFailure]);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure)).toEqual({
      primaryPhase: 'cycle-1', cleanupErrorCount: 2,
    });
    expect(closeNative).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(StateTracker.prototype.close).toHaveBeenCalledOnce();
    expect(frontierActive).toBe(false);
    assertDisposed();
  });

  it('does not infer a primary phase from a non-Error root failure plus cleanup failure', async () => {
    const cleanup = new Error('setup cleanup failed');
    vi.mocked(sources.createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2)
      .mockImplementationOnce(() => {
        const originalDispose = retainedSetup!.dispose;
        retainedSetup!.dispose = () => { originalDispose(); throw cleanup; };
        throw 'non-Error root failure';
      });
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toEqual(['non-Error root failure', cleanup]);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure)).toEqual({
      primaryPhase: null, cleanupErrorCount: 1,
    });
  });

  it('does not project a primitive-only cleanup failure because cleanupErrorCount counts Error instances', async () => {
    stop.mockRejectedValueOnce('primitive cleanup failure');
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBe('primitive cleanup failure');
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure)).toBeNull();
  });

  it('counts only cleanup Error instances while retaining primitive cleanup after a tagged primary Error', async () => {
    const primary = new Error('frontier build failed');
    const primitiveCleanup = 'primitive setup cleanup failure';
    mocked.frontier.mockImplementationOnce(() => {
      const originalDispose = retainedSetup!.dispose;
      retainedSetup!.dispose = () => { originalDispose(); throw primitiveCleanup; };
      throw primary;
    });
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toEqual([primary, primitiveCleanup]);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure)).toEqual({
      primaryPhase: 'frontier-build', cleanupErrorCount: 0,
    });
  });

  it('does not duplicate a memoized native cleanup failure during final cleanup', async () => {
    const failure = new Error('native cleanup failed');
    const confirm = mocked.payoutConfirm.getMockImplementation()!;
    mocked.payoutConfirm.mockImplementation(async (...args) => {
      const result = await confirm(...args);
      let closing: Promise<never> | undefined;
      closeNative.mockImplementation(() => {
        if (!closing) {
          frontierActive = false;
          order.push('nodes-stop');
          closing = Promise.reject(failure);
        }
        return closing;
      });
      return result;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toBe(failure);
    expect(closeNative).toHaveBeenCalledTimes(2);
    assertDownstreamCleanup();
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
        // Creating an operation checks source custody before the proof double.
        // Other synchronous doubles may finish, but no transaction can follow.
        assertDownstreamPrefix(owner === 'source' && stage !== 'proof' ? 'evidence' : 'proof');
        assertDownstreamCleanup();
        expect(readdirSync(journalDirectory).filter(name => name.startsWith('native-mint-'))).toEqual([]);
      });
  }

  it('rejects lost FED endpoint ownership before observing genesis or allocating a journal', async () => {
    mocked.frontierOwned.mockImplementationOnce(() => { throw new Error('FED target inactive'); });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('FED target inactive');
    expect(fetch).not.toHaveBeenCalled(); expect(mocked.check).not.toHaveBeenCalled();
    expect(mocked.execute).not.toHaveBeenCalled(); expect(mocked.packet).not.toHaveBeenCalled();
    expect(StateTracker.prototype.close).not.toHaveBeenCalled();
    expect(readdirSync(builtTargetDirectory).filter(name => name.startsWith('issuance-journal-'))).toEqual([]);
    expect(order.slice(-2)).toEqual(['nodes-stop', 'stop']); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
  });

  it.each([false, true])('contains native deposit Hold failure before fresh funding (continuation=%s)', async second => {
    const original = mocked.hold.getMockImplementation()!;
    mocked.hold.mockImplementation(async value => {
      if ((value === phaseTargets.confirmation) === second) throw new Error('synthetic held miner refusal');
      return original(value);
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('synthetic held miner refusal');
    expect(mocked.packet).toHaveBeenCalledTimes(second ? 1 : 0);
    expect(mocked.continuationPacket).not.toHaveBeenCalled();
    expect(order).not.toContain(second ? 'continuationFunding' : 'funding');
    assertDisposed();
  });

  it.each(([false, true] as const).flatMap(second =>
    NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1.map(substage => ({ second, substage }))))(
    'attributes the last entered deposit-funding substage $substage through the actual root (continuation=$second)',
    async ({ second, substage }) => {
      const trigger = new Error(`synthetic ${substage} failure`);
      const assertInjection = injectDepositFundingSubstageFailure(second, substage, trigger);

      const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);

      expect(failure).toBe(trigger);
      expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(failure)).toEqual({
        primaryPhase: 'cycle-1', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
      });
      expect(projectNativeTwoCycleCycleStepFailureV1(failure)).toEqual({
        cycle: 'cycle-1', step: 'deposit-funding',
      });
      expect(projectNativeDepositFundingSubstageV1(failure)).toBe(substage);
      assertInjection();
      const substageIndex = NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1.indexOf(substage);
      expect(mocked.discover).toHaveBeenCalledTimes(1 + Number(second) + Number(substageIndex >= 4));
      expect(mocked.packet).toHaveBeenCalledTimes(Number(second));
      expect(mocked.continuationPacket).not.toHaveBeenCalled();
      expect(mocked.recovery).not.toHaveBeenCalled();
      assertDisposed();
    });

  it('refuses stale deposit detail after the same Error crosses two actual root invocations', async () => {
    const trigger = new Error('synthetic reused deposit failure');
    injectDepositFundingSubstageFailure(false, 'owned-transaction-hold', trigger);
    const first = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(first).toBe(trigger);
    expect(projectNativeDepositFundingSubstageV1(first)).toBe('owned-transaction-hold');
    assertDisposed();
    disposeRootFixture();
    prepareRootFixture();
    injectDepositFundingSubstageFailure(false, 'owned-reward-input-discovery', trigger);
    const second = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(second).toBe(trigger);
    expect(projectNativeTwoCycleCycleStepFailureV1(second)).toEqual({ cycle: 'cycle-1', step: 'deposit-funding' });
    expect(projectNativeDepositFundingSubstageV1(second)).toBeNull();
    expect(mocked.packet).not.toHaveBeenCalled();
    expect(mocked.recovery).not.toHaveBeenCalled();
    assertDisposed();
  });

  it.each([false, true])(
    'does not retain deposit-funding detail for a later packet failure (continuation=%s)', async second => {
      const trigger = new Error('synthetic later packet failure');
      (second ? mocked.continuationPacket : mocked.packet).mockRejectedValueOnce(trigger);

      const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);

      expect(failure).toBe(trigger);
      expect(projectNativeTwoCycleCycleStepFailureV1(failure)).toEqual({
        cycle: 'cycle-1', step: 'deposit-construction',
      });
      expect(projectNativeDepositFundingSubstageV1(failure)).toBeNull();
      expect(mocked.packet).toHaveBeenCalledOnce();
      expect(mocked.continuationPacket).toHaveBeenCalledTimes(Number(second));
      expect(mocked.recovery).not.toHaveBeenCalled();
      assertDisposed();
    });

  it.each([
    { name: 'primitive', thrown: 'primitive deposit Hold failure' },
    { name: 'proxy', thrown: new Proxy(new Error('proxied deposit Hold failure'), {}) },
  ])('does not invent deposit-funding detail for a $name thrown value', async ({ thrown }) => {
    const originalHold = mocked.hold.getMockImplementation()!;
    mocked.hold.mockImplementation(async value => {
      if (value === target) throw thrown;
      return originalHold(value);
    });

    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);

    expect(failure).toBe(thrown);
    expect(projectNativeDepositFundingSubstageV1(failure)).toBeNull();
    expect(mocked.packet).not.toHaveBeenCalled();
    expect(mocked.continuationPacket).not.toHaveBeenCalled();
    assertDisposed();
  });

  it.each([false, true].flatMap(second => ['height', 'header'].map(field => ({ second, field }))))(
    'rejects a $field difference from the held deposit watermark (continuation=$second)', async ({ second, field }) => {
      const original = mocked.hold.getMockImplementation()!;
      mocked.hold.mockImplementation(async value => {
        const snapshot = await original(value);
        if ((value === phaseTargets.confirmation) !== second) return snapshot;
        return { ...snapshot, ...(field === 'height' ? { fullHeight: snapshot.fullHeight + 1 }
          : { headerIdHex: 'aa'.repeat(32) }) };
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(
        /confirmation is not canonical under its held snapshot|funding does not follow/,
      );
      expect(mocked.packet).toHaveBeenCalledTimes(second ? 1 : 0);
      expect(mocked.continuationPacket).not.toHaveBeenCalled();
      assertDisposed();
    });

  it.each(['primary', 'witness'] as const)(
    'rejects genesis funding when the $role owned node replaces an issuance confirmation after Hold', async role => {
    const originalHold = mocked.hold.getMockImplementation()!;
    let held = false;
    mocked.hold.mockImplementation(async value => {
      const snapshot = await originalHold(value);
      if (value === target) held = true;
      return snapshot;
    });
    readErgoInclusion = (origin, height) => held && height === 100
      ? [origin === target[`${role}NodeOrigin`] ? 'a1'.repeat(32) : '92'.repeat(32)]
      : ['92'.repeat(32)];

    await expect(runSubstrateFederatedGenesisTargetRootV1(input))
      .rejects.toThrow(/issuance confirmation.*canonical|funding does not follow/);
    expect(mocked.discover).toHaveBeenCalledOnce();
    expect(mocked.packet).not.toHaveBeenCalled();
    assertDisposed();
  });

  it.each(['primary', 'witness'] as const)(
    'rejects continuation funding when the $role owned node replaces the payout confirmation after Hold', async role => {
    const originalHold = mocked.hold.getMockImplementation()!;
    let held = false;
    mocked.hold.mockImplementation(async value => {
      const snapshot = await originalHold(value);
      if (value === phaseTargets.confirmation) held = true;
      return snapshot;
    });
    readErgoInclusion = (origin, height) => {
      if (held && height === 150) {
        return [origin === target[`${role}NodeOrigin`] ? 'a2'.repeat(32) : 'f1'.repeat(32)];
      }
      return ['92'.repeat(32)];
    };

    await expect(runSubstrateFederatedGenesisTargetRootV1(input))
      .rejects.toThrow(/payout confirmation.*canonical|continuation funding does not follow/);
    expect(mocked.discover).toHaveBeenCalledTimes(2);
    expect(mocked.packet).toHaveBeenCalledOnce();
    expect(mocked.continuationPacket).not.toHaveBeenCalled();
    assertDisposed();
  });

  it.each((['before', 'after'] as const).flatMap(stage => (['primary', 'witness'] as const)
    .map(role => ({ stage, role }))))(
    'rejects a $role held-tip difference $stage genesis membership reads', async ({ stage, role }) => {
      const calls = new Map<string, number>();
      readHeldDepositTip = (origin, held) => {
        const call = calls.get(origin) ?? 0; calls.set(origin, call + 1);
        return origin === target[`${role}NodeOrigin`] && call === (stage === 'before' ? 0 : 1)
          ? { ...held, id: 'ad'.repeat(32) } : held;
      };
      await expect(runSubstrateFederatedGenesisTargetRootV1(input))
        .rejects.toThrow(/issuance confirmation.*canonical/);
      expect(mocked.discover).toHaveBeenCalledOnce();
      expect(mocked.packet).not.toHaveBeenCalled();
      assertDisposed();
    });

  it.each(['provenance', 'genesis', 'height'] as const)('rejects second funding %s before constructing a packet', async fault => {
    if (fault === 'provenance') mocked.fundingOwned.mockImplementationOnce(() => { throw new Error('funding provenance lost'); });
    else if (fault === 'genesis') funding = { ...funding, observation: { ...funding.observation,
      target: { ...funding.observation.target, genesisHeaderIdHex: '99'.repeat(32) } } };
    else {
      const original = mocked.hold.getMockImplementation()!;
      mocked.hold.mockImplementation(async value => {
        const snapshot = await original(value);
        if (value === target) funding = { ...funding, observation: { ...funding.observation,
          target: { ...funding.observation.target, tipHeight: 99 } } };
        return snapshot;
      });
    }
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
        checkNativeWithdrawalRetainingContinuationSignerV2: mocked.payoutCheck,
        checkNativeContinuationWithdrawalFeeFundingV1: mocked.continuationWithdrawalFeeCheck,
        checkNativeContinuationTrackerFeeFundingV1: mocked.continuationTrackerFeeCheck,
        issueNativeContinuationMiningAuthorityV1: mocked.miningAuthority,
        checkNativeContinuationFrozenTrackerV2CandidateRetainingWithdrawalSigner: mocked.continuationTrackerCheck,
        checkNativeContinuationWithdrawalV2: mocked.continuationPayoutCheck };
      return retainedSetup;
    });
    await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(mocked.frontier.mock.calls[0][0]).toMatchObject(expected); assertDisposed();
  });

  it('does not allocate a journal or issue anything when the native checker fails', async () => {
    mocked.check.mockRejectedValueOnce(new Error('native check rejected'));
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('native check rejected');
    expect(mocked.execute).not.toHaveBeenCalled();
    expect(readdirSync(builtTargetDirectory).filter(name => name.startsWith('issuance-journal-'))).toEqual([]);
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
    let snapshotInclusionReads = 0;
    const inclusion = vi.fn((origin: string, at: number) => {
      expect([target.primaryNodeOrigin, target.witnessNodeOrigin]).toContain(origin);
      if (inSnapshot) {
        snapshotInclusionReads++;
        expect(at).toBe(100);
      } else expect([100, 150]).toContain(at);
      return [at === 150 ? 'f1'.repeat(32) : '92'.repeat(32)];
    });
    readErgoInclusion = inclusion;
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(result.operationalMintEstablished).toBe(true);
    expect(snapshotInclusionReads).toBe(6);
    expect(inclusion).toHaveBeenCalledTimes(10);
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
    const inclusion = vi.fn((_origin: string, height: number) => [height === 150
      ? 'f1'.repeat(32)
      : receipts.find(receipt => receipt.confirmationHeight === height)!.confirmationHeaderIdHex]);
    readErgoInclusion = inclusion;
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(result.operationalMintEstablished).toBe(true);
    for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
      for (const height of [108, 109, 110]) {
        expect(inclusion.mock.calls.filter(call => call[0] === origin && call[1] === height)).toHaveLength(2);
      }
      expect(inclusion.mock.calls.filter(call => call[0] === origin && call[1] === 150)).toHaveLength(1);
    }
    expect(inclusion).toHaveBeenCalledTimes(14); assertDisposed();
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

  it.each([
    ['setup-and-custody', 'source', null], ['frontier-build', 'frontier', null],
    ['ergo-build', 'ergoBuild', null], ['node-start', 'process', null],
    ['cycle-1', 'execute', { cycle: 'cycle-1', step: 'issuance-execution' }],
    ['between-cycles', 'readOnlyOwned', null],
    ['cycle-2', 'continuationTrackerCheck', { cycle: 'cycle-2', step: 'tracker-check' }],
    ['cleanup', 'stop', null],
  ] as const)('preserves root failure identity and projects the %s phase', async (expectedPhase, injection, expectedStep) => {
    const trigger = new Error(`failure at ${expectedPhase}`);
    if (injection === 'source') {
      vi.mocked(sources.createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2)
        .mockImplementationOnce(() => { throw trigger; });
    } else if (injection === 'stop') stop.mockRejectedValueOnce(trigger);
    else mocked[injection].mockImplementationOnce(() => { throw trigger; });
    let failure: unknown;
    try { await runSubstrateFederatedGenesisTargetRootV1(input); } catch (error) { failure = error; }
    expect(failure).toBe(trigger);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(failure)).toEqual({
      primaryPhase: expectedPhase === 'cleanup'
        ? null
        : expectedPhase,
      cleanupErrorCount: expectedPhase === 'cleanup' ? 1 : 0,
    });
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(failure)).toEqual({
      primaryPhase: expectedPhase === 'cleanup' ? null : expectedPhase,
      cleanupErrorCount: expectedPhase === 'cleanup' ? 1 : 0,
      ergoNodeStartupPhase: null,
    });
    expect(projectNativeTwoCycleCycleStepFailureV1(failure)).toEqual(expectedStep);
    if (expectedPhase === 'node-start') expect(mocked.projectStartupPhase).toHaveBeenCalledOnce();
    else expect(mocked.projectStartupPhase).not.toHaveBeenCalled();
  });

  const cycleOneStepFailures = [
    {
      name: 'genesis observation', step: 'genesis-observation',
      inject: (failure: Error) => vi.mocked(fetch).mockRejectedValueOnce(failure),
      assertCalls: () => expect(vi.mocked(fetch)).toHaveBeenCalledOnce(),
    },
    {
      name: 'setup check', step: 'setup-check',
      inject: (failure: Error) => mocked.check.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.check).toHaveBeenCalledOnce(),
    },
    {
      name: 'source lock', step: 'source-lock',
      inject: (failure: Error) => mocked.sourceLock.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.sourceLock).toHaveBeenCalledOnce(),
    },
    {
      name: 'committed reserve', step: 'committed-reserve',
      inject: (failure: Error) => mocked.committedVault.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.committedVault).toHaveBeenCalledOnce(),
    },
    {
      name: 'native mint and burn', step: 'native-mint-burn',
      inject: (failure: Error) => mocked.mint.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.mint).toHaveBeenCalledOnce(),
    },
    {
      name: 'withdrawal fee check', step: 'withdrawal-fee-check',
      inject: (failure: Error) => mocked.withdrawalFeeCheck.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.withdrawalFeeCheck).toHaveBeenCalledOnce(),
    },
    {
      name: 'tracker fee funding', step: 'tracker-fee-funding',
      inject: (failure: Error) => mocked.trackerFee.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.trackerFee).toHaveBeenCalledOnce(),
    },
    {
      name: 'checkpoint attestation', step: 'checkpoint-attestation',
      inject: (failure: Error) => mocked.checkpoint.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.checkpoint).toHaveBeenCalledOnce(),
    },
    {
      name: 'tracker context', step: 'tracker-context',
      inject: (failure: Error) => mocked.context.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.context).toHaveBeenCalledOnce(),
    },
  ] as const;

  it.each(cycleOneStepFailures)('projects the isolated cycle-1 $name failure', async ({ step, inject, assertCalls }) => {
    const trigger = new Error(`cycle-1 ${step} failure`);
    inject(trigger);
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBe(trigger);
    expect(projectNativeTwoCycleCycleStepFailureV1(failure)).toEqual({ cycle: 'cycle-1', step });
    assertCalls();
    expect(stop).toHaveBeenCalledOnce();
    expect(closeNative).toHaveBeenCalledTimes(2);
    expect(order.at(-1)).toBe('stop');
    assertDisposed();
  });

  it('separates the cycle-1 custody check following a completed tracker context', async () => {
    const trigger = new Error('post-context custody failed');
    const originalContext = mocked.context.getMockImplementation()!;
    const originalRead = mocked.nativeRead.getMockImplementation()!;
    let contextBuilt = false;
    mocked.context.mockImplementationOnce(async (...args) => {
      const context = await originalContext(...args);
      contextBuilt = true;
      return context;
    });
    mocked.nativeRead.mockImplementation((...args) => {
      if (contextBuilt) { contextBuilt = false; throw trigger; }
      return originalRead(...args);
    });
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBe(trigger);
    expect(projectNativeTwoCycleCycleStepFailureV1(failure))
      .toEqual({ cycle: 'cycle-1', step: 'tracker-context-custody' });
    expect(mocked.context).toHaveBeenCalledOnce();
    expect(mocked.trackerTx).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
    assertDisposed();
  });

  const cycleTwoStepFailures = [
    {
      name: 'tracker context', step: 'tracker-context',
      inject: (failure: Error) => mocked.continuationContext.mockRejectedValueOnce(failure),
      assertCalls: () => expect(mocked.continuationContext).toHaveBeenCalledOnce(),
    },
    {
      name: 'tracker transport', step: 'tracker-transport',
      inject: (failure: Error) => {
        const original = mocked.trackerSubmit.getMockImplementation()!;
        mocked.trackerSubmit.mockImplementationOnce((...args) => original(...args));
        mocked.trackerSubmit.mockRejectedValueOnce(failure);
      },
      assertCalls: () => expect(mocked.trackerSubmit).toHaveBeenCalledTimes(2),
    },
    {
      name: 'tracker confirmation', step: 'tracker-confirmation',
      inject: (failure: Error) => {
        const original = mocked.wait.getMockImplementation()!;
        for (let index = 0; index < 8; index++) mocked.wait.mockImplementationOnce((...args) => original(...args));
        mocked.wait.mockRejectedValueOnce(failure);
      },
      assertCalls: () => expect(mocked.wait).toHaveBeenCalledTimes(9),
    },
    {
      name: 'withdrawal transport', step: 'withdrawal-transport',
      inject: (failure: Error) => {
        const original = mocked.payoutSubmit.getMockImplementation()!;
        mocked.payoutSubmit.mockImplementationOnce((...args) => original(...args));
        mocked.payoutSubmit.mockRejectedValueOnce(failure);
      },
      assertCalls: () => expect(mocked.payoutSubmit).toHaveBeenCalledTimes(2),
    },
    {
      name: 'withdrawal confirmation', step: 'withdrawal-confirmation',
      inject: (failure: Error) => {
        const original = mocked.wait.getMockImplementation()!;
        for (let index = 0; index < 9; index++) mocked.wait.mockImplementationOnce((...args) => original(...args));
        mocked.wait.mockRejectedValueOnce(failure);
      },
      assertCalls: () => expect(mocked.wait).toHaveBeenCalledTimes(10),
    },
  ] as const;

  it.each(cycleTwoStepFailures)('projects the isolated cycle-2 $name failure', async ({ step, inject, assertCalls }) => {
    const trigger = new Error(`cycle-2 ${step} failure`);
    inject(trigger);
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBe(trigger);
    expect(projectNativeTwoCycleCycleStepFailureV1(failure)).toEqual({ cycle: 'cycle-2', step });
    expect(mocked.recovery).not.toHaveBeenCalled();
    assertCalls();
    expect(stop).toHaveBeenCalledOnce();
    expect(closeNative).toHaveBeenCalledTimes(2);
    expect(order.at(-1)).toBe('stop');
    assertDisposed();
  });

  it.each((['cycle-1', 'cycle-2'] as const).flatMap(cycle =>
    [false, true].map(cleanupFailure => ({ cycle, cleanupFailure }))))(
    'retains the constructor phase through actual $cycle root tags, cleanup failure $cleanupFailure',
    async ({ cycle, cleanupFailure }) => {
      const primary = tagSubstrateFederatedTrackerV2BuildFailurePhaseV1(
        new Error('unpublished tracker constructor failure'), 'statement');
      tagSubstrateFederatedTrackerV2StatementFailureCheckV1(primary, 'application-binding');
      (cycle === 'cycle-1' ? mocked.context : mocked.continuationContext)
        .mockRejectedValueOnce(primary);
      const cleanup = new Error('unpublished stop failure');
      if (cleanupFailure) stop.mockRejectedValueOnce(cleanup);
      const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
      if (cleanupFailure) {
        expect(failure).toBeInstanceOf(AggregateError);
        expect(failure.errors).toEqual([primary, cleanup]);
      } else expect(failure).toBe(primary);
      expect(projectNativeTwoCycleCycleStepFailureV1(failure))
        .toEqual({ cycle, step: 'tracker-context' });
      expect(projectSubstrateFederatedTrackerV2BuildFailurePhaseV1(failure)).toBe('statement');
      expect(projectSubstrateFederatedTrackerV2StatementFailureCheckV1(failure)).toBe('application-binding');
      expect(mocked.recovery).not.toHaveBeenCalled();
      expect(stop).toHaveBeenCalledOnce();
      expect(closeNative).toHaveBeenCalledTimes(2);
      assertDisposed();
    });

  it.each((['genesis', 'continuation'] as const).flatMap(sourceLockKind =>
    [false, true].map(cleanupFailure => ({ sourceLockKind, cleanupFailure }))))(
    'retains the source-lock stage and $sourceLockKind kind through actual cycle-1 root tags, cleanup failure $cleanupFailure',
    async ({ sourceLockKind, cleanupFailure }) => {
      const cycle = 'cycle-1';
      const primary = tagSubstrateFederatedNativeSourceLockFailureStageV1(
        new Error('unpublished source-lock operation failure'), 'check-node', sourceLockKind);
      (sourceLockKind === 'genesis' ? mocked.sourceLock : mocked.continuationSourceLock)
        .mockRejectedValueOnce(primary);
      const cleanup = new Error('unpublished stop failure');
      if (cleanupFailure) stop.mockRejectedValueOnce(cleanup);
      const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
      if (cleanupFailure) {
        expect(failure).toBeInstanceOf(AggregateError);
        expect(failure.errors).toEqual([primary, cleanup]);
      } else expect(failure).toBe(primary);
      expect(projectNativeTwoCycleCycleStepFailureV1(failure)).toEqual({ cycle, step: 'source-lock' });
      expect(projectSubstrateFederatedNativeSourceLockFailureStageV1(failure))
        .toEqual({ sourceLockStage: 'check-node', sourceLockKind });
      expect(mocked.recovery).not.toHaveBeenCalled();
      expect(stop).toHaveBeenCalledOnce();
      expect(closeNative).toHaveBeenCalledTimes(2);
      assertDisposed();
    });

  it('separates the cycle-2 custody check following a completed tracker context', async () => {
    const trigger = new Error('continuation post-context custody failed');
    const originalContext = mocked.continuationContext.getMockImplementation()!;
    const originalRead = mocked.nativeRead.getMockImplementation()!;
    let contextBuilt = false;
    mocked.continuationContext.mockImplementation(async (...args) => {
      const context = await originalContext(...args);
      contextBuilt = true;
      return context;
    });
    mocked.nativeRead.mockImplementation((...args) => {
      if (contextBuilt) { contextBuilt = false; throw trigger; }
      return originalRead(...args);
    });
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBe(trigger);
    expect(projectNativeTwoCycleCycleStepFailureV1(failure))
      .toEqual({ cycle: 'cycle-2', step: 'tracker-context-custody' });
    expect(mocked.continuationContext).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    assertDisposed();
  });

  it('does not leak the cycle step between consecutive failed invocations', async () => {
    const first = new Error('source lock failed');
    mocked.sourceLock.mockRejectedValueOnce(first);
    const firstFailure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(firstFailure).toBe(first);
    expect(projectNativeTwoCycleCycleStepFailureV1(firstFailure)).toEqual({ cycle: 'cycle-1', step: 'source-lock' });
    expect(stop).toHaveBeenCalledOnce();
    expect(closeNative).toHaveBeenCalledTimes(2);
    assertDisposed();

    const second = new Error('setup check failed on second invocation');
    // These traces drive the synthetic discovery fixture, not production state.
    order.length = 0;
    calls.length = 0;
    const originalBuild = mocked.frontier.getMockImplementation()!;
    const freshBuildDirectory = mkdtempSync(join(directory, 'bridge-fed-genesis-'));
    const freshTargetDirectory = join(freshBuildDirectory, 'target');
    mkdirSync(freshTargetDirectory);
    mocked.frontier.mockImplementationOnce(async value => ({
      ...await originalBuild(value), targetDirectory: freshTargetDirectory,
    }));
    mocked.materialize.mockImplementationOnce(async value => {
      order.push('materialize'); assertCustodyActive(); expect(active).toBe(true);
      const freshGenesis = join(freshTargetDirectory, 'fed-genesis.json');
      expect(value.args).toEqual(['build-spec', '--chain', `fed-genesis:${freshGenesis}`,
        '--disable-default-bootnode', '--raw']);
      expect(JSON.parse(readFileSync(freshGenesis, 'utf8')).operatorAddressHex).toBe(operator!.addressHex);
      return { stdout: JSON.stringify(rawSpec()), stderr: '' };
    });
    mocked.check.mockRejectedValueOnce(second);
    const secondFailure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(secondFailure).toBe(second);
    expect(projectNativeTwoCycleCycleStepFailureV1(secondFailure)).toEqual({ cycle: 'cycle-1', step: 'setup-check' });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(closeNative).toHaveBeenCalledTimes(2);
    expect(mocked.sourceLock).toHaveBeenCalledOnce();
    assertDisposed();
  });

  it.each(['budget', 'invalid clock', 'shutdown', 'root cleanup', 'owner aggregate',
    'callback failure', 'recorder clock failure', 'stale error'] as const)(
    'callback timing root join preserves original behavior for %s', async fault => {
      const createProcess = mocked.process.getMockImplementation()!;
      let now = 9_000_000_000;
      const timing = vi.spyOn(performance, 'now').mockImplementation(() => {
        now += 100;
        return fault === 'recorder clock failure' ? NaN : now;
      });
      const primary = tagIsolatedErgoNodeCompletionFailureReasonV1(
        tagIsolatedErgoNodePostCallbackStageV1(new Error('private completion failure'),
          fault === 'shutdown' ? 'mining-shutdown' : 'completion-check'),
        fault === 'invalid clock' ? 'invalid-timing' : 'budget-exceeded');
      if (fault === 'stale error') {
        tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
        tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'cycle-summary');
      }
      const thrown = fault === 'owner aggregate' ? new AggregateError([primary,
        new Error('owner cleanup')], 'owner failure') : primary;
      if (fault === 'callback failure') mocked.check.mockRejectedValueOnce(primary);
      const originalCompile = mocked.compile.getMockImplementation()!;
      mocked.compile.mockImplementationOnce(async (...args) => {
        now += 10_000; return originalCompile(...args);
      });
      let callbackEnd = 0;
      mocked.process.mockImplementation((...args) => {
        const owner = createProcess(...args);
        return { ...owner, withMiningActiveExecutionTarget: async (...phaseArgs: any[]) => {
          await owner.withMiningActiveExecutionTarget(...phaseArgs);
          callbackEnd = now;
          now += 1_000_000; // Completion/owner cost must not enter the callback trace.
          if (fault === 'root cleanup') closeNative.mockRejectedValueOnce(new Error('root cleanup'));
          throw thrown;
        } };
      });
      const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
      timing.mockRestore();
      if (fault === 'root cleanup') expect(failure.errors[0]).toBe(primary);
      else expect(failure).toBe(thrown);
      const trace = projectNativeTwoCycleCallbackTimingFailureV1(failure);
      if (fault === 'budget') {
        expect(trace?.segments[0]).toMatchObject({ step: 'pre-native-target' });
        expect(trace!.segments.slice(0, 6).map(segment => segment.step)).toEqual([
          'pre-native-target', 'reward-input-discovery', 'history-collection', 'genesis-compilation',
          'genesis-materialization', 'native-process-start',
        ]);
        expect(trace!.segments.find(segment => segment.step === 'genesis-compilation')!.durationMs)
          .toBeGreaterThanOrEqual(10_000);
        expect(trace!.segments.at(-1)!.step).toBe('cycle-summary');
        expect(trace!.segments.some(segment => segment.step === 'return-preparation')).toBe(false);
        expect(trace!.totalDurationMs).toBeLessThan(100_000);
        expect(trace!.totalDurationMs).toBe(callbackEnd - 9_000_000_100);
        expect(trace!.segments.reduce((sum, segment) => sum + segment.durationMs, 0)).toBe(trace!.totalDurationMs);
      } else expect(trace).toBeNull();
      expect(mocked.anchor).not.toHaveBeenCalled();
      expect(mocked.continuationPacket).not.toHaveBeenCalled();
      expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });

  it('retains the cycle step when cycle failure and owner cleanup both fail', async () => {
    const createProcess = mocked.process.getMockImplementation()!;
    const primary = tagIsolatedErgoNodePostCallbackStageV1(
      new Error('post-cycle owner operation failed'), 'read-only-restart');
    const nativeCleanup = new Error('native close failed');
    const ergoCleanup = new Error('Ergo stop failed');
    mocked.process.mockImplementation((...args) => {
      const owner = createProcess(...args);
      return { ...owner, withMiningActiveExecutionTarget: async (...phaseArgs: any[]) => {
        await owner.withMiningActiveExecutionTarget(...phaseArgs);
        closeNative.mockRejectedValueOnce(nativeCleanup);
        throw primary;
      } };
    });
    stop.mockRejectedValueOnce(ergoCleanup);
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toEqual([primary, nativeCleanup, ergoCleanup]);
    expect(projectNativeTwoCycleCycleStepFailureV1(failure)).toEqual({ cycle: 'cycle-1', step: 'cycle-summary' });
    expect(projectNativeTwoCycleErgoNodePostCallbackStageV1(failure)).toBe('read-only-restart');
    expect(stop).toHaveBeenCalledOnce();
    expect(closeNative).toHaveBeenCalledOnce();
    assertDisposed();
  });

  it.each(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1)(
    'retains the producer-tagged Ergo startup phase %s at the root', async startupPhase => {
      const trigger = new Error('private Ergo node startup detail');
      mocked.projectStartupPhase.mockReturnValueOnce(startupPhase);
      mocked.process.mockImplementationOnce(() => { throw trigger; });
      const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
      expect(failure).toBe(trigger);
      expect(mocked.projectStartupPhase).toHaveBeenCalledOnce();
      expect(mocked.projectStartupPhase).toHaveBeenCalledWith(trigger);
      expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(failure)).toEqual({
        primaryPhase: 'node-start', cleanupErrorCount: 0,
        ergoNodeStartupPhase: startupPhase,
      });
      assertDisposed();
    },
  );

  it('preserves the original root failure when the optional startup projector throws', async () => {
    const trigger = new Error('private root startup failure');
    mocked.projectStartupPhase.mockImplementationOnce(() => {
      throw new Error('private projector failure');
    });
    mocked.process.mockImplementationOnce(() => { throw trigger; });
    const failure = await runSubstrateFederatedGenesisTargetRootV1(input).catch(error => error);
    expect(failure).toBe(trigger);
    expect(projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(failure)).toEqual({
      primaryPhase: 'node-start', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
    assertDisposed();
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

  it.each(['wrong parent', 'wrong build name', 'wrong target leaf'] as const)(
    'rejects a Frontier %s before starting Ergo build or nodes', async fault => {
      const build = mocked.frontier.getMockImplementation()!;
      mocked.frontier.mockImplementationOnce(async value => {
        const result = await build(value);
        const targetDirectory = fault === 'wrong parent'
          ? join(directory, 'nested', 'bridge-fed-genesis-Ab3D4e', 'target')
          : fault === 'wrong build name'
            ? join(directory, 'other-build-Ab3D4e', 'target')
            : join(directory, 'bridge-fed-genesis-Ab3D4e', 'other');
        mkdirSync(targetDirectory, { recursive: true });
        return { ...result, targetDirectory };
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input))
        .rejects.toThrow('FED recovery capture target differs from its fresh builder parent');
      expect(mocked.ergoBuild).not.toHaveBeenCalled();
      expect(mocked.nodes).not.toHaveBeenCalled();
      expect(mocked.recovery).not.toHaveBeenCalled();
      assertDisposed();
    },
  );

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
      writeFileSync(join(builtTargetDirectory, 'fed-genesis.json'), '{}'); return { stdout: JSON.stringify(rawSpec()) };
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
