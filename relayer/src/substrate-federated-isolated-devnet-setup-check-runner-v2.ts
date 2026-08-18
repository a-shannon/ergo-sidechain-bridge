import type {
  ReplaySubstrateFederatedIsolatedDevnetPortableV1Input,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input,
  SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt,
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';

const ACTIVE_BINDINGS = new WeakSet<object>();
const MINING_CREDENTIALS = new WeakMap<
  object,
  Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>
>();

export interface RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input {
  readonly portableReplayInput:
    Readonly<ReplaySubstrateFederatedIsolatedDevnetPortableV1Input>;
  readonly primaryNodeOrigin: string;
  readonly witnessNodeOrigin: string;
}

export interface SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2 {
  readonly publicKeyHex: string;
  readonly p2pkErgoTreeHex: string;
  readonly rewardInputErgoTrees: Readonly<{
    readonly delay1: string;
    readonly delay720: string;
  }>;
  readonly networkPrefix: 16;
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
}

/**
 * Creates the signer-first session through a dynamically isolated execution
 * module. Importing the public-binding assertion does not load signer, node,
 * provisioning, checker, submission, or broadcast capabilities.
 */
export async function createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2():
  Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>> {
  const { createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2 } =
    await import(
      './substrate-federated-isolated-devnet-setup-check-execution-v2.js'
    );
  const execution =
    await createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2();
  let signer:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>;
  try {
    signer = registerSignerBinding(execution.signer);
  } catch (error) {
    execution.dispose();
    throw error;
  }
  let state:
    'open' | 'running' | 'setup-complete' | 'check-complete' | 'closed' = 'open';
  let session!: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>;
  const close = (): void => {
    MINING_CREDENTIALS.delete(session);
    revokeSignerBinding(signer);
    try {
      execution.dispose();
    } finally {
      state = 'closed';
    }
  };
  const consume = async <T>(
    expectedState: 'open' | 'setup-complete',
    operation: () => Promise<T>,
    successState: 'setup-complete' | 'check-complete' | 'closed',
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
  });
  MINING_CREDENTIALS.set(session, execution.miningCredential);
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

export function assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
> {
  if (
    value === null
    || typeof value !== 'object'
    || !ACTIVE_BINDINGS.has(value)
  ) {
    throw new Error(
      'isolated setup-check signer binding lacks active process provenance',
    );
  }
}

function registerSignerBinding(
  input: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>,
): Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2> {
  const record = exactDataRecord(input, [
    'publicKeyHex',
    'p2pkErgoTreeHex',
    'rewardInputErgoTrees',
    'networkPrefix',
  ], 'isolated setup-check signer binding');
  const rewardTrees = exactDataRecord(record.rewardInputErgoTrees, [
    'delay1',
    'delay720',
  ], 'isolated setup-check reward-input trees');
  const publicKeyHex = compressedPublicKey(record.publicKeyHex);
  const p2pkErgoTreeHex = fixedHex(
    record.p2pkErgoTreeHex,
    36,
    'isolated setup-check P2PK ErgoTree',
  );
  if (p2pkErgoTreeHex !== `0008cd${publicKeyHex}`) {
    throw new Error('isolated setup-check P2PK ErgoTree differs from its key');
  }
  if (record.networkPrefix !== 16) {
    throw new Error('isolated setup-check signer network prefix must be 16');
  }
  const binding = Object.freeze({
    publicKeyHex,
    p2pkErgoTreeHex,
    rewardInputErgoTrees: Object.freeze({
      delay1: canonicalHex(
        rewardTrees.delay1,
        'isolated setup-check delay-1 reward ErgoTree',
      ),
      delay720: canonicalHex(
        rewardTrees.delay720,
        'isolated setup-check delay-720 reward ErgoTree',
      ),
    }),
    networkPrefix: 16 as const,
  });
  ACTIVE_BINDINGS.add(binding);
  return binding;
}

function revokeSignerBinding(
  value: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>,
): void {
  ACTIVE_BINDINGS.delete(value);
}

function compressedPublicKey(value: unknown): string {
  const hex = fixedHex(value, 33, 'isolated setup-check public key');
  if (!hex.startsWith('02') && !hex.startsWith('03')) {
    throw new Error('isolated setup-check public key is not compressed');
  }
  return hex;
}

function canonicalHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase hex`);
  }
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const hex = canonicalHex(value, label);
  if (hex.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes`);
  }
  return hex;
}

function exactDataRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Record<K, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`);
  }
  const result = Object.create(null) as Record<K, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !('value' in descriptor)
    ) {
      throw new Error(`${label} fields must be enumerable data properties`);
    }
    result[key] = descriptor.value;
  }
  return result;
}
