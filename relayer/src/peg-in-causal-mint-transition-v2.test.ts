import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const vector = JSON.parse(
  readFileSync(
    new URL('../test-vectors/peg-in-causal-admission-v2.json', import.meta.url),
    'utf8',
  ),
) as Record<string, any>;
const consumedVector = JSON.parse(
  readFileSync(
    new URL('../test-vectors/peg-in-consumed-admission-v3.json', import.meta.url),
    'utf8',
  ),
) as Record<string, any>;

describe('peg-in causal mint transition V2', () => {
  it('requires one parent-state admission to disappear into exact V1 and V3 records', async () => {
    const api = await loadTransitionApi();
    expect(() => api.assertPegInCausalMintTransitionV2(fixture())).not.toThrow();

    const cutoverAdmission = fixture();
    cutoverAdmission.parent.pendingAdmission.admittedAtNativeHeight =
      cutoverAdmission.admissionProfile.activationHeight;
    expect(() => api.assertPegInCausalMintTransitionV2(cutoverAdmission)).not.toThrow();
  });

  it('rejects missing, replayed, same-block, retained, or mis-keyed admission state', async () => {
    const api = await loadTransitionApi();
    const mutations: Array<(value: any) => void> = [
      value => { value.parent.pendingAdmission = null; },
      value => { value.parent.processedRecordScaleHex = vector.expected.processedRecordScaleHex; },
      value => {
        value.parent.consumedAdmissionV3Hex = consumedVector.expected.consumedAdmissionHex;
      },
      value => { value.post.pendingAdmission = clone(value.parent.pendingAdmission); },
      value => { value.parent.pendingAdmission.keyHex = repeatHex('c5', 32); },
      value => { value.post.processedRecordKeyHex = repeatHex('c5', 32); },
      value => { value.post.consumedAdmissionKeyHex = repeatHex('c5', 32); },
      value => { value.parent.pendingAdmission.admittedAtNativeHeight = '1201'; },
      value => { value.parent.pendingAdmission.admittedAtNativeHeight = '999'; },
    ];
    for (const mutate of mutations) {
      const candidate = fixture();
      mutate(candidate);
      expect(() => api.assertPegInCausalMintTransitionV2(candidate)).toThrow();
    }
  });

  it('rejects non-consecutive native state and every mismatched mint field', async () => {
    const api = await loadTransitionApi();
    const mutations: Array<(value: any) => void> = [
      value => { value.event.nativeParentBlockHashHex = repeatHex('19', 32); },
      value => { value.event.nativeHeight = '1202'; },
      value => { value.event.ergoBoxIdHex = repeatHex('a1', 32); },
      value => { value.event.tokenAddressHex = repeatHex('45', 20); },
      value => { value.event.recipientAddressHex = repeatHex('9a', 20); },
      value => { value.event.amountNanoErg = '2000001'; },
      value => { value.event.executionBlockHashHex = repeatHex('1a', 32); },
      value => { value.event.executionHeight = '1202'; },
      value => { value.event.transactionHashHex = repeatHex('1b', 32); },
      value => { value.event.transactionIndex = 3; },
      value => { value.event.eventIndex = 5; },
      value => { value.runtimeProfileV1.sidechainIdHex = repeatHex('23', 32); },
      value => { value.runtimeProfileV1.bridgeAddress = repeatHex('34', 20); },
      value => { value.runtimeProfileV1.activationHeight = '1201'; },
    ];
    for (const mutate of mutations) {
      const candidate = fixture();
      mutate(candidate);
      expect(() => api.assertPegInCausalMintTransitionV2(candidate)).toThrow();
    }
  });

  it('rejects admission, profile, proof, processed-record, or consumed-record drift', async () => {
    const api = await loadTransitionApi();
    const mutations: Array<(value: any) => void> = [
      value => { value.parent.pendingAdmission.profileIdHex = repeatHex('70', 32); },
      value => { value.parent.pendingAdmission.admissionIdHex = repeatHex('93', 32); },
      value => { value.parent.pendingAdmission.proofSystemIdHex = repeatHex('78', 32); },
      value => { value.parent.pendingAdmission.proofProfileIdHex = repeatHex('89', 32); },
      value => {
        value.parent.pendingAdmission.sourceIntentHex = replaceByte(
          value.parent.pendingAdmission.sourceIntentHex,
          80,
          '34',
        );
      },
      value => {
        value.parent.pendingAdmission.statementHex = replaceByte(
          value.parent.pendingAdmission.statementHex,
          70,
          'a1',
        );
      },
      value => {
        value.post.processedRecordScaleHex = replaceByte(
          value.post.processedRecordScaleHex,
          110,
          '9a',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          5,
          '93',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          40,
          'f1',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          70,
          'c5',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          100,
          '19',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          136,
          'b2',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          145,
          '1a',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          176,
          'b2',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          185,
          '1b',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          212,
          '03',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          216,
          '05',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = replaceByte(
          value.post.consumedAdmissionV3Hex,
          220,
          'e7',
        );
      },
      value => {
        value.post.consumedAdmissionV3Hex = vector.expected.consumedAdmissionHex;
      },
      value => { value.admissionProfile.proofSystemIdHex = repeatHex('78', 32); },
      value => { value.admissionProfile.proofProfileIdHex = repeatHex('89', 32); },
    ];
    for (const mutate of mutations) {
      const candidate = fixture();
      mutate(candidate);
      expect(() => api.assertPegInCausalMintTransitionV2(candidate)).toThrow();
    }
  });
});

function fixture(): Record<string, any> {
  return {
    admissionProfile: clone(vector.profile),
    runtimeProfileV1: {
      formatVersion: 1,
      sidechainIdHex: vector.profile.sidechainIdHex,
      bridgeAddress: vector.profile.bridgeAddressHex,
      profileRevision: vector.transition.processedRecord.profileRevision,
      activationHeight: vector.transition.processedRecord.profileActivationHeight,
    },
    parent: {
      nativeBlockHashHex: vector.transition.parentNativeBlockHashHex,
      nativeHeight: vector.transition.parentNativeHeight,
      pendingAdmission: {
        keyHex: vector.expected.legacyMintIdentityHex,
        profileIdHex: vector.expected.profileIdHex,
        sourceIntentHex: vector.expected.sourceIntentHex,
        statementHex: vector.expected.statementHex,
        admissionIdHex: vector.expected.admissionIdHex,
        admittedAtNativeHeight: vector.transition.admittedAtNativeHeight,
        proofSystemIdHex: vector.profile.proofSystemIdHex,
        proofProfileIdHex: vector.profile.proofProfileIdHex,
      },
      processedRecordScaleHex: null,
      consumedAdmissionV3Hex: null,
    },
    event: {
      nativeParentBlockHashHex: vector.transition.eventNativeParentBlockHashHex,
      nativeHeight: vector.transition.eventNativeHeight,
      executionBlockHashHex: vector.transition.executionBlockHashHex,
      executionHeight: vector.transition.executionHeight,
      transactionHashHex: vector.transition.transactionHashHex,
      transactionIndex: vector.transition.transactionIndex,
      eventIndex: vector.transition.eventIndex,
      ergoBoxIdHex: vector.statement.sourceBoxIdHex,
      tokenAddressHex: vector.sourceIntent.tokenAddressHex,
      recipientAddressHex: vector.sourceIntent.recipientAddressHex,
      amountNanoErg: vector.sourceIntent.amountNanoErg,
    },
    post: {
      pendingAdmission: null,
      processedRecordKeyHex: vector.expected.legacyMintIdentityHex,
      processedRecordScaleHex: vector.expected.processedRecordScaleHex,
      consumedAdmissionKeyHex: vector.expected.legacyMintIdentityHex,
      consumedAdmissionV3Hex: consumedVector.expected.consumedAdmissionHex,
    },
  };
}

async function loadTransitionApi(): Promise<any> {
  let loaded: any;
  let failure: unknown;
  try {
    loaded = await import('./peg-in-causal-mint-transition-v2.js');
  } catch (error) {
    failure = error;
  }
  expect(failure === undefined, `module load failed: ${String(failure)}`).toBe(true);
  return loaded;
}

function repeatHex(byte: string, bytes: number): string {
  return `0x${byte.repeat(bytes)}`;
}

function replaceByte(value: string, byteIndex: number, replacement: string): string {
  const start = 2 + byteIndex * 2;
  return `${value.slice(0, start)}${replacement}${value.slice(start + 2)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
