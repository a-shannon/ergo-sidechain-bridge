import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES,
  AGGREGATE_FINALITY_PROOF_V1_DOMAIN,
  BRIDGE_FINALITY_PROGRAM_ID_DOMAIN,
  BRIDGE_FINALITY_STATEMENT_V1_BYTES,
  BRIDGE_FINALITY_STATEMENT_V1_DOMAIN,
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
  NATIVE_GRANDPA_PROOF_PAYLOAD_V1_DOMAIN,
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
  decodeAggregateFinalityProofV1,
  decodeBridgeFinalityStatementV1,
  deriveAggregateFinalityProofDigestHex,
  deriveBridgeFinalityProgramIdHex,
  deriveBridgeFinalityStatementDigestHex,
  deriveNativeGrandpaProofPayloadDigestHex,
} from './bridge-finality-proof.js';

const vector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-finality-proof-v1.json', import.meta.url),
  'utf8',
));

function buildGoldenStatement() {
  return buildBridgeFinalityStatementV1({
    version: vector.input.statement.version,
    hashAlgorithmId: vector.input.statement.hashAlgorithmId,
    finalityRuleId: vector.input.statement.finalityRuleId,
    flags: vector.input.statement.flags,
    encodedCheckpointHex: vector.input.statement.encodedCheckpointHex,
    checkpointCommitmentHex: vector.input.statement.checkpointCommitmentHex,
    trustedAnchorDigestHex: vector.input.statement.trustedAnchorDigestHex,
    finalityHorizonHeight: vector.input.statement.finalityHorizonHeight,
    finalityHorizonHashHex: vector.input.statement.finalityHorizonHashHex,
  });
}

function buildGoldenProof() {
  const statement = buildGoldenStatement();
  return buildAggregateFinalityProofV1({
    version: vector.input.proof.version,
    proofSystemId: vector.input.proof.proofSystemId,
    hashAlgorithmId: vector.input.proof.hashAlgorithmId,
    flags: vector.input.proof.flags,
    verifierProfileIdHex: vector.input.proof.verifierProfileIdHex,
    encodedStatement: statement.encodedStatementHex,
    payload: vector.input.proof.payloadHex,
  });
}

function mutateByte(hex: string, offset: number, value: number): string {
  const bytes = Buffer.from(hex, 'hex');
  bytes[offset] = value;
  return bytes.toString('hex');
}

describe('BridgeFinalityStatementV1', () => {
  it('reproduces the frozen 356-byte golden statement and all domain-separated digests', () => {
    const statement = buildGoldenStatement();

    expect(BRIDGE_FINALITY_PROGRAM_ID_DOMAIN).toBe(vector.domains.programId);
    expect(BRIDGE_FINALITY_STATEMENT_V1_DOMAIN).toBe(vector.domains.statement);
    expect(NATIVE_GRANDPA_PROOF_PAYLOAD_V1_DOMAIN).toBe(vector.domains.nativePayload);
    expect(AGGREGATE_FINALITY_PROOF_V1_DOMAIN).toBe(vector.domains.aggregateProof);
    expect(statement.programIdHex).toBe(vector.expected.programIdHex);
    expect(statement.encodedStatementHex).toBe(vector.expected.encodedStatementHex);
    expect(statement.statementDigestHex).toBe(vector.expected.statementDigestHex);
    expect(Buffer.from(statement.encodedStatementHex, 'hex'))
      .toHaveLength(BRIDGE_FINALITY_STATEMENT_V1_BYTES);
    expect(deriveBridgeFinalityProgramIdHex()).toBe(vector.expected.programIdHex);
    expect(deriveBridgeFinalityStatementDigestHex(statement.encodedStatementHex))
      .toBe(vector.expected.statementDigestHex);
    expect(decodeBridgeFinalityStatementV1(statement.encodedStatementHex)).toEqual(statement);
    expect(Object.isFrozen(statement)).toBe(true);
    expect(Object.isFrozen(statement.checkpoint)).toBe(true);
  });

  it.each([
    [0, 2, 'version'],
    [1, 2, 'hash algorithm'],
    [2, 2, 'finality rule'],
    [3, 1, 'flags'],
  ])('rejects unsupported fixed statement byte %i', (offset, value, message) => {
    expect(() => decodeBridgeFinalityStatementV1(
      mutateByte(vector.expected.encodedStatementHex, offset, value),
    )).toThrow(message);
  });

  it('rejects the wrong program ID and any invalid checkpoint commitment', () => {
    expect(() => decodeBridgeFinalityStatementV1(
      mutateByte(vector.expected.encodedStatementHex, 324, 0xff),
    )).toThrow('program ID');
    expect(() => buildBridgeFinalityStatementV1({
      ...vector.input.statement,
      checkpointCommitmentHex: '00'.repeat(32),
    })).toThrow('checkpoint commitment');
    expect(() => decodeBridgeFinalityStatementV1(
      mutateByte(vector.expected.encodedStatementHex, 40, 0xff),
    )).toThrow('checkpoint commitment');
    expect(() => decodeBridgeFinalityStatementV1(
      mutateByte(vector.expected.encodedStatementHex, 220, 0xff),
    )).toThrow('checkpoint commitment');
  });

  it('rejects uint64 overflow and noncanonical finality horizon integers', () => {
    const base = vector.input.statement;
    for (const finalityHorizonHeight of [
      '-1',
      '01',
      '18446744073709551616',
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => buildBridgeFinalityStatementV1({
        ...base,
        finalityHorizonHeight,
      })).toThrow('finalityHorizonHeight');
    }
    expect(buildBridgeFinalityStatementV1({
      ...base,
      finalityHorizonHeight: '18446744073709551615',
    }).finalityHorizonHeight).toBe('18446744073709551615');
    expect(() => buildBridgeFinalityStatementV1({
      ...base,
      finalityHorizonHeight: '1'.repeat(100_000),
    })).toThrow('must fit uint64');
  });

  it('binds the trusted anchor and finality horizon fields independently', () => {
    const baseline = buildGoldenStatement();
    const mutations = [
      { ...vector.input.statement, trustedAnchorDigestHex: 'ac'.repeat(32) },
      { ...vector.input.statement, finalityHorizonHeight: '2049' },
      { ...vector.input.statement, finalityHorizonHashHex: 'ce'.repeat(32) },
    ];
    for (const mutation of mutations) {
      const changed = buildBridgeFinalityStatementV1(mutation);
      expect(changed.encodedStatementHex).not.toBe(baseline.encodedStatementHex);
      expect(changed.statementDigestHex).not.toBe(baseline.statementDigestHex);
    }
  });

  it('rejects malformed hex, truncation, trailing bytes, and non-byte strings', () => {
    const base = vector.input.statement;
    expect(() => buildBridgeFinalityStatementV1({
      ...base,
      trustedAnchorDigestHex: 'gg'.repeat(32),
    })).toThrow('trustedAnchorDigest');
    expect(() => buildBridgeFinalityStatementV1({
      ...base,
      finalityHorizonHashHex: '00',
    })).toThrow('finalityHorizonHash');
    expect(() => decodeBridgeFinalityStatementV1(
      vector.expected.encodedStatementHex.slice(0, -2),
    )).toThrow(`must be ${BRIDGE_FINALITY_STATEMENT_V1_BYTES} bytes`);
    expect(() => decodeBridgeFinalityStatementV1(
      `${vector.expected.encodedStatementHex}00`,
    )).toThrow(`must be ${BRIDGE_FINALITY_STATEMENT_V1_BYTES} bytes`);
    expect(() => decodeBridgeFinalityStatementV1('abc')).toThrow('whole bytes');
    expect(() => decodeBridgeFinalityStatementV1(
      `0x${vector.expected.encodedStatementHex}`,
    )).toThrow('canonical lowercase hex');
    expect(() => decodeBridgeFinalityStatementV1(
      vector.expected.encodedStatementHex.toUpperCase(),
    )).toThrow('canonical lowercase hex');
    expect(() => decodeBridgeFinalityStatementV1(
      Buffer.alloc(BRIDGE_FINALITY_STATEMENT_V1_BYTES + 1),
    )).toThrow(`must be ${BRIDGE_FINALITY_STATEMENT_V1_BYTES} bytes`);
    expect(() => buildBridgeFinalityStatementV1({
      ...base,
      trustedAnchorDigestHex: '00'.repeat(33),
    })).toThrow('trustedAnchorDigest must be 32 bytes');
  });
});

describe('AggregateFinalityProofV1', () => {
  it('reproduces the fixed 464-byte prefix plus native payload golden vector', () => {
    const proof = buildGoldenProof();

    expect(proof.encodedProofHex).toBe(vector.expected.encodedProofHex);
    expect(proof.statementDigestHex).toBe(vector.expected.statementDigestHex);
    expect(proof.payloadDigestHex).toBe(vector.expected.payloadDigestHex);
    expect(proof.proofDigestHex).toBe(vector.expected.proofDigestHex);
    expect(proof.payloadHex).toBe(vector.input.proof.payloadHex);
    expect(Buffer.from(proof.encodedProofHex, 'hex')).toHaveLength(
      AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES + vector.input.proof.payloadHex.length / 2,
    );
    expect(deriveNativeGrandpaProofPayloadDigestHex(proof.payloadHex))
      .toBe(vector.expected.payloadDigestHex);
    expect(deriveAggregateFinalityProofDigestHex(proof.encodedProofHex))
      .toBe(vector.expected.proofDigestHex);
    expect(decodeAggregateFinalityProofV1(proof.encodedProofHex)).toEqual(proof);
    expect(Object.isFrozen(proof)).toBe(true);
    expect(Object.isFrozen(proof.statement)).toBe(true);
    expect(Object.isFrozen(proof.statement.checkpoint)).toBe(true);
  });

  it.each([
    [0, 2, 'version'],
    [1, 2, 'proof system'],
    [1, 3, 'proof system'],
    [2, 2, 'hash algorithm'],
    [3, 1, 'flags'],
  ])('rejects unsupported fixed proof byte %i value %i', (offset, value, message) => {
    expect(() => decodeAggregateFinalityProofV1(
      mutateByte(vector.expected.encodedProofHex, offset, value),
    )).toThrow(message);
  });

  it('fails closed for reserved activated-STARK mode 2 in builders and decoders', () => {
    expect(() => buildAggregateFinalityProofV1({
      ...vector.input.proof,
      proofSystemId: 2,
      encodedStatement: vector.expected.encodedStatementHex,
      payload: vector.input.proof.payloadHex,
    })).toThrow('reserved');
    expect(() => decodeAggregateFinalityProofV1(
      mutateByte(vector.expected.encodedProofHex, 1, 2),
    )).toThrow('reserved');
  });

  it('rejects statement and payload length mismatch, overflow bounds, and trailing bytes', () => {
    const wrongStatementLength = Buffer.from(vector.expected.encodedProofHex, 'hex');
    wrongStatementLength.writeUInt32BE(BRIDGE_FINALITY_STATEMENT_V1_BYTES - 1, 4);
    expect(() => decodeAggregateFinalityProofV1(wrongStatementLength))
      .toThrow(`statement length must be ${BRIDGE_FINALITY_STATEMENT_V1_BYTES}`);

    const wrongPayloadLength = Buffer.from(vector.expected.encodedProofHex, 'hex');
    wrongPayloadLength.writeUInt32BE(vector.input.proof.payloadHex.length / 2 + 1, 8);
    expect(() => decodeAggregateFinalityProofV1(wrongPayloadLength)).toThrow('payload length mismatch');

    const excessivePayloadLength = Buffer.from(vector.expected.encodedProofHex, 'hex');
    excessivePayloadLength.writeUInt32BE(MAX_NATIVE_VERIFIER_REQUEST_BYTES + 1, 8);
    expect(() => decodeAggregateFinalityProofV1(excessivePayloadLength))
      .toThrow(`exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`);

    expect(() => decodeAggregateFinalityProofV1(Buffer.alloc(
      AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES
        + MAX_NATIVE_VERIFIER_REQUEST_BYTES
        + 1,
    ))).toThrow('encoded aggregate finality proof exceeds');

    expect(() => decodeAggregateFinalityProofV1(
      vector.expected.encodedProofHex.slice(0, -2),
    )).toThrow('payload length mismatch');
    expect(() => decodeAggregateFinalityProofV1(
      `${vector.expected.encodedProofHex}00`,
    )).toThrow('payload length mismatch');
    expect(() => decodeAggregateFinalityProofV1('00')).toThrow('at least');

    expect(() => buildAggregateFinalityProofV1({
      ...vector.input.proof,
      encodedStatement: vector.expected.encodedStatementHex,
      payload: Buffer.alloc(0),
    })).toThrow('positive uint32');
  });

  it('bounds raw payload buffers and hex strings before normalization', () => {
    const encodedStatement = buildGoldenStatement().encodedStatementHex;
    const oversizedBuffer = Buffer.alloc(MAX_NATIVE_VERIFIER_REQUEST_BYTES + 1);
    const oversizedHex = '00'.repeat(MAX_NATIVE_VERIFIER_REQUEST_BYTES + 1);
    for (const payload of [oversizedBuffer, oversizedHex]) {
      expect(() => deriveNativeGrandpaProofPayloadDigestHex(payload))
        .toThrow(`exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`);
      expect(() => buildAggregateFinalityProofV1({
        ...vector.input.proof,
        encodedStatement,
        payload,
      })).toThrow(`exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`);
    }
  });

  it('rejects statement digest, payload digest, and nested statement drift independently', () => {
    expect(() => decodeAggregateFinalityProofV1(
      mutateByte(vector.expected.encodedProofHex, 44, 0xff),
    )).toThrow('statement digest');
    expect(() => decodeAggregateFinalityProofV1(
      mutateByte(vector.expected.encodedProofHex, 76, 0xff),
    )).toThrow('payload digest');
    expect(() => decodeAggregateFinalityProofV1(
      mutateByte(vector.expected.encodedProofHex, 108 + 220, 0xff),
    )).toThrow('checkpoint commitment');
  });

  it('binds the verifier profile, statement, and payload as separate proof fields', () => {
    const baseline = buildGoldenProof();
    const alternateProfile = buildAggregateFinalityProofV1({
      ...vector.input.proof,
      verifierProfileIdHex: '01'.repeat(32),
      encodedStatement: vector.expected.encodedStatementHex,
      payload: vector.input.proof.payloadHex,
    });
    expect(alternateProfile.encodedProofHex).not.toBe(baseline.encodedProofHex);
    expect(alternateProfile.statementDigestHex).toBe(baseline.statementDigestHex);
    expect(alternateProfile.payloadDigestHex).toBe(baseline.payloadDigestHex);

    const alternateStatement = buildBridgeFinalityStatementV1({
      ...vector.input.statement,
      finalityHorizonHeight: '2049',
    });
    const statementBound = buildAggregateFinalityProofV1({
      ...vector.input.proof,
      encodedStatement: alternateStatement.encodedStatementHex,
      payload: vector.input.proof.payloadHex,
    });
    expect(statementBound.statementDigestHex).not.toBe(baseline.statementDigestHex);
    expect(statementBound.payloadDigestHex).toBe(baseline.payloadDigestHex);

    const payloadBound = buildAggregateFinalityProofV1({
      ...vector.input.proof,
      encodedStatement: vector.expected.encodedStatementHex,
      payload: `${vector.input.proof.payloadHex.slice(0, -2)}40`,
    });
    expect(payloadBound.statementDigestHex).toBe(baseline.statementDigestHex);
    expect(payloadBound.payloadDigestHex).not.toBe(baseline.payloadDigestHex);
  });

  it('rejects malformed profile, statement, and payload hex without retaining mutable buffers', () => {
    const base = vector.input.proof;
    expect(() => buildAggregateFinalityProofV1({
      ...base,
      verifierProfileIdHex: 'xz'.repeat(32),
      encodedStatement: vector.expected.encodedStatementHex,
      payload: base.payloadHex,
    })).toThrow('verifierProfileId');
    expect(() => buildAggregateFinalityProofV1({
      ...base,
      encodedStatement: '00',
      payload: base.payloadHex,
    })).toThrow(`must be ${BRIDGE_FINALITY_STATEMENT_V1_BYTES} bytes`);
    expect(() => buildAggregateFinalityProofV1({
      ...base,
      encodedStatement: vector.expected.encodedStatementHex,
      payload: 'abc',
    })).toThrow('whole bytes');

    const payload = Buffer.from(base.payloadHex, 'hex');
    const proof = buildAggregateFinalityProofV1({
      ...base,
      encodedStatement: Buffer.from(vector.expected.encodedStatementHex, 'hex'),
      payload,
    });
    payload.fill(0);
    expect(proof.payloadHex).toBe(base.payloadHex);
  });

  it('keeps the native evidence claim boundary explicit in the vector', () => {
    expect(vector.claimBoundary).toEqual({
      syntheticData: true,
      nativeEnvelopeOffChainEvidenceOnly: true,
      ergoOnChainAcceptanceProven: false,
      gate5Closed: false,
      trustless: false,
      productionReady: false,
    });
  });

  it('keeps the codec independent from runtime, environment, network, and signing state', () => {
    const source = readFileSync(
      new URL(
        './profiles/substrate-grandpa-v1/bridge-finality-proof.ts',
        import.meta.url,
      ),
      'utf8',
    );
    for (const forbidden of [
      'process.env',
      "from 'fs'",
      "from 'child_process'",
      "from 'axios'",
      'fetch(',
      'deployed_state',
      'fleet-signer',
      'native-finalized-bridge-checkpoint',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
