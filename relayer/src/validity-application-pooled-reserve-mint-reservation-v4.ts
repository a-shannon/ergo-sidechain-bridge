import blakejs from 'blakejs';

import {
  PEG_IN_SOURCE_INTENT_V2_BYTES,
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN,
} from './validity-application-pooled-reserve-deposit-finality-v4.js';
import {
  assertValidityApplicationPooledReserveMintAdmissionV4Candidate,
  type ValidityApplicationPooledReserveMintAdmissionV4Candidate,
} from './validity-application-pooled-reserve-mint-admission-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-mint-reservation.v4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_STATUS =
  'unsubmitted_non_authorizing_request' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION =
  4 as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_ID_DOMAIN =
  'E2S_POOLED_RESERVE_MINT_RESERVATION_V4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES =
  603 as const;

const NATIVE_ERG_ASSET_ID_HEX = `0x${'00'.repeat(32)}` as const;
const MAX_SIGNED_LONG = (1n << 63n) - 1n;
const requests = new WeakSet<object>();

export interface ValidityApplicationPooledReserveMintReservationStatementV4 {
  readonly formatVersion:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION;
  readonly lineageProfileIdHex: string;
  readonly sourceIntentHex: string;
  readonly sourceIntentIdHex: string;
  readonly mintIdentityHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly reserveTransitionTransactionIdHex: string;
  readonly depositCommitmentHex: string;
  readonly successorReserveBoxIdHex: string;
  readonly successorReserveDigestHex: string;
  readonly successorReserveLiabilityNanoErg: string | number | bigint;
  readonly ergoDepositFinalityPolicyIdHex: string;
  readonly inclusionHeaderIdHex: string;
  readonly inclusionHeight: string | number | bigint;
  readonly targetHeaderIdHex: string;
  readonly targetHeight: string | number | bigint;
  readonly requiredSuccessorDepth: string | number | bigint;
}

export interface ValidityApplicationPooledReserveMintReservationV4Request {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_SCHEMA;
  readonly version:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_STATUS;
  readonly statement:
    Readonly<ValidityApplicationPooledReserveMintReservationStatementV4>;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly reservationKeyHex: string;
  readonly provenance: {
    readonly admissionCandidateDigestHex: string;
    readonly sameProcessAdmissionCandidateVerified: true;
    readonly callerSuppliedProofAccepted: false;
    readonly localPersistenceConsulted: false;
  };
  readonly authority: {
    readonly sourceProofVerifiedByRuntime: false;
    readonly authenticatedSidechainStateReserved: false;
    readonly historicalMintAbsenceProved: false;
    readonly mintExecuted: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
  readonly limitations: readonly string[];
}

export function encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
  statement: ValidityApplicationPooledReserveMintReservationStatementV4,
): string {
  assertExactDataObject(
    statement,
    [
      'formatVersion',
      'lineageProfileIdHex',
      'sourceIntentHex',
      'sourceIntentIdHex',
      'mintIdentityHex',
      'sourceLockBoxIdHex',
      'reserveTransitionTransactionIdHex',
      'depositCommitmentHex',
      'successorReserveBoxIdHex',
      'successorReserveDigestHex',
      'successorReserveLiabilityNanoErg',
      'ergoDepositFinalityPolicyIdHex',
      'inclusionHeaderIdHex',
      'inclusionHeight',
      'targetHeaderIdHex',
      'targetHeight',
      'requiredSuccessorDepth',
    ],
    'pooled-reserve mint-reservation statement',
  );
  assertValidityApplicationPooledReserveMintReservationStatementV4Bindings(
    statement,
  );

  const bytes = Buffer.alloc(
    VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES,
  );
  bytes[0] =
    VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION;
  fixedHexBytes(
    statement.lineageProfileIdHex,
    32,
    'lineage profile ID',
    true,
  ).copy(bytes, 1);
  fixedHexBytes(
    statement.sourceIntentHex,
    PEG_IN_SOURCE_INTENT_V2_BYTES,
    'source intent',
  ).copy(bytes, 33);
  fixedHexBytes(
    statement.sourceIntentIdHex,
    32,
    'source intent ID',
    true,
  ).copy(bytes, 262);
  fixedHexBytes(
    statement.mintIdentityHex,
    32,
    'V4 mint identity',
    true,
  ).copy(bytes, 294);
  fixedHexBytes(
    statement.sourceLockBoxIdHex,
    32,
    'source-lock box ID',
    true,
  ).copy(bytes, 326);
  fixedHexBytes(
    statement.reserveTransitionTransactionIdHex,
    32,
    'reserve-transition transaction ID',
    true,
  ).copy(bytes, 358);
  fixedHexBytes(
    statement.depositCommitmentHex,
    32,
    'deposit commitment',
    true,
  ).copy(bytes, 390);
  fixedHexBytes(
    statement.successorReserveBoxIdHex,
    32,
    'successor-reserve box ID',
    true,
  ).copy(bytes, 422);
  fixedHexBytes(
    statement.successorReserveDigestHex,
    33,
    'successor-reserve digest',
    true,
  ).copy(bytes, 454);
  bytes.writeBigUInt64BE(
    normalizePositiveSignedLong(
      statement.successorReserveLiabilityNanoErg,
      'successor-reserve liability',
    ),
    487,
  );
  fixedHexBytes(
    statement.ergoDepositFinalityPolicyIdHex,
    32,
    'Ergo deposit finality policy ID',
    true,
  ).copy(bytes, 495);
  fixedHexBytes(
    statement.inclusionHeaderIdHex,
    32,
    'inclusion header ID',
    true,
  ).copy(bytes, 527);
  bytes.writeUInt32BE(
    normalizeUint32(statement.inclusionHeight, 'inclusion height'),
    559,
  );
  fixedHexBytes(
    statement.targetHeaderIdHex,
    32,
    'finality target header ID',
    true,
  ).copy(bytes, 563);
  bytes.writeUInt32BE(
    normalizeUint32(statement.targetHeight, 'finality target height'),
    595,
  );
  bytes.writeUInt32BE(
    normalizeUint32(
      statement.requiredSuccessorDepth,
      'required successor depth',
      true,
    ),
    599,
  );
  return `0x${bytes.toString('hex')}`;
}

export function decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
  value: string,
): ValidityApplicationPooledReserveMintReservationStatementV4 {
  const bytes = fixedHexBytes(
    value,
    VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES,
    'pooled-reserve mint-reservation statement',
  );
  const statement: ValidityApplicationPooledReserveMintReservationStatementV4 = {
    formatVersion: bytes[0] as 4,
    lineageProfileIdHex: sliceHex(bytes, 1, 33),
    sourceIntentHex: sliceHex(
      bytes,
      33,
      33 + PEG_IN_SOURCE_INTENT_V2_BYTES,
    ),
    sourceIntentIdHex: sliceHex(bytes, 262, 294),
    mintIdentityHex: sliceHex(bytes, 294, 326),
    sourceLockBoxIdHex: sliceHex(bytes, 326, 358),
    reserveTransitionTransactionIdHex: sliceHex(bytes, 358, 390),
    depositCommitmentHex: sliceHex(bytes, 390, 422),
    successorReserveBoxIdHex: sliceHex(bytes, 422, 454),
    successorReserveDigestHex: sliceHex(bytes, 454, 487),
    successorReserveLiabilityNanoErg:
      bytes.readBigUInt64BE(487).toString(),
    ergoDepositFinalityPolicyIdHex: sliceHex(bytes, 495, 527),
    inclusionHeaderIdHex: sliceHex(bytes, 527, 559),
    inclusionHeight: bytes.readUInt32BE(559),
    targetHeaderIdHex: sliceHex(bytes, 563, 595),
    targetHeight: bytes.readUInt32BE(595),
    requiredSuccessorDepth: bytes.readUInt32BE(599),
  };
  if (
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statement,
    ) !== `0x${bytes.toString('hex')}`
  ) {
    throw new Error(
      'pooled-reserve mint-reservation statement is not canonical V4',
    );
  }
  return statement;
}

export function deriveValidityApplicationPooledReserveMintIdentityV4Hex(input: {
  readonly lineageProfileIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly depositCommitmentHex: string;
}): string {
  assertExactDataObject(
    input,
    [
      'lineageProfileIdHex',
      'sourceLockBoxIdHex',
      'depositCommitmentHex',
    ],
    'pooled-reserve V4 mint-identity input',
  );
  return blake2b256Hex(Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN,
      'ascii',
    ),
    fixedHexBytes(
      input.lineageProfileIdHex,
      32,
      'lineage profile ID',
      true,
    ),
    fixedHexBytes(
      input.sourceLockBoxIdHex,
      32,
      'source-lock box ID',
      true,
    ),
    fixedHexBytes(
      input.depositCommitmentHex,
      32,
      'deposit commitment',
      true,
    ),
  ]));
}

export function deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
  statement: ValidityApplicationPooledReserveMintReservationStatementV4,
): string {
  const encoded =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statement,
    );
  return blake2b256Hex(Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_ID_DOMAIN,
      'ascii',
    ),
    Buffer.from(encoded.slice(2), 'hex'),
  ]));
}

export function
assertValidityApplicationPooledReserveMintReservationStatementV4Bindings(
  statement: ValidityApplicationPooledReserveMintReservationStatementV4,
): void {
  if (
    statement.formatVersion
    !== VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION
  ) {
    throw new Error(
      'pooled-reserve mint-reservation statement version is unsupported',
    );
  }

  const lineageProfileIdHex = normalizedHex(
    statement.lineageProfileIdHex,
    32,
    'lineage profile ID',
    true,
  );
  const sourceIntent = decodePegInSourceIntentV2Hex(
    normalizedHex(
      statement.sourceIntentHex,
      PEG_IN_SOURCE_INTENT_V2_BYTES,
      'source intent',
    ),
  );
  if (sourceIntent.admissionProfileIdHex !== lineageProfileIdHex) {
    throw new Error(
      'pooled-reserve mint-reservation source intent does not bind the lineage profile',
    );
  }
  if (
    derivePegInSourceIntentIdV2Hex(sourceIntent)
    !== normalizedHex(
      statement.sourceIntentIdHex,
      32,
      'source intent ID',
      true,
    )
  ) {
    throw new Error(
      'pooled-reserve mint-reservation source intent ID is inconsistent',
    );
  }
  if (sourceIntent.sourceAssetIdHex !== NATIVE_ERG_ASSET_ID_HEX) {
    throw new Error(
      'pooled-reserve mint reservation V4 supports only the native ERG lane',
    );
  }
  const amountNanoErg = normalizePositiveSignedLong(
    sourceIntent.amountNanoErg,
    'source-intent amount',
  );
  const successorLiability = normalizePositiveSignedLong(
    statement.successorReserveLiabilityNanoErg,
    'successor-reserve liability',
  );
  if (successorLiability < amountNanoErg) {
    throw new Error(
      'successor-reserve liability cannot be lower than the admitted amount',
    );
  }

  const sourceLockBoxIdHex = normalizedHex(
    statement.sourceLockBoxIdHex,
    32,
    'source-lock box ID',
    true,
  );
  const successorReserveBoxIdHex = normalizedHex(
    statement.successorReserveBoxIdHex,
    32,
    'successor-reserve box ID',
    true,
  );
  if (sourceLockBoxIdHex === successorReserveBoxIdHex) {
    throw new Error(
      'source-lock and successor-reserve box IDs must be distinct',
    );
  }

  const expectedMintIdentityHex =
    deriveValidityApplicationPooledReserveMintIdentityV4Hex({
      lineageProfileIdHex,
      sourceLockBoxIdHex,
      depositCommitmentHex: normalizedHex(
        statement.depositCommitmentHex,
        32,
        'deposit commitment',
        true,
      ),
    });
  if (
    normalizedHex(
      statement.mintIdentityHex,
      32,
      'V4 mint identity',
      true,
    ) !== expectedMintIdentityHex
  ) {
    throw new Error(
      'pooled-reserve mint-reservation statement has an inconsistent V4 mint identity',
    );
  }

  for (const [value, label] of [
    [
      statement.reserveTransitionTransactionIdHex,
      'reserve-transition transaction ID',
    ],
    [
      statement.ergoDepositFinalityPolicyIdHex,
      'Ergo deposit finality policy ID',
    ],
  ] as const) {
    normalizedHex(value, 32, label, true);
  }
  normalizedHex(
    statement.successorReserveDigestHex,
    33,
    'successor-reserve digest',
    true,
  );
  const inclusionHeight = normalizeUint32(
    statement.inclusionHeight,
    'inclusion height',
  );
  const inclusionHeaderIdHex = normalizedHex(
    statement.inclusionHeaderIdHex,
    32,
    'inclusion header ID',
    true,
  );
  const targetHeaderIdHex = normalizedHex(
    statement.targetHeaderIdHex,
    32,
    'finality target header ID',
    true,
  );
  if (inclusionHeaderIdHex === targetHeaderIdHex) {
    throw new Error(
      'inclusion and finality target header IDs must be distinct',
    );
  }
  const targetHeight = normalizeUint32(
    statement.targetHeight,
    'finality target height',
  );
  const requiredSuccessorDepth = normalizeUint32(
    statement.requiredSuccessorDepth,
    'required successor depth',
    true,
  );
  if (
    inclusionHeight + requiredSuccessorDepth > 0xffff_ffff
    || targetHeight !== inclusionHeight + requiredSuccessorDepth
  ) {
    throw new Error(
      'pooled-reserve mint-reservation finality target does not match the required successor depth',
    );
  }
}

/**
 * Projects a same-process AF-4C-3 candidate into canonical runtime input.
 * The request contains no proof, transport capability, or reservation result.
 */
export function buildValidityApplicationPooledReserveMintReservationV4(
  input: {
    readonly admissionCandidate:
      Readonly<ValidityApplicationPooledReserveMintAdmissionV4Candidate>;
  },
): Readonly<ValidityApplicationPooledReserveMintReservationV4Request> {
  assertExactDataObject(
    input,
    ['admissionCandidate'],
    'pooled-reserve mint-reservation input',
  );
  const candidate = input.admissionCandidate;
  assertValidityApplicationPooledReserveMintAdmissionV4Candidate(candidate);

  const statement = deepFreeze({
    formatVersion:
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION,
    lineageProfileIdHex: candidateHex(
      candidate.lineageProfileIdHex,
      32,
      'lineage profile ID',
    ),
    sourceIntentHex: normalizedHex(
      candidate.source.sourceIntentHex,
      PEG_IN_SOURCE_INTENT_V2_BYTES,
      'source intent',
    ),
    sourceIntentIdHex: candidateHex(
      candidate.source.sourceIntentIdHex,
      32,
      'source intent ID',
    ),
    mintIdentityHex: candidateHex(
      candidate.mint.mintIdentityHex,
      32,
      'V4 mint identity',
    ),
    sourceLockBoxIdHex: candidateHex(
      candidate.source.sourceLockBoxIdHex,
      32,
      'source-lock box ID',
    ),
    reserveTransitionTransactionIdHex: candidateHex(
      candidate.source.reserveTransitionTransactionIdHex,
      32,
      'reserve-transition transaction ID',
    ),
    depositCommitmentHex: candidateHex(
      candidate.source.depositCommitmentHex,
      32,
      'deposit commitment',
    ),
    successorReserveBoxIdHex: candidateHex(
      candidate.source.successorReserveBoxIdHex,
      32,
      'successor-reserve box ID',
    ),
    successorReserveDigestHex: candidateHex(
      candidate.source.successorReserveDigestHex,
      33,
      'successor-reserve digest',
    ),
    successorReserveLiabilityNanoErg:
      candidate.source.successorReserveLiabilityNanoErg,
    ergoDepositFinalityPolicyIdHex: candidateHex(
      candidate.observation.ergoDepositFinalityPolicyIdHex,
      32,
      'Ergo deposit finality policy ID',
    ),
    inclusionHeaderIdHex: candidateHex(
      candidate.observation.inclusionHeaderIdHex,
      32,
      'inclusion header ID',
    ),
    inclusionHeight: candidate.observation.inclusionHeight,
    targetHeaderIdHex: candidateHex(
      candidate.observation.targetHeaderIdHex,
      32,
      'finality target header ID',
    ),
    targetHeight: candidate.observation.targetHeight,
    requiredSuccessorDepth:
      candidate.observation.requiredSuccessorDepth,
  });
  const statementHex =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statement,
    );
  const request = deepFreeze({
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_SCHEMA,
    version:
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_STATUS,
    statement,
    statementHex,
    statementIdHex:
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        statement,
      ),
    reservationKeyHex: statement.mintIdentityHex,
    provenance: {
      admissionCandidateDigestHex: candidate.candidateDigestHex,
      sameProcessAdmissionCandidateVerified: true as const,
      callerSuppliedProofAccepted: false as const,
      localPersistenceConsulted: false as const,
    },
    authority: {
      sourceProofVerifiedByRuntime: false as const,
      authenticatedSidechainStateReserved: false as const,
      historicalMintAbsenceProved: false as const,
      mintExecuted: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
    limitations: Object.freeze([
      'the statement binds the committed reserve transition and V4 replay identity but contains no source proof',
      'the current V1/V2/V3 causal replay maps use a different identity and cannot accept this request',
      'only a future versioned runtime profile may verify proof and atomically reserve this identity',
      'this request performs no persistence, runtime call, EVM mint, signing, submission, broadcast, or funds action',
    ]),
  });
  requests.add(request);
  return request;
}

export function
assertValidityApplicationPooledReserveMintReservationV4Request(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveMintReservationV4Request
> {
  if (value === null || typeof value !== 'object' || !requests.has(value)) {
    throw new Error(
      'pooled-reserve mint-reservation request was not built in this process',
    );
  }
}

function normalizePositiveSignedLong(
  value: string | number | bigint,
  label: string,
): bigint {
  if (
    (typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'bigint')
    || (typeof value === 'string' && !/^(0|[1-9][0-9]*)$/.test(value))
    || (typeof value === 'number'
      && (!Number.isSafeInteger(value) || value < 0))
  ) {
    throw new Error(`${label} must be a canonical non-negative integer`);
  }
  const normalized = BigInt(value);
  if (normalized <= 0n || normalized > MAX_SIGNED_LONG) {
    throw new Error(`${label} must fit a positive signed Long`);
  }
  return normalized;
}

function normalizeUint32(
  value: string | number | bigint,
  label: string,
  positive = false,
): number {
  if (
    (typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'bigint')
    || (typeof value === 'string' && !/^(0|[1-9][0-9]*)$/.test(value))
    || (typeof value === 'number'
      && (!Number.isSafeInteger(value) || value < 0))
  ) {
    throw new Error(`${label} must be a canonical non-negative integer`);
  }
  const normalized = BigInt(value);
  if (
    normalized > 0xffff_ffffn
    || (positive && normalized === 0n)
  ) {
    throw new Error(
      `${label} must fit ${positive ? 'a positive' : 'an'} unsigned 32-bit integer`,
    );
  }
  return Number(normalized);
}

function normalizedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonzero = false,
): string {
  return `0x${fixedHexBytes(value, bytes, label, nonzero).toString('hex')}`;
}

function candidateHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a lowercase hexadecimal string`);
  }
  return normalizedHex(
    value.startsWith('0x') ? value : `0x${value}`,
    bytes,
    label,
    true,
  );
}

function fixedHexBytes(
  value: unknown,
  bytes: number,
  label: string,
  nonzero = false,
): Buffer {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(
      `${label} must be a lowercase 0x-prefixed ${bytes}-byte value`,
    );
  }
  const result = Buffer.from(value.slice(2), 'hex');
  if (nonzero && result.every(byte => byte === 0)) {
    throw new Error(`${label} must not be zero`);
  }
  return result;
}

function sliceHex(bytes: Buffer, start: number, end: number): string {
  return `0x${bytes.subarray(start, end).toString('hex')}`;
}

function blake2b256Hex(value: Uint8Array): string {
  return `0x${Buffer.from(
    blakejs.blake2b(value, undefined, 32),
  ).toString('hex')}`;
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
