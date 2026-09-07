import { randomBytes } from 'node:crypto';

import { Mnemonic } from 'ethers';

import {
  checkSignedTransaction,
  selectLatestHeader,
  prepareLocalWasmRootCheckCandidates,
  prepareLocalWasmRootCheckCandidatesFromNode,
  promoteLocalWasmCheckedTransactionForSubmissionV1,
  type LocalWasmCheckedSubmissionAcceptanceV1,
  type LocalWasmExactBytesSignedCheckCandidate,
  type LocalWasmOpaqueCheckResult,
} from './fleet-signer.js';
import {
  assertBridgeValidityTrackerObservedHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
  type BridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import { deriveUnsignedTransactionId } from './ergo-unsigned-transaction.js';
import {
  assertExactSubstrateFederatedTrackerV1InputBox,
  assertSubstrateFederatedTrackerV1Context,
  type SubstrateFederatedTrackerV1Context,
} from './substrate-federated-tracker-v1.js';
import {
  executeObservedAnchorTrackerCheckKernelV1,
  executeObservedAnchorTrackerCheckKernelV2,
  executeObservedAnchorTrackerReservationFreshnessCheckKernelV1,
  type ObservedAnchorTrackerCheckKernelV2Result,
  type ObservedAnchorTrackerReservationFreshnessCheckKernelV1Result,
} from './substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.js';
import {
  executeSubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1,
  type SubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1Result,
} from './substrate-federated-isolated-devnet-tracker-v2-check-kernel-v1.js';
import { assertSubstrateFederatedTrackerV2Context, type SubstrateFederatedTrackerV2Context }
  from './substrate-federated-tracker-v2.js';
import type { SubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import {
  assertSubstrateFederatedPooledReserveDepositV2Packet,
  type SubstrateFederatedPooledReserveDepositV2Packet,
} from './substrate-federated-pooled-reserve-deposit-v2.js';
import { assertSubstrateFederatedTrackerV2ExternalFeeTransaction,
  type SubstrateFederatedTrackerV2ExternalFeeTransaction }
  from './substrate-federated-tracker-v2-external-fee.js';
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
  buildSubstrateFederatedIsolatedDevnetLocalProvisioningV3,
} from './substrate-federated-isolated-devnet-local-provisioning-v2.js';
import {
  deriveSubstrateFederatedIsolatedDevnetSourceCompilerClosureV2,
  type DeriveSubstrateFederatedIsolatedDevnetSourceCompilerClosureV2Input,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1,
  assertSubstrateFederatedIsolatedDevnetTrackerFreshnessLineageV2,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2,
  issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
  type SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1,
  type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1,
  type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  replaySubstrateFederatedIsolatedDevnetPortableV1,
  takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1,
  type ReplaySubstrateFederatedIsolatedDevnetPortableV1Input,
  type SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetSettlementTargetV2,
  buildSubstrateFederatedIsolatedDevnetSettlementTargetV3,
} from './substrate-federated-isolated-devnet-settlement-target-v2.js';
import {
  buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
  buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV3,
  type SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckRequestV3,
} from './substrate-federated-isolated-devnet-setup-check-request-v2.js';
import {
  runSubstrateFederatedIsolatedDevnetSetupCheckV2,
  runSubstrateFederatedIsolatedDevnetSetupCheckV3,
  takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV2,
  takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV3,
  validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
  validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV3,
  type SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckReceiptV3,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import { ngetDirect } from './ergo-helpers.js';
import { buildSubstrateFederatedTrackerV2FeeFunding } from './substrate-federated-tracker-v2-external-fee.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  type Eip12UnsignedTransaction,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const PRIMARY_NODE_ORIGIN = 'http://127.0.0.1:9051';
const WITNESS_NODE_ORIGIN = 'http://127.0.0.1:9052';
const PROFILE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_PROFILE_V2';
const DECLARED_IDENTITY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_DECLARATION_V2';
const PROFILE_V3_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_PROFILE_V3';
const DECLARED_IDENTITY_V3_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_DECLARATION_V3';
const SOURCE_AND_COMPILER_CLOSURE_V3_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_AND_COMPILER_CLOSURE_V3';
const OBSERVATION_ATTEMPTS = 40;
const OBSERVATION_RETRY_MS = 250;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-check.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-check.v1' as const;
const PEG_IN_SOURCE_LOCK_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1';
const PEG_IN_SOURCE_LOCK_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_TRANSACTION_V1';
const PEG_IN_SOURCE_LOCK_CHECK_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_RESPONSE_V1';
const PEG_IN_COMMITTED_VAULT_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1';
const PEG_IN_COMMITTED_VAULT_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_TRANSACTION_V1';
const PEG_IN_COMMITTED_VAULT_CHECK_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_RESPONSE_V1';
const OBSERVED_ANCHOR_TRACKER_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V1';
const OBSERVED_ANCHOR_TRACKER_CHECK_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2';
const TRACKER_RESERVATION_FRESHNESS_CHECK_V1_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1';
const EXECUTION_BATCHES = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();
const EXECUTION_BATCHES_V3 = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
    sourceAndCompilerInput: Readonly<DeriveSubstrateFederatedIsolatedDevnetSourceCompilerClosureV2Input>;
  }>
>();
export interface SubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1 {
  readonly transaction: Readonly<MaterializedUnsignedTransaction>;
  readonly signedCandidate: Readonly<LocalWasmExactBytesSignedCheckCandidate>;
  readonly checkedAcceptance: Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

const TRACKER_FEE_CHECKS = new WeakMap<object, Readonly<{
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>;
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
}>>();
const CLAIMED_TRACKER_FEE_CHECKS = new WeakSet<object>();
const TRACKER_PROTOCOL_V2_CHECKS = new WeakMap<object, Readonly<{
  target: Readonly<SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2>;
  result: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1Result>;
  genesisHeaderIdHex: string;
}>>();
const CLAIMED_TRACKER_V2_CHECKS = new WeakSet<object>();
const REVALIDATED_TRACKER_V2_CHECKS = new WeakSet<object>();
const TRACKER_V2_FRESHNESS = new WeakMap<object, Readonly<{
  check: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Check>;
  binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
}>>();

export interface SubstrateFederatedIsolatedDevnetTrackerV2CheckInput {
  readonly context: Readonly<SubstrateFederatedTrackerV2Context>;
  readonly transaction: Readonly<SubstrateFederatedTrackerV2ExternalFeeTransaction>;
  readonly observedHeaderContext: Readonly<BridgeValidityTrackerObservedHeaderContextV1>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerV2Check {
  readonly result: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1Result>;
  readonly setupRequestDigestHex: string;
  readonly feeFundingTransactionIdHex: string;
}

export function assertSubstrateFederatedIsolatedDevnetTrackerV2Check(
  value: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Check>,
  target: Readonly<SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2>,
): void {
  const material = TRACKER_PROTOCOL_V2_CHECKS.get(value);
  if (material === undefined || material.target !== target || material.result !== value.result) {
    throw new Error('isolated tracker protocol V2 check lacks exact session provenance');
  }
  const current = assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(target);
  if (canonicalJson(current) !== canonicalJson(value.result.targetBinding)) {
    throw new Error('isolated tracker protocol V2 check target binding changed');
  }
}

/** Claim while the original frozen action is live; persistence cannot recreate it. */
export async function claimSubstrateFederatedIsolatedDevnetTrackerV2Check(
  check: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Check>,
  target: Readonly<SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2>,
) {
  assertSubstrateFederatedIsolatedDevnetTrackerV2Check(check, target);
  if (CLAIMED_TRACKER_V2_CHECKS.has(check)) throw new Error('tracker V2 check is already claimed');
  CLAIMED_TRACKER_V2_CHECKS.add(check);
  const revalidationDigestHex = await reobserveTrackerV2(check, target, () => {
    assertSubstrateFederatedIsolatedDevnetTrackerV2Check(check, target);
  }, true);
  return Object.freeze({ binding: check.result.targetBinding, revalidationDigestHex,
    genesisHeaderIdHex: TRACKER_PROTOCOL_V2_CHECKS.get(check)!.genesisHeaderIdHex });
}

export interface SubstrateFederatedIsolatedDevnetTrackerV2Freshness {
  readonly completion: Readonly<SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1>;
  readonly binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
}

export async function revalidateSubstrateFederatedIsolatedDevnetTrackerV2Reservation(
  check: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Check>,
  target: Readonly<SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Freshness>> {
  if (!TRACKER_PROTOCOL_V2_CHECKS.has(check) || !CLAIMED_TRACKER_V2_CHECKS.has(check)
    || REVALIDATED_TRACKER_V2_CHECKS.has(check)) {
    throw new Error('tracker V2 reservation revalidation lacks an unconsumed claimed check');
  }
  REVALIDATED_TRACKER_V2_CHECKS.add(check);
  const binding = assertSubstrateFederatedIsolatedDevnetTrackerFreshnessLineageV2(target, check.result.targetBinding);
  const assertActive = () => {
    const current = assertSubstrateFederatedIsolatedDevnetTrackerFreshnessLineageV2(target, check.result.targetBinding);
    if (canonicalJson(current) !== canonicalJson(binding)) throw new Error('tracker V2 freshness binding changed');
  };
  await reobserveTrackerV2(check, target, assertActive, true);
  const checked = await checkSignedTransaction(check.result.signedCandidate, 'isolated tracker V2 reservation', PRIMARY_NODE_ORIGIN);
  if (checked === null) throw new Error('tracker V2 reservation node check failed');
  await reobserveTrackerV2(check, target, assertActive, true);
  const freshness = Object.freeze({ binding,
    completion: issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(target) });
  TRACKER_V2_FRESHNESS.set(freshness, Object.freeze({ check, binding }));
  return freshness;
}

export async function checkSubstrateFederatedIsolatedDevnetTrackerV2Transport(
  check: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Check>,
  freshness: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Freshness>,
  target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>,
) {
  const retained = TRACKER_V2_FRESHNESS.get(freshness);
  if (retained === undefined || retained.check !== check) throw new Error('tracker V2 transport lacks exact freshness provenance');
  // Consume before I/O, including a failed check. The same signed candidate is never retried.
  TRACKER_V2_FRESHNESS.delete(freshness);
  const binding = assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(target);
  const assertActive = () => {
    const current = assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(target);
    if (canonicalJson(current) !== canonicalJson(binding)
      || current.reservationFreshnessProcessBindingDigestHex !== retained.binding.processBindingDigestHex
      || current.reservationFreshnessExecutionTargetIdentityDigestHex !== retained.binding.executionTargetIdentityDigestHex) {
      throw new Error('tracker V2 transport does not descend from its reservation freshness');
    }
  };
  await reobserveTrackerV2(check, target, assertActive, false);
  const checked = await checkSignedTransaction(check.result.signedCandidate, 'isolated tracker V2 pretransport', PRIMARY_NODE_ORIGIN);
  if (checked === null) throw new Error('tracker V2 pretransport node check failed');
  await reobserveTrackerV2(check, target, assertActive, false);
  const checkedAcceptance = promoteLocalWasmCheckedTransactionForSubmissionV1(check.result.signedCandidate, checked, {
    processBindingDigestHex: binding.processBindingDigestHex,
    executionTargetIdentityDigestHex: binding.executionTargetIdentityDigestHex,
  });
  return Object.freeze({ binding, checkedAcceptance });
}

async function reobserveTrackerV2(
  check: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Check>,
  target: Readonly<{ primaryNodeOrigin: string; witnessNodeOrigin: string }>,
  assertActive: () => void,
  frozen: boolean,
): Promise<string> {
  const material = TRACKER_PROTOCOL_V2_CHECKS.get(check);
  if (material === undefined) throw new Error('tracker V2 observation lacks session provenance');
  assertActive();
  if (target.primaryNodeOrigin !== PRIMARY_NODE_ORIGIN || target.witnessNodeOrigin !== WITNESS_NODE_ORIGIN) {
    throw new Error('tracker V2 observation origins differ from the isolated target');
  }
  const expectedHeaders = check.result.observedHeaderContext.headers;
  const importedWasm = await import('ergo-lib-wasm-nodejs');
  const wasm = importedWasm.default ?? importedWasm;
  const observations = [];
  for (const origin of [PRIMARY_NODE_ORIGIN, WITNESS_NODE_ORIGIN]) {
    const genesis = await ngetDirect('/blocks/at/1', origin);
    if (canonicalJson(genesis) !== canonicalJson([material.genesisHeaderIdHex])) {
      throw new Error('tracker V2 admission genesis changed');
    }
    const apiHeaders = await ngetDirect('/blocks/lastHeaders/10', origin);
    if (!Array.isArray(apiHeaders) || apiHeaders.length !== 10) throw new Error('tracker V2 admission headers unavailable');
    // Ergo's API returns oldest-first; the checked state context is newest-first.
    const headers = [...apiHeaders].reverse();
    const anchor = check.result.observedHeaderContext.anchorHeader;
    const anchorIndex = headers.findIndex(header => header.height === anchor.height);
    if (anchorIndex < 0) throw new Error('tracker V2 transport anchor is stale or replaced');
    const currentHeaders = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders: headers, anchorContextIndex: anchorIndex,
      expectedAnchorHeaderIdHex: anchor.id, expectedAnchorExtensionRootHex: anchor.extensionRootHex,
    });
    if ((frozen && canonicalJson(currentHeaders.headers.map(header => header.serializedHex))
      !== canonicalJson(expectedHeaders.map(header => header.serializedHex)))
      || currentHeaders.currentHeight < check.result.observedHeaderContext.currentHeight) {
      throw new Error('tracker V2 frozen header context changed or regressed');
    }
    const inputs = [];
    for (const expected of check.result.transaction.inputBoxes) {
      const current = await normalizeEip12Box(await ngetDirect(`/utxo/byId/${expected.boxId}`, origin), 'tracker V2 admission input');
      if (canonicalJson(current) !== canonicalJson(expected)) throw new Error('tracker V2 admission input changed');
      inputs.push(current);
    }
    observations.push({ origin, genesis, headers: currentHeaders.headers.map(header => header.serializedHex), inputs });
    assertActive();
  }
  return sha256CanonicalJson({ checkDigestHex: check.result.checkDigestHex, observations }, 'E2S_ISOLATED_TRACKER_V2_ADMISSION_REVALIDATION');
}

/** Claim only a genuine retained-signer result; a JSON copy cannot restore it. */
export function claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1(
  check: Readonly<SubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
) {
  const material = TRACKER_FEE_CHECKS.get(check);
  if (material === undefined || material.target !== target || CLAIMED_TRACKER_FEE_CHECKS.has(check)) {
    throw new Error('tracker fee funding check lacks unconsumed exact provenance');
  }
  const binding = assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(material.batch, target);
  CLAIMED_TRACKER_FEE_CHECKS.add(check);
  return Object.freeze({ batch: material.batch, binding });
}
const FAMILY_EXECUTION_BATCHES = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    familyCompilerBinding:
      Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>;
    trackerCompilerBinding:
      Readonly<SubstrateFederatedTrackerCompilerBindingV1>;
  }>
>();
const PEG_IN_SOURCE_LOCK_CHECK_MATERIAL = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
    signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
    checked: Readonly<LocalWasmOpaqueCheckResult>;
  }>
>();
const PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
    signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
    checked: Readonly<LocalWasmOpaqueCheckResult>;
  }>
>();
const OBSERVED_ANCHOR_TRACKER_CHECK_RECEIPTS = new WeakSet<object>();
const OBSERVED_ANCHOR_TRACKER_CHECK_V2_RECEIPTS = new WeakSet<object>();
const TRACKER_RESERVATION_FRESHNESS_CHECK_V1_RECEIPTS = new WeakSet<object>();
const TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL = new WeakMap<
  object,
  Readonly<{
    target: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
    >;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
    signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
    checked: Readonly<LocalWasmOpaqueCheckResult>;
    completion: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1
    >;
  }>
>();

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>;
  readonly signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
  readonly checkedAcceptance:
    Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

const PEG_IN_SOURCE_LOCK_EXECUTION_CHECKS = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>;
  readonly signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
  readonly checkedAcceptance:
    Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

const PEG_IN_COMMITTED_VAULT_EXECUTION_CHECKS = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();

export interface SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >;
  readonly signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
  readonly checkedAcceptance:
    Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

const TRACKER_TRANSPORT_EXECUTION_CHECKS = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>;
    binding: Readonly<
      SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1
    >;
  }>
>();

export interface RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input {
  readonly portableReplayInput:
    Readonly<ReplaySubstrateFederatedIsolatedDevnetPortableV1Input>;
  readonly primaryNodeOrigin: string;
  readonly witnessNodeOrigin: string;
}

export interface RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input {
  readonly sourceAndCompilerInput:
    Readonly<DeriveSubstrateFederatedIsolatedDevnetSourceCompilerClosureV2Input>;
  readonly expectedSettlementGenesisHeaderIdHex: string;
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
  readonly claimCheckpointMiningCredential: () =>
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly claimTrackerAdmissionMiningCredential: () =>
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly claimTrackerConfirmationMiningCredential: () =>
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly dispose: () => void;
  readonly run: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>>;
  readonly runV3: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV3>>;
  readonly runForExecutionV3: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>>;
  readonly runForExecutionV3RetainingTrackerFeeSigner: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    feePayerPublicKeyHex: string,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>>;
  readonly runForExecutionV3RetainingTrackerSigner: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>>;
  readonly runForExecutionV3RetainingPegInAndTrackerSigner: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>>;
  readonly checkPegInSourceLockV2RetainingSigner: (
    packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>>;
  readonly checkPegInCommittedVaultV2RetainingSigner: (
    packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>>;
  readonly checkTrackerFeeFundingV3: (
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1>>;
  readonly checkFrozenTrackerV2Candidate: (
    input: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CheckInput>,
    target: Readonly<SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Check>>;
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
    target: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
    >,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
  >>;
  readonly checkFrozenTrackerCandidate: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
    >,
    target: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
    >,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
  >>;
  readonly recheckTrackerReservationFreshnessCandidate: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
    >,
    target: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
    >,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
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

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input {
  readonly reservePredecessorBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
  readonly unsignedTransaction:
    Readonly<MaterializedUnsignedTransaction>;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'PASS';
  readonly reservePredecessorBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
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
    readonly exactThreeInputTransitionBound: true;
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

export interface SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input {
  readonly context: Readonly<SubstrateFederatedTrackerV1Context>;
  readonly observedHeaderContext:
    Readonly<BridgeValidityTrackerObservedHeaderContextV1>;
  readonly trackerInputBox: unknown;
}

export interface SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'PASS';
  readonly trackerInputBoxIdHex: string;
  readonly statementIdHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeight: number;
  readonly anchorContextIndex: number;
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
    readonly localIsolatedDevnetOnly: true;
    readonly checkpointBoundActiveTarget: true;
    readonly observedAnchorContextBound: true;
    readonly exactTrackerInputAndTransactionBound: true;
    readonly localWasmRootSigningPerformed: true;
    readonly localJvmNodeCheckPassed: true;
    readonly signedTransactionBytesPersisted: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly replayProtectionEstablished: false;
    readonly payoutEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export type SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt =
  Readonly<ObservedAnchorTrackerCheckKernelV2Result> & Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA;
    readonly version: 2;
    readonly status: 'PASS';
    readonly receiptDigestHex: string;
  }>;

export type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt =
  Readonly<ObservedAnchorTrackerReservationFreshnessCheckKernelV1Result>
  & Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA;
    readonly version: 1;
    readonly status: 'PASS';
    readonly receiptDigestHex: string;
  }>;

export function assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || !OBSERVED_ANCHOR_TRACKER_CHECK_RECEIPTS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated observed-anchor tracker check lacks exact process provenance',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || !OBSERVED_ANCHOR_TRACKER_CHECK_V2_RECEIPTS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated observed-anchor frozen tracker check V2 lacks exact runtime provenance',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || !TRACKER_RESERVATION_FRESHNESS_CHECK_V1_RECEIPTS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated tracker reservation freshness check lacks exact runtime provenance',
    );
  }
}

/** Promote one exact freshness check into the next owned transport phase. */
export function promoteSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
  receipt: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >,
  target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1
> {
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
    receipt,
  );
  const material = TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.get(receipt);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(target);
  if (
    material === undefined
    || material.binding.processBindingDigestHex
      !== current.reservationFreshnessProcessBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.reservationFreshnessExecutionTargetIdentityDigestHex
    || receipt.target.processBindingDigestHex
      !== current.reservationFreshnessProcessBindingDigestHex
    || receipt.target.executionTargetIdentityDigestHex
      !== current.reservationFreshnessExecutionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated tracker freshness check lacks exact transport provenance',
    );
  }
  TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.delete(receipt);
  const submissionExecutionBinding = Object.freeze({
    processBindingDigestHex: current.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      current.executionTargetIdentityDigestHex,
  });
  const promoted = Object.freeze({
    receipt,
    signedCandidate: material.signedCandidate,
    checkedAcceptance:
      promoteLocalWasmCheckedTransactionForSubmissionV1(
        material.signedCandidate,
        material.checked,
        submissionExecutionBinding,
      ),
  });
  TRACKER_TRANSPORT_EXECUTION_CHECKS.set(promoted, Object.freeze({
    target,
    binding: current,
  }));
  return promoted;
}

export function assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1(
  value: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1
  >,
  target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>,
): Readonly<
  SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1
> {
  const material = TRACKER_TRANSPORT_EXECUTION_CHECKS.get(value);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.receipt.target.processBindingDigestHex
      !== current.reservationFreshnessProcessBindingDigestHex
    || value.receipt.target.executionTargetIdentityDigestHex
      !== current.reservationFreshnessExecutionTargetIdentityDigestHex
    || value.signedCandidate.txId !== value.receipt.signedTransactionIdHex
    || value.checkedAcceptance.submissionHandle.txId
      !== value.receipt.signedTransactionIdHex
  ) {
    throw new Error(
      'isolated tracker transport execution check binding changed',
    );
  }
  return current;
}

export function discardSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
  receipt: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >,
): void {
  TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.delete(receipt);
}

export function claimSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(
  receipt: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1
> {
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
    receipt,
  );
  const material = TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.get(receipt);
  if (material === undefined) {
    throw new Error(
      'isolated tracker reservation freshness completion is absent or discarded',
    );
  }
  return material.completion;
}

/** Promote the exact in-process source-lock check once inside the static LAB root. */
export function promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(
  receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1> {
  const material = PEG_IN_SOURCE_LOCK_CHECK_MATERIAL.get(receipt);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || receipt.target.processBindingDigestHex
      !== current.processBindingDigestHex
    || receipt.target.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated peg-in source-lock check lacks exact execution provenance',
    );
  }
  PEG_IN_SOURCE_LOCK_CHECK_MATERIAL.delete(receipt);
  const promoted = Object.freeze({
    receipt,
    signedCandidate: material.signedCandidate,
    checkedAcceptance:
      promoteLocalWasmCheckedTransactionForSubmissionV1(
        material.signedCandidate,
        material.checked,
        current,
      ),
  });
  PEG_IN_SOURCE_LOCK_EXECUTION_CHECKS.set(promoted, Object.freeze({
    target,
    binding: current,
  }));
  return promoted;
}

export function assertSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1(
  value:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const material = PEG_IN_SOURCE_LOCK_EXECUTION_CHECKS.get(value);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.receipt.target.processBindingDigestHex
      !== current.processBindingDigestHex
    || value.receipt.target.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.signedCandidate.txId !== value.receipt.signedTransactionIdHex
    || value.checkedAcceptance.submissionHandle.txId
      !== value.receipt.signedTransactionIdHex
  ) {
    throw new Error(
      'isolated peg-in source-lock execution check binding changed',
    );
  }
  return current;
}

export function discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(
  receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>,
): void {
  PEG_IN_SOURCE_LOCK_CHECK_MATERIAL.delete(receipt);
}

/** Promote the exact in-process committed-vault check once inside the LAB root. */
export function promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(
  receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1> {
  const material = PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL.get(receipt);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || receipt.target.processBindingDigestHex
      !== current.processBindingDigestHex
    || receipt.target.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated committed-vault check lacks exact execution provenance',
    );
  }
  PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL.delete(receipt);
  const promoted = Object.freeze({
    receipt,
    signedCandidate: material.signedCandidate,
    checkedAcceptance:
      promoteLocalWasmCheckedTransactionForSubmissionV1(
        material.signedCandidate,
        material.checked,
        current,
      ),
  });
  PEG_IN_COMMITTED_VAULT_EXECUTION_CHECKS.set(promoted, Object.freeze({
    target,
    binding: current,
  }));
  return promoted;
}

export function assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1(
  value:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const material = PEG_IN_COMMITTED_VAULT_EXECUTION_CHECKS.get(value);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.receipt.target.processBindingDigestHex
      !== current.processBindingDigestHex
    || value.receipt.target.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.signedCandidate.txId !== value.receipt.signedTransactionIdHex
    || value.checkedAcceptance.submissionHandle.txId
      !== value.receipt.signedTransactionIdHex
  ) {
    throw new Error(
      'isolated committed-vault execution check binding changed',
    );
  }
  return current;
}

export function discardSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(
  receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>,
): void {
  PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL.delete(receipt);
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
  readonly trackerCompilerBinding:
    Readonly<SubstrateFederatedTrackerCompilerBindingV1>;
}

export interface SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3 extends Omit<
  SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2, 'receipt' | 'request'
> {
  readonly receipt: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV3>;
  readonly request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV3>;
}

interface FixedSetupCheckRunV3 {
  readonly receipt: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV3>;
  readonly executionReceipt: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV3>;
  readonly request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV3>;
  readonly sourceAndCompilerInput: Readonly<DeriveSubstrateFederatedIsolatedDevnetSourceCompilerClosureV2Input>;
}

export interface SubstrateFederatedTrackerCompilerBindingV1 {
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1['sourceAndCompilerInput']['trackerRequest']>;
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1['sourceAndCompilerInput']['trackerReceipt']>;
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
  readonly trackerCompilerBinding:
    Readonly<SubstrateFederatedTrackerCompilerBindingV1>;
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
    let checkpointMiningCredential:
      Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined =
        issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          mnemonic,
          identity.publicKeyHex,
        );
    let trackerAdmissionMiningCredential:
      Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined =
        issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          mnemonic,
          identity.publicKeyHex,
        );
    let trackerConfirmationMiningCredential:
      Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined =
        issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          mnemonic,
          identity.publicKeyHex,
        );
    let frozenTrackerCheck:
      Readonly<SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt>
      | undefined;
    let trackerFeeContinuation: Readonly<{
      batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>;
      feePayerPublicKeyHex: string;
      retainTrackerSigner: boolean;
      trackerCompilerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
    }> | undefined;
    let retainedTrackerFeeCheck: Readonly<SubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1> | undefined;
    let retainedPegInPacket: Readonly<SubstrateFederatedPooledReserveDepositV2Packet> | undefined;
    let state:
      | 'open'
      | 'running'
      | 'setup-complete'
      | 'v3-peg-in-ready'
      | 'v3-source-lock-checked'
      | 'v3-tracker-fee-ready'
      | 'v3-tracker-ready'
      | 'source-lock-check-complete'
      | 'committed-vault-check-complete'
      | 'frozen-tracker-check-complete'
      | 'closed' = 'open';
    let terminalInvalidationRequested = false;
    const close = (): void => {
      if (state === 'closed') return;
      terminalInvalidationRequested = true;
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        miningCredential,
      );
      if (checkpointMiningCredential !== undefined) {
        revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          checkpointMiningCredential,
        );
        checkpointMiningCredential = undefined;
      }
      if (trackerAdmissionMiningCredential !== undefined) {
        revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          trackerAdmissionMiningCredential,
        );
        trackerAdmissionMiningCredential = undefined;
      }
      if (trackerConfirmationMiningCredential !== undefined) {
        revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          trackerConfirmationMiningCredential,
        );
        trackerConfirmationMiningCredential = undefined;
      }
      frozenTrackerCheck = undefined;
      trackerFeeContinuation = undefined;
      retainedTrackerFeeCheck = undefined;
      retainedPegInPacket = undefined;
      mnemonic = '';
      state = 'closed';
    };
    const consume = async <T>(
      expectedState:
        | 'open'
        | 'setup-complete'
        | 'v3-peg-in-ready'
        | 'v3-source-lock-checked'
        | 'v3-tracker-fee-ready'
        | 'v3-tracker-ready'
        | 'source-lock-check-complete'
        | 'committed-vault-check-complete'
        | 'frozen-tracker-check-complete',
      operation: (activeMnemonic: string) => Promise<T>,
      successState:
        | 'setup-complete'
        | 'v3-peg-in-ready'
        | 'v3-source-lock-checked'
        | 'v3-tracker-fee-ready'
        | 'v3-tracker-ready'
        | 'source-lock-check-complete'
        | 'committed-vault-check-complete'
        | 'frozen-tracker-check-complete'
        | 'closed',
    ): Promise<T> => {
      if (state !== expectedState) {
        const error = new Error(
          expectedState === 'open'
            ? 'isolated fixed setup-check session is already consumed or disposed'
            : 'isolated peg-in signer continuation is absent, consumed, or disposed',
        );
        if (state === 'running') {
          terminalInvalidationRequested = true;
        } else if (state !== 'closed') {
          close();
        }
        throw error;
      }
      state = 'running';
      try {
        const result = await operation(mnemonic);
        if (terminalInvalidationRequested) {
          close();
          throw new Error(
            'isolated fixed setup-check session was invalidated by a concurrent transition',
          );
        }
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
    const runRetainingTrackerSignerV3 = async (
      input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      activeMnemonic: string,
    ): Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>> => {
      const captured = captureInputV3(input);
      const profile = captured.sourceAndCompilerInput.trackerRequest.profile;
      if (profile.ergoAdmissionThreshold !== 1 || profile.ergoAdmissionPublicKeysHex.length !== 1
        || profile.ergoAdmissionPublicKeysHex[0] !== signer.publicKeyHex) {
        throw new Error('retained tracker V2 route requires the exact synthetic admission signer');
      }
      const binding = Object.freeze({ ...assertExecutionTargetMatchesOrigins(target, captured) });
      const result = await runFixedSetupCheckV3(captured, activeMnemonic);
      const batch = promoteSetupExecutionBatchV3(result, target, binding);
      trackerFeeContinuation = Object.freeze({ batch, feePayerPublicKeyHex: signer.publicKeyHex, retainTrackerSigner: true,
        trackerCompilerRequest: captured.sourceAndCompilerInput.trackerRequest });
      return batch;
    };
    const assertPegInPacketV2 = async (
      packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ): Promise<void> => {
      assertSubstrateFederatedPooledReserveDepositV2Packet(packet);
      const continuation = trackerFeeContinuation;
      if (continuation?.retainTrackerSigner !== true) {
        throw new Error('isolated V2 peg-in setup custody is absent');
      }
      const compiler = getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3(continuation.batch, target);
      if (packet.familyIdHex !== compiler.familyReceipt.profile.familyIdHex
        || canonicalJson(packet.familyCompiler) !== canonicalJson({
          trackerRequestDigestHex: compiler.familyReceipt.trackerCompilerRequestDigestHex,
          trackerReceiptDigestHex: compiler.familyReceipt.trackerCompilerReceiptDigestHex,
          familyRequestDigestHex: compiler.familyReceipt.familyCompilerRequestDigestHex,
          familyReceiptDigestHex: compiler.familyReceipt.receiptDigestHex,
          compilerLockDigestHex: compiler.familyReceipt.compilerLockDigestHex,
        })) {
        throw new Error('isolated V2 peg-in compiler differs from retained setup');
      }
      const reserve = await materializeUnsignedTransaction(
        structuredClone(continuation.batch.orderedTransactions[2]!.issuance.unsignedTransactionBody) as unknown as Eip12UnsignedTransaction,
        'retained V3 peg-in reserve',
      );
      if (canonicalJson(packet.boxes.reservePredecessor) !== canonicalJson(reserve.outputs[0])) {
        throw new Error('isolated V2 peg-in reserve differs from retained setup');
      }
      assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(continuation.batch, target);
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
          result.trackerCompilerBinding,
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
      claimCheckpointMiningCredential: () => {
        if (checkpointMiningCredential === undefined) {
          throw new Error(
            'isolated checkpoint mining credential is absent, claimed, or disposed',
          );
        }
        const credential = checkpointMiningCredential;
        checkpointMiningCredential = undefined;
        return credential;
      },
      claimTrackerAdmissionMiningCredential: () => {
        if (trackerAdmissionMiningCredential === undefined) {
          throw new Error(
            'isolated tracker-admission mining credential is absent, claimed, or disposed',
          );
        }
        const credential = trackerAdmissionMiningCredential;
        trackerAdmissionMiningCredential = undefined;
        return credential;
      },
      claimTrackerConfirmationMiningCredential: () => {
        if (trackerConfirmationMiningCredential === undefined) {
          throw new Error(
            'isolated tracker-confirmation mining credential is absent, claimed, or disposed',
          );
        }
        const credential = trackerConfirmationMiningCredential;
        trackerConfirmationMiningCredential = undefined;
        return credential;
      },
      dispose: () => {
        if (state === 'running') {
          throw new Error('isolated fixed setup-check session is running');
        }
        close();
      },
      run: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
      ) => consume(
        'open',
        async activeMnemonic =>
          (await runFixedSetupCheck(input, activeMnemonic)).receipt,
        'closed',
      ),
      runV3: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
      ) => consume(
        'open',
        async activeMnemonic => (await runFixedSetupCheckV3(input, activeMnemonic)).receipt,
        'closed',
      ),
      runForExecutionV3: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'open',
        async activeMnemonic => {
          const captured = captureInputV3(input);
          const expectedTargetBinding = Object.freeze({
            ...assertExecutionTargetMatchesOrigins(target, captured),
          });
          const result = await runFixedSetupCheckV3(captured, activeMnemonic);
          return promoteSetupExecutionBatchV3(result, target, expectedTargetBinding);
        },
        'closed',
      ),
      runForExecutionV3RetainingTrackerFeeSigner: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
        feePayerPublicKeyHex: string,
      ) => consume('open', async activeMnemonic => {
        if (typeof feePayerPublicKeyHex !== 'string' || !/^(02|03)[0-9a-f]{64}$/.test(feePayerPublicKeyHex)) {
          throw new Error('tracker fee recipient must be a canonical compressed public key');
        }
        const captured = captureInputV3(input);
        const binding = Object.freeze({ ...assertExecutionTargetMatchesOrigins(target, captured) });
        const result = await runFixedSetupCheckV3(captured, activeMnemonic);
        const batch = promoteSetupExecutionBatchV3(result, target, binding);
        trackerFeeContinuation = Object.freeze({ batch, feePayerPublicKeyHex, retainTrackerSigner: false,
          trackerCompilerRequest: captured.sourceAndCompilerInput.trackerRequest });
        return batch;
      }, 'v3-tracker-fee-ready'),
      runForExecutionV3RetainingTrackerSigner: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume('open', activeMnemonic => runRetainingTrackerSignerV3(input, target, activeMnemonic),
        'v3-tracker-fee-ready'),
      runForExecutionV3RetainingPegInAndTrackerSigner: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume('open', activeMnemonic => runRetainingTrackerSignerV3(input, target, activeMnemonic),
        'v3-peg-in-ready'),
      checkPegInSourceLockV2RetainingSigner: async (
        packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume('v3-peg-in-ready', async activeMnemonic => {
        await assertPegInPacketV2(packet, target);
        const checked = await runPegInSourceLockCheck({
          sourceFundingBoxIdHex: packet.boxes.sourceFundingInput.boxId,
          unsignedTransaction: packet.transactions.sourceLockCreation,
        }, target, signer, activeMnemonic);
        await assertPegInPacketV2(packet, target);
        retainedPegInPacket = packet;
        return checked;
      }, 'v3-source-lock-checked'),
      checkPegInCommittedVaultV2RetainingSigner: async (
        packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume('v3-source-lock-checked', async activeMnemonic => {
        if (packet !== retainedPegInPacket) {
          throw new Error('isolated V2 peg-in packet differs from the checked source lock');
        }
        await assertPegInPacketV2(packet, target);
        const checked = await runPegInCommittedVaultCheck({
          reservePredecessorBoxIdHex: packet.boxes.reservePredecessor.boxId,
          sourceLockBoxIdHex: packet.boxes.sourceLock.boxId,
          transitionFeeFundingBoxIdHex: packet.boxes.transitionFeeFunding.boxId,
          unsignedTransaction: packet.transactions.reserveTransition,
        }, target, signer, activeMnemonic);
        await assertPegInPacketV2(packet, target);
        retainedPegInPacket = undefined;
        return checked;
      }, 'v3-tracker-fee-ready'),
      checkTrackerFeeFundingV3: async (
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume('v3-tracker-fee-ready', async activeMnemonic => {
        const continuation = trackerFeeContinuation;
        if (continuation === undefined) throw new Error('tracker fee continuation is absent');
        const binding = assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(continuation.batch, target);
        const issuance = continuation.batch.orderedTransactions[0]!.issuance;
        const genesis = await materializeUnsignedTransaction(
          structuredClone(issuance.unsignedTransactionBody) as unknown as Eip12UnsignedTransaction,
          'retained V3 tracker genesis',
        );
        const source = genesis.outputs[1];
        if (genesis.txId !== issuance.unsignedTransactionIdHex || genesis.outputs.length !== 3
          || source === undefined || source.assets.length !== 0
          || ![signer.p2pkErgoTreeHex, signer.rewardInputErgoTrees.delay1, signer.rewardInputErgoTrees.delay720]
            .includes(source.ergoTree)) {
          throw new Error('retained V3 tracker genesis has no exact operator change');
        }
        const reobserve = async (): Promise<void> => {
          assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(continuation.batch, target);
          for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
            const current = await ngetDirect(`/utxo/byId/${source.boxId}`, origin);
            const exact = await normalizeEip12Box(current, 'tracker fee funding live source');
            if (canonicalJson(exact) !== canonicalJson(source)) {
              throw new Error('tracker fee funding live source differs from retained genesis change');
            }
          }
        };
        await reobserve();
        const headers: unknown = await ngetDirect('/blocks/lastHeaders/10', target.primaryNodeOrigin);
        if (!Array.isArray(headers) || headers.length !== 10) {
          throw new Error('tracker fee funding requires ten signing headers');
        }
        const tip = selectLatestHeader(headers);
        const transaction = await buildSubstrateFederatedTrackerV2FeeFunding({
          sourceBox: source, fundingPublicKeyHex: signer.publicKeyHex,
          feePayerPublicKeyHex: continuation.feePayerPublicKeyHex, currentHeight: tip.header.height + 1,
        });
        const prepared = await prepareLocalWasmRootCheckCandidates({
          mnemonic: activeMnemonic, networkPrefix: 16, headers, nodeOrigin: target.primaryNodeOrigin,
          candidates: [{ role: 'tracker-v2-fee-funding', eip12Tx: transaction.eip12Tx, expectedTxId: transaction.txId }],
        });
        if (prepared.pubKeyHex !== signer.publicKeyHex || prepared.ergoTreeHex !== signer.p2pkErgoTreeHex
          || prepared.candidates.length !== 1 || prepared.candidates[0]!.expectedTxId !== transaction.txId) {
          throw new Error('tracker fee funding signer binding differs');
        }
        const candidate = prepared.candidates[0]!.signedCandidate;
        const checked = await checkSignedTransaction(candidate, 'isolated tracker V2 fee funding', target.primaryNodeOrigin);
        if (checked === null) throw new Error('tracker fee funding JVM node check failed');
        await reobserve();
        const checkedAcceptance = promoteLocalWasmCheckedTransactionForSubmissionV1(candidate, checked, binding);
        assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(continuation.batch, target);
        const result = Object.freeze({ transaction, signedCandidate: candidate, checkedAcceptance });
        TRACKER_FEE_CHECKS.set(result, Object.freeze({ batch: continuation.batch, target }));
        if (continuation.retainTrackerSigner) retainedTrackerFeeCheck = result;
        return result;
      }, trackerFeeContinuation?.retainTrackerSigner === true ? 'v3-tracker-ready' : 'closed'),
      checkFrozenTrackerV2Candidate: async (
        inputValue: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CheckInput>,
        target: Readonly<SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2>,
      ) => consume('v3-tracker-ready', async activeMnemonic => {
        const continuation = trackerFeeContinuation;
        const feeCheck = retainedTrackerFeeCheck;
        const context = inputValue.context;
        const transaction = inputValue.transaction;
        const observedHeaderContext = inputValue.observedHeaderContext;
        if (continuation?.retainTrackerSigner !== true || feeCheck === undefined) {
          throw new Error('retained tracker V2 signer or fee funding is absent');
        }
        assertSubstrateFederatedTrackerV2Context(context);
        assertSubstrateFederatedTrackerV2ExternalFeeTransaction(transaction);
        assertBridgeValidityTrackerObservedHeaderContextV1(observedHeaderContext);
        const genesis = await materializeUnsignedTransaction(
          structuredClone(continuation.batch.orderedTransactions[0]!.issuance.unsignedTransactionBody) as unknown as Eip12UnsignedTransaction,
          'retained V3 tracker input',
        );
        if (canonicalJson(transaction.inputBoxes[0]) !== canonicalJson(genesis.outputs[0])
          || canonicalJson(transaction.inputBoxes[1]) !== canonicalJson(feeCheck.transaction.outputs[0])) {
          throw new Error('tracker V2 inputs differ from retained genesis and fee funding');
        }
        assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(target);
        for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
          if (canonicalJson(await ngetDirect('/blocks/at/1', origin))
            !== canonicalJson([continuation.batch.request.target.genesisHeaderIdHex])) {
            throw new Error('tracker V2 frozen target genesis differs from setup');
          }
        }
        const result = await executeSubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1({
          compilerRequest: continuation.trackerCompilerRequest,
          context, transaction, observedHeaderContext, target,
          expectedSigner: { publicKeyHex: signer.publicKeyHex, p2pkErgoTreeHex: signer.p2pkErgoTreeHex, networkPrefix: signer.networkPrefix },
          operations: {
            captureTargetBinding: () => assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(target),
            observeInputBox: (boxId, origin) => ngetDirect(`/utxo/byId/${boxId}`, origin),
            prepareCandidate: input => prepareLocalWasmRootCheckCandidates({
              mnemonic: activeMnemonic, networkPrefix: input.networkPrefix, nodeOrigin: input.nodeOrigin,
              headers: input.headers,
              candidates: [{ role: input.role, eip12Tx: input.eip12Tx, expectedTxId: input.expectedTxId }],
            }),
            checkCandidate: (candidate, origin) => checkSignedTransaction(candidate, 'isolated tracker protocol V2 check', origin),
          },
        });
        const check = Object.freeze({ result, setupRequestDigestHex: continuation.batch.request.requestDigestHex,
          feeFundingTransactionIdHex: feeCheck.transaction.txId });
        TRACKER_PROTOCOL_V2_CHECKS.set(check, Object.freeze({ target, result,
          genesisHeaderIdHex: continuation.batch.request.target.genesisHeaderIdHex }));
        return check;
      }, 'closed'),
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
        'closed',
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
        'setup-complete',
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
        'closed',
      ),
      checkPegInSourceLockRetainingSigner: async (
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
        'source-lock-check-complete',
      ),
      checkPegInCommittedVault: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
        >,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'source-lock-check-complete',
        activeMnemonic => runPegInCommittedVaultCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        'closed',
      ),
      checkPegInCommittedVaultRetainingSigner: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
        >,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'source-lock-check-complete',
        activeMnemonic => runPegInCommittedVaultCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        'committed-vault-check-complete',
      ),
      checkTrackerCandidate: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
        >,
        target: Readonly<
          SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
        >,
      ) => consume(
        'committed-vault-check-complete',
        activeMnemonic => runObservedAnchorTrackerCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        'closed',
      ),
      checkFrozenTrackerCandidate: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
        >,
        target: Readonly<
          SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
        >,
      ) => consume(
        'committed-vault-check-complete',
        async activeMnemonic => {
          const receipt = await runObservedAnchorTrackerCheckV2(
            input,
            target,
            signer,
            activeMnemonic,
          );
          frozenTrackerCheck = receipt;
          return receipt;
        },
        'frozen-tracker-check-complete',
      ),
      recheckTrackerReservationFreshnessCandidate: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
        >,
        target: Readonly<
          SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
        >,
      ) => consume(
        'frozen-tracker-check-complete',
        activeMnemonic => {
          if (frozenTrackerCheck === undefined) {
            throw new Error(
              'isolated frozen tracker check is absent before freshness recheck',
            );
          }
          assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(
            frozenTrackerCheck,
          );
          return runTrackerReservationFreshnessCheckV1(
            input,
            target,
            signer,
            activeMnemonic,
            frozenTrackerCheck,
          );
        },
        'closed',
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
    || material.trackerCompilerBinding !== batch.trackerCompilerBinding
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

// Only the session can pair a pre-check process binding with its own result.
function promoteSetupExecutionBatchV3(
  result: Readonly<FixedSetupCheckRunV3>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  expectedBinding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>,
): Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3> {
  const assertCurrentTarget = () => {
    const current = assertExecutionTargetMatchesOrigins(target, {
      primaryNodeOrigin: result.request.target.primary.nodeOrigin,
      witnessNodeOrigin: result.request.target.witness.nodeOrigin,
    });
    if (current.processBindingDigestHex !== expectedBinding.processBindingDigestHex
      || current.executionTargetIdentityDigestHex !== expectedBinding.executionTargetIdentityDigestHex) {
      throw new Error('isolated setup V3 execution process binding changed');
    }
    return current;
  };
  assertCurrentTarget();
  const material = takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV3(
    result.executionReceipt, result.request, target,
  );
  const binding = Object.freeze({ ...assertCurrentTarget() });
  const orderedTransactions = material.orderedTransactions.map((transaction, index) => {
    const issuance = result.request.orderedIssuances[index];
    if (issuance === undefined || issuance.ordinal !== transaction.ordinal
      || issuance.role !== transaction.role) {
      throw new Error('isolated setup V3 execution issuance order changed');
    }
    return Object.freeze({
      issuance,
      signedCandidate: transaction.signedCandidate,
      checkedAcceptance: promoteLocalWasmCheckedTransactionForSubmissionV1(
        transaction.signedCandidate, transaction.checked, binding,
      ),
    });
  });
  assertCurrentTarget();
  const batch = Object.freeze({
    receipt: result.receipt,
    request: result.request,
    targetBinding: binding,
    orderedTransactions: Object.freeze(orderedTransactions),
  });
  EXECUTION_BATCHES_V3.set(batch, Object.freeze({ target, binding,
    sourceAndCompilerInput: result.sourceAndCompilerInput }));
  return batch;
}

export function assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const material = EXECUTION_BATCHES_V3.get(batch);
  if (material === undefined || material.target !== target) {
    throw new Error('isolated setup V3 execution batch lacks exact process provenance');
  }
  const current = assertExecutionTargetMatchesOrigins(target, {
    primaryNodeOrigin: batch.request.target.primary.nodeOrigin,
    witnessNodeOrigin: batch.request.target.witness.nodeOrigin,
  });
  if (current.processBindingDigestHex !== material.binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex !== material.binding.executionTargetIdentityDigestHex
    || batch.targetBinding !== material.binding
    || batch.receipt.version !== 3 || batch.request.version !== 3
    || batch.orderedTransactions.length !== 3) {
    throw new Error('isolated setup V3 execution batch process binding changed');
  }
  return current;
}

/** Original compiler receipts plus a template snapshot; no mutable history escapes. */
export function getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<Pick<DeriveSubstrateFederatedIsolatedDevnetSourceCompilerClosureV2Input,
  'trackerRequest' | 'trackerReceipt' | 'familyReceipt' | 'familyTemplates'>> {
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(batch, target);
  const retained = EXECUTION_BATCHES_V3.get(batch)!.sourceAndCompilerInput;
  return Object.freeze({
    trackerRequest: retained.trackerRequest,
    trackerReceipt: retained.trackerReceipt,
    familyReceipt: retained.familyReceipt,
    familyTemplates: structuredClone(retained.familyTemplates),
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
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      PEG_IN_SOURCE_LOCK_CHECK_DIGEST_DOMAIN,
    ),
  });
  PEG_IN_SOURCE_LOCK_CHECK_MATERIAL.set(receipt, Object.freeze({
    target,
    binding: after,
    signedCandidate: prepared.signedCandidate,
    checked,
  }));
  return receipt;
}

async function runPegInCommittedVaultCheck(
  inputValue:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>> {
  const input = capturePegInCommittedVaultCheckInput(inputValue);
  const before = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
    target,
  );
  const nodeOrigin = exactOrigin(
    target.primaryNodeOrigin,
    PRIMARY_NODE_ORIGIN,
    'peg-in committed-vault checker',
  );
  if (
    target.witnessNodeOrigin !== WITNESS_NODE_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error(
      'isolated committed-vault check target differs from the owned pair',
    );
  }
  const transaction = input.unsignedTransaction;
  const independentlyDerivedId = fixedHex(
    await deriveUnsignedTransactionId(transaction.eip12Tx),
    32,
    'isolated committed-vault independently derived transaction ID',
  );
  const reserveInput = transaction.eip12Tx.inputs[0];
  const sourceLockInput = transaction.eip12Tx.inputs[1];
  const transitionFeeInput = transaction.eip12Tx.inputs[2];
  if (
    independentlyDerivedId !== transaction.txId
    || transaction.eip12Tx.inputs.length !== 3
    || reserveInput?.boxId !== input.reservePredecessorBoxIdHex
    || sourceLockInput?.boxId !== input.sourceLockBoxIdHex
    || transitionFeeInput?.boxId !== input.transitionFeeFundingBoxIdHex
    || transaction.eip12Tx.dataInputs.length !== 0
    || transaction.eip12Tx.outputs.length !== 2
    || transaction.outputs.length !== 2
    || Object.keys(reserveInput?.extension ?? {}).sort().join(',') !== '0'
    || typeof reserveInput?.extension['0'] !== 'string'
    || reserveInput.extension['0'].length === 0
    || Object.keys(sourceLockInput?.extension ?? {}).length !== 0
    || Object.keys(transitionFeeInput?.extension ?? {}).length !== 0
  ) {
    throw new Error(
      'isolated peg-in committed-vault transaction binding changed',
    );
  }
  const unsignedTransactionDigestHex = sha256CanonicalJson(
    transaction,
    PEG_IN_COMMITTED_VAULT_TRANSACTION_DIGEST_DOMAIN,
  );
  const batch = await prepareLocalWasmRootCheckCandidatesFromNode({
    mnemonic,
    networkPrefix: expectedSigner.networkPrefix,
    nodeOrigin,
    candidates: [{
      role: 'peg-in-committed-vault',
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
    || prepared.role !== 'peg-in-committed-vault'
    || prepared.expectedTxId !== transaction.txId
    || prepared.signedCandidate.txId !== transaction.txId
  ) {
    throw new Error('isolated peg-in committed-vault signer binding changed');
  }
  const checked = await checkSignedTransaction(
    prepared.signedCandidate,
    'isolated local peg-in committed-vault check',
    nodeOrigin,
  );
  if (checked === null) {
    throw new Error('isolated local committed-vault JVM node check failed');
  }
  const signedBytesDigestHex = fixedHex(
    checked.signedTransactionBytesSha256Hex,
    32,
    'isolated committed-vault signed transaction bytes digest',
  );
  const signedBytesLength = positiveSafeInteger(
    checked.signedTransactionBytesLength,
    'isolated committed-vault signed transaction bytes length',
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
    || checked.signerContext.stateContextTipHeight
      !== batch.stateContextTipHeight
    || checked.signerContext.stateContextTipIdHex !== batch.stateContextTipIdHex
    || checked.checkerIdentity.nodeOrigin !== nodeOrigin
    || checked.checkerIdentity.path !== '/transactions/check'
    || checked.checkerIdentity.method !== 'POST'
    || checked.checkerIdentity.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error(
      'isolated committed-vault signer and JVM node receipt disagree',
    );
  }
  const after = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
    target,
  );
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated committed-vault execution target changed during check',
    );
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    reservePredecessorBoxIdHex: input.reservePredecessorBoxIdHex,
    sourceLockBoxIdHex: input.sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex: input.transitionFeeFundingBoxIdHex,
    unsignedTransactionIdHex: transaction.txId,
    unsignedTransactionDigestHex,
    signedTransactionIdHex: checked.txId,
    signedTransactionCanonicalJsonSha256Hex:
      checked.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex: signedBytesDigestHex,
    signedTransactionBytesLength: signedBytesLength,
    checkResponseSha256Hex: sha256CanonicalJson({
      role: 'peg-in-committed-vault',
      response: checked.checkResult,
    }, PEG_IN_COMMITTED_VAULT_CHECK_RESPONSE_DIGEST_DOMAIN),
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
      exactThreeInputTransitionBound: true as const,
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
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      PEG_IN_COMMITTED_VAULT_CHECK_DIGEST_DOMAIN,
    ),
  });
  PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL.set(receipt, Object.freeze({
    target,
    binding: after,
    signedCandidate: prepared.signedCandidate,
    checked,
  }));
  return receipt;
}

async function runObservedAnchorTrackerCheck(
  inputValue: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
  >,
  target: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
  >,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
>> {
  const result = await executeObservedAnchorTrackerCheckKernelV1({
    inputValue,
    target,
    expectedSigner,
    operations: {
      captureContext: value => {
        assertSubstrateFederatedTrackerV1Context(value);
        return value;
      },
      captureObservedHeaderContext: value => {
        assertBridgeValidityTrackerObservedHeaderContextV1(value);
        return value;
      },
      captureTargetBinding: () =>
        assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1(
          target,
        ),
      captureTrackerInputBox:
        assertExactSubstrateFederatedTrackerV1InputBox,
      deriveUnsignedTransactionId,
      prepareCandidate: async input =>
        await prepareLocalWasmRootCheckCandidates({
          mnemonic,
          networkPrefix: input.networkPrefix,
          nodeOrigin: input.nodeOrigin,
          headers: input.headers,
          candidates: [{
            role: input.role,
            eip12Tx: input.eip12Tx,
            expectedTxId: input.expectedTxId,
          }],
        }),
      checkCandidate: async (candidate, nodeOrigin) =>
        await checkSignedTransaction(
          candidate,
          'isolated local observed-anchor tracker check',
          nodeOrigin,
        ),
    },
  });
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    ...result,
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      OBSERVED_ANCHOR_TRACKER_CHECK_DIGEST_DOMAIN,
    ),
  });
  OBSERVED_ANCHOR_TRACKER_CHECK_RECEIPTS.add(receipt);
  return receipt;
}

async function runObservedAnchorTrackerCheckV2(
  inputValue: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
  >,
  target: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
  >,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
>> {
  const result = await executeObservedAnchorTrackerCheckKernelV2({
    inputValue,
    target,
    expectedSigner,
    operations: {
      captureContext: value => {
        assertSubstrateFederatedTrackerV1Context(value);
        return value;
      },
      captureObservedHeaderContext: value => {
        assertBridgeValidityTrackerObservedHeaderContextV1(value);
        return value;
      },
      captureTargetBinding: () =>
        assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(
          target,
        ),
      captureTrackerInputBox:
        assertExactSubstrateFederatedTrackerV1InputBox,
      deriveUnsignedTransactionId,
      prepareCandidate: async input =>
        await prepareLocalWasmRootCheckCandidates({
          mnemonic,
          networkPrefix: input.networkPrefix,
          nodeOrigin: input.nodeOrigin,
          headers: input.headers,
          candidates: [{
            role: input.role,
            eip12Tx: input.eip12Tx,
            expectedTxId: input.expectedTxId,
          }],
        }),
      checkCandidate: async (candidate, nodeOrigin) =>
        await checkSignedTransaction(
          candidate,
          'isolated local observed-anchor frozen tracker check',
          nodeOrigin,
        ),
    },
  });
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
    version: 2 as const,
    status: 'PASS' as const,
    ...result,
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      OBSERVED_ANCHOR_TRACKER_CHECK_V2_DIGEST_DOMAIN,
    ),
  });
  OBSERVED_ANCHOR_TRACKER_CHECK_V2_RECEIPTS.add(receipt);
  return receipt;
}

async function runTrackerReservationFreshnessCheckV1(
  inputValue: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
  >,
  target: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
  >,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
  expectedFrozenCheck: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
>> {
  const targetBinding =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
      target,
    );
  let signedCandidate: LocalWasmExactBytesSignedCheckCandidate | undefined;
  let checkedResult: Readonly<LocalWasmOpaqueCheckResult> | undefined;
  const result =
    await executeObservedAnchorTrackerReservationFreshnessCheckKernelV1({
      inputValue,
      target,
      expectedSigner,
      expectedFrozenCheck,
      operations: {
        captureContext: value => {
          assertSubstrateFederatedTrackerV1Context(value);
          return value;
        },
        captureObservedHeaderContext: value => {
          assertBridgeValidityTrackerObservedHeaderContextV1(value);
          return value;
        },
        captureTargetBinding: () => targetBinding,
        captureTrackerInputBox:
          assertExactSubstrateFederatedTrackerV1InputBox,
        deriveUnsignedTransactionId,
        prepareCandidate: async input =>
          await prepareLocalWasmRootCheckCandidates({
            mnemonic,
            networkPrefix: input.networkPrefix,
            nodeOrigin: input.nodeOrigin,
            headers: input.headers,
            candidates: [{
              role: input.role,
              eip12Tx: input.eip12Tx,
              expectedTxId: input.expectedTxId,
            }],
          }),
        checkCandidate: async (candidate, nodeOrigin) => {
          const checked = await checkSignedTransaction(
            candidate,
            'isolated local tracker reservation freshness check',
            nodeOrigin,
          );
          if (checked !== null) {
            signedCandidate = candidate;
            checkedResult = checked;
          }
          return checked;
        },
      },
    });
  if (signedCandidate === undefined || checkedResult === undefined) {
    throw new Error(
      'isolated tracker reservation freshness check retained no exact submission material',
    );
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    ...result,
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      TRACKER_RESERVATION_FRESHNESS_CHECK_V1_DIGEST_DOMAIN,
    ),
  });
  TRACKER_RESERVATION_FRESHNESS_CHECK_V1_RECEIPTS.add(receipt);
  const completion =
    issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(
      target,
    );
  TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.set(receipt, Object.freeze({
    target,
    binding: targetBinding,
    signedCandidate,
    checked: checkedResult,
    completion,
  }));
  return receipt;
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
  const trackerCompilerBinding = Object.freeze({
    request: sourceAndCompilerInput.trackerRequest,
    receipt: sourceAndCompilerInput.trackerReceipt,
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
    trackerCompilerBinding,
  });
}

/** Genuine V2 compiler closure to local V3 checks; retain material only internally. */
async function runFixedSetupCheckV3(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
  mnemonic: string,
): Promise<Readonly<FixedSetupCheckRunV3>> {
  const captured = captureInputV3(input);
  const sourceAndCompilerInput = captured.sourceAndCompilerInput;
  const sourceClosure =
    deriveSubstrateFederatedIsolatedDevnetSourceCompilerClosureV2(
      sourceAndCompilerInput,
    );
  const sourceAndCompilerClosureDigestHex = sha256CanonicalJson(
    sourceClosure,
    SOURCE_AND_COMPILER_CLOSURE_V3_DIGEST_DOMAIN,
  );
  const genesisBoxIds = Object.freeze({
    tracker: sourceClosure.lineages.tracker.genesisInputBoxIdHex,
    duplicatePrevention:
      sourceClosure.lineages.duplicatePrevention.genesisInputBoxIdHex,
    pooledReserve: sourceClosure.lineages.pooledReserve.genesisInputBoxIdHex,
  });
  const profile = buildTargetProfileV3(
    sourceAndCompilerClosureDigestHex,
    captured.expectedSettlementGenesisHeaderIdHex,
    genesisBoxIds,
    captured.primaryNodeOrigin,
    captured.witnessNodeOrigin,
  );
  const assertCapturedClosure = (): void => {
    const current =
      deriveSubstrateFederatedIsolatedDevnetSourceCompilerClosureV2(
        sourceAndCompilerInput,
      );
    if (sha256CanonicalJson(current, SOURCE_AND_COMPILER_CLOSURE_V3_DIGEST_DOMAIN)
      !== sourceAndCompilerClosureDigestHex) {
      throw new Error('isolated fixed setup-check V3 source/compiler closure drifted');
    }
  };

  const retainedObservation = await observeWithRetry(profile);
  assertCapturedClosure();
  const settlementTarget =
    buildSubstrateFederatedIsolatedDevnetSettlementTargetV3({
      ...sourceAndCompilerInput,
      settlementTargetProfile: profile,
      settlementObservation: retainedObservation,
    });
  if (settlementTarget.sourceAndCompilerClosureDigestHex
    !== sourceAndCompilerClosureDigestHex) {
    throw new Error('isolated fixed setup-check V3 target source closure differs');
  }
  const freshObservation = await observeWithRetry(profile);
  const provisioning =
    await buildSubstrateFederatedIsolatedDevnetLocalProvisioningV3({
      settlementTarget,
      settlementTargetProfile: profile,
      freshSettlementObservation: freshObservation,
    });
  const request =
    await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV3(provisioning);
  assertCapturedClosure();
  const executionReceipt = await runSubstrateFederatedIsolatedDevnetSetupCheckV3(
    request,
    mnemonic,
  );
  const receipt = validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV3(
    structuredClone(executionReceipt),
    request,
  );
  return Object.freeze({ receipt, executionReceipt, request, sourceAndCompilerInput });
}

function attachSubstrateFederatedSettlementFamilyCompilerBindingV2(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  familyCompilerBinding:
    Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>,
  trackerCompilerBinding:
    Readonly<SubstrateFederatedTrackerCompilerBindingV1>,
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
    trackerCompilerBinding,
  });
  EXECUTION_BATCHES.set(result, Object.freeze({
    target,
    binding: targetBinding,
  }));
  FAMILY_EXECUTION_BATCHES.set(result, Object.freeze({
    target,
    familyCompilerBinding,
    trackerCompilerBinding,
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

function buildTargetProfileV3(
  sourceAndCompilerClosureDigestHex: string,
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
    sourceAndCompilerClosureDigestHex,
    expectedGenesisHeaderIdHex,
    genesisBoxIds,
    primaryNodeOrigin,
    witnessNodeOrigin,
  }, PROFILE_V3_ID_DOMAIN);
  const identity = (role: string, nodeOrigin: string): string =>
    sha256CanonicalJson({ role, nodeOrigin, profileIdHex },
      DECLARED_IDENTITY_V3_DOMAIN);
  return buildSubstrateFederatedGenesisTargetProfileV1({
    profileIdHex,
    environment: 'patched-devnet',
    expectedNetwork: 'devnet',
    expectedGenesisHeaderIdHex,
    primaryNodeOrigin,
    primaryNodeIdentityDigestHex: identity(
      'primary-node-process', primaryNodeOrigin,
    ),
    primaryAdministrationIdentityDigestHex: identity(
      'primary-synthetic-custody', primaryNodeOrigin,
    ),
    witnessNodeOrigin,
    witnessNodeIdentityDigestHex: identity(
      'witness-node-process', witnessNodeOrigin,
    ),
    witnessAdministrationIdentityDigestHex: identity(
      'witness-observation-role', witnessNodeOrigin,
    ),
    trackerGenesisBoxIdHex: genesisBoxIds.tracker,
    duplicatePreventionGenesisBoxIdHex: genesisBoxIds.duplicatePrevention,
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

function captureInputV3(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input>,
): Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV3Input> {
  assertExactDataRecordV3(input, [
    'expectedSettlementGenesisHeaderIdHex',
    'primaryNodeOrigin',
    'sourceAndCompilerInput',
    'witnessNodeOrigin',
  ], 'isolated fixed setup-check V3 input');
  const source = input.sourceAndCompilerInput;
  assertExactDataRecordV3(source, [
    'familyReceipt', 'familyTemplates', 'historyBundle',
    'trackerReceipt', 'trackerRequest', 'trustPins',
  ], 'isolated fixed setup-check V3 source/compiler input');
  for (const key of [
    'trackerRequest', 'trackerReceipt', 'familyReceipt', 'familyTemplates', 'trustPins',
  ] as const) {
    assertPlainData(source[key], `isolated fixed setup-check V3 ${key}`);
  }
  const historyBundle = source.historyBundle;
  assertExactDataRecordV3(historyBundle, [
    'acceptanceReport', 'applicationHistory', 'historyReceipt',
    'reportedFinalizedBlocks', 'runtimeHistory',
  ], 'isolated fixed setup-check V3 history bundle');
  for (const artifact of Object.values(historyBundle)) {
    if (!(artifact instanceof Uint8Array)
      || (Object.getPrototypeOf(artifact) !== Uint8Array.prototype
        && Object.getPrototypeOf(artifact) !== Buffer.prototype)) {
      throw new Error('isolated fixed setup-check V3 history requires byte arrays');
    }
  }
  // Clone native byte storage without reading caller-defined buffer accessors.
  const capturedHistoryBundle = structuredClone(historyBundle);
  for (const artifact of Object.values(capturedHistoryBundle)) {
    if (!(artifact.buffer instanceof ArrayBuffer)) {
      throw new Error('isolated fixed setup-check V3 history requires unshared byte arrays');
    }
  }
  return Object.freeze({
    sourceAndCompilerInput: Object.freeze({
      // Compiler authority remains on the original process-issued objects.
      trackerRequest: source.trackerRequest,
      trackerReceipt: source.trackerReceipt,
      familyReceipt: source.familyReceipt,
      familyTemplates: structuredClone(source.familyTemplates),
      historyBundle: capturedHistoryBundle,
      trustPins: structuredClone(source.trustPins),
    }),
    expectedSettlementGenesisHeaderIdHex: fixedHex(
      input.expectedSettlementGenesisHeaderIdHex,
      32,
      'isolated fixed setup-check V3 settlement genesis header ID',
    ),
    primaryNodeOrigin: exactOrigin(input.primaryNodeOrigin, PRIMARY_NODE_ORIGIN, 'primary'),
    witnessNodeOrigin: exactOrigin(input.witnessNodeOrigin, WITNESS_NODE_ORIGIN, 'witness'),
  });
}

function assertExactDataRecordV3(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): void {
  if (value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))) {
    throw new Error(`${label} fields are invalid`);
  }
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
  }
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

function capturePegInCommittedVaultCheckInput(
  input:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input> {
  assertPlainData(input, 'isolated peg-in committed-vault check input');
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    'reservePredecessorBoxIdHex',
    'sourceLockBoxIdHex',
    'transitionFeeFundingBoxIdHex',
    'unsignedTransaction',
  ];
  if (keys.join('\0') !== expectedKeys.join('\0')) {
    throw new Error(
      'isolated peg-in committed-vault check input fields are invalid',
    );
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
    throw new Error(
      'isolated peg-in committed-vault transaction shape is invalid',
    );
  }
  return Object.freeze({
    reservePredecessorBoxIdHex: fixedHex(
      input.reservePredecessorBoxIdHex,
      32,
      'isolated peg-in reserve predecessor box ID',
    ),
    sourceLockBoxIdHex: fixedHex(
      input.sourceLockBoxIdHex,
      32,
      'isolated peg-in source-lock box ID',
    ),
    transitionFeeFundingBoxIdHex: fixedHex(
      input.transitionFeeFundingBoxIdHex,
      32,
      'isolated peg-in transition-fee funding box ID',
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
