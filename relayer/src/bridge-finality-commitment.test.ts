import { readFileSync } from 'fs';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  AGGREGATE_FINALITY_COMMITMENT_V1_BYTES,
  AGGREGATE_FINALITY_COMMITMENT_V1_DOMAIN,
  buildAggregateFinalityCommitmentV1,
  decodeAggregateFinalityCommitmentV1,
  deriveAggregateFinalityCommitmentDigestHex,
} from './bridge-finality-commitment.js';
import {
  AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES,
  BRIDGE_FINALITY_STATEMENT_V1_BYTES,
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';

const vector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-finality-proof-v1.json', import.meta.url),
  'utf8',
));

function buildFixtureProof(payloadHex = vector.input.proof.payloadHex) {
  const statement = buildBridgeFinalityStatementV1({
    ...vector.input.statement,
  });
  return buildAggregateFinalityProofV1({
    ...vector.input.proof,
    encodedStatement: statement.encodedStatementHex,
    payload: payloadHex,
  });
}

function mutateByte(hex: string, offset: number, value?: number): string {
  const bytes = Buffer.from(hex, 'hex');
  bytes[offset] = value ?? (bytes[offset] ^ 0xff);
  return bytes.toString('hex');
}

describe('AggregateFinalityCommitmentV1', () => {
  it('roundtrips the exact proof prefix plus its verified full proof digest', () => {
    const proof = buildFixtureProof();
    const fromObject = buildAggregateFinalityCommitmentV1(proof);
    const fromEncoded = buildAggregateFinalityCommitmentV1(proof.encodedProofHex);
    const commitmentBytes = Buffer.from(fromObject.encodedCommitmentHex, 'hex');

    expect(fromObject).toEqual(fromEncoded);
    expect(commitmentBytes).toHaveLength(AGGREGATE_FINALITY_COMMITMENT_V1_BYTES);
    expect(commitmentBytes.subarray(0, AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES)
      .toString('hex')).toBe(
      proof.encodedProofHex.slice(0, AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES * 2),
    );
    expect(commitmentBytes.subarray(AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES)
      .toString('hex')).toBe(proof.proofDigestHex);
    expect(fromObject.verifierProfileIdHex).toBe(proof.verifierProfileIdHex);
    expect(fromObject.payloadDigestHex).toBe(proof.payloadDigestHex);
    expect(fromObject.proofDigestHex).toBe(proof.proofDigestHex);
    expect(fromObject.statement).toEqual(proof.statement);
    expect(decodeAggregateFinalityCommitmentV1(fromObject.encodedCommitmentHex))
      .toEqual(fromObject);
    expect(Object.isFrozen(fromObject)).toBe(true);
    expect(Object.isFrozen(fromObject.statement)).toBe(true);
    expect(Object.isFrozen(fromObject.trustBoundary)).toBe(true);
  });

  it('uses a deterministic domain-separated Blake2b-256 commitment digest', () => {
    const commitment = buildAggregateFinalityCommitmentV1(buildFixtureProof());
    const expected = Buffer.from(blakejs.blake2b(Buffer.concat([
      Buffer.from(AGGREGATE_FINALITY_COMMITMENT_V1_DOMAIN, 'ascii'),
      Buffer.from(commitment.encodedCommitmentHex, 'hex'),
    ]), undefined, 32)).toString('hex');

    expect(commitment.commitmentDigestHex).toBe(expected);
    expect(deriveAggregateFinalityCommitmentDigestHex(commitment.encodedCommitmentHex))
      .toBe(expected);
    expect(buildAggregateFinalityCommitmentV1(buildFixtureProof()).commitmentDigestHex)
      .toBe(expected);
  });

  it('rejects malformed commitment sizes and noncanonical hex', () => {
    const encoded = buildAggregateFinalityCommitmentV1(buildFixtureProof())
      .encodedCommitmentHex;

    expect(() => decodeAggregateFinalityCommitmentV1(encoded.slice(0, -2)))
      .toThrow(`must be ${AGGREGATE_FINALITY_COMMITMENT_V1_BYTES} bytes`);
    expect(() => decodeAggregateFinalityCommitmentV1(`${encoded}00`))
      .toThrow(`must be ${AGGREGATE_FINALITY_COMMITMENT_V1_BYTES} bytes`);
    expect(() => decodeAggregateFinalityCommitmentV1(`0x${encoded}`))
      .toThrow('canonical lowercase hex');
    expect(() => decodeAggregateFinalityCommitmentV1(encoded.toUpperCase()))
      .toThrow('canonical lowercase hex');
  });

  it.each([
    [0, 2, 'version'],
    [1, 3, 'proof system'],
    [2, 2, 'hash algorithm'],
    [3, 1, 'flags'],
  ])('rejects unsupported discriminator at byte %i', (offset, value, message) => {
    const encoded = buildAggregateFinalityCommitmentV1(buildFixtureProof())
      .encodedCommitmentHex;
    expect(() => decodeAggregateFinalityCommitmentV1(mutateByte(encoded, offset, value)))
      .toThrow(message);
  });

  it('keeps proof system ID 2 reserved', () => {
    const encoded = buildAggregateFinalityCommitmentV1(buildFixtureProof())
      .encodedCommitmentHex;
    expect(() => decodeAggregateFinalityCommitmentV1(mutateByte(encoded, 1, 2)))
      .toThrow('reserved and not activated');
  });

  it('rejects wrong statement and payload length metadata', () => {
    const encoded = buildAggregateFinalityCommitmentV1(buildFixtureProof())
      .encodedCommitmentHex;
    const wrongStatementLength = Buffer.from(encoded, 'hex');
    wrongStatementLength.writeUInt32BE(BRIDGE_FINALITY_STATEMENT_V1_BYTES - 1, 4);
    expect(() => decodeAggregateFinalityCommitmentV1(wrongStatementLength))
      .toThrow(`statement length must be ${BRIDGE_FINALITY_STATEMENT_V1_BYTES} bytes`);

    const zeroPayloadLength = Buffer.from(encoded, 'hex');
    zeroPayloadLength.writeUInt32BE(0, 8);
    expect(() => decodeAggregateFinalityCommitmentV1(zeroPayloadLength))
      .toThrow('positive uint32');

    const excessivePayloadLength = Buffer.from(encoded, 'hex');
    excessivePayloadLength.writeUInt32BE(MAX_NATIVE_VERIFIER_REQUEST_BYTES + 1, 8);
    expect(() => decodeAggregateFinalityCommitmentV1(excessivePayloadLength))
      .toThrow(`exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`);
  });

  it('accepts the exact native verifier request bound', () => {
    const encoded = Buffer.from(
      buildAggregateFinalityCommitmentV1(buildFixtureProof()).encodedCommitmentHex,
      'hex',
    );
    encoded.writeUInt32BE(MAX_NATIVE_VERIFIER_REQUEST_BYTES, 8);

    expect(decodeAggregateFinalityCommitmentV1(encoded).payloadLength)
      .toBe(MAX_NATIVE_VERIFIER_REQUEST_BYTES);
  });

  it('rejects statement digest and nested statement, checkpoint, and program mutations', () => {
    const encoded = buildAggregateFinalityCommitmentV1(buildFixtureProof())
      .encodedCommitmentHex;
    expect(() => decodeAggregateFinalityCommitmentV1(mutateByte(encoded, 44)))
      .toThrow('statement digest');
    expect(() => decodeAggregateFinalityCommitmentV1(mutateByte(encoded, 108, 2)))
      .toThrow('statement version');
    expect(() => decodeAggregateFinalityCommitmentV1(mutateByte(encoded, 108 + 4 + 10)))
      .toThrow('checkpoint commitment');
    expect(() => decodeAggregateFinalityCommitmentV1(mutateByte(encoded, 108 + 220)))
      .toThrow('checkpoint commitment');
    expect(() => decodeAggregateFinalityCommitmentV1(mutateByte(encoded, 108 + 324)))
      .toThrow('program ID');
  });

  it('changes commitment metadata when the full proof payload changes', () => {
    const baselineProof = buildFixtureProof();
    const changedPayloadHex = mutateByte(
      baselineProof.payloadHex,
      baselineProof.payloadHex.length / 2 - 1,
    );
    const changedProof = buildFixtureProof(changedPayloadHex);
    const baseline = buildAggregateFinalityCommitmentV1(baselineProof);
    const changed = buildAggregateFinalityCommitmentV1(changedProof);

    expect(changed.payloadLength).toBe(baseline.payloadLength);
    expect(changed.verifierProfileIdHex).toBe(baseline.verifierProfileIdHex);
    expect(changed.statement).toEqual(baseline.statement);
    expect(changed.payloadDigestHex).not.toBe(baseline.payloadDigestHex);
    expect(changed.proofDigestHex).not.toBe(baseline.proofDigestHex);
    expect(changed.encodedCommitmentHex).not.toBe(baseline.encodedCommitmentHex);
    expect(changed.commitmentDigestHex).not.toBe(baseline.commitmentDigestHex);
  });

  it('makes the missing-payload trust boundary explicit during decode', () => {
    const encoded = buildAggregateFinalityCommitmentV1(buildFixtureProof())
      .encodedCommitmentHex;
    const metadataOnlyMutation = mutateByte(mutateByte(encoded, 76), 464);
    const decoded = decodeAggregateFinalityCommitmentV1(metadataOnlyMutation);

    expect(decoded.trustBoundary).toEqual({
      kind: 'proof-identity-commitment-only',
      statementValidated: true,
      payloadAvailable: false,
      payloadDigestVerifiedFromCommitment: false,
      fullProofDigestVerifiedFromCommitment: false,
      proofValidityEstablished: false,
      trustlessVerificationEstablished: false,
      onChainVerificationEstablished: false,
    });
  });

  it('refuses to build from proof bytes whose payload digest was not verified', () => {
    const proof = buildFixtureProof();
    expect(() => buildAggregateFinalityCommitmentV1(
      mutateByte(proof.encodedProofHex, 76),
    )).toThrow('payload digest');
  });
});
