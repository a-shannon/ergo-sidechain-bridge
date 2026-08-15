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
  EIP0045_BRIDGE_VALIDITY_PROOFLESS_TRANSACTION_V1_SCHEMA,
  buildEip0045BridgeValidityProoflessTransactionV1,
} from './bridge-validity-proofless-transaction-v1.js';

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

describe('EIP-0045 bridge validity proofless transaction V1', () => {
  it('freezes the exact whole-transaction bytes-to-sign identity above WP-06Y', async () => {
    const fixture = await buildEip0045BridgeValidityProoflessTransactionV1(
      envelopeFixture(),
    );

    expect(fixture.schema)
      .toBe(EIP0045_BRIDGE_VALIDITY_PROOFLESS_TRANSACTION_V1_SCHEMA);
    expect(fixture.version).toBe(1);
    expect(fixture.sourceContextExtension.schema)
      .toBe('e2s.bridge-validity-context-extension.v1');
    expect(fixture.sourceContextExtension.version).toBe(1);
    expect(fixture.sourceContextExtension.serializedHex.length)
      .toBe(223_342 * 2);
    expect(fixture.transaction.inputCount).toBe(1);
    expect(fixture.transaction.dataInputCount).toBe(0);
    expect(fixture.transaction.outputCount).toBe(1);
    expect(fixture.transaction.inputBoxIdHex).toBe('44'.repeat(32));
    expect(fixture.transaction.inputProofBytes).toBe(0);
    expect(fixture.transaction.contextExtensionKeys).toEqual([0, 1]);
    expect(fixture.transaction.output).toEqual({
      value: '1000000',
      ergoTreeHex: `0008cd02${'33'.repeat(32)}`,
      assetCount: 0,
      additionalRegisterCount: 0,
      creationHeight: 100,
    });
    expect(fixture.transaction.bytesToSignBytes).toBe(223_421);
    expect(fixture.transaction.bytesToSignHex.length).toBe(223_421 * 2);
    expect(fixture.transaction.bytesToSignBlake2b256Hex)
      .toBe('f12226f8b3310a9058a91004a7346c92eaa6dcc64112c49e5fa5b648fcc19a57');
    expect(fixture.transaction.transactionIdHex)
      .toBe(fixture.transaction.bytesToSignBlake2b256Hex);
    expect(fixture.boundaries).toEqual({
      wholeTransactionSerializationOnly: true,
      signingPerformed: false,
      nodeCheckPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      profileActivated: false,
      gate5Closed: false,
      fundsAuthorityEstablished: false,
    });
  });

  it('inherits the external proof-envelope identity boundary', async () => {
    const input = envelopeFixture();
    await expect(buildEip0045BridgeValidityProoflessTransactionV1({
      ...input,
      expected: {
        ...input.expected,
        rawSealDigestHex: 'ff'.repeat(32),
      },
    })).rejects.toThrow('expected raw seal digest');
  });
});
