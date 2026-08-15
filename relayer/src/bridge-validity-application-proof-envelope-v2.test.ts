import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  encodeBridgeValidityApplicationPayloadV3,
  encodeEip0045BridgeApplicationStatementV2,
} from './bridge-validity-application-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_CONSUMER_CHILD_ORDER,
  EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_SCHEMA,
  assertEip0045BridgeApplicationProofEnvelopeV2Matches,
  buildEip0045BridgeApplicationProofEnvelopeV2,
  type Eip0045BridgeApplicationProofEnvelopeV2Input,
} from './bridge-validity-application-proof-envelope-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES,
  EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES,
} from './bridge-validity-proof-envelope-v1.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
} from './spv-tracker-validity-v2.js';

const finalityVector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/bridge-validity-finality-statement-v2.json',
    import.meta.url,
  ),
  'utf8',
));
const application = Object.freeze({
  sourceNetworkIdHex: 'aa'.repeat(32),
  sidechainIdHex: '11'.repeat(32),
  bridgeAddressHex: '22'.repeat(20),
  tokenAddressHex: '21'.repeat(20),
  settlementProfileIdHex: 'bb'.repeat(32),
  causalProfileIdHex:
    '80fb647618a990b24084ecceaa810822c14d2649c998908043b21120b07e67ee',
  bridgeRuntimeCodeSha256Hex:
    'ba3d364b0b10103032ebc8974a70e54e1c0aa69854212edfbc7daec81f3e3751',
  bridgeRuntimeCodeBytes: 4_104,
  tokenRuntimeCodeSha256Hex:
    '43b2edc69034b0e801fd13efc3b5d4bfb50dc255b17d49e058c4dcf79d872989',
  tokenRuntimeCodeBytes: 2_356,
});
const EXPECTED_RAW_SEAL_DIGEST_HEX =
  '87ad21b3a4a095d1cf10d57207d3e71d8e4f918bfdf0952bd85e11a9e817942a';

function proofChunks(): readonly Buffer[] {
  return EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.map(
    (length, index) => Buffer.alloc(length, (index + 1) * 0x11),
  );
}

function fixtureInput(
  overrides: Partial<Eip0045BridgeApplicationProofEnvelopeV2Input> = {},
): Eip0045BridgeApplicationProofEnvelopeV2Input {
  const applicationPayload = encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: finalityVector.expected.encodedPayloadHex as string,
    application,
  });
  const statement = encodeEip0045BridgeApplicationStatementV2({
    chainDomainIdHex: application.sourceNetworkIdHex,
    profileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    contractIdHex: EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
    applicationPayload,
  });
  return {
    proofChunks: proofChunks(),
    applicationPayload,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    profileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    encodedStatement: statement,
    chainDomainIdHex: application.sourceNetworkIdHex,
    contractPropositionBytes:
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
    ...overrides,
  };
}

function expectedContext() {
  return {
    chainDomainIdHex: application.sourceNetworkIdHex,
    contractPropositionBytes:
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
    rawSealDigestHex: EXPECTED_RAW_SEAL_DIGEST_HEX,
  };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('EIP-0045 bridge application proof envelope V2', () => {
  it('freezes the distinct application statement and unchanged verifier ABI', () => {
    const envelope =
      buildEip0045BridgeApplicationProofEnvelopeV2(fixtureInput());

    expect(EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_SCHEMA)
      .toBe('e2s.bridge-validity-application-proof-envelope.v2');
    expect(EIP0045_BRIDGE_APPLICATION_CONSUMER_CHILD_ORDER).toEqual([
      'proofChunks',
      'applicationPayload',
      'programId',
      'profileId',
    ]);
    expect(envelope.version).toBe(2);
    expect(envelope.contractIdHex)
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX);
    expect(envelope.consumerAbi.applicationPayloadHex.length / 2).toBe(973);
    expect(envelope.encodedStatementHex.length / 2).toBe(1_132);
    expect(envelope.rawSealBytes)
      .toBe(EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES);
    expect(envelope.rawSealDigestHex).toBe(EXPECTED_RAW_SEAL_DIGEST_HEX);
    expect(envelope.consumerAbi.programIdHex)
      .toBe(EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX);
    expect(envelope.consumerAbi.programIdHex)
      .not.toBe(EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX);
    expect(envelope).not.toHaveProperty('proofSystemId');
  });

  it('round-trips strict JSON against external chain, contract, and seal identities', () => {
    const envelope =
      buildEip0045BridgeApplicationProofEnvelopeV2(fixtureInput());
    expect(assertEip0045BridgeApplicationProofEnvelopeV2Matches(
      jsonClone(envelope),
      expectedContext(),
    )).toEqual(envelope);
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.consumerAbi)).toBe(true);
    expect(Object.isFrozen(envelope.trustBoundary)).toBe(true);
  });

  it('rejects V1 program, wrong profile, chain, contract, or payload', () => {
    const input = fixtureInput();
    expect(() => buildEip0045BridgeApplicationProofEnvelopeV2({
      ...input,
      programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    })).toThrow('application guest program');
    expect(() => buildEip0045BridgeApplicationProofEnvelopeV2({
      ...input,
      profileIdHex: '99'.repeat(32),
    })).toThrow('preactivation profile');

    const envelope =
      buildEip0045BridgeApplicationProofEnvelopeV2(input);
    expect(() => assertEip0045BridgeApplicationProofEnvelopeV2Matches(
      envelope,
      { ...expectedContext(), chainDomainIdHex: '98'.repeat(32) },
    )).toThrow('chain domain');
    expect(() => assertEip0045BridgeApplicationProofEnvelopeV2Matches(
      envelope,
      { ...expectedContext(), contractPropositionBytes: '0008cd' },
    )).toThrow();
    const changedPayload = {
      ...jsonClone(envelope),
      consumerAbi: {
        ...envelope.consumerAbi,
        applicationPayloadHex:
          `ff${envelope.consumerAbi.applicationPayloadHex.slice(2)}`,
      },
    };
    expect(() => assertEip0045BridgeApplicationProofEnvelopeV2Matches(
      changedPayload,
      expectedContext(),
    )).toThrow();
  });

  it('requires four exact proof chunks and one expected raw-seal digest', () => {
    const input = fixtureInput();
    expect(() => buildEip0045BridgeApplicationProofEnvelopeV2({
      ...input,
      proofChunks: input.proofChunks.slice(1),
    })).toThrow('exactly 4');
    EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.forEach((_length, index) => {
      const chunks = input.proofChunks.map(chunk => Buffer.from(chunk));
      chunks[index] = chunks[index].subarray(0, chunks[index].length - 1);
      expect(() => buildEip0045BridgeApplicationProofEnvelopeV2({
        ...input,
        proofChunks: chunks,
      })).toThrow(`proof chunk ${index}`);
    });

    const changedChunks = input.proofChunks.map(chunk => Buffer.from(chunk));
    changedChunks[0][0] ^= 1;
    const changed =
      buildEip0045BridgeApplicationProofEnvelopeV2({
        ...input,
        proofChunks: changedChunks,
      });
    expect(changed.trustBoundary.proofValidityEstablished).toBe(false);
    expect(() => assertEip0045BridgeApplicationProofEnvelopeV2Matches(
      changed,
      expectedContext(),
    )).toThrow('expected raw seal digest');
  });

  it('rejects schema drift, derived-field drift, and promoted authority', () => {
    const envelope =
      buildEip0045BridgeApplicationProofEnvelopeV2(fixtureInput());
    const mutations = [
      { ...jsonClone(envelope), version: 1 },
      { ...jsonClone(envelope), schema: 'e2s.bridge-validity-proof-envelope.v1' },
      { ...jsonClone(envelope), contractIdHex: '01'.repeat(32) },
      { ...jsonClone(envelope), statementDigestHex: '02'.repeat(32) },
      { ...jsonClone(envelope), rawSealDigestHex: '03'.repeat(32) },
      {
        ...jsonClone(envelope),
        trustBoundary: {
          ...envelope.trustBoundary,
          proofValidityEstablished: true,
        },
      },
      { ...jsonClone(envelope), fundsAuthorityEstablished: true },
    ];
    for (const mutation of mutations) {
      expect(() => assertEip0045BridgeApplicationProofEnvelopeV2Matches(
        mutation,
        expectedContext(),
      )).toThrow();
    }
  });

  it('keeps local transport evidence explicitly non-authoritative', () => {
    const envelope =
      buildEip0045BridgeApplicationProofEnvelopeV2(fixtureInput());
    expect(envelope.trustBoundary).toEqual({
      transportShapeValidated: true,
      statementBindingValidated: true,
      applicationBindingValidated: true,
      rawSealDigestDerived: true,
      proofValidityEstablished: false,
      sourceFinalityEstablished: false,
      profileActivated: false,
      onChainAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
    });
  });
});
