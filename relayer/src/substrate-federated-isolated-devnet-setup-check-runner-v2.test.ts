import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createExecutionSession: vi.fn(),
  registerSignerBinding: vi.fn(),
  revokeSignerBinding: vi.fn(),
  revokeMiningCredential: vi.fn(),
}));

vi.mock(
  './substrate-federated-isolated-devnet-setup-check-execution-v2.js',
  () => ({
    createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2:
      mocks.createExecutionSession,
  }),
);

vi.mock(
  './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js',
  () => ({
    registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2:
      mocks.registerSignerBinding,
    revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2:
      mocks.revokeSignerBinding,
  }),
);

vi.mock(
  './substrate-federated-isolated-devnet-mining-credential-v1.js',
  () => ({
    revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1:
      mocks.revokeMiningCredential,
  }),
);

import {
  claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2,
  claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
} from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';

const SIGNER = Object.freeze({
  publicKeyHex: '02'.padEnd(66, '1'),
  p2pkErgoTreeHex: '0008cd'.concat('02'.padEnd(66, '1')),
  rewardInputErgoTrees: Object.freeze({ delay1: '00', delay720: '01' }),
  networkPrefix: 16 as const,
});
const SIGNER_BINDING = Object.freeze({ ...SIGNER });
const MINING_CREDENTIAL = Object.freeze({ role: 'setup' });
const CHECKPOINT_CREDENTIAL = Object.freeze({ role: 'checkpoint' });
const TRACKER_ADMISSION_CREDENTIAL = Object.freeze({ role: 'tracker-admission' });
const TRACKER_CONFIRMATION_CREDENTIAL = Object.freeze({
  role: 'tracker-confirmation',
});
const SETUP_INPUT = Object.freeze({ primaryNodeOrigin: 'primary' });
const TARGET = Object.freeze({ target: 'owned' });
const SOURCE_LOCK_INPUT = Object.freeze({ source: 'lock' });
const COMMITTED_VAULT_INPUT = Object.freeze({ source: 'vault' });
const TRACKER_INPUT = Object.freeze({ source: 'tracker' });
const FRESH_TRACKER_INPUT = Object.freeze({ source: 'fresh-tracker' });
const SETUP_BATCH = Object.freeze({ stage: 'setup' });
const SOURCE_LOCK_RECEIPT = Object.freeze({ stage: 'source-lock' });
const COMMITTED_VAULT_RECEIPT = Object.freeze({ stage: 'committed-vault' });
const TRACKER_RECEIPT = Object.freeze({ stage: 'tracker' });
const FROZEN_TRACKER_RECEIPT = Object.freeze({ stage: 'frozen-tracker' });
const FRESHNESS_RECEIPT = Object.freeze({ stage: 'tracker-freshness' });
const V3_SETUP_INPUT = Object.freeze({ source: 'v3-setup' });
const V2_DEPOSIT_PACKET = Object.freeze({ source: 'v2-deposit' });
const V2_TRACKER_INPUT = Object.freeze({ source: 'v2-tracker' });
const V3_SETUP_BATCH = Object.freeze({ stage: 'v3-setup' });
const V2_SOURCE_LOCK_RECEIPT = Object.freeze({ stage: 'v2-source-lock' });
const V2_COMMITTED_VAULT_RECEIPT = Object.freeze({ stage: 'v2-committed-vault' });
const V3_FEE_CHECK = Object.freeze({ stage: 'v3-fee-check' });
const V3_WITHDRAWAL_FEE_CHECK = Object.freeze({ stage: 'v3-withdrawal-fee-check' });
const V2_TRACKER_CHECK = Object.freeze({ stage: 'v2-tracker-check' });
const WITHDRAWAL_CLAIM = Object.freeze({ source: 'withdrawal-claim' });
const WITHDRAWAL_CHECK = Object.freeze({ stage: 'withdrawal-check' });
const NATIVE_COMPILED = Object.freeze({ source: 'native-compiled' });
const NATIVE_SETUP_BATCH = Object.freeze({ stage: 'native-setup' });
const NATIVE_DEPOSIT_PACKET = Object.freeze({ source: 'native-deposit' });
const NATIVE_CONTINUATION_PACKET = Object.freeze({ source: 'native-continuation-deposit' });
const NATIVE_SOURCE_LOCK_RECEIPT = Object.freeze({ stage: 'native-source-lock' });
const NATIVE_COMMITTED_VAULT_RECEIPT = Object.freeze({ stage: 'native-committed-vault' });
const NATIVE_WITHDRAWAL_FEE_CHECK = Object.freeze({ stage: 'native-withdrawal-fee' });
const NATIVE_TRACKER_FEE_CHECK = Object.freeze({ stage: 'native-tracker-fee' });
const NATIVE_CONTINUATION_SOURCE_LOCK_RECEIPT = Object.freeze({ stage: 'native-continuation-source-lock' });
const NATIVE_CONTINUATION_VAULT_RECEIPT = Object.freeze({ stage: 'native-continuation-vault' });
const NATIVE_CONTINUATION_WITHDRAWAL_FEE_CHECK = Object.freeze({ stage: 'native-continuation-withdrawal-fee' });
const NATIVE_CONTINUATION_TRACKER_FEE_CHECK = Object.freeze({ stage: 'native-continuation-tracker-fee' });
const FOREIGN_TARGET = Object.freeze({ target: 'foreign' });

type FacadeSession = Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>>;
const MANAGED_PHASES = [
  {
    method: 'runForExecutionV3RetainingPegInAndTrackerSigner',
    args: [V3_SETUP_INPUT, TARGET], result: V3_SETUP_BATCH,
    invoke: (session: FacadeSession) => session.runForExecutionV3RetainingPegInAndTrackerSigner(V3_SETUP_INPUT as never, TARGET as never),
  },
  {
    method: 'checkPegInSourceLockV2RetainingSigner',
    args: [V2_DEPOSIT_PACKET, TARGET], result: V2_SOURCE_LOCK_RECEIPT,
    invoke: (session: FacadeSession) => session.checkPegInSourceLockV2RetainingSigner(V2_DEPOSIT_PACKET as never, TARGET as never),
  },
  {
    method: 'checkPegInCommittedVaultV2RetainingSigner',
    args: [V2_DEPOSIT_PACKET, TARGET], result: V2_COMMITTED_VAULT_RECEIPT,
    invoke: (session: FacadeSession) => session.checkPegInCommittedVaultV2RetainingSigner(V2_DEPOSIT_PACKET as never, TARGET as never),
  },
  {
    method: 'checkTrackerFeeFundingV3',
    args: [TARGET], result: V3_FEE_CHECK,
    invoke: (session: FacadeSession) => session.checkTrackerFeeFundingV3(TARGET as never),
  },
  {
    method: 'checkFrozenTrackerV2Candidate',
    args: [V2_TRACKER_INPUT, TARGET], result: V2_TRACKER_CHECK,
    invoke: (session: FacadeSession) => session.checkFrozenTrackerV2Candidate(V2_TRACKER_INPUT as never, TARGET as never),
  },
] as const;
const LEGACY_METHODS = [
  'run', 'runForExecution', 'runForExecutionRetainingPegInSigner',
  'checkPegInSourceLock', 'checkPegInSourceLockRetainingSigner',
  'checkPegInCommittedVault', 'checkPegInCommittedVaultRetainingSigner',
  'checkTrackerCandidate', 'checkFrozenTrackerCandidate',
  'recheckTrackerReservationFreshnessCandidate',
] as const;

describe('isolated setup-check runner V2 lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerSignerBinding.mockReturnValue(SIGNER_BINDING);
  });

  it('orders every retained check and revokes the continuation after success', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    await expect(session.runForExecutionRetainingPegInSigner(
      SETUP_INPUT as never,
      TARGET as never,
    )).resolves.toBe(SETUP_BATCH);
    await expect(session.checkPegInSourceLockRetainingSigner(
      SOURCE_LOCK_INPUT as never,
      TARGET as never,
    )).resolves.toBe(SOURCE_LOCK_RECEIPT);
    await expect(session.checkPegInCommittedVaultRetainingSigner(
      COMMITTED_VAULT_INPUT as never,
      TARGET as never,
    )).resolves.toBe(COMMITTED_VAULT_RECEIPT);
    await expect(session.checkTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    )).resolves.toBe(TRACKER_RECEIPT);

    expect(execution.runForExecutionRetainingPegInSigner)
      .toHaveBeenCalledWith(SETUP_INPUT, TARGET);
    expect(execution.checkPegInSourceLockRetainingSigner)
      .toHaveBeenCalledWith(SOURCE_LOCK_INPUT, TARGET);
    expect(execution.checkPegInCommittedVaultRetainingSigner)
      .toHaveBeenCalledWith(COMMITTED_VAULT_INPUT, TARGET);
    expect(execution.checkTrackerCandidate)
      .toHaveBeenCalledWith(TRACKER_INPUT, TARGET);
    await expect(session.checkTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/continuation is absent, consumed, or disposed/);

    session.dispose();
    expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledWith(CHECKPOINT_CREDENTIAL);
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledWith(TRACKER_ADMISSION_CREDENTIAL);
    expect(execution.dispose).toHaveBeenCalledOnce();
  });

  it('closes every retained capability when tracker checking fails', async () => {
    const execution = executionSession();
    execution.checkTrackerCandidate.mockRejectedValueOnce(
      new Error('injected tracker check failure'),
    );
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    await session.runForExecutionRetainingPegInSigner(
      SETUP_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInSourceLockRetainingSigner(
      SOURCE_LOCK_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInCommittedVaultRetainingSigner(
      COMMITTED_VAULT_INPUT as never,
      TARGET as never,
    );
    await expect(session.checkTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/injected tracker check failure/);

    expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledWith(CHECKPOINT_CREDENTIAL);
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledWith(TRACKER_ADMISSION_CREDENTIAL);
    expect(execution.dispose).toHaveBeenCalledOnce();
    await expect(session.checkTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/continuation is absent, consumed, or disposed/);
    session.dispose();
    expect(execution.dispose).toHaveBeenCalledOnce();
  });

  it('routes the frozen tracker check through the same one-shot continuation', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    await session.runForExecutionRetainingPegInSigner(
      SETUP_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInSourceLockRetainingSigner(
      SOURCE_LOCK_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInCommittedVaultRetainingSigner(
      COMMITTED_VAULT_INPUT as never,
      TARGET as never,
    );
    await expect(session.checkFrozenTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    )).resolves.toBe(FROZEN_TRACKER_RECEIPT);

    expect(execution.checkFrozenTrackerCandidate)
      .toHaveBeenCalledExactlyOnceWith(TRACKER_INPUT, TARGET);
    await expect(session.checkTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/continuation is absent, consumed, or disposed/);
    expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
    await expect(session.recheckTrackerReservationFreshnessCandidate(
      FRESH_TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/continuation is absent, consumed, or disposed/);
    session.dispose();
    expect(execution.dispose).toHaveBeenCalledOnce();
  });

  it('closes retained capabilities when freshness is requested out of order', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    await expect(session.recheckTrackerReservationFreshnessCandidate(
      FRESH_TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/continuation is absent, consumed, or disposed/);

    expect(execution.recheckTrackerReservationFreshnessCandidate)
      .not.toHaveBeenCalled();
    expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledWith(CHECKPOINT_CREDENTIAL);
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledWith(TRACKER_ADMISSION_CREDENTIAL);
    expect(execution.dispose).toHaveBeenCalledOnce();
    await expect(session.runForExecutionRetainingPegInSigner(
      SETUP_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/already consumed or disposed/);
  });

  it('cannot reopen a session invalidated by a concurrent transition', async () => {
    const pendingFrozenCheck = deferred<typeof FROZEN_TRACKER_RECEIPT>();
    const execution = executionSession();
    execution.checkFrozenTrackerCandidate.mockImplementationOnce(
      () => pendingFrozenCheck.promise,
    );
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    await session.runForExecutionRetainingPegInSigner(
      SETUP_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInSourceLockRetainingSigner(
      SOURCE_LOCK_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInCommittedVaultRetainingSigner(
      COMMITTED_VAULT_INPUT as never,
      TARGET as never,
    );
    const frozenCheck = session.checkFrozenTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    );
    const frozenCheckRejection = expect(frozenCheck).rejects.toThrow(
      /invalidated by a concurrent transition/,
    );
    await vi.waitFor(() =>
      expect(execution.checkFrozenTrackerCandidate).toHaveBeenCalledOnce()
    );

    await expect(session.recheckTrackerReservationFreshnessCandidate(
      FRESH_TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/continuation is absent, consumed, or disposed/);
    expect(execution.recheckTrackerReservationFreshnessCandidate)
      .not.toHaveBeenCalled();

    pendingFrozenCheck.resolve(FROZEN_TRACKER_RECEIPT);
    await frozenCheckRejection;
    expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
    expect(execution.dispose).toHaveBeenCalledOnce();
    await expect(session.recheckTrackerReservationFreshnessCandidate(
      FRESH_TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/continuation is absent, consumed, or disposed/);
  });

  it('retains the signer for exactly one reservation-freshness recheck', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    await session.runForExecutionRetainingPegInSigner(
      SETUP_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInSourceLockRetainingSigner(
      SOURCE_LOCK_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInCommittedVaultRetainingSigner(
      COMMITTED_VAULT_INPUT as never,
      TARGET as never,
    );
    await session.checkFrozenTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    );
    await expect(session.recheckTrackerReservationFreshnessCandidate(
      FRESH_TRACKER_INPUT as never,
      TARGET as never,
    )).resolves.toBe(FRESHNESS_RECEIPT);

    expect(execution.recheckTrackerReservationFreshnessCandidate)
      .toHaveBeenCalledExactlyOnceWith(FRESH_TRACKER_INPUT, TARGET);
    await expect(session.recheckTrackerReservationFreshnessCandidate(
      FRESH_TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/continuation is absent, consumed, or disposed/);
    expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledWith(CHECKPOINT_CREDENTIAL);
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledWith(TRACKER_ADMISSION_CREDENTIAL);
    expect(execution.dispose).toHaveBeenCalledOnce();
  });

  it('closes every retained capability when the freshness recheck fails', async () => {
    const execution = executionSession();
    execution.recheckTrackerReservationFreshnessCandidate.mockRejectedValueOnce(
      new Error('injected freshness failure'),
    );
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    await session.runForExecutionRetainingPegInSigner(
      SETUP_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInSourceLockRetainingSigner(
      SOURCE_LOCK_INPUT as never,
      TARGET as never,
    );
    await session.checkPegInCommittedVaultRetainingSigner(
      COMMITTED_VAULT_INPUT as never,
      TARGET as never,
    );
    await session.checkFrozenTrackerCandidate(
      TRACKER_INPUT as never,
      TARGET as never,
    );
    await expect(session.recheckTrackerReservationFreshnessCandidate(
      FRESH_TRACKER_INPUT as never,
      TARGET as never,
    )).rejects.toThrow(/injected freshness failure/);

    expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
    expect(execution.dispose).toHaveBeenCalledOnce();
  });

  it('hands off the four ordered mining credentials atomically', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    expect(
      claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(session),
    ).toEqual({
      miningCredential: MINING_CREDENTIAL,
      checkpointMiningCredential: CHECKPOINT_CREDENTIAL,
      trackerAdmissionMiningCredential: TRACKER_ADMISSION_CREDENTIAL,
      trackerConfirmationMiningCredential: TRACKER_CONFIRMATION_CREDENTIAL,
    });
    expect(execution.claimCheckpointMiningCredential).toHaveBeenCalledOnce();
    expect(execution.claimTrackerAdmissionMiningCredential).toHaveBeenCalledOnce();
    expect(execution.claimTrackerConfirmationMiningCredential)
      .toHaveBeenCalledOnce();
    expect(() =>
      claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(session)
    ).toThrow(/absent, partially claimed, or disposed/);

    session.dispose();
    expect(mocks.revokeMiningCredential).not.toHaveBeenCalled();
  });

  it('revokes a partially claimed credential sequence', async () => {
    const execution = executionSession();
    execution.claimTrackerAdmissionMiningCredential.mockImplementationOnce(
      () => {
        throw new Error('injected tracker credential failure');
      },
    );
    mocks.createExecutionSession.mockResolvedValue(execution);

    await expect(createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2())
      .rejects.toThrow(/injected tracker credential failure/);
    expect(mocks.revokeMiningCredential)
      .toHaveBeenCalledExactlyOnceWith(CHECKPOINT_CREDENTIAL);
    expect(mocks.revokeSignerBinding)
      .toHaveBeenCalledExactlyOnceWith(SIGNER_BINDING);
    expect(execution.dispose).toHaveBeenCalledOnce();
  });
});

describe('managed native continuation fee funding lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerSignerBinding.mockReturnValue(SIGNER_BINDING);
  });

  it('dispatches the two continuation fee checks exactly once and in order', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await advanceNativeContinuationToVault(session);

    await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never))
      .resolves.toBe(NATIVE_CONTINUATION_WITHDRAWAL_FEE_CHECK);
    await expect(session.checkNativeContinuationTrackerFeeFundingV1(TARGET as never))
      .resolves.toBe(NATIVE_CONTINUATION_TRACKER_FEE_CHECK);

    expect(execution.checkNativeContinuationWithdrawalFeeFundingV1)
      .toHaveBeenCalledExactlyOnceWith(TARGET);
    expect(execution.checkNativeContinuationTrackerFeeFundingV1)
      .toHaveBeenCalledExactlyOnceWith(TARGET);
    expect(execution.checkNativeContinuationWithdrawalFeeFundingV1.mock.invocationCallOrder[0])
      .toBeLessThan(execution.checkNativeContinuationTrackerFeeFundingV1.mock.invocationCallOrder[0]!);
    session.dispose();
    expect(execution.dispose).toHaveBeenCalledOnce();
  });

  it.each(['checkNativeWithdrawalFeeFundingV1', 'checkNativeTrackerFeeFundingV1'] as const)(
    'rejects the old one-shot %s after the continuation vault', async method => {
      const execution = executionSession();
      mocks.createExecutionSession.mockResolvedValue(execution);
      const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
      await advanceNativeContinuationToVault(session);

      await expect(session[method](TARGET as never)).rejects.toThrow(/continuation is absent, consumed, or disposed/);
      expect(execution[method]).toHaveBeenCalledOnce();
      expect(execution.checkNativeContinuationWithdrawalFeeFundingV1).not.toHaveBeenCalled();
      await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never))
        .rejects.toThrow(/continuation is absent, consumed, or disposed/);
    },
  );

  it('does not reopen or reuse a completed continuation withdrawal fee transition', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await advanceNativeContinuationToVault(session);
    await session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never);

    await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never))
      .rejects.toThrow(/continuation is absent, consumed, or disposed/);
    expect(execution.checkNativeContinuationWithdrawalFeeFundingV1).toHaveBeenCalledOnce();
    expect(execution.checkNativeContinuationTrackerFeeFundingV1).not.toHaveBeenCalled();
  });

  it('rejects a disposed continuation before inner fee checking', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await advanceNativeContinuationToVault(session);
    session.dispose();

    await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never))
      .rejects.toThrow(/continuation is absent, consumed, or disposed/);
    expect(execution.checkNativeContinuationWithdrawalFeeFundingV1).not.toHaveBeenCalled();
  });

  it('forwards a foreign target once, closes on rejection, and never retries it', async () => {
    const execution = executionSession();
    execution.checkNativeContinuationWithdrawalFeeFundingV1.mockImplementationOnce(async target => {
      if (target !== TARGET) throw new Error('synthetic foreign continuation fee target');
      return NATIVE_CONTINUATION_WITHDRAWAL_FEE_CHECK;
    });
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await advanceNativeContinuationToVault(session);

    await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(FOREIGN_TARGET as never))
      .rejects.toThrow(/foreign continuation fee target/);
    expect(execution.checkNativeContinuationWithdrawalFeeFundingV1)
      .toHaveBeenCalledExactlyOnceWith(FOREIGN_TARGET);
    await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never))
      .rejects.toThrow(/continuation is absent, consumed, or disposed/);
    expect(execution.checkNativeContinuationWithdrawalFeeFundingV1).toHaveBeenCalledOnce();
  });

  it('terminally invalidates concurrent continuation fee use', async () => {
    const execution = executionSession();
    const gate = deferred<typeof NATIVE_CONTINUATION_WITHDRAWAL_FEE_CHECK>();
    execution.checkNativeContinuationWithdrawalFeeFundingV1.mockImplementationOnce(() => gate.promise);
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await advanceNativeContinuationToVault(session);

    const pending = session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never);
    await expect(session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never))
      .rejects.toThrow(/continuation is absent, consumed, or disposed/);
    gate.resolve(NATIVE_CONTINUATION_WITHDRAWAL_FEE_CHECK);
    await expect(pending).rejects.toThrow(/invalidated by a concurrent transition/);
    expect(execution.checkNativeContinuationWithdrawalFeeFundingV1).toHaveBeenCalledOnce();
    await expect(session.checkNativeContinuationTrackerFeeFundingV1(TARGET as never))
      .rejects.toThrow(/continuation is absent, consumed, or disposed/);
  });

  it('closes both continuations when the second fee check fails', async () => {
    const execution = executionSession();
    execution.checkNativeContinuationTrackerFeeFundingV1.mockRejectedValueOnce(
      new Error('synthetic continuation tracker fee failure'),
    );
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await advanceNativeContinuationToVault(session);
    await session.checkNativeContinuationWithdrawalFeeFundingV1(TARGET as never);

    await expect(session.checkNativeContinuationTrackerFeeFundingV1(TARGET as never))
      .rejects.toThrow(/continuation tracker fee failure/);
    await expect(session.checkNativeContinuationTrackerFeeFundingV1(TARGET as never))
      .rejects.toThrow(/continuation is absent, consumed, or disposed/);
    expect(execution.dispose).toHaveBeenCalledOnce();
  });
});

describe('managed facade V3 setup -> V2 tracker admission continuation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerSignerBinding.mockReturnValue(SIGNER_BINDING);
  });

  it.each(['valid', 'before-tracker', 'tracker-only', 'disposed', 'failure', 'concurrent', 'legacy-interleave',
    'dispose-during-tracker', 'dispose-during-check'] as const)(
    'retains the full withdrawal continuation only in order: %s', async fault => {
      const execution = executionSession();
      mocks.createExecutionSession.mockResolvedValue(execution);
      const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
      try {
        for (const phase of MANAGED_PHASES.slice(0, 3)) await phase.invoke(session);
        await session.checkWithdrawalFeeFundingV3(TARGET as never);
        await session.checkTrackerFeeFundingV3(TARGET as never);
        if (fault === 'tracker-only') await session.checkFrozenTrackerV2Candidate(V2_TRACKER_INPUT as never, TARGET as never);
        else if (fault !== 'before-tracker') {
          if (fault === 'dispose-during-tracker') {
            const gate = deferred<typeof V2_TRACKER_CHECK>();
            execution.checkFrozenTrackerV2CandidateRetainingWithdrawalSigner.mockImplementationOnce(() => gate.promise);
            const pending = session.checkFrozenTrackerV2CandidateRetainingWithdrawalSigner(V2_TRACKER_INPUT as never, TARGET as never);
            expect(() => session.dispose()).toThrow(/running/);
            gate.resolve(V2_TRACKER_CHECK);
            await expect(pending).rejects.toThrow(/invalidated/);
            expect(execution.dispose).toHaveBeenCalledOnce();
            await expect(session.checkWithdrawalV2(WITHDRAWAL_CLAIM as never, TARGET as never)).rejects.toThrow(/continuation/);
            return;
          }
          expect(await session.checkFrozenTrackerV2CandidateRetainingWithdrawalSigner(V2_TRACKER_INPUT as never, TARGET as never))
            .toBe(V2_TRACKER_CHECK);
          expect(execution.checkFrozenTrackerV2CandidateRetainingWithdrawalSigner).toHaveBeenCalledWith(V2_TRACKER_INPUT, TARGET);
          expect(execution.dispose).not.toHaveBeenCalled();
        }
        if (fault === 'disposed') session.dispose();
        if (fault === 'failure') execution.checkWithdrawalV2.mockRejectedValueOnce(new Error('synthetic complete withdrawal rejected'));
        if (fault === 'legacy-interleave') {
          await expect(session.checkFrozenTrackerV2Candidate(V2_TRACKER_INPUT as never, TARGET as never)).rejects.toThrow(/continuation/);
        }
        const gate = deferred<typeof WITHDRAWAL_CHECK>();
        if (fault === 'concurrent' || fault === 'dispose-during-check') execution.checkWithdrawalV2.mockImplementationOnce(() => gate.promise);
        const pending = session.checkWithdrawalV2(WITHDRAWAL_CLAIM as never, TARGET as never);
        if (fault === 'concurrent') {
          await expect(session.checkWithdrawalV2(WITHDRAWAL_CLAIM as never, TARGET as never)).rejects.toThrow(/continuation/);
          gate.resolve(WITHDRAWAL_CHECK);
        }
        if (fault === 'dispose-during-check') {
          expect(() => session.dispose()).toThrow(/running/);
          gate.resolve(WITHDRAWAL_CHECK);
        }
        if (fault === 'valid') {
          expect(await pending).toBe(WITHDRAWAL_CHECK);
          expect(execution.checkWithdrawalV2).toHaveBeenCalledWith(WITHDRAWAL_CLAIM, TARGET);
        } else {
          await expect(pending).rejects.toThrow(fault === 'failure' ? /synthetic complete withdrawal rejected/ : /continuation|invalidated/);
        }
        expect(execution.dispose).toHaveBeenCalledOnce();
        expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
        await expect(session.checkWithdrawalV2(WITHDRAWAL_CLAIM as never, TARGET as never)).rejects.toThrow(/continuation/);
        await expect(session.checkFrozenTrackerV2CandidateRetainingWithdrawalSigner(V2_TRACKER_INPUT as never, TARGET as never)).rejects.toThrow(/continuation/);
      } finally { session.dispose(); }
    },
  );

  it.each(['valid', 'before-vault', 'repeat', 'disposed', 'failure', 'concurrent', 'legacy-interleave'] as const)(
    'retains the managed withdrawal fee continuation only in order: %s', async fault => {
      const execution = executionSession();
      mocks.createExecutionSession.mockResolvedValue(execution);
      const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
      try {
        for (const phase of MANAGED_PHASES.slice(0, fault === 'before-vault' ? 2 : 3)) await phase.invoke(session);
        if (fault === 'disposed') session.dispose();
        if (fault === 'failure') execution.checkWithdrawalFeeFundingV3.mockRejectedValueOnce(new Error('synthetic withdrawal check failed'));
        const gate = deferred<typeof V3_WITHDRAWAL_FEE_CHECK>();
        if (fault === 'concurrent') execution.checkWithdrawalFeeFundingV3.mockImplementationOnce(() => gate.promise);
        const pending = session.checkWithdrawalFeeFundingV3(TARGET as never);
        if (fault === 'concurrent') {
          await expect(session.checkWithdrawalFeeFundingV3(TARGET as never)).rejects.toThrow(/continuation/);
          gate.resolve(V3_WITHDRAWAL_FEE_CHECK);
        }
        if (['before-vault', 'disposed', 'failure', 'concurrent'].includes(fault)) {
          await expect(pending).rejects.toThrow(fault === 'failure' ? /synthetic withdrawal check failed/ : /continuation|invalidated/);
          expect(execution.checkTrackerFeeFundingV3).not.toHaveBeenCalled();
          return;
        }
        expect(await pending).toBe(V3_WITHDRAWAL_FEE_CHECK);
        expect(execution.checkWithdrawalFeeFundingV3).toHaveBeenCalledWith(TARGET);
        if (fault === 'repeat' || fault === 'legacy-interleave') {
          await expect(fault === 'repeat' ? session.checkWithdrawalFeeFundingV3(TARGET as never)
            : session.checkPegInCommittedVaultRetainingSigner(COMMITTED_VAULT_INPUT as never, TARGET as never)).rejects.toThrow(/continuation/);
          await expect(session.checkTrackerFeeFundingV3(TARGET as never)).rejects.toThrow(/continuation/);
          return;
        }
        for (const phase of MANAGED_PHASES.slice(3)) expect(await phase.invoke(session)).toBe(phase.result);
        expect(execution.dispose).toHaveBeenCalledTimes(1);
      } finally { session.dispose(); }
    },
  );

  it.each(['unclaimed', 'pair', 'sequence'] as const)(
    'preserves exact arguments, results and dispatch order with %s mining credentials', async custody => {
      const { session, execution } = await managedFacade();
      if (custody === 'pair') {
        const pair = claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2(session);
        expect(pair.miningCredential).toBe(MINING_CREDENTIAL);
        expect(pair.checkpointMiningCredential).toBe(CHECKPOINT_CREDENTIAL);
      } else if (custody === 'sequence') {
        const sequence = claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(session);
        expect(sequence.miningCredential).toBe(MINING_CREDENTIAL);
        expect(sequence.checkpointMiningCredential).toBe(CHECKPOINT_CREDENTIAL);
        expect(sequence.trackerAdmissionMiningCredential).toBe(TRACKER_ADMISSION_CREDENTIAL);
        expect(sequence.trackerConfirmationMiningCredential).toBe(TRACKER_CONFIRMATION_CREDENTIAL);
      }
      let precedingCall = 0;
      for (const [index, phase] of MANAGED_PHASES.entries()) {
        await expect(phase.invoke(session)).resolves.toBe(phase.result);
        const inner = execution[phase.method];
        expect(inner).toHaveBeenCalledOnce();
        const args = inner.mock.calls[0]! as readonly unknown[];
        expect(args).toHaveLength(phase.args.length);
        phase.args.forEach((value, argument) => expect(args[argument]).toBe(value));
        const callOrder = inner.mock.invocationCallOrder[0]!;
        expect(callOrder).toBeGreaterThan(precedingCall);
        precedingCall = callOrder;
        if (index < MANAGED_PHASES.length - 1) {
          expect(execution.dispose).not.toHaveBeenCalled();
          expect(mocks.revokeSignerBinding).not.toHaveBeenCalled();
          expect(mocks.revokeMiningCredential).not.toHaveBeenCalled();
        }
      }
      expectManagedCleanup(execution, custody);
      await expectManagedClosed(session, execution);
    },
  );

  it.each(MANAGED_PHASES.map((phase, completed) => ({ phase: phase.method, completed })))(
    'disposes the idle session before $phase', async ({ completed }) => {
      const { session, execution } = await managedFacade();
      await advanceManaged(session, completed);
      session.dispose();
      expectManagedCleanup(execution);
      await expectManagedClosed(session, execution);
    },
  );

  it.each(MANAGED_PHASES.map((phase, completed) => ({ phase: phase.method, completed })))(
    'closes after an inner error in $phase without releasing a result', async ({ completed }) => {
      const { session, execution } = await managedFacade();
      await advanceManaged(session, completed);
      const phase = MANAGED_PHASES[completed]!;
      const failure = new Error(`injected ${phase.method} failure`);
      execution[phase.method].mockRejectedValueOnce(failure);
      await expect(phase.invoke(session)).rejects.toBe(failure);
      expect(execution[phase.method]).toHaveBeenCalledOnce();
      for (const later of MANAGED_PHASES.slice(completed + 1)) {
        expect(execution[later.method]).not.toHaveBeenCalled();
      }
      expectManagedCleanup(execution);
      await expectManagedClosed(session, execution);
    },
  );

  it.each(MANAGED_PHASES.map((phase, completed) => ({ phase: phase.method, completed })))(
    'invalidates an in-flight $phase on a concurrent second transition', async ({ completed }) => {
      const { session, execution } = await managedFacade();
      await advanceManaged(session, completed);
      const phase = MANAGED_PHASES[completed]!;
      const pending = deferred<never>();
      execution[phase.method].mockImplementationOnce(() => pending.promise);
      const first = phase.invoke(session);
      const rejected = expect(first).rejects.toThrow(/invalidated by a concurrent transition/);
      expect(execution[phase.method]).toHaveBeenCalledOnce();
      await expect(phase.invoke(session)).rejects.toThrow(/consumed|disposed/);
      expect(execution[phase.method]).toHaveBeenCalledOnce();
      expect(execution.dispose).not.toHaveBeenCalled();
      pending.resolve(phase.result as never);
      await rejected;
      expectManagedCleanup(execution);
      await expectManagedClosed(session, execution);
    },
  );

  const wrongOrders = MANAGED_PHASES.flatMap((expected, completed) =>
    MANAGED_PHASES.filter(phase => phase !== expected)
      .map(phase => ({ completed, expected: expected.method, phase })),
  );
  it.each(wrongOrders)(
    'rejects $phase.method while expecting $expected before inner dispatch', async ({ completed, phase }) => {
      const { session, execution } = await managedFacade();
      await advanceManaged(session, completed);
      const callsBefore = execution[phase.method].mock.calls.length;
      await expect(phase.invoke(session)).rejects.toThrow(/consumed|disposed/);
      expect(execution[phase.method]).toHaveBeenCalledTimes(callsBefore);
      expectManagedCleanup(execution);
      await expectManagedClosed(session, execution);
    },
  );

  it.each([1, 2, 3])(
    'rejects V2 continuation at legacy retained phase %s', async completed => {
      for (const phase of MANAGED_PHASES) {
        vi.clearAllMocks();
        const { session, execution } = await managedFacade();
        await session.runForExecutionRetainingPegInSigner(SETUP_INPUT as never, TARGET as never);
        if (completed >= 2) await session.checkPegInSourceLockRetainingSigner(SOURCE_LOCK_INPUT as never, TARGET as never);
        if (completed >= 3) await session.checkPegInCommittedVaultRetainingSigner(COMMITTED_VAULT_INPUT as never, TARGET as never);
        await expect(phase.invoke(session)).rejects.toThrow(/consumed|disposed/);
        for (const managed of MANAGED_PHASES) expect(execution[managed.method]).not.toHaveBeenCalled();
        expectManagedCleanup(execution);
      }
    },
  );

  it.each([1, 2, 3, 4])(
    'rejects every legacy entry point at managed retained phase %s', async completed => {
      for (const method of LEGACY_METHODS) {
        vi.clearAllMocks();
        const { session, execution } = await managedFacade();
        await advanceManaged(session, completed);
        await expect(Reflect.apply(session[method], session, [SETUP_INPUT, TARGET]))
          .rejects.toThrow(/consumed|disposed/);
        expect(execution[method]).not.toHaveBeenCalled();
        expectManagedCleanup(execution);
        await expectManagedClosed(session, execution);
      }
    },
  );
});

async function managedFacade() {
  const execution = executionSession();
  mocks.createExecutionSession.mockResolvedValue(execution);
  const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
  expect(mocks.registerSignerBinding).toHaveBeenCalledExactlyOnceWith(SIGNER, MINING_CREDENTIAL);
  expect(session.signer).toBe(SIGNER_BINDING);
  return { session, execution };
}

async function advanceManaged(session: FacadeSession, completed: number): Promise<void> {
  for (const phase of MANAGED_PHASES.slice(0, completed)) {
    await expect(phase.invoke(session)).resolves.toBe(phase.result);
  }
}

async function advanceNativeContinuationToVault(session: FacadeSession): Promise<void> {
  await session.runNativeGenesisRetainingSigner(NATIVE_COMPILED as never, TARGET as never);
  await session.checkNativePegInSourceLockRetainingSignerV1(NATIVE_DEPOSIT_PACKET as never, TARGET as never);
  await session.checkNativePegInCommittedVaultRetainingSignerV1(NATIVE_DEPOSIT_PACKET as never, TARGET as never);
  await session.checkNativeWithdrawalFeeFundingV1(TARGET as never);
  await session.checkNativeTrackerFeeFundingV1(TARGET as never);
  await session.checkNativeFrozenTrackerV2CandidateRetainingWithdrawalSigner(V2_TRACKER_INPUT as never, TARGET as never);
  await session.checkNativeWithdrawalRetainingContinuationSignerV2(WITHDRAWAL_CLAIM as never, TARGET as never);
  await session.checkNativeContinuationPegInSourceLockRetainingSignerV1(
    NATIVE_CONTINUATION_PACKET as never, TARGET as never,
  );
  await session.checkNativeContinuationPegInCommittedVaultRetainingSignerV1(
    NATIVE_CONTINUATION_PACKET as never, TARGET as never,
  );
}

function expectManagedCleanup(execution: ReturnType<typeof executionSession>, custody: 'unclaimed' | 'pair' | 'sequence' = 'unclaimed'): void {
  expect(mocks.revokeSignerBinding).toHaveBeenCalledExactlyOnceWith(SIGNER_BINDING);
  expect(execution.dispose).toHaveBeenCalledOnce();
  const unclaimed = custody === 'sequence' ? [] : custody === 'pair'
    ? [TRACKER_ADMISSION_CREDENTIAL, TRACKER_CONFIRMATION_CREDENTIAL]
    : [CHECKPOINT_CREDENTIAL, TRACKER_ADMISSION_CREDENTIAL, TRACKER_CONFIRMATION_CREDENTIAL];
  expect(mocks.revokeMiningCredential.mock.calls).toEqual(unclaimed.map(token => [token]));
}

async function expectManagedClosed(session: FacadeSession, execution: ReturnType<typeof executionSession>): Promise<void> {
  const callsBefore = MANAGED_PHASES.map(phase => execution[phase.method].mock.calls.length);
  for (const phase of MANAGED_PHASES) {
    await expect(phase.invoke(session)).rejects.toThrow(/consumed|disposed/);
  }
  expect(MANAGED_PHASES.map(phase => execution[phase.method].mock.calls.length)).toEqual(callsBefore);
  for (const method of LEGACY_METHODS) expect(execution[method]).not.toHaveBeenCalled();
  expect(() => claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(session))
    .toThrow(/absent, partially claimed, or disposed/);
  session.dispose();
  expect(execution.dispose).toHaveBeenCalledOnce();
  expect(mocks.revokeSignerBinding).toHaveBeenCalledOnce();
}

function executionSession() {
  return {
    signer: SIGNER,
    miningCredential: MINING_CREDENTIAL,
    claimCheckpointMiningCredential: vi.fn(() => CHECKPOINT_CREDENTIAL),
    claimTrackerAdmissionMiningCredential:
      vi.fn(() => TRACKER_ADMISSION_CREDENTIAL),
    claimTrackerConfirmationMiningCredential:
      vi.fn(() => TRACKER_CONFIRMATION_CREDENTIAL),
    dispose: vi.fn(),
    run: vi.fn(),
    runForExecution: vi.fn(),
    runForExecutionRetainingPegInSigner: vi.fn(async () => SETUP_BATCH),
    checkPegInSourceLock: vi.fn(),
    checkPegInSourceLockRetainingSigner:
      vi.fn(async () => SOURCE_LOCK_RECEIPT),
    checkPegInCommittedVault: vi.fn(),
    checkPegInCommittedVaultRetainingSigner:
      vi.fn(async () => COMMITTED_VAULT_RECEIPT),
    checkTrackerCandidate: vi.fn(async () => TRACKER_RECEIPT),
    checkFrozenTrackerCandidate: vi.fn(async () => FROZEN_TRACKER_RECEIPT),
    recheckTrackerReservationFreshnessCandidate:
      vi.fn(async () => FRESHNESS_RECEIPT),
    runNativeGenesisRetainingSigner: vi.fn(async () => NATIVE_SETUP_BATCH),
    checkNativePegInSourceLockRetainingSignerV1: vi.fn(async () => NATIVE_SOURCE_LOCK_RECEIPT),
    checkNativePegInCommittedVaultRetainingSignerV1: vi.fn(async () => NATIVE_COMMITTED_VAULT_RECEIPT),
    checkNativeWithdrawalFeeFundingV1: vi.fn(async () => NATIVE_WITHDRAWAL_FEE_CHECK),
    checkNativeTrackerFeeFundingV1: vi.fn(async () => NATIVE_TRACKER_FEE_CHECK),
    checkNativeFrozenTrackerV2CandidateRetainingWithdrawalSigner: vi.fn(async () => V2_TRACKER_CHECK),
    checkNativeWithdrawalV2: vi.fn(async () => WITHDRAWAL_CHECK),
    checkNativeWithdrawalRetainingContinuationSignerV2: vi.fn(async () => WITHDRAWAL_CHECK),
    checkNativeContinuationPegInSourceLockRetainingSignerV1:
      vi.fn(async () => NATIVE_CONTINUATION_SOURCE_LOCK_RECEIPT),
    checkNativeContinuationPegInCommittedVaultRetainingSignerV1:
      vi.fn(async () => NATIVE_CONTINUATION_VAULT_RECEIPT),
    checkNativeContinuationWithdrawalFeeFundingV1:
      vi.fn(async (_target: unknown) => NATIVE_CONTINUATION_WITHDRAWAL_FEE_CHECK),
    checkNativeContinuationTrackerFeeFundingV1:
      vi.fn(async (_target: unknown) => NATIVE_CONTINUATION_TRACKER_FEE_CHECK),
    runForExecutionV3RetainingPegInAndTrackerSigner: vi.fn(async () => V3_SETUP_BATCH),
    checkPegInSourceLockV2RetainingSigner: vi.fn(async () => V2_SOURCE_LOCK_RECEIPT),
    checkPegInCommittedVaultV2RetainingSigner: vi.fn(async () => V2_COMMITTED_VAULT_RECEIPT),
    checkTrackerFeeFundingV3: vi.fn(async () => V3_FEE_CHECK),
    checkWithdrawalFeeFundingV3: vi.fn(async () => V3_WITHDRAWAL_FEE_CHECK),
    checkFrozenTrackerV2Candidate: vi.fn(async () => V2_TRACKER_CHECK),
    checkFrozenTrackerV2CandidateRetainingWithdrawalSigner: vi.fn(async () => V2_TRACKER_CHECK),
    checkWithdrawalV2: vi.fn(async () => WITHDRAWAL_CHECK),
  };
}

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return Object.freeze({ promise, resolve });
}
