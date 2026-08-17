import { randomBytes } from 'node:crypto';

import { Mnemonic } from 'ethers';

import {
  promoteLocalWasmCheckedTransactionForSubmissionV1,
  type LocalWasmCheckedSubmissionAcceptanceV1,
  type LocalWasmExactBytesSignedCheckCandidate,
} from './fleet-signer.js';
import {
  deriveLocalWasmRootSignerPublicIdentity,
} from './local-wasm-root-signer-public-identity.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import {
  issueSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  type SubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2,
} from './substrate-federated-isolated-devnet-local-provisioning-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  replaySubstrateFederatedIsolatedDevnetPortableV1,
  takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1,
  type ReplaySubstrateFederatedIsolatedDevnetPortableV1Input,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetSettlementTargetV2,
} from './substrate-federated-isolated-devnet-settlement-target-v2.js';
import {
  buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
} from './substrate-federated-isolated-devnet-setup-check-request-v2.js';
import {
  runSubstrateFederatedIsolatedDevnetSetupCheckV2,
  takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV2,
  validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';
import { sha256CanonicalJson } from './strict-json.js';

const PRIMARY_NODE_ORIGIN = 'http://127.0.0.1:9051';
const WITNESS_NODE_ORIGIN = 'http://127.0.0.1:9052';
const PROFILE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_PROFILE_V2';
const DECLARED_IDENTITY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_DECLARATION_V2';
const OBSERVATION_ATTEMPTS = 40;
const OBSERVATION_RETRY_MS = 250;

export interface RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input {
  readonly portableReplayInput:
    Readonly<ReplaySubstrateFederatedIsolatedDevnetPortableV1Input>;
  readonly primaryNodeOrigin: string;
  readonly witnessNodeOrigin: string;
}

export interface SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2 {
  readonly publicKeyHex: string;
  readonly p2pkErgoTreeHex: string;
  readonly rewardInputErgoTrees: Readonly<{
    readonly delay1: string;
    readonly delay720: string;
  }>;
  readonly networkPrefix: 16;
}

export interface SubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2 {
  readonly signer:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>;
  readonly miningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly dispose: () => void;
  readonly run: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>>;
  readonly runForExecution: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>>;
}

export interface SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2 {
  readonly issuance:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2>;
  readonly signedCandidate:
    LocalWasmExactBytesSignedCheckCandidate;
  readonly checkedAcceptance:
    Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

export interface SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>;
  readonly targetBinding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly orderedTransactions: readonly Readonly<
    SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2
  >[];
}

interface FixedSetupCheckRunV2 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly executionReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>;
}

export interface SubstrateFederatedIsolatedDevnetSetupExecutionPromotionV2Input {
  readonly executionReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>;
  readonly expectedTargetBinding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
}

/**
 * Creates the signer before the caller builds the matching packet and target.
 * The synthetic mnemonic remains inside this one-shot process session.
 * Process termination, not JavaScript string reassignment, is the cleanup boundary.
 */
export async function createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2():
  Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2>> {
  const entropy = randomBytes(32);
  let mnemonic = '';
  try {
    mnemonic = Mnemonic.fromEntropy(`0x${entropy.toString('hex')}`).phrase;
  } finally {
    entropy.fill(0);
  }
  try {
    const identity = await deriveLocalWasmRootSignerPublicIdentity(mnemonic);
    const signer = Object.freeze({
      publicKeyHex: identity.publicKeyHex,
      p2pkErgoTreeHex: identity.p2pkErgoTreeHex,
      rewardInputErgoTrees: Object.freeze({
        delay1: deriveDevnetRewardErgoTreeHexForDelay(
          identity.publicKeyHex,
          1,
        ),
        delay720: deriveDevnetRewardErgoTreeHexForDelay(
          identity.publicKeyHex,
          720,
        ),
      }),
      networkPrefix: 16 as const,
    });
    const miningCredential =
      issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        mnemonic,
        identity.publicKeyHex,
      );
    let state: 'open' | 'running' | 'closed' = 'open';
    const consume = async <T>(operation: (activeMnemonic: string) => Promise<T>) => {
      if (state !== 'open') {
        throw new Error(
          'isolated fixed setup-check session is already consumed or disposed',
        );
      }
      state = 'running';
      try {
        return await operation(mnemonic);
      } finally {
        revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          miningCredential,
        );
        mnemonic = '';
        state = 'closed';
      }
    };
    return Object.freeze({
      signer,
      miningCredential,
      dispose: () => {
        if (state === 'running') {
          throw new Error('isolated fixed setup-check session is running');
        }
        if (state === 'open') {
          revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
            miningCredential,
          );
          mnemonic = '';
          state = 'closed';
        }
      },
      run: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
      ) => consume(async activeMnemonic =>
        (await runFixedSetupCheck(input, activeMnemonic)).receipt),
      runForExecution: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(async activeMnemonic => {
        const expectedTargetBinding =
          assertExecutionTargetMatchesOrigins(target, input);
        const result = await runFixedSetupCheck(input, activeMnemonic);
        return promoteSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2({
          executionReceipt: result.executionReceipt,
          request: result.request,
          expectedTargetBinding,
          target,
        });
      }),
    });
  } catch (error) {
    mnemonic = '';
    throw error;
  }
}

export function promoteSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(
  input: Readonly<
    SubstrateFederatedIsolatedDevnetSetupExecutionPromotionV2Input
  >,
): Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2> {
  const receipt =
    validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2(
      structuredClone(input.executionReceipt),
      input.request,
    );
  const before = assertExecutionTargetMatchesOrigins(input.target, {
    primaryNodeOrigin: input.request.target.primary.nodeOrigin,
    witnessNodeOrigin: input.request.target.witness.nodeOrigin,
  });
  if (
    before.processBindingDigestHex
      !== input.expectedTargetBinding.processBindingDigestHex
    || before.executionTargetIdentityDigestHex
      !== input.expectedTargetBinding.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated setup execution process binding changed');
  }
  const material =
    takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV2(
      input.executionReceipt,
      input.request,
      input.target,
    );
  const after =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  if (
    before.processBindingDigestHex !== after.processBindingDigestHex
    || before.executionTargetIdentityDigestHex
      !== after.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated setup execution process binding changed');
  }
  const orderedTransactions = material.orderedTransactions.map(
    (transaction, index) => {
      const issuance = input.request.orderedIssuances[index];
      if (
        issuance === undefined
        || issuance.ordinal !== transaction.ordinal
        || issuance.role !== transaction.role
      ) {
        throw new Error('isolated setup execution issuance order changed');
      }
      return Object.freeze({
        issuance,
        signedCandidate: transaction.signedCandidate,
        checkedAcceptance:
          promoteLocalWasmCheckedTransactionForSubmissionV1(
            transaction.signedCandidate,
            transaction.checked,
            after,
          ),
      });
    },
  );
  return Object.freeze({
    receipt,
    request: input.request,
    targetBinding: after,
    orderedTransactions: Object.freeze(orderedTransactions),
  });
}

function assertExecutionTargetMatchesOrigins(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  input: Readonly<{ primaryNodeOrigin: string; witnessNodeOrigin: string }>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    target.primaryNodeOrigin !== input.primaryNodeOrigin
    || target.witnessNodeOrigin !== input.witnessNodeOrigin
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error('isolated setup execution target differs from its request');
  }
  return binding;
}

/** Reconstruct G1dA-G1dF and perform G1dG without wider capabilities. */
async function runFixedSetupCheck(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
  mnemonic: string,
): Promise<Readonly<FixedSetupCheckRunV2>> {
  const captured = captureInput(input);
  const primaryNodeOrigin = exactOrigin(
    captured.primaryNodeOrigin,
    PRIMARY_NODE_ORIGIN,
    'primary',
  );
  const witnessNodeOrigin = exactOrigin(
    captured.witnessNodeOrigin,
    WITNESS_NODE_ORIGIN,
    'witness',
  );
  const replay = await replaySubstrateFederatedIsolatedDevnetPortableV1(
    captured.portableReplayInput,
  );
  const continuation =
    takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1(replay);
  const profile = buildTargetProfile(
    replay.reportDigestHex,
    continuation.expectedSettlementGenesisHeaderIdHex,
    continuation.genesisBoxIds,
    primaryNodeOrigin,
    witnessNodeOrigin,
  );

  const retainedObservation = await observeWithRetry(profile);
  const settlementTarget =
    buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
      ...continuation.sourceAndCompilerInput,
      settlementTargetProfile: profile,
      settlementObservation: retainedObservation,
    });
  const freshObservation = await observeWithRetry(profile);
  const provisioning =
    await buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
      settlementTarget,
      settlementTargetProfile: profile,
      freshSettlementObservation: freshObservation,
    });
  const request =
    await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
      provisioning,
    );

  const executionReceipt = await runSubstrateFederatedIsolatedDevnetSetupCheckV2(
    request,
    mnemonic,
  );
  const receipt = validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2(
    structuredClone(executionReceipt),
    request,
  );
  return Object.freeze({ receipt, executionReceipt, request });
}

function buildTargetProfile(
  replayReportDigestHex: string,
  expectedGenesisHeaderIdHex: string,
  genesisBoxIds: Readonly<{
    readonly tracker: string;
    readonly duplicatePrevention: string;
    readonly pooledReserve: string;
  }>,
  primaryNodeOrigin: string,
  witnessNodeOrigin: string,
): SubstrateFederatedGenesisTargetProfileV1 {
  const profileIdHex = sha256CanonicalJson({
    replayReportDigestHex,
    expectedGenesisHeaderIdHex,
    genesisBoxIds,
    primaryNodeOrigin,
    witnessNodeOrigin,
  }, PROFILE_ID_DOMAIN);
  return buildSubstrateFederatedGenesisTargetProfileV1({
    profileIdHex,
    environment: 'patched-devnet',
    expectedNetwork: 'devnet',
    expectedGenesisHeaderIdHex,
    primaryNodeOrigin,
    primaryNodeIdentityDigestHex: declaredIdentity(
      'primary-node-process',
      primaryNodeOrigin,
      profileIdHex,
    ),
    primaryAdministrationIdentityDigestHex: declaredIdentity(
      'primary-synthetic-custody',
      primaryNodeOrigin,
      profileIdHex,
    ),
    witnessNodeOrigin,
    witnessNodeIdentityDigestHex: declaredIdentity(
      'witness-node-process',
      witnessNodeOrigin,
      profileIdHex,
    ),
    witnessAdministrationIdentityDigestHex: declaredIdentity(
      'witness-observation-role',
      witnessNodeOrigin,
      profileIdHex,
    ),
    trackerGenesisBoxIdHex: genesisBoxIds.tracker,
    duplicatePreventionGenesisBoxIdHex:
      genesisBoxIds.duplicatePrevention,
    pooledReserveGenesisBoxIdHex: genesisBoxIds.pooledReserve,
  });
}

async function observeWithRetry(
  profile: SubstrateFederatedGenesisTargetProfileV1,
): Promise<Readonly<SubstrateFederatedGenesisObservationV1>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OBSERVATION_ATTEMPTS; attempt += 1) {
    try {
      return await observeSubstrateFederatedGenesisV1(profile);
    } catch (error) {
      lastError = error;
      if (attempt < OBSERVATION_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, OBSERVATION_RETRY_MS));
      }
    }
  }
  throw new Error(
    `isolated fixed setup-check target did not stabilize: ${String(lastError)}`,
  );
}

function declaredIdentity(
  role: string,
  nodeOrigin: string,
  profileIdHex: string,
): string {
  return sha256CanonicalJson({ role, nodeOrigin, profileIdHex },
    DECLARED_IDENTITY_DOMAIN);
}

function exactOrigin(
  value: string,
  expected: string,
  role: string,
): string {
  if (value !== expected) {
    throw new Error(
      `isolated fixed setup-check ${role} origin must be exactly ${expected}`,
    );
  }
  return value;
}

function captureInput(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
): RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input {
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error('isolated fixed setup-check input must be a plain object');
  }
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    'portableReplayInput',
    'primaryNodeOrigin',
    'witnessNodeOrigin',
  ];
  if (keys.join('\0') !== expectedKeys.join('\0')) {
    throw new Error('isolated fixed setup-check input fields are invalid');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !('value' in descriptor)
    ) {
      throw new Error(
        `isolated fixed setup-check ${key} must be an enumerable data property`,
      );
    }
  }
  return Object.freeze({
    portableReplayInput: descriptors.portableReplayInput!.value,
    primaryNodeOrigin: descriptors.primaryNodeOrigin!.value,
    witnessNodeOrigin: descriptors.witnessNodeOrigin!.value,
  }) as RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input;
}
