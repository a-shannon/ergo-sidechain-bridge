import { beforeEach, describe, expect, it, vi } from 'vitest';
import blakejs from 'blakejs';
import { buildTrustlessBurnInclusionProof, deriveTrustlessBurnIdHex } from '../../trustless-burn-proof.js';

const fixture = vi.hoisted(() => ({
  calls: [] as string[], active: '', fault: '', cleanupFault: '',
  buildGate: undefined as Promise<void> | undefined,
  setupInput: undefined as Record<string, unknown> | undefined,
  finalizedReceipt: undefined as object | undefined,
  prepared: undefined as any,
  withdrawalClaim: undefined as any,
  withdrawal: undefined as any,
  withdrawalGate: undefined as Promise<void> | undefined, gatedStep: '',
  payoutPatch: {} as Record<string, unknown>,
  state: undefined as object | undefined,
  withdrawalAuthorization: Object.freeze({ authorizationDigestHex: '74'.repeat(32) }),
  withdrawalAttempt: Object.freeze({ expectedTxId: '61'.repeat(32), durableAttemptDigestHex: '75'.repeat(32) }),
  withdrawalSubmission: undefined as any,
  assetIdHex: '00'.repeat(32),
  owner: Object.freeze({ owner: 'synthetic' }),
  signer: Object.freeze({ publicKeyHex: '02' + '11'.repeat(32),
    p2pkErgoTreeHex: '0008cd02' + '11'.repeat(32),
    rewardInputErgoTrees: { delay1: '1001', delay720: '1002' }, networkPrefix: 16 }),
  mining: Object.freeze({ miningCredential: { token: 1 }, checkpointMiningCredential: { token: 2 },
    trackerAdmissionMiningCredential: { token: 3 }, trackerConfirmationMiningCredential: { token: 4 } }),
  targets: Object.freeze(Object.fromEntries(['setup', 'anchor', 'frozen', 'freshness', 'transport', 'confirmation']
    .map(phase => [phase, Object.freeze({ phase })]))),
  attempt: Object.freeze({ expectedTxId: '31'.repeat(32), durableAttemptDigestHex: '32'.repeat(32) }),
  completion: Object.freeze({ completion: 'freshness' }),
  check: Object.freeze({ result: { checkDigestHex: '33'.repeat(32) } }),
  authorization: Object.freeze({ authorizationDigestHex: '34'.repeat(32) }),
  submission: Object.freeze({ status: 'accepted', submittedTxId: '31'.repeat(32) }),
}));

function step(name: string): void {
  fixture.calls.push(name);
  if (fixture.fault === name || fixture.cleanupFault === name) throw new Error(`injected ${name}`);
}

function inPhase(phase: string, target: unknown): void {
  expect(fixture.active).toBe(phase);
  expect(target).toBe(fixture.targets[phase]);
}

async function action(phase: string, callback: (target: never) => Promise<unknown>) {
  step(phase);
  fixture.active = phase;
  try {
    const value = await callback(fixture.targets[phase] as never);
    return { value, receipt: { phase, finalSnapshot: { fullHeight: 200, headerIdHex: '40'.repeat(32) } } };
  } finally { fixture.active = ''; }
}

vi.mock('node:fs', () => ({ mkdirSync: () => step('mkdir') }));
vi.mock('../../state-tracker.js', () => ({ StateTracker: class {
  constructor() { step('state'); fixture.state = this; }
  close() { step('state.close'); }
} }));
vi.mock('ergo-lib-wasm-nodejs', () => ({ default: {} }));
vi.mock('../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js', () => ({
  claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1: (_binding: unknown, input: any) => {
    step('claim.request'); return input;
  },
  consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1: () => { step('consume.request'); return '01'.repeat(32); },
}));
vi.mock('../../adapters/frontier-lab-application-owner-v1.js', () => ({
  claimFrontierLabApplicationOwnerRequestV1: () => { step('owner'); return fixture.owner; },
  disposeFrontierLabApplicationOwnerV1: (owner: unknown) => { expect(owner).toBe(fixture.owner); step('owner.dispose'); },
}));
vi.mock('../../profiles/substrate-federated-v1/checkpoint-statement.js', () => ({
  buildSubstrateFederatedCheckpointProfileV1: () => ({ profileIdHex: '02'.repeat(32),
    sourceAttestationKeySetDigestHex: '03'.repeat(32), ergoAdmissionKeySetDigestHex: '04'.repeat(32) }),
  encodeSubstrateFederatedCheckpointExtensionValueV1: (statement: unknown) => {
    expect(statement).toBe('statement-v2'); step('extension'); return '05'.repeat(64);
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1: async () => {
    step('build'); await fixture.buildGate;
    return { javaExecutablePath: 'synthetic-java', nodeAssemblyJarPath: 'synthetic-jar',
      receipt: { toolchain: { javaExecutableSha256Hex: '06'.repeat(32) },
        build: { artifactSha256Hex: '07'.repeat(32) }, buildIdentityDigestHex: '08'.repeat(32) } };
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1: (_process: unknown, binding: any, ...credentials: unknown[]) => {
    step('node'); expect(binding.miningTargetPublicKeyHex).toBe(fixture.signer.publicKeyHex);
    expect(credentials).toEqual(Object.values(fixture.mining));
    return {
      startMining: async () => step('start'), stop: async () => step('node.stop'),
      withMiningActiveExecutionTarget: (callback: (target: never) => Promise<unknown>) => action('setup', callback),
      withCheckpointExtensionMiningTarget: (_extension: unknown, _policy: unknown, callback: (target: never) => Promise<unknown>) => action('anchor', callback),
      withCheckpointBoundMiningStoppedExecutionTarget: (callback: (target: never) => Promise<unknown>) => action('frozen', callback),
      withCheckpointBoundReservationFreshnessRevalidationTarget: (callback: (target: never) => Promise<unknown>) => action('freshness', callback),
      withCheckpointBoundTrackerTransportTarget: (completion: unknown, callback: (target: never) => Promise<unknown>) => {
        expect(completion).toBe(fixture.completion); return action('transport', callback);
      },
      withTrackerTransportConfirmationMiningTarget: (txId: unknown, callback: (target: never) => Promise<unknown>) => {
        expect(txId).toBe(fixture.attempt.expectedTxId); return action('confirmation', callback);
      },
    };
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', () => ({
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2: async () => {
    step('create.setup'); return { signer: fixture.signer, dispose: () => step('setup.dispose'),
      checkFrozenTrackerV2Candidate: async (input: any, target: unknown) => {
        inPhase('frozen', target); expect(input.transaction).toBe(trackerTransaction);
        step('check.v2'); return fixture.check;
      },
      checkFrozenTrackerV2CandidateRetainingWithdrawalSigner: async (input: any, target: unknown) => {
        inPhase('frozen', target); expect(input.transaction).toBe(trackerTransaction);
        step('check.v2.retained'); return fixture.check;
      },
      checkWithdrawalV2: async (claim: unknown, target: unknown) => {
        inPhase('confirmation', target); expect(fixture.calls).toContain('confirm');
        step('check.withdrawal'); fixture.withdrawalClaim = claim; return fixture.withdrawal;
      } };
  },
  claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2: () => { step('mining'); return fixture.mining; },
}));
vi.mock('../../substrate-federated-isolated-devnet-mining-credential-v1.js', () => ({
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1: (credential: any) => step(`revoke.${credential.token}`),
}));
vi.mock('../../substrate-federated-isolated-devnet-frontier-lab-application-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1: () => step('assert.application'),
}));
vi.mock('./substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js', () => ({
  createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4: (signer: unknown, binding: any) => {
    step('create.application.v4'); expect(signer).toBe(fixture.signer); expect(binding.owner).toBe(fixture.owner);
    return { signer: { ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [fixture.signer.publicKeyHex],
      sourceAttestationThreshold: 1, sourceAttestationPublicKeysHex: ['09'.repeat(32)] },
    dispose: () => step('application.dispose') };
  },
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance: (value: unknown) => {
    step('checkpoint.v4'); expect(value).toBe(fixture.prepared.applicationCheckpoint);
  },
}));
vi.mock('./substrate-federated-isolated-devnet-managed-setup-v2.js', () => ({
  executeSubstrateFederatedIsolatedDevnetManagedSetupV2: async (input: Record<string, unknown>) => {
    inPhase('setup', input.target); step('execute.setup.v2'); fixture.setupInput = input; return fixture.prepared;
  },
}));
vi.mock('../../substrate-federated-settlement-family-v1.js', () => ({
  decodeSubstrateFederatedSettlementFamilyV1Profile: (profile: unknown) => {
    expect(profile).toBe(fixture.prepared.compilerInput.familyReceipt.profile);
    return { settlementAssetIdHex: fixture.assetIdHex };
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js', () => ({
  observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1: async (input: any) => {
    inPhase('anchor', input.target); step('observe.anchor'); return { anchorHeaderIdHex: '41'.repeat(32),
      anchorHeight: 201, anchorExtensionRootHex: '42'.repeat(32) };
  },
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1: () => step('assert.anchor'),
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2: async (input: any) => {
    inPhase('frozen', input.target); step('observe.tracker'); return { headers: [], anchorContextIndex: 0,
      anchorHeaderIdHex: '41'.repeat(32), anchorExtensionRootHex: '42'.repeat(32), extensionMembershipProofHex: '01' };
  },
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2: () => step('assert.tracker'),
}));
vi.mock('../../bridge-validity-tracker-header-context-v1.js', () => ({
  buildBridgeValidityTrackerObservedHeaderContextV1: () => { step('headers'); return { headers: true }; },
}));
vi.mock('../../substrate-federated-tracker-v2.js', () => ({
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context: async (input: any) => {
    step('context.v2'); expect(input.compilerRequest).toBe(fixture.prepared.compilerInput.trackerRequest);
    expect(input.compilerReceipt).toBe(fixture.prepared.compilerInput.trackerReceipt);
    expect(input.trackerInputBox).toBe(fixture.prepared.trackerInputBox); return { context: 'v2' };
  },
}));
const trackerTransaction = Object.freeze({ unsignedTransactionIdHex: fixture.attempt.expectedTxId });
vi.mock('../../substrate-federated-tracker-v2-external-fee.js', () => ({
  buildSubstrateFederatedTrackerV2ExternalFeeTransaction: async (input: any) => {
    step('external.fee'); expect(input.feeInputBox).toBe(fixture.prepared.feeFunding.feeInputBox);
    expect(input.feePayerPublicKeyHex).toBe(fixture.signer.publicKeyHex); return trackerTransaction;
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js', () => ({
  authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission: async (check: unknown, target: unknown) => {
    inPhase('frozen', target); expect(check).toBe(fixture.check); step('authorize'); return fixture.authorization;
  },
  reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission: (authorization: unknown) => {
    expect(fixture.active).toBe('frozen'); expect(authorization).toBe(fixture.authorization);
    step('reserve'); return fixture.attempt;
  },
  revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission: async (attempt: unknown, target: unknown) => {
    inPhase('freshness', target); expect(attempt).toBe(fixture.attempt); step('revalidate'); return fixture.completion;
  },
  confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission: async (attempt: unknown, target: unknown) => {
    inPhase('confirmation', target); expect(attempt).toBe(fixture.attempt); step('confirm');
    return { confirmationHeight: 220, confirmationHeaderId: '43'.repeat(32) };
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', () => ({
  submitSubstrateFederatedIsolatedDevnetTrackerV2Admission: async (target: unknown, attempt: unknown) => {
    inPhase('transport', target); expect(attempt).toBe(fixture.attempt); step('submit'); return fixture.submission;
  },
  finalizeSubstrateFederatedIsolatedDevnetTrackerV2Admission: (attempt: unknown, submission: unknown) => {
    expect(fixture.active).toBe('transport'); expect(attempt).toBe(fixture.attempt);
    expect(submission).toBe(fixture.submission); step('finalize'); return { journalDigestHex: '44'.repeat(32) };
  },
  submitSubstrateFederatedIsolatedDevnetWithdrawalV2: async (target: unknown, attempt: unknown) => {
    inPhase('confirmation', target); expect(attempt).toBe(fixture.withdrawalAttempt); step('submit.withdrawal');
    if (fixture.gatedStep === 'submit.withdrawal') await fixture.withdrawalGate;
    return fixture.withdrawalSubmission;
  },
  finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2: (attempt: unknown, submission: unknown) => {
    expect(fixture.active).toBe('confirmation'); expect(attempt).toBe(fixture.withdrawalAttempt);
    expect(submission).toBe(fixture.withdrawalSubmission); step('finalize.withdrawal');
    return { journalDigestHex: '76'.repeat(32) };
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js', () => ({
  authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2: async (check: unknown, target: unknown) => {
    inPhase('confirmation', target); expect(check).toBe(fixture.withdrawal); step('authorize.withdrawal');
    if (fixture.gatedStep === 'authorize.withdrawal') await fixture.withdrawalGate;
    return fixture.withdrawalAuthorization;
  },
  reserveSubstrateFederatedIsolatedDevnetWithdrawalV2: (authorization: unknown, state: unknown) => {
    expect(fixture.active).toBe('confirmation'); expect(authorization).toBe(fixture.withdrawalAuthorization);
    expect(state).toBe(fixture.state); step('reserve.withdrawal'); return fixture.withdrawalAttempt;
  },
  confirmSubstrateFederatedIsolatedDevnetWithdrawalV2: async (attempt: unknown, target: unknown, confirmation: any) => {
    inPhase('confirmation', target); expect(attempt).toBe(fixture.withdrawalAttempt);
    expect(confirmation.observationDigestHex).toBe('77'.repeat(32)); step('confirm.withdrawal');
    if (fixture.gatedStep === 'confirm.withdrawal') await fixture.withdrawalGate;
    return { expectedTxId: fixture.withdrawalAttempt.expectedTxId, status: 'confirmed',
      confirmationHeight: 230, confirmationHeaderId: '78'.repeat(32), ...fixture.payoutPatch };
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: () => { step('observer'); return {}; },
}));
vi.mock('./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', () => ({
  APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS: 600_000,
  normalizeTrackerTransportJournalRootV9: () => { step('journal.claim'); return 'synthetic-journal'; },
  assertReservedTrackerTransportJournalRootV9: () => step('journal.check'),
  normalizePegInCandidatePlan: (input: unknown) => input,
  normalizeFrontierApplicationRunnerPlan: (input: unknown) => input,
  waitForCanonicalConfirmation: async (_observer: unknown, txId: unknown) => {
    if (txId === fixture.withdrawalAttempt.expectedTxId) {
      expect(fixture.active).toBe('confirmation'); step('wait.withdrawal');
      if (fixture.gatedStep === 'wait.withdrawal') await fixture.withdrawalGate;
      return { observationDigestHex: '77'.repeat(32) };
    }
    expect(txId).toBe(fixture.attempt.expectedTxId); step('wait.confirmation'); return { observationDigestHex: '45'.repeat(32) };
  },
  finalizeReceipt: (body: object) => {
    step('receipt'); fixture.finalizedReceipt = Object.freeze({ ...body, receiptDigestHex: '46'.repeat(32) });
    return fixture.finalizedReceipt;
  },
}));

import { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot as run,
  assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt as assertReceipt,
  runSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignRoot as runWithdrawal,
  assertSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignReceipt as assertWithdrawalReceipt }
  from './substrate-federated-isolated-devnet-tracker-v2-campaign-root.js';
import { runSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignRoot as runCompleteWithdrawal,
  assertSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignReceipt as assertCompleteWithdrawalReceipt }
  from './substrate-federated-isolated-devnet-tracker-v2-campaign-root.js';

function input() {
  return { build: {}, lifecycle: { sourceHistory: { acceptance: { bridgeAddress: 'bridge', tokenAddress: 'token' } } },
    requestBinding: {}, trackerTransportJournalRoot: 'synthetic-journal',
    pegIn: { amountNanoErg: '10000000', recipientAddressHex: '22'.repeat(20) }, frontierApplicationRunner: {} };
}

beforeEach(() => {
  fixture.calls.length = 0; fixture.active = ''; fixture.fault = ''; fixture.cleanupFault = '';
  fixture.buildGate = undefined; fixture.setupInput = undefined; fixture.finalizedReceipt = undefined;
  fixture.withdrawalClaim = undefined; fixture.assetIdHex = '00'.repeat(32);
  fixture.withdrawalGate = undefined; fixture.gatedStep = ''; fixture.payoutPatch = {}; fixture.state = undefined;
  fixture.withdrawalSubmission = { status: 'accepted', submittedTxId: fixture.withdrawalAttempt.expectedTxId,
    responseDigestHex: '79'.repeat(32) };
  const leaf = { sidechainIdHex: '51'.repeat(32), sidechainBlockHashHex: '52'.repeat(32),
    sidechainTxHashHex: '53'.repeat(32), eventIndex: 3,
    burnIdHex: deriveTrustlessBurnIdHex({ sidechainIdHex: '51'.repeat(32), sidechainTxHashHex: '53'.repeat(32), eventIndex: 3 }),
    recipientErgoTreeHashHex: Buffer.from(blakejs.blake2b(Buffer.from(fixture.signer.p2pkErgoTreeHex, 'hex'), undefined, 32)).toString('hex'),
    amountNanoErg: '10000000', assetIdHex: fixture.assetIdHex };
  const proof = buildTrustlessBurnInclusionProof([leaf], leaf.burnIdHex);
  fixture.prepared = {
    batch: { request: { target: { genesisHeaderIdHex: '20'.repeat(32) }, requestDigestHex: '21'.repeat(32) } },
    compilerInput: { trackerRequest: {}, trackerReceipt: {}, familyReceipt: { profile: { id: 'original' } } },
    packet: { receipt: { receiptDigestHex: '22'.repeat(32) } }, genesisTransactions: [],
    trackerInputBox: { boxId: '23'.repeat(32) },
    feeFunding: { expectedTxId: '24'.repeat(32), durableAttemptDigestHex: '25'.repeat(32),
      confirmationHeight: 190, confirmationHeaderIdHex: '26'.repeat(32), feeInputBox: { boxId: '27'.repeat(32) } },
    withdrawalFeeFunding: { expectedTxId: '64'.repeat(32), durableAttemptDigestHex: '65'.repeat(32),
      confirmationHeight: 180, confirmationHeaderIdHex: '66'.repeat(32), feeInputBox: { boxId: '67'.repeat(32) } },
    applicationCheckpoint: { applicationRunner: { executionResult: { applicationEvidence: {
      execution: { sidechainIdHex: '0x' + leaf.sidechainIdHex, blockHashHex: '0x' + leaf.sidechainBlockHashHex,
        transactionHashHex: '0x' + leaf.sidechainTxHashHex, eventIndex: leaf.eventIndex },
      burn: { burnIdHex: '0x' + leaf.burnIdHex, recipientErgoTreeHashHex: '0x' + leaf.recipientErgoTreeHashHex,
        amountNanoErg: leaf.amountNanoErg, recipientErgoTreeHex: fixture.signer.p2pkErgoTreeHex,
        bridgeEventRootHex: '0x' + proof.bridgeEventRootHex, burnLeafCount: proof.leafCount },
    } } }, checkpoint: { checkpointAttestation: { checkpointStatement: {
      encodedStatementHex: 'statement-v2', admissionValidFromErgoHeight: '200',
      sourceNativeBlockHeight: '10', sourceNativeBlockHashHex: '54'.repeat(32),
      executionBlockHashHex: leaf.sidechainBlockHashHex, bridgeEventRootHex: proof.bridgeEventRootHex,
      burnLeafCount: proof.leafCount } } } },
  };
  fixture.withdrawal = { packet: { transaction: { txId: '61'.repeat(32), eip12Tx: { inputs: [
    { boxId: '62'.repeat(32) }, { boxId: '63'.repeat(32) }, fixture.prepared.withdrawalFeeFunding.feeInputBox] } },
    burn: { leaf, recipientErgoTreeHex: fixture.signer.p2pkErgoTreeHex },
    reserve: { inputValueNanoErg: '20000000', outputValueNanoErg: '10000000',
      inputLiabilityNanoErg: '10000000', outputLiabilityNanoErg: '0' },
    duplicatePrevention: { inputDigestHex: '68'.repeat(33), outputDigestHex: '69'.repeat(33) },
    boxes: { trackerDataInput: { boxId: '70'.repeat(32) }, payout: { boxId: '71'.repeat(32) },
      reserveSuccessor: { boxId: '7a'.repeat(32) }, duplicatePreventionSuccessor: { boxId: '7b'.repeat(32) } } },
    signedCandidate: { signedTransactionDigestHex: '72'.repeat(32), signedTransactionBytesSha256Hex: '73'.repeat(32),
      signedTransactionBytesLength: 1024 },
    checkedResult: { checkerIdentity: { path: '/transactions/check' }, signerContext: { publicKeyHex: fixture.signer.publicKeyHex } } };
});

describe('tracker V2 managed campaign composition', () => {
  it('uses V2 entrypoints in one target-owned order, then closes every owner before issuing provenance', async () => {
    const result = await run(input() as never);
    expect(() => assertReceipt(result.receipt)).not.toThrow();
    expect(() => assertReceipt({ ...result.receipt })).toThrow(/provenance/);
    const required = ['execute.setup.v2', 'checkpoint.v4', 'anchor', 'observe.tracker', 'context.v2',
      'external.fee', 'check.v2', 'authorize', 'reserve', 'freshness', 'revalidate', 'transport',
      'submit', 'finalize', 'confirmation', 'confirm', 'receipt', 'application.dispose',
      'setup.dispose', 'node.stop', 'state.close', 'owner.dispose'];
    const actual = fixture.calls.filter(call => required.includes(call));
    expect(actual).toEqual(required);
    expect(fixture.calls.filter(call => call.startsWith('revoke.'))).toEqual(['revoke.1', 'revoke.2', 'revoke.3', 'revoke.4']);
    expect(result.receipt.boundaries.gate5Closed).toBe(false);
    expect(result.receipt.tracker.expectedTxId).toBe(fixture.attempt.expectedTxId);
  });

  it.each(['build', 'create.setup', 'create.application.v4', 'mining', 'node', 'journal.check',
    'state', 'start', 'execute.setup.v2', 'checkpoint.v4', 'anchor', 'observe.tracker',
    'context.v2', 'external.fee', 'check.v2', 'authorize', 'reserve', 'revalidate',
    'submit', 'finalize', 'wait.confirmation', 'confirm', 'receipt'])(
    'fails closed at %s without continuing or leaving owned resources open', async fault => {
      fixture.fault = fault;
      await expect(run(input() as never)).rejects.toThrow(`injected ${fault}`);
      expect(fixture.calls.at(-1)).toBe('owner.dispose');
      if (fixture.calls.includes('create.setup') && fault !== 'create.setup') expect(fixture.calls).toContain('setup.dispose');
      if (fixture.calls.includes('node') && fault !== 'node') expect(fixture.calls).toContain('node.stop');
      if (fixture.calls.includes('state') && fault !== 'state') expect(fixture.calls).toContain('state.close');
      if (fault !== 'receipt') expect(fixture.calls).not.toContain('receipt');
      if (!['finalize', 'wait.confirmation', 'confirm', 'receipt'].includes(fault)) expect(fixture.calls).not.toContain('finalize');
    },
  );

  it.each(['application.dispose', 'setup.dispose', 'node.stop', 'state.close', 'owner.dispose'])(
    'does not register a successful receipt when %s fails', async fault => {
      fixture.cleanupFault = fault;
      await expect(run(input() as never)).rejects.toThrow(/cleanup failed/);
      expect(() => assertReceipt(fixture.finalizedReceipt)).toThrow(/provenance/);
      expect(fixture.calls).toContain('node.stop'); expect(fixture.calls).toContain('state.close');
      expect(fixture.calls).toContain('owner.dispose');
    },
  );

  it.each(['future-funding', 'early-window'])(
    'does not freeze an anchor for %s', async fault => {
      if (fault === 'future-funding') fixture.prepared.feeFunding.confirmationHeight = 201;
      else fixture.prepared.applicationCheckpoint.checkpoint.checkpointAttestation.checkpointStatement.admissionValidFromErgoHeight = '189';
      await expect(run(input() as never)).rejects.toThrow(/precedes confirmed/);
      expect(fixture.calls).not.toContain('anchor'); expect(fixture.calls).not.toContain('submit');
    },
  );

  it('retains the request-bound lifecycle across asynchronous build', async () => {
    let release!: () => void;
    fixture.buildGate = new Promise<void>(resolve => { release = resolve; });
    const request = input(); const original = request.lifecycle;
    const pending = run(request as never);
    request.lifecycle = input().lifecycle;
    release(); await pending;
    expect(fixture.setupInput!.lifecycle).toBe(original);
  });

  it('checks the actual application burn within confirmed tracker custody without payout transport', async () => {
    const result = await runWithdrawal(input() as never);
    expect(fixture.setupInput!.withdrawalCheck).toBe(true);
    expect(fixture.calls).not.toContain('check.v2');
    const steps = ['check.v2.retained', 'authorize', 'reserve', 'revalidate', 'submit', 'finalize',
      'confirm', 'check.withdrawal', 'node.stop', 'owner.dispose'];
    expect(fixture.calls.filter(call => steps.includes(call))).toEqual(steps);
    expect(fixture.calls.filter(call => call === 'submit')).toHaveLength(1);
    expect(fixture.active).toBe('');
    const evidence = fixture.prepared.applicationCheckpoint.applicationRunner.executionResult.applicationEvidence;
    const statement = fixture.prepared.applicationCheckpoint.checkpoint.checkpointAttestation.checkpointStatement;
    expect(fixture.withdrawalClaim).toEqual({ trackerIdentity: {
      sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
      sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex, executionBlockHashHex: statement.executionBlockHashHex },
      burnLeaf: { sidechainIdHex: evidence.execution.sidechainIdHex, sidechainBlockHashHex: evidence.execution.blockHashHex,
        sidechainTxHashHex: evidence.execution.transactionHashHex, eventIndex: evidence.execution.eventIndex,
        burnIdHex: evidence.burn.burnIdHex, recipientErgoTreeHashHex: evidence.burn.recipientErgoTreeHashHex,
        amountNanoErg: evidence.burn.amountNanoErg, assetIdHex: fixture.assetIdHex },
      leafIndex: 0, leafCount: 1, burnProof: [], recipientErgoTreeHex: evidence.burn.recipientErgoTreeHex });
    expect(() => assertWithdrawalReceipt(result.receipt)).not.toThrow();
    expect(() => assertWithdrawalReceipt({ ...result.receipt })).toThrow(/provenance/);
    expect(() => assertReceipt(result.receipt)).toThrow(/provenance/);
    expect(() => assertReceipt(result.receipt.trackerCampaign)).toThrow(/provenance/);
    expect(result.receipt.status).toBe('local_withdrawal_v2_checked');
    expect(result.receipt.withdrawal.expectedTxId).toBe(fixture.withdrawal.packet.transaction.txId);
    expect(result.receipt.withdrawal.predecessorBoxIds).toHaveLength(3);
    expect(result.receipt.boundaries).toMatchObject({ withdrawalCheckedWithOriginalCustody: true,
      withdrawalTransportPerformed: false, canonicalPayoutObserved: false, payoutAuthorized: false,
      fundsAuthorityEstablished: false, gate5Closed: false });
  });

  it('keeps tracker-only receipts outside withdrawal provenance', async () => {
    const result = await run(input() as never);
    expect(fixture.setupInput).not.toHaveProperty('withdrawalCheck');
    expect(fixture.calls).not.toContain('check.withdrawal');
    expect(() => assertWithdrawalReceipt(result.receipt)).toThrow(/provenance/);
    expect(() => assertCompleteWithdrawalReceipt(result.receipt)).toThrow(/provenance/);
  });

  it.each(['accepted', 'ambiguous'] as const)('completes %s withdrawal in the live callback before cleanup', async status => {
    fixture.withdrawalSubmission.status = status;
    fixture.withdrawalSubmission.submittedTxId = status === 'accepted' ? fixture.withdrawalAttempt.expectedTxId : null;
    const result = await runCompleteWithdrawal(input() as never);
    const steps = ['confirm', 'check.withdrawal', 'authorize.withdrawal', 'reserve.withdrawal', 'submit.withdrawal',
      'finalize.withdrawal', 'wait.withdrawal', 'confirm.withdrawal', 'node.stop', 'owner.dispose'];
    expect(fixture.calls.filter(call => steps.includes(call))).toEqual(steps);
    expect(fixture.calls.filter(call => call === 'submit.withdrawal')).toHaveLength(1);
    expect(fixture.active).toBe('');
    expect(() => assertCompleteWithdrawalReceipt(result.receipt)).not.toThrow();
    for (const value of [{ ...result.receipt }, result.receipt.withdrawalCheck, result.receipt.withdrawalCheck.trackerCampaign]) {
      expect(() => assertCompleteWithdrawalReceipt(value)).toThrow(/provenance/);
    }
    expect(() => assertWithdrawalReceipt(result.receipt)).toThrow(/provenance/);
    expect(() => assertReceipt(result.receipt)).toThrow(/provenance/);
    expect(result.receipt.schema).toBe('e2s.substrate-federated-isolated-devnet-withdrawal-v2-campaign');
    expect(result.receipt.status).toBe('local_withdrawal_v2_canonically_confirmed');
    expect(result.receipt.withdrawal).toMatchObject({
      authorizationDigestHex: fixture.withdrawalAuthorization.authorizationDigestHex,
      durableAttemptDigestHex: fixture.withdrawalAttempt.durableAttemptDigestHex,
      transportStatus: status, journalDigestHex: '76'.repeat(32),
      confirmation: { expectedTxId: fixture.withdrawalAttempt.expectedTxId, confirmationHeight: 230,
        confirmationHeaderIdHex: '78'.repeat(32), observationDigestHex: '77'.repeat(32) },
      payoutBoxIdHex: fixture.withdrawal.packet.boxes.payout.boxId,
      reserveSuccessorBoxIdHex: fixture.withdrawal.packet.boxes.reserveSuccessor.boxId,
      duplicatePreventionSuccessorBoxIdHex: fixture.withdrawal.packet.boxes.duplicatePreventionSuccessor.boxId,
    });
    expect(result.receipt.boundaries).toMatchObject({ payoutAuthorized: true, withdrawalTransportPerformed: true,
      canonicalPayoutObserved: true, canonicalReserveSuccessorObserved: true, canonicalDuplicatePreventionSuccessorObserved: true,
      independentAttestorCustodyEstablished: false, operationalMintEnabled: false, globalReplayInsertionEstablished: false,
      fundsAuthorityEstablished: false, gate5Closed: false, trustlessStatusEstablished: false, productionReadinessEstablished: false });
  });

  it('keeps check-only results and calls outside completed withdrawal authority', async () => {
    const result = await runWithdrawal(input() as never);
    expect(() => assertCompleteWithdrawalReceipt(result.receipt)).toThrow(/provenance/);
    expect(fixture.calls).not.toContain('authorize.withdrawal');
    expect(fixture.calls).not.toContain('submit.withdrawal');
  });

  it.each(['authorize.withdrawal', 'reserve.withdrawal', 'submit.withdrawal', 'finalize.withdrawal',
    'wait.withdrawal', 'confirm.withdrawal'])(
    'fails closed at %s without issuing completed provenance', async fault => {
      fixture.fault = fault;
      await expect(runCompleteWithdrawal(input() as never)).rejects.toThrow(`injected ${fault}`);
      expect(fixture.calls).not.toContain('receipt');
      expect(fixture.calls.at(-1)).toBe('owner.dispose');
      expect(fixture.calls).toContain('node.stop'); expect(fixture.calls).toContain('state.close');
      expect(fixture.calls.filter(call => call === 'submit.withdrawal').length).toBeLessThanOrEqual(1);
    });

  it.each([{ expectedTxId: 'ff'.repeat(32) }, { status: 'accepted' },
    { confirmationHeight: null }, { confirmationHeaderId: null }])('rejects incomplete payout %j', async patch => {
    fixture.payoutPatch = patch;
    await expect(runCompleteWithdrawal(input() as never)).rejects.toThrow(/lacks exact confirmed payout/);
    expect(fixture.calls).not.toContain('receipt'); expect(fixture.calls).toContain('owner.dispose');
  });

  it.each(['authorize.withdrawal', 'submit.withdrawal', 'wait.withdrawal', 'confirm.withdrawal'])(
    'awaits %s without expiring target or disposing ownership', async stage => {
      fixture.gatedStep = stage;
      let release!: () => void;
      fixture.withdrawalGate = new Promise<void>(resolve => { release = resolve; });
      const pending = runCompleteWithdrawal(input() as never);
      await vi.waitFor(() => expect(fixture.calls).toContain(stage));
      expect(fixture.active).toBe('confirmation'); expect(fixture.calls).not.toContain('node.stop');
      expect(fixture.calls).not.toContain('receipt');
      release(); const result = await pending;
      expect(() => assertCompleteWithdrawalReceipt(result.receipt)).not.toThrow();
    });

  it.each(['node.stop', 'state.close', 'revoke.1', 'owner.dispose'])(
    'withholds completed withdrawal provenance when %s fails', async fault => {
      fixture.cleanupFault = fault;
      await expect(runCompleteWithdrawal(input() as never)).rejects.toThrow(/cleanup failed/);
      expect(() => assertCompleteWithdrawalReceipt(fixture.finalizedReceipt)).toThrow(/provenance/);
      expect(fixture.calls).toContain('revoke.4'); expect(fixture.calls).toContain('owner.dispose');
    });

  it.each(['missing', 'future', 'early-window'])(
    'rejects %s withdrawal fee confirmation before anchor work', async fault => {
      if (fault === 'missing') delete fixture.prepared.withdrawalFeeFunding;
      else if (fault === 'future') fixture.prepared.withdrawalFeeFunding.confirmationHeight = 201;
      else fixture.prepared.withdrawalFeeFunding.confirmationHeight = 199;
      if (fault === 'early-window') fixture.prepared.applicationCheckpoint.checkpoint.checkpointAttestation.checkpointStatement.admissionValidFromErgoHeight = '195';
      await expect(runWithdrawal(input() as never)).rejects.toThrow(/precedes confirmed withdrawal fee funding/);
      expect(fixture.calls).not.toContain('anchor'); expect(fixture.calls).not.toContain('submit');
    });

  it.each(['application-root', 'statement-root', 'application-count', 'statement-count', 'amount', 'event', 'asset'])(
    'rejects a burn claim with changed %s before anchor work', async fault => {
      const evidence = fixture.prepared.applicationCheckpoint.applicationRunner.executionResult.applicationEvidence;
      const statement = fixture.prepared.applicationCheckpoint.checkpoint.checkpointAttestation.checkpointStatement;
      if (fault === 'application-root') evidence.burn.bridgeEventRootHex = '0x' + 'ff'.repeat(32);
      if (fault === 'statement-root') statement.bridgeEventRootHex = 'ff'.repeat(32);
      if (fault === 'application-count') evidence.burn.burnLeafCount = 2;
      if (fault === 'statement-count') statement.burnLeafCount = 2;
      if (fault === 'amount') evidence.burn.amountNanoErg = '9000000';
      if (fault === 'event') evidence.execution.eventIndex = 4;
      if (fault === 'asset') fixture.assetIdHex = 'ff'.repeat(32);
      await expect(runWithdrawal(input() as never)).rejects.toThrow(/burn|root|asset/i);
      expect(fixture.calls).not.toContain('anchor'); expect(fixture.calls).not.toContain('submit');
    });

  it.each(['check.v2.retained', 'confirm', 'check.withdrawal'])(
    'does not issue a withdrawal receipt after %s failure', async fault => {
      fixture.fault = fault;
      await expect(runWithdrawal(input() as never)).rejects.toThrow(`injected ${fault}`);
      expect(fixture.calls).not.toContain('receipt');
      expect(fixture.calls).toContain('setup.dispose'); expect(fixture.calls).toContain('node.stop');
      if (fault !== 'check.withdrawal') expect(fixture.calls).not.toContain('check.withdrawal');
    });

  it.each(['application.dispose', 'setup.dispose', 'node.stop', 'state.close', 'owner.dispose'])(
    'withholds withdrawal provenance when %s cleanup fails', async fault => {
      fixture.cleanupFault = fault;
      await expect(runWithdrawal(input() as never)).rejects.toThrow(/cleanup failed/);
      expect(() => assertWithdrawalReceipt(fixture.finalizedReceipt)).toThrow(/provenance/);
      expect(fixture.calls).toContain('owner.dispose');
    });
});
