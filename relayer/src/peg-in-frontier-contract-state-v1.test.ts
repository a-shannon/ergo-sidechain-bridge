import { describe, expect, it } from 'vitest';

import {
  MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES,
  PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
  deriveFrontierAccountCodeStorageKeyV1Hex,
  deriveFrontierAccountStorageKeyV1Hex,
  derivePegInFrontierContractStateStorageKeysV1,
  normalizePegInFrontierContractStateStatementV1,
} from './peg-in-frontier-contract-state-v1.js';

const BRIDGE = `0x${'22'.repeat(20)}`;
const TOKEN = `0x${'21'.repeat(20)}`;
const BOX = `0x${'44'.repeat(32)}`;

const EXPECTED_KEYS = {
  bridgeAccountCodeStorageKeyHex:
    '0x1da53b775b270400e7e61ed5cbc5a146ea70f53d5a3306ce02aaf97049cf181a48e153ff276df11c856a0ccacaace9772222222222222222222222222222222222222222',
  tokenAccountCodeStorageKeyHex:
    '0x1da53b775b270400e7e61ed5cbc5a146ea70f53d5a3306ce02aaf97049cf181a31847ac7e5cbfc1c74c77df82b8456352121212121212121212121212121212121212121',
  bridgeOwnerStorageKeyHex:
    '0x1da53b775b270400e7e61ed5cbc5a146ab1160471b1418779239ba8e2b847e4248e153ff276df11c856a0ccacaace9772222222222222222222222222222222222222222ff0f22492f44bac4c4b30ae58d0e8daa0000000000000000000000000000000000000000000000000000000000000000',
  bridgeConfigurationStorageKeyHex:
    '0x1da53b775b270400e7e61ed5cbc5a146ab1160471b1418779239ba8e2b847e4248e153ff276df11c856a0ccacaace9772222222222222222222222222222222222222222bfd8e224d0f70266e6d5ba2a1da1ff5f0000000000000000000000000000000000000000000000000000000000000003',
  processedPegInStorageKeyHex:
    '0x1da53b775b270400e7e61ed5cbc5a146ab1160471b1418779239ba8e2b847e4248e153ff276df11c856a0ccacaace977222222222222222222222222222222222222222215427b3971e22c36c8d024f782dec6998f94b389df98db4687df00fa1fb2594807d50806cac4f6c011944c7d3d727bf8',
  tokenTotalSupplyStorageKeyHex:
    '0x1da53b775b270400e7e61ed5cbc5a146ab1160471b1418779239ba8e2b847e4231847ac7e5cbfc1c74c77df82b84563521212121212121212121212121212121212121210649d8fcd39471b32a600d9c85a03f380000000000000000000000000000000000000000000000000000000000000002',
  tokenOwnerStorageKeyHex:
    '0x1da53b775b270400e7e61ed5cbc5a146ab1160471b1418779239ba8e2b847e4231847ac7e5cbfc1c74c77df82b8456352121212121212121212121212121212121212121125cc716f326948bb6e003e69431b07f0000000000000000000000000000000000000000000000000000000000000005',
} as const;

describe('peg-in Frontier contract-state V1', () => {
  it('freezes the exact Frontier AccountCodes and AccountStorages keys', () => {
    expect(derivePegInFrontierContractStateStorageKeysV1({
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      ergoBoxIdHex: BOX,
    })).toEqual(EXPECTED_KEYS);
    expect(deriveFrontierAccountCodeStorageKeyV1Hex(BRIDGE))
      .toBe(EXPECTED_KEYS.bridgeAccountCodeStorageKeyHex);
    expect(deriveFrontierAccountStorageKeyV1Hex(BRIDGE, `0x${'00'.repeat(32)}`))
      .toBe(EXPECTED_KEYS.bridgeOwnerStorageKeyHex);
  });

  it('normalizes one exact immutable code and storage statement', () => {
    const statement = normalizePegInFrontierContractStateStatementV1({
      schema: PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      ...EXPECTED_KEYS,
      bridgeRuntimeCodeSha256Hex: `0x${'aa'.repeat(32)}`,
      bridgeRuntimeCodeBytes: '3',
      tokenRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
      tokenRuntimeCodeBytes: MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES.toString(),
    }, BOX);
    expect(statement.bridgeAddressHex).toBe(BRIDGE);
    expect(statement.processedPegInStorageKeyHex)
      .toBe(EXPECTED_KEYS.processedPegInStorageKeyHex);
    expect(Object.isFrozen(statement)).toBe(true);
  });

  it.each([
    ['zero bridge', () => derivePegInFrontierContractStateStorageKeysV1({
      bridgeAddressHex: `0x${'00'.repeat(20)}`,
      tokenAddressHex: TOKEN,
      ergoBoxIdHex: BOX,
    }), /bridge address must be nonzero/i],
    ['same contracts', () => derivePegInFrontierContractStateStorageKeysV1({
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: BRIDGE,
      ergoBoxIdHex: BOX,
    }), /must differ/i],
    ['zero box', () => derivePegInFrontierContractStateStorageKeysV1({
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      ergoBoxIdHex: `0x${'00'.repeat(32)}`,
    }), /box ID must be nonzero/i],
    ['uppercase address', () => derivePegInFrontierContractStateStorageKeysV1({
      bridgeAddressHex: BRIDGE.toUpperCase(),
      tokenAddressHex: TOKEN,
      ergoBoxIdHex: BOX,
    }), /lowercase prefixed bytes/i],
  ] as const)('rejects %s', (_label, action, message) => {
    expect(action).toThrow(message);
  });

  it.each([
    ['derived storage key', (statement: Record<string, unknown>) => {
      statement.processedPegInStorageKeyHex = EXPECTED_KEYS.bridgeOwnerStorageKeyHex;
    }, /processedPegInStorageKeyHex/i],
    ['code digest', (statement: Record<string, unknown>) => {
      statement.bridgeRuntimeCodeSha256Hex = '0x01';
    }, /SHA-256/i],
    ['zero code length', (statement: Record<string, unknown>) => {
      statement.tokenRuntimeCodeBytes = '0';
    }, /positive decimal/i],
    ['oversized code', (statement: Record<string, unknown>) => {
      statement.tokenRuntimeCodeBytes = (MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES + 1).toString();
    }, /exceeds/i],
    ['unknown field', (statement: Record<string, unknown>) => {
      statement.verified = true;
    }, /unexpected field/i],
  ] as const)('rejects %s statement drift', (_label, mutate, message) => {
    const statement: Record<string, unknown> = {
      schema: PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      ...EXPECTED_KEYS,
      bridgeRuntimeCodeSha256Hex: `0x${'aa'.repeat(32)}`,
      bridgeRuntimeCodeBytes: '3',
      tokenRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
      tokenRuntimeCodeBytes: '4',
    };
    mutate(statement);
    expect(() => normalizePegInFrontierContractStateStatementV1(statement, BOX))
      .toThrow(message);
  });
});
