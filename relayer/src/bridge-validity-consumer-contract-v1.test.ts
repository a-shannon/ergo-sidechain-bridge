import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  buildEip0045BridgeValidityStatementV1,
  deriveEip0045ContractIdHex,
} from './bridge-validity-finality-statement-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES,
  EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
} from './bridge-validity-consumer-contract-v1.js';

const CHAIN_DOMAIN_ID_HEX = 'a1'.repeat(32);
const statementVector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-validity-finality-statement-v2.json', import.meta.url),
  'utf8',
));
const consumerVector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/bridge-validity-eip0045-consumer-contract-v1.json',
    import.meta.url,
  ),
  'utf8',
));

describe('EIP-0045 bridge validity consumer contract V1', () => {
  it('freezes the exact v4 segregated proposition emitted by the pinned JVM', () => {
    expect(EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES).toBe(85);
    expect(EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX).toBe(
      '1c53020e20'
      + EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX
      + '0e20'
      + EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX
      + 'd1b9e4e3001ae4e3010e73007301',
    );
    expect(EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX)
      .toBe('9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc');
    expect(deriveEip0045ContractIdHex(
      Buffer.from(EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX, 'hex'),
    )).toBe(EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX);
    expect(consumerVector.generator).toMatchObject({
      commit: 'f78deadd668f801e7fae3bc884283f79c6f484fa',
      treeVersion: 4,
      constantSegregation: true,
    });
    expect(consumerVector.constants).toEqual({
      programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
      profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    });
    expect(consumerVector.expected).toEqual({
      propositionBytes: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES,
      propositionBytesHex: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
      contractIdHex: EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX,
    });
    expect(consumerVector.claimBoundary).toEqual({
      fundsNeutral: true,
      preactivationOnly: true,
      profileActivated: false,
      onChainAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustless: false,
      productionReady: false,
    });
  });

  it('binds an EIP-0045 statement to the executable SELF identity', () => {
    const statement = buildEip0045BridgeValidityStatementV1({
      chainDomainIdHex: CHAIN_DOMAIN_ID_HEX,
      profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
      programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
      contractPropositionBytes: EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
      applicationPayload: statementVector.expected.encodedPayloadHex,
    });

    expect(statement.contractIdHex)
      .toBe(EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX);
  });

  it('changes the contract identity for every isolated proposition mutation', () => {
    const proposition = Buffer.from(
      EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
      'hex',
    );
    for (const index of [0, 5, 36, 38, 69, proposition.length - 1]) {
      const mutated = Buffer.from(proposition);
      mutated[index] ^= 1;
      expect(deriveEip0045ContractIdHex(mutated))
        .not.toBe(EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX);
    }
  });
});
