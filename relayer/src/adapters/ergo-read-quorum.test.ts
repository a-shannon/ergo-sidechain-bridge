import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ErgoReadQuorumAdapterError,
  assertErgoReadQuorumAddressBoxSnapshotProvenance,
  assertErgoReadQuorumObservationProvenance,
  createErgoReadQuorumSources,
  observeErgoReadQuorumAddressBoxes,
  observeErgoReadQuorumPair,
  observeErgoStorageRentParameters,
  type ErgoReadQuorumClient,
} from './ergo-read-quorum.js';

const hex = (byte: string): string => byte.repeat(32);

type BoxPageCall = Readonly<{
  address: string;
  offset: number;
  limit: number;
  sortDirection: 'asc' | 'desc';
  signal: AbortSignal | undefined;
}>;

function client(input: Readonly<{
  heights?: readonly number[];
  headers?: readonly string[];
  storageRent?: {
    fullHeight: number;
    parameterHeight: number;
    storageFeeFactorNanoErgPerByte: number;
  };
  boxes?: readonly unknown[];
  boxPageCalls?: BoxPageCall[];
  failure?: Error | null;
}> = {}): ErgoReadQuorumClient {
  let heightIndex = 0;
  let headerIndex = 0;
  const heights = input.heights ?? [42, 42];
  const headers = input.headers ?? [hex('03'), hex('03')];
  return {
    async getCurrentHeight(): Promise<number> {
      if (input.failure) throw input.failure;
      return heights[Math.min(heightIndex++, heights.length - 1)] ?? 0;
    },
    async getBlockHeaderHash(): Promise<string> {
      if (input.failure) throw input.failure;
      return headers[Math.min(headerIndex++, headers.length - 1)] ?? '';
    },
    async getStorageRentParameters() {
      if (input.failure) throw input.failure;
      return input.storageRent ?? {
        fullHeight: 42,
        parameterHeight: 40,
        storageFeeFactorNanoErgPerByte: 1_250_000,
      };
    },
    async getUnspentBoxesByAddressPage(address, page, signal) {
      if (input.failure) throw input.failure;
      input.boxPageCalls?.push(Object.freeze({ address, ...page, signal }));
      return [...(input.boxes ?? []).slice(page.offset, page.offset + page.limit)];
    },
  };
}

function pair(input: Partial<Parameters<typeof createErgoReadQuorumSources>[0]> = {}) {
  return createErgoReadQuorumSources({
    primaryClient: client(),
    primaryNodeUrl: 'https://reader-one.example',
    primaryNodeIdentityDigestHex: hex('01'),
    primaryAdministrationIdentityDigestHex: hex('02'),
    witnessClient: client(),
    witnessNodeUrl: 'https://reader-two.example',
    witnessNodeIdentityDigestHex: hex('03'),
    witnessAdministrationIdentityDigestHex: hex('04'),
    maxProbeDurationMs: 100,
    ...input,
  });
}

async function observeStorageRent(
  input: Partial<Parameters<typeof createErgoReadQuorumSources>[0]> = {},
) {
  const sources = pair(input);
  const observation = await observeErgoReadQuorumPair(sources, clock());
  return observeErgoStorageRentParameters(sources, observation);
}

const clock = (times: readonly number[] = [10, 20]) => {
  let index = 0;
  return {
    now: () => times[Math.min(index++, times.length - 1)] ?? 0,
  };
};

const box = (index: number): Readonly<Record<string, unknown>> => Object.freeze({
  boxId: index.toString(16).padStart(64, '0'),
  value: String(1_000_000 + index),
});

async function expectCode(
  action: () => Promise<unknown> | unknown,
  code: string,
): Promise<void> {
  await expect(Promise.resolve().then(action)).rejects.toMatchObject({ code });
}

describe('Ergo read-quorum adapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects equal origins, clients, node identities, and administration identities', () => {
    const primary = client();
    expect(() => pair({ primaryClient: primary, witnessClient: primary })).toThrow(
      ErgoReadQuorumAdapterError,
    );
    expect(() => pair({ witnessNodeUrl: 'https://reader-one.example' })).toThrow(
      ErgoReadQuorumAdapterError,
    );
    expect(() => pair({ witnessNodeIdentityDigestHex: hex('01') })).toThrow(
      ErgoReadQuorumAdapterError,
    );
    expect(() => pair({ witnessAdministrationIdentityDigestHex: hex('02') })).toThrow(
      ErgoReadQuorumAdapterError,
    );
    expect(() => pair({ primaryNodeUrl: 'https://user:password@reader-one.example' })).toThrow(
      ErgoReadQuorumAdapterError,
    );
    try {
      pair({ primaryNodeIdentityDigestHex: 'not-a-digest' });
      throw new Error('expected malformed identity configuration to reject');
    } catch (error) {
      expect(error).toMatchObject({ code: 'not_configured' });
    }
  });

  it('accepts stable matching tips and keeps origins private', async () => {
    const sources = pair();
    const observed = await observeErgoReadQuorumPair(sources, clock());
    assertErgoReadQuorumObservationProvenance(sources, observed);

    expect(observed).toMatchObject({
      sourceIdsHex: expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{64}$/)]),
      tipHeight: 42,
      tipHeaderIdHex: hex('03'),
      startedAtMs: 10,
      completedAtMs: 20,
    });
    const serialized = JSON.stringify({ sources, observed });
    expect(serialized).not.toContain('reader-one.example');
    expect(serialized).not.toContain('reader-two.example');
    expect(serialized).not.toContain('password');
  });

  it('rejects malformed, unstable, and disagreeing source views', async () => {
    await expectCode(
      () => observeErgoReadQuorumPair(pair({
        primaryClient: client({ headers: ['not-a-hash', 'not-a-hash'] }),
      }), clock()),
      'invalid_response',
    );
    await expectCode(
      () => observeErgoReadQuorumPair(pair({
        primaryClient: client({ heights: [42, 43], headers: [hex('03'), hex('04')] }),
      }), clock()),
      'source_unstable',
    );
    await expectCode(
      () => observeErgoReadQuorumPair(pair({
        witnessClient: client({ headers: [hex('05'), hex('05')] }),
      }), clock()),
      'source_disagreement',
    );
    await expectCode(
      () => observeErgoReadQuorumPair(pair({
        witnessClient: client({ failure: new Error('offline') }),
      }), clock()),
      'source_unavailable',
    );
  });

  it('rejects observations that were not produced by the bound pair', async () => {
    const sources = pair();
    const observed = await observeErgoReadQuorumPair(sources, clock());
    await expectCode(
      () => assertErgoReadQuorumObservationProvenance(sources, {
        ...observed,
        observationDigestHex: hex('09'),
      }),
      'invalid_response',
    );
  });

  it('accepts only matching storage-rent parameters at the agreed tip', async () => {
    const observed = await observeStorageRent();
    expect(observed).toEqual({
      expectedTipHeight: 42,
      expectedTipHeaderIdHex: hex('03'),
      expectedTipObservationDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      parameterHeight: 40,
      storageFeeFactorNanoErgPerByte: 1_250_000,
      parameterSourceId: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(observed)).not.toContain('reader-one.example');
  });

  it('rejects storage-rent parameter drift, stale tips, and missing capability', async () => {
    await expectCode(
      () => observeStorageRent({
        witnessClient: client({
          storageRent: {
            fullHeight: 42,
            parameterHeight: 41,
            storageFeeFactorNanoErgPerByte: 1_250_001,
          },
        }),
      }),
      'source_disagreement',
    );
    await expectCode(
      () => observeStorageRent({
        witnessClient: client({
          storageRent: {
            fullHeight: 43,
            parameterHeight: 40,
            storageFeeFactorNanoErgPerByte: 1_250_000,
          },
        }),
      }),
      'source_unstable',
    );
    await expectCode(
      () => observeStorageRent({
        primaryClient: client({
          headers: [hex('03'), hex('03'), hex('03'), hex('05')],
        }),
      }),
      'source_unstable',
    );
    await expectCode(
      () => observeStorageRent({
        witnessClient: {
          getCurrentHeight: async () => 42,
          getBlockHeaderHash: async () => hex('03'),
        },
      }),
      'not_configured',
    );
  });

  it('rejects cloned or caller-constructed storage-rent tip observations', async () => {
    const sources = pair();
    const observation = await observeErgoReadQuorumPair(sources, clock());

    await expectCode(
      () => observeErgoStorageRentParameters(sources, {
        ...observation,
      }),
      'invalid_response',
    );
  });

  it('collects matching complete paginated address box sets at the admitted tip', async () => {
    const boxes = Array.from({ length: 129 }, (_, index) => box(index));
    const primaryCalls: BoxPageCall[] = [];
    const witnessCalls: BoxPageCall[] = [];
    const sources = pair({
      primaryClient: client({ boxes: [...boxes].reverse(), boxPageCalls: primaryCalls }),
      witnessClient: client({ boxes, boxPageCalls: witnessCalls }),
    });
    const observation = await observeErgoReadQuorumPair(sources, clock());
    const snapshot = await observeErgoReadQuorumAddressBoxes(
      sources,
      observation,
      '9fRAWhdxEsTcdbj5x29uPCrxxbDxBfVp7BYyJMzp4WH3YGG3Hda',
    );
    assertErgoReadQuorumAddressBoxSnapshotProvenance(
      sources,
      observation,
      snapshot,
    );

    expect(snapshot).toMatchObject({
      expectedTipHeight: 42,
      expectedTipHeaderIdHex: hex('03'),
      observedBoxCount: 129,
      boxSetDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect((snapshot.boxes[0] as { boxId: string }).boxId).toBe(box(0).boxId);
    expect((snapshot.boxes[128] as { boxId: string }).boxId).toBe(box(128).boxId);
    for (const calls of [primaryCalls, witnessCalls]) {
      expect(calls.map(call => [call.offset, call.limit, call.sortDirection])).toEqual([
        [0, 128, 'asc'],
        [128, 128, 'asc'],
        [0, 128, 'asc'],
        [128, 128, 'asc'],
      ]);
      expect(calls.every(call => call.signal instanceof AbortSignal)).toBe(true);
    }
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.boxes)).toBe(true);
    expect(Object.isFrozen(snapshot.boxes[0])).toBe(true);
  });

  it('rejects disagreeing, unstable, duplicate, and unbounded address box inventories', async () => {
    const observeBoxes = async (
      input: Partial<Parameters<typeof createErgoReadQuorumSources>[0]>,
    ) => {
      const sources = pair(input);
      const observation = await observeErgoReadQuorumPair(sources, clock());
      return observeErgoReadQuorumAddressBoxes(sources, observation, 'vault-address');
    };

    await expectCode(
      () => observeBoxes({
        primaryClient: client({ boxes: [box(1)] }),
        witnessClient: client({ boxes: [] }),
      }),
      'source_disagreement',
    );
    await expectCode(
      () => observeBoxes({
        primaryClient: client({
          heights: [42, 42, 42, 42, 43],
          boxes: [box(1)],
        }),
        witnessClient: client({ boxes: [box(1)] }),
      }),
      'source_unstable',
    );
    await expectCode(
      () => observeBoxes({
        primaryClient: client({ boxes: [box(1), box(1)] }),
        witnessClient: client({ boxes: [box(1), box(1)] }),
      }),
      'invalid_response',
    );
    await expectCode(
      () => observeBoxes({
        primaryClient: {
          ...client(),
          getUnspentBoxesByAddressPage: async () => Array.from(
            { length: 129 },
            (_, index) => box(index),
          ),
        },
      }),
      'invalid_response',
    );
  });

  it('rejects a changed inventory between repeated reads and a cumulative byte overflow', async () => {
    let inventoryRead = 0;
    const changingClient = {
      ...client(),
      async getUnspentBoxesByAddressPage(
        _address: string,
        page: Readonly<{ offset: number; limit: number }>,
      ): Promise<unknown[]> {
        if (page.offset === 0) inventoryRead += 1;
        const inventory = inventoryRead === 1 ? [box(1)] : [box(2)];
        return inventory.slice(page.offset, page.offset + page.limit);
      },
    };
    const changingSources = pair({
      primaryClient: changingClient,
      witnessClient: client({ boxes: [box(1)] }),
    });
    const changingObservation = await observeErgoReadQuorumPair(
      changingSources,
      clock(),
    );
    await expectCode(
      () => observeErgoReadQuorumAddressBoxes(
        changingSources,
        changingObservation,
        'vault-address',
      ),
      'source_unstable',
    );

    const oversizedInventory = Array.from({ length: 384 }, (_, index) => ({
      ...box(index),
      payload: 'x'.repeat(44_000),
    }));
    const oversizedSources = pair({
      primaryClient: client({ boxes: oversizedInventory }),
    });
    const oversizedObservation = await observeErgoReadQuorumPair(
      oversizedSources,
      clock(),
    );
    await expectCode(
      () => observeErgoReadQuorumAddressBoxes(
        oversizedSources,
        oversizedObservation,
        'vault-address',
      ),
      'invalid_response',
    );
  });

  it('rejects missing page capability and cloned address box evidence', async () => {
    const sources = pair({
      witnessClient: {
        getCurrentHeight: async () => 42,
        getBlockHeaderHash: async () => hex('03'),
      },
    });
    const observation = await observeErgoReadQuorumPair(sources, clock());
    await expectCode(
      () => observeErgoReadQuorumAddressBoxes(sources, observation, 'vault-address'),
      'not_configured',
    );

    const completeSources = pair();
    const completeObservation = await observeErgoReadQuorumPair(completeSources, clock());
    const snapshot = await observeErgoReadQuorumAddressBoxes(
      completeSources,
      completeObservation,
      'vault-address',
    );
    await expectCode(
      () => assertErgoReadQuorumAddressBoxSnapshotProvenance(
        completeSources,
        completeObservation,
        { ...snapshot },
      ),
      'invalid_response',
    );
    await expectCode(
      () => observeErgoReadQuorumAddressBoxes(
        completeSources,
        { ...completeObservation },
        'vault-address',
      ),
      'invalid_response',
    );
  });

  it('bounds a probe even when a source never returns', async () => {
    vi.useFakeTimers();
    const aborted = vi.fn();
    const observation = observeErgoReadQuorumPair(pair({
      primaryClient: {
        getCurrentHeight: signal => new Promise<number>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            aborted();
            reject(new Error('aborted'));
          }, { once: true });
        }),
        getBlockHeaderHash: async () => hex('03'),
      },
      maxProbeDurationMs: 50,
    }), clock());

    const rejection = expectCode(() => observation, 'probe_stale');
    await vi.advanceTimersByTimeAsync(51);
    await rejection;
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it('aborts the sibling source when one source fails immediately', async () => {
    const siblingAborted = vi.fn();
    const observation = observeErgoReadQuorumPair(pair({
      primaryClient: {
        getCurrentHeight: signal => new Promise<number>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            siblingAborted();
            reject(new Error('aborted'));
          }, { once: true });
        }),
        getBlockHeaderHash: async () => hex('03'),
      },
      witnessClient: client({ failure: new Error('offline') }),
    }), clock());

    await expectCode(() => observation, 'source_unavailable');
    expect(siblingAborted).toHaveBeenCalledTimes(1);
  });
});
