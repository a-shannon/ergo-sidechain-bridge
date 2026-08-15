import {
  PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
  normalizeNativePegInStateStatementV1,
} from './native-finalized-peg-in-state.js';

export const PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA =
  'e2s.peg-in-runtime-identity-statement.v2' as const;
export const SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX = '0x3a636f6465' as const;
export const MAX_PEG_IN_RUNTIME_ARTIFACT_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_PEG_IN_RUNTIME_BUILD_ATTESTATION_ID_BYTES = 128;

const MEMBERSHIP = 'membership' as const;
const NON_MEMBERSHIP = 'nonMembership' as const;
const PORTABLE_BUILD_ATTESTATION_ID =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export interface PegInRuntimeCodeIdentityV2 {
  readonly storageKeyHex: typeof SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX;
  readonly artifactSha256Hex: string;
  readonly artifactSizeBytes: string;
  readonly buildAttestationId: string;
  readonly buildAttestationSha256Hex: string;
}

export type PegInRuntimeIdentityStatementV2 =
  | {
    readonly schema: typeof PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA;
    readonly ergoBoxIdHex: string;
    readonly record: {
      readonly outcome: typeof MEMBERSHIP;
      readonly expectedRecordScaleHex: string;
    };
    readonly runtimeCode: PegInRuntimeCodeIdentityV2;
  }
  | {
    readonly schema: typeof PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA;
    readonly ergoBoxIdHex: string;
    readonly expectedProfileScaleHex: string;
    readonly record: {
      readonly outcome: typeof NON_MEMBERSHIP;
    };
    readonly runtimeCode: PegInRuntimeCodeIdentityV2;
  };

/**
 * Normalize a statement that binds V1 peg-in state semantics to one expected runtime artifact.
 *
 * This validates only statement bytes and identities. It does not verify the build attestation,
 * prove the runtime code at a finalized state root, or grant mint authority.
 */
export function normalizePegInRuntimeIdentityStatementV2(
  value: unknown,
  sidechainIdHex: string,
): PegInRuntimeIdentityStatementV2 {
  const statement = objectRecord(value, 'peg-in runtime identity statement V2');
  requireLiteral(
    statement.schema,
    PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
    'peg-in runtime identity statement V2 schema',
  );
  const expectation = objectRecord(
    statement.record,
    'peg-in runtime identity record expectation',
  );

  if (expectation.outcome === MEMBERSHIP) {
    exactKeys(
      statement,
      ['ergoBoxIdHex', 'record', 'runtimeCode', 'schema'],
      'peg-in runtime identity membership statement',
    );
    const runtimeCode = normalizeRuntimeCodeIdentity(statement.runtimeCode);
    const normalizedV1 = normalizeNativePegInStateStatementV1(
      {
        schema: PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
        ergoBoxIdHex: statement.ergoBoxIdHex,
        record: statement.record,
      },
      sidechainIdHex,
    );
    if (normalizedV1.record.outcome !== MEMBERSHIP) {
      throw new Error('peg-in runtime identity membership statement changed V1 branch');
    }
    return deepFreeze({
      schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
      ergoBoxIdHex: normalizedV1.ergoBoxIdHex,
      record: normalizedV1.record,
      runtimeCode,
    });
  }

  if (expectation.outcome === NON_MEMBERSHIP) {
    exactKeys(
      statement,
      ['ergoBoxIdHex', 'expectedProfileScaleHex', 'record', 'runtimeCode', 'schema'],
      'peg-in runtime identity non-membership statement',
    );
    const runtimeCode = normalizeRuntimeCodeIdentity(statement.runtimeCode);
    const normalizedV1 = normalizeNativePegInStateStatementV1(
      {
        schema: PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
        ergoBoxIdHex: statement.ergoBoxIdHex,
        expectedProfileScaleHex: statement.expectedProfileScaleHex,
        record: statement.record,
      },
      sidechainIdHex,
    );
    if (
      normalizedV1.record.outcome !== NON_MEMBERSHIP
      || !('expectedProfileScaleHex' in normalizedV1)
    ) {
      throw new Error('peg-in runtime identity non-membership statement changed V1 branch');
    }
    return deepFreeze({
      schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
      ergoBoxIdHex: normalizedV1.ergoBoxIdHex,
      expectedProfileScaleHex: normalizedV1.expectedProfileScaleHex,
      record: normalizedV1.record,
      runtimeCode,
    });
  }

  throw new Error('peg-in runtime identity record expectation outcome is unsupported');
}

function normalizeRuntimeCodeIdentity(value: unknown): PegInRuntimeCodeIdentityV2 {
  const runtimeCode = exactRecord(value, [
    'artifactSha256Hex',
    'artifactSizeBytes',
    'buildAttestationId',
    'buildAttestationSha256Hex',
    'storageKeyHex',
  ], 'peg-in runtime code identity');
  requireLiteral(
    runtimeCode.storageKeyHex,
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    'peg-in runtime code storage key',
  );
  return {
    storageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    artifactSha256Hex: nonzeroSha256Hex(
      runtimeCode.artifactSha256Hex,
      'peg-in runtime artifact SHA-256',
    ),
    artifactSizeBytes: positiveBoundedDecimal(
      runtimeCode.artifactSizeBytes,
      MAX_PEG_IN_RUNTIME_ARTIFACT_SIZE_BYTES,
      'peg-in runtime artifact size',
    ),
    buildAttestationId: portableBuildAttestationId(runtimeCode.buildAttestationId),
    buildAttestationSha256Hex: nonzeroSha256Hex(
      runtimeCode.buildAttestationSha256Hex,
      'peg-in runtime build attestation SHA-256',
    ),
  };
}

function portableBuildAttestationId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_PEG_IN_RUNTIME_BUILD_ATTESTATION_ID_BYTES
    || !PORTABLE_BUILD_ATTESTATION_ID.test(value)
  ) {
    throw new Error(
      `peg-in runtime build attestation ID must be a portable lowercase ASCII identifier of at most ${MAX_PEG_IN_RUNTIME_BUILD_ATTESTATION_ID_BYTES} bytes`,
    );
  }
  return value;
}

function positiveBoundedDecimal(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  if (BigInt(value) > BigInt(max)) {
    throw new Error(`${label} exceeds ${max} bytes`);
  }
  return value;
}

function nonzeroSha256Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be exactly 32 lowercase 0x-prefixed bytes`);
  }
  if (/^0x0+$/.test(value)) {
    throw new Error(`${label} must not be zero`);
  }
  return value;
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = objectRecord(value, label);
  exactKeys(record, expectedKeys, label);
  return record;
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unexpected field`);
  }
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
