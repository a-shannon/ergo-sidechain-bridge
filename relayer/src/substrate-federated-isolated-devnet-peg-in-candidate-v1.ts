import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import type {
  PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
  type SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedPooledReserveDepositV1Packet,
  buildSubstrateFederatedPooledReserveDepositV1,
  type SubstrateFederatedPooledReserveDepositFeesV1,
  type SubstrateFederatedPooledReserveDepositHeightsV1,
  type SubstrateFederatedPooledReserveDepositV1Packet,
} from './substrate-federated-pooled-reserve-deposit-v1.js';
import type {
  Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-candidate.v1' as const;

const CANDIDATE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_V1';

interface CandidateMaterialV1 {
  readonly batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly packet: Readonly<SubstrateFederatedPooledReserveDepositV1Packet>;
}

const CANDIDATES = new WeakMap<object, CandidateMaterialV1>();

export interface BuildSubstrateFederatedIsolatedDevnetPegInCandidateV1Input {
  readonly batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly sourceFundingInput: Eip12Box;
  readonly sourceIntent: PegInSourceIntentV2;
  readonly depositorErgoTreeHex: string;
  readonly creationHeights: SubstrateFederatedPooledReserveDepositHeightsV1;
  readonly fees?: SubstrateFederatedPooledReserveDepositFeesV1;
}

export interface SubstrateFederatedIsolatedDevnetPegInCandidateV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'unsigned_non_authorizing_candidate';
  readonly trustModel: 'federated_non_trustless';
  readonly candidateDigestHex: string;
  readonly target: Readonly<{
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
  }>;
  readonly setup: Readonly<{
    readonly requestDigestHex: string;
    readonly checkReceiptDigestHex: string;
    readonly pooledReserveIssuanceOrdinal: 2;
    readonly pooledReserveTransactionIdHex: string;
    readonly pooledReserveBoxIdHex: string;
  }>;
  readonly family: Readonly<{
    readonly familyIdHex: string;
    readonly compilerBindingDigestHex: string;
    readonly compilerProvenanceKind: 'same-process-pinned-jvm';
    readonly compilerProvenanceDigestHex: string;
  }>;
  readonly depositPacket:
    Readonly<SubstrateFederatedPooledReserveDepositV1Packet>;
  readonly boundaries: Readonly<{
    readonly exactSetupBatchAndTargetBound: true;
    readonly exactFamilyCompilerBindingConsumed: true;
    readonly pooledReservePredecessorDerivedFromSetup: true;
    readonly deterministicUnsignedDepositConstructed: true;
    readonly setupCanonicalConfirmationEstablished: false;
    readonly sourceFundingObservationEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export async function buildSubstrateFederatedIsolatedDevnetPegInCandidateV1(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetPegInCandidateV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>> {
  assertExactKeys(input, [
    'batch',
    'target',
    'sourceFundingInput',
    'sourceIntent',
    'depositorErgoTreeHex',
    'creationHeights',
  ], 'isolated devnet peg-in candidate input', ['fees']);
  const {
    batch,
    target,
    sourceFundingInput,
    sourceIntent,
    depositorErgoTreeHex,
    creationHeights,
    fees,
  } = input;
  const familyBinding =
    assertSubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2(
      batch,
      target,
    );
  const targetBinding = batch.targetBinding;
  const reservePredecessor = pooledReservePredecessor(batch);
  const packet = await buildSubstrateFederatedPooledReserveDepositV1({
    familyBinding,
    sourceFundingInput: structuredClone(sourceFundingInput),
    reserveState: {
      predecessor: reservePredecessor,
      depositHistory: [],
    },
    sourceIntent: structuredClone(sourceIntent),
    depositorErgoTreeHex,
    creationHeights: structuredClone(creationHeights),
    ...(fees === undefined
      ? {}
      : { fees: structuredClone(fees) }),
  });
  assertSubstrateFederatedPooledReserveDepositV1Packet(packet);

  const afterBinding =
    assertSubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2(
      batch,
      target,
    );
  if (
    afterBinding !== familyBinding
    || packet.familyCompiler.bindingDigestHex !== familyBinding.bindingDigestHex
    || packet.familyCompiler.provenanceKind !== 'same-process-pinned-jvm'
    || packet.familyCompiler.provenanceDigestHex
      !== familyBinding.provenance.digestHex
    || packet.boxes.reservePredecessor.boxId !== reservePredecessor.boxId
  ) {
    throw new Error('isolated devnet peg-in producer binding changed');
  }

  const issuance = batch.orderedTransactions[2]!.issuance;
  const body = deepFreeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_V1_SCHEMA,
    version: 1 as const,
    status: 'unsigned_non_authorizing_candidate' as const,
    trustModel: 'federated_non_trustless' as const,
    target: {
      processBindingDigestHex: targetBinding.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        targetBinding.executionTargetIdentityDigestHex,
    },
    setup: {
      requestDigestHex: batch.request.requestDigestHex,
      checkReceiptDigestHex: batch.receipt.receiptDigestHex,
      pooledReserveIssuanceOrdinal: 2 as const,
      pooledReserveTransactionIdHex: issuance.unsignedTransactionIdHex,
      pooledReserveBoxIdHex: issuance.predictedStateOutput.boxIdHex,
    },
    family: {
      familyIdHex: familyBinding.profile.familyIdHex,
      compilerBindingDigestHex: familyBinding.bindingDigestHex,
      compilerProvenanceKind: 'same-process-pinned-jvm' as const,
      compilerProvenanceDigestHex: familyBinding.provenance.digestHex,
    },
    depositPacket: packet,
    boundaries: {
      exactSetupBatchAndTargetBound: true as const,
      exactFamilyCompilerBindingConsumed: true as const,
      pooledReservePredecessorDerivedFromSetup: true as const,
      deterministicUnsignedDepositConstructed: true as const,
      setupCanonicalConfirmationEstablished: false as const,
      sourceFundingObservationEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  const candidate = deepFreeze({
    ...body,
    candidateDigestHex: sha256CanonicalJson(body, CANDIDATE_DIGEST_DOMAIN),
  });
  CANDIDATES.set(candidate, Object.freeze({
    batch,
    target,
    packet,
  }));
  return candidate;
}

export function assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
  candidate:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>,
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedPooledReserveDepositV1Packet> {
  const material = CANDIDATES.get(candidate);
  if (
    material === undefined
    || material.batch !== batch
    || material.target !== target
    || material.packet !== candidate.depositPacket
  ) {
    throw new Error('isolated devnet peg-in candidate lacks process provenance');
  }
  assertSubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2(
    batch,
    target,
  );
  assertSubstrateFederatedPooledReserveDepositV1Packet(material.packet);
  const { candidateDigestHex, ...body } = candidate;
  if (
    !Object.isFrozen(candidate)
    || candidateDigestHex
      !== sha256CanonicalJson(body, CANDIDATE_DIGEST_DOMAIN)
  ) {
    throw new Error('isolated devnet peg-in candidate identity changed');
  }
  return material.packet;
}

function pooledReservePredecessor(
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
): Eip12Box {
  const transaction = batch.orderedTransactions[2];
  const issuance = transaction?.issuance;
  const outputs = issuance?.unsignedTransactionBody['outputs'];
  const stateOutput = Array.isArray(outputs) ? outputs[0] : undefined;
  if (
    transaction === undefined
    || issuance === undefined
    || issuance.ordinal !== 2
    || issuance.role !== 'pooled-reserve'
    || issuance.predictedStateOutput.index !== 0
    || stateOutput === null
    || typeof stateOutput !== 'object'
    || Array.isArray(stateOutput)
  ) {
    throw new Error('isolated devnet pooled-reserve setup output is invalid');
  }
  return {
    ...structuredClone(stateOutput as Omit<
      Eip12Box,
      'boxId' | 'transactionId' | 'index'
    >),
    boxId: issuance.predictedStateOutput.boxIdHex,
    transactionId: issuance.predictedStateOutput.transactionIdHex,
    index: issuance.predictedStateOutput.index,
  };
}

function assertExactKeys(
  value: object,
  requiredKeys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value);
  const allowed = [...requiredKeys, ...optionalKeys];
  if (
    requiredKeys.some(key => !Object.hasOwn(value, key))
    || actual.some(key => !allowed.includes(key))
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
