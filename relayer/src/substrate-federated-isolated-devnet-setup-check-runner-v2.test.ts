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
const SETUP_INPUT = Object.freeze({ primaryNodeOrigin: 'primary' });
const TARGET = Object.freeze({ target: 'owned' });
const SOURCE_LOCK_INPUT = Object.freeze({ source: 'lock' });
const COMMITTED_VAULT_INPUT = Object.freeze({ source: 'vault' });
const TRACKER_INPUT = Object.freeze({ source: 'tracker' });
const SETUP_BATCH = Object.freeze({ stage: 'setup' });
const SOURCE_LOCK_RECEIPT = Object.freeze({ stage: 'source-lock' });
const COMMITTED_VAULT_RECEIPT = Object.freeze({ stage: 'committed-vault' });
const TRACKER_RECEIPT = Object.freeze({ stage: 'tracker' });

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

  it('hands off the three ordered mining credentials atomically', async () => {
    const execution = executionSession();
    mocks.createExecutionSession.mockResolvedValue(execution);
    const session = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();

    expect(
      claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(session),
    ).toEqual({
      miningCredential: MINING_CREDENTIAL,
      checkpointMiningCredential: CHECKPOINT_CREDENTIAL,
      trackerAdmissionMiningCredential: TRACKER_ADMISSION_CREDENTIAL,
    });
    expect(execution.claimCheckpointMiningCredential).toHaveBeenCalledOnce();
    expect(execution.claimTrackerAdmissionMiningCredential).toHaveBeenCalledOnce();
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

function executionSession() {
  return {
    signer: SIGNER,
    miningCredential: MINING_CREDENTIAL,
    claimCheckpointMiningCredential: vi.fn(() => CHECKPOINT_CREDENTIAL),
    claimTrackerAdmissionMiningCredential:
      vi.fn(() => TRACKER_ADMISSION_CREDENTIAL),
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
  };
}
