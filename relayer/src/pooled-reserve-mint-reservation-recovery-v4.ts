import {
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance,
  type AuthenticatedPooledReserveMintReservationStateV4,
} from './native-pooled-reserve-mint-reservation-state-v4-proof-collector.js';
import {
  decodePooledReserveMintReservationPendingExpiryHeightV4,
  normalizePooledReserveMintReservationLifecycleRecordScaleHexV4,
  type PooledReserveMintReservationLifecycleStatusV4,
} from './native-finalized-pooled-reserve-mint-reservation-state-v4.js';
import type {
  PooledReserveMintReservationFinalityContinuityV4,
} from './pooled-reserve-mint-reservation-finality-continuity-v4.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';

export const POOLED_RESERVE_MINT_RESERVATION_RECOVERY_OBSERVATION_V4_SCHEMA =
  'e2s.pooled-reserve-mint-reservation-recovery-observation.v4' as const;
export const POOLED_RESERVE_MINT_RESERVATION_RECOVERY_V4_SCHEMA =
  'e2s.pooled-reserve-mint-reservation-recovery.v4' as const;
export const POOLED_RESERVE_MINT_RESERVATION_RECOVERY_OBSERVATION_V4_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:pooled-reserve-mint-reservation-recovery-observation:v4';

const RECOVERY_REPORTS_V4 = new WeakSet<object>();
const RECOVERY_INPUTS_V4 = new WeakSet<object>();

export type PooledReserveMintReservationRecoveryClassificationV4 =
  | 'absent_non_authorizing_hold'
  | 'pending_hold'
  | 'expired_pending_runtime_retirement_required'
  | 'consumed_terminal_hold'
  | 'invalidated_terminal_hold';

export interface PooledReserveMintReservationRecoveryObservationV4Semantic {
  readonly schema:
    typeof POOLED_RESERVE_MINT_RESERVATION_RECOVERY_OBSERVATION_V4_SCHEMA;
  readonly reservation: {
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
    readonly admissionCandidateDigestHex: string;
    readonly profileIdHex: string;
    readonly lifecycleStatus:
      PooledReserveMintReservationLifecycleStatusV4;
    readonly lifecycleRecordScaleHex: string | null;
    readonly expiresAtHeight: string | null;
  };
  readonly source: {
    readonly requestDigestHex: string;
    readonly trustAnchorDigestHex: string;
    readonly targetNativeBlockHashHex: string;
    readonly targetNativeHeight: string;
    readonly targetStateRootHex: string;
    readonly finalityHorizonHashHex: string;
    readonly finalityHorizonHeight: string;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: string;
  };
  readonly classification:
    PooledReserveMintReservationRecoveryClassificationV4;
}

export interface PooledReserveMintReservationRecoveryObservationV4
  extends PooledReserveMintReservationRecoveryObservationV4Semantic {
  readonly id: number;
  readonly observationDigestHex: string;
  readonly observedAt: string;
  readonly createdAt: string;
}

export interface PersistPooledReserveMintReservationRecoveryObservationV4Input {
  readonly semantic:
    Readonly<PooledReserveMintReservationRecoveryObservationV4Semantic>;
  readonly observedAt: string;
  readonly finalityContinuity?:
    Readonly<PooledReserveMintReservationFinalityContinuityV4> | null;
}

export interface PersistPooledReserveMintReservationRecoveryObservationV4Result {
  readonly appended: boolean;
  readonly observation:
    Readonly<PooledReserveMintReservationRecoveryObservationV4>;
  readonly hold: Readonly<PooledReserveMintReservationRecoveryObservationV4>;
  readonly pegInLifecycleRowsCreatedOrChanged: 0;
  readonly settlementAuthorityRowsCreatedOrChanged: 0;
}

export interface PooledReserveMintReservationRecoveryPersistenceV4 {
  persistPooledReserveMintReservationRecoveryObservationV4(
    input: PersistPooledReserveMintReservationRecoveryObservationV4Input,
  ): PersistPooledReserveMintReservationRecoveryObservationV4Result;
}

export interface RecoverPooledReserveMintReservationV4Input {
  readonly collectFresh:
    () => Promise<AuthenticatedPooledReserveMintReservationStateV4>;
  readonly assertCollateralRemainsCommitted:
    (
      result: AuthenticatedPooledReserveMintReservationStateV4,
    ) => Promise<void>;
  readonly assertReserveLineageRemainsCurrent:
    (
      result: AuthenticatedPooledReserveMintReservationStateV4,
    ) => Promise<void>;
  readonly persistence: PooledReserveMintReservationRecoveryPersistenceV4;
  readonly finalityContinuity?:
    Readonly<PooledReserveMintReservationFinalityContinuityV4> | null;
  readonly now?: () => Date;
}

export interface PooledReserveMintReservationRecoveryV4Report {
  readonly schema: typeof POOLED_RESERVE_MINT_RESERVATION_RECOVERY_V4_SCHEMA;
  readonly observation:
    Readonly<PooledReserveMintReservationRecoveryObservationV4>;
  readonly hold: Readonly<PooledReserveMintReservationRecoveryObservationV4>;
  readonly appended: boolean;
  readonly checks: {
    readonly freshAuthenticatedStateCollected: true;
    readonly collateralContinuityCheckedBeforePersistence: true;
    readonly reserveLineageCheckedBeforePersistence: true;
  };
  readonly boundary: {
    readonly localObservationAuthoritative: false;
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

export async function recoverPooledReserveMintReservationV4(
  input: RecoverPooledReserveMintReservationV4Input,
): Promise<PooledReserveMintReservationRecoveryV4Report> {
  const collected = await input.collectFresh();
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance(collected);
  if (RECOVERY_INPUTS_V4.has(collected)) {
    throw new Error(
      'pooled-reserve mint-reservation recovery requires a fresh authenticated result',
    );
  }
  RECOVERY_INPUTS_V4.add(collected);
  await input.assertCollateralRemainsCommitted(collected);
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance(collected);
  await input.assertReserveLineageRemainsCurrent(collected);
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance(collected);

  const semantic =
    derivePooledReserveMintReservationRecoveryObservationV4(collected);
  const observedAt = (input.now?.() ?? new Date()).toISOString();
  const persisted =
    input.persistence.persistPooledReserveMintReservationRecoveryObservationV4({
      semantic,
      observedAt,
      finalityContinuity: input.finalityContinuity ?? null,
    });
  assertPersistenceResultV4(semantic, persisted);
  const report = deepFreeze<PooledReserveMintReservationRecoveryV4Report>({
    schema: POOLED_RESERVE_MINT_RESERVATION_RECOVERY_V4_SCHEMA,
    observation: persisted.observation,
    hold: persisted.hold,
    appended: persisted.appended,
    checks: {
      freshAuthenticatedStateCollected: true,
      collateralContinuityCheckedBeforePersistence: true,
      reserveLineageCheckedBeforePersistence: true,
    },
    boundary: {
      localObservationAuthoritative: false,
      reservationAuthorized: false,
      mintAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessVerified: false,
    },
  });
  RECOVERY_REPORTS_V4.add(report);
  return report;
}

export function assertPooledReserveMintReservationRecoveryV4ReportProvenance(
  report: unknown,
): asserts report is PooledReserveMintReservationRecoveryV4Report {
  if (
    typeof report !== 'object'
    || report === null
    || !RECOVERY_REPORTS_V4.has(report)
  ) {
    throw new Error(
      'pooled-reserve mint-reservation recovery V4 report provenance is missing',
    );
  }
}

export function derivePooledReserveMintReservationRecoveryObservationV4(
  collected: AuthenticatedPooledReserveMintReservationStateV4,
): Readonly<PooledReserveMintReservationRecoveryObservationV4Semantic> {
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance(collected);
  const reservationState = collected.verification.reservationState;
  const expiresAtHeight = reservationState.status === 'pending'
    ? decodePooledReserveMintReservationPendingExpiryHeightV4(
        reservationState.lifecycleRecordScaleHex,
      )
    : null;
  const classification =
    classifyPooledReserveMintReservationRecoveryStateV4({
      status: reservationState.status,
      targetNativeHeight: collected.verification.target.nativeHeight,
      lifecycleRecordScaleHex: reservationState.lifecycleRecordScaleHex,
      expiresAtHeight,
    });
  return deepFreeze({
    schema:
      POOLED_RESERVE_MINT_RESERVATION_RECOVERY_OBSERVATION_V4_SCHEMA,
    reservation: {
      statementIdHex: reservationState.statementIdHex,
      reservationKeyHex: reservationState.reservationKeyHex,
      admissionCandidateDigestHex:
        collected.collection.source.admissionCandidateDigestHex,
      profileIdHex: reservationState.profileIdHex,
      lifecycleStatus: reservationState.status,
      lifecycleRecordScaleHex: reservationState.lifecycleRecordScaleHex,
      expiresAtHeight,
    },
    source: {
      requestDigestHex: collected.verification.requestDigestHex,
      trustAnchorDigestHex: collected.verification.trustAnchorDigestHex,
      targetNativeBlockHashHex:
        collected.verification.target.nativeBlockHashHex,
      targetNativeHeight: collected.verification.target.nativeHeight,
      targetStateRootHex: collected.verification.target.stateRootHex,
      finalityHorizonHashHex:
        collected.verification.finality.horizonHashHex,
      finalityHorizonHeight:
        collected.verification.finality.horizonHeight,
      bridgeRuntimeCodeSha256Hex:
        reservationState.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: reservationState.bridgeRuntimeCodeBytes,
    },
    classification,
  });
}

export function classifyPooledReserveMintReservationRecoveryStateV4(input: {
  readonly status: PooledReserveMintReservationLifecycleStatusV4;
  readonly targetNativeHeight: string;
  readonly lifecycleRecordScaleHex: string | null;
  readonly expiresAtHeight: string | null;
}): PooledReserveMintReservationRecoveryClassificationV4 {
  const targetHeight = canonicalUint64(
    input.targetNativeHeight,
    'target native height',
  );
  if (input.status === 'absent') {
    normalizePooledReserveMintReservationLifecycleRecordScaleHexV4(
      input.status,
      input.lifecycleRecordScaleHex,
    );
    if (input.expiresAtHeight !== null) {
      throw new Error('absent reservation cannot carry an expiry height');
    }
    return 'absent_non_authorizing_hold';
  }
  if (input.status === 'pending') {
    normalizePooledReserveMintReservationLifecycleRecordScaleHexV4(
      input.status,
      input.lifecycleRecordScaleHex,
    );
    const parsedExpiry =
      decodePooledReserveMintReservationPendingExpiryHeightV4(
        input.lifecycleRecordScaleHex,
      );
    const suppliedExpiry = canonicalUint64(
      input.expiresAtHeight,
      'pending reservation expiry height',
    );
    if (parsedExpiry !== suppliedExpiry.toString()) {
      throw new Error('pending reservation expiry does not match its lifecycle record');
    }
    return targetHeight >= suppliedExpiry
      ? 'expired_pending_runtime_retirement_required'
      : 'pending_hold';
  }
  if (input.expiresAtHeight !== null) {
    throw new Error('terminal reservation cannot carry a pending expiry height');
  }
  normalizePooledReserveMintReservationLifecycleRecordScaleHexV4(
    input.status,
    input.lifecycleRecordScaleHex,
  );
  return input.status === 'consumed'
    ? 'consumed_terminal_hold'
    : 'invalidated_terminal_hold';
}

export function pooledReserveMintReservationRecoveryObservationDigestHexV4(
  semantic: PooledReserveMintReservationRecoveryObservationV4Semantic,
): string {
  return sha256CanonicalJson(
    semantic,
    POOLED_RESERVE_MINT_RESERVATION_RECOVERY_OBSERVATION_V4_DIGEST_DOMAIN,
  );
}

function assertPersistenceResultV4(
  expected:
    Readonly<PooledReserveMintReservationRecoveryObservationV4Semantic>,
  persisted:
    PersistPooledReserveMintReservationRecoveryObservationV4Result,
): void {
  if (
    persisted.pegInLifecycleRowsCreatedOrChanged !== 0
    || persisted.settlementAuthorityRowsCreatedOrChanged !== 0
  ) {
    throw new Error(
      'pooled-reserve mint-reservation recovery persistence changed funds authority',
    );
  }
  const observationSemantic = observationSemanticV4(persisted.observation);
  if (
    canonicalJson(observationSemantic) !== canonicalJson(expected)
    || persisted.observation.observationDigestHex
      !== pooledReserveMintReservationRecoveryObservationDigestHexV4(expected)
  ) {
    throw new Error(
      'pooled-reserve mint-reservation persistence returned another observation',
    );
  }
  if (
    persisted.hold.reservation.reservationKeyHex
      !== expected.reservation.reservationKeyHex
    || persisted.hold.id !== persisted.observation.id
    || persisted.hold.observationDigestHex
      !== persisted.observation.observationDigestHex
  ) {
    throw new Error(
      'pooled-reserve mint-reservation persistence returned an invalid hold',
    );
  }
}

function observationSemanticV4(
  observation:
    Readonly<PooledReserveMintReservationRecoveryObservationV4>,
): PooledReserveMintReservationRecoveryObservationV4Semantic {
  return {
    schema: observation.schema,
    reservation: { ...observation.reservation },
    source: { ...observation.source },
    classification: observation.classification,
  };
}

function canonicalUint64(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical uint64 string`);
  }
  const normalized = BigInt(value);
  if (normalized > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds uint64`);
  }
  return normalized;
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
