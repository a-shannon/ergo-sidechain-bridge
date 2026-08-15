import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  decodePegInCausalPendingRecordKeysScaleV2,
  derivePegInCausalPendingAdmissionStorageKeyV2,
  derivePegInCausalRuntimeStorageKeysFromRecordKeyV2,
  derivePegInCausalRuntimeStorageKeysV2,
} from './peg-in-causal-runtime-state-v2.js';

const VECTOR = JSON.parse(readFileSync(new URL(
  '../test-vectors/native-finalized-peg-in-causal-mint-transition-v2.json',
  import.meta.url,
), 'utf8')) as Record<string, any>;

describe('peg-in causal runtime state V2', () => {
  it('matches every key frozen by the independent Rust vector', () => {
    const statement = VECTOR.request.statement;
    const runtimeRecord = VECTOR.request.mintTransitionRequest.contractStateRequest
      .eventRequest.executionIdentityRequest.statement;
    const actual = derivePegInCausalRuntimeStorageKeysV2({
      sidechainIdHex: VECTOR.request.mintTransitionRequest.contractStateRequest
        .eventRequest.executionIdentityRequest.trustAnchor.sidechainIdHex,
      ergoBoxIdHex: runtimeRecord.ergoBoxIdHex,
    });

    expect(actual).toEqual({
      recordKeyHex: statement.recordKeyHex,
      currentPegInProfileStorageKeyHex: statement.currentPegInProfileStorageKeyHex,
      currentCausalProfileStorageKeyHex: statement.currentCausalProfileStorageKeyHex,
      causalEnforcementStorageKeyHex: statement.causalEnforcementStorageKeyHex,
      pendingKeysStorageKeyHex: statement.pendingKeysStorageKeyHex,
      pendingAdmissionStorageKeyHex: statement.pendingAdmissionStorageKeyHex,
      processedRecordStorageKeyHex: statement.processedRecordStorageKeyHex,
      consumedAdmissionStorageKeyHex: statement.consumedAdmissionStorageKeyHex,
    });
    expect(Object.isFrozen(actual)).toBe(true);
  });

  it('rejects noncanonical record keys', () => {
    expect(() => derivePegInCausalRuntimeStorageKeysFromRecordKeyV2('0x01'))
      .toThrow(/32-byte value/i);
    expect(() => derivePegInCausalRuntimeStorageKeysFromRecordKeyV2(`0x${'AA'.repeat(32)}`))
      .toThrow(/lowercase/i);
  });

  it('decodes a canonical bounded pending-key list and derives every map key', () => {
    const keys = [`0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`];
    const decoded = decodePegInCausalPendingRecordKeysScaleV2(scalePendingKeys(keys));

    expect(decoded).toEqual(keys);
    expect(derivePegInCausalPendingAdmissionStorageKeyV2(decoded[1])).toBe(
      `0xaf86fef4216ac2bcd1c592b204011ad0cb7e16ec59f388e7c3727538de64dbb1${
        Buffer.from(blakejs.blake2b(
          Buffer.from('22'.repeat(32), 'hex'),
          undefined,
          16,
        )).toString('hex')
      }${'22'.repeat(32)}`,
    );
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it('accepts exactly the 256-entry acquisition bound', () => {
    const keys = Array.from({ length: 256 }, (_, index) =>
      `0x${(index + 1).toString(16).padStart(64, '0')}`,
    );

    expect(decodePegInCausalPendingRecordKeysScaleV2(scalePendingKeys(keys))).toEqual(keys);
  });

  it.each([
    ['noncanonical casing', '0xAA', /lowercase/i],
    ['truncated key', '0x0411', /malformed SCALE length/i],
    ['noncanonical compact length', `0x0100${'11'.repeat(64)}`, /noncanonical/i],
    ['zero key', scalePendingKeys([`0x${'00'.repeat(32)}`]), /zero key/i],
    [
      'duplicate key',
      scalePendingKeys([`0x${'11'.repeat(32)}`, `0x${'11'.repeat(32)}`]),
      /duplicate/i,
    ],
    [
      'too many keys',
      scalePendingKeys(Array.from({ length: 257 }, (_, index) =>
        `0x${index.toString(16).padStart(64, '0')}`,
      )),
      /exceeds 256/i,
    ],
  ] as const)('rejects %s', (_label, scaleHex, message) => {
    expect(() => decodePegInCausalPendingRecordKeysScaleV2(scaleHex)).toThrow(message);
  });
});

function scalePendingKeys(keys: readonly string[]): string {
  const count = keys.length;
  const prefix = count < 64
    ? Buffer.from([count << 2])
    : Buffer.from([(count << 2) | 1, count >> 6]);
  return `0x${Buffer.concat([
    prefix,
    ...keys.map(key => Buffer.from(key.slice(2), 'hex')),
  ]).toString('hex')}`;
}
