import blakejs from 'blakejs';
import { concat, keccak256, toBeHex, zeroPadValue } from 'ethers';

export const PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA =
  'e2s.peg-in-frontier-contract-state-statement.v1' as const;

export const MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES = 1024 * 1024;

export const SUBSTRATE_EVM_ACCOUNT_CODES_STORAGE_PREFIX_HEX =
  '0x1da53b775b270400e7e61ed5cbc5a146ea70f53d5a3306ce02aaf97049cf181a' as const;
export const SUBSTRATE_EVM_ACCOUNT_STORAGES_STORAGE_PREFIX_HEX =
  '0x1da53b775b270400e7e61ed5cbc5a146ab1160471b1418779239ba8e2b847e42' as const;

const BRIDGE_OWNER_SLOT = 0n;
const BRIDGE_CONFIGURATION_SLOT = 3n;
const BRIDGE_PROCESSED_PEG_INS_MAPPING_SLOT = 4n;
const TOKEN_TOTAL_SUPPLY_SLOT = 2n;
const TOKEN_OWNER_SLOT = 5n;

export interface PegInFrontierContractStateStatementV1 {
  readonly schema: typeof PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly bridgeAccountCodeStorageKeyHex: string;
  readonly tokenAccountCodeStorageKeyHex: string;
  readonly bridgeOwnerStorageKeyHex: string;
  readonly bridgeConfigurationStorageKeyHex: string;
  readonly processedPegInStorageKeyHex: string;
  readonly tokenTotalSupplyStorageKeyHex: string;
  readonly tokenOwnerStorageKeyHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: string;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: string;
}

export interface PegInFrontierContractStateStorageKeysV1 {
  readonly bridgeAccountCodeStorageKeyHex: string;
  readonly tokenAccountCodeStorageKeyHex: string;
  readonly bridgeOwnerStorageKeyHex: string;
  readonly bridgeConfigurationStorageKeyHex: string;
  readonly processedPegInStorageKeyHex: string;
  readonly tokenTotalSupplyStorageKeyHex: string;
  readonly tokenOwnerStorageKeyHex: string;
}

/** Derive one exact `pallet_evm::AccountCodes` top-trie key. */
export function deriveFrontierAccountCodeStorageKeyV1Hex(addressHex: unknown): string {
  const address = fixedHexBytes(addressHex, 20, 'Frontier EVM account-code address');
  return `${SUBSTRATE_EVM_ACCOUNT_CODES_STORAGE_PREFIX_HEX}${blake2b128Hex(address)}${address}`;
}

/** Derive one exact `pallet_evm::AccountStorages` top-trie key. */
export function deriveFrontierAccountStorageKeyV1Hex(
  addressHex: unknown,
  slotHex: unknown,
): string {
  const address = fixedHexBytes(addressHex, 20, 'Frontier EVM account-storage address');
  const slot = fixedHexBytes(slotHex, 32, 'Frontier EVM account-storage slot');
  return `${SUBSTRATE_EVM_ACCOUNT_STORAGES_STORAGE_PREFIX_HEX}`
    + `${blake2b128Hex(address)}${address}${blake2b128Hex(slot)}${slot}`;
}

/** Derive the exact seven additional keys authenticated by the contract-state profile. */
export function derivePegInFrontierContractStateStorageKeysV1(input: {
  readonly bridgeAddressHex: unknown;
  readonly tokenAddressHex: unknown;
  readonly ergoBoxIdHex: unknown;
}): PegInFrontierContractStateStorageKeysV1 {
  const bridgeAddressHex = prefixedFixedHex(
    input?.bridgeAddressHex,
    20,
    'Frontier bridge address',
  );
  const tokenAddressHex = prefixedFixedHex(
    input?.tokenAddressHex,
    20,
    'Frontier token address',
  );
  if (bridgeAddressHex === `0x${'00'.repeat(20)}`) {
    throw new Error('Frontier bridge address must be nonzero');
  }
  if (tokenAddressHex === `0x${'00'.repeat(20)}`) {
    throw new Error('Frontier token address must be nonzero');
  }
  if (bridgeAddressHex === tokenAddressHex) {
    throw new Error('Frontier bridge and token addresses must differ');
  }
  const ergoBoxIdHex = prefixedFixedHex(
    input?.ergoBoxIdHex,
    32,
    'Frontier peg-in Ergo box ID',
  );
  if (ergoBoxIdHex === `0x${'00'.repeat(32)}`) {
    throw new Error('Frontier peg-in Ergo box ID must be nonzero');
  }
  const processedPegInSlotHex = keccak256(concat([
    ergoBoxIdHex,
    zeroPadValue(toBeHex(BRIDGE_PROCESSED_PEG_INS_MAPPING_SLOT), 32),
  ]));

  return deepFreeze({
    bridgeAccountCodeStorageKeyHex:
      deriveFrontierAccountCodeStorageKeyV1Hex(bridgeAddressHex),
    tokenAccountCodeStorageKeyHex:
      deriveFrontierAccountCodeStorageKeyV1Hex(tokenAddressHex),
    bridgeOwnerStorageKeyHex: deriveFrontierAccountStorageKeyV1Hex(
      bridgeAddressHex,
      uint256Hex(BRIDGE_OWNER_SLOT),
    ),
    bridgeConfigurationStorageKeyHex: deriveFrontierAccountStorageKeyV1Hex(
      bridgeAddressHex,
      uint256Hex(BRIDGE_CONFIGURATION_SLOT),
    ),
    processedPegInStorageKeyHex: deriveFrontierAccountStorageKeyV1Hex(
      bridgeAddressHex,
      processedPegInSlotHex,
    ),
    tokenTotalSupplyStorageKeyHex: deriveFrontierAccountStorageKeyV1Hex(
      tokenAddressHex,
      uint256Hex(TOKEN_TOTAL_SUPPLY_SLOT),
    ),
    tokenOwnerStorageKeyHex: deriveFrontierAccountStorageKeyV1Hex(
      tokenAddressHex,
      uint256Hex(TOKEN_OWNER_SLOT),
    ),
  });
}

/**
 * Normalize exact code identities and storage keys for one authenticated post-block EVM state.
 *
 * This is a pure statement codec. It performs no RPC, proof execution, mint selection, signing,
 * submission, broadcast, or lifecycle mutation.
 */
export function normalizePegInFrontierContractStateStatementV1(
  value: unknown,
  ergoBoxIdHex: unknown,
): PegInFrontierContractStateStatementV1 {
  const statement = exactRecord(value, [
    'bridgeAccountCodeStorageKeyHex',
    'bridgeAddressHex',
    'bridgeConfigurationStorageKeyHex',
    'bridgeOwnerStorageKeyHex',
    'bridgeRuntimeCodeBytes',
    'bridgeRuntimeCodeSha256Hex',
    'processedPegInStorageKeyHex',
    'schema',
    'tokenAccountCodeStorageKeyHex',
    'tokenAddressHex',
    'tokenOwnerStorageKeyHex',
    'tokenRuntimeCodeBytes',
    'tokenRuntimeCodeSha256Hex',
    'tokenTotalSupplyStorageKeyHex',
  ], 'peg-in Frontier contract-state statement V1');
  requireLiteral(
    statement.schema,
    PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
    'peg-in Frontier contract-state statement V1 schema',
  );
  const bridgeAddressHex = prefixedFixedHex(
    statement.bridgeAddressHex,
    20,
    'Frontier bridge address',
  );
  const tokenAddressHex = prefixedFixedHex(
    statement.tokenAddressHex,
    20,
    'Frontier token address',
  );
  const expectedKeys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex,
    tokenAddressHex,
    ergoBoxIdHex,
  });
  for (const [field, expected] of Object.entries(expectedKeys)) {
    requireLiteral(statement[field], expected, `Frontier contract-state ${field}`);
  }

  return deepFreeze({
    schema: PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
    bridgeAddressHex,
    tokenAddressHex,
    ...expectedKeys,
    bridgeRuntimeCodeSha256Hex: prefixedFixedHex(
      statement.bridgeRuntimeCodeSha256Hex,
      32,
      'Frontier bridge runtime-code SHA-256',
    ),
    bridgeRuntimeCodeBytes: positiveDecimalString(
      statement.bridgeRuntimeCodeBytes,
      MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES,
      'Frontier bridge runtime-code byte count',
    ),
    tokenRuntimeCodeSha256Hex: prefixedFixedHex(
      statement.tokenRuntimeCodeSha256Hex,
      32,
      'Frontier token runtime-code SHA-256',
    ),
    tokenRuntimeCodeBytes: positiveDecimalString(
      statement.tokenRuntimeCodeBytes,
      MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES,
      'Frontier token runtime-code byte count',
    ),
  });
}

function uint256Hex(value: bigint): string {
  return zeroPadValue(toBeHex(value), 32);
}

function blake2b128Hex(unprefixedHex: string): string {
  return Buffer.from(blakejs.blake2b(Buffer.from(unprefixedHex, 'hex'), undefined, 16))
    .toString('hex');
}

function fixedHexBytes(value: unknown, bytes: number, label: string): string {
  return prefixedFixedHex(value, bytes, label).slice(2);
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

function positiveDecimalString(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(max)) {
    throw new Error(`${label} exceeds ${max}`);
  }
  return value;
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
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length
    || actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(`${label} has an unexpected field`);
  }
  return record;
}

function requireLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
  return expected;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
