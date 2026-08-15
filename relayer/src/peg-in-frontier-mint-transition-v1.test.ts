import { describe, expect, it } from 'vitest';

import {
  PEG_IN_FRONTIER_MINT_TRANSITION_STATEMENT_V1_SCHEMA,
  deriveFrontierTokenBalanceMappingSlotV1Hex,
  derivePegInFrontierMintTransitionStatementV1,
  normalizePegInFrontierMintTransitionStatementV1,
} from './peg-in-frontier-mint-transition-v1.js';

const SIDECHAIN = `0x${'11'.repeat(32)}`;
const BOX = `0x${'44'.repeat(32)}`;
const TOKEN = `0x${'21'.repeat(20)}`;
const RECIPIENT = `0x${'55'.repeat(20)}`;

describe('peg-in Frontier mint-transition V1 statement', () => {
  it('derives the exact native replay and recipient-balance keys', () => {
    const statement = derivePegInFrontierMintTransitionStatementV1({
      sidechainIdHex: SIDECHAIN,
      ergoBoxIdHex: BOX,
      tokenAddressHex: TOKEN,
      recipientHex: RECIPIENT,
    });

    expect(statement).toEqual({
      schema: PEG_IN_FRONTIER_MINT_TRANSITION_STATEMENT_V1_SCHEMA,
      parentNativeProcessedRecordStorageKeyHex:
        '0xaf86fef4216ac2bcd1c592b204011ad0e683c528c6fc8006645fa5989173f2e0'
        + '175eb1e2bc1f0136a4c754b880075ee651af81a4b93e0a8dc4f9fdd668495990a'
        + '19e01a62c642b3bcd4cd5891f45384a',
      recipientBalanceStorageKeyHex:
        '0x1da53b775b270400e7e61ed5cbc5a146ab1160471b1418779239ba8e2b847e42'
        + '31847ac7e5cbfc1c74c77df82b8456352121212121212121212121212121212121212121'
        + '2f26067393eb7fbd05d5e31977b53a496cf371e1ca35ebabdfe944c65642deafa'
        + '5ee08c43b49c6c3b521e4cc1c994c9a',
    });
    expect(deriveFrontierTokenBalanceMappingSlotV1Hex(RECIPIENT)).toBe(
      '0x6cf371e1ca35ebabdfe944c65642deafa5ee08c43b49c6c3b521e4cc1c994c9a',
    );
    expect(Object.isFrozen(statement)).toBe(true);
  });

  it.each([
    ['native record key', 'parentNativeProcessedRecordStorageKeyHex'],
    ['recipient balance key', 'recipientBalanceStorageKeyHex'],
  ] as const)('rejects caller-supplied %s drift', (_label, field) => {
    const identity = {
      sidechainIdHex: SIDECHAIN,
      ergoBoxIdHex: BOX,
      tokenAddressHex: TOKEN,
      recipientHex: RECIPIENT,
    };
    const statement = structuredClone(
      derivePegInFrontierMintTransitionStatementV1(identity),
    ) as unknown as Record<string, unknown>;
    statement[field] = `0x${'99'.repeat(field.startsWith('parent') ? 80 : 104)}`;
    expect(() => normalizePegInFrontierMintTransitionStatementV1(statement, identity))
      .toThrow(/must be exactly/i);
  });
});
