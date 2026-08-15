import {
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance,
  collectAuthenticatedPooledReserveMintReservationStateV4,
  type CollectAuthenticatedPooledReserveMintReservationStateV4Input,
} from './native-pooled-reserve-mint-reservation-state-v4-proof-collector.js';
import {
  buildPooledReserveMintReservationFinalityContinuityV4,
  type PooledReserveMintReservationFinalityContinuityV4,
} from './pooled-reserve-mint-reservation-finality-continuity-v4.js';
import {
  assertPooledReserveMintReservationRecoveryV4ReportProvenance,
  recoverPooledReserveMintReservationV4,
  type PooledReserveMintReservationRecoveryObservationV4,
  type PooledReserveMintReservationRecoveryPersistenceV4,
  type PooledReserveMintReservationRecoveryV4Report,
} from './pooled-reserve-mint-reservation-recovery-v4.js';
import {
  requestSubstrateFinalizedHeadHash,
} from './substrate-finality-provider.js';
import {
  buildValidityApplicationPooledReserveMintAdmissionV4,
  type BuildValidityApplicationPooledReserveMintAdmissionV4Input,
} from './validity-application-pooled-reserve-mint-admission-v4.js';
import {
  buildValidityApplicationPooledReserveMintReservationV4,
  type ValidityApplicationPooledReserveMintReservationV4Request,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

export const POOLED_RESERVE_MINT_RESERVATION_SOURCE_RECOVERY_V4_SCHEMA =
  'e2s.pooled-reserve-mint-reservation-source-recovery.v4' as const;

const SOURCE_RECOVERY_REPORTS_V4 = new WeakSet<object>();

type ReservationStateCollectionInputV4 = Omit<
  CollectAuthenticatedPooledReserveMintReservationStateV4Input,
  'reservationRequest' | 'targetNativeBlockHashHex'
>;

export interface PooledReserveMintReservationSourceRecoveryPersistenceV4
  extends PooledReserveMintReservationRecoveryPersistenceV4 {
  getPooledReserveMintReservationRecoveryHoldV4(
    reservationKeyHex: string,
  ): Readonly<PooledReserveMintReservationRecoveryObservationV4> | null;
}

export interface RecoverPooledReserveMintReservationFromSourcesV4Input
  extends BuildValidityApplicationPooledReserveMintAdmissionV4Input,
    ReservationStateCollectionInputV4 {
  readonly persistence:
    PooledReserveMintReservationSourceRecoveryPersistenceV4;
  readonly now?: () => Date;
}

export interface PooledReserveMintReservationSourceRecoveryV4Report {
  readonly schema:
    typeof POOLED_RESERVE_MINT_RESERVATION_SOURCE_RECOVERY_V4_SCHEMA;
  readonly reservation: {
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
    readonly statementHex: string;
    readonly initialAdmissionCandidateDigestHex: string;
    readonly revalidatedAdmissionCandidateDigestHex: string;
  };
  readonly collection: {
    readonly targetNativeBlockHashHex: string;
    readonly requestDigestHex: string;
    readonly finalityHorizonHashHex: string;
    readonly finalityHorizonHeight: string;
  };
  readonly recovery:
    Readonly<PooledReserveMintReservationRecoveryV4Report>;
  readonly finalityContinuity:
    Readonly<PooledReserveMintReservationFinalityContinuityV4> | null;
  readonly checks: {
    readonly finalizedTargetSelectedInternally: true;
    readonly initialSourceAdmissionBuiltInternally: true;
    readonly authenticatedReservationStateCollectedInternally: true;
    readonly postCollectionSourceAdmissionRebuiltInternally: true;
    readonly exactReservationStatementRemainedStable: true;
    readonly localHoldConsultedOnlyForFailClosedContinuity: true;
    readonly callerSuppliedChildReportAccepted: false;
  };
  readonly boundary: {
    readonly localObservationAuthoritative: false;
    readonly ergoConsensusAuthenticated: false;
    readonly independentErgoNodeControlEstablished: false;
    readonly reservationAuthorized: false;
    readonly mintAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessVerified: false;
  };
}

/**
 * Reconstructs one V4 reservation hold from current source observations.
 * The composition owns every child candidate and exposes no funds capability.
 */
export async function recoverPooledReserveMintReservationFromSourcesV4(
  input: RecoverPooledReserveMintReservationFromSourcesV4Input,
): Promise<Readonly<PooledReserveMintReservationSourceRecoveryV4Report>> {
  assertSourceRecoveryInputV4(input);
  const sourceInput = Object.freeze({
    compiledInstance: input.compiledInstance,
    depositTransition: input.depositTransition,
    sourcePair: input.sourcePair,
  });
  const initialAdmission =
    await buildValidityApplicationPooledReserveMintAdmissionV4(sourceInput);
  const initialRequest =
    buildValidityApplicationPooledReserveMintReservationV4({
      admissionCandidate: initialAdmission,
    });
  const currentHold =
    input.persistence.getPooledReserveMintReservationRecoveryHoldV4(
      initialRequest.reservationKeyHex,
    );
  const targetNativeBlockHashHex =
    await requestSubstrateFinalizedHeadHash(input.rpc);
  const collected =
    await collectAuthenticatedPooledReserveMintReservationStateV4({
      rpc: input.rpc,
      codec: input.codec,
      trustAnchor: input.trustAnchor,
      targetNativeBlockHashHex,
      reservationRequest: initialRequest,
      expectedRuntimeCodeSha256Hex:
        input.expectedRuntimeCodeSha256Hex,
      expectedRuntimeCodeBytes: input.expectedRuntimeCodeBytes,
      trustedAnchorDigestHex: input.trustedAnchorDigestHex,
      verifier: input.verifier,
      ...(input.deadlineMs === undefined
        ? {}
        : { deadlineMs: input.deadlineMs }),
      ...(input.rpcConcurrency === undefined
        ? {}
        : { rpcConcurrency: input.rpcConcurrency }),
      ...(input.maxAttempts === undefined
        ? {}
        : { maxAttempts: input.maxAttempts }),
    });
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance(
    collected,
  );
  assertCollectedReservationBindingV4(
    initialRequest,
    targetNativeBlockHashHex,
    collected,
  );

  const revalidatedAdmission =
    await buildValidityApplicationPooledReserveMintAdmissionV4(sourceInput);
  const revalidatedRequest =
    buildValidityApplicationPooledReserveMintReservationV4({
      admissionCandidate: revalidatedAdmission,
    });
  assertStableReservationStatementV4(initialRequest, revalidatedRequest);

  const finalityContinuity = buildFinalityContinuityIfRequiredV4(
    currentHold,
    collected,
  );
  const recovery = await recoverPooledReserveMintReservationV4({
    collectFresh: async () => collected,
    assertCollateralRemainsCommitted: async fresh => {
      assertAuthenticatedPooledReserveMintReservationStateV4Provenance(fresh);
      assertCollateralBindingV4(initialRequest, revalidatedRequest);
    },
    assertReserveLineageRemainsCurrent: async fresh => {
      assertAuthenticatedPooledReserveMintReservationStateV4Provenance(fresh);
      assertReserveLineageBindingV4(initialRequest, revalidatedRequest);
    },
    persistence: input.persistence,
    finalityContinuity,
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  assertPooledReserveMintReservationRecoveryV4ReportProvenance(recovery);

  const report = deepFreeze({
    schema: POOLED_RESERVE_MINT_RESERVATION_SOURCE_RECOVERY_V4_SCHEMA,
    reservation: {
      statementIdHex: initialRequest.statementIdHex,
      reservationKeyHex: initialRequest.reservationKeyHex,
      statementHex: initialRequest.statementHex,
      initialAdmissionCandidateDigestHex:
        initialRequest.provenance.admissionCandidateDigestHex,
      revalidatedAdmissionCandidateDigestHex:
        revalidatedRequest.provenance.admissionCandidateDigestHex,
    },
    collection: {
      targetNativeBlockHashHex,
      requestDigestHex: collected.verification.requestDigestHex,
      finalityHorizonHashHex:
        collected.verification.finality.horizonHashHex,
      finalityHorizonHeight:
        collected.verification.finality.horizonHeight,
    },
    recovery,
    finalityContinuity,
    checks: {
      finalizedTargetSelectedInternally: true as const,
      initialSourceAdmissionBuiltInternally: true as const,
      authenticatedReservationStateCollectedInternally: true as const,
      postCollectionSourceAdmissionRebuiltInternally: true as const,
      exactReservationStatementRemainedStable: true as const,
      localHoldConsultedOnlyForFailClosedContinuity: true as const,
      callerSuppliedChildReportAccepted: false as const,
    },
    boundary: {
      localObservationAuthoritative: false as const,
      ergoConsensusAuthenticated: false as const,
      independentErgoNodeControlEstablished: false as const,
      reservationAuthorized: false as const,
      mintAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessVerified: false as const,
    },
  });
  SOURCE_RECOVERY_REPORTS_V4.add(report);
  return report;
}

export function assertPooledReserveMintReservationSourceRecoveryV4ReportProvenance(
  value: unknown,
): asserts value is Readonly<
  PooledReserveMintReservationSourceRecoveryV4Report
> {
  if (
    value === null
    || typeof value !== 'object'
    || !SOURCE_RECOVERY_REPORTS_V4.has(value)
  ) {
    throw new Error(
      'pooled-reserve source-owned recovery V4 report provenance is missing',
    );
  }
}

function buildFinalityContinuityIfRequiredV4(
  currentHold:
    Readonly<PooledReserveMintReservationRecoveryObservationV4> | null,
  collected: Parameters<
    typeof buildPooledReserveMintReservationFinalityContinuityV4
  >[0]['collected'],
): Readonly<PooledReserveMintReservationFinalityContinuityV4> | null {
  if (currentHold === null) {
    return null;
  }
  const currentHeight = BigInt(currentHold.source.finalityHorizonHeight);
  const nextHeight = BigInt(
    collected.verification.finality.horizonHeight,
  );
  return nextHeight > currentHeight
    ? buildPooledReserveMintReservationFinalityContinuityV4({
        currentHold,
        collected,
      })
    : null;
}

function assertCollectedReservationBindingV4(
  request:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
  targetNativeBlockHashHex: string,
  collected: Parameters<
    typeof buildPooledReserveMintReservationFinalityContinuityV4
  >[0]['collected'],
): void {
  if (
    collected.collection.request.targetNativeBlockHashHex
      !== targetNativeBlockHashHex
    || collected.verification.target.nativeBlockHashHex
      !== targetNativeBlockHashHex
    || collected.collection.request.statement.statementHex
      !== request.statementHex
    || collected.collection.request.statement.statementIdHex
      !== request.statementIdHex
    || collected.collection.request.statement.reservationKeyHex
      !== request.reservationKeyHex
    || collected.collection.source.reservationStatementIdHex
      !== request.statementIdHex
    || collected.collection.source.reservationKeyHex
      !== request.reservationKeyHex
    || collected.collection.source.admissionCandidateDigestHex
      !== request.provenance.admissionCandidateDigestHex
    || collected.verification.reservationState.statementIdHex
      !== request.statementIdHex
    || collected.verification.reservationState.reservationKeyHex
      !== request.reservationKeyHex
  ) {
    throw new Error(
      'authenticated reservation state does not bind the source-owned request',
    );
  }
}

function assertStableReservationStatementV4(
  initial:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
  revalidated:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
): void {
  if (
    initial.statementHex !== revalidated.statementHex
    || initial.statementIdHex !== revalidated.statementIdHex
    || initial.reservationKeyHex !== revalidated.reservationKeyHex
  ) {
    throw new Error(
      'post-collection source revalidation changed the reservation statement',
    );
  }
}

function assertCollateralBindingV4(
  initial:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
  revalidated:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
): void {
  if (
    initial.statement.sourceIntentHex
      !== revalidated.statement.sourceIntentHex
    || initial.statement.sourceIntentIdHex
      !== revalidated.statement.sourceIntentIdHex
    || initial.statement.mintIdentityHex
      !== revalidated.statement.mintIdentityHex
    || initial.statement.sourceLockBoxIdHex
      !== revalidated.statement.sourceLockBoxIdHex
    || initial.statement.reserveTransitionTransactionIdHex
      !== revalidated.statement.reserveTransitionTransactionIdHex
    || initial.statement.depositCommitmentHex
      !== revalidated.statement.depositCommitmentHex
  ) {
    throw new Error(
      'post-collection collateral binding changed',
    );
  }
}

function assertReserveLineageBindingV4(
  initial:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
  revalidated:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
): void {
  if (
    initial.statement.lineageProfileIdHex
      !== revalidated.statement.lineageProfileIdHex
    || initial.statement.successorReserveBoxIdHex
      !== revalidated.statement.successorReserveBoxIdHex
    || initial.statement.successorReserveDigestHex
      !== revalidated.statement.successorReserveDigestHex
    || String(initial.statement.successorReserveLiabilityNanoErg)
      !== String(revalidated.statement.successorReserveLiabilityNanoErg)
  ) {
    throw new Error(
      'post-collection reserve-lineage binding changed',
    );
  }
}

function assertSourceRecoveryInputV4(
  input: RecoverPooledReserveMintReservationFromSourcesV4Input,
): void {
  const required = [
    'codec',
    'compiledInstance',
    'depositTransition',
    'expectedRuntimeCodeBytes',
    'expectedRuntimeCodeSha256Hex',
    'persistence',
    'rpc',
    'sourcePair',
    'trustAnchor',
    'trustedAnchorDigestHex',
    'verifier',
  ] as const;
  const optional = [
    'deadlineMs',
    'maxAttempts',
    'now',
    'rpcConcurrency',
  ] as const;
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(
      'pooled-reserve source-owned recovery input must be a plain object',
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const allowed = new Set<string>([...required, ...optional]);
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key]!;
    if (
      !allowed.has(key)
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(
        'pooled-reserve source-owned recovery input contains an unsupported child or capability',
      );
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, key)) {
      throw new Error(
        `pooled-reserve source-owned recovery input is missing ${key}`,
      );
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
