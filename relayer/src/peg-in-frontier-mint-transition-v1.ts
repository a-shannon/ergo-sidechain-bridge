import { concat, keccak256, toBeHex, zeroPadValue } from 'ethers';

import {
  deriveFrontierAccountStorageKeyV1Hex,
} from './peg-in-frontier-contract-state-v1.js';
import {
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';

export const PEG_IN_FRONTIER_MINT_TRANSITION_STATEMENT_V1_SCHEMA =
  'e2s.peg-in-frontier-mint-transition-statement.v1' as const;

const TOKEN_BALANCES_MAPPING_SLOT = 0n;

export interface PegInFrontierMintTransitionStatementV1 {
  readonly schema: typeof PEG_IN_FRONTIER_MINT_TRANSITION_STATEMENT_V1_SCHEMA;
  readonly parentNativeProcessedRecordStorageKeyHex: string;
  readonly recipientBalanceStorageKeyHex: string;
}

export interface PegInFrontierMintTransitionIdentityV1 {
  readonly sidechainIdHex: unknown;
  readonly ergoBoxIdHex: unknown;
  readonly tokenAddressHex: unknown;
  readonly recipientHex: unknown;
}

/** Derive the exact Solidity `_balances[recipient]` mapping slot at base slot zero. */
export function deriveFrontierTokenBalanceMappingSlotV1Hex(recipientHex: unknown): string {
  const recipient = prefixedFixedHex(recipientHex, 20, 'Frontier mint recipient');
  return keccak256(concat([
    zeroPadValue(recipient, 32),
    zeroPadValue(toBeHex(TOKEN_BALANCES_MAPPING_SLOT), 32),
  ]));
}

/** Derive the two exact keys added by the direct-parent mint-transition profile. */
export function derivePegInFrontierMintTransitionStatementV1(
  input: PegInFrontierMintTransitionIdentityV1,
): PegInFrontierMintTransitionStatementV1 {
  const sidechainIdHex = prefixedFixedHex(
    input?.sidechainIdHex,
    32,
    'Frontier mint-transition sidechain ID',
  );
  const ergoBoxIdHex = prefixedFixedHex(
    input?.ergoBoxIdHex,
    32,
    'Frontier mint-transition Ergo box ID',
  );
  const tokenAddressHex = prefixedFixedHex(
    input?.tokenAddressHex,
    20,
    'Frontier mint-transition token address',
  );
  const recipientHex = prefixedFixedHex(
    input?.recipientHex,
    20,
    'Frontier mint-transition recipient',
  );
  const parentNativeProcessedRecordStorageKeyHex =
    deriveProcessedPegInRuntimeStorageKeyV1Hex({ sidechainIdHex, ergoBoxIdHex });
  const recipientBalanceStorageKeyHex = deriveFrontierAccountStorageKeyV1Hex(
    tokenAddressHex,
    deriveFrontierTokenBalanceMappingSlotV1Hex(recipientHex),
  );

  return Object.freeze({
    schema: PEG_IN_FRONTIER_MINT_TRANSITION_STATEMENT_V1_SCHEMA,
    parentNativeProcessedRecordStorageKeyHex,
    recipientBalanceStorageKeyHex,
  });
}

/** Normalize one statement and reject every caller-supplied key not derived from its identity. */
export function normalizePegInFrontierMintTransitionStatementV1(
  value: unknown,
  identity: PegInFrontierMintTransitionIdentityV1,
): PegInFrontierMintTransitionStatementV1 {
  const statement = exactRecord(value, [
    'parentNativeProcessedRecordStorageKeyHex',
    'recipientBalanceStorageKeyHex',
    'schema',
  ], 'peg-in Frontier mint-transition statement V1');
  requireLiteral(
    statement.schema,
    PEG_IN_FRONTIER_MINT_TRANSITION_STATEMENT_V1_SCHEMA,
    'peg-in Frontier mint-transition statement V1 schema',
  );
  const expected = derivePegInFrontierMintTransitionStatementV1(identity);
  requireLiteral(
    statement.parentNativeProcessedRecordStorageKeyHex,
    expected.parentNativeProcessedRecordStorageKeyHex,
    'parent native processed-record storage key',
  );
  requireLiteral(
    statement.recipientBalanceStorageKeyHex,
    expected.recipientBalanceStorageKeyHex,
    'recipient balance storage key',
  );
  return expected;
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unexpected field`);
  }
  return record;
}

function requireLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
  return expected;
}

function prefixedFixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase prefixed bytes`);
  }
  return value;
}
