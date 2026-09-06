import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  calls: [] as string[], active: '', fault: '', cleanupFault: '',
  buildGate: undefined as Promise<void> | undefined,
  setupInput: undefined as Record<string, unknown> | undefined,
  finalizedReceipt: undefined as object | undefined,
  prepared: undefined as any,
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
  constructor() { step('state'); }
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
    expect(txId).toBe(fixture.attempt.expectedTxId); step('wait.confirmation'); return { observationDigestHex: '45'.repeat(32) };
  },
  finalizeReceipt: (body: object) => {
    step('receipt'); fixture.finalizedReceipt = Object.freeze({ ...body, receiptDigestHex: '46'.repeat(32) });
    return fixture.finalizedReceipt;
  },
}));

import { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot as run,
  assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt as assertReceipt }
  from './substrate-federated-isolated-devnet-tracker-v2-campaign-root.js';

function input() {
  return { build: {}, lifecycle: { sourceHistory: { acceptance: { bridgeAddress: 'bridge', tokenAddress: 'token' } } },
    requestBinding: {}, trackerTransportJournalRoot: 'synthetic-journal',
    pegIn: { amountNanoErg: '10000000', recipientAddressHex: '22'.repeat(20) }, frontierApplicationRunner: {} };
}

beforeEach(() => {
  fixture.calls.length = 0; fixture.active = ''; fixture.fault = ''; fixture.cleanupFault = '';
  fixture.buildGate = undefined; fixture.setupInput = undefined; fixture.finalizedReceipt = undefined;
  fixture.prepared = {
    batch: { request: { target: { genesisHeaderIdHex: '20'.repeat(32) }, requestDigestHex: '21'.repeat(32) } },
    compilerInput: { trackerRequest: {}, trackerReceipt: {} },
    packet: { receipt: { receiptDigestHex: '22'.repeat(32) } }, genesisTransactions: [],
    trackerInputBox: { boxId: '23'.repeat(32) },
    feeFunding: { expectedTxId: '24'.repeat(32), durableAttemptDigestHex: '25'.repeat(32),
      confirmationHeight: 190, confirmationHeaderIdHex: '26'.repeat(32), feeInputBox: { boxId: '27'.repeat(32) } },
    applicationCheckpoint: { checkpoint: { checkpointAttestation: { checkpointStatement: {
      encodedStatementHex: 'statement-v2', admissionValidFromErgoHeight: '200' } } } },
  };
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
});
