import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_JVM_FIXTURE_V1_SCHEMA,
  AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_SIGMASTATE_COMMIT,
  buildAuthenticatedExternalFeeSettlementJvmFixtureV1,
} from './authenticated-external-fee-settlement-jvm-fixture-v1.js';
import { parseStrictJson } from './strict-json.js';

const COMPILER_RECEIPT_PATH = resolve(
  import.meta.dirname,
  '..',
  'test-vectors',
  'authenticated-external-fee-settlement-jvm-compiler-v1.json',
);
const COMPILER_RECEIPT_SHA256 =
  '3e9757854f6bc12d5141d5bfb50dfe50889901a667c5742ebc3da3ad9d343a26';

describe('authenticated external-fee settlement JVM fixture V1', () => {
  it('binds the compiler receipt to deterministic partial and terminal bytes', async () => {
    const source = readFileSync(COMPILER_RECEIPT_PATH, 'ascii');
    const first =
      await buildAuthenticatedExternalFeeSettlementJvmFixtureV1(source);
    const second =
      await buildAuthenticatedExternalFeeSettlementJvmFixtureV1(source);

    expect(first).toEqual(second);
    expect(first.schema)
      .toBe(AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_JVM_FIXTURE_V1_SCHEMA);
    expect(first.sigmaStateCommit)
      .toBe(AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_SIGMASTATE_COMMIT);
    expect(first.compilerReceiptSha256Hex).toBe(COMPILER_RECEIPT_SHA256);
    expect(first.cases.map(entry => entry.kind))
      .toEqual(['partialVault', 'terminalVault']);
    expect(first.cases.every(entry =>
      entry.prooflessTransactionHex.length > 0
      && entry.prooflessTransactionIdHex.length === 64
      && entry.inputBoxSigmaHex.length === 3
      && entry.dataInputBoxSigmaHex.length === 1
    )).toBe(true);
    expect(first.cases[0].prooflessTransactionIdHex)
      .not.toBe(first.cases[1].prooflessTransactionIdHex);
    expect(Object.values(first.boundaries).every(value => value === false))
      .toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.cases[0])).toBe(true);
  });

  it('rejects coordinated compiler identity drift even when JSON stays valid', async () => {
    const source = readFileSync(COMPILER_RECEIPT_PATH, 'ascii');
    const receipt = structuredClone(parseStrictJson(source)) as {
      contracts: {
        mainChainAggregateUnlockAuthenticatedExternalFee: {
          propositionSha256Hex: string;
        };
      };
    };
    receipt.contracts.mainChainAggregateUnlockAuthenticatedExternalFee
      .propositionSha256Hex = '00'.repeat(32);

    await expect(buildAuthenticatedExternalFeeSettlementJvmFixtureV1(
      `${JSON.stringify(receipt, null, 2)}\n`,
    )).rejects.toThrow(/proposition digest does not match its bytes/);
  });

  it('rejects duplicate receipt keys and non-LF canonical input', async () => {
    const source = readFileSync(COMPILER_RECEIPT_PATH, 'ascii');
    const duplicateVersion = source.replace(
      '  "version": 1,',
      '  "version": 1,\n  "version": 1,',
    );

    await expect(buildAuthenticatedExternalFeeSettlementJvmFixtureV1(
      duplicateVersion,
    )).rejects.toThrow(/duplicate JSON object key/);
    await expect(buildAuthenticatedExternalFeeSettlementJvmFixtureV1(
      source.replace(/\n/g, '\r\n'),
    )).rejects.toThrow(/LF-only ASCII/);
  });
});
