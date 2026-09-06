import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// These fixtures attest orchestration only. No mocked receipt is runtime authority.
const mocks = vi.hoisted(() => {
  const names = ['sourceHistory', 'rewards', 'ergoHistory', 'ownedRewards', 'rewardGuard',
    'targetGuard', 'packetGuard', 'batchGuard', 'replay', 'compiler', 'candidate', 'candidateGuard',
    'sourcePromote', 'vaultPromote', 'sourceAuthorizer', 'vaultAuthorization',
    'sourceTransport', 'vaultTransport', 'sourceJournal', 'vaultJournal', 'genesisJournal',
    'observer', 'sourceObserve', 'sourceGuard', 'vaultObserve', 'vaultGuard', 'draft',
    'evidence', 'checkpointGuard', 'genesis', 'fees', 'wait', 'materialize', 'profile'] as const;
  return Object.fromEntries(names.map(name => [name, vi.fn()])) as Record<typeof names[number], ReturnType<typeof vi.fn>>;
});
vi.mock('../../substrate-federated-authority-safe-devnet-history-v1.js', () => ({ collectSubstrateFederatedAuthoritySafeDevnetHistoryV1: mocks.sourceHistory }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js', () => ({ collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2: mocks.ergoHistory }));
vi.mock('../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js', () => ({
  discoverSubstrateFederatedRewardInputsV2: mocks.rewards,
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance: mocks.rewardGuard,
}));
vi.mock('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({ discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1: mocks.ownedRewards }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({ assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: mocks.targetGuard }));
vi.mock('../../substrate-federated-isolated-devnet-packet-producer-v1.js', () => ({ assertSubstrateFederatedIsolatedDevnetPacketV3Provenance: mocks.packetGuard }));
vi.mock('../../substrate-federated-isolated-devnet-portable-replay-v1.js', () => ({
  takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV2: mocks.replay,
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3: mocks.batchGuard,
  getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3: mocks.compiler,
  promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1: mocks.sourcePromote,
  promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1: mocks.vaultPromote,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js', () => ({
  buildSubstrateFederatedIsolatedDevnetPegInCandidateV2: mocks.candidate,
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV2: mocks.candidateGuard,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js', () => ({ createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV2: mocks.sourceAuthorizer }));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js', () => ({ createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV2: mocks.vaultAuthorization }));
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1: mocks.sourceTransport,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1: mocks.vaultTransport,
}));
vi.mock('../../substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js', () => ({ createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1: mocks.sourceJournal }));
vi.mock('../../substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js', () => ({ createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1: mocks.vaultJournal }));
vi.mock('../../substrate-federated-local-devnet-genesis-journal-v1.js', () => ({ createSubstrateFederatedLocalDevnetGenesisJournalV1: mocks.genesisJournal }));
vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', () => ({ createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: mocks.observer }));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js', () => ({
  observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV2: mocks.sourceObserve,
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationForCandidateV2: mocks.sourceGuard,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js', () => ({
  observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV2: mocks.vaultObserve,
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2: mocks.vaultGuard,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js', () => ({ buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2: mocks.draft }));
vi.mock('../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js', () => ({ collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV2: mocks.evidence }));
vi.mock('../../substrate-federated-isolated-devnet-source-attestation-session-v1.js', () => ({
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2: '1',
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2: 64,
}));
vi.mock('../../substrate-federated-settlement-family-v1.js', () => ({ decodeSubstrateFederatedSettlementFamilyV1Profile: mocks.profile }));
vi.mock('../../unsigned-ergo-transaction.js', () => ({ materializeUnsignedTransaction: mocks.materialize }));
vi.mock('./substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js', () => ({ assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance: mocks.checkpointGuard }));
vi.mock('./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', () => ({
  executeSubstrateFederatedIsolatedDevnetGenesisBatchV3: mocks.genesis,
  executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: mocks.fees,
  waitForCanonicalConfirmation: mocks.wait,
}));

import {
  executeSubstrateFederatedIsolatedDevnetManagedSetupV2 as execute,
  type ExecuteSubstrateFederatedIsolatedDevnetManagedSetupV2Input as Input,
} from './substrate-federated-isolated-devnet-managed-setup-v2.js';
import type { executeSubstrateFederatedIsolatedDevnetGenesisBatchV3 }
  from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';

const hex = (n: number) => n.toString(16).padStart(64, '0');
type GenesisReceiptRole = Awaited<ReturnType<typeof executeSubstrateFederatedIsolatedDevnetGenesisBatchV3>>[number]['role'];

function fixture() {
  const events: string[] = [];
  const record = <T>(name: string, value: T) => vi.fn(() => { events.push(name); return value; });
  const target = { primaryNodeOrigin: 'http://127.0.0.1:9053', witnessNodeOrigin: 'http://127.0.0.1:9054', primaryMining: true, witnessReadOnly: true };
  const signer = { publicKeyHex: hex(1), p2pkErgoTreeHex: '0008cd' + hex(1) };
  const binding = { processBindingDigestHex: hex(2), executionTargetIdentityDigestHex: hex(3) };
  const output = { boxId: hex(10), transactionId: hex(20), index: 0, creationHeight: 10 };
  const batch = {
    version: 3,
    receipt: { receiptDigestHex: hex(4) }, request: { target: { genesisHeaderIdHex: hex(5) } },
    targetBinding: binding,
    orderedTransactions: ['tracker', 'duplicate-prevention', 'pooled-reserve'].map((role, ordinal) => ({
      issuance: { ordinal, role, genesisInputBoxIdHex: hex(30 + ordinal), unsignedTransactionIdHex: hex(20 + ordinal),
        unsignedTransactionBody: { outputs: [output] }, predictedStateOutput: {
          boxIdHex: hex(10 + ordinal), transactionIdHex: hex(20 + ordinal), index: 0, creationHeight: 10,
        } },
    })),
  };
  const genesisReceiptRoles: readonly string[] = [
    'tracker', 'duplicatePrevention', 'pooledReserve',
  ] satisfies readonly GenesisReceiptRole[];
  const genesis = batch.orderedTransactions.map(({ issuance }, index) => ({ ordinal: issuance.ordinal,
    role: genesisReceiptRoles[index]!, expectedTxId: issuance.unsignedTransactionIdHex, confirmationHeight: 20,
    confirmationHeaderIdHex: hex(40), confirmationDigestHex: hex(41) }));
  const packet = { version: 3, receipt: { receiptDigestHex: hex(42) },
    portableReplayInput: { version: 2 }, replay: Object.freeze({ version: 2, reportDigestHex: hex(43) }) };
  const fundingBox = { boxId: hex(50), transactionId: hex(51), value: '100000000' };
  const funding = { observation: { target: { genesisHeaderIdHex: hex(5), tipHeight: 25 },
    sources: target, signer, genesisBoxIds: { tracker: hex(50), duplicate: hex(52), reserve: hex(53) },
    genesisInputs: { tracker: fundingBox, duplicate: { boxId: hex(52), transactionId: hex(54) },
      reserve: { boxId: hex(53), transactionId: hex(54) } } } };
  const sourceTx = { txId: hex(60), eip12Tx: { outputs: [{ creationHeight: 25 }] } };
  const vaultTx = { txId: hex(61), eip12Tx: { outputs: [{ creationHeight: 25 }] } };
  const deposit = { version: 2, boxes: { sourceFundingInput: fundingBox, reservePredecessor: { boxId: hex(12) },
    sourceLock: { boxId: hex(62) }, transitionFeeFunding: { boxId: hex(63) } },
    transactions: { sourceLockCreation: sourceTx, reserveTransition: vaultTx } };
  const candidate = { version: 2, depositPacket: deposit };
  const checkReceipt = (tx: string) => ({ status: 'PASS', unsignedTransactionIdHex: tx, signedTransactionIdHex: tx,
    signedTransactionCanonicalJsonSha256Hex: hex(65), target: binding, signer: { ...signer, stateContextTipHeight: 25 },
    checker: { nodeOrigin: target.primaryNodeOrigin }, boundaries: { localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true, submissionAuthorityEstablished: false, broadcastAuthorityEstablished: false,
      exactThreeInputTransitionBound: true, mintAuthorized: false } });
  const sourceReceipt = { ...checkReceipt(sourceTx.txId), sourceFundingBoxIdHex: fundingBox.boxId };
  const vaultReceipt = { ...checkReceipt(vaultTx.txId), reservePredecessorBoxIdHex: hex(12),
    sourceLockBoxIdHex: hex(62), transitionFeeFundingBoxIdHex: hex(63) };
  const sourceCheck = { receipt: sourceReceipt, signedCandidate: {}, checkedAcceptance: { submissionHandle: { checkResponseDigestHex: hex(66) } } };
  const vaultCheck = { receipt: vaultReceipt, signedCandidate: {}, checkedAcceptance: { submissionHandle: { checkResponseDigestHex: hex(67) } } };
  const confirmation = { status: 'confirmed', confirmationHeight: 20, confirmationHeaderIdHex: hex(40),
    observedAtHeight: 30, observationDigestHex: hex(68) };
  const sourceObservation = { ...confirmation, observationDigestHex: hex(69) };
  const vaultObservation = { ...confirmation, observationDigestHex: hex(70) };
  const draft = { version: 2, draftDigestHex: hex(71), statementIdHex: hex(72), reservationKeyHex: hex(73) };
  const evidence = { receiptDigestHex: hex(74) };
  const feeFunding = { feeInputBox: { boxId: hex(75) }, confirmationHeight: 25, confirmationHeaderIdHex: hex(76) };
  const checkedFunding = { transaction: { outputs: [feeFunding.feeInputBox] } };
  const application = { packet };
  const checkpoint = { version: 4, packet: { receipt: packet.receipt }, mintSourceProof: {
    packetReceiptDigestHex: packet.receipt.receiptDigestHex, sourceProof: { sourceEvidenceReceiptDigestHex: evidence.receiptDigestHex,
      mintReservationDraftDigestHex: draft.draftDigestHex, mintReservationStatementIdHex: draft.statementIdHex,
      mintIdentityHex: draft.reservationKeyHex } } };
  const continuation = { signer: { ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [signer.publicKeyHex] },
    produce: record('packet-v3', packet), executeApplication: record('application-v4', application),
    attestCheckpoint: record('attestation-v4', checkpoint), dispose: vi.fn() };
  const setupSession = { signer, runForExecutionV3RetainingPegInAndTrackerSigner: record('setup-v3', batch),
    checkPegInSourceLockV2RetainingSigner: record('source-check-v2', sourceReceipt),
    checkPegInCommittedVaultV2RetainingSigner: record('vault-check-v2', vaultReceipt),
    checkTrackerFeeFundingV3: record('fee-check-v3', checkedFunding), dispose: vi.fn() };
  const state = { close: vi.fn() };
  const input = { lifecycle: { sourceHistory: {}, relayerArtifacts: {} }, setupSession, continuation,
    expectedProfilePins: {}, target, pegIn: { amountNanoErg: '10000000', recipientAddressHex: '11'.repeat(20) },
    applicationRunner: { temporaryDirectoryRoot: 'test-source-build', cargoDependencyCacheDirectory: 'test-cargo-cache' },
    markerDirectory: 'test-attempt-markers', state, completionDeadline: 10_000_000 };
  const sourceHistory = {}, rewards = {}, ergoHistory = {}, observer = {};
  const family = { familyIdHex: hex(80) };
  mocks.profile.mockReturnValue({ sourceNetworkIdHex: hex(81), sidechainIdHex: hex(82), bridgeAddressHex: '22'.repeat(20),
    tokenAddressHex: '33'.repeat(20), settlementProfileIdHex: hex(83), settlementAssetIdHex: hex(84) });
  mocks.sourceHistory.mockImplementation(record('source-history', sourceHistory));
  mocks.rewards.mockImplementation(record('rewards', rewards));
  mocks.ergoHistory.mockImplementation(record('ergo-history', ergoHistory));
  const compilerInput = { familyReceipt: { profile: family }, trackerRequest: {}, trackerReceipt: {} };
  mocks.compiler.mockReturnValue(compilerInput);
  const replay = { sourceAndCompilerInput: {}, expectedSettlementGenesisHeaderIdHex: hex(77) };
  mocks.replay.mockImplementation(record('replay-v2', replay));
  mocks.genesis.mockImplementation(record('genesis-v3', genesis));
  mocks.ownedRewards.mockImplementation(record('funding-observation', funding));
  mocks.candidate.mockImplementation(record('candidate-v2', candidate));
  mocks.candidateGuard.mockReturnValue(deposit);
  mocks.sourcePromote.mockReturnValue(sourceCheck);
  mocks.vaultPromote.mockReturnValue(vaultCheck);
  mocks.observer.mockReturnValue(observer);
  const makeJournal = (kind: 'source' | 'vault') => ({
    journal: { reserve: record(`${kind}-reserve`, { durableAttemptDigestHex: hex(85), durableArtifact: {} }),
      finalize: vi.fn(({ submission }: { submission: { status: string } }) => {
        events.push(`${kind}-finalize`);
        return { status: submission.status, journalDigestHex: hex(86) };
      }) },
    reconcileActive: vi.fn().mockImplementationOnce(record(`${kind}-reconcile-empty`, 'none'))
      .mockImplementation(record(`${kind}-reconcile-confirmed`, 'confirmed')),
    revalidateConfirmed: record(`${kind}-revalidate-confirmed`, kind === 'source' ? 1 : [confirmation]),
  });
  const sourceJournal = makeJournal('source'), vaultJournal = makeJournal('vault');
  mocks.sourceJournal.mockReturnValue(sourceJournal);
  mocks.vaultJournal.mockReturnValue(vaultJournal);
  const sourceAuthorizer = { revalidationDigestHex: hex(87),
    authorize: record('source-authorize', { authorizationDigestHex: hex(88), authorizationArtifact: {} }) };
  const vaultAuthorization = { revalidator: { revalidate: record('vault-revalidate', { revalidationDigestHex: hex(89) }) },
    broadcastAuthorizer: { authorize: record('vault-authorize', { authorizationDigestHex: hex(90), authorizationArtifact: {} }) },
    takePreTransportObservation: record('vault-pre-transport-observation', {}) };
  mocks.sourceAuthorizer.mockReturnValue(sourceAuthorizer);
  mocks.vaultAuthorization.mockReturnValue(vaultAuthorization);
  const sourceTransport = { submit: record('source-submit', { status: 'accepted', submittedTxId: sourceTx.txId, responseDigestHex: hex(91) }) };
  const vaultTransport = { submit: record('vault-submit', { status: 'accepted', submittedTxId: vaultTx.txId, responseDigestHex: hex(92) }) };
  mocks.sourceTransport.mockReturnValue(sourceTransport);
  mocks.vaultTransport.mockReturnValue(vaultTransport);
  mocks.wait.mockImplementation((_observer, _txId, _deadline, stage: string) => { events.push(`confirm:${stage}`); return confirmation; });
  mocks.sourceObserve.mockImplementation(record('source-observe-v2', sourceObservation));
  mocks.vaultObserve.mockImplementation(record('vault-observe-v2', vaultObservation));
  mocks.draft.mockImplementation(record('draft-v2', draft));
  mocks.evidence.mockImplementation(record('evidence-v2', evidence));
  mocks.fees.mockImplementation(record('fees-confirmed', feeFunding));
  const genesisJournal = { revalidateConfirmed: record('genesis-revalidate', 3) };
  mocks.genesisJournal.mockReturnValue(genesisJournal);
  mocks.materialize.mockImplementation(record('tracker-materialize', { txId: hex(20), outputs: [output] }));
  return { input, events, packet, batch, genesis, deposit, candidate, funding, sourceReceipt, vaultReceipt,
    sourceCheck, vaultCheck, sourceJournal, vaultJournal, genesisJournal, sourceAuthorizer, vaultAuthorization,
    sourceTransport, vaultTransport, confirmation, sourceObservation, vaultObservation, draft, evidence,
    feeFunding, checkedFunding, application, checkpoint, output, sourceHistory, rewards, ergoHistory, observer, compilerInput, replay };
}

describe('managed setup V2 composition', () => {
  let f: ReturnType<typeof fixture>;
  const run = () => execute(f.input as unknown as Input);
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    f = fixture();
  });
  afterEach(() => vi.restoreAllMocks());

  it('retains exact V3/V2/V4 components and confirms fees before the fresh checkpoint window', async () => {
    const result = await run();
    expect(f.events).toEqual([
      'source-history', 'rewards', 'ergo-history', 'packet-v3', 'replay-v2', 'setup-v3', 'genesis-v3',
      'funding-observation', 'candidate-v2', 'funding-observation', 'source-check-v2',
      'funding-observation', 'funding-observation', 'source-reconcile-empty', 'source-authorize',
      'source-reserve', 'source-submit', 'source-finalize', 'confirm:source-lock',
      'source-reconcile-confirmed', 'source-revalidate-confirmed', 'source-observe-v2',
      'vault-check-v2', 'vault-reconcile-empty', 'vault-revalidate', 'vault-authorize',
      'vault-reserve', 'vault-submit', 'vault-finalize', 'vault-pre-transport-observation',
      'confirm:committed-vault', 'vault-reconcile-confirmed', 'vault-revalidate-confirmed',
      'vault-observe-v2', 'draft-v2', 'evidence-v2', 'application-v4', 'fee-check-v3',
      'fees-confirmed', 'confirm:application-checkpoint-admission', 'attestation-v4',
      'genesis-revalidate', 'confirm:setup-refresh:tracker', 'confirm:setup-refresh:duplicatePrevention',
      'confirm:setup-refresh:pooledReserve', 'tracker-materialize',
    ]);
    expect(result.packet).toBe(f.packet);
    expect(mocks.replay).toHaveBeenCalledWith(f.packet.replay);
    expect(result.batch).toBe(f.batch);
    expect(result.compilerInput).toBe(f.compilerInput);
    expect(mocks.compiler).toHaveBeenCalledWith(f.batch, f.input.target);
    expect(result.candidate).toBe(f.candidate);
    expect(result.sourceLockObservation).toBe(f.sourceObservation);
    expect(result.committedVaultObservation).toBe(f.vaultObservation);
    expect(result.mintDraft).toBe(f.draft);
    expect(result.sourceEvidence).toBe(f.evidence);
    expect(result.feeFunding).toEqual(f.feeFunding);
    expect(result.feeFunding.feeInputBox).toBe(f.feeFunding.feeInputBox);
    expect(result.applicationCheckpoint).toBe(f.checkpoint);
    expect(result.trackerInputBox).toBe(f.output);
    expect(result.genesisTransactions.map(tx => tx.expectedTxId)).toEqual(f.genesis.map(tx => tx.expectedTxId));
    expect(mocks.sourceHistory).toHaveBeenCalledWith(f.input.lifecycle.sourceHistory, {
      temporaryDirectoryRoot: f.input.applicationRunner.temporaryDirectoryRoot,
      sharedCargoHomeRoot: f.input.applicationRunner.cargoDependencyCacheDirectory,
    });
    expect(f.input.continuation.produce).toHaveBeenCalledWith({ sourceHistory: f.sourceHistory,
      ergoHistory: f.ergoHistory, expectedProfilePins: f.input.expectedProfilePins, relayerArtifacts: f.input.lifecycle.relayerArtifacts });
    expect(f.input.setupSession.runForExecutionV3RetainingPegInAndTrackerSigner).toHaveBeenCalledWith({
      sourceAndCompilerInput: f.replay.sourceAndCompilerInput,
      expectedSettlementGenesisHeaderIdHex: f.replay.expectedSettlementGenesisHeaderIdHex,
      primaryNodeOrigin: f.input.target.primaryNodeOrigin,
      witnessNodeOrigin: f.input.target.witnessNodeOrigin }, f.input.target);
    expect(f.input.setupSession.checkPegInSourceLockV2RetainingSigner).toHaveBeenCalledWith(f.deposit, f.input.target);
    expect(f.input.setupSession.checkPegInCommittedVaultV2RetainingSigner).toHaveBeenCalledWith(f.deposit, f.input.target);
    expect(mocks.sourceAuthorizer).toHaveBeenCalledWith({ target: f.input.target, batch: f.batch,
      candidate: f.candidate, executionCheck: f.sourceCheck, postCheck: f.funding, preTransport: f.funding });
    expect(mocks.vaultAuthorization).toHaveBeenCalledWith({ target: f.input.target, batch: f.batch,
      candidate: f.candidate, executionCheck: f.vaultCheck, sourceLockObservation: f.sourceObservation });
    expect(mocks.draft).toHaveBeenCalledWith({ target: f.input.target, batch: f.batch,
      candidate: f.candidate, committedVaultObservation: f.vaultObservation });
    expect(mocks.evidence).toHaveBeenCalledWith({ target: f.input.target, batch: f.batch,
      candidate: f.candidate, committedVaultObservation: f.vaultObservation, draft: f.draft });
    expect(f.input.continuation.executeApplication).toHaveBeenCalledWith(f.packet, {
      mintSourceProofInput: { draft: f.draft, evidenceReceipt: f.evidence, issuedAtNativeHeight: '1', expiresAtNativeHeight: '65' },
      applicationRunnerInput: f.input.applicationRunner }, f.input.completionDeadline);
    expect(mocks.fees).toHaveBeenCalledWith({ target: f.input.target, checked: f.checkedFunding, state: f.input.state });
    expect(f.input.continuation.attestCheckpoint).toHaveBeenCalledWith(f.application,
      { validFromErgoHeight: '30', expiresAtErgoHeight: '94' });
    expect(f.input.state.close).not.toHaveBeenCalled();
    expect(f.input.setupSession.dispose).not.toHaveBeenCalled();
    expect(f.input.continuation.dispose).not.toHaveBeenCalled();
  });

  it('awaits fee confirmation before refreshing the reserve or attesting', async () => {
    let resolveFunding!: (value: typeof f.feeFunding) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    mocks.fees.mockImplementation(() => { signalStarted(); return new Promise(resolve => { resolveFunding = resolve; }); });
    const pending = run();
    await started;
    expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
    expect(mocks.wait.mock.calls.some(call => call[3] === 'application-checkpoint-admission')).toBe(false);
    resolveFunding(f.feeFunding);
    await pending;
    expect(f.input.continuation.attestCheckpoint).toHaveBeenCalledOnce();
  });

  it.each(['sourceHistory', 'rewards', 'ergoHistory', 'replay', 'compiler', 'candidate', 'sourceAuthorizer', 'vaultAuthorization',
    'sourceObserve', 'vaultObserve', 'draft', 'evidence', 'fees'] as const)(
    'stops downstream application/attestation on %s failure without disposing caller custody', async name => {
      mocks[name].mockImplementation(() => { throw new Error(`blocked:${name}`); });
      await expect(run()).rejects.toThrow(`blocked:${name}`);
      expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
      if (name !== 'fees') expect(f.input.continuation.executeApplication).not.toHaveBeenCalled();
      expect(f.input.state.close).not.toHaveBeenCalled();
      expect(f.input.setupSession.dispose).not.toHaveBeenCalled();
    });

  it.each([
    ['missing height', { confirmationHeight: null }],
    ['nonintegral height', { confirmationHeight: 25.5 }],
    ['unsafe height', { confirmationHeight: Number.MAX_SAFE_INTEGER + 1 }],
    ['nonpositive height', { confirmationHeight: 0 }],
    ['missing header', { confirmationHeaderIdHex: null }],
    ['malformed header', { confirmationHeaderIdHex: 'ff' }],
  ])('rejects fee funding with %s before reserve refresh and attestation', async (_name, change) => {
    mocks.fees.mockReturnValue({ ...f.feeFunding, ...(change as object) });
    await expect(run()).rejects.toThrow('external-fee funding lacks canonical confirmation');
    expect(mocks.wait.mock.calls.some(call => call[3] === 'application-checkpoint-admission')).toBe(false);
    expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3])('rejects changed funding at post-observation %s before source transport', async observation => {
    const changed = structuredClone(f.funding);
    changed.observation.genesisInputs.tracker.value = '999';
    let calls = 0;
    mocks.ownedRewards.mockImplementation(() => calls++ === observation ? changed : f.funding);
    await expect(run()).rejects.toThrow('fresh funding observation changed');
    expect(f.sourceTransport.submit).not.toHaveBeenCalled();
    expect(f.input.setupSession.checkPegInCommittedVaultV2RetainingSigner).not.toHaveBeenCalled();
  });

  it.each(['unsignedTransactionIdHex', 'signedTransactionIdHex', 'sourceFundingBoxIdHex'] as const)(
    'rejects source check %s substitution before authorization', async field => {
      f.sourceReceipt[field] = hex(999);
      await expect(run()).rejects.toThrow(/check.*changed/);
      expect(mocks.sourceAuthorizer).not.toHaveBeenCalled();
    });

  it.each(['reservePredecessorBoxIdHex', 'sourceLockBoxIdHex', 'transitionFeeFundingBoxIdHex'] as const)(
    'rejects vault check %s substitution before authorization', async field => {
      f.vaultReceipt[field] = hex(999);
      await expect(run()).rejects.toThrow('committed vault check inputs changed');
      expect(mocks.vaultAuthorization).not.toHaveBeenCalled();
      expect(mocks.draft).not.toHaveBeenCalled();
    });

  it.each(['source', 'vault'] as const)('rejects %s reservation failure before transport', async kind => {
    f[`${kind}Journal`].journal.reserve.mockImplementation(() => { throw new Error('reservation failed'); });
    await expect(run()).rejects.toThrow('reservation failed');
    expect(f[`${kind}Transport`].submit).not.toHaveBeenCalled();
    expect(f.input.continuation.executeApplication).not.toHaveBeenCalled();
  });

  it.each(['source-lock', 'committed-vault', 'application-checkpoint-admission'])(
    'stops at failed canonical confirmation of %s', async stage => {
      mocks.wait.mockImplementation((_observer, _tx, _deadline, current) => {
        if (current === stage) throw new Error('confirmation failed');
        return f.confirmation;
      });
      await expect(run()).rejects.toThrow('confirmation failed');
      expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
      if (stage === 'source-lock') expect(mocks.sourceObserve).not.toHaveBeenCalled();
      if (stage === 'committed-vault') expect(mocks.vaultObserve).not.toHaveBeenCalled();
    });

  it.each(['confirmationHeight', 'confirmationHeaderIdHex'] as const)(
    'rejects changed reserve %s after fees without attesting', async field => {
      mocks.wait.mockImplementation((_observer, _tx, _deadline, stage) => stage === 'application-checkpoint-admission'
        ? { ...f.confirmation, [field]: field === 'confirmationHeight' ? 21 : hex(999) } : f.confirmation);
      await expect(run()).rejects.toThrow('committed reserve changed');
      expect(mocks.fees).toHaveBeenCalledOnce();
      expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
    });

  it('rejects a changed final genesis inclusion rather than returning tracker material', async () => {
    mocks.wait.mockImplementation((_observer, _tx, _deadline, stage) => stage === 'setup-refresh:tracker'
      ? { ...f.confirmation, confirmationHeaderIdHex: hex(999) } : f.confirmation);
    await expect(run()).rejects.toThrow('genesis canonical inclusion changed');
    expect(mocks.materialize).not.toHaveBeenCalled();
  });

  it('rejects changed tracker output identity on rematerialization', async () => {
    mocks.materialize.mockReturnValue({ txId: hex(20), outputs: [{ ...f.output, boxId: hex(999) }] });
    await expect(run()).rejects.toThrow('tracker genesis output identity changed');
  });

  it('rejects copied packet lineage at the V4 producer join', async () => {
    f.checkpoint.packet.receipt = { ...f.packet.receipt };
    await expect(run()).rejects.toThrow('application checkpoint lineage changed');
    expect(mocks.genesisJournal).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, 1_000])('rejects invalid initial deadline %s before external effects', async deadline => {
    f.input.completionDeadline = deadline;
    await expect(run()).rejects.toThrow('budget');
    expect(mocks.sourceHistory).not.toHaveBeenCalled();
  });

  it.each(['source', 'vault'] as const)('preserves a full confirmation budget immediately before %s transport', async kind => {
    f[`${kind}Journal`].journal.reserve.mockImplementation(() => {
      vi.mocked(performance.now).mockReturnValue(f.input.completionDeadline - 119_999);
      return { durableAttemptDigestHex: hex(85), durableArtifact: {} };
    });
    await expect(run()).rejects.toThrow('budget');
    expect(f[`${kind}Transport`].submit).not.toHaveBeenCalled();
    expect(mocks.wait.mock.calls.some(call => call[3] === (kind === 'source' ? 'source-lock' : 'committed-vault'))).toBe(false);
    expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
  });

  it('rechecks the full funding confirmation budget after the fee check', async () => {
    f.input.setupSession.checkTrackerFeeFundingV3.mockImplementation(() => {
      vi.mocked(performance.now).mockReturnValue(f.input.completionDeadline - 119_999);
      return f.checkedFunding;
    });
    await expect(run()).rejects.toThrow('budget');
    expect(mocks.fees).not.toHaveBeenCalled();
    expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
  });

  it.each(['packetGuard', 'batchGuard', 'candidateGuard', 'sourcePromote', 'vaultPromote',
    'sourceGuard', 'vaultGuard'] as const)('stops on %s provenance rejection', async name => {
    mocks[name].mockImplementation(() => { throw new Error('wrong version or process provenance'); });
    await expect(run()).rejects.toThrow('wrong version or process provenance');
    expect(f.input.continuation.executeApplication).not.toHaveBeenCalled();
    expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
  });

  it.each(['runForExecutionV3RetainingPegInAndTrackerSigner', 'checkPegInSourceLockV2RetainingSigner',
    'checkPegInCommittedVaultV2RetainingSigner', 'checkTrackerFeeFundingV3'] as const)(
    'does not continue after retained session %s rejects', async name => {
      f.input.setupSession[name].mockImplementation(() => { throw new Error('session rejected'); });
      await expect(run()).rejects.toThrow('session rejected');
      expect(mocks.fees).not.toHaveBeenCalled();
      expect(f.input.continuation.attestCheckpoint).not.toHaveBeenCalled();
      if (name !== 'checkTrackerFeeFundingV3') expect(f.input.continuation.executeApplication).not.toHaveBeenCalled();
    });

  it('does not fund fees after application execution fails', async () => {
    f.input.continuation.executeApplication.mockImplementation(() => { throw new Error('application failed'); });
    await expect(run()).rejects.toThrow('application failed');
    expect(f.input.setupSession.checkTrackerFeeFundingV3).not.toHaveBeenCalled();
    expect(mocks.fees).not.toHaveBeenCalled();
  });

  it('checks the caller deadline again after application execution', async () => {
    f.input.continuation.executeApplication.mockImplementation(() => {
      vi.mocked(performance.now).mockReturnValue(f.input.completionDeadline);
      return f.application;
    });
    await expect(run()).rejects.toThrow('budget');
    expect(f.input.setupSession.checkTrackerFeeFundingV3).not.toHaveBeenCalled();
  });

  it.each(['sourceEvidenceReceiptDigestHex', 'mintReservationDraftDigestHex',
    'mintReservationStatementIdHex', 'mintIdentityHex'] as const)(
    'rejects substituted checkpoint source proof %s', async field => {
      f.checkpoint.mintSourceProof.sourceProof[field] = hex(999);
      await expect(run()).rejects.toThrow('application checkpoint lineage changed');
      expect(mocks.genesisJournal).not.toHaveBeenCalled();
    });

  it('rejects mismatched continuation custody before collecting history', async () => {
    f.input.continuation.signer.ergoAdmissionPublicKeysHex = [hex(999)];
    await expect(run()).rejects.toThrow('exact setup signer');
    expect(mocks.sourceHistory).not.toHaveBeenCalled();
  });

  it('rejects a non-mining target before collecting history', async () => {
    f.input.target.primaryMining = false;
    await expect(run()).rejects.toThrow('owned mining target');
    expect(mocks.sourceHistory).not.toHaveBeenCalled();
  });

  it('rejects genesis identity drift before deposit construction', async () => {
    f.genesis[0]!.expectedTxId = hex(999);
    await expect(run()).rejects.toThrow('exact genesis lineage changed');
    expect(mocks.candidate).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'duplicatePrevention'], [1, 'duplicate-prevention'], [2, 'pooled-reserve'],
  ])('rejects the wrong executor receipt role at ordinal %s', async (index, role) => {
    f.genesis[index]!.role = role;
    await expect(run()).rejects.toThrow('exact genesis lineage changed');
    expect(mocks.ownedRewards).not.toHaveBeenCalled();
  });

  it('rejects lost durable genesis confirmations before returning', async () => {
    f.genesisJournal.revalidateConfirmed.mockReturnValue(2);
    await expect(run()).rejects.toThrow('genesis durable confirmation count changed');
    expect(mocks.materialize).not.toHaveBeenCalled();
  });

  it('rejects a tracker refresh preceding the attested window', async () => {
    mocks.wait.mockImplementation((_observer, _tx, _deadline, stage) => stage === 'setup-refresh:tracker'
      ? { ...f.confirmation, observedAtHeight: 29 } : f.confirmation);
    await expect(run()).rejects.toThrow('genesis canonical inclusion changed');
    expect(mocks.materialize).not.toHaveBeenCalled();
  });
});
