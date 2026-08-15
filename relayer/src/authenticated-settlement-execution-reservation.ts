import { createHash } from 'crypto';

import {
  assertAuthenticatedSettlementExecutionAuthorizationProvenance,
  deriveAuthenticatedSettlementCandidateAuthorityDigest,
  type AuthenticatedSettlementExecutionAuthorization,
} from './authenticated-settlement-execution-authorization.js';
import type { StateTracker } from './state-tracker.js';

export {
  deriveAuthenticatedSettlementCandidateAuthorityDigest,
} from './authenticated-settlement-execution-authorization.js';

export const AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA =
  'e2s.authenticated-settlement-execution-reservation.v2';

const AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_ADMISSIONS =
  new WeakSet<object>();

type ReservationCandidateState = Pick<
  StateTracker,
  'getAuthenticatedSettlementCandidate'
>;

export interface AuthenticatedSettlementExecutionReservationAdmission {
  readonly schema: typeof AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA;
  readonly candidateId: string;
  readonly candidateAuthorityDigestHex: string;
  readonly burnId: string;
  readonly burnTxHash: string;
  readonly amountNanoErg: bigint;
  readonly recipientErgoTreeHex: string;
  readonly duplicatePreventionBoxId: string;
  readonly vaultBoxId: string;
  readonly expectedTxId: string;
  readonly unsignedTxDigestHex: string;
  readonly unsignedPackageDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly signerContextDigestHex: string;
  readonly checkerIdentityDigestHex: string;
  readonly revalidationDigestHex: string;
  readonly stableErgoViewDigestHex: string;
  readonly stableSidechainViewDigestHex: string;
  readonly finalityProofDigestHex: string;
  readonly checkAdmissionDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly reservationDigestHex: string;
}

export function authorizeAuthenticatedSettlementExecutionReservation(input: {
  state: ReservationCandidateState;
  authorization: AuthenticatedSettlementExecutionAuthorization;
}): AuthenticatedSettlementExecutionReservationAdmission {
  assertAuthenticatedSettlementExecutionAuthorizationProvenance(input.authorization);
  const candidateId = fixedHex(input.authorization.candidateId, 'candidate ID');
  const candidate = input.state.getAuthenticatedSettlementCandidate(candidateId);
  if (!candidate) {
    throw new Error('authenticated settlement candidate is unavailable at reservation');
  }
  if (candidate.status !== 'check_passed' || candidate.invalidationReason !== null) {
    throw new Error('authenticated settlement candidate is not reservable');
  }

  const binding = {
    schema: AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA,
    candidateId,
    candidateAuthorityDigestHex: exactHex(
      'candidate authority digest',
      deriveAuthenticatedSettlementCandidateAuthorityDigest(candidate),
      input.authorization.candidateAuthorityDigestHex,
    ),
    burnId: exactHex('burn ID', candidate.burnId, input.authorization.burnId),
    burnTxHash: exactHex(
      'burn transaction hash',
      candidate.burnTxHash,
      input.authorization.burnTxHash,
    ),
    amountNanoErg: positiveBigInt(
      input.authorization.amountNanoErg,
      'settlement amount',
    ),
    recipientErgoTreeHex: sizedHex(
      input.authorization.recipientErgoTreeHex,
      36,
      'settlement recipient ErgoTree',
    ),
    duplicatePreventionBoxId: exactHex(
      'DUP input box ID',
      candidate.dupInputBoxId,
      input.authorization.duplicatePreventionBoxId,
    ),
    vaultBoxId: exactHex(
      'settlement vault box ID',
      candidate.vaultBoxId,
      input.authorization.vaultBoxId,
    ),
    expectedTxId: exactHex(
      'expected transaction ID',
      candidate.checkExpectedTxId,
      input.authorization.expectedTxId,
    ),
    unsignedTxDigestHex: exactHex(
      'unsigned transaction digest',
      candidate.unsignedTxDigest,
      input.authorization.unsignedTxDigestHex,
    ),
    unsignedPackageDigestHex: exactHex(
      'unsigned package digest',
      candidate.checkUnsignedPackageDigest,
      input.authorization.unsignedPackageDigestHex,
    ),
    signedTransactionDigestHex: exactHex(
      'signed transaction digest',
      candidate.checkSignedTransactionDigest,
      input.authorization.signedTransactionDigestHex,
    ),
    checkResponseDigestHex: exactHex(
      'JVM check response digest',
      candidate.checkResponseDigest,
      input.authorization.checkResponseDigestHex,
    ),
    signerContextDigestHex: exactHex(
      'signer context digest',
      candidate.checkSignerContextDigest,
      input.authorization.signerContextDigestHex,
    ),
    checkerIdentityDigestHex: exactHex(
      'checker identity digest',
      candidate.checkCheckerIdentityDigest,
      input.authorization.checkerIdentityDigestHex,
    ),
    revalidationDigestHex: exactHex(
      'revalidation digest',
      candidate.checkRevalidationDigest,
      input.authorization.revalidationDigestHex,
    ),
    stableErgoViewDigestHex: exactHex(
      'stable Ergo view digest',
      candidate.checkStableErgoViewDigest,
      input.authorization.stableErgoViewDigestHex,
    ),
    stableSidechainViewDigestHex: exactHex(
      'stable sidechain view digest',
      candidate.checkStableSidechainViewDigest,
      input.authorization.stableSidechainViewDigestHex,
    ),
    finalityProofDigestHex: exactHex(
      'aggregate finality proof digest',
      candidate.checkFinalityProofDigest,
      input.authorization.finalityProofDigestHex,
    ),
    checkAdmissionDigestHex: exactHex(
      'check admission digest',
      candidate.checkAdmissionDigest,
      input.authorization.checkAdmissionDigestHex,
    ),
    authorizationDigestHex: fixedHex(
      input.authorization.authorizationDigestHex,
      'execution authorization digest',
    ),
  } as const;
  const admission = Object.freeze({
    ...binding,
    reservationDigestHex: sha256Canonical(binding),
  });
  AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_ADMISSIONS.add(admission);
  return admission;
}

export function assertAuthenticatedSettlementExecutionReservationAdmissionProvenance(
  admission: unknown,
): asserts admission is AuthenticatedSettlementExecutionReservationAdmission {
  if (
    typeof admission !== 'object'
    || admission === null
    || !AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_ADMISSIONS.has(admission)
  ) {
    throw new Error('authenticated settlement execution reservation provenance is missing');
  }
  const branded = admission as AuthenticatedSettlementExecutionReservationAdmission;
  const binding = {
    schema: branded.schema,
    candidateId: branded.candidateId,
    candidateAuthorityDigestHex: branded.candidateAuthorityDigestHex,
    burnId: branded.burnId,
    burnTxHash: branded.burnTxHash,
    amountNanoErg: branded.amountNanoErg,
    recipientErgoTreeHex: branded.recipientErgoTreeHex,
    duplicatePreventionBoxId: branded.duplicatePreventionBoxId,
    vaultBoxId: branded.vaultBoxId,
    expectedTxId: branded.expectedTxId,
    unsignedTxDigestHex: branded.unsignedTxDigestHex,
    unsignedPackageDigestHex: branded.unsignedPackageDigestHex,
    signedTransactionDigestHex: branded.signedTransactionDigestHex,
    checkResponseDigestHex: branded.checkResponseDigestHex,
    signerContextDigestHex: branded.signerContextDigestHex,
    checkerIdentityDigestHex: branded.checkerIdentityDigestHex,
    revalidationDigestHex: branded.revalidationDigestHex,
    stableErgoViewDigestHex: branded.stableErgoViewDigestHex,
    stableSidechainViewDigestHex: branded.stableSidechainViewDigestHex,
    finalityProofDigestHex: branded.finalityProofDigestHex,
    checkAdmissionDigestHex: branded.checkAdmissionDigestHex,
    authorizationDigestHex: branded.authorizationDigestHex,
  };
  if (
    branded.schema !== AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA
    || fixedHex(branded.reservationDigestHex, 'execution reservation digest')
      !== sha256Canonical(binding)
  ) {
    throw new Error('authenticated settlement execution reservation binding is invalid');
  }
}

function exactHex(label: string, left: string | null, right: string): string {
  const normalizedLeft = fixedHex(left, label);
  const normalizedRight = fixedHex(right, label);
  if (normalizedLeft !== normalizedRight) {
    throw new Error(`${label} does not match across execution reservation`);
  }
  return normalizedLeft;
}

function fixedHex(value: string | null, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean.toLowerCase();
}

function sizedHex(value: string | null, expectedBytes: number, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean) || clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function positiveBigInt(value: bigint, label: string): bigint {
  const normalized = BigInt(value);
  if (normalized <= 0n) throw new Error(`${label} must be positive`);
  return normalized;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('execution reservation cannot contain non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`execution reservation cannot serialize ${typeof value}`);
}
