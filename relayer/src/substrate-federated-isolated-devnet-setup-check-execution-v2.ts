import { randomBytes } from 'node:crypto';

import { Mnemonic } from 'ethers';

import {
  checkSignedTransaction,
  prepareLocalWasmRootCheckCandidatesFromNode,
  promoteLocalWasmCheckedTransactionForSubmissionV1,
  type LocalWasmCheckedSubmissionAcceptanceV1,
  type LocalWasmExactBytesSignedCheckCandidate,
} from './fleet-signer.js';
import { deriveUnsignedTransactionId } from './ergo-unsigned-transaction.js';
import {
  assertSubstrateFederatedSettlementFamilyCompilerBindingV1,
  bindSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
  type SubstrateFederatedSettlementFamilyCompilerBindingV1,
} from './substrate-federated-settlement-family-compiler-binding-v1.js';
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
import type { MaterializedUnsignedTransaction } from './unsigned-ergo-transaction.js';

const PRIMARY_NODE_ORIGIN = 'http://127.0.0.1:9051';
const WITNESS_NODE_ORIGIN = 'http://127.0.0.1:9052';
const PROFILE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_PROFILE_V2';
const DECLARED_IDENTITY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_DECLARATION_V2';
const OBSERVATION_ATTEMPTS = 40;
const OBSERVATION_RETRY_MS = 250;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check.v1' as const;
const PEG_IN_SOURCE_LOCK_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1';
const PEG_IN_SOURCE_LOCK_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_TRANSACTION_V1';
const PEG_IN_SOURCE_LOCK_CHECK_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_RESPONSE_V1';
const EXECUTION_BATCHES = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();
const FAMILY_EXECUTION_BATCHES = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    familyCompilerBinding:
      Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>;
  }>
>();

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

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input {
  readonly sourceFundingBoxIdHex: string;
  readonly unsignedTransaction:
    Readonly<MaterializedUnsignedTransaction>;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'PASS';
  readonly sourceFundingBoxIdHex: string;
  readonly unsignedTransactionIdHex: string;
  readonly unsignedTransactionDigestHex: string;
  readonly signedTransactionIdHex: string;
  readonly signedTransactionCanonicalJsonSha256Hex: string;
  readonly signedTransactionBytesSha256Hex: string;
  readonly signedTransactionBytesLength: number;
  readonly checkResponseSha256Hex: string;
  readonly target: Readonly<{
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
  }>;
  readonly signer: Readonly<{
    readonly derivation: 'wasm-root';
    readonly publicKeyHex: string;
    readonly p2pkErgoTreeHex: string;
    readonly stateContextTipHeight: number;
    readonly stateContextTipIdHex: string;
  }>;
  readonly checker: Readonly<{
    readonly nodeOrigin: string;
    readonly path: '/transactions/check';
    readonly method: 'POST';
    readonly transportPolicy: 'no-redirect-no-proxy';
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly exactProcessOwnedTargetBound: true;
    readonly exactTransactionAndSourceBoxBound: true;
    readonly localWasmRootSigningPerformed: true;
    readonly localJvmNodeCheckPassed: true;
    readonly signedTransactionBytesPersisted: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
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

export interface SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2
  extends SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2 {
  readonly familyCompilerBinding:
    Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>;
}

interface FixedSetupCheckRunV2 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly executionReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>;
  readonly familyCompilerBinding:
    Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>;
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
    let state: 'open' | 'running' | 'setup-complete' | 'closed' = 'open';
    const close = (): void => {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        miningCredential,
      );
      mnemonic = '';
      state = 'closed';
    };
    const consume = async <T>(
      expectedState: 'open' | 'setup-complete',
      operation: (activeMnemonic: string) => Promise<T>,
      retainAfterSuccess: boolean,
    ): Promise<T> => {
      if (state !== expectedState) {
        throw new Error(
          expectedState === 'open'
            ? 'isolated fixed setup-check session is already consumed or disposed'
            : 'isolated peg-in signer continuation is absent, consumed, or disposed',
        );
      }
      state = 'running';
      try {
        const result = await operation(mnemonic);
        if (retainAfterSuccess) {
          state = 'setup-complete';
        } else {
          close();
        }
        return result;
      } catch (error) {
        close();
        throw error;
      }
    };
    const runForExecution = async (
      input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      retainPegInSigner: boolean,
      activeMnemonic: string,
    ): Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>> => {
      const expectedTargetBinding =
        assertExecutionTargetMatchesOrigins(target, input);
      const result = await runFixedSetupCheck(input, activeMnemonic);
      const batch = promoteSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2({
        executionReceipt: result.executionReceipt,
        request: result.request,
        expectedTargetBinding,
        target,
      });
      const familyBatch =
        attachSubstrateFederatedSettlementFamilyCompilerBindingV2(
          batch,
          result.familyCompilerBinding,
          target,
        );
      if (retainPegInSigner) {
        assertSubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2(
          familyBatch,
          target,
        );
      }
      return familyBatch;
    };
    return Object.freeze({
      signer,
      miningCredential,
      dispose: () => {
        if (state === 'running') {
          throw new Error('isolated fixed setup-check session is running');
        }
        if (state === 'open' || state === 'setup-complete') {
          close();
        }
      },
      run: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
      ) => consume(
        'open',
        async activeMnemonic =>
          (await runFixedSetupCheck(input, activeMnemonic)).receipt,
        false,
      ),
      runForExecution: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'open',
        activeMnemonic => runForExecution(
          input,
          target,
          false,
          activeMnemonic,
        ),
        false,
      ),
      runForExecutionRetainingPegInSigner: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'open',
        activeMnemonic => runForExecution(
          input,
          target,
          true,
          activeMnemonic,
        ),
        true,
      ),
      checkPegInSourceLock: async (
        input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'setup-complete',
        activeMnemonic => runPegInSourceLockCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        false,
      ),
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
  const batch = Object.freeze({
    receipt,
    request: input.request,
    targetBinding: after,
    orderedTransactions: Object.freeze(orderedTransactions),
  });
  EXECUTION_BATCHES.set(batch, Object.freeze({
    target: input.target,
    binding: after,
  }));
  return batch;
}

export function assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const material = EXECUTION_BATCHES.get(batch);
  if (material === undefined || material.target !== target) {
    throw new Error('isolated setup execution batch lacks exact process provenance');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    current.processBindingDigestHex !== material.binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== material.binding.executionTargetIdentityDigestHex
    || batch.targetBinding.processBindingDigestHex
      !== current.processBindingDigestHex
    || batch.targetBinding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || batch.orderedTransactions.length !== 3
  ) {
    throw new Error('isolated setup execution batch process binding changed');
  }
  return current;
}

export function assertSubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1> {
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(batch, target);
  const material = FAMILY_EXECUTION_BATCHES.get(batch);
  if (
    material === undefined
    || material.target !== target
    || material.familyCompilerBinding !== batch.familyCompilerBinding
  ) {
    throw new Error(
      'isolated setup family execution batch lacks exact process provenance',
    );
  }
  assertSubstrateFederatedSettlementFamilyCompilerBindingV1(
    material.familyCompilerBinding,
  );
  return material.familyCompilerBinding;
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

async function runPegInSourceLockCheck(
  inputValue:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>> {
  const input = capturePegInSourceLockCheckInput(inputValue);
  const before = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
    target,
  );
  const nodeOrigin = exactOrigin(
    target.primaryNodeOrigin,
    PRIMARY_NODE_ORIGIN,
    'peg-in checker',
  );
  if (
    target.witnessNodeOrigin !== WITNESS_NODE_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error('isolated peg-in check target differs from the owned pair');
  }
  const transaction = input.unsignedTransaction;
  const independentlyDerivedId = fixedHex(
    await deriveUnsignedTransactionId(transaction.eip12Tx),
    32,
    'isolated peg-in independently derived transaction ID',
  );
  if (
    independentlyDerivedId !== transaction.txId
    || transaction.eip12Tx.inputs.length !== 1
    || transaction.eip12Tx.inputs[0]?.boxId !== input.sourceFundingBoxIdHex
    || transaction.eip12Tx.dataInputs.length !== 0
  ) {
    throw new Error('isolated peg-in source-lock transaction binding changed');
  }
  const unsignedTransactionDigestHex = sha256CanonicalJson(
    transaction,
    PEG_IN_SOURCE_LOCK_TRANSACTION_DIGEST_DOMAIN,
  );
  const batch = await prepareLocalWasmRootCheckCandidatesFromNode({
    mnemonic,
    networkPrefix: expectedSigner.networkPrefix,
    nodeOrigin,
    candidates: [{
      role: 'peg-in-source-lock',
      eip12Tx: transaction.eip12Tx,
      expectedTxId: transaction.txId,
    }],
  });
  const prepared = batch.candidates[0];
  if (
    batch.derivation !== 'wasm-root'
    || batch.pubKeyHex !== expectedSigner.publicKeyHex
    || batch.ergoTreeHex !== expectedSigner.p2pkErgoTreeHex
    || batch.candidates.length !== 1
    || prepared === undefined
    || prepared.role !== 'peg-in-source-lock'
    || prepared.expectedTxId !== transaction.txId
    || prepared.signedCandidate.txId !== transaction.txId
  ) {
    throw new Error('isolated peg-in source-lock signer binding changed');
  }
  const checked = await checkSignedTransaction(
    prepared.signedCandidate,
    'isolated local peg-in source-lock check',
    nodeOrigin,
  );
  if (checked === null) {
    throw new Error('isolated local peg-in source-lock JVM node check failed');
  }
  const signedBytesDigestHex = fixedHex(
    checked.signedTransactionBytesSha256Hex,
    32,
    'isolated peg-in signed transaction bytes digest',
  );
  const signedBytesLength = positiveSafeInteger(
    checked.signedTransactionBytesLength,
    'isolated peg-in signed transaction bytes length',
  );
  if (
    checked.txId !== transaction.txId
    || checked.signedTransactionDigestHex
      !== prepared.signedCandidate.signedTransactionDigestHex
    || signedBytesDigestHex
      !== prepared.signedCandidate.signedTransactionBytesSha256Hex
    || signedBytesLength
      !== prepared.signedCandidate.signedTransactionBytesLength
    || checked.signerContext.pubKeyHex !== expectedSigner.publicKeyHex
    || checked.signerContext.ergoTreeHex !== expectedSigner.p2pkErgoTreeHex
    || checked.signerContext.stateContextTipHeight !== batch.stateContextTipHeight
    || checked.signerContext.stateContextTipIdHex !== batch.stateContextTipIdHex
    || checked.checkerIdentity.nodeOrigin !== nodeOrigin
    || checked.checkerIdentity.path !== '/transactions/check'
    || checked.checkerIdentity.method !== 'POST'
    || checked.checkerIdentity.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error('isolated peg-in signer and JVM node receipt disagree');
  }
  const after = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
    target,
  );
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated peg-in execution target changed during check');
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    sourceFundingBoxIdHex: input.sourceFundingBoxIdHex,
    unsignedTransactionIdHex: transaction.txId,
    unsignedTransactionDigestHex,
    signedTransactionIdHex: checked.txId,
    signedTransactionCanonicalJsonSha256Hex:
      checked.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex: signedBytesDigestHex,
    signedTransactionBytesLength: signedBytesLength,
    checkResponseSha256Hex: sha256CanonicalJson({
      role: 'peg-in-source-lock',
      response: checked.checkResult,
    }, PEG_IN_SOURCE_LOCK_CHECK_RESPONSE_DIGEST_DOMAIN),
    target: Object.freeze({
      processBindingDigestHex: after.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        after.executionTargetIdentityDigestHex,
    }),
    signer: Object.freeze({
      derivation: 'wasm-root' as const,
      publicKeyHex: expectedSigner.publicKeyHex,
      p2pkErgoTreeHex: expectedSigner.p2pkErgoTreeHex,
      stateContextTipHeight: batch.stateContextTipHeight,
      stateContextTipIdHex: batch.stateContextTipIdHex,
    }),
    checker: Object.freeze({
      nodeOrigin,
      path: '/transactions/check' as const,
      method: 'POST' as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
    }),
    boundaries: Object.freeze({
      localSyntheticCompatibilityOnly: true as const,
      exactProcessOwnedTargetBound: true as const,
      exactTransactionAndSourceBoxBound: true as const,
      localWasmRootSigningPerformed: true as const,
      localJvmNodeCheckPassed: true as const,
      signedTransactionBytesPersisted: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      PEG_IN_SOURCE_LOCK_CHECK_DIGEST_DOMAIN,
    ),
  });
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
  const sourceAndCompilerInput = continuation.sourceAndCompilerInput;
  const familyCompilerBinding =
    bindSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1({
      receipt: sourceAndCompilerInput.familyReceipt,
      expectedInput: {
        trackerRequest: sourceAndCompilerInput.trackerRequest,
        trackerReceipt: sourceAndCompilerInput.trackerReceipt,
        templates: sourceAndCompilerInput.familyTemplates,
        duplicatePreventionGenesisInputBoxIdHex:
          continuation.genesisBoxIds.duplicatePrevention,
        pooledReserveGenesisInputBoxIdHex:
          continuation.genesisBoxIds.pooledReserve,
      },
    });
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
      ...sourceAndCompilerInput,
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
  return Object.freeze({
    receipt,
    executionReceipt,
    request,
    familyCompilerBinding,
  });
}

function attachSubstrateFederatedSettlementFamilyCompilerBindingV2(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  familyCompilerBinding:
    Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2> {
  const targetBinding =
    assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(batch, target);
  assertSubstrateFederatedSettlementFamilyCompilerBindingV1(
    familyCompilerBinding,
  );
  const result = Object.freeze({
    ...batch,
    familyCompilerBinding,
  });
  EXECUTION_BATCHES.set(result, Object.freeze({
    target,
    binding: targetBinding,
  }));
  FAMILY_EXECUTION_BATCHES.set(result, Object.freeze({
    target,
    familyCompilerBinding,
  }));
  return result;
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

function capturePegInSourceLockCheckInput(
  input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input> {
  assertPlainData(input, 'isolated peg-in source-lock check input');
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    'sourceFundingBoxIdHex',
    'unsignedTransaction',
  ];
  if (keys.join('\0') !== expectedKeys.join('\0')) {
    throw new Error('isolated peg-in source-lock check input fields are invalid');
  }
  const transaction = input.unsignedTransaction;
  if (
    transaction === null
    || typeof transaction !== 'object'
    || Array.isArray(transaction)
    || Object.keys(transaction).sort().join('\0') !== 'eip12Tx\0outputs\0txId'
    || transaction.eip12Tx === null
    || typeof transaction.eip12Tx !== 'object'
    || !Array.isArray(transaction.eip12Tx.inputs)
    || !Array.isArray(transaction.eip12Tx.dataInputs)
    || !Array.isArray(transaction.eip12Tx.outputs)
    || !Array.isArray(transaction.outputs)
  ) {
    throw new Error('isolated peg-in source-lock transaction shape is invalid');
  }
  return Object.freeze({
    sourceFundingBoxIdHex: fixedHex(
      input.sourceFundingBoxIdHex,
      32,
      'isolated peg-in source funding box ID',
    ),
    unsignedTransaction: structuredClone(transaction),
  });
}

function assertPlainData(
  value: unknown,
  label: string,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`);
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(`${label} contains non-data capability material`);
  }
  if (seen.has(value)) throw new Error(`${label} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new Error(`${label} contains a custom array prototype`);
      }
      const keys = Reflect.ownKeys(value);
      const expected = [
        ...Array.from({ length: value.length }, (_, index) => String(index)),
        'length',
      ];
      if (
        keys.length !== expected.length
        || keys.some((key, index) => key !== expected[index])
      ) {
        throw new Error(`${label} contains sparse, symbol, or extra array fields`);
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          descriptor === undefined
          || !descriptor.enumerable
          || !('value' in descriptor)
        ) {
          throw new Error(`${label} array entries must be enumerable data properties`);
        }
        assertPlainData(descriptor.value, `${label}[${index}]`, seen);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a custom object prototype`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new Error(`${label} contains symbol fields`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !('value' in descriptor)
      ) {
        throw new Error(`${label}.${key} must be an enumerable data property`);
      }
      assertPlainData(descriptor.value, `${label}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be canonical ${bytes}-byte lowercase hex`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}
