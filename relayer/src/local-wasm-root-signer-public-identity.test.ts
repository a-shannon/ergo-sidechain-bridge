import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    calls: [] as string[],
    cleanupFailure: undefined as string | undefined,
    failure: undefined as string | undefined,
    seed: new Uint8Array(),
  };
  const step = (name: string) => {
    state.calls.push(name);
    if (state.failure === name) throw new Error(`failed at ${name}`);
  };
  const cleanup = (name: string) => {
    state.calls.push(`cleanup:${name}`);
    if (state.cleanupFailure === name) {
      throw new Error(`cleanup failed at ${name}`);
    }
  };
  const publicKeyBytes = Uint8Array.from([2, ...Array(32).fill(3)]);
  const wasm = {
    Mnemonic: {
      to_seed: () => {
        step('to_seed');
        state.seed = Uint8Array.from([1, 2, 3, 4]);
        return state.seed;
      },
    },
    ExtSecretKey: {
      derive_master: () => {
        step('derive_master');
        return {
          public_key: () => {
            step('public_key');
            return {
              pub_key_bytes: () => {
                step('pub_key_bytes');
                return publicKeyBytes;
              },
              free: () => cleanup('publicKey'),
            };
          },
          free: () => cleanup('root'),
        };
      },
    },
    Address: {
      p2pk_from_pk_bytes: () => {
        step('p2pk_from_pk_bytes');
        return {
          to_ergo_tree: () => {
            step('to_ergo_tree');
            return {
              sigma_serialize_bytes: () => {
                step('sigma_serialize_bytes');
                return Uint8Array.from([0, 1, 2]);
              },
              free: () => cleanup('ergoTree'),
            };
          },
          free: () => cleanup('address'),
        };
      },
    },
  };
  return { state, wasm };
});

vi.mock('ergo-lib-wasm-nodejs', () => ({ default: mocks.wasm }));

import {
  deriveLocalWasmRootSignerPublicIdentity,
} from './local-wasm-root-signer-public-identity.js';

describe('local WASM root signer public identity', () => {
  beforeEach(() => {
    mocks.state.calls.length = 0;
    mocks.state.cleanupFailure = undefined;
    mocks.state.failure = undefined;
    mocks.state.seed = new Uint8Array();
  });

  it('derives only public identity and releases every WASM allocation', async () => {
    await expect(deriveLocalWasmRootSignerPublicIdentity('synthetic words'))
      .resolves.toEqual({
        publicKeyHex: `02${'03'.repeat(32)}`,
        p2pkErgoTreeHex: '000102',
        networkPrefix: 16,
      });
    expect([...mocks.state.seed]).toEqual([0, 0, 0, 0]);
    expect(mocks.state.calls.filter(call => call.startsWith('cleanup:')))
      .toEqual([
        'cleanup:ergoTree',
        'cleanup:address',
        'cleanup:publicKey',
        'cleanup:root',
      ]);
  });

  it.each([
    ['derive_master', []],
    ['public_key', ['cleanup:root']],
    ['pub_key_bytes', ['cleanup:publicKey', 'cleanup:root']],
    [
      'p2pk_from_pk_bytes',
      ['cleanup:publicKey', 'cleanup:root'],
    ],
    [
      'to_ergo_tree',
      ['cleanup:address', 'cleanup:publicKey', 'cleanup:root'],
    ],
    [
      'sigma_serialize_bytes',
      [
        'cleanup:ergoTree',
        'cleanup:address',
        'cleanup:publicKey',
        'cleanup:root',
      ],
    ],
  ] as const)(
    'zeroes the seed and releases acquired objects when %s fails',
    async (failure, expectedCleanup) => {
      mocks.state.failure = failure;
      await expect(
        deriveLocalWasmRootSignerPublicIdentity('synthetic words'),
      ).rejects.toThrow(`failed at ${failure}`);
      expect([...mocks.state.seed]).toEqual([0, 0, 0, 0]);
      expect(mocks.state.calls.filter(call => call.startsWith('cleanup:')))
        .toEqual(expectedCleanup);
    },
  );

  it('runs every cleanup step before rejecting a cleanup failure', async () => {
    mocks.state.cleanupFailure = 'ergoTree';
    await expect(
      deriveLocalWasmRootSignerPublicIdentity('synthetic words'),
    ).rejects.toThrow(/local WASM root signer cleanup failed/);
    expect([...mocks.state.seed]).toEqual([0, 0, 0, 0]);
    expect(mocks.state.calls.filter(call => call.startsWith('cleanup:')))
      .toEqual([
        'cleanup:ergoTree',
        'cleanup:address',
        'cleanup:publicKey',
        'cleanup:root',
      ]);
  });
});
