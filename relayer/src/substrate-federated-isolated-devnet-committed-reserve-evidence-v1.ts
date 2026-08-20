import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type {
  FederatedPooledReserveSourceProofEvidenceV1,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  type SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInCandidateV1,
} from './substrate-federated-isolated-devnet-peg-in-candidate-v1.js';
import type {
  SubstrateFederatedPooledReserveDepositV1Packet,
} from './substrate-federated-pooled-reserve-deposit-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-committed-reserve-evidence.v1' as const;

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1';
const EVIDENCE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_BYTES_V1';

interface ReceiptMaterialV1 {
  readonly draft:
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>;
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
  readonly candidate:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
  readonly observation:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>;
  readonly packet: Readonly<SubstrateFederatedPooledReserveDepositV1Packet>;
}

const RECEIPTS = new WeakMap<object, Readonly<ReceiptMaterialV1>>();
const CONSUMED_RECEIPTS = new WeakSet<object>();

export interface SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'canonical_committed_reserve_evidence_collected';
  readonly mintReservationDraftDigestHex: string;
  readonly mintReservationStatementIdHex: string;
  readonly mintIdentityHex: string;
  readonly candidateDigestHex: string;
  readonly committedVaultObservationDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly collectorExecutableSha256Hex: string;
  readonly collectorModuleSha256Hex: string;
  readonly evidence:
    Readonly<FederatedPooledReserveSourceProofEvidenceV1>;
  readonly evidenceDigestHex: string;
  readonly checks: Readonly<{
    readonly exactSameProcessDraftObservationAndCandidateBound: true;
    readonly exactSourceLockAndReserveTransitionBound: true;
    readonly exactStatementAndReserveLineageBound: true;
    readonly exactInclusionAndCheckpointAncestryBound: true;
    readonly collectorExecutableRevalidated: true;
    readonly callerSuppliedEvidenceAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly sourceEvidenceCollectionProvenanceEstablished: true;
    readonly dualLoopbackObservationOnly: true;
    readonly atomicCollectorSnapshotEstablished: false;
    readonly exclusiveNonAdversarialSameUserExecutionRequired: true;
    readonly sourceCanonicalityIndependentlyVerified: false;
    readonly ergoPowAuthenticated: false;
    readonly independentAttestorCustodyEstablished: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly limitations: readonly string[];
  readonly receiptDigestHex: string;
}

export function collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1(
  input: Readonly<{
    readonly draft:
      Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>;
    readonly target:
      Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    readonly batch:
      Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
    readonly candidate:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
    readonly committedVaultObservation:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1> {
  assertExactKeys(input, [
    'batch',
    'candidate',
    'committedVaultObservation',
    'draft',
    'target',
  ], 'isolated committed-reserve evidence input');
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(
    input.draft,
  );
  const packet =
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1(
      input.committedVaultObservation,
      input.batch,
      input.candidate,
      input.target,
    );
  assertExactLineage(input.draft, input.candidate, input.committedVaultObservation, packet);

  const collectorIdentity = currentCollectorIdentity();
  const evidence = deepFreeze({
    sourceLockBoxCanonicalHex: canonicalObjectHex({
      schema: 'e2s.federated-source-lock-box-evidence.v1',
      box: packet.boxes.sourceLock,
    }),
    reserveTransitionTransactionCanonicalHex: canonicalObjectHex({
      schema: 'e2s.federated-reserve-transition-transaction-evidence.v1',
      txIdHex: fixedHex(packet.transactions.reserveTransition.txId, 32, 'reserve-transition transaction ID'),
      transaction: packet.transactions.reserveTransition.eip12Tx,
      outputs: packet.transactions.reserveTransition.outputs,
    }),
    successorReserveBoxCanonicalHex: canonicalObjectHex({
      schema: 'e2s.federated-successor-reserve-box-evidence.v1',
      box: packet.boxes.reserveSuccessor,
      reserveDigestHex: packet.reserve.outputDigestHex,
      reserveLiabilityNanoErg: packet.reserve.outputLiabilityNanoErg,
      depositCommitmentHex: packet.depositCommitmentHex,
    }),
    inclusionProofCanonicalHex: canonicalObjectHex({
      schema: 'e2s.federated-reserve-transition-inclusion-observation.v1',
      kind: 'dual_rpc_canonical_confirmation_observation',
      transactionIdHex: fixedHex(input.committedVaultObservation.expectedTxId, 32, 'observed transaction ID'),
      confirmationHeight: input.committedVaultObservation.confirmationHeight,
      confirmationHeaderIdHex: fixedHex(input.committedVaultObservation.confirmationHeaderIdHex, 32, 'confirmation header ID'),
      confirmationObservationDigestHex: fixedHex(input.committedVaultObservation.confirmationObservationDigestHex, 32, 'confirmation observation digest'),
    }),
    checkpointAncestryCanonicalHex: canonicalObjectHex({
      schema: 'e2s.federated-reserve-transition-checkpoint-ancestry.v1',
      inclusionHeight: input.committedVaultObservation.confirmationHeight,
      inclusionHeaderIdHex: fixedHex(input.committedVaultObservation.confirmationHeaderIdHex, 32, 'inclusion header ID'),
      targetHeight: input.committedVaultObservation.finalityTargetHeight,
      targetHeaderIdHex: fixedHex(input.committedVaultObservation.finalityTargetHeaderIdHex, 32, 'target header ID'),
      requiredSuccessorDepth: input.committedVaultObservation.requiredSuccessorDepth,
      pathHeaderIdsHex: input.committedVaultObservation.finalityPathHeaderIdsHex.map(
        (value, index) => fixedHex(value, 32, `ancestry header ${index}`),
      ),
    }),
    finalityProofCanonicalHex: canonicalObjectHex({
      schema: 'e2s.federated-reserve-transition-finality-disclosure.v1',
      kind: 'federated_dual_rpc_depth_policy',
      trustModel: 'federated_non_trustless',
      ergoDepositFinalityPolicyIdHex: input.draft.statement.ergoDepositFinalityPolicyIdHex,
      observedTipHeight: input.committedVaultObservation.observedTipHeight,
      observedTipHeaderIdHex: fixedHex(input.committedVaultObservation.observedTipHeaderIdHex, 32, 'observed tip header ID'),
      processBindingDigestHex: fixedHex(input.committedVaultObservation.processBindingDigestHex, 32, 'process binding digest'),
      executionTargetIdentityDigestHex: fixedHex(input.committedVaultObservation.executionTargetIdentityDigestHex, 32, 'execution target identity digest'),
      primaryObservationDigestHex: fixedHex(input.committedVaultObservation.primaryObservationDigestHex, 32, 'primary observation digest'),
      witnessObservationDigestHex: fixedHex(input.committedVaultObservation.witnessObservationDigestHex, 32, 'witness observation digest'),
      collectorModuleSha256Hex: collectorIdentity.moduleSha256Hex,
      exactDualLoopbackNodesAgreed: true,
      ergoPowAuthenticated: false,
    }),
    verifierExecutableSha256Hex: collectorIdentity.executableSha256Hex,
  } satisfies FederatedPooledReserveSourceProofEvidenceV1);
  if (canonicalJson(currentCollectorIdentity()) !== canonicalJson(collectorIdentity)) {
    throw new Error('isolated committed-reserve evidence collector identity changed');
  }
  const evidenceDigestHex = sha256CanonicalJson(evidence, EVIDENCE_DIGEST_DOMAIN);
  const body = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1_SCHEMA,
    version: 1 as const,
    status: 'canonical_committed_reserve_evidence_collected' as const,
    mintReservationDraftDigestHex: input.draft.draftDigestHex,
    mintReservationStatementIdHex: input.draft.statementIdHex,
    mintIdentityHex: input.draft.reservationKeyHex,
    candidateDigestHex: input.candidate.candidateDigestHex,
    committedVaultObservationDigestHex:
      input.committedVaultObservation.observationDigestHex,
    processBindingDigestHex:
      input.committedVaultObservation.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      input.committedVaultObservation.executionTargetIdentityDigestHex,
    collectorExecutableSha256Hex: collectorIdentity.executableSha256Hex,
    collectorModuleSha256Hex: collectorIdentity.moduleSha256Hex,
    evidence,
    evidenceDigestHex,
    checks: {
      exactSameProcessDraftObservationAndCandidateBound: true as const,
      exactSourceLockAndReserveTransitionBound: true as const,
      exactStatementAndReserveLineageBound: true as const,
      exactInclusionAndCheckpointAncestryBound: true as const,
      collectorExecutableRevalidated: true as const,
      callerSuppliedEvidenceAccepted: false as const,
    },
    boundaries: {
      sourceEvidenceCollectionProvenanceEstablished: true as const,
      dualLoopbackObservationOnly: true as const,
      atomicCollectorSnapshotEstablished: false as const,
      exclusiveNonAdversarialSameUserExecutionRequired: true as const,
      sourceCanonicalityIndependentlyVerified: false as const,
      ergoPowAuthenticated: false as const,
      independentAttestorCustodyEstablished: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
    limitations: [
      'The collector binds one same-process LAB observation; it does not authenticate Ergo proof of work.',
      'Executable and module pre/post hashes are not an atomic snapshot and assume exclusive non-adversarial same-user execution.',
      'The disclosed finality object is a federated dual-RPC depth policy, not a trustless consensus proof.',
      'No mint, funds authority, Gate 5 closure, trustless status, or production readiness is established.',
    ] as const,
  });
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  RECEIPTS.set(receipt, Object.freeze({
    draft: input.draft,
    target: input.target,
    batch: input.batch,
    candidate: input.candidate,
    observation: input.committedVaultObservation,
    packet,
  }));
  return receipt;
}

export function consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(
  receipt: Readonly<SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1>,
  draft: Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>,
): Readonly<FederatedPooledReserveSourceProofEvidenceV1> {
  assertSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1Provenance(
    receipt,
  );
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(draft);
  const material = RECEIPTS.get(receipt);
  if (
    material === undefined
    || material.draft !== draft
    || receipt.mintReservationDraftDigestHex !== draft.draftDigestHex
    || receipt.mintReservationStatementIdHex !== draft.statementIdHex
    || receipt.mintIdentityHex !== draft.reservationKeyHex
  ) {
    throw new Error(
      'isolated committed-reserve evidence targets a different mint-reservation draft',
    );
  }
  if (CONSUMED_RECEIPTS.has(receipt)) {
    throw new Error('isolated committed-reserve evidence receipt is already consumed');
  }
  CONSUMED_RECEIPTS.add(receipt);
  return receipt.evidence;
}

export function assertSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1> {
  if (value === null || typeof value !== 'object' || !RECEIPTS.has(value)) {
    throw new Error('isolated committed-reserve evidence receipt lacks process provenance');
  }
  const receipt = value as Readonly<SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1>;
  const material = RECEIPTS.get(receipt)!;
  const packet =
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1(
      material.observation,
      material.batch,
      material.candidate,
      material.target,
    );
  const { receiptDigestHex, ...body } = receipt;
  const collectorIdentity = currentCollectorIdentity();
  if (
    packet !== material.packet
    || receiptDigestHex !== sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN)
    || receipt.evidenceDigestHex
      !== sha256CanonicalJson(receipt.evidence, EVIDENCE_DIGEST_DOMAIN)
    || receipt.collectorExecutableSha256Hex
      !== collectorIdentity.executableSha256Hex
    || receipt.collectorModuleSha256Hex
      !== collectorIdentity.moduleSha256Hex
    || receipt.evidence.verifierExecutableSha256Hex
      !== receipt.collectorExecutableSha256Hex
  ) {
    throw new Error('isolated committed-reserve evidence receipt changed');
  }
}

function assertExactLineage(
  draft: Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>,
  candidate: Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>,
  observation: Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>,
  packet: Readonly<SubstrateFederatedPooledReserveDepositV1Packet>,
): void {
  const transition = packet.transactions.reserveTransition;
  const path = observation.finalityPathHeaderIdsHex;
  if (
    draft.provenance.candidateDigestHex !== candidate.candidateDigestHex
    || draft.provenance.committedVaultObservationDigestHex
      !== observation.observationDigestHex
    || draft.provenance.familyCompilerBindingDigestHex
      !== packet.familyCompiler.bindingDigestHex
    || !sameHex(draft.statement.lineageProfileIdHex, packet.familyIdHex, 32)
    || !sameHex(draft.statement.sourceLockBoxIdHex, packet.boxes.sourceLock.boxId, 32)
    || !sameHex(draft.statement.reserveTransitionTransactionIdHex, transition.txId, 32)
    || !sameHex(observation.expectedTxId, transition.txId, 32)
    || !sameHex(draft.statement.successorReserveBoxIdHex, packet.boxes.reserveSuccessor.boxId, 32)
    || !sameHex(observation.reserveSuccessorBoxIdHex, packet.boxes.reserveSuccessor.boxId, 32)
    || draft.statement.successorReserveDigestHex !== packet.reserve.outputDigestHex
    || draft.statement.successorReserveLiabilityNanoErg
      !== packet.reserve.outputLiabilityNanoErg
    || !sameHex(draft.statement.depositCommitmentHex, packet.depositCommitmentHex, 32)
    || !sameHex(draft.statement.inclusionHeaderIdHex, observation.confirmationHeaderIdHex, 32)
    || draft.statement.inclusionHeight !== observation.confirmationHeight
    || !sameHex(draft.statement.targetHeaderIdHex, observation.finalityTargetHeaderIdHex, 32)
    || draft.statement.targetHeight !== observation.finalityTargetHeight
    || draft.statement.requiredSuccessorDepth !== observation.requiredSuccessorDepth
  ) {
    throw new Error('isolated committed-reserve evidence lineage differs from the mint statement');
  }
  if (
    transition.eip12Tx.inputs.length !== 3
    || !sameHex(transition.eip12Tx.inputs[0]?.boxId, packet.boxes.reservePredecessor.boxId, 32)
    || !sameHex(transition.eip12Tx.inputs[1]?.boxId, packet.boxes.sourceLock.boxId, 32)
    || !sameHex(transition.eip12Tx.inputs[2]?.boxId, packet.boxes.transitionFeeFunding.boxId, 32)
    || transition.outputs.length < 1
    || !sameHex(transition.outputs[0]?.boxId, packet.boxes.reserveSuccessor.boxId, 32)
  ) {
    throw new Error('isolated committed-reserve evidence retained transition inputs are incomplete');
  }
  if (
    observation.finalityTargetHeight
      !== observation.confirmationHeight + observation.requiredSuccessorDepth
    || path.length !== observation.requiredSuccessorDepth + 1
    || !sameHex(path[0], observation.confirmationHeaderIdHex, 32)
    || !sameHex(path.at(-1), observation.finalityTargetHeaderIdHex, 32)
    || observation.observedTipHeight < observation.finalityTargetHeight
  ) {
    throw new Error('isolated committed-reserve evidence checkpoint ancestry is stale or incomplete');
  }
}

function canonicalObjectHex(value: unknown): string {
  return `0x${Buffer.from(canonicalJson(value), 'utf8').toString('hex')}`;
}

function currentCollectorIdentity(): Readonly<{
  readonly executableSha256Hex: string;
  readonly moduleSha256Hex: string;
}> {
  return Object.freeze({
    executableSha256Hex: sha256File(process.execPath),
    moduleSha256Hex: sha256File(fileURLToPath(import.meta.url)),
  });
}

function sha256File(path: string): string {
  return `0x${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function sameHex(
  left: unknown,
  right: unknown,
  bytes: number,
): boolean {
  try {
    return fixedHex(left, bytes, 'left binding')
      === fixedHex(right, bytes, 'right binding');
  } catch {
    return false;
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} canonical bytes`);
  }
  const normalized = value.toLowerCase().replace(/^0x/u, '');
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(normalized)) {
    throw new Error(`${label} must be ${bytes} canonical bytes`);
  }
  return `0x${normalized}`;
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): void {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const fields = [...expected].sort();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    actual.length !== fields.length
    || actual.some((field, index) => field !== fields[index])
    || Object.values(descriptors).some(
      descriptor => !descriptor.enumerable || !('value' in descriptor),
    )
  ) {
    throw new Error(`${label} must contain exactly: ${fields.join(', ')}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
