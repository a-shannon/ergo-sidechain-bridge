import {
  PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
  normalizePegInRuntimeIdentityStatementV2,
  type PegInRuntimeCodeIdentityV2,
} from './peg-in-runtime-identity-v2.js';

export const PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA =
  'e2s.peg-in-frontier-execution-identity-statement.v1' as const;
export const SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX =
  '0x2013754dd003840aea66b349f8241e25c8c156f8164e0465c74b8972ea68b4b3' as const;

export interface PegInFrontierExecutionIdentityStatementV1 {
  readonly schema: typeof PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA;
  readonly runtimeCode: PegInRuntimeCodeIdentityV2;
  readonly currentBlockStorageKeyHex:
    typeof SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX;
  readonly ergoBoxIdHex: string;
  readonly expectedRecordScaleHex: string;
}

/**
 * Normalize one membership-only statement for the runtime, Frontier block, and peg-in record.
 *
 * This validates statement identities only. It does not fetch or verify a state proof, execute a
 * native verifier, or grant mint, lifecycle, signing, submission, or broadcast authority.
 */
export function normalizePegInFrontierExecutionIdentityStatementV1(
  value: unknown,
  sidechainIdHex: string,
): PegInFrontierExecutionIdentityStatementV1 {
  const statement = exactRecord(
    value,
    [
      'currentBlockStorageKeyHex',
      'ergoBoxIdHex',
      'expectedRecordScaleHex',
      'runtimeCode',
      'schema',
    ],
    'peg-in Frontier execution identity statement V1',
  );
  requireLiteral(
    statement.schema,
    PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA,
    'peg-in Frontier execution identity statement V1 schema',
  );
  requireLiteral(
    statement.currentBlockStorageKeyHex,
    SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    'Ethereum CurrentBlock storage key',
  );

  const inheritedMembership = normalizePegInRuntimeIdentityStatementV2(
    {
      schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
      ergoBoxIdHex: statement.ergoBoxIdHex,
      record: {
        outcome: 'membership',
        expectedRecordScaleHex: statement.expectedRecordScaleHex,
      },
      runtimeCode: statement.runtimeCode,
    },
    sidechainIdHex,
  );
  if (inheritedMembership.record.outcome !== 'membership') {
    throw new Error('peg-in Frontier execution identity statement changed membership branch');
  }

  return deepFreeze({
    schema: PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA,
    runtimeCode: inheritedMembership.runtimeCode,
    currentBlockStorageKeyHex: SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    ergoBoxIdHex: inheritedMembership.ergoBoxIdHex,
    expectedRecordScaleHex: inheritedMembership.record.expectedRecordScaleHex,
  });
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
  if (value !== expected) {
    throw new Error(`${label} must be exactly ${expected}`);
  }
  return expected;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
