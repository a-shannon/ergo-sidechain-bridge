import { describe, expect, it } from 'vitest';

import {
  PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA,
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
  normalizePegInFrontierExecutionIdentityStatementV1,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
} from './peg-in-runtime-identity-v2.js';
import {
  encodePegInRuntimeRecordV1ScaleHex,
  type PegInRuntimeRecordV1,
} from './peg-in-runtime-state.js';

const SIDECHAIN_ID_HEX = `0x${'11'.repeat(32)}`;
const ERGO_BOX_ID_HEX = `0x${'22'.repeat(32)}`;
const RECORD = {
  formatVersion: 1,
  sidechainIdHex: SIDECHAIN_ID_HEX,
  bridgeAddress: `0x${'33'.repeat(20)}`,
  profileRevision: '7',
  profileActivationHeight: '100',
  ergoBoxIdHex: ERGO_BOX_ID_HEX,
  recipientAddress: `0x${'44'.repeat(20)}`,
  amountNanoErg: '1000000000',
  sidechainHeight: '101',
  executionBlockHashHex: `0x${'55'.repeat(32)}`,
  transactionHashHex: `0x${'66'.repeat(32)}`,
  eventIndex: 3,
} satisfies PegInRuntimeRecordV1;
const RECORD_SCALE_HEX = encodePegInRuntimeRecordV1ScaleHex(RECORD);
const RUNTIME_CODE = {
  storageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  artifactSha256Hex: `0x${'77'.repeat(32)}`,
  artifactSizeBytes: '1831356',
  buildAttestationId: 'frontier-runtime-2026-07-18-review-01',
  buildAttestationSha256Hex: `0x${'88'.repeat(32)}`,
};

describe('peg-in Frontier execution identity statement V1', () => {
  it('pins the exact Ethereum CurrentBlock storage key', () => {
    expect(SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX).toBe(
      '0x2013754dd003840aea66b349f8241e25c8c156f8164e0465c74b8972ea68b4b3',
    );
  });

  it('normalizes and freezes the exact membership statement', () => {
    const normalized = normalizePegInFrontierExecutionIdentityStatementV1(
      statement(),
      SIDECHAIN_ID_HEX,
    );

    expect(normalized).toEqual(statement());
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.runtimeCode)).toBe(true);
  });

  it.each([
    ['schema', (value: ReturnType<typeof statement>) => {
      value.schema = 'e2s.native-finalized-peg-in-frontier-execution-identity-request.v1' as never;
    }, /schema/i],
    ['CurrentBlock key', (value: ReturnType<typeof statement>) => {
      value.currentBlockStorageKeyHex = `0x${'00'.repeat(32)}` as never;
    }, /CurrentBlock storage key/i],
    ['record sidechain', (value: ReturnType<typeof statement>) => {
      value.expectedRecordScaleHex = encodePegInRuntimeRecordV1ScaleHex({
        ...RECORD,
        sidechainIdHex: `0x${'99'.repeat(32)}`,
      });
    }, /record sidechain ID/i],
    ['record box', (value: ReturnType<typeof statement>) => {
      value.expectedRecordScaleHex = encodePegInRuntimeRecordV1ScaleHex({
        ...RECORD,
        ergoBoxIdHex: `0x${'99'.repeat(32)}`,
      });
    }, /record Ergo box ID/i],
    ['runtime code key', (value: ReturnType<typeof statement>) => {
      value.runtimeCode.storageKeyHex = '0x3a436f6465' as never;
    }, /runtime code storage key/i],
    ['runtime artifact digest', (value: ReturnType<typeof statement>) => {
      value.runtimeCode.artifactSha256Hex = `0x${'00'.repeat(32)}`;
    }, /artifact SHA-256/i],
  ] as const)('rejects %s drift', (_label, mutate, message) => {
    const candidate = structuredClone(statement());
    mutate(candidate);
    expect(() => normalizePegInFrontierExecutionIdentityStatementV1(
      candidate,
      SIDECHAIN_ID_HEX,
    )).toThrow(message);
  });

  it.each([
    ['missing field', (value: Record<string, unknown>) => {
      delete value.expectedRecordScaleHex;
    }],
    ['unknown field', (value: Record<string, unknown>) => {
      value.record = { outcome: 'membership' };
    }],
  ])('rejects an exact-shape violation: %s', (_label, mutate) => {
    const candidate = structuredClone(statement()) as Record<string, unknown>;
    mutate(candidate);
    expect(() => normalizePegInFrontierExecutionIdentityStatementV1(
      candidate,
      SIDECHAIN_ID_HEX,
    )).toThrow(/unexpected field/i);
  });
});

function statement() {
  return {
    schema: PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA,
    runtimeCode: { ...RUNTIME_CODE },
    currentBlockStorageKeyHex: SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    ergoBoxIdHex: ERGO_BOX_ID_HEX,
    expectedRecordScaleHex: RECORD_SCALE_HEX,
  };
}
