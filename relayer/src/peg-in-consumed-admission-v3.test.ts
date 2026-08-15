import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const vector = JSON.parse(
  readFileSync(
    new URL('../test-vectors/peg-in-consumed-admission-v3.json', import.meta.url),
    'utf8',
  ),
) as Record<string, any>;

describe('peg-in consumed admission V3', () => {
  it('reproduces the parent-bound canonical bytes and identifier', async () => {
    const api = await loadAdmissionApi();
    const encoded = api.encodePegInConsumedAdmissionV3Hex(vector.consumedAdmission);

    expect(vector.schema).toBe('e2s.peg-in-consumed-admission-vector.v3');
    expect(vector.inheritsAdmissionVectorSchema).toBe(
      'e2s.peg-in-causal-admission-vector.v2',
    );
    expect(api.PEG_IN_CONSUMED_ADMISSION_FORMAT_VERSION).toBe(3);
    expect(api.PEG_IN_CONSUMED_ADMISSION_V3_BYTES).toBe(
      vector.expected.consumedAdmissionBytes,
    );
    expect(encoded).toBe(vector.expected.consumedAdmissionHex);
    expect(api.decodePegInConsumedAdmissionV3Hex(encoded)).toEqual(
      vector.consumedAdmission,
    );
    expect(api.blake2b256Hex(encoded)).toBe(
      vector.expected.consumedAdmissionBlake2b256Hex,
    );
  });

  it('rejects V2 bytes and isolates every parent/mint coordinate', async () => {
    const api = await loadAdmissionApi();
    expect(() => api.decodePegInConsumedAdmissionV3Hex(
      `0x02${vector.expected.consumedAdmissionHex.slice(4)}`,
    )).toThrow('format version');

    for (const mutate of [
      (value: any) => { value.admissionIdHex = repeatHex('93', 32); },
      (value: any) => { value.sourceIntentIdHex = repeatHex('f1', 32); },
      (value: any) => { value.legacyMintIdentityHex = repeatHex('c5', 32); },
      (value: any) => { value.nativeParentBlockHashHex = repeatHex('19', 32); },
      (value: any) => { value.nativeMintHeight = '1202'; },
      (value: any) => { value.executionBlockHashHex = repeatHex('1a', 32); },
      (value: any) => { value.executionHeight = '1202'; },
      (value: any) => { value.transactionHashHex = repeatHex('1b', 32); },
      (value: any) => { value.transactionIndex = 3; },
      (value: any) => { value.eventIndex = 5; },
      (value: any) => { value.processedRecordBlake2b256Hex = repeatHex('e7', 32); },
    ]) {
      const candidate = structuredClone(vector.consumedAdmission);
      mutate(candidate);
      expect(api.encodePegInConsumedAdmissionV3Hex(candidate)).not.toBe(
        vector.expected.consumedAdmissionHex,
      );
    }
  });
});

async function loadAdmissionApi(): Promise<any> {
  let loaded: any;
  let failure: unknown;
  try {
    loaded = await import('./peg-in-causal-admission-v2.js');
  } catch (error) {
    failure = error;
  }
  expect(failure === undefined, `module load failed: ${String(failure)}`).toBe(true);
  return loaded;
}

function repeatHex(byte: string, bytes: number): string {
  return `0x${byte.repeat(bytes)}`;
}
