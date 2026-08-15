import { describe, expect, it } from 'vitest';

import {
  PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
  normalizeNativePegInStateStatementV1,
} from './native-finalized-peg-in-state.js';
import {
  MAX_PEG_IN_RUNTIME_ARTIFACT_SIZE_BYTES,
  MAX_PEG_IN_RUNTIME_BUILD_ATTESTATION_ID_BYTES,
  PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  normalizePegInRuntimeIdentityStatementV2,
} from './peg-in-runtime-identity-v2.js';
import {
  encodePegInRuntimeProfileV1ScaleHex,
  encodePegInRuntimeRecordV1ScaleHex,
  type PegInRuntimeProfileV1,
  type PegInRuntimeRecordV1,
} from './peg-in-runtime-state.js';

const SIDECHAIN_ID_HEX = `0x${'11'.repeat(32)}`;
const ERGO_BOX_ID_HEX = `0x${'22'.repeat(32)}`;
const PROFILE = {
  formatVersion: 1,
  sidechainIdHex: SIDECHAIN_ID_HEX,
  bridgeAddress: `0x${'33'.repeat(20)}`,
  profileRevision: '7',
  activationHeight: '100',
} satisfies PegInRuntimeProfileV1;
const RECORD = {
  formatVersion: 1,
  sidechainIdHex: SIDECHAIN_ID_HEX,
  bridgeAddress: PROFILE.bridgeAddress,
  profileRevision: PROFILE.profileRevision,
  profileActivationHeight: PROFILE.activationHeight,
  ergoBoxIdHex: ERGO_BOX_ID_HEX,
  recipientAddress: `0x${'44'.repeat(20)}`,
  amountNanoErg: '1000000000',
  sidechainHeight: '101',
  executionBlockHashHex: `0x${'55'.repeat(32)}`,
  transactionHashHex: `0x${'66'.repeat(32)}`,
  eventIndex: 3,
} satisfies PegInRuntimeRecordV1;
const PROFILE_SCALE_HEX = encodePegInRuntimeProfileV1ScaleHex(PROFILE);
const RECORD_SCALE_HEX = encodePegInRuntimeRecordV1ScaleHex(RECORD);
const RUNTIME_CODE = {
  storageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  artifactSha256Hex: `0x${'77'.repeat(32)}`,
  artifactSizeBytes: '1831356',
  buildAttestationId: 'frontier-runtime-2026-07-17-review-01',
  buildAttestationSha256Hex: `0x${'88'.repeat(32)}`,
};

describe('peg-in runtime-code identity statement V2', () => {
  it('normalizes the membership branch through the V1 record identity validator', () => {
    const normalized = normalizePegInRuntimeIdentityStatementV2(
      membershipStatement(),
      SIDECHAIN_ID_HEX,
    );

    expect(normalized).toEqual({
      schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
      ergoBoxIdHex: ERGO_BOX_ID_HEX,
      record: {
        outcome: 'membership',
        expectedRecordScaleHex: RECORD_SCALE_HEX,
      },
      runtimeCode: RUNTIME_CODE,
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.record)).toBe(true);
    expect(Object.isFrozen(normalized.runtimeCode)).toBe(true);
  });

  it('normalizes the non-membership branch through the V1 profile identity validator', () => {
    const normalized = normalizePegInRuntimeIdentityStatementV2(
      nonMembershipStatement(),
      SIDECHAIN_ID_HEX,
    );

    expect(normalized).toEqual({
      schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
      ergoBoxIdHex: ERGO_BOX_ID_HEX,
      expectedProfileScaleHex: PROFILE_SCALE_HEX,
      record: { outcome: 'nonMembership' },
      runtimeCode: RUNTIME_CODE,
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.record)).toBe(true);
    expect(Object.isFrozen(normalized.runtimeCode)).toBe(true);
  });

  it('accepts the exact artifact-size and portable-ID upper bounds', () => {
    const statement = membershipStatement();
    statement.runtimeCode.artifactSizeBytes =
      String(MAX_PEG_IN_RUNTIME_ARTIFACT_SIZE_BYTES);
    statement.runtimeCode.buildAttestationId =
      'a'.repeat(MAX_PEG_IN_RUNTIME_BUILD_ATTESTATION_ID_BYTES);

    const normalized = normalizePegInRuntimeIdentityStatementV2(
      statement,
      SIDECHAIN_ID_HEX,
    );
    expect(normalized.runtimeCode.artifactSizeBytes).toBe('4194304');
    expect(normalized.runtimeCode.buildAttestationId).toHaveLength(128);
  });

  it('rejects V1 input at the V2 boundary and V2 input at the V1 boundary', () => {
    const v1 = {
      schema: PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
      ergoBoxIdHex: ERGO_BOX_ID_HEX,
      record: {
        outcome: 'membership',
        expectedRecordScaleHex: RECORD_SCALE_HEX,
      },
    };
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(v1, SIDECHAIN_ID_HEX),
    ).toThrow(/schema/i);
    expect(() =>
      normalizeNativePegInStateStatementV1(membershipStatement(), SIDECHAIN_ID_HEX),
    ).toThrow(/schema/i);
  });

  it.each([
    ['missing top-level field', (value: Record<string, unknown>) => {
      delete value.runtimeCode;
    }],
    ['unknown top-level field', (value: Record<string, unknown>) => {
      value.unexpected = true;
    }],
    ['missing runtime-code field', (value: Record<string, unknown>) => {
      delete (value.runtimeCode as Record<string, unknown>).artifactSizeBytes;
    }],
    ['unknown runtime-code field', (value: Record<string, unknown>) => {
      (value.runtimeCode as Record<string, unknown>).unexpected = true;
    }],
    ['missing inherited record field', (value: Record<string, unknown>) => {
      delete (value.record as Record<string, unknown>).expectedRecordScaleHex;
    }],
    ['unknown inherited record field', (value: Record<string, unknown>) => {
      (value.record as Record<string, unknown>).unexpected = true;
    }],
  ])('rejects %s', (_label, mutate) => {
    const statement = clone(membershipStatement()) as Record<string, unknown>;
    mutate(statement);
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/unexpected field/i);
  });

  it('rejects a runtime-code key other than exact raw :code bytes', () => {
    const statement = clone(membershipStatement()) as {
      runtimeCode: Record<string, unknown>;
    };
    statement.runtimeCode.storageKeyHex = '0x3a436f6465';
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/storage key/i);
  });

  it.each([
    ['zero', `0x${'00'.repeat(32)}`],
    ['wrong length', `0x${'77'.repeat(31)}`],
    ['uppercase', `0x${'AA'.repeat(32)}`],
  ])('rejects a %s artifact digest', (_label, artifactSha256Hex) => {
    const statement = clone(membershipStatement());
    statement.runtimeCode.artifactSha256Hex = artifactSha256Hex;
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/artifact SHA-256/i);
  });

  it.each([
    ['zero', '0'],
    ['oversized', String(MAX_PEG_IN_RUNTIME_ARTIFACT_SIZE_BYTES + 1)],
    ['noncanonical leading zero', '01831356'],
    ['non-string', MAX_PEG_IN_RUNTIME_ARTIFACT_SIZE_BYTES],
  ])('rejects a %s artifact size', (_label, artifactSizeBytes) => {
    const statement = clone(membershipStatement()) as {
      runtimeCode: Record<string, unknown>;
    };
    statement.runtimeCode.artifactSizeBytes = artifactSizeBytes;
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/artifact size/i);
  });

  it.each([
    ['path-like', '../runtime-review'],
    ['uppercase', 'Runtime-Review-01'],
    ['repeated separator', 'runtime..review'],
    ['oversized', 'a'.repeat(MAX_PEG_IN_RUNTIME_BUILD_ATTESTATION_ID_BYTES + 1)],
  ])('rejects a %s build attestation ID', (_label, buildAttestationId) => {
    const statement = clone(membershipStatement());
    statement.runtimeCode.buildAttestationId = buildAttestationId;
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/attestation ID/i);
  });

  it.each([
    ['zero', `0x${'00'.repeat(32)}`],
    ['wrong length', `0x${'88'.repeat(33)}`],
    ['uppercase', `0x${'BB'.repeat(32)}`],
  ])('rejects a %s build attestation digest', (_label, buildAttestationSha256Hex) => {
    const statement = clone(membershipStatement());
    statement.runtimeCode.buildAttestationSha256Hex = buildAttestationSha256Hex;
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/attestation SHA-256/i);
  });

  it('rejects an inherited membership record sidechain mismatch', () => {
    const statement = clone(membershipStatement());
    statement.record.expectedRecordScaleHex = encodePegInRuntimeRecordV1ScaleHex({
      ...RECORD,
      sidechainIdHex: `0x${'99'.repeat(32)}`,
    });
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/record sidechain ID/i);
  });

  it('rejects an inherited membership record box mismatch', () => {
    const statement = clone(membershipStatement());
    statement.record.expectedRecordScaleHex = encodePegInRuntimeRecordV1ScaleHex({
      ...RECORD,
      ergoBoxIdHex: `0x${'99'.repeat(32)}`,
    });
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/record Ergo box ID/i);
  });

  it('rejects an inherited non-membership profile sidechain mismatch', () => {
    const statement = clone(nonMembershipStatement());
    statement.expectedProfileScaleHex = encodePegInRuntimeProfileV1ScaleHex({
      ...PROFILE,
      sidechainIdHex: `0x${'99'.repeat(32)}`,
    });
    expect(() =>
      normalizePegInRuntimeIdentityStatementV2(statement, SIDECHAIN_ID_HEX),
    ).toThrow(/profile sidechain ID/i);
  });
});

function membershipStatement() {
  return {
    schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
    ergoBoxIdHex: ERGO_BOX_ID_HEX,
    record: {
      outcome: 'membership' as const,
      expectedRecordScaleHex: RECORD_SCALE_HEX,
    },
    runtimeCode: { ...RUNTIME_CODE },
  };
}

function nonMembershipStatement() {
  return {
    schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
    ergoBoxIdHex: ERGO_BOX_ID_HEX,
    expectedProfileScaleHex: PROFILE_SCALE_HEX,
    record: {
      outcome: 'nonMembership' as const,
    },
    runtimeCode: { ...RUNTIME_CODE },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
