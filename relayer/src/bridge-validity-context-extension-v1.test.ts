import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-consumer-contract-v1.js';
import {
  buildEip0045BridgeValidityStatementV1,
} from './bridge-validity-finality-statement-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES,
  buildEip0045BridgeValidityProofEnvelopeV1,
} from './bridge-validity-proof-envelope-v1.js';
import {
  EIP0045_BRIDGE_VALIDITY_CONTEXT_EXTENSION_V1_SCHEMA,
  buildEip0045BridgeValidityContextExtensionV1,
} from './bridge-validity-context-extension-v1.js';

const statementVector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-validity-finality-statement-v2.json', import.meta.url),
  'utf8',
));

function proofChunks(): readonly Buffer[] {
  return EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.map(
    (length, index) => Buffer.alloc(length, (index + 1) * 0x11),
  );
}

function envelopeFixture() {
  const applicationPayload = statementVector.expected.encodedPayloadHex as string;
  const statement = buildEip0045BridgeValidityStatementV1({
    chainDomainIdHex: statementVector.input.chainDomainIdHex,
    profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    contractPropositionBytes: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
    applicationPayload,
  });
  const envelope = buildEip0045BridgeValidityProofEnvelopeV1({
    proofChunks: proofChunks(),
    applicationPayload,
    programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    encodedStatement: statement.encodedStatementHex,
    chainDomainIdHex: statementVector.input.chainDomainIdHex,
    contractPropositionBytes: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
  });
  return {
    envelope,
    expected: {
      chainDomainIdHex: statementVector.input.chainDomainIdHex as string,
      contractPropositionBytes: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
      rawSealDigestHex: envelope.rawSealDigestHex,
    },
  };
}

describe('EIP-0045 bridge validity ContextExtension V1', () => {
  it('materializes the exact two-variable WP-06W envelope through WASM EIP-12 parsing', async () => {
    const input = envelopeFixture();
    const fixture = await buildEip0045BridgeValidityContextExtensionV1(input);

    expect(fixture.schema).toBe(EIP0045_BRIDGE_VALIDITY_CONTEXT_EXTENSION_V1_SCHEMA);
    expect(fixture.version).toBe(1);
    expect(fixture.contextExtension.keys).toEqual([0, 1]);
    expect(fixture.contextExtension.valueTypes).toEqual([
      'Coll[Coll[Byte]]',
      'Coll[Byte]',
    ]);
    expect(fixture.contextExtension.proofChunkLengths)
      .toEqual(EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES);
    expect(fixture.contextExtension.applicationPayloadBytes).toBe(654);
    expect(fixture.eip12UnsignedTransaction.inputs[0].extension).toEqual(
      fixture.contextExtension.eip12Values,
    );
    expect(fixture.wasmRoundTripEip12).toEqual(fixture.eip12UnsignedTransaction);
    expect(fixture.contextExtension.serializedHex.startsWith('02001a')).toBe(true);
    expect(fixture.contextExtension.serializedBlake2b256Hex)
      .toBe('df72e80a241a81d4ae12d1ace398ade16c4f42e58db02f87f7ad7da621a846b5');
    expect(fixture.unsignedTransactionIdHex)
      .toBe('f12226f8b3310a9058a91004a7346c92eaa6dcc64112c49e5fa5b648fcc19a57');
    expect(fixture.boundaries).toEqual({
      serializationConformanceOnly: true,
      signingPerformed: false,
      nodeCheckPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      gate5Closed: false,
      fundsAuthorityEstablished: false,
    });
  });

  it('fails closed when the envelope does not match the external expected identity', async () => {
    const input = envelopeFixture();
    await expect(buildEip0045BridgeValidityContextExtensionV1({
      ...input,
      expected: {
        ...input.expected,
        rawSealDigestHex: 'ff'.repeat(32),
      },
    })).rejects.toThrow('expected raw seal digest');
  });
});
