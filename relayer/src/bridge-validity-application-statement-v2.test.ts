import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES,
  BRIDGE_CAUSAL_APPLICATION_BINDING_V2_DOMAIN,
  BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
  BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN,
  EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
  assertEip0045BridgeApplicationStatementV2Matches,
  decodeBridgeCausalApplicationBindingV2,
  decodeBridgeValidityApplicationPayloadV3,
  decodeEip0045BridgeApplicationStatementV2,
  deriveBridgeCausalApplicationBindingV2DigestHex,
  deriveBridgeValidityApplicationPayloadV3DigestHex,
  deriveEip0045BridgeApplicationStatementV2DigestHex,
  encodeBridgeCausalApplicationBindingV2,
  encodeBridgeValidityApplicationPayloadV3,
  encodeEip0045BridgeApplicationStatementV2,
  type BridgeCausalApplicationBindingV2Input,
} from './bridge-validity-application-statement-v2.js';

const finalityVector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-validity-finality-statement-v2.json', import.meta.url),
  'utf8',
));

const application = Object.freeze({
  sourceNetworkIdHex: 'aa'.repeat(32),
  sidechainIdHex: '11'.repeat(32),
  bridgeAddressHex: '22'.repeat(20),
  tokenAddressHex: '21'.repeat(20),
  settlementProfileIdHex: 'bb'.repeat(32),
  causalProfileIdHex: '80fb647618a990b24084ecceaa810822c14d2649c998908043b21120b07e67ee',
  bridgeRuntimeCodeSha256Hex:
    'ba3d364b0b10103032ebc8974a70e54e1c0aa69854212edfbc7daec81f3e3751',
  bridgeRuntimeCodeBytes: 4_104,
  tokenRuntimeCodeSha256Hex:
    '43b2edc69034b0e801fd13efc3b5d4bfb50dc255b17d49e058c4dcf79d872989',
  tokenRuntimeCodeBytes: 2_356,
}) satisfies BridgeCausalApplicationBindingV2Input;

const outerIdentities = Object.freeze({
  chainDomainIdHex: application.sourceNetworkIdHex,
  profileIdHex: finalityVector.input.profileIdHex as string,
  programIdHex: finalityVector.input.programIdHex as string,
  contractIdHex: finalityVector.expected.contractIdHex as string,
});

const RUST_BINDING_DIGEST =
  '57575455a76c1e7b081d79fab7144f1b6218da89bc4687d7130880a7908ea39a';
const RUST_PAYLOAD_DIGEST =
  '56af0855131d7c4282d98169ade642b5a3c66b0964b062904190644a75a140df';
const RUST_STATEMENT_DIGEST =
  '5c84430f77d40e56de4aa577e36c88a847d7e34bb4365cbc53d097d46ea71e14';

function buildPayload(): Buffer {
  return encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: finalityVector.expected.encodedPayloadHex as string,
    application,
  });
}

function buildStatement(): Buffer {
  return encodeEip0045BridgeApplicationStatementV2({
    ...outerIdentities,
    applicationPayload: buildPayload(),
  });
}

function mutateByte(bytes: Buffer, offset: number, value?: number): Buffer {
  const changed = Buffer.from(bytes);
  changed[offset] = value ?? (changed[offset] ^ 0x80);
  return changed;
}

describe('BridgeCausalApplicationBindingV2', () => {
  it('round-trips the exact 240-byte Rust binding and pins its golden digest', () => {
    const encoded = encodeBridgeCausalApplicationBindingV2(application);
    const decoded = decodeBridgeCausalApplicationBindingV2(encoded);

    expect(BRIDGE_CAUSAL_APPLICATION_BINDING_V2_DOMAIN)
      .toBe('E2S_CAUSAL_APPLICATION_BINDING_V2');
    expect(encoded).toHaveLength(BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES);
    expect(encoded.readUInt32BE(200)).toBe(4_104);
    expect(encoded.readUInt32BE(236)).toBe(2_356);
    expect(decoded).toMatchObject(application);
    expect(decoded.encodedBindingHex).toBe(encoded.toString('hex'));
    expect(decoded.bindingDigestHex).toBe(RUST_BINDING_DIGEST);
    expect(deriveBridgeCausalApplicationBindingV2DigestHex(application))
      .toBe(RUST_BINDING_DIGEST);
    expect(deriveBridgeCausalApplicationBindingV2DigestHex(encoded.toString('hex')))
      .toBe(RUST_BINDING_DIGEST);
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it('rejects malformed hex, zero identities, aliases, zero code sizes and length drift', () => {
    expect(() => encodeBridgeCausalApplicationBindingV2({
      ...application,
      sourceNetworkIdHex: application.sourceNetworkIdHex.toUpperCase(),
    })).toThrow('lowercase unprefixed hex');
    expect(() => encodeBridgeCausalApplicationBindingV2({
      ...application,
      bridgeAddressHex: '00'.repeat(20),
    })).toThrow('nonzero');
    expect(() => encodeBridgeCausalApplicationBindingV2({
      ...application,
      tokenAddressHex: application.bridgeAddressHex,
    })).toThrow('must not alias');
    expect(() => encodeBridgeCausalApplicationBindingV2({
      ...application,
      bridgeRuntimeCodeBytes: 0,
    })).toThrow('positive uint32');
    expect(() => encodeBridgeCausalApplicationBindingV2({
      ...application,
      tokenRuntimeCodeBytes: 0,
    })).toThrow('positive uint32');
    expect(() => decodeBridgeCausalApplicationBindingV2(
      Buffer.alloc(BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES - 1),
    )).toThrow('must be 240 bytes');
  });
});

describe('BridgeValidityApplicationPayloadV3', () => {
  it('preserves the exact 654-byte finality payload and pins the Rust payload digest', () => {
    const encoded = buildPayload();
    const decoded = decodeBridgeValidityApplicationPayloadV3(encoded);
    const domainBytes = Buffer.byteLength(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN, 'ascii');

    expect(encoded).toHaveLength(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES);
    expect(encoded.subarray(0, domainBytes).toString('ascii'))
      .toBe(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN);
    expect(encoded[domainBytes]).toBe(0);
    expect([...encoded.subarray(domainBytes + 1, domainBytes + 5)]).toEqual([3, 1, 2, 0]);
    expect(
      encoded.subarray(domainBytes + 5, domainBytes + 5 + 654).toString('hex'),
    ).toBe(finalityVector.expected.encodedPayloadHex);
    expect(decoded.applicationBindingDigestHex).toBe(RUST_BINDING_DIGEST);
    expect(decoded.payloadDigestHex).toBe(RUST_PAYLOAD_DIGEST);
    expect(deriveBridgeValidityApplicationPayloadV3DigestHex(encoded))
      .toBe(RUST_PAYLOAD_DIGEST);
    expect(decoded.encodedPayloadHex).toBe(encoded.toString('hex'));
    expect(decoded.application.sidechainIdHex)
      .toBe(decoded.finality.checkpoint.sidechainIdHex);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.application)).toBe(true);
    expect(Object.isFrozen(decoded.finality)).toBe(true);
  });

  it('rejects domain, each discriminator, digest, sidechain and total-length drift', () => {
    const payload = buildPayload();
    const domainBytes = Buffer.byteLength(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN, 'ascii');
    const discriminatorOffset = domainBytes + 1;
    const finalityOffset = discriminatorOffset + 4;
    const applicationOffset = finalityOffset + 654;
    const digestOffset = applicationOffset + BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES;

    expect(() => decodeBridgeValidityApplicationPayloadV3(
      mutateByte(payload, 0),
    )).toThrow('domain');
    for (const [offset, message] of [
      [discriminatorOffset, 'version'],
      [discriminatorOffset + 1, 'hash algorithm'],
      [discriminatorOffset + 2, 'source application profile'],
      [discriminatorOffset + 3, 'flags'],
    ] as const) {
      expect(() => decodeBridgeValidityApplicationPayloadV3(
        mutateByte(payload, offset),
      )).toThrow(message);
    }
    expect(() => decodeBridgeValidityApplicationPayloadV3(
      mutateByte(payload, digestOffset),
    )).toThrow('binding digest');
    expect(() => decodeBridgeValidityApplicationPayloadV3(
      mutateByte(payload, applicationOffset + 32),
    )).toThrow('sidechain ID');
    expect(() => decodeBridgeValidityApplicationPayloadV3(
      payload.subarray(0, payload.length - 1),
    )).toThrow('must be 973 bytes');
    expect(() => decodeBridgeValidityApplicationPayloadV3(
      Buffer.concat([payload, Buffer.from([0])]),
    )).toThrow('must be 973 bytes');
  });

  it('rejects every uncoordinated application-field mutation', () => {
    const payload = buildPayload();
    const applicationOffset =
      Buffer.byteLength(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN, 'ascii')
      + 1 + 4 + 654;
    for (const fieldOffset of [0, 64, 84, 104, 136, 168, 200, 204, 236]) {
      expect(() => decodeBridgeValidityApplicationPayloadV3(
        mutateByte(payload, applicationOffset + fieldOffset),
      )).toThrow('binding digest');
    }
  });
});

describe('EIP-0045 BridgeApplicationStatementV2', () => {
  it('round-trips the exact 1,132-byte standard wrapper and pins the Rust digest', () => {
    const statement = buildStatement();
    const decoded = decodeEip0045BridgeApplicationStatementV2(statement);

    expect(statement).toHaveLength(EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES);
    expect(statement.subarray(0, 26).toString('ascii')).toBe('Ergo.VerifyStark.Statement');
    expect(statement[26]).toBe(1);
    expect(statement.readUInt32LE(155)).toBe(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES);
    expect(statement.subarray(159).toString('hex')).toBe(buildPayload().toString('hex'));
    expect(decoded.encodedStatementHex).toBe(statement.toString('hex'));
    expect(decoded.applicationPayload.payloadDigestHex).toBe(RUST_PAYLOAD_DIGEST);
    expect(decoded.statementDigestHex).toBe(RUST_STATEMENT_DIGEST);
    expect(deriveEip0045BridgeApplicationStatementV2DigestHex(statement))
      .toBe(RUST_STATEMENT_DIGEST);
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it('rejects outer domain, standard version, chain-domain, payload length and total length drift', () => {
    const statement = buildStatement();

    expect(() => decodeEip0045BridgeApplicationStatementV2(
      mutateByte(statement, 0),
    )).toThrow('domain');
    expect(() => decodeEip0045BridgeApplicationStatementV2(
      mutateByte(statement, 26, 2),
    )).toThrow('version');
    expect(() => decodeEip0045BridgeApplicationStatementV2(
      mutateByte(statement, 27),
    )).toThrow('settlement chain domain');
    expect(() => decodeEip0045BridgeApplicationStatementV2(
      mutateByte(statement, 155),
    )).toThrow('payload length');
    expect(() => decodeEip0045BridgeApplicationStatementV2(
      statement.subarray(0, statement.length - 1),
    )).toThrow('must be 1132 bytes');
    expect(() => decodeEip0045BridgeApplicationStatementV2(
      Buffer.concat([statement, Buffer.from([0])]),
    )).toThrow('must be 1132 bytes');
  });

  it('rejects zero and malformed outer identities without conferring proof authority', () => {
    const payload = buildPayload();
    for (const field of ['chainDomainIdHex', 'profileIdHex', 'programIdHex', 'contractIdHex'] as const) {
      expect(() => encodeEip0045BridgeApplicationStatementV2({
        ...outerIdentities,
        [field]: '00'.repeat(32),
        applicationPayload: payload,
      })).toThrow(field === 'chainDomainIdHex' ? 'chainDomainId' : field.slice(0, -3));
    }
    expect(() => encodeEip0045BridgeApplicationStatementV2({
      ...outerIdentities,
      profileIdHex: outerIdentities.profileIdHex.toUpperCase(),
      applicationPayload: payload,
    })).toThrow('lowercase unprefixed hex');
    expect(() => encodeEip0045BridgeApplicationStatementV2({
      ...outerIdentities,
      chainDomainIdHex: 'ab'.repeat(32),
      applicationPayload: payload,
    })).toThrow('settlement chain domain');
  });

  it('rejects independently drifted nonzero profile, program, contract and payload identities', () => {
    const payload = buildPayload();
    const statement = buildStatement();
    const expected = {
      ...outerIdentities,
      applicationPayload: payload,
    };
    for (const mutation of [
      { ...expected, profileIdHex: 'b3'.repeat(32) },
      { ...expected, programIdHex: 'c4'.repeat(32) },
      { ...expected, contractIdHex: 'd5'.repeat(32) },
      {
        ...expected,
        applicationPayload: encodeBridgeValidityApplicationPayloadV3({
          finalityPayload: finalityVector.expected.encodedPayloadHex as string,
          application: {
            ...application,
            bridgeAddressHex: '23'.repeat(20),
          },
        }),
      },
    ]) {
      expect(() => assertEip0045BridgeApplicationStatementV2Matches(
        statement,
        mutation,
      )).toThrow('expected binding mismatch');
    }
  });
});
