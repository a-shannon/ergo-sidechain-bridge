import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED,
} from './bridge-finality-proof.js';
import {
  EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-consumer-contract-v1.js';
import {
  buildEip0045BridgeValidityStatementV1,
} from './bridge-validity-finality-statement-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_CONSUMER_CHILD_ORDER,
  EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_MAX_CONTRACT_PROPOSITION_BYTES,
  EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES,
  EIP0045_BRIDGE_VALIDITY_PROOF_ENVELOPE_V1_SCHEMA,
  EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES,
  assertEip0045BridgeValidityProofEnvelopeV1Matches,
  buildEip0045BridgeValidityProofEnvelopeV1,
  type Eip0045BridgeValidityProofEnvelopeV1Input,
} from './bridge-validity-proof-envelope-v1.js';

const statementVector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-validity-finality-statement-v2.json', import.meta.url),
  'utf8',
));

const EXPECTED_RAW_SEAL_DIGEST_HEX =
  '87ad21b3a4a095d1cf10d57207d3e71d8e4f918bfdf0952bd85e11a9e817942a';
const EXPECTED_STATEMENT_DIGEST_HEX =
  '508fc797665dc89bc8963a419458b3e5b887d6e7c0ef31174cf1948769e1214c';

function proofChunks(): readonly Buffer[] {
  return EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.map(
    (length, index) => Buffer.alloc(length, (index + 1) * 0x11),
  );
}

function fixtureInput(
  overrides: Partial<Eip0045BridgeValidityProofEnvelopeV1Input> = {},
): Eip0045BridgeValidityProofEnvelopeV1Input {
  const applicationPayload = statementVector.expected.encodedPayloadHex as string;
  const statement = buildEip0045BridgeValidityStatementV1({
    chainDomainIdHex: statementVector.input.chainDomainIdHex,
    profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    contractPropositionBytes: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
    applicationPayload,
  });
  return {
    proofChunks: proofChunks(),
    applicationPayload,
    programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    encodedStatement: statement.encodedStatementHex,
    chainDomainIdHex: statementVector.input.chainDomainIdHex,
    contractPropositionBytes: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
    ...overrides,
  };
}

function expectedContext() {
  return {
    chainDomainIdHex: statementVector.input.chainDomainIdHex as string,
    contractPropositionBytes: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
    rawSealDigestHex: EXPECTED_RAW_SEAL_DIGEST_HEX,
  };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('EIP-0045 bridge validity proof envelope V1', () => {
  it('freezes the exact preactivation profile and four-child consumer ABI', () => {
    const envelope = buildEip0045BridgeValidityProofEnvelopeV1(fixtureInput());

    expect(EIP0045_BRIDGE_VALIDITY_PROOF_ENVELOPE_V1_SCHEMA)
      .toBe('e2s.bridge-validity-proof-envelope.v1');
    expect(EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX)
      .toBe('23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383');
    expect(EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX)
      .toBe('5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934');
    expect(EIP0045_BRIDGE_VALIDITY_CONSUMER_CHILD_ORDER).toEqual([
      'proofChunks',
      'applicationPayload',
      'programId',
      'profileId',
    ]);
    expect(EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES).toEqual([
      65_535,
      65_535,
      65_535,
      26_063,
    ]);
    expect(EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES).toBe(222_668);

    expect(envelope.schema).toBe(EIP0045_BRIDGE_VALIDITY_PROOF_ENVELOPE_V1_SCHEMA);
    expect(envelope.version).toBe(1);
    expect(envelope.consumerAbi.proofChunksHex.map((chunk) => chunk.length / 2))
      .toEqual(EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES);
    expect(envelope.consumerAbi.applicationPayloadHex)
      .toBe(statementVector.expected.encodedPayloadHex);
    expect(envelope.consumerAbi.programIdHex)
      .toBe(EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX);
    expect(envelope.consumerAbi.profileIdHex)
      .toBe(EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX);
    expect(envelope.chainDomainIdHex).toBe(statementVector.input.chainDomainIdHex);
    expect(envelope.contractIdHex).toBe(EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX);
    expect(envelope.statementDigestHex).toBe(EXPECTED_STATEMENT_DIGEST_HEX);
    expect(envelope.rawSealBytes).toBe(EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES);
    expect(envelope.rawSealDigestHex).toBe(EXPECTED_RAW_SEAL_DIGEST_HEX);
    expect(envelope).not.toHaveProperty('proofSystemId');
  });

  it('normalizes byte buffers and canonical lowercase hex to one immutable object', () => {
    const bufferInput = fixtureInput();
    const hexInput = fixtureInput({
      proofChunks: bufferInput.proofChunks.map((chunk) => Buffer.from(chunk).toString('hex')),
      applicationPayload: Buffer.from(
        bufferInput.applicationPayload as string,
        'hex',
      ),
      encodedStatement: Buffer.from(bufferInput.encodedStatement as string, 'hex'),
      contractPropositionBytes: Buffer.from(
        bufferInput.contractPropositionBytes as string,
        'hex',
      ),
    });

    const fromBuffers = buildEip0045BridgeValidityProofEnvelopeV1(bufferInput);
    const fromHex = buildEip0045BridgeValidityProofEnvelopeV1(hexInput);
    expect(fromHex).toEqual(fromBuffers);
    expect(Object.isFrozen(fromBuffers)).toBe(true);
    expect(Object.isFrozen(fromBuffers.consumerAbi)).toBe(true);
    expect(Object.isFrozen(fromBuffers.consumerAbi.proofChunksHex)).toBe(true);
    expect(Object.isFrozen(fromBuffers.trustBoundary)).toBe(true);
  });

  it('round-trips strict JSON only against an external chain, contract, and raw-seal identity', () => {
    const envelope = buildEip0045BridgeValidityProofEnvelopeV1(fixtureInput());

    expect(assertEip0045BridgeValidityProofEnvelopeV1Matches(
      jsonClone(envelope),
      expectedContext(),
    )).toEqual(envelope);
  });

  it('rejects wrong schema, version, derived fields, or authority claims', () => {
    const envelope = buildEip0045BridgeValidityProofEnvelopeV1(fixtureInput());
    const mutations = [
      { ...jsonClone(envelope), schema: 'e2s.bridge-validity-proof-envelope.v2' },
      { ...jsonClone(envelope), version: 2 },
      { ...jsonClone(envelope), contractIdHex: '01'.repeat(32) },
      { ...jsonClone(envelope), statementDigestHex: '02'.repeat(32) },
      { ...jsonClone(envelope), rawSealBytes: EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES - 1 },
      { ...jsonClone(envelope), rawSealDigestHex: '03'.repeat(32) },
      {
        ...jsonClone(envelope),
        trustBoundary: {
          ...envelope.trustBoundary,
          proofValidityEstablished: true,
        },
      },
      { ...jsonClone(envelope), extraAuthority: true },
    ];

    for (const mutation of mutations) {
      expect(() => assertEip0045BridgeValidityProofEnvelopeV1Matches(
        mutation,
        expectedContext(),
      )).toThrow();
    }
  });

  it('rejects chunk cardinality and every exact chunk-length boundary', () => {
    const base = fixtureInput();
    expect(() => buildEip0045BridgeValidityProofEnvelopeV1({
      ...base,
      proofChunks: base.proofChunks.slice(0, 3),
    })).toThrow('exactly 4');
    expect(() => buildEip0045BridgeValidityProofEnvelopeV1({
      ...base,
      proofChunks: [...base.proofChunks, Buffer.alloc(1)],
    })).toThrow('exactly 4');

    EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.forEach((_length, index) => {
      for (const delta of [-1, 1]) {
        const chunks = base.proofChunks.map((chunk) => Buffer.from(chunk));
        chunks[index] = delta < 0
          ? chunks[index].subarray(0, chunks[index].length - 1)
          : Buffer.concat([chunks[index], Buffer.from([0])]);
        expect(() => buildEip0045BridgeValidityProofEnvelopeV1({
          ...base,
          proofChunks: chunks,
        })).toThrow(`proof chunk ${index} must contain exactly`);
      }
    });
  });

  it('bounds contract proposition bytes before statement reconstruction', () => {
    const oversized = Buffer.alloc(
      EIP0045_BRIDGE_VALIDITY_MAX_CONTRACT_PROPOSITION_BYTES + 1,
      0x11,
    );
    for (const contractPropositionBytes of [oversized, oversized.toString('hex')]) {
      expect(() => buildEip0045BridgeValidityProofEnvelopeV1({
        ...fixtureInput(),
        contractPropositionBytes,
      })).toThrow('transport-profile limit');
    }
  });

  it('rejects non-canonical hex transport', () => {
    const envelope = buildEip0045BridgeValidityProofEnvelopeV1(fixtureInput());
    const baseChunks = [...envelope.consumerAbi.proofChunksHex];
    const invalidChunks = [
      [`0x${baseChunks[0]}`, ...baseChunks.slice(1)],
      [`AA${baseChunks[0].slice(2)}`, ...baseChunks.slice(1)],
      [`g0${baseChunks[0].slice(2)}`, ...baseChunks.slice(1)],
      [baseChunks[0].slice(0, -1), ...baseChunks.slice(1)],
    ];

    for (const chunks of invalidChunks) {
      expect(() => buildEip0045BridgeValidityProofEnvelopeV1({
        ...fixtureInput(),
        proofChunks: chunks,
      })).toThrow();
    }
  });

  it('requires the exact frozen profile, guest program, chain, contract, and payload statement', () => {
    const base = fixtureInput();
    expect(() => buildEip0045BridgeValidityProofEnvelopeV1({
      ...base,
      profileIdHex: 'aa'.repeat(32),
    })).toThrow('preactivation profile');
    expect(() => buildEip0045BridgeValidityProofEnvelopeV1({
      ...base,
      programIdHex: 'bb'.repeat(32),
    })).toThrow('guest program');

    const envelope = buildEip0045BridgeValidityProofEnvelopeV1(base);
    expect(() => assertEip0045BridgeValidityProofEnvelopeV1Matches(envelope, {
      ...expectedContext(),
      chainDomainIdHex: 'cc'.repeat(32),
    })).toThrow('chain domain');
    expect(() => assertEip0045BridgeValidityProofEnvelopeV1Matches(envelope, {
      ...expectedContext(),
      contractPropositionBytes: '0008cd'.padEnd(72, 'dd'),
    })).toThrow('statement');

    const changedPayload = {
      ...jsonClone(envelope),
      consumerAbi: {
        ...envelope.consumerAbi,
        applicationPayloadHex: `ff${envelope.consumerAbi.applicationPayloadHex.slice(2)}`,
      },
    };
    expect(() => assertEip0045BridgeValidityProofEnvelopeV1Matches(
      changedPayload,
      expectedContext(),
    )).toThrow();

    for (const encodedStatementHex of [
      envelope.encodedStatementHex.slice(0, -2),
      `${envelope.encodedStatementHex}00`,
    ]) {
      expect(() => assertEip0045BridgeValidityProofEnvelopeV1Matches({
        ...jsonClone(envelope),
        encodedStatementHex,
      }, expectedContext())).toThrow();
    }
  });

  it('preserves proof bytes but leaves cryptographic validity to the verifier', () => {
    const baseline = buildEip0045BridgeValidityProofEnvelopeV1(fixtureInput());
    const changedChunks = proofChunks().map((chunk) => Buffer.from(chunk));
    changedChunks[0][0] ^= 1;
    const changedSeal = buildEip0045BridgeValidityProofEnvelopeV1(fixtureInput({
      proofChunks: changedChunks,
    }));
    expect(changedSeal.rawSealDigestHex).not.toBe(baseline.rawSealDigestHex);
    expect(changedSeal.trustBoundary.proofValidityEstablished).toBe(false);
    expect(() => assertEip0045BridgeValidityProofEnvelopeV1Matches(
      changedSeal,
      expectedContext(),
    )).toThrow('expected raw seal digest');

    const reorderedChunks = proofChunks().map((chunk) => Buffer.from(chunk));
    [reorderedChunks[0], reorderedChunks[1]] = [reorderedChunks[1], reorderedChunks[0]];
    const reordered = buildEip0045BridgeValidityProofEnvelopeV1(fixtureInput({
      proofChunks: reorderedChunks,
    }));
    expect(reordered.rawSealDigestHex).not.toBe(baseline.rawSealDigestHex);
    expect(() => assertEip0045BridgeValidityProofEnvelopeV1Matches(
      reordered,
      expectedContext(),
    )).toThrow('expected raw seal digest');
  });

  it('keeps aggregate proof-system ID 2 reserved outside this ABI', () => {
    const envelope = buildEip0045BridgeValidityProofEnvelopeV1(fixtureInput());
    expect(AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED).toBe(2);
    expect(envelope).not.toHaveProperty('proofSystemId');
    expect(envelope.trustBoundary).toEqual({
      transportShapeValidated: true,
      statementBindingValidated: true,
      rawSealDigestDerived: true,
      proofValidityEstablished: false,
      sourceFinalityEstablished: false,
      profileActivated: false,
      onChainAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
    });
  });
});
