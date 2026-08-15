import blakejs from 'blakejs';

import {
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance,
  type AuthenticatedPooledReserveMintReservationStateV4,
} from './native-pooled-reserve-mint-reservation-state-v4-proof-collector.js';
import type {
  NativeFinalizedPooledReserveMintReservationStateV4Request,
} from './native-finalized-pooled-reserve-mint-reservation-state-v4.js';
import type {
  PooledReserveMintReservationRecoveryObservationV4,
  PooledReserveMintReservationRecoveryObservationV4Semantic,
} from './pooled-reserve-mint-reservation-recovery-v4.js';
import { sha256CanonicalJson } from './strict-json.js';

export const POOLED_RESERVE_MINT_RESERVATION_FINALITY_CONTINUITY_V4_SCHEMA =
  'e2s.pooled-reserve-mint-reservation-finality-continuity.v4' as const;
export const POOLED_RESERVE_MINT_RESERVATION_FINALITY_CONTINUITY_V4_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:pooled-reserve-mint-reservation-finality-continuity:v4';

const MAX_AUTHENTICATED_ANCESTRY_HEADERS = 16 * 4_096 + 4_096;
const FINALITY_CONTINUITY_EVIDENCE_V4 = new WeakSet<object>();

export interface PooledReserveMintReservationFinalityContinuityV4 {
  readonly schema:
    typeof POOLED_RESERVE_MINT_RESERVATION_FINALITY_CONTINUITY_V4_SCHEMA;
  readonly reservation: {
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
    readonly profileIdHex: string;
  };
  readonly source: {
    readonly requestDigestHex: string;
    readonly trustAnchorDigestHex: string;
  };
  readonly priorHorizon: {
    readonly hashHex: string;
    readonly height: string;
  };
  readonly nextHorizon: {
    readonly hashHex: string;
    readonly height: string;
  };
  readonly ancestry: {
    readonly authenticatedHeaderCount: number;
    readonly pathDigestHex: string;
    readonly priorHorizonLocatedInAuthenticatedPath: true;
    readonly parentHashChainVerified: true;
    readonly canonicalScaleBlockNumbersVerified: true;
  };
  readonly boundary: {
    readonly observationAuthoritative: false;
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

interface ParsedHeader {
  readonly scaleHex: string;
  readonly hashHex: string;
  readonly parentHashHex: string;
  readonly height: bigint;
}

export function buildPooledReserveMintReservationFinalityContinuityV4(input: {
  readonly currentHold:
    Readonly<PooledReserveMintReservationRecoveryObservationV4>;
  readonly collected:
    Readonly<AuthenticatedPooledReserveMintReservationStateV4>;
}): Readonly<PooledReserveMintReservationFinalityContinuityV4> {
  assertExactDataObject(
    input,
    ['currentHold', 'collected'],
    'pooled-reserve finality-continuity input',
  );
  const current = input.currentHold;
  const collected = input.collected;
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance(collected);

  const reservationState = collected.verification.reservationState;
  if (
    current.reservation.statementIdHex !== reservationState.statementIdHex
    || current.reservation.reservationKeyHex
      !== reservationState.reservationKeyHex
    || current.reservation.profileIdHex !== reservationState.profileIdHex
    || current.source.trustAnchorDigestHex
      !== collected.verification.trustAnchorDigestHex
    || current.source.bridgeRuntimeCodeSha256Hex
      !== reservationState.bridgeRuntimeCodeSha256Hex
    || current.source.bridgeRuntimeCodeBytes
      !== reservationState.bridgeRuntimeCodeBytes
  ) {
    throw new Error(
      'pooled-reserve finality continuity changed the stable reservation identity',
    );
  }

  const priorHorizon = {
    hashHex: fixedHex(
      current.source.finalityHorizonHashHex,
      32,
      'prior finality horizon hash',
    ),
    height: canonicalUint64(
      current.source.finalityHorizonHeight,
      'prior finality horizon height',
    ),
  };
  const nextHorizon = {
    hashHex: fixedHex(
      collected.verification.finality.horizonHashHex,
      32,
      'next finality horizon hash',
    ),
    height: canonicalUint64(
      collected.verification.finality.horizonHeight,
      'next finality horizon height',
    ),
  };
  if (nextHorizon.height <= priorHorizon.height) {
    throw new Error(
      'pooled-reserve finality continuity requires a strictly later horizon',
    );
  }

  const path = verifyAuthenticatedFinalityHeaderPathV4({
    request: collected.collection.request,
    expectedHorizonHashHex: nextHorizon.hashHex,
    expectedHorizonHeight: nextHorizon.height.toString(),
  });
  const checkpointHeight = canonicalUint64(
    collected.collection.request.trustAnchor.checkpointNumber,
    'finality trust checkpoint height',
  );
  const checkpointHashHex = fixedHex(
    collected.collection.request.trustAnchor.checkpointHashHex,
    32,
    'finality trust checkpoint hash',
  );
  let priorIndex = -1;
  if (priorHorizon.height === checkpointHeight) {
    if (priorHorizon.hashHex !== checkpointHashHex) {
      throw new Error(
        'prior finality horizon conflicts with the authenticated trust checkpoint',
      );
    }
  } else {
    priorIndex = path.findIndex(header =>
      header.height === priorHorizon.height
      && header.hashHex === priorHorizon.hashHex
    );
    if (priorIndex < 0) {
      throw new Error(
        'prior finality horizon is not in the authenticated ancestry path',
      );
    }
  }
  const advancingHeaders = path.slice(priorIndex + 1);
  if (
    BigInt(advancingHeaders.length)
      !== nextHorizon.height - priorHorizon.height
  ) {
    throw new Error(
      'authenticated finality ancestry does not cover every advancing height',
    );
  }
  let expectedParentHashHex = priorHorizon.hashHex;
  let expectedHeight = priorHorizon.height + 1n;
  for (const header of advancingHeaders) {
    if (
      header.parentHashHex !== expectedParentHashHex
      || header.height !== expectedHeight
    ) {
      throw new Error(
        'authenticated finality ancestry does not descend from the held horizon',
      );
    }
    expectedParentHashHex = header.hashHex;
    expectedHeight += 1n;
  }
  if (
    expectedParentHashHex !== nextHorizon.hashHex
    || expectedHeight !== nextHorizon.height + 1n
  ) {
    throw new Error(
      'authenticated finality ancestry does not end at the next horizon',
    );
  }

  const binding = {
    schema: POOLED_RESERVE_MINT_RESERVATION_FINALITY_CONTINUITY_V4_SCHEMA,
    reservation: {
      statementIdHex: current.reservation.statementIdHex,
      reservationKeyHex: current.reservation.reservationKeyHex,
      profileIdHex: current.reservation.profileIdHex,
    },
    source: {
      requestDigestHex: collected.verification.requestDigestHex,
      trustAnchorDigestHex: collected.verification.trustAnchorDigestHex,
    },
    priorHorizon: {
      hashHex: priorHorizon.hashHex,
      height: priorHorizon.height.toString(),
    },
    nextHorizon: {
      hashHex: nextHorizon.hashHex,
      height: nextHorizon.height.toString(),
    },
    ancestry: {
      authenticatedHeaderCount: advancingHeaders.length,
      pathDigestHex: sha256CanonicalJson({
        priorHorizon: {
          hashHex: priorHorizon.hashHex,
          height: priorHorizon.height.toString(),
        },
        nextHorizon: {
          hashHex: nextHorizon.hashHex,
          height: nextHorizon.height.toString(),
        },
        headersScaleHex: advancingHeaders.map(header => header.scaleHex),
      }, POOLED_RESERVE_MINT_RESERVATION_FINALITY_CONTINUITY_V4_DIGEST_DOMAIN),
      priorHorizonLocatedInAuthenticatedPath: true as const,
      parentHashChainVerified: true as const,
      canonicalScaleBlockNumbersVerified: true as const,
    },
    boundary: {
      observationAuthoritative: false as const,
      reservationAuthorized: false as const,
      mintAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessVerified: false as const,
    },
  };
  const evidence = deepFreeze(binding);
  FINALITY_CONTINUITY_EVIDENCE_V4.add(evidence);
  return evidence;
}

export function assertPooledReserveMintReservationFinalityContinuityV4Provenance(
  value: unknown,
): asserts value is Readonly<
  PooledReserveMintReservationFinalityContinuityV4
> {
  if (
    value === null
    || typeof value !== 'object'
    || !FINALITY_CONTINUITY_EVIDENCE_V4.has(value)
  ) {
    throw new Error(
      'pooled-reserve finality-continuity provenance is missing',
    );
  }
}

export function assertPooledReserveMintReservationFinalityContinuityV4Binding(
  evidence: Readonly<PooledReserveMintReservationFinalityContinuityV4>,
  current: Readonly<PooledReserveMintReservationRecoveryObservationV4>,
  next: Readonly<PooledReserveMintReservationRecoveryObservationV4Semantic>,
): void {
  assertPooledReserveMintReservationFinalityContinuityV4Provenance(evidence);
  if (
    evidence.reservation.statementIdHex
      !== current.reservation.statementIdHex
    || evidence.reservation.statementIdHex
      !== next.reservation.statementIdHex
    || evidence.reservation.reservationKeyHex
      !== current.reservation.reservationKeyHex
    || evidence.reservation.reservationKeyHex
      !== next.reservation.reservationKeyHex
    || evidence.reservation.profileIdHex !== current.reservation.profileIdHex
    || evidence.reservation.profileIdHex !== next.reservation.profileIdHex
    || evidence.source.trustAnchorDigestHex
      !== current.source.trustAnchorDigestHex
    || evidence.source.trustAnchorDigestHex
      !== next.source.trustAnchorDigestHex
    || evidence.source.requestDigestHex !== next.source.requestDigestHex
    || evidence.priorHorizon.hashHex
      !== current.source.finalityHorizonHashHex
    || evidence.priorHorizon.height
      !== current.source.finalityHorizonHeight
    || evidence.nextHorizon.hashHex !== next.source.finalityHorizonHashHex
    || evidence.nextHorizon.height !== next.source.finalityHorizonHeight
  ) {
    throw new Error(
      'pooled-reserve finality-continuity evidence does not bind the recovery transition',
    );
  }
}

function verifyAuthenticatedFinalityHeaderPathV4(input: {
  readonly request:
    Readonly<NativeFinalizedPooledReserveMintReservationStateV4Request>;
  readonly expectedHorizonHashHex: string;
  readonly expectedHorizonHeight: string;
}): readonly ParsedHeader[] {
  const checkpointHashHex = fixedHex(
    input.request.trustAnchor.checkpointHashHex,
    32,
    'finality trust checkpoint hash',
  );
  const checkpointHeight = canonicalUint64(
    input.request.trustAnchor.checkpointNumber,
    'finality trust checkpoint height',
  );
  const horizonHashHex = fixedHex(
    input.expectedHorizonHashHex,
    32,
    'expected finality horizon hash',
  );
  const horizonHeight = canonicalUint64(
    input.expectedHorizonHeight,
    'expected finality horizon height',
  );
  if (horizonHeight < checkpointHeight) {
    throw new Error(
      'finality horizon precedes the authenticated trust checkpoint',
    );
  }
  const headersScaleHex = [
    ...input.request.linkedGrandpaProofs.flatMap(
      proof => proof.ancestryHeadersScaleHex,
    ),
    ...input.request.checkpointTailHeadersScaleHex,
  ];
  if (headersScaleHex.length > MAX_AUTHENTICATED_ANCESTRY_HEADERS) {
    throw new Error(
      'authenticated finality ancestry exceeds its bounded header count',
    );
  }
  if (
    BigInt(headersScaleHex.length) !== horizonHeight - checkpointHeight
  ) {
    throw new Error(
      'authenticated finality path does not contain every checkpoint successor',
    );
  }
  const parsed: ParsedHeader[] = [];
  let expectedParentHashHex = checkpointHashHex;
  let expectedHeight = checkpointHeight + 1n;
  for (const [index, headerScaleHex] of headersScaleHex.entries()) {
    const header = parseSubstrateHeaderScaleV4(
      headerScaleHex,
      `authenticated finality header ${index}`,
    );
    if (
      header.parentHashHex !== expectedParentHashHex
      || header.height !== expectedHeight
    ) {
      throw new Error(
        'authenticated finality header path is not a contiguous descendant chain',
      );
    }
    parsed.push(header);
    expectedParentHashHex = header.hashHex;
    expectedHeight += 1n;
  }
  if (
    expectedParentHashHex !== horizonHashHex
    || expectedHeight !== horizonHeight + 1n
  ) {
    throw new Error(
      'authenticated finality header path does not end at the verified horizon',
    );
  }
  return Object.freeze(parsed);
}

function parseSubstrateHeaderScaleV4(
  value: unknown,
  label: string,
): ParsedHeader {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase byte hex`);
  }
  const bytes = Buffer.from(value.slice(2), 'hex');
  if (bytes.length < 98) {
    throw new Error(`${label} is too short to be a canonical header`);
  }
  const number = decodeCompactUintV4(bytes, 32, `${label} number`);
  if (bytes.length < 32 + number.bytesRead + 65) {
    throw new Error(`${label} is truncated before its digest`);
  }
  const hash = Buffer.from(blakejs.blake2b(bytes, undefined, 32));
  return Object.freeze({
    scaleHex: value,
    hashHex: `0x${hash.toString('hex')}`,
    parentHashHex: `0x${bytes.subarray(0, 32).toString('hex')}`,
    height: number.value,
  });
}

function decodeCompactUintV4(
  bytes: Buffer,
  offset: number,
  label: string,
): { readonly value: bigint; readonly bytesRead: number } {
  const first = bytes[offset];
  if (first === undefined) {
    throw new Error(`${label} is missing`);
  }
  const mode = first & 0x03;
  if (mode === 0) {
    return { value: BigInt(first >>> 2), bytesRead: 1 };
  }
  if (mode === 1) {
    if (offset + 2 > bytes.length) {
      throw new Error(`${label} is truncated`);
    }
    const value = BigInt(bytes.readUInt16LE(offset) >>> 2);
    if (value < 64n) {
      throw new Error(`${label} is not canonically compact-encoded`);
    }
    return { value, bytesRead: 2 };
  }
  if (mode === 2) {
    if (offset + 4 > bytes.length) {
      throw new Error(`${label} is truncated`);
    }
    const value = BigInt(bytes.readUInt32LE(offset) >>> 2);
    if (value < 16_384n) {
      throw new Error(`${label} is not canonically compact-encoded`);
    }
    return { value, bytesRead: 4 };
  }
  const byteLength = (first >>> 2) + 4;
  if (byteLength > 8 || offset + 1 + byteLength > bytes.length) {
    throw new Error(`${label} uses an unsupported compact integer`);
  }
  let value = 0n;
  for (let index = 0; index < byteLength; index += 1) {
    value |= BigInt(bytes[offset + 1 + index]!) << BigInt(index * 8);
  }
  if (
    value < (1n << 30n)
    || (byteLength > 4
      && value < (1n << BigInt((byteLength - 1) * 8)))
  ) {
    throw new Error(`${label} is not canonically compact-encoded`);
  }
  return { value, bytesRead: byteLength + 1 };
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be canonical 0x-prefixed lowercase hex`);
  }
  return value;
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

function assertExactDataObject(
  value: unknown,
  keys: readonly string[],
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
  const actual = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${keys.join(', ')}`);
  }
  for (const key of actual) {
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
