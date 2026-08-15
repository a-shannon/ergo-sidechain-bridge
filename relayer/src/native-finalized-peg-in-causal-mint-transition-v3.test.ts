import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_RESULT_CANDIDATE_SCHEMA,
  assertNativeFinalizedPegInCausalMintTransitionV3ResultCandidateProvenance,
  buildNativeFinalizedPegInCausalMintTransitionV3ResultCandidate,
  deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex,
  normalizeNativeFinalizedPegInCausalMintTransitionV3Request,
} from './native-finalized-peg-in-causal-mint-transition-v3.js';
import {
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  derivePegInCausalAdmissionReceiptStorageKeyV1,
  derivePegInCausalInvalidationTombstoneStorageKeyV1,
} from './substrate-finality-provider.js';

const VECTOR = JSON.parse(readFileSync(new URL(
  '../test-vectors/native-finalized-peg-in-causal-mint-transition-v3.json',
  import.meta.url,
), 'utf8')) as Record<string, any>;

describe('native finalized causal peg-in mint transition V3', () => {
  it('consumes the exact Rust V3 vector as a receipt-bound non-authorizing candidate', () => {
    const candidate = candidateFromVector();

    expect(candidate.schema).toBe(
      NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_RESULT_CANDIDATE_SCHEMA,
    );
    expect(candidate.causalTransition).toMatchObject({
      admissionReceiptStorageKeyHex:
        VECTOR.request.statement.admissionReceiptStorageKeyHex,
      invalidationTombstoneStorageKeyHex:
        VECTOR.request.statement.invalidationTombstoneStorageKeyHex,
      proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
      proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
      verifierProfileIdHex: PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
      admissionAdmittedAtNativeHeight: '1020',
      admissionExpiresAtNativeHeight: '1100',
    });
    expect(candidate.causalTransition.admissionReceiptScaleHex).toBe(
      VECTOR.expected.causalTransition.admissionReceiptScaleHex,
    );
    expect(candidate.boundary.exactFederatedReceiptResultShapeChecked).toBe(true);
    expect(candidate.boundary.nativeVerifierExecutionAuthenticated).toBe(false);
    expect(candidate.boundary.federatedSourceProofReceiptAuthenticated).toBe(false);
    expect(candidate.boundary.trustlessSourceProofVerified).toBe(false);
    expect(candidate.boundary.mintAuthorized).toBe(false);
    expect(candidate.boundary.daemonAdmissionAuthorized).toBe(false);
    expect(candidate.boundary.broadcastAuthorized).toBe(false);
    expect(candidate.boundary.gate5Closed).toBe(false);
    expect(Object.isFrozen(candidate.causalTransition)).toBe(true);
    expect(() => assertNativeFinalizedPegInCausalMintTransitionV3ResultCandidateProvenance(
      candidate,
    )).not.toThrow();
    expect(() => assertNativeFinalizedPegInCausalMintTransitionV3ResultCandidateProvenance({
      ...candidate,
    })).toThrow(/provenance is missing/i);
  });

  it('derives the exact Rust CausalPegInAdmissionReceiptsV1 storage key', () => {
    expect(derivePegInCausalAdmissionReceiptStorageKeyV1(
      VECTOR.request.statement.recordKeyHex,
    )).toBe(
      '0xaf86fef4216ac2bcd1c592b204011ad0c5d5743b9bfbc7f464d6e5b131fc9189'
      + '175eb1e2bc1f0136a4c754b880075ee6'
      + '51af81a4b93e0a8dc4f9fdd668495990a19e01a62c642b3bcd4cd5891f45384a',
    );
  });

  it('derives the exact Rust InvalidatedCausalPegInsV1 storage key', () => {
    expect(derivePegInCausalInvalidationTombstoneStorageKeyV1(
      VECTOR.request.statement.recordKeyHex,
    )).toBe(
      '0xaf86fef4216ac2bcd1c592b204011ad088e09c10f6fc5df59926d19ca684fcb3'
      + '175eb1e2bc1f0136a4c754b880075ee6'
      + '51af81a4b93e0a8dc4f9fdd668495990a19e01a62c642b3bcd4cd5891f45384a',
    );
  });

  it('binds the exact V3 request bytes and rejects receipt-key drift', () => {
    const request = normalizeNativeFinalizedPegInCausalMintTransitionV3Request(VECTOR.request);
    const compact = Buffer.from(JSON.stringify(request), 'utf8');
    expect(deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(compact))
      .toBe(VECTOR.expected.requestDigestHex);

    const pretty = Buffer.from(JSON.stringify(request, null, 2), 'utf8');
    expect(() => buildNativeFinalizedPegInCausalMintTransitionV3ResultCandidate({
      requestBytes: pretty,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    })).toThrow(/exact V3 request/i);

    const changed = structuredClone(VECTOR.request);
    changed.statement.admissionReceiptStorageKeyHex = hash('99', 80);
    expect(() => normalizeNativeFinalizedPegInCausalMintTransitionV3Request(changed))
      .toThrow(/admission receipt storage key differs/i);

    const invalidated = structuredClone(VECTOR.request);
    invalidated.statement.invalidationTombstoneStorageKeyHex = hash('98', 80);
    expect(() => normalizeNativeFinalizedPegInCausalMintTransitionV3Request(invalidated))
      .toThrow(/invalidation tombstone storage key differs/i);
  });

  it.each([
    ['format version', 0],
    ['profile ID', 1],
    ['admission ID', 33],
    ['request digest', 65],
    ['result ID', 97],
    ['proof digest', 129],
    ['executable digest', 161],
    ['verifier profile', 193],
  ] as const)('rejects one-byte %s drift in the canonical receipt', (_label, offset) => {
    const expected = structuredClone(VECTOR.expected);
    expected.causalTransition.admissionReceiptScaleHex = mutateByte(
      expected.causalTransition.admissionReceiptScaleHex,
      offset,
    );
    expect(() => candidateFromVector(expected)).toThrow(/receipt/i);
  });

  it('rejects future admission and child-height expiry boundaries', () => {
    const future = structuredClone(VECTOR.expected);
    future.causalTransition.admissionReceiptScaleHex = writeU64Le(
      future.causalTransition.admissionReceiptScaleHex,
      225,
      1025n,
    );
    expect(() => candidateFromVector(future)).toThrow(/admitted after/i);

    const expired = structuredClone(VECTOR.expected);
    expired.causalTransition.admissionReceiptScaleHex = writeU64Le(
      expired.causalTransition.admissionReceiptScaleHex,
      233,
      1025n,
    );
    expired.causalTransition.admissionExpiresAtNativeHeight = '1025';
    expect(() => candidateFromVector(expired)).toThrow(/expired at/i);
  });

  it.each([
    ['proof system', 'proofSystemIdHex', /proof-system ID differs/i],
    ['proof profile', 'proofProfileIdHex', /proof-profile ID differs/i],
  ] as const)('rejects a non-static %s', (_label, field, message) => {
    const expected = structuredClone(VECTOR.expected);
    expected.causalTransition[field] = hash('99');
    expect(() => candidateFromVector(expected)).toThrow(message);
  });

  it('rejects a trustless claim and preserves all authority boundaries as false', () => {
    const expected = structuredClone(VECTOR.expected);
    expected.boundary.trustlessSourceProofVerified = true;
    expect(() => candidateFromVector(expected)).toThrow(/trustlessSourceProofVerified.*false/i);

    const boundary = candidateFromVector().boundary;
    for (const field of [
      'nativeVerifierExecutionAuthenticated',
      'sidechainFinalityVerified',
      'federatedSourceProofReceiptAuthenticated',
      'trustlessSourceProofVerified',
      'committedVaultTransitionVerified',
      'mintAuthorized',
      'daemonAdmissionAuthorized',
      'reconciliationHoldReleaseAuthorized',
      'signingAuthorized',
      'submissionAuthorized',
      'broadcastAuthorized',
      'transactionMutationEnabled',
      'gate5Closed',
      'productionReadinessVerified',
    ] as const) expect(boundary[field]).toBe(false);
  });
});

function candidateFromVector(verification: unknown = VECTOR.expected) {
  const requestBytes = Buffer.from(JSON.stringify(VECTOR.request), 'utf8');
  return buildNativeFinalizedPegInCausalMintTransitionV3ResultCandidate({
    requestBytes,
    trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
    verification,
  });
}

function mutateByte(value: string, offset: number): string {
  const bytes = Buffer.from(value.slice(2), 'hex');
  bytes[offset] ^= 1;
  return `0x${bytes.toString('hex')}`;
}

function writeU64Le(value: string, offset: number, replacement: bigint): string {
  const bytes = Buffer.from(value.slice(2), 'hex');
  bytes.writeBigUInt64LE(replacement, offset);
  return `0x${bytes.toString('hex')}`;
}

function hash(byte: string, bytes = 32): string {
  return `0x${byte.repeat(bytes)}`;
}
