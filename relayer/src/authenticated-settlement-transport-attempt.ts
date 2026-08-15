import {
  assertAuthenticatedSettlementTransportReservationRequestProvenance,
  type AuthenticatedSettlementTransportReservationRequest,
} from './relayer-core/authenticated-settlement-execution-lifecycle.js';
import {
  deriveAuthenticatedSettlementCandidateAuthorityDigest,
} from './authenticated-settlement-execution-reservation.js';
import {
  deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-payout-binding.js';
import { sha256CanonicalJson } from './strict-json.js';
import type {
  AuthenticatedSettlementCandidate,
  AuthenticatedSettlementExecutionReservation,
  PegOutEvent,
  StateTracker,
} from './state-tracker.js';

export const AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA =
  'e2s.authenticated-settlement-transport-attempt.v1';
export const AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION = 1;
export const AUTHENTICATED_SETTLEMENT_TRANSPORT_RESERVATION_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_SETTLEMENT_TRANSPORT_RESERVATION_V1';
export const AUTHENTICATED_SETTLEMENT_DURABLE_ATTEMPT_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_SETTLEMENT_DURABLE_ATTEMPT_V1';

const AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_ADMISSIONS =
  new WeakSet<object>();

type AuthenticatedSettlementTransportAttemptState = Pick<
  StateTracker,
  | 'getAuthenticatedSettlementCandidate'
  | 'getAuthenticatedSettlementExecutionReservation'
  | 'getPegOutByBurnId'
>;

export interface AuthenticatedSettlementTransportAttemptAdmissionInput {
  readonly executionReservationDigestHex: string;
  readonly candidateId: string;
  readonly expectedTxId: string;
  readonly unsignedTxDigestHex: string;
  readonly unsignedPackageDigestHex: string;
  readonly payoutDigestHex: string;
  readonly trackerBoxId: string;
  readonly duplicatePreventionBoxId: string;
  readonly signedTransactionDigestHex: string;
  readonly preSubmitRevalidationDigestHex: string;
  readonly broadcastAuthorizationDigestHex: string;
}

export type AuthenticatedSettlementTransportCurrentAuthorityInput = Omit<
  AuthenticatedSettlementTransportAttemptAdmissionInput,
  'preSubmitRevalidationDigestHex' | 'broadcastAuthorizationDigestHex'
>;

export interface AuthenticatedSettlementTransportAttemptAdmission
  extends AuthenticatedSettlementTransportAttemptAdmissionInput {
  readonly schema: typeof AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA;
  readonly lifecycleVersion:
    typeof AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION;
  readonly transportReservationDigestHex: string;
  readonly durableAttemptDigestHex: string;
}

export type AuthenticatedSettlementSubmissionDisposition =
  | 'accepted'
  | 'rejected'
  | 'ambiguous';

export interface AuthenticatedSettlementSubmissionFinalizationInput {
  readonly durableAttemptDigestHex: string;
  readonly disposition: AuthenticatedSettlementSubmissionDisposition;
  readonly submittedTxId: string | null;
  readonly responseDigestHex: string | null;
}

export function authorizeAuthenticatedSettlementTransportAttempt<
  Prepared,
  SignedArtifact,
>(input: {
  readonly state: AuthenticatedSettlementTransportAttemptState;
  readonly request: AuthenticatedSettlementTransportReservationRequest<
    AuthenticatedSettlementCandidate,
    Prepared,
    SignedArtifact
  >;
}): AuthenticatedSettlementTransportAttemptAdmission {
  assertAuthenticatedSettlementTransportReservationRequestProvenance(
    input.request,
  );
  const authorization = input.request.authorization;
  const binding = normalizeTransportAttemptBinding({
    executionReservationDigestHex: authorization.reservationDigestHex,
    candidateId: authorization.candidateId,
    expectedTxId: authorization.expectedTxId,
    unsignedTxDigestHex: authorization.unsignedTxDigestHex,
    unsignedPackageDigestHex: authorization.unsignedPackageDigestHex,
    payoutDigestHex: authorization.payoutDigestHex,
    trackerBoxId: authorization.trackerBoxId,
    duplicatePreventionBoxId: authorization.duplicatePreventionBoxId,
    signedTransactionDigestHex: authorization.signedTransactionDigestHex,
    preSubmitRevalidationDigestHex:
      authorization.preSubmitRevalidationDigestHex,
    broadcastAuthorizationDigestHex:
      authorization.broadcastAuthorizationDigestHex,
  });
  assertAuthenticatedSettlementTransportAttemptCurrentAuthority(
    input.state,
    binding,
  );
  const identity = deriveAuthenticatedSettlementTransportAttemptIdentity(
    binding,
  );
  const admission = Object.freeze({
    ...binding,
    ...identity,
  });
  AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_ADMISSIONS.add(admission);
  return admission;
}

export function assertAuthenticatedSettlementTransportAttemptAdmissionProvenance(
  value: unknown,
): asserts value is AuthenticatedSettlementTransportAttemptAdmission {
  if (
    typeof value !== 'object'
    || value === null
    || !AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_ADMISSIONS.has(value)
  ) {
    throw new Error('authenticated settlement transport attempt provenance is missing');
  }
  const admission = value as AuthenticatedSettlementTransportAttemptAdmission;
  const expected = deriveAuthenticatedSettlementTransportAttemptIdentity(
    admission,
  );
  if (
    admission.schema !== AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA
    || admission.lifecycleVersion
      !== AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION
    || fixedHex(
      admission.transportReservationDigestHex,
      'transport reservation digest',
    ) !== expected.transportReservationDigestHex
    || fixedHex(
      admission.durableAttemptDigestHex,
      'durable attempt digest',
    ) !== expected.durableAttemptDigestHex
  ) {
    throw new Error('authenticated settlement transport attempt binding is invalid');
  }
}

export function deriveAuthenticatedSettlementTransportAttemptIdentity(
  input: AuthenticatedSettlementTransportAttemptAdmissionInput,
): Readonly<{
  transportReservationDigestHex: string;
  durableAttemptDigestHex: string;
}> {
  const binding = normalizeTransportAttemptBinding(input);
  const transportReservationDigestHex = sha256CanonicalJson({
    domain: AUTHENTICATED_SETTLEMENT_TRANSPORT_RESERVATION_DIGEST_DOMAIN,
    ...binding,
  });
  return Object.freeze({
    transportReservationDigestHex,
    durableAttemptDigestHex: sha256CanonicalJson({
      domain: AUTHENTICATED_SETTLEMENT_DURABLE_ATTEMPT_DIGEST_DOMAIN,
      ...binding,
      transportReservationDigestHex,
      submissionAttempted: true,
    }),
  });
}

export function assertAuthenticatedSettlementTransportAttemptCurrentAuthority(
  state: AuthenticatedSettlementTransportAttemptState,
  input: AuthenticatedSettlementTransportCurrentAuthorityInput,
): Readonly<{
  reservation: AuthenticatedSettlementExecutionReservation;
  candidate: AuthenticatedSettlementCandidate;
  pegOut: PegOutEvent;
}> {
  const binding = normalizeTransportCurrentAuthorityBinding(input);
  const reservation = state.getAuthenticatedSettlementExecutionReservation({
    reservationDigestHex: binding.executionReservationDigestHex,
  });
  if (!reservation || reservation.status !== 'active') {
    throw new Error(
      'authenticated transport attempt requires an active execution reservation',
    );
  }
  const candidate = state.getAuthenticatedSettlementCandidate(
    binding.candidateId,
  );
  if (
    !candidate
    || candidate.status !== 'check_passed'
    || candidate.invalidationReason !== null
  ) {
    throw new Error(
      'authenticated transport attempt requires one current checked candidate',
    );
  }
  const pegOut = state.getPegOutByBurnId(reservation.burnId);
  if (!pegOut) {
    throw new Error(
      'authenticated transport attempt requires one current unsettled peg-out',
    );
  }
  const pegOutAuthority = normalizeTransportPegOutAuthority(pegOut);
  if (
    pegOutAuthority.status !== 'detected'
    && pegOutAuthority.status !== 'confirmed'
  ) {
    throw new Error(
      'authenticated transport attempt requires one current unsettled peg-out',
    );
  }
  if (
    reservation.candidateId !== candidate.candidateId
    || reservation.candidateAuthorityDigestHex
      !== deriveAuthenticatedSettlementCandidateAuthorityDigest(candidate)
    || reservation.burnId !== candidate.burnId
    || reservation.burnTxHash !== candidate.burnTxHash
    || reservation.duplicatePreventionBoxId !== candidate.dupInputBoxId
    || reservation.vaultBoxId !== candidate.vaultBoxId
    || reservation.unsignedTxDigestHex !== candidate.unsignedTxDigest
    || reservation.expectedTxId !== candidate.checkExpectedTxId
    || reservation.unsignedPackageDigestHex
      !== candidate.checkUnsignedPackageDigest
    || reservation.signedTransactionDigestHex
      !== candidate.checkSignedTransactionDigest
    || reservation.checkResponseDigestHex !== candidate.checkResponseDigest
    || reservation.signerContextDigestHex
      !== candidate.checkSignerContextDigest
    || reservation.checkerIdentityDigestHex
      !== candidate.checkCheckerIdentityDigest
    || reservation.revalidationDigestHex
      !== candidate.checkRevalidationDigest
    || reservation.stableErgoViewDigestHex
      !== candidate.checkStableErgoViewDigest
    || reservation.stableSidechainViewDigestHex
      !== candidate.checkStableSidechainViewDigest
    || reservation.finalityProofDigestHex
      !== candidate.checkFinalityProofDigest
    || reservation.checkAdmissionDigestHex !== candidate.checkAdmissionDigest
  ) {
    throw new Error(
      'authenticated transport attempt execution reservation authority has drifted',
    );
  }
  if (
    pegOutAuthority.burnId !== reservation.burnId
    || pegOutAuthority.burnTxHash !== reservation.burnTxHash
    || pegOutAuthority.sidechainId !== candidate.sidechainId
    || pegOutAuthority.sidechainHeight !== candidate.sidechainHeight
    || pegOutAuthority.sidechainBlockHash !== candidate.sidechainBlockHash
    || pegOutAuthority.sidechainLogIndex !== candidate.sidechainLogIndex
    || pegOutAuthority.amountNanoErg !== reservation.amountNanoErg
    || pegOutAuthority.recipientErgoTreeHex
      !== reservation.recipientErgoTreeHex
  ) {
    throw new Error(
      'authenticated transport attempt peg-out authority has drifted',
    );
  }
  const payoutDigestHex =
    deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest({
      candidateId: candidate.candidateId,
      burnId: candidate.burnId,
      sidechainId: candidate.sidechainId,
      burnTxHash: candidate.burnTxHash,
      sidechainHeight: candidate.sidechainHeight,
      executionBlockHash: candidate.sidechainBlockHash,
      eventIndex: candidate.sidechainLogIndex,
      amountNanoErg: reservation.amountNanoErg,
      recipientErgoTreeHex: reservation.recipientErgoTreeHex,
      vaultBoxId: reservation.vaultBoxId,
    });
  if (
    binding.candidateId !== reservation.candidateId
    || binding.expectedTxId !== reservation.expectedTxId
    || binding.unsignedTxDigestHex !== reservation.unsignedTxDigestHex
    || binding.unsignedPackageDigestHex
      !== reservation.unsignedPackageDigestHex
    || binding.payoutDigestHex !== payoutDigestHex
    || binding.trackerBoxId !== candidate.trackerBoxId
    || binding.duplicatePreventionBoxId
      !== reservation.duplicatePreventionBoxId
    || binding.signedTransactionDigestHex
      !== reservation.signedTransactionDigestHex
  ) {
    throw new Error(
      'authenticated transport attempt does not match current settlement authority',
    );
  }
  return Object.freeze({ reservation, candidate, pegOut });
}

function normalizeTransportPegOutAuthority(
  pegOut: PegOutEvent,
): Readonly<{
  status: string;
  burnId: string;
  burnTxHash: string;
  sidechainId: string;
  sidechainHeight: bigint;
  sidechainBlockHash: string;
  sidechainLogIndex: number;
  amountNanoErg: bigint;
  recipientErgoTreeHex: string;
}> {
  const row = pegOut as unknown as Record<string, unknown>;
  const rawShape = Object.hasOwn(row, 'burn_id');
  const value = (camel: string, snake: string): unknown =>
    row[rawShape ? snake : camel];
  const sidechainHeightValue = value(
    'sidechainBurnHeight',
    'sidechain_burn_height',
  );
  const sidechainHeight = nonnegativeIntegerBigInt(
    sidechainHeightValue,
    'persisted peg-out sidechain height',
  );
  const sidechainLogIndex = Number(
    value('sidechainLogIndex', 'sidechain_log_index'),
  );
  if (
    sidechainHeight < 0n
    || !Number.isSafeInteger(sidechainLogIndex)
    || sidechainLogIndex < 0
  ) {
    throw new Error('persisted peg-out coordinates are invalid');
  }
  const amountNanoErg = BigInt(
    value('amountNanoErg', 'amount_nanoerg') as bigint | string | number,
  );
  if (amountNanoErg <= 0n) {
    throw new Error('persisted peg-out amount is invalid');
  }
  return Object.freeze({
    status: String(value('status', 'status')),
    burnId: fixedHex(
      String(value('burnId', 'burn_id')),
      'persisted peg-out burn ID',
    ),
    burnTxHash: fixedHex(
      String(value('sidechainBurnTxHash', 'sidechain_burn_tx_hash')),
      'persisted peg-out transaction hash',
    ),
    sidechainId: fixedHex(
      String(value('sidechainId', 'sidechain_id')),
      'persisted peg-out sidechain ID',
    ),
    sidechainHeight,
    sidechainBlockHash: fixedHex(
      String(value('sidechainBlockHash', 'sidechain_block_hash')),
      'persisted peg-out block hash',
    ),
    sidechainLogIndex,
    amountNanoErg,
    recipientErgoTreeHex: fixedSizedHex(
      String(value('ergoRecipientAddress', 'ergo_recipient_address')),
      36,
      'persisted peg-out recipient ErgoTree',
    ),
  });
}

function normalizeTransportAttemptBinding(
  input: AuthenticatedSettlementTransportAttemptAdmissionInput,
): Readonly<
  {
    schema: typeof AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA;
    lifecycleVersion:
      typeof AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION;
  } & AuthenticatedSettlementTransportAttemptAdmissionInput
> {
  return {
    ...normalizeTransportCurrentAuthorityBinding(input),
    preSubmitRevalidationDigestHex: fixedHex(
      input.preSubmitRevalidationDigestHex,
      'pre-submit revalidation digest',
    ),
    broadcastAuthorizationDigestHex: fixedHex(
      input.broadcastAuthorizationDigestHex,
      'broadcast authorization digest',
    ),
  };
}

function normalizeTransportCurrentAuthorityBinding(
  input: AuthenticatedSettlementTransportCurrentAuthorityInput,
): Readonly<
  {
    schema: typeof AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA;
    lifecycleVersion:
      typeof AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION;
  } & AuthenticatedSettlementTransportCurrentAuthorityInput
> {
  return {
    schema: AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA,
    lifecycleVersion:
      AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION,
    executionReservationDigestHex: fixedHex(
      input.executionReservationDigestHex,
      'execution reservation digest',
    ),
    candidateId: fixedHex(input.candidateId, 'candidate ID'),
    expectedTxId: fixedHex(input.expectedTxId, 'expected transaction ID'),
    unsignedTxDigestHex: fixedHex(
      input.unsignedTxDigestHex,
      'unsigned transaction digest',
    ),
    unsignedPackageDigestHex: fixedHex(
      input.unsignedPackageDigestHex,
      'unsigned package digest',
    ),
    payoutDigestHex: fixedHex(input.payoutDigestHex, 'payout digest'),
    trackerBoxId: fixedHex(input.trackerBoxId, 'tracker box ID'),
    duplicatePreventionBoxId: fixedHex(
      input.duplicatePreventionBoxId,
      'duplicate-prevention box ID',
    ),
    signedTransactionDigestHex: fixedHex(
      input.signedTransactionDigestHex,
      'signed transaction digest',
    ),
  };
}

function fixedHex(value: string, label: string): string {
  return fixedSizedHex(value, 32, label);
}

function nonnegativeIntegerBigInt(value: unknown, label: string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error(`${label} must be nonnegative`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a nonnegative safe integer`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    return BigInt(value);
  }
  throw new Error(`${label} must be a nonnegative integer`);
}

function fixedSizedHex(value: string, bytes: number, label: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(clean)) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}
