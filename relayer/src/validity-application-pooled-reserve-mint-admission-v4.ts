import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
} from './peg-in-causal-admission-v2.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveDepositTransitionV4Packet,
  type ValidityApplicationPooledReserveDepositTransitionV4Packet,
} from './validity-application-pooled-reserve-deposit-transition-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN,
} from './validity-application-pooled-reserve-deposit-finality-v4.js';
import {
  assertValidityApplicationPooledReserveDepositErgoObservationV4Candidate,
  assertValidityApplicationPooledReserveDepositPreMintRevalidationV4Candidate,
  observeValidityApplicationPooledReserveDepositOnErgoV4,
  revalidateValidityApplicationPooledReserveDepositBeforeMintV4,
  type ValidityApplicationPooledReserveDepositErgoObservationV4Candidate,
  type ValidityApplicationPooledReserveDepositErgoSourcePairV4,
} from './validity-application-pooled-reserve-deposit-ergo-observation-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-mint-admission.v4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_STATUS =
  'non_authorizing_candidate' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4' as const;

const NATIVE_ERG_ASSET_ID_HEX = `0x${'00'.repeat(32)}`;
const candidates = new WeakSet<object>();

export interface BuildValidityApplicationPooledReserveMintAdmissionV4Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly depositTransition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
  readonly sourcePair:
    Readonly<ValidityApplicationPooledReserveDepositErgoSourcePairV4>;
}

export interface ValidityApplicationPooledReserveMintAdmissionV4Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_SCHEMA;
  readonly version: 4;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_STATUS;
  readonly lineageProfileIdHex: string;
  readonly source: {
    readonly sourceIntentHex: string;
    readonly sourceIntentIdHex: string;
    readonly sourceNetworkIdHex: string;
    readonly sourceLockBoxIdHex: string;
    readonly sourceLockCreationTransactionIdHex: string;
    readonly sourceLockOutputIndex: number;
    readonly reserveTransitionTransactionIdHex: string;
    readonly depositCommitmentHex: string;
    readonly successorReserveBoxIdHex: string;
    readonly successorReserveDigestHex: string;
    readonly successorReserveLiabilityNanoErg: string;
  };
  readonly destination: {
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly recipientAddressHex: string;
    readonly settlementProfileIdHex: string;
  };
  readonly asset: {
    readonly sourceAsset: 'ERG';
    readonly sourceAssetIdHex: typeof NATIVE_ERG_ASSET_ID_HEX;
    readonly amountUnit: 'nanoERG';
    readonly amountNanoErg: string;
  };
  readonly mint: {
    readonly identityDomain:
      typeof VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN;
    readonly mintIdentityHex: string;
    readonly historicalMintAbsenceProved: false;
    readonly authoritativeDuplicateStateAbsenceProved: false;
  };
  readonly observation: {
    readonly adapterId: string;
    readonly sourceIds: readonly [string, string];
    readonly ergoDepositFinalityPolicyIdHex: string;
    readonly inclusionHeight: number;
    readonly inclusionHeaderIdHex: string;
    readonly requiredSuccessorDepth: number;
    readonly targetHeight: number;
    readonly targetHeaderIdHex: string;
    readonly currentCanonicalTipHeight: number;
    readonly currentCanonicalTipHeaderIdHex: string;
    readonly blockTransactionCommitments:
      Readonly<
        ValidityApplicationPooledReserveDepositErgoObservationV4Candidate[
          'transactionCommitments'
        ]
      >;
  };
  readonly checks: {
    readonly sameProcessCandidateProvenanceVerified: true;
    readonly exactCanonicalSourceIntentDecoded: true;
    readonly explicitVersionedProfileBound: true;
    readonly exactSourceLockAndReserveTransitionBound: true;
    readonly exactDepositCommitmentRetainedInObservedDualSourceReserveView:
      true;
    readonly exactAssetAmountAndRecipientBound: true;
    readonly stableMintIdentityBound: true;
    readonly completeObservationAndFreshRevalidationCompleted: true;
    readonly callerSuppliedObservationOrRevalidationAccepted: false;
    readonly localPersistenceConsulted: false;
    readonly localNonAuthorizingMintEligibilityConditionMet: true;
  };
  readonly authority: {
    readonly blockTransactionCommitmentCryptographicallyVerified: true;
    readonly ergoConsensusAuthenticated: false;
    readonly independentNodeControlEstablished: false;
    readonly authoritativeDuplicateStateAbsenceProved: false;
    readonly sidechainPendingAdmissionWritten: false;
    readonly atomicMintAdmissionHandoffEstablished: false;
    readonly proofSystemActivated: false;
    readonly evmMintExecuted: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly mintAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
  readonly limitations: readonly string[];
  readonly candidateDigestHex: string;
}

/**
 * Builds a fresh local admission condition for a future atomic sidechain mint.
 * This constructor deliberately returns no executable mint request or authority.
 */
export async function buildValidityApplicationPooledReserveMintAdmissionV4(
  input: BuildValidityApplicationPooledReserveMintAdmissionV4Input,
): Promise<
  Readonly<ValidityApplicationPooledReserveMintAdmissionV4Candidate>
> {
  assertExactDataObject(input, [
    'compiledInstance',
    'depositTransition',
    'sourcePair',
  ], 'pooled-reserve mint-admission input');
  const compiledInstance = input.compiledInstance;
  const depositTransition = input.depositTransition;
  const sourcePair = input.sourcePair;
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
    compiledInstance,
  );
  assertValidityApplicationPooledReserveDepositTransitionV4Packet(
    depositTransition,
  );

  const sourceIntent = decodePegInSourceIntentV2Hex(
    depositTransition.sourceIntentHex,
  );
  if (
    compiledInstance.lineageProfileIdHex
      !== depositTransition.lineageProfileIdHex
    || compiledInstance.lineageProfileIdHex
      !== sourceIntent.admissionProfileIdHex
  ) {
    throw new Error(
      'pooled-reserve mint admission profile does not match the source intent and transition',
    );
  }
  if (
    compiledInstance.sidechainFinalityPolicy.proofSystemIdHex
      !== VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX
  ) {
    throw new Error(
      'pooled-reserve mint admission proof system is unsupported',
    );
  }
  if (
    sourceIntent.sourceAssetIdHex !== NATIVE_ERG_ASSET_ID_HEX
    || sourceIntent.amountNanoErg !== depositTransition.boxes.sourceLock.value
  ) {
    throw new Error(
      'pooled-reserve mint admission asset or amount differs from the source lock',
    );
  }

  const priorObservation =
    await observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance,
      depositTransition,
      sourcePair,
    });
  assertValidityApplicationPooledReserveDepositErgoObservationV4Candidate(
    priorObservation,
  );
  const revalidation =
    await revalidateValidityApplicationPooledReserveDepositBeforeMintV4({
      compiledInstance,
      depositTransition,
      sourcePair,
      priorObservation,
    });
  assertValidityApplicationPooledReserveDepositPreMintRevalidationV4Candidate(
    revalidation,
  );

  const currentObservation = revalidation.currentObservation;
  const finality = currentObservation.finality;
  if (
    finality.lineageProfileIdHex !== compiledInstance.lineageProfileIdHex
    || finality.mintIdentityHex !== revalidation.mintIdentityHex
    || finality.transitionTxIdHex
      !== depositTransition.transactions.reserveTransition.txId
    || finality.sourceLockBoxIdHex
      !== depositTransition.boxes.sourceLock.boxId
    || finality.depositCommitmentHex
      !== depositTransition.depositCommitmentHex
  ) {
    throw new Error(
      'pooled-reserve mint admission revalidation binding drifted',
    );
  }

  const source = deepFreeze({
    sourceIntentHex: depositTransition.sourceIntentHex,
    sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(sourceIntent),
    sourceNetworkIdHex: sourceIntent.sourceNetworkIdHex,
    sourceLockBoxIdHex: finality.sourceLockBoxIdHex,
    sourceLockCreationTransactionIdHex:
      depositTransition.boxes.sourceLock.transactionId,
    sourceLockOutputIndex: depositTransition.boxes.sourceLock.index,
    reserveTransitionTransactionIdHex: finality.transitionTxIdHex,
    depositCommitmentHex: finality.depositCommitmentHex,
    successorReserveBoxIdHex:
      depositTransition.boxes.reserveSuccessor.boxId,
    successorReserveDigestHex:
      depositTransition.successorReserveDigestHex,
    successorReserveLiabilityNanoErg:
      depositTransition.reserveState.successorLiabilityNanoErg,
  });
  const destination = deepFreeze({
    sidechainIdHex: sourceIntent.sidechainIdHex,
    bridgeAddressHex: sourceIntent.bridgeAddressHex,
    tokenAddressHex: sourceIntent.tokenAddressHex,
    recipientAddressHex: sourceIntent.recipientAddressHex,
    settlementProfileIdHex: sourceIntent.settlementProfileIdHex,
  });
  const asset = deepFreeze({
    sourceAsset: 'ERG' as const,
    sourceAssetIdHex:
      sourceIntent.sourceAssetIdHex as typeof NATIVE_ERG_ASSET_ID_HEX,
    amountUnit: 'nanoERG' as const,
    amountNanoErg: sourceIntent.amountNanoErg.toString(),
  });
  const mint = deepFreeze({
    identityDomain:
      VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN,
    mintIdentityHex: finality.mintIdentityHex,
    historicalMintAbsenceProved: false as const,
    authoritativeDuplicateStateAbsenceProved: false as const,
  });
  const observation = deepFreeze({
    adapterId: currentObservation.adapter.adapterId,
    sourceIds: [...finality.observations.sourceIds] as const,
    ergoDepositFinalityPolicyIdHex:
      finality.ergoDepositFinalityPolicyIdHex,
    inclusionHeight: finality.finality.inclusionHeight,
    inclusionHeaderIdHex: finality.finality.inclusionHeaderIdHex,
    requiredSuccessorDepth: finality.finality.requiredSuccessorDepth,
    targetHeight: finality.finality.targetHeight,
    targetHeaderIdHex: finality.finality.targetHeaderIdHex,
    currentCanonicalTipHeight:
      finality.finality.currentCanonicalTipHeight,
    currentCanonicalTipHeaderIdHex:
      finality.finality.currentCanonicalTipHeaderIdHex,
    blockTransactionCommitments:
      currentObservation.transactionCommitments,
  });
  const checks = deepFreeze({
    sameProcessCandidateProvenanceVerified: true as const,
    exactCanonicalSourceIntentDecoded: true as const,
    explicitVersionedProfileBound: true as const,
    exactSourceLockAndReserveTransitionBound: true as const,
    exactDepositCommitmentRetainedInObservedDualSourceReserveView:
      true as const,
    exactAssetAmountAndRecipientBound: true as const,
    stableMintIdentityBound: true as const,
    completeObservationAndFreshRevalidationCompleted: true as const,
    callerSuppliedObservationOrRevalidationAccepted: false as const,
    localPersistenceConsulted: false as const,
    localNonAuthorizingMintEligibilityConditionMet: true as const,
  });
  const authority = deepFreeze({
    blockTransactionCommitmentCryptographicallyVerified: true as const,
    ergoConsensusAuthenticated: false as const,
    independentNodeControlEstablished: false as const,
    authoritativeDuplicateStateAbsenceProved: false as const,
    sidechainPendingAdmissionWritten: false as const,
    atomicMintAdmissionHandoffEstablished: false as const,
    proofSystemActivated: false as const,
    evmMintExecuted: false as const,
    targetNodeAcceptanceEstablished: false as const,
    mintAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
  const limitations = Object.freeze([
    'the dual-source Ergo view recomputes each canonical header ID and full block transaction commitment, but does not independently authenticate proof of work, canonical consensus, or source control',
    'the fresh local view does not prove historical mint absence or authoritative duplicate-state absence',
    'durable duplicate rejection must be atomic in authenticated sidechain pending or processed state, never a journal or SQLite row',
    'the candidate is a point-in-time same-process result, not an atomic handoff to a sidechain mint consumer',
    'this candidate does not execute an EVM mint, check a target node, sign, submit, broadcast, or authorize funds',
  ]);
  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_SCHEMA,
    version: 4 as const,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_STATUS,
    lineageProfileIdHex: compiledInstance.lineageProfileIdHex,
    source,
    destination,
    asset,
    mint,
    observation,
    checks,
    authority,
    limitations,
  } as const;
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: `0x${sha256CanonicalJson(
      binding,
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_DIGEST_DOMAIN,
    )}`,
  });
  candidates.add(candidate);
  return candidate;
}

export function
assertValidityApplicationPooledReserveMintAdmissionV4Candidate(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveMintAdmissionV4Candidate
> {
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'pooled-reserve mint-admission candidate was not built in this process',
    );
  }
}

function assertExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpected.length
    || actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(
      `${label} must contain exactly ${expectedKeys.join(', ')}`,
    );
  }
  for (const key of actualKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(
        `${label} fields must be own enumerable data properties`,
      );
    }
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}
