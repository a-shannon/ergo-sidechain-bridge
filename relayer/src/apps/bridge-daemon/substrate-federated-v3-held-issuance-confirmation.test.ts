import { describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  clients: new Map<string, unknown>(),
  assertOwned: vi.fn(),
  normalizeBox: vi.fn(async (box: unknown) => box),
}));

vi.mock('../../authenticated-spv-tracker-read-only-node-client.js', () => ({
  createBoundedAuthenticatedSpvTrackerReadOnlySource: (origin: string) => {
    const client = dependencies.clients.get(origin);
    if (client === undefined) throw new Error('unexpected test node origin');
    return client;
  },
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: (target: unknown) =>
    dependencies.assertOwned(target),
}));
vi.mock('../../unsigned-ergo-transaction.js', () => ({
  normalizeEip12Box: (box: unknown) => dependencies.normalizeBox(box),
}));

import { assertSubstrateFederatedV3HeldIssuanceConfirmations }
  from './substrate-federated-v3-held-issuance-confirmation.js';

const roles = ['primary', 'witness'] as const;
function id(height: number): string { return height.toString(16).padStart(64, '0'); }
function header(height: number) { return { id: id(height), height, parentId: id(height - 1) }; }
function info() { return { network: 'devnet', fullHeight: 40, bestFullHeaderId: id(40) }; }

function fixture() {
  const target = Object.freeze({ primaryNodeOrigin: 'primary', witnessNodeOrigin: 'witness',
    primaryMining: true, witnessReadOnly: true });
  const held = Object.freeze({ fullHeight: 40, headerIdHex: id(40) });
  const confirmations = [37, 38, 39].map(height => ({
    confirmationHeight: height, confirmationHeaderIdHex: id(height),
  }));
  const issuanceBoxes = [0, 1, 2].map(index => ({
    sourceBoxIdHex: id(101 + index),
    singletonOutput: {
      boxId: id(201 + index), value: '20000000', ergoTree: '1001',
      assets: [], additionalRegisters: {}, creationHeight: 37 + index,
      transactionId: id(301 + index), index: 0,
    },
  }));
  const outputById = new Map(issuanceBoxes.map(entry =>
    [entry.singletonOutput.boxId, entry.singletonOutput] as const));
  const active = { value: true };
  const client = () => ({
    beginAuthenticatedTrackerReconstruction: vi.fn(),
    endAuthenticatedTrackerReconstruction: vi.fn(),
    getInfo: vi.fn(async () => info()),
    getBestHeader: vi.fn(async () => header(41)),
    getBlockHeaderIdsAtHeight: vi.fn(async (height: number) => [id(height)]),
    getBlockHeaderChainSlice: vi.fn(async (from: number, to: number) =>
      Array.from({ length: to - from }, (_, index) => header(from + index + 1))),
    getBoxByIdOrNull: vi.fn(async (boxId: string): Promise<unknown> =>
      outputById.get(boxId) ?? null),
  });
  const clients = new Map(roles.map(role => [role, client()] as const));
  const assertCustody = vi.fn(() => {
    if (!active.value) throw new Error('V3 test custody revoked');
  });
  const run = () => {
    dependencies.normalizeBox.mockReset().mockImplementation(async box => box);
    dependencies.clients.clear();
    for (const [role, value] of clients) dependencies.clients.set(role, value);
    dependencies.assertOwned.mockReset().mockImplementation(value => {
      if (value !== target || !active.value) throw new Error('V3 test target revoked');
    });
    return assertSubstrateFederatedV3HeldIssuanceConfirmations(
      target as never, held, confirmations, issuanceBoxes, assertCustody);
  };
  const expectClosed = () => {
    for (const value of clients.values()) {
      expect(value.beginAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
      expect(value.endAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
    }
  };
  return { target, held, confirmations, issuanceBoxes, clients, active, assertCustody, run, expectClosed };
}

describe('V3 held issuance confirmation', () => {
  it('accepts both full-block tips and a coherent header-only extension', async () => {
    const selected = fixture();
    for (const value of selected.clients.values()) {
      value.getBestHeader.mockResolvedValueOnce(header(41)).mockResolvedValueOnce(header(42));
    }
    await expect(selected.run()).resolves.toBeUndefined();
    selected.expectClosed();
    for (const value of selected.clients.values()) {
      expect(value.getInfo).toHaveBeenCalledTimes(2);
      expect(value.getBlockHeaderChainSlice).toHaveBeenCalledWith(36, 40);
      expect(value.getBlockHeaderChainSlice).toHaveBeenCalledWith(39, 42);
      for (const issuance of selected.issuanceBoxes) {
        expect(value.getBoxByIdOrNull).toHaveBeenCalledWith(issuance.sourceBoxIdHex);
        expect(value.getBoxByIdOrNull).toHaveBeenCalledWith(issuance.singletonOutput.boxId);
      }
    }
  });

  it.each(roles.flatMap(role => (['height', 'ID'] as const).map(field => ({ role, field }))))(
    'refuses an isolated $role held full-block $field mismatch', async ({ role, field }) => {
      const selected = fixture();
      selected.clients.get(role)!.getInfo.mockResolvedValueOnce(field === 'height'
        ? { network: 'devnet', fullHeight: 41, bestFullHeaderId: id(41) }
        : { network: 'devnet', fullHeight: 40, bestFullHeaderId: id(9) });
      await expect(selected.run()).rejects.toThrow('held snapshot');
      selected.expectClosed();
      for (const value of selected.clients.values()) {
        expect(value.getBlockHeaderChainSlice.mock.calls.every(([from]) => from >= 39)).toBe(true);
      }
    },
  );

  it.each(roles)('refuses a noncanonical $role full-block ancestry', async role => {
    const selected = fixture();
    const peer = selected.clients.get(role)!;
    peer.getBlockHeaderChainSlice.mockImplementation(async (from, to) =>
      Array.from({ length: to - from }, (_, index) => {
        const row = header(from + index + 1);
        return row.height === 40 ? { ...row, parentId: id(9) } : row;
      }));
    await expect(selected.run()).rejects.toThrow();
    selected.expectClosed();
  });

  it.each(roles)('refuses a forked $role canonical-first issuance ID', async role => {
    const selected = fixture();
    selected.clients.get(role)!.getBlockHeaderIdsAtHeight.mockImplementation(async height =>
      height === 39 ? [id(9), id(39)] : [id(height)]);
    await expect(selected.run()).rejects.toThrow('held snapshot');
    selected.expectClosed();
  });

  it('refuses an issuance receipt whose ID differs from the held ancestry', async () => {
    const selected = fixture();
    selected.confirmations[2] = { confirmationHeight: 39, confirmationHeaderIdHex: id(9) };
    await expect(selected.run()).rejects.toThrow('held snapshot');
    selected.expectClosed();
  });

  it('refuses a truncated ancestry page before reading a confirmation', async () => {
    const selected = fixture();
    const peer = selected.clients.get('witness')!;
    peer.getBlockHeaderChainSlice.mockImplementation(async (from, to) =>
      Array.from({ length: to - from - (to === 40 ? 1 : 0) },
        (_, index) => header(from + index + 1)));
    await expect(selected.run()).rejects.toThrow('held snapshot');
    selected.expectClosed();
  });

  it('refuses full-block tip drift in the closing bracket', async () => {
    const selected = fixture();
    selected.clients.get('witness')!.getInfo.mockResolvedValueOnce(info())
      .mockResolvedValueOnce({ network: 'devnet', fullHeight: 41, bestFullHeaderId: id(41) });
    await expect(selected.run()).rejects.toThrow('held snapshot');
    selected.expectClosed();
    for (const value of selected.clients.values()) expect(value.getInfo).toHaveBeenCalledTimes(2);
  });

  it('drains a paired read before ending either reconstruction scope', async () => {
    const selected = fixture();
    const failure = new Error('primary read failed');
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    selected.clients.get('primary')!.getInfo.mockRejectedValueOnce(failure);
    selected.clients.get('primary')!.getBestHeader.mockImplementationOnce(async () => {
      entered(); await gate; return header(41);
    });
    const pending = selected.run();
    void pending.catch(() => {});
    await reached;
    await Promise.resolve();
    for (const value of selected.clients.values()) {
      expect(value.endAuthenticatedTrackerReconstruction).not.toHaveBeenCalled();
    }
    release();
    await expect(pending).rejects.toBe(failure);
    selected.expectClosed();
  });

  it('rechecks custody after an awaited node read and closes both scopes', async () => {
    const selected = fixture();
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    selected.clients.get('witness')!.getInfo.mockImplementationOnce(async () => {
      entered(); await gate; return info();
    });
    const pending = selected.run();
    void pending.catch(() => {});
    await reached;
    selected.active.value = false;
    release();
    await expect(pending).rejects.toThrow('V3 test custody revoked');
    selected.expectClosed();
  });

  it('retains the primary failure and both cleanup attempts when scope closure fails', async () => {
    const selected = fixture();
    const readFailure = new Error('read failure');
    const closeFailure = new Error('close failure');
    selected.clients.get('primary')!.getInfo.mockRejectedValueOnce(readFailure);
    selected.clients.get('primary')!.endAuthenticatedTrackerReconstruction
      .mockImplementationOnce(() => { throw closeFailure; });
    let received: unknown;
    try { await selected.run(); } catch (error) { received = error; }
    expect(received).toBeInstanceOf(AggregateError);
    expect((received as AggregateError).errors).toEqual([readFailure, closeFailure]);
    selected.expectClosed();
  });

  it('refuses an invalid or conflicting confirmation before opening reconstruction', async () => {
    const selected = fixture();
    selected.confirmations[1] = { confirmationHeight: 39, confirmationHeaderIdHex: id(9) };
    await expect(selected.run()).rejects.toThrow('held snapshot');
    for (const value of selected.clients.values()) {
      expect(value.beginAuthenticatedTrackerReconstruction).not.toHaveBeenCalled();
    }
  });

  it.each(roles.flatMap(role => (['source unspent', 'output absent', 'output changed'] as const)
    .map(fault => ({ role, fault }))))(
    'refuses an isolated $role $fault under the held snapshot', async ({ role, fault }) => {
      const selected = fixture();
      const first = selected.issuanceBoxes[0]!;
      const outputs = new Map(selected.issuanceBoxes.map(entry =>
        [entry.singletonOutput.boxId, entry.singletonOutput] as const));
      selected.clients.get(role)!.getBoxByIdOrNull.mockImplementation(async boxId => {
        if (boxId === first.sourceBoxIdHex && fault === 'source unspent') {
          return { boxId };
        }
        if (boxId === first.singletonOutput.boxId && fault === 'output absent') return null;
        const output = outputs.get(boxId);
        if (output === undefined) return null;
        return boxId === first.singletonOutput.boxId && fault === 'output changed'
          ? { ...output, value: '999' } : output;
      });
      await expect(selected.run()).rejects.toThrow('held snapshot');
      selected.expectClosed();
    },
  );

  it('refuses an output created above the held full-block height', async () => {
    const selected = fixture();
    const outputs = new Map(selected.issuanceBoxes.map(entry =>
      [entry.singletonOutput.boxId, entry.singletonOutput] as const));
    selected.clients.get('witness')!.getBoxByIdOrNull.mockImplementation(async boxId => {
      const output = outputs.get(boxId);
      return output === undefined ? null : { ...output, creationHeight: 41 };
    });
    await expect(selected.run()).rejects.toThrow('held snapshot');
    selected.expectClosed();
  });
});
