import { describe, expect, it } from 'vitest';

import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';
import {
  ReadOnlySubstrateFinalityRpc,
  requestPooledReserveMintReservationStateReadProofV4,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';

const BLOCK_HASH = `0x${'22'.repeat(32)}`;
const RESERVATION_KEY = `0x${'11'.repeat(32)}`;
const KEYS =
  derivePooledReserveMintReservationRuntimeStorageKeysV4(RESERVATION_KEY);
const EXACT_KEYS = [
  KEYS.runtimeCodeStorageKeyHex,
  KEYS.currentProfileStorageKeyHex,
  KEYS.enforcementStorageKeyHex,
  KEYS.pendingKeysStorageKeyHex,
  KEYS.pendingReservationStorageKeyHex,
  KEYS.consumedReservationStorageKeyHex,
  KEYS.invalidatedReservationStorageKeyHex,
] as const;

describe('pooled-reserve mint-reservation V4 read proof', () => {
  it('requests exactly seven keys under one explicit native block hash', async () => {
    const transport = new RecordingTransport((_method, params) => ({
      at: params[1],
      proof: ['0x010203', '0x0405'],
    }));
    const rpc = new ReadOnlySubstrateFinalityRpc(transport);

    const result = await requestPooledReserveMintReservationStateReadProofV4(
      rpc,
      {
        nativeBlockHashHex: BLOCK_HASH,
        reservationKeyHex: RESERVATION_KEY,
      },
    );

    expect(transport.calls).toEqual([{
      method: 'state_getReadProof',
      params: [EXACT_KEYS, BLOCK_HASH],
    }]);
    expect(result).toEqual({
      atNativeBlockHashHex: BLOCK_HASH.slice(2),
      storageKeysHex: EXACT_KEYS,
      reservationStorageKeys: KEYS,
      proofNodesHex: ['010203', '0405'],
      proofBytes: 5,
    });
  });

  it('rejects proof drift, duplicate nodes and caller-selected keys', async () => {
    const driftedRpc = new ReadOnlySubstrateFinalityRpc(
      new RecordingTransport(() => ({
        at: `0x${'33'.repeat(32)}`,
        proof: ['0x010203'],
      })),
    );
    await expect(
      requestPooledReserveMintReservationStateReadProofV4(driftedRpc, {
        nativeBlockHashHex: BLOCK_HASH,
        reservationKeyHex: RESERVATION_KEY,
      }),
    ).rejects.toThrow(/not bound to the requested native block/);

    const duplicateRpc = new ReadOnlySubstrateFinalityRpc(
      new RecordingTransport((_method, params) => ({
        at: params[1],
        proof: ['0x010203', '0x010203'],
      })),
    );
    await expect(
      requestPooledReserveMintReservationStateReadProofV4(duplicateRpc, {
        nativeBlockHashHex: BLOCK_HASH,
        reservationKeyHex: RESERVATION_KEY,
      }),
    ).rejects.toThrow(/duplicate trie nodes/);

    await expect(
      requestPooledReserveMintReservationStateReadProofV4(duplicateRpc, {
        nativeBlockHashHex: BLOCK_HASH,
        reservationKeyHex: `${'11'.repeat(32)}`,
      }),
    ).rejects.toThrow(/lowercase 0x-prefixed 32-byte/);
  });
});

class RecordingTransport implements SubstrateRpcTransport {
  readonly calls: Array<{
    readonly method: string;
    readonly params: readonly unknown[];
  }> = [];

  constructor(
    private readonly response: (
      method: string,
      params: readonly unknown[],
    ) => unknown,
  ) {}

  request<T = unknown>(
    method: string,
    params: readonly unknown[],
  ): Promise<T> {
    this.calls.push({ method, params });
    return Promise.resolve(this.response(method, params) as T);
  }
}
