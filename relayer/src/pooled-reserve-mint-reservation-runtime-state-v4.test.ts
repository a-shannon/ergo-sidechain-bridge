import { describe, expect, it } from 'vitest';

import { SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX } from './peg-in-runtime-identity-v2.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_CONSUMED_MAP_PREFIX_V4_HEX,
  POOLED_RESERVE_MINT_RESERVATION_CURRENT_PROFILE_STORAGE_KEY_V4_HEX,
  POOLED_RESERVE_MINT_RESERVATION_ENFORCEMENT_STORAGE_KEY_V4_HEX,
  POOLED_RESERVE_MINT_RESERVATION_INVALIDATED_MAP_PREFIX_V4_HEX,
  POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_STORAGE_KEY_V4_HEX,
  POOLED_RESERVE_MINT_RESERVATION_PENDING_MAP_PREFIX_V4_HEX,
  decodePooledReserveMintReservationPendingKeysScaleV4,
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';

const RESERVATION_KEY = `0x${'11'.repeat(32)}`;
const BLAKE2_128 = '7f9c299f1d9bbe856fbf2c98f0f91435';

describe('pooled-reserve mint-reservation runtime state V4', () => {
  it('derives the exact seven-key source-locked storage surface', () => {
    const keys =
      derivePooledReserveMintReservationRuntimeStorageKeysV4(RESERVATION_KEY);

    expect(keys).toEqual({
      reservationKeyHex: RESERVATION_KEY,
      runtimeCodeStorageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      currentProfileStorageKeyHex:
        POOLED_RESERVE_MINT_RESERVATION_CURRENT_PROFILE_STORAGE_KEY_V4_HEX,
      enforcementStorageKeyHex:
        POOLED_RESERVE_MINT_RESERVATION_ENFORCEMENT_STORAGE_KEY_V4_HEX,
      pendingKeysStorageKeyHex:
        POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_STORAGE_KEY_V4_HEX,
      pendingReservationStorageKeyHex:
        `${POOLED_RESERVE_MINT_RESERVATION_PENDING_MAP_PREFIX_V4_HEX}${BLAKE2_128}${'11'.repeat(32)}`,
      consumedReservationStorageKeyHex:
        `${POOLED_RESERVE_MINT_RESERVATION_CONSUMED_MAP_PREFIX_V4_HEX}${BLAKE2_128}${'11'.repeat(32)}`,
      invalidatedReservationStorageKeyHex:
        `${POOLED_RESERVE_MINT_RESERVATION_INVALIDATED_MAP_PREFIX_V4_HEX}${BLAKE2_128}${'11'.repeat(32)}`,
    });
  });

  it('decodes only canonical strictly increasing pending indexes', () => {
    const first = `0x${'11'.repeat(32)}`;
    const second = `0x${'22'.repeat(32)}`;
    const encoded = `0x08${first.slice(2)}${second.slice(2)}`;

    expect(
      decodePooledReserveMintReservationPendingKeysScaleV4(encoded),
    ).toEqual([first, second]);
    expect(
      decodePooledReserveMintReservationPendingKeysScaleV4('0x00'),
    ).toEqual([]);
    expect(() =>
      decodePooledReserveMintReservationPendingKeysScaleV4(
        `0x08${second.slice(2)}${first.slice(2)}`,
      ),
    ).toThrow(/strictly increasing/);
    expect(() =>
      decodePooledReserveMintReservationPendingKeysScaleV4(
        `0x08${first.slice(2)}${first.slice(2)}`,
      ),
    ).toThrow(/strictly increasing/);
  });

  it('rejects noncanonical, malformed, zero and oversized indexes', () => {
    expect(() =>
      decodePooledReserveMintReservationPendingKeysScaleV4('0x0100'),
    ).toThrow(/noncanonical/);
    expect(() =>
      decodePooledReserveMintReservationPendingKeysScaleV4('0x08'),
    ).toThrow(/malformed/);
    expect(() =>
      decodePooledReserveMintReservationPendingKeysScaleV4(
        `0x04${'00'.repeat(32)}`,
      ),
    ).toThrow(/zero key/);
    expect(() =>
      decodePooledReserveMintReservationPendingKeysScaleV4(
        `0x0504${'11'.repeat(257 * 32)}`,
      ),
    ).toThrow(/exceeds 256/);
  });

  it('rejects noncanonical reservation keys', () => {
    for (const value of [
      '11'.repeat(32),
      `0x${'AA'.repeat(32)}`,
      `0x${'11'.repeat(31)}`,
      `0x${'11'.repeat(33)}`,
    ]) {
      expect(() =>
        derivePooledReserveMintReservationRuntimeStorageKeysV4(value),
      ).toThrow(/lowercase 0x-prefixed 32-byte/);
    }
  });
});
