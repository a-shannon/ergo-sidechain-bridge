import type {
  ReplaySubstrateFederatedIsolatedDevnetPortableV1Input,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';
import {
  createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2,
  SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input,
  SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt,
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input,
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt,
  SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input,
  SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt,
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1,
} from './substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  type SubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
  revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';

export type {
  SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';

const MINING_CREDENTIALS = new WeakMap<
  object,
  Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>
>();
const CHECKPOINT_MINING_CREDENTIALS = new WeakMap<
  object,
  Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>
>();
const TRACKER_ADMISSION_MINING_CREDENTIALS = new WeakMap<
  object,
  Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>
>();

export interface RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input {
  readonly portableReplayInput:
    Readonly<ReplaySubstrateFederatedIsolatedDevnetPortableV1Input>;
  readonly primaryNodeOrigin: string;
  readonly witnessNodeOrigin: string;
}

export interface SubstrateFederatedIsolatedDevnetSetupCheckSessionV2 {
  readonly signer:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>;
  readonly dispose: () => void;
  readonly run: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>>;
  readonly runForExecution: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2
  >>;
  readonly runForExecutionRetainingPegInSigner: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2
  >>;
  readonly checkPegInSourceLock: (
    input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt
  >>;
  readonly checkPegInSourceLockRetainingSigner: (
    input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt
  >>;
  readonly checkPegInCommittedVault: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
    >,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt
  >>;
  readonly checkPegInCommittedVaultRetainingSigner: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
    >,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt
  >>;
  readonly checkTrackerCandidate: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
    >,
    target: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
  >>;
}

/**
 * Creates the signer-first session through the statically composed execution
 * module so one-shot mining credentials retain one module-local authority.
 * Capability-free consumers use the separate signer-binding module.
 */
export async function createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2():
  Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>> {
  const execution =
    await createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2();
  let signer:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>;
  try {
    signer =
      registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2(
        execution.signer,
        execution.miningCredential,
      );
  } catch (error) {
    execution.dispose();
    throw error;
  }
  let checkpointMiningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined;
  let trackerAdmissionMiningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined;
  try {
    checkpointMiningCredential =
      execution.claimCheckpointMiningCredential();
    trackerAdmissionMiningCredential =
      execution.claimTrackerAdmissionMiningCredential();
  } catch (error) {
    if (checkpointMiningCredential !== undefined) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        checkpointMiningCredential,
      );
    }
    revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2(signer);
    execution.dispose();
    throw error;
  }
  let state:
    | 'open'
    | 'running'
    | 'setup-complete'
    | 'source-lock-check-complete'
    | 'committed-vault-check-complete'
    | 'check-complete'
    | 'closed' = 'open';
  let session!: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>;
  const close = (): void => {
    MINING_CREDENTIALS.delete(session);
    const unclaimedCheckpointCredential =
      CHECKPOINT_MINING_CREDENTIALS.get(session);
    if (unclaimedCheckpointCredential !== undefined) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        unclaimedCheckpointCredential,
      );
    }
    CHECKPOINT_MINING_CREDENTIALS.delete(session);
    const unclaimedTrackerAdmissionCredential =
      TRACKER_ADMISSION_MINING_CREDENTIALS.get(session);
    if (unclaimedTrackerAdmissionCredential !== undefined) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        unclaimedTrackerAdmissionCredential,
      );
    }
    TRACKER_ADMISSION_MINING_CREDENTIALS.delete(session);
    revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2(signer);
    try {
      execution.dispose();
    } finally {
      state = 'closed';
    }
  };
  const consume = async <T>(
    expectedState:
      | 'open'
      | 'setup-complete'
      | 'source-lock-check-complete'
      | 'committed-vault-check-complete',
    operation: () => Promise<T>,
    successState:
      | 'setup-complete'
      | 'source-lock-check-complete'
      | 'committed-vault-check-complete'
      | 'check-complete'
      | 'closed',
  ): Promise<T> => {
    if (state !== expectedState) {
      throw new Error(
        expectedState === 'open'
          ? 'isolated fixed setup-check session is already consumed or disposed'
          : 'isolated peg-in signer continuation is absent, consumed, or disposed',
      );
    }
    if (expectedState === 'open') MINING_CREDENTIALS.delete(session);
    state = 'running';
    try {
      const result = await operation();
      if (successState === 'closed') {
        close();
      } else {
        state = successState;
      }
      return result;
    } catch (error) {
      close();
      throw error;
    }
  };
  session = Object.freeze({
    signer,
    dispose: () => {
      if (state === 'running') {
        throw new Error('isolated fixed setup-check session is running');
      }
      if (
          state === 'open'
          || state === 'setup-complete'
          || state === 'source-lock-check-complete'
          || state === 'committed-vault-check-complete'
          || state === 'check-complete'
      ) {
        close();
      }
    },
    run: async (
      input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
    ) => consume('open', () => execution.run(input), 'closed'),
    runForExecution: async (
      input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ) => consume(
      'open',
      () => execution.runForExecution(input, target),
      'closed',
    ),
    runForExecutionRetainingPegInSigner: async (
      input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ) => consume(
      'open',
      () => execution.runForExecutionRetainingPegInSigner(input, target),
      'setup-complete',
    ),
    checkPegInSourceLock: async (
      input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ) => consume(
      'setup-complete',
      () => execution.checkPegInSourceLock(input, target),
      'check-complete',
    ),
    checkPegInSourceLockRetainingSigner: async (
      input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ) => consume(
      'setup-complete',
      () => execution.checkPegInSourceLockRetainingSigner(input, target),
      'source-lock-check-complete',
    ),
    checkPegInCommittedVault: async (
      input: Readonly<
        SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
      >,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ) => consume(
      'source-lock-check-complete',
      () => execution.checkPegInCommittedVault(input, target),
      'check-complete',
    ),
    checkPegInCommittedVaultRetainingSigner: async (
      input: Readonly<
        SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
      >,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ) => consume(
      'source-lock-check-complete',
      () => execution.checkPegInCommittedVaultRetainingSigner(input, target),
      'committed-vault-check-complete',
    ),
    checkTrackerCandidate: async (
      input: Readonly<
        SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
      >,
      target: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
    ) => consume(
      'committed-vault-check-complete',
      () => execution.checkTrackerCandidate(input, target),
      'check-complete',
    ),
  });
  MINING_CREDENTIALS.set(session, execution.miningCredential);
  CHECKPOINT_MINING_CREDENTIALS.set(session, checkpointMiningCredential);
  TRACKER_ADMISSION_MINING_CREDENTIALS.set(
    session,
    trackerAdmissionMiningCredential,
  );
  return session;
}

/** Static composition-root handoff; the returned token contains no secret. */
export function claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(
  session: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
): Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> {
  const credential = MINING_CREDENTIALS.get(session);
  if (credential === undefined) {
    throw new Error(
      'isolated setup mining credential is absent, claimed, or disposed',
    );
  }
  MINING_CREDENTIALS.delete(session);
  return credential;
}

/** Atomic composition-root handoff for the two ordered mining phases. */
export function claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2(
  session: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
): Readonly<{
  readonly miningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly checkpointMiningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
}> {
  const miningCredential = MINING_CREDENTIALS.get(session);
  const checkpointMiningCredential =
    CHECKPOINT_MINING_CREDENTIALS.get(session);
  if (miningCredential === undefined || checkpointMiningCredential === undefined) {
    throw new Error(
      'isolated mining credential pair is absent, partially claimed, or disposed',
    );
  }
  MINING_CREDENTIALS.delete(session);
  CHECKPOINT_MINING_CREDENTIALS.delete(session);
  return Object.freeze({ miningCredential, checkpointMiningCredential });
}

/** Atomic composition-root handoff for setup, checkpoint, and tracker admission. */
export function claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(
  session: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
): Readonly<{
  readonly miningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly checkpointMiningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly trackerAdmissionMiningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
}> {
  const miningCredential = MINING_CREDENTIALS.get(session);
  const checkpointMiningCredential =
    CHECKPOINT_MINING_CREDENTIALS.get(session);
  const trackerAdmissionMiningCredential =
    TRACKER_ADMISSION_MINING_CREDENTIALS.get(session);
  if (
    miningCredential === undefined
    || checkpointMiningCredential === undefined
    || trackerAdmissionMiningCredential === undefined
  ) {
    throw new Error(
      'isolated mining credential sequence is absent, partially claimed, or disposed',
    );
  }
  MINING_CREDENTIALS.delete(session);
  CHECKPOINT_MINING_CREDENTIALS.delete(session);
  TRACKER_ADMISSION_MINING_CREDENTIALS.delete(session);
  return Object.freeze({
    miningCredential,
    checkpointMiningCredential,
    trackerAdmissionMiningCredential,
  });
}
