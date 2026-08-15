import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  buildBridgeCheckpointCommitmentV1,
  decodeBridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';

import {
  BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES,
  BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN,
  BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_MAX_BURNS,
  EIP0045_ERGO_STATEMENT_V1_DOMAIN,
  EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES,
  assertBridgeValidityFinalityPayloadV2Matches,
  assertEip0045BridgeValidityStatementV1Matches,
  buildBridgeValidityFinalityPayloadV2,
  buildEip0045BridgeValidityStatementV1,
  decodeBridgeValidityFinalityPayloadV2,
  decodeEip0045BridgeValidityStatementV1,
  deriveEip0045ContractIdHex,
} from './bridge-validity-finality-statement-v2.js';

const compatibilityVector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-finality-proof-v1.json', import.meta.url),
  'utf8',
));
const goldenVector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-validity-finality-statement-v2.json', import.meta.url),
  'utf8',
));

const payloadInput = Object.freeze({
  trackerNftIdHex: goldenVector.input.trackerNftIdHex as string,
  encodedCompatibilityAggregateProofV1:
    compatibilityVector.expected.encodedProofHex as string,
});

const statementInput = Object.freeze({
  chainDomainIdHex: goldenVector.input.chainDomainIdHex as string,
  profileIdHex: goldenVector.input.profileIdHex as string,
  programIdHex: goldenVector.input.programIdHex as string,
  contractPropositionBytes: goldenVector.input.contractPropositionBytesHex as string,
});

function buildPayload() {
  return buildBridgeValidityFinalityPayloadV2(payloadInput);
}

function buildStatement() {
  const payload = buildPayload();
  return buildEip0045BridgeValidityStatementV1({
    ...statementInput,
    applicationPayload: payload.encodedPayloadHex,
  });
}

function mutateByte(hex: string, offset: number, value: number): string {
  const bytes = Buffer.from(hex, 'hex');
  bytes[offset] = value;
  return bytes.toString('hex');
}

describe('BridgeValidityFinalityPayloadV2', () => {
  it('binds the tracker, frozen V1 compatibility identity, native request, checkpoint and 0x0401 value', () => {
    const payload = buildPayload();
    const decoded = decodeBridgeValidityFinalityPayloadV2(payload.encodedPayloadHex);

    expect(Buffer.from(payload.encodedPayloadHex, 'hex'))
      .toHaveLength(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES);
    expect(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN)
      .toBe(goldenVector.domains.applicationPayload);
    expect(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES)
      .toBe(goldenVector.expected.applicationPayloadBytes);
    expect(payload.encodedPayloadHex).toBe(goldenVector.expected.encodedPayloadHex);
    expect(payload.payloadDigestHex).toBe(goldenVector.expected.payloadDigestHex);
    expect(decoded).toEqual(payload);
    expect(payload.trackerNftIdHex).toBe(payloadInput.trackerNftIdHex);
    expect(payload.encodedCheckpointHex)
      .toBe(compatibilityVector.input.statement.encodedCheckpointHex);
    expect(payload.checkpointCommitmentHex)
      .toBe(compatibilityVector.input.statement.checkpointCommitmentHex);
    expect(payload.compatibilityStatementV1DigestHex)
      .toBe(compatibilityVector.expected.statementDigestHex);
    expect(payload.compatibilityStatementV1DigestHex)
      .toBe(goldenVector.expected.compatibilityStatementV1DigestHex);
    expect(payload.compatibilitySemanticProgramIdHex)
      .toBe(compatibilityVector.expected.programIdHex);
    expect(payload.compatibilitySemanticProgramIdHex)
      .toBe(goldenVector.expected.compatibilitySemanticProgramIdHex);
    expect(payload.compatibilityVerifierProfileIdHex)
      .toBe(compatibilityVector.input.proof.verifierProfileIdHex);
    expect(payload.compatibilityVerifierProfileIdHex)
      .toBe(goldenVector.expected.compatibilityVerifierProfileIdHex);
    expect(payload.compatibilityPayloadDigestHex)
      .toBe(compatibilityVector.expected.payloadDigestHex);
    expect(payload.compatibilityPayloadDigestHex)
      .toBe(goldenVector.expected.compatibilityPayloadDigestHex);
    expect(payload.compatibilityAggregateProofDigestHex)
      .toBe(compatibilityVector.expected.proofDigestHex);
    expect(payload.compatibilityAggregateProofDigestHex)
      .toBe(goldenVector.expected.compatibilityAggregateProofDigestHex);
    expect(payload.nativeVerifierRequestDigestHex)
      .toBe(goldenVector.expected.nativeVerifierRequestDigestHex);
    expect(payload.trustedAnchorDigestHex)
      .toBe(compatibilityVector.input.statement.trustedAnchorDigestHex);
    expect(payload.finalityHorizonHeight)
      .toBe(compatibilityVector.input.statement.finalityHorizonHeight);
    expect(payload.finalityHorizonHashHex)
      .toBe(compatibilityVector.input.statement.finalityHorizonHashHex);
    expect(payload.extensionKeyHex).toBe('0401');
    expect(payload.extensionValueHex).toBe(
      `${payload.checkpoint.bridgeEventRootHex}${payload.checkpointCommitmentHex}`,
    );
    expect(payload.extensionValueHex).toBe(goldenVector.expected.extensionValueHex);
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload.checkpoint)).toBe(true);
  });

  it('rejects discriminator, checkpoint commitment, extension-key and extension-value mutations', () => {
    const payload = buildPayload();
    const discriminatorOffset = Buffer.byteLength(
      BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN,
      'ascii',
    ) + 1;
    const checkpointOffset = payload.encodedPayloadHex.indexOf(payload.encodedCheckpointHex) / 2;
    const commitmentOffset = checkpointOffset + 216;
    const extensionKeyOffset = BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES - 66;
    const extensionValueOffset = BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES - 64;

    expect(() => decodeBridgeValidityFinalityPayloadV2(
      mutateByte(payload.encodedPayloadHex, 0, 0xff),
    )).toThrow('domain');
    for (const [offset, value, message] of [
      [discriminatorOffset, 1, 'version'],
      [discriminatorOffset + 1, 2, 'hash algorithm'],
      [discriminatorOffset + 2, 2, 'source profile'],
      [discriminatorOffset + 3, 1, 'flags'],
    ] as const) {
      expect(() => decodeBridgeValidityFinalityPayloadV2(
        mutateByte(payload.encodedPayloadHex, offset, value),
      )).toThrow(message);
    }
    expect(() => decodeBridgeValidityFinalityPayloadV2(
      mutateByte(payload.encodedPayloadHex, checkpointOffset + 100, 0xff),
    )).toThrow('checkpoint commitment');
    expect(() => decodeBridgeValidityFinalityPayloadV2(
      mutateByte(payload.encodedPayloadHex, commitmentOffset, 0xff),
    )).toThrow('checkpoint commitment');
    expect(() => decodeBridgeValidityFinalityPayloadV2(
      mutateByte(payload.encodedPayloadHex, extensionKeyOffset, 0xff),
    )).toThrow('extension key');
    expect(() => decodeBridgeValidityFinalityPayloadV2(
      mutateByte(payload.encodedPayloadHex, extensionValueOffset, 0xff),
    )).toThrow('extension value');
  });

  it('keeps externally deciding tracker, compatibility and request identities fail-closed', () => {
    const payload = buildPayload();
    const alternateProfileProof = buildAggregateFinalityProofV1({
      verifierProfileIdHex: '83'.repeat(32),
      encodedStatement: compatibilityVector.expected.encodedStatementHex,
      payload: compatibilityVector.input.proof.payloadHex,
    });
    const alternateRequestProof = buildAggregateFinalityProofV1({
      verifierProfileIdHex: compatibilityVector.input.proof.verifierProfileIdHex,
      encodedStatement: compatibilityVector.expected.encodedStatementHex,
      payload: mutateByte(compatibilityVector.input.proof.payloadHex, 0, 0xff),
    });
    const mutations = [
      { ...payloadInput, trackerNftIdHex: '92'.repeat(32) },
      {
        ...payloadInput,
        encodedCompatibilityAggregateProofV1: alternateProfileProof.encodedProofHex,
      },
      {
        ...payloadInput,
        encodedCompatibilityAggregateProofV1: alternateRequestProof.encodedProofHex,
      },
    ];
    for (const mutation of mutations) {
      expect(() => assertBridgeValidityFinalityPayloadV2Matches(
        payload.encodedPayloadHex,
        mutation,
      )).toThrow('expected binding');
    }
  });

  it('rejects malformed input without treating the compatibility V1 digest as proof validity', () => {
    expect(() => buildBridgeValidityFinalityPayloadV2({
      ...payloadInput,
      trackerNftIdHex: `0x${payloadInput.trackerNftIdHex}`,
    })).toThrow('lowercase unprefixed hex');
    expect(() => buildBridgeValidityFinalityPayloadV2({
      ...payloadInput,
      encodedCompatibilityAggregateProofV1:
        payloadInput.encodedCompatibilityAggregateProofV1.slice(0, -2),
    })).toThrow();
    expect(() => decodeBridgeValidityFinalityPayloadV2(
      buildPayload().encodedPayloadHex.slice(0, -2),
    )).toThrow('must be');
    expect(() => decodeBridgeValidityFinalityPayloadV2(
      `${buildPayload().encodedPayloadHex}00`,
    )).toThrow('must be');
  });

  it('keeps the V2 validity profile aligned with the tracker 256-burn bound', () => {
    const originalCheckpoint = decodeBridgeCheckpointV1(
      compatibilityVector.input.statement.encodedCheckpointHex,
    );
    const oversizedCheckpoint = buildBridgeCheckpointCommitmentV1({
      ...originalCheckpoint,
      burnLeafCount: BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_MAX_BURNS + 1,
    });
    const oversizedStatement = buildBridgeFinalityStatementV1({
      ...compatibilityVector.input.statement,
      encodedCheckpointHex: oversizedCheckpoint.encodedCheckpointHex,
      checkpointCommitmentHex: oversizedCheckpoint.checkpointCommitmentHex,
    });
    const oversizedProof = buildAggregateFinalityProofV1({
      verifierProfileIdHex: compatibilityVector.input.proof.verifierProfileIdHex,
      encodedStatement: oversizedStatement.encodedStatementHex,
      payload: compatibilityVector.input.proof.payloadHex,
    });

    expect(() => buildBridgeValidityFinalityPayloadV2({
      ...payloadInput,
      encodedCompatibilityAggregateProofV1: oversizedProof.encodedProofHex,
    })).toThrow('burnLeafCount exceeds 256');

    const payload = buildPayload();
    const checkpointOffset = payload.encodedPayloadHex.indexOf(payload.encodedCheckpointHex) / 2;
    const bytes = Buffer.from(payload.encodedPayloadHex, 'hex');
    bytes.writeUInt32BE(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_MAX_BURNS + 1, checkpointOffset + 140);
    expect(() => decodeBridgeValidityFinalityPayloadV2(bytes)).toThrow(
      'burnLeafCount exceeds 256',
    );
  });
});

describe('EIP-0045 ErgoStatementV1 bridge binding', () => {
  it('uses the exact 159-byte fixed prefix and little-endian payload length', () => {
    const statement = buildStatement();
    const bytes = Buffer.from(statement.encodedStatementHex, 'hex');
    const payload = buildPayload();

    expect(EIP0045_ERGO_STATEMENT_V1_DOMAIN).toBe('Ergo.VerifyStark.Statement');
    expect(EIP0045_ERGO_STATEMENT_V1_DOMAIN).toBe(goldenVector.domains.eip0045Statement);
    expect(bytes.subarray(0, 26).toString('ascii')).toBe(EIP0045_ERGO_STATEMENT_V1_DOMAIN);
    expect(bytes[26]).toBe(1);
    expect(bytes.subarray(27, 59).toString('hex')).toBe(statementInput.chainDomainIdHex);
    expect(bytes.subarray(59, 91).toString('hex')).toBe(statementInput.profileIdHex);
    expect(bytes.subarray(91, 123).toString('hex')).toBe(statementInput.programIdHex);
    expect(bytes.subarray(123, 155).toString('hex')).toBe(statement.contractIdHex);
    expect(bytes.readUInt32LE(155)).toBe(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES);
    expect(bytes.subarray(EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES).toString('hex'))
      .toBe(payload.encodedPayloadHex);
    expect(bytes).toHaveLength(
      EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES + BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES,
    );
    expect(bytes).toHaveLength(goldenVector.expected.statementBytes);
    expect(bytes.subarray(0, EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES).toString('hex'))
      .toBe(goldenVector.expected.statementPrefixHex);
    expect(statement.encodedStatementHex).toBe(
      `${goldenVector.expected.statementPrefixHex}${goldenVector.expected.encodedPayloadHex}`,
    );
    expect(statement.statementDigestHex).toBe(goldenVector.expected.statementDigestHex);
    expect(statement.contractIdHex)
      .toBe(deriveEip0045ContractIdHex(statementInput.contractPropositionBytes));
    expect(statement.contractIdHex).toBe(goldenVector.expected.contractIdHex);
    expect(decodeEip0045BridgeValidityStatementV1(statement.encodedStatementHex))
      .toEqual(statement);
  });

  it('rejects outer domain, version, payload length, truncation and trailing bytes', () => {
    const statement = buildStatement();
    expect(() => decodeEip0045BridgeValidityStatementV1(
      mutateByte(statement.encodedStatementHex, 0, 0xff),
    )).toThrow('domain');
    expect(() => decodeEip0045BridgeValidityStatementV1(
      mutateByte(statement.encodedStatementHex, 26, 2),
    )).toThrow('version');
    expect(() => decodeEip0045BridgeValidityStatementV1(
      mutateByte(statement.encodedStatementHex, 155, 0xff),
    )).toThrow('payload length');
    expect(() => decodeEip0045BridgeValidityStatementV1(
      statement.encodedStatementHex.slice(0, -2),
    )).toThrow('total length');
    expect(() => decodeEip0045BridgeValidityStatementV1(
      `${statement.encodedStatementHex}00`,
    )).toThrow('total length');
  });

  it('requires exact settlement chain, profile, guest program, contract and payload bindings', () => {
    const statement = buildStatement();
    const payload = buildPayload();
    const base = {
      ...statementInput,
      applicationPayload: payload.encodedPayloadHex,
    };
    const mutations = [
      { ...base, chainDomainIdHex: 'a2'.repeat(32) },
      { ...base, profileIdHex: 'b3'.repeat(32) },
      { ...base, programIdHex: 'c4'.repeat(32) },
      { ...base, contractPropositionBytes: '0008ce'.padEnd(72, '4') },
      {
        ...base,
        applicationPayload: buildBridgeValidityFinalityPayloadV2({
          ...payloadInput,
          trackerNftIdHex: '92'.repeat(32),
        }).encodedPayloadHex,
      },
    ];
    for (const mutation of mutations) {
      expect(() => assertEip0045BridgeValidityStatementV1Matches(
        statement.encodedStatementHex,
        mutation,
      )).toThrow('expected binding');
    }
  });
});
