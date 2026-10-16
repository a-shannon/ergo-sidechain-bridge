import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const path = new URL('./substrate-federated-isolated-devnet-ergo-node-process-v1.ts', import.meta.url);
const source = readFileSync(path, 'utf8');
const names = {
  bind: 'bindOwnedMiningTransactionPermit',
  hold: 'holdSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1',
  arm: 'armSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1',
  complete: 'completeSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1',
  require: 'requireOwnedMiningTransactionPermitTarget',
  guard: 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1',
  common: 'assertSubstrateFederatedIsolatedDevnetMiningWatermarkSnapshotsV1',
  exact: 'assertSubstrateFederatedIsolatedDevnetTransactionPermitIndexedSnapshotV1',
  paused: 'assertSubstrateFederatedIsolatedDevnetPausedMiningIndexedSnapshotV1',
  canonicalSnapshot: 'assertSubstrateFederatedIsolatedDevnetTransactionPermitCanonicalSnapshotV1',
  stableHeader: 'assertSubstrateFederatedIsolatedDevnetTransactionPermitCanonicalHeaderStableV1',
  proofWidth: 'transactionPermitHeaderProofWidthV1',
  ancestry: 'assertTransactionPermitHeaderAncestryV1',
  same: 'assertExactSnapshot',
} as const;
type Snapshot = { network: string; fullHeight: number; indexedHeight: number; headerIdHex: string };
type Header = { id: string; height: number; parentId: string };
type PermitRead = { snapshot: Snapshot; bestHeader: Header };
type Watermark = { height: number; headerId: string };
type Arm = { operationId: string; transactionId: string; initialParent: Watermark };
type Status = { completed: boolean; finalWatermark: Watermark | null };
type Validation = { watermark: Watermark | null; primarySnapshot: Snapshot; witnessSnapshot: Snapshot;
  primaryHeaderIdsAtWatermark: unknown; witnessHeaderIdsAtWatermark: unknown };
type Node = { role: string; mode: string; child: object };
interface API {
  bind(target: object, primary: Node, witness: Node, guard: () => void): void;
  hold(target: object): Promise<Snapshot>;
  arm(target: object, tx: string): Promise<void>;
  complete(target: object, tx: string, deadline: number): Promise<void>;
  exact(input: Validation): void;
  paused(input: Validation): void;
}
type Binding = { assertActive(): void; hold(): Promise<Snapshot>; arm(tx: string): Promise<void>;
  complete(tx: string, deadline: number): Promise<void> };
type Mutation = { before: string; after: string };

// Import-free, exact production bodies with synthetic capability and I/O doubles.
// This harness neither creates a process owner nor admits a node or custody target.
function extract<T>(selected: Record<string, string>, dependencies: Record<string, unknown>, mutation?: Mutation): T {
  const parsed = ts.createSourceFile(fileURLToPath(path), source, ts.ScriptTarget.Latest, true);
  let text = [...new Set(Object.values(selected))].map(name => {
    const matches = parsed.statements.filter((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(matches.length, 1, `exactly one production function: ${name}`);
    assert(matches[0].body);
    return matches[0].getText(parsed);
  }).join('\n').replace(/\r\n/g, '\n');
  if (mutation) {
    assert.equal(text.split(mutation.before).length, 2, 'one isolated source mutation');
    text = text.replace(mutation.before, mutation.after);
  }
  const code = ts.transpileModule(text, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  assert(!/\brequire\s*\(/u.test(code), 'selected production bodies must remain import-free');
  return new Function('exports', ...Object.keys(dependencies), `${code}\nreturn {${
    Object.entries(selected).map(([alias, name]) => `${alias}:${name}`).join(',')}};`)(
    {}, ...Object.values(dependencies)) as T;
}

function constant(name: string): number {
  const parsed = ts.createSourceFile(fileURLToPath(path), source, ts.ScriptTarget.Latest, true);
  const found = parsed.statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations.filter(declaration => declaration.name.getText(parsed) === name));
  assert.equal(found.length, 1); assert(found[0].initializer);
  const numeric = (node: ts.Expression): number => {
    if (ts.isNumericLiteral(node)) return Number(node.text);
    assert(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken,
      'only numeric literals or their fixed product may define a harness constant');
    return numeric(node.left) * numeric(node.right);
  };
  return numeric(found[0].initializer);
}
const constants = Object.fromEntries(['MINIMUM_MINED_HEIGHT', 'MINING_TIMEOUT_MS', 'REQUEST_TIMEOUT_MS',
  'STABILITY_DELAY_MS', 'MAX_RESPONSE_BYTES', 'MAX_TRANSACTION_PERMIT_HEADER_ROWS'].map(name => [name, constant(name)]));
function id(height: number) { return height.toString(16).padStart(64, '0'); }
function snapshot(height = 40): Snapshot { return { network: 'devnet', fullHeight: height, indexedHeight: height, headerIdHex: id(height) }; }
function header(height = 40): Header { return { id: id(height), height, parentId: id(height - 1) }; }
function permitRead(value = snapshot(), bestHeader = header(value.fullHeight)): PermitRead {
  return { snapshot: value, bestHeader };
}
function watermark(height = 40): Watermark { return { height, headerId: id(height) }; }
const tx = 'ab'.repeat(32);
const nextTx = 'cd'.repeat(32);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}

function harness(mutation?: Mutation) {
  const target = Object.freeze({});
  const primary = { role: 'primary', mode: 'mining', child: {} };
  const witness = { role: 'witness', mode: 'non-mining', child: {} };
  const active = new WeakSet<object>([target]);
  const targets = new WeakMap<object, Binding>();
  const state = { now: 0, tip: snapshot(), parent: watermark(), paused: false, controlFailed: false, processLive: true,
    primaryLive: true, witnessLive: true, primaryBestHeader: undefined as Header | undefined,
    witnessBestHeader: undefined as Header | undefined };
  const events: string[] = [];
  const sequence = new Map<string, number>();
  let blocked: { key: string; entered: ReturnType<typeof deferred>; gate: ReturnType<typeof deferred> } | undefined;
  async function step(label: string) {
    const number = (sequence.get(label) ?? 0) + 1; sequence.set(label, number);
    const key = `${label}:${number}`; events.push(key);
    if (blocked?.key === key) { blocked.entered.resolve(); await blocked.gate.promise; }
  }
  const processGuard = vi.fn(() => { if (!state.processLive) throw new Error('process revoked'); });
  const live = vi.fn((node: Node) => {
    if ((node === primary && !state.primaryLive) || (node === witness && !state.witnessLive)) throw new Error('child revoked');
  });
  const hold = vi.fn(async () => { await step('hold'); return { parent: state.parent }; });
  const arm = vi.fn(async (transactionId: string): Promise<Arm> => {
    await step('arm'); return Object.freeze({ transactionId, operationId: id(90), initialParent: { ...state.parent } });
  });
  const status = vi.fn(async (receipt: Arm, _duration: number): Promise<Status> => {
    await step('status'); const finalWatermark = watermark(receipt.initialParent.height + 11);
    state.parent = finalWatermark;
    return { completed: true, finalWatermark };
  });
  const control = Object.freeze({ hold, arm, status });
  const controls = new WeakMap<object, { transactionPermits: typeof control }>([[primary.child, { transactionPermits: control }]]);
  const controlGuard = vi.fn((value: unknown) => {
    if (value !== control || state.paused || state.controlFailed) throw new Error('control revoked');
  });
  const read = vi.fn(async (node: Node, _watermark: Watermark, _deadline: number, _guard: () => void): Promise<PermitRead | undefined> => {
    await step('read'); return permitRead({ ...state.tip },
      state[node.role === 'primary' ? 'primaryBestHeader' : 'witnessBestHeader'] ?? header(state.tip.fullHeight));
  });
  const canonicalResponse = async (origin: string, selectedPath: string, _deadline: number,
    _guard: () => void): Promise<unknown> => {
    await step('canonical');
    if (selectedPath.startsWith('/blocks/at/')) {
      const height = Number(selectedPath.slice('/blocks/at/'.length));
      return [id(height), 'ef'.repeat(32)];
    }
    const match = /^\/blocks\/chainSlice\?fromHeight=([0-9]+)&toHeight=([0-9]+)$/u.exec(selectedPath);
    assert(match, `unexpected canonical path: ${selectedPath}`);
    const fromHeight = Number(match[1]); const height = Number(match[2]);
    const tip = state[origin === 'primary-double' ? 'primaryBestHeader' : 'witnessBestHeader'];
    return Array.from({ length: height - fromHeight }, (_, index) => ({
      ...(tip?.height === fromHeight + index + 1 ? tip : header(fromHeight + index + 1)), acceptedExtraField: true,
    }));
  };
  const canonical = vi.fn(canonicalResponse);
  const delay = vi.fn(async (duration: number) => { await step('delay'); state.now += duration; });
  const api = extract<API>(names, {
    ...constants, performance: { now: () => state.now }, delay,
    OWNED_EXECUTION_TARGET_BINDINGS: new WeakMap([[target, { assertActiveProcesses: processGuard }]]),
    ACTIVE_OWNED_EXECUTION_TARGETS: active, OWNED_MINING_TRANSACTION_PERMIT_TARGETS: targets,
    OWNED_MINING_SUBMISSION_CONTROLS: controls, assertLive: live,
    assertOwnedErgoMiningTransactionPermitControlV1: controlGuard,
    readTransactionPermitTargetSnapshot: read, getJson: canonical,
    settleCopiedErgoReads: async <T>(reads: readonly Promise<T>[]) => {
      const settled = await Promise.allSettled(reads);
      const failure = settled.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      return settled.map(result => (result as PromiseFulfilledResult<T>).value);
    },
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN: 'primary-double',
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN: 'witness-double',
  }, mutation);
  const bind = () => api.bind(target, primary, witness, processGuard);
  function resetEvents() { events.length = 0; sequence.clear(); }
  async function held() { bind(); await api.hold(target); resetEvents(); }
  async function armed() { await held(); await api.arm(target, tx); state.tip = snapshot(51); resetEvents(); }
  function block(key: string) { blocked = { key, entered: deferred(), gate: deferred() }; return blocked; }
  return { api, target, primary, witness, active, targets, controls, state, events, hold, arm, status,
    read, canonical, canonicalResponse, delay, controlGuard, processGuard, live, bind, held, armed, block, resetEvents };
}

async function remainsFailed(h: ReturnType<typeof harness>) {
  const before = [h.hold.mock.calls.length, h.arm.mock.calls.length, h.status.mock.calls.length,
    h.read.mock.calls.length, h.canonical.mock.calls.length];
  await expect(h.api.hold(h.target)).rejects.toThrow();
  await expect(h.api.arm(h.target, nextTx)).rejects.toThrow();
  await expect(h.api.complete(h.target, tx, h.state.now + 10_000)).rejects.toThrow();
  expect([h.hold.mock.calls.length, h.arm.mock.calls.length, h.status.mock.calls.length,
    h.read.mock.calls.length, h.canonical.mock.calls.length]).toEqual(before);
}

describe('transaction permit exact production target lifetime', () => {
  it('joins Hold, exact Arm, actor completion, stable paired indexes, fresh status and next Arm', async () => {
    const h = harness(); h.bind();
    expect(await h.api.hold(h.target)).toEqual(snapshot());
    expect(h.hold).toHaveBeenCalledTimes(1); expect(h.read).toHaveBeenCalledTimes(4);
    expect(h.canonical).toHaveBeenCalledTimes(8);
    await h.api.arm(h.target, tx); h.state.tip = snapshot(51); h.resetEvents();
    const deadline = h.state.now + 2_000;
    await h.api.complete(h.target, tx, deadline);
    expect(h.events).toEqual(['status:1', 'read:1', 'read:2', 'canonical:1', 'canonical:2', 'canonical:3',
      'canonical:4', 'delay:1', 'read:3', 'read:4', 'canonical:5', 'canonical:6', 'canonical:7',
      'canonical:8', 'status:2', 'read:5', 'read:6', 'canonical:9', 'canonical:10', 'canonical:11', 'canonical:12']);
    const originalArm = await h.arm.mock.results[0].value;
    expect(h.status.mock.calls[0][0]).toBe(originalArm);
    expect(h.status.mock.calls[1][0]).toBe(originalArm);
    expect(h.status.mock.calls.map(call => call[1])).toEqual([2_000, 1_500]);
    for (const call of h.read.mock.calls.slice(4)) expect(call[2]).toBe(deadline);
    for (const call of h.canonical.mock.calls.slice(8)) expect(call[2]).toBe(deadline);
    await h.api.arm(h.target, nextTx); expect(h.arm).toHaveBeenLastCalledWith(nextTx);
    expect((await h.arm.mock.results[1].value).initialParent).toEqual(watermark(51));
    h.state.tip = snapshot(62);
    await h.api.complete(h.target, nextTx, h.state.now + 2_000);
    const secondArm = await h.arm.mock.results[1].value;
    expect(h.status.mock.calls.slice(2).map(call => call[0])).toEqual([secondArm, secondArm]);
    expect(h.primary.mode).toBe('mining');
  });

  it.each([
    { name: 'singleton lists', forkOrigin: 'neither' },
    { name: 'siblings only on primary', forkOrigin: 'primary-double' },
    { name: 'siblings only on witness', forkOrigin: 'witness-double' },
  ])('joins Hold with $name through exact list and slice paths', async ({ forkOrigin }) => {
    const h = harness();
    h.canonical.mockImplementation(async (origin, selectedPath, deadline, guard) => {
      const value = await h.canonicalResponse(origin, selectedPath, deadline, guard);
      if (selectedPath.startsWith('/blocks/at/')) {
        const values = value as string[];
        return origin === forkOrigin ? values : [values[0]];
      }
      return value;
    });
    h.bind();
    await expect(h.api.hold(h.target)).resolves.toEqual(snapshot());
    const paths = h.canonical.mock.calls.map(call => call[1]);
    const group = ['/blocks/at/40', '/blocks/at/40',
      '/blocks/chainSlice?fromHeight=39&toHeight=40', '/blocks/chainSlice?fromHeight=39&toHeight=40'];
    expect(paths).toEqual([...group, ...group]);
    expect(h.canonical.mock.calls.every(call => call[2] === 120_000 && typeof call[3] === 'function')).toBe(true);
  });

  it.each([{ primary: 42, witness: 41 }, { primary: 40, witness: 42 }, { primary: 41, witness: 40 }])(
    'proves each peer header-only ancestry at primary=$primary witness=$witness before public Hold', async tips => {
      const h = harness(); h.state.primaryBestHeader = header(tips.primary); h.state.witnessBestHeader = header(tips.witness);
      h.bind();
      await expect(h.api.hold(h.target)).resolves.toEqual(snapshot());
      const group = [
        ['primary-double', '/blocks/at/40'], ['witness-double', '/blocks/at/40'],
        ['primary-double', `/blocks/chainSlice?fromHeight=39&toHeight=${tips.primary}`],
        ['witness-double', `/blocks/chainSlice?fromHeight=39&toHeight=${tips.witness}`],
      ];
      expect(h.canonical.mock.calls.map(call => call.slice(0, 2))).toEqual([...group, ...group]);
      expect(h.canonical.mock.calls.every(call => call[2] === 120_000 && typeof call[3] === 'function')).toBe(true);
      expect(h.arm).not.toHaveBeenCalled(); expect(h.status).not.toHaveBeenCalled();
    },
  );

  it.each(['different widths', 'same-width peer forks'])(
    'refuses swapped canonical ancestry slices with %s', async fault => {
      const h = harness(); h.state.primaryBestHeader = header(42);
      h.state.witnessBestHeader = fault === 'different widths' ? header(41) : { ...header(42), id: id(142) };
      h.canonical.mockImplementation(async (...args) => {
        const value = await h.canonicalResponse(...args);
        if (!args[1].startsWith('/blocks/chainSlice')) return value;
        const other = args[0] === 'primary-double' ? h.state.witnessBestHeader! : h.state.primaryBestHeader!;
        return Array.from({ length: other.height - 39 }, (_, index) => index + 40 === other.height ? other : header(index + 40));
      });
      h.bind(); await expect(h.api.hold(h.target)).rejects.toThrow('header ancestry');
      expect(h.canonical).toHaveBeenCalledTimes(4); await remainsFailed(h);
    },
  );

  it('drains ancestry proofs and preserves first request-slot failure after a later slot rejects first', async () => {
    const h = harness(); h.state.primaryBestHeader = header(42); h.state.witnessBestHeader = header(41); h.bind();
    const entered = deferred(); const gate = deferred(); let call = 0;
    const first = new Error('first canonical request slot'); const second = new Error('second canonical request slot');
    h.canonical.mockImplementation(async (...args) => {
      const index = call++;
      if (index === 0) { entered.resolve(); await gate.promise; throw first; }
      if (index === 1) throw second;
      return h.canonicalResponse(...args);
    });
    const pending = h.api.hold(h.target); const refused = expect(pending).rejects.toBe(first);
    let settled = false; void pending.catch(() => {}).finally(() => { settled = true; });
    await entered.promise; await Promise.resolve();
    expect(h.canonical).toHaveBeenCalledTimes(4); expect(settled).toBe(false);
    gate.resolve(); await refused; expect(settled).toBe(true); await remainsFailed(h);
  });

  it('preserves all four proof slots when successful responses complete in reverse request order', async () => {
    const h = harness(); h.state.primaryBestHeader = header(42); h.state.witnessBestHeader = header(41); h.bind();
    const gates = Array.from({ length: 4 }, () => deferred()); const entered = deferred();
    const completion: number[] = []; let call = 0;
    h.canonical.mockImplementation(async (...args) => {
      const index = call++;
      if (index < 4) {
        if (index === 3) entered.resolve();
        await gates[index].promise; completion.push(index);
      }
      return h.canonicalResponse(...args);
    });
    const pending = h.api.hold(h.target); const accepted = expect(pending).resolves.toEqual(snapshot());
    await entered.promise;
    for (const index of [3, 2, 1, 0]) { gates[index].resolve(); await Promise.resolve(); }
    await accepted; expect(completion).toEqual([3, 2, 1, 0]);
    expect(h.canonical.mock.calls.slice(0, 4).map(call => call.slice(0, 2))).toEqual([
      ['primary-double', '/blocks/at/40'], ['witness-double', '/blocks/at/40'],
      ['primary-double', '/blocks/chainSlice?fromHeight=39&toHeight=42'],
      ['witness-double', '/blocks/chainSlice?fromHeight=39&toHeight=41'],
    ]);
    expect(h.canonical).toHaveBeenCalledTimes(8);
  });

  it('accepts the maximum Scala height without extending the held full-block state', async () => {
    const h = harness(); h.state.tip = snapshot(2_147_483_647); h.state.parent = watermark(2_147_483_647); h.bind();
    await expect(h.api.hold(h.target)).resolves.toEqual(snapshot(2_147_483_647));
    expect(h.canonical).toHaveBeenCalledTimes(8);
  });

  it.each(['primary', 'witness'] as const)('refuses %s ancestry above Scala Int before the four block reads', async role => {
    const h = harness(); h.state.tip = snapshot(2_147_483_647); h.state.parent = watermark(2_147_483_647);
    h.state[role === 'primary' ? 'primaryBestHeader' : 'witnessBestHeader'] = header(2_147_483_648);
    h.bind(); await expect(h.api.hold(h.target)).rejects.toThrow('bounded range');
    expect(h.canonical).not.toHaveBeenCalled(); await remainsFailed(h);
  });

  it.each(['primary', 'witness'] as const)('refuses %s ancestry above the row cap before the four block reads', async role => {
    const h = harness(); h.state[role === 'primary' ? 'primaryBestHeader' : 'witnessBestHeader'] =
      header(40 + constants.MAX_TRANSACTION_PERMIT_HEADER_ROWS);
    h.bind(); await expect(h.api.hold(h.target)).rejects.toThrow('bounded range');
    expect(h.canonical).not.toHaveBeenCalled(); await remainsFailed(h);
  });

  it.each(['Hold stability', 'completion closing'].flatMap(boundary => ['primary', 'witness'].flatMap(role =>
    ['id', 'height', 'parentId'].map(field => ({ boundary, role, field })))))(
    'refuses $role best-header $field drift at $boundary after valid ancestry proofs', async ({ boundary, role, field }) => {
      const h = harness();
      if (boundary === 'completion closing') await h.armed(); else h.bind();
      const key = role === 'primary' ? 'primaryBestHeader' : 'witnessBestHeader';
      const before = header(h.state.tip.fullHeight + 2); h.state[key] = before;
      const changedParent = id(before.height + 99);
      const drift = () => { h.state[key] = field === 'id' ? { ...before, id: id(before.height + 100) }
        : field === 'parentId' ? { ...before, parentId: changedParent } : header(before.height + 1); };
      if (field === 'parentId') {
        h.canonical.mockImplementation(async (...args) => {
          const value = await h.canonicalResponse(...args);
          if (args[0] === `${role}-double` && args[1].startsWith('/blocks/chainSlice')
            && h.state[key]!.parentId === changedParent) {
            const values = value as Header[];
            values[values.length - 2] = { ...values[values.length - 2], id: changedParent };
          }
          return value;
        });
      }
      if (boundary === 'Hold stability') {
        const originalDelay = h.delay.getMockImplementation()!;
        h.delay.mockImplementation(async duration => { await originalDelay(duration); drift(); });
      } else {
        const originalStatus = h.status.getMockImplementation()!; let statuses = 0;
        h.status.mockImplementation(async (...args) => { const value = await originalStatus(...args); if (++statuses === 2) drift(); return value; });
      }
      const pending = boundary === 'Hold stability' ? h.api.hold(h.target) : h.api.complete(h.target, tx, h.state.now + 5_000);
      await expect(pending).rejects.toThrow('canonical header changed'); await remainsFailed(h);
    },
  );

  it.each(['missing control', 'different child', 'wrong role', 'non-mining'])(
    'refuses binding %s before transport', fault => {
      const h = harness();
      if (fault === 'missing control') h.controls.delete(h.primary.child);
      if (fault === 'different child') h.primary.child = {};
      if (fault === 'wrong role') h.primary.role = 'witness';
      if (fault === 'non-mining') h.primary.mode = 'non-mining';
      expect(h.bind).toThrow('control is absent'); expect(h.targets.has(h.target)).toBe(false);
      expect(h.hold).not.toHaveBeenCalled(); expect(h.arm).not.toHaveBeenCalled();
    });

  it('refuses copied, unknown and unbound active targets without borrowing the original control', async () => {
    const h = harness(); h.bind();
    for (const target of [{ ...h.target }, {}, new Proxy(h.target, { get() { throw new Error('trap'); } })]) {
      await expect(h.api.hold(target)).rejects.toThrow('not owned');
    }
    h.targets.delete(h.target);
    await expect(h.api.hold(h.target)).rejects.toThrow('not bound'); expect(h.hold).not.toHaveBeenCalled();
  });

  it.each(['arm before Hold', 'repeat Hold', 'complete before Arm', 'wrong transaction', 'next Arm before complete'])(
    'permanently seals %s before any new transport', async fault => {
      const h = harness();
      if (fault === 'arm before Hold') h.bind();
      else if (fault === 'wrong transaction' || fault === 'next Arm before complete') await h.armed();
      else await h.held();
      const counts = [h.hold.mock.calls.length, h.arm.mock.calls.length, h.status.mock.calls.length];
      if (fault === 'repeat Hold') await expect(h.api.hold(h.target)).rejects.toThrow();
      else if (fault === 'complete before Arm' || fault === 'wrong transaction') await expect(h.api.complete(h.target, nextTx, 10_000)).rejects.toThrow();
      else await expect(h.api.arm(h.target, nextTx)).rejects.toThrow();
      expect([h.hold.mock.calls.length, h.arm.mock.calls.length, h.status.mock.calls.length]).toEqual(counts);
      await remainsFailed(h);
    });

  const boundaries = [
    ...['hold:1', 'read:1', 'canonical:1', 'canonical:3', 'delay:1', 'read:3', 'canonical:5', 'canonical:7']
      .map(key => ({ operation: 'hold', key })),
    { operation: 'arm', key: 'arm:1' },
    ...['status:1', 'read:1', 'canonical:1', 'canonical:3', 'delay:1', 'read:3', 'canonical:5', 'canonical:7',
      'status:2', 'read:5', 'canonical:9', 'canonical:11']
      .map(key => ({ operation: 'complete', key })),
  ];
  it.each(boundaries.flatMap(boundary => ['target', 'Pause', 'control', 'process'].map(revoke => ({ ...boundary, revoke }))))(
    'refuses $revoke revoked while $operation awaits $key before subsequent work', async ({ operation, key, revoke }) => {
      const h = harness();
      if (operation === 'hold') h.bind(); else if (operation === 'arm') await h.held(); else await h.armed();
      const gate = h.block(key);
      const running = operation === 'hold' ? h.api.hold(h.target) : operation === 'arm'
        ? h.api.arm(h.target, tx) : h.api.complete(h.target, tx, h.state.now + 10_000);
      const refused = expect(running).rejects.toThrow();
      await gate.entered.promise;
      if (revoke === 'target') h.active.delete(h.target);
      if (revoke === 'Pause') h.state.paused = true;
      if (revoke === 'control') h.state.controlFailed = true;
      if (revoke === 'process') h.state.processLive = false;
      const before = [...h.events]; gate.gate.resolve(); await refused;
      expect(h.events).toEqual(before);
      // Restore synthetic outer guards: the failed operation itself must remain sealed.
      h.active.add(h.target); h.state.paused = false; h.state.controlFailed = false; h.state.processLive = true;
      await remainsFailed(h);
    });

  it.each(['primary', 'witness'])('rechecks captured %s child after an asynchronous Hold', async role => {
    const h = harness(); h.bind(); const gate = h.block('hold:1');
    const running = h.api.hold(h.target); const refused = expect(running).rejects.toThrow('child revoked');
    await gate.entered.promise; h.state[role === 'primary' ? 'primaryLive' : 'witnessLive'] = false;
    gate.gate.resolve(); await refused; expect(h.read).not.toHaveBeenCalled();
  });

  it.each(['hold', 'arm', 'status', 'read', 'canonical'] as const)('retains exact %s failure and seals later operations', async site => {
    const h = harness(); const error = new Error('synthetic failure');
    if (site === 'arm') await h.held(); else if (site === 'status') await h.armed(); else h.bind();
    h[site].mockRejectedValueOnce(error);
    const running = site === 'arm' ? h.api.arm(h.target, tx) : site === 'status'
      ? h.api.complete(h.target, tx, 10_000) : h.api.hold(h.target);
    await expect(running).rejects.toBe(error); await remainsFailed(h);
  });

  it.each([0, 1, 2, 3])(
    'drains all four canonical reads before preserving rejection at ordered position %s', async rejectedIndex => {
    const h = harness(); h.bind();
    const error = new Error(`canonical refusal ${rejectedIndex}`);
    const entered = deferred(); const gate = deferred(); let call = 0;
    h.canonical.mockImplementation(async (...args) => {
      const index = call; call += 1;
      if (index === rejectedIndex) throw error;
      if (index === (rejectedIndex === 3 ? 2 : 3)) { entered.resolve(); await gate.promise; }
      return await h.canonicalResponse(...args);
    });
    const running = h.api.hold(h.target);
    const refused = expect(running).rejects.toBe(error);
    let completed = false; void running.catch(() => {}).finally(() => { completed = true; });
    await entered.promise; await Promise.resolve(); expect(completed).toBe(false);
    gate.resolve(); await refused; expect(completed).toBe(true);
    expect(h.canonical).toHaveBeenCalledTimes(4);
    await remainsFailed(h);
    },
  );

  it('polls Pending and initial index lag without another Hold or Arm', async () => {
    const h = harness(); await h.armed();
    h.status.mockResolvedValueOnce({ completed: false, finalWatermark: null });
    h.read.mockResolvedValueOnce(permitRead({ ...snapshot(51), indexedHeight: 50 }));
    await h.api.complete(h.target, tx, h.state.now + 5_000);
    expect(h.status).toHaveBeenCalledTimes(3); expect(h.delay.mock.calls.slice(1)).toEqual([[250], [250], [500]]);
    expect(h.hold).toHaveBeenCalledTimes(1); expect(h.arm).toHaveBeenCalledTimes(1);
  });

  it.each(['Pending', 'index lag'].flatMap(poll => ['target', 'Pause', 'control', 'process'].map(revoke => ({ poll, revoke }))))(
    'stops $poll polling when $revoke is revoked during its delay', async ({ poll, revoke }) => {
      const h = harness(); await h.armed();
      if (poll === 'Pending') h.status.mockResolvedValueOnce({ completed: false, finalWatermark: null });
      else h.read.mockResolvedValueOnce(permitRead({ ...snapshot(51), indexedHeight: 50 }));
      const gate = h.block('delay:1');
      const pending = h.api.complete(h.target, tx, h.state.now + 5_000);
      const refused = expect(pending).rejects.toThrow(); await gate.entered.promise;
      if (revoke === 'target') h.active.delete(h.target);
      if (revoke === 'Pause') h.state.paused = true;
      if (revoke === 'control') h.state.controlFailed = true;
      if (revoke === 'process') h.state.processLive = false;
      const before = [...h.events]; gate.gate.resolve(); await refused; expect(h.events).toEqual(before);
    });

  it('rejects completion replay before another status request', async () => {
    const h = harness(); await h.armed(); await h.api.complete(h.target, tx, h.state.now + 5_000);
    const calls = h.status.mock.calls.length;
    await expect(h.api.complete(h.target, tx, h.state.now + 5_000)).rejects.toThrow('differs');
    expect(h.status).toHaveBeenCalledTimes(calls); await remainsFailed(h);
  });

  it.each(['advanced full', 'index above full', 'same-height fork', 'canonical fork', 'canonical duplicate', 'stability index reversal', 'final index reversal', 'fresh Pending', 'fresh fork', 'fresh height'])(
    'refuses isolated completion %s without permitting another Arm', async fault => {
      const h = harness(); await h.armed();
      if (fault === 'advanced full') h.read.mockResolvedValueOnce(permitRead(snapshot(52)));
      if (fault === 'index above full') h.read.mockResolvedValueOnce(permitRead({ ...snapshot(51), indexedHeight: 52 }));
      if (fault === 'same-height fork') h.read.mockResolvedValueOnce(permitRead({ ...snapshot(51), headerIdHex: id(52) }));
      if (fault === 'canonical fork') h.canonical.mockResolvedValueOnce([id(52)]);
      if (fault === 'canonical duplicate') h.canonical.mockResolvedValueOnce([id(51), id(51)]);
      if (fault === 'stability index reversal' || fault === 'final index reversal') {
        let reads = 0; h.read.mockImplementation(async () => {
          reads += 1; return permitRead(reads === (fault === 'stability index reversal' ? 3 : 5)
            ? { ...snapshot(51), indexedHeight: 50 } : snapshot(51));
        });
      }
      if (fault.startsWith('fresh')) {
        h.status.mockResolvedValueOnce({ completed: true, finalWatermark: watermark(51) });
        h.status.mockResolvedValueOnce(fault === 'fresh Pending' ? { completed: false, finalWatermark: null }
          : { completed: true, finalWatermark: fault === 'fresh fork' ? { height: 51, headerId: id(52) } : watermark(52) });
      }
      await expect(h.api.complete(h.target, tx, h.state.now + 5_000)).rejects.toThrow(); await remainsFailed(h);
    });

  it.each(['Hold stability', 'completion closing'] as const)(
    'refuses canonical parent drift during $0 while ID and height remain exact', async boundary => {
      const h = harness();
      if (boundary === 'completion closing') { await h.armed(); h.canonical.mockClear(); }
      else h.bind();
      const originalRead = h.read.getMockImplementation()!;
      let readCount = 0;
      h.read.mockImplementation(async (...args) => {
        const changed = ++readCount > (boundary === 'Hold stability' ? 2 : 4);
        if (changed) h.state.primaryBestHeader = h.state.witnessBestHeader = { ...header(h.state.tip.fullHeight), parentId: id(1) };
        return originalRead(...args);
      });
      let slices = 0;
      h.canonical.mockImplementation(async (...args) => {
        const value = await h.canonicalResponse(...args);
        if (!args[1].startsWith('/blocks/chainSlice')) return value;
        slices += 1;
        const drift = boundary === 'Hold stability' ? slices > 2 : slices > 4;
        return drift ? [{ ...(value as Record<string, unknown>[])[0], parentId: id(1) }] : value;
      });
      const running = boundary === 'Hold stability' ? h.api.hold(h.target)
        : h.api.complete(h.target, tx, h.state.now + 5_000);
      await expect(running).rejects.toThrow('canonical header changed');
      await remainsFailed(h);
    },
  );

  it.each([NaN, Infinity, -Infinity, 0])('refuses unusable original completion deadline %s before status', async deadline => {
    const h = harness(); await h.armed();
    await expect(h.api.complete(h.target, tx, deadline)).rejects.toThrow();
    expect(h.status).not.toHaveBeenCalled(); await remainsFailed(h);
  });

  it.each([1, 3_000, 5_000])('clamps each status read to original remaining deadline %s', async remaining => {
    const h = harness(); await h.armed(); const deadline = h.state.now + remaining;
    if (remaining === 1) {
      await expect(h.api.complete(h.target, tx, deadline)).rejects.toThrow('deadline');
      expect(h.status.mock.calls.map(call => call[1])).toEqual([1]); await remainsFailed(h);
    } else {
      await h.api.complete(h.target, tx, deadline);
      expect(h.status.mock.calls.map(call => call[1])).toEqual([Math.min(3_000, remaining), Math.min(3_000, remaining - 500)]);
    }
  });

  it('never resets an original deadline across Pending polls', async () => {
    const h = harness(); await h.armed(); h.status.mockResolvedValue({ completed: false, finalWatermark: null });
    await expect(h.api.complete(h.target, tx, h.state.now + 501)).rejects.toThrow('deadline');
    expect(h.status.mock.calls.map(call => call[1])).toEqual([501, 251, 1]);
    expect(h.read).toHaveBeenCalledTimes(4); await remainsFailed(h);
  });

  it('refuses a backwards monotonic clock after status', async () => {
    const h = harness(); await h.armed();
    h.status.mockImplementationOnce(async () => { h.state.now -= 1; return { completed: false, finalWatermark: null }; });
    await expect(h.api.complete(h.target, tx, 10_000)).rejects.toThrow('deadline'); await remainsFailed(h);
  });

  it.each(['hold', 'arm', 'complete'] as const)('refuses concurrent %s and prevents the pending operation from releasing its phase', async operation => {
    const h = harness();
    if (operation === 'hold') h.bind(); else if (operation === 'arm') await h.held(); else await h.armed();
    const gate = h.block(operation === 'complete' ? 'status:1' : `${operation}:1`);
    const invoke = () => operation === 'hold' ? h.api.hold(h.target) : operation === 'arm'
      ? h.api.arm(h.target, tx) : h.api.complete(h.target, tx, h.state.now + 10_000);
    const pending = invoke(); const rejected = expect(pending).rejects.toThrow();
    await gate.entered.promise; const before = [...h.events];
    await expect(invoke()).rejects.toThrow(); expect(h.events).toEqual(before);
    gate.gate.resolve(); await rejected; await remainsFailed(h);
  });

  it.each(['hold', 'arm', 'complete'].flatMap(operation => [false, true].map(omit => ({ operation, omit })) ))(
    'isolates public $operation return guard after inner completion (omit guard=$omit)', async ({ operation, omit }) => {
    const before = operation === 'hold' ? 'const snapshot = await binding.hold();\n  binding.assertActive();'
      : operation === 'arm' ? 'await binding.arm(transactionIdHex);\n  binding.assertActive();'
        : 'await binding.complete(transactionIdHex, completionDeadline);\n  binding.assertActive();';
    const h = harness(omit ? { before, after: before.replace('\n  binding.assertActive();', '') } : undefined);
    if (operation === 'hold') h.bind(); else if (operation === 'arm') await h.held(); else await h.armed();
    const original = h.targets.get(h.target)!;
    h.targets.set(h.target, { ...original,
      hold: async () => { const value = await original.hold(); queueMicrotask(() => h.active.delete(h.target)); return value; },
      arm: async transactionId => { await original.arm(transactionId); queueMicrotask(() => h.active.delete(h.target)); },
      complete: async (transactionId, deadline) => { await original.complete(transactionId, deadline); queueMicrotask(() => h.active.delete(h.target)); },
    });
    const pending = operation === 'hold' ? h.api.hold(h.target) : operation === 'arm' ? h.api.arm(h.target, tx)
      : h.api.complete(h.target, tx, h.state.now + 5_000);
    if (omit) { if (operation === 'hold') await expect(pending).resolves.toEqual(snapshot()); else await expect(pending).resolves.toBeUndefined(); }
    else await expect(pending).rejects.toThrow('not owned');
    expect(h.active.has(h.target)).toBe(false);
  });

  it('kills removal of the held-phase Arm predicate', async () => {
    const before = "if (phase !== 'held') throw new Error('isolated Ergo transaction permit is not held for submission');";
    const h = harness({ before, after: '' }); h.bind();
    await expect(h.api.arm(h.target, tx)).resolves.toBeUndefined(); expect(h.arm).toHaveBeenCalledTimes(1);
    const baseline = harness(); baseline.bind(); await expect(baseline.api.arm(baseline.target, tx)).rejects.toThrow('not held');
    expect(baseline.arm).not.toHaveBeenCalled();
  });
});

describe('actual bounded transaction permit header ancestry helpers', () => {
  function proof(mutation?: Mutation) {
    return extract<{
      width(heldHeight: number, tipHeight: number): number;
      ancestry(value: unknown, held: Watermark, tip: Header): Header;
    }>({ width: 'transactionPermitHeaderProofWidthV1', ancestry: 'assertTransactionPermitHeaderAncestryV1' }, constants, mutation);
  }
  function rows(): Record<string, unknown>[] { return [header(), header(41), header(42)]; }

  it.each([1, 3, constants.MAX_TRANSACTION_PERMIT_HEADER_ROWS])('returns the exact held row for a dense %s-row ancestry', width => {
    const values = Array.from({ length: width }, (_, index) => header(40 + index));
    const result = proof().ancestry(values, watermark(), header(39 + width));
    expect(result).toEqual(header()); expect(Object.isFrozen(result)).toBe(true);
    expect(proof().width(40, 39 + width)).toBe(width);
  });

  it.each([
    [0, 40], [-1, 40], [1.5, 40], [NaN, 40], [Infinity, 40],
    [40, 39], [40, 40.5], [40, NaN], [40, Infinity], [40, Number.MAX_SAFE_INTEGER + 1],
    [40, 40 + constants.MAX_TRANSACTION_PERMIT_HEADER_ROWS],
    [2_147_483_647, 2_147_483_648], [2_147_483_648, 2_147_483_648],
  ])('refuses the isolated width boundary held=%s tip=%s', (held, tip) => {
    expect(() => proof().width(held, tip)).toThrow('bounded range');
  });

  it('accepts the maximum Scala Int height as a one-row proof', () => {
    const maximum = 2_147_483_647;
    expect(proof().width(maximum, maximum)).toBe(1);
    expect(proof().ancestry([header(maximum)], watermark(maximum), header(maximum))).toEqual(header(maximum));
  });

  it.each(['not array', 'empty', 'truncated', 'extra', 'hole', 'null row', 'array row', 'inherited row fields',
    'missing id', 'missing height', 'missing parentId', 'uppercase id', 'malformed parent', 'wrong height',
    'self parent', 'duplicate id', 'broken link', 'wrong held id', 'first parent backedge', 'wrong tip id', 'wrong tip parent'])(
    'refuses isolated ancestry %s', fault => {
      const api = proof(); let value: unknown = rows(); const selected = value as Record<string, unknown>[];
      let tip = header(42);
      if (fault === 'not array') value = {};
      if (fault === 'empty') value = [];
      if (fault === 'truncated') selected.pop();
      if (fault === 'extra') selected.push(header(43));
      if (fault === 'hole') delete selected[1];
      if (fault === 'null row') (selected as unknown[])[1] = null;
      if (fault === 'array row') (selected as unknown[])[1] = [];
      if (fault === 'inherited row fields') selected[1] = Object.create(header(41));
      for (const name of ['id', 'height', 'parentId']) if (fault === `missing ${name}`) delete selected[1][name];
      if (fault === 'uppercase id') selected[1].id = 'AB'.repeat(32);
      if (fault === 'malformed parent') selected[1].parentId = 'bad';
      if (fault === 'wrong height') selected[1].height = 41.5;
      if (fault === 'self parent') selected[1].parentId = id(41);
      if (fault === 'duplicate id') { selected[2].id = id(40); tip = { ...tip, id: id(40) }; }
      if (fault === 'broken link') selected[1].parentId = id(5);
      if (fault === 'wrong held id') { selected[0].id = id(5); selected[1].parentId = id(5); }
      if (fault === 'first parent backedge') selected[0].parentId = id(42);
      if (fault === 'wrong tip id') tip = { ...tip, id: id(5) };
      if (fault === 'wrong tip parent') tip = { ...tip, parentId: id(5) };
      expect(() => api.ancestry(value, watermark(), tip)).toThrow('header ancestry');
      expect(api.ancestry(rows(), watermark(), header(42))).toEqual(header());
    },
  );

  it.each(['array entry', 'id', 'height', 'parentId'])(
    'refuses an accessor at ancestry %s without invoking it', field => {
      const values = rows(); const get = vi.fn(() => { throw new Error('accessor invoked'); });
      Object.defineProperty(field === 'array entry' ? values : values[1], field === 'array entry' ? '1' : field, { get });
      expect(() => proof().ancestry(values, watermark(), header(42))).toThrow('header ancestry');
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('refuses an inherited array entry rather than treating it as a dense row', () => {
    const values = rows(); delete values[1];
    Object.setPrototypeOf(values, Object.assign(Object.create(Array.prototype), { 1: header(41) }));
    expect(() => proof().ancestry(values, watermark(), header(42))).toThrow('dense records');
  });

  const mutants = [
    { name: 'Scala Int upper tip', before: '|| tipHeight > 2_147_483_647', after: '', fault: 'Scala Int upper tip' },
    { name: 'row cap', before: '|| width > MAX_TRANSACTION_PERMIT_HEADER_ROWS', after: '', fault: 'row cap' },
    { name: 'dense own array row', before: "const row: unknown = entry && Object.hasOwn(entry, 'value') ? entry.value : undefined;", after: 'const row: unknown = value[index];', fault: 'inherited array row' },
    { name: 'own row fields', before: 'Object.getOwnPropertyDescriptor(row, name)', after: '({ value: (row as Record<string, unknown>)[name] })', fault: 'inherited row fields' },
    { name: 'duplicate ID', before: '|| ids.has(id)', after: '', fault: 'duplicate ID' },
    { name: 'parent link', before: '|| (previous !== undefined && parentId !== previous.id)', after: '', fault: 'parent link' },
    { name: 'first parent backedge', before: '|| ids.has(first!.parentId)', after: '', fault: 'first parent backedge' },
    { name: 'observed tip parent', before: '|| previous!.parentId !== bestHeader.parentId', after: '', fault: 'observed tip parent' },
  ];
  it.each(mutants)('kills omission of ancestry $name with an unchanged positive twin', ({ before, after, fault }) => {
    const actual = proof(); const mutant = proof({ before, after });
    for (const api of [actual, mutant]) expect(api.ancestry(rows(), watermark(), header(42))).toEqual(header());
    if (fault === 'Scala Int upper tip' || fault === 'row cap') {
      const held = fault === 'row cap' ? 40 : 2_147_483_647;
      const tip = fault === 'row cap' ? 40 + constants.MAX_TRANSACTION_PERMIT_HEADER_ROWS : 2_147_483_648;
      expect(() => actual.width(held, tip)).toThrow('bounded range');
      expect(mutant.width(held, tip)).toBe(tip - held + 1);
      return;
    }
    const values = rows(); let tip = header(42);
    if (fault === 'inherited array row') {
      delete values[1]; Object.setPrototypeOf(values, Object.assign(Object.create(Array.prototype), { 1: header(41) }));
    }
    if (fault === 'inherited row fields') values[1] = Object.create(header(41));
    if (fault === 'duplicate ID') { values[2].id = id(40); tip = { ...tip, id: id(40) }; }
    if (fault === 'parent link') values[1].parentId = id(5);
    if (fault === 'first parent backedge') values[0].parentId = id(42);
    if (fault === 'observed tip parent') tip = { ...tip, parentId: id(5) };
    expect(() => actual.ancestry(values, watermark(), tip)).toThrow('header ancestry');
    expect(mutant.ancestry(values, watermark(), tip)).toEqual(values[0]);
  });
});

describe('actual old Pause and new exact held-index validators', () => {
  function input(): Validation { return { watermark: watermark(), primarySnapshot: snapshot(), witnessSnapshot: snapshot(),
    primaryHeaderIdsAtWatermark: [id(40)], witnessHeaderIdsAtWatermark: [id(40)] }; }
  it('preserves old Pause canonical descendant acceptance while the permit requires the exact held tip', () => {
    const h = harness(); const value = input(); value.primarySnapshot = snapshot(41); value.witnessSnapshot = snapshot(41);
    expect(() => h.api.paused(value)).not.toThrow(); expect(() => h.api.exact(value)).toThrow('exactly at');
    expect(() => h.api.exact(input())).not.toThrow();
  });
  it.each(['primarySnapshot', 'witnessSnapshot'] as const)('isolates each $0 snapshot and canonical identity', role => {
    const h = harness();
    for (const change of [{ network: 'mainnet' }, { fullHeight: 41 }, { indexedHeight: 39 }, { headerIdHex: id(41) }]) {
      const value = input(); value[role] = { ...value[role], ...change };
      expect(() => h.api.exact(value)).toThrow();
    }
    const field = role === 'primarySnapshot' ? 'primaryHeaderIdsAtWatermark' : 'witnessHeaderIdsAtWatermark';
    for (const ids of [[], [id(41)], [id(40), id(40)], id(40), null]) {
      const value = input(); value[field] = ids; expect(() => h.api.exact(value)).toThrow();
    }
  });
  it('kills omission of only the permit exact-height restriction', () => {
    const before = 'snapshot.fullHeight !== input.watermark!.height || snapshot.headerIdHex !== input.watermark!.headerId';
    const h = harness({ before, after: 'false' }); const value = input();
    value.primarySnapshot = snapshot(41); value.witnessSnapshot = snapshot(41);
    expect(() => h.api.exact(value)).not.toThrow();
    expect(() => harness().api.exact(value)).toThrow('exactly at');
  });
});

describe('actual deadline-aware snapshot and JSON helper bodies', () => {
  interface Reads {
    json(origin: string, path: string, deadline?: number, guard?: () => void): Promise<unknown>;
    snapshot(node: Node, settle?: boolean, deadline?: number, guard?: () => void): Promise<Snapshot>;
    permit(node: Node, parent: Watermark, deadline: number, guard: () => void): Promise<PermitRead | undefined>;
  }
  function reads(mutation?: Mutation) {
    const state = { now: 10, active: true };
    const guard = vi.fn(() => { if (!state.active) throw new Error('read lifetime revoked'); });
    const timeout = vi.fn((duration: number) => ({ duration }));
    const text = vi.fn(async (url: string) => JSON.stringify(url.endsWith('/info')
      ? { network: 'devnet', fullHeight: 40, bestFullHeaderId: id(40) } : url.endsWith('/blocks/lastHeaders/1')
        ? [header()] : { fullHeight: 40, indexedHeight: 40 }));
    const fetch = vi.fn(async (url: string, _init: RequestInit) => ({ ok: true, text: () => text(url) }));
    const api = extract<Reads>({ json: 'getJson', snapshot: 'readTargetSnapshot',
      permit: 'readTransactionPermitTargetSnapshot', record: 'plainRecord',
      integer: 'nonnegativeInteger', hex: 'fixedHex', proofWidth: 'transactionPermitHeaderProofWidthV1' }, {
      ...constants, Buffer, performance: { now: () => state.now }, AbortSignal: { timeout }, fetch,
      SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN: 'primary-double',
      SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN: 'witness-double',
      settleCopiedErgoReads: (pending: Promise<unknown>[]) => Promise.all(pending),
    }, mutation);
    return { api, state, guard, timeout, text, fetch };
  }

  it('joins the best-full header binding while a header-only extension is ahead', async () => {
    const r = reads();
    r.text.mockImplementation(async url => JSON.stringify(url.endsWith('/info')
      ? { network: 'devnet', fullHeight: 40, bestFullHeaderId: id(40) }
      : url.endsWith('/blocks/lastHeaders/1') ? [header(41)]
        : { fullHeight: 40, indexedHeight: 40 }));
    await expect(r.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 110, r.guard))
      .resolves.toEqual(permitRead(snapshot(), header(41)));
  });

  it('refuses a contradictory best-full header binding at the held height', async () => {
    const r = reads();
    r.text.mockImplementation(async url => JSON.stringify(url.endsWith('/info')
      ? { network: 'devnet', fullHeight: 40, bestFullHeaderId: id(39) }
      : url.endsWith('/blocks/lastHeaders/1') ? [header()]
        : { fullHeight: 40, indexedHeight: 40 }));
    await expect(r.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 110, r.guard))
      .rejects.toThrow();
  });

  it.each([undefined, null, 40, '', 'bad', 'AB'.repeat(32)])(
    'requires the exact raw best-full header ID without header-tip fallback: %s', async bestFullHeaderId => {
      const r = reads(); const original = r.text.getMockImplementation()!;
      r.text.mockImplementation(async url => url.endsWith('/info')
        ? JSON.stringify({ network: 'devnet', fullHeight: 40, bestFullHeaderId }) : original(url));
      await expect(r.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 110, r.guard))
        .rejects.toThrow('best full header ID');
      expect(r.fetch).toHaveBeenCalledTimes(3);
    },
  );

  it.each([undefined, null, 39, '', 'bad', 'AB'.repeat(32)])(
    'requires the exact raw best-header parent: %s', async parentId => {
      const r = reads(); const original = r.text.getMockImplementation()!;
      r.text.mockImplementation(async url => url.endsWith('/blocks/lastHeaders/1')
        ? JSON.stringify([{ ...header(), parentId }]) : original(url));
      await expect(r.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 110, r.guard))
        .rejects.toThrow('best header parent ID');
      expect(r.fetch).toHaveBeenCalledTimes(3);
    },
  );

  it('kills omission of raw best-full identity agreement with an unchanged positive twin', async () => {
    const before = '|| (fullHeight === watermark.height && fullHeaderIdHex !== watermark.headerId)';
    for (const r of [reads(), reads({ before, after: '' })]) {
      await expect(r.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 110, r.guard))
        .resolves.toEqual(permitRead());
    }
    const actual = reads(); const mutant = reads({ before, after: '' });
    for (const r of [actual, mutant]) {
      const original = r.text.getMockImplementation()!;
      r.text.mockImplementation(async url => url.endsWith('/info')
        ? JSON.stringify({ network: 'devnet', fullHeight: 40, bestFullHeaderId: id(39) }) : original(url));
    }
    await expect(actual.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 110, actual.guard))
      .rejects.toThrow('contradicts its held parent');
    await expect(mutant.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 110, mutant.guard))
      .resolves.toEqual(permitRead({ ...snapshot(), headerIdHex: id(39) }));
  });

  const partialSamples = ['header before full', 'full before header', 'index before info', 'index behind full'] as const;
  function useRawLifetimeReader(h: ReturnType<typeof harness>, r: ReturnType<typeof reads>) {
    h.read.mockImplementation((node, parent, deadline, guard) => {
      r.state.now = h.state.now;
      return r.api.permit(node, parent, deadline, guard);
    });
  }
  function sample(url: string, fault: string | undefined): string {
    if (url.endsWith('/info')) return JSON.stringify({ network: 'devnet',
      bestFullHeaderId: id(fault === 'header before full' || fault === 'index before info' ? 39 : 40),
      fullHeight: fault === 'header before full' || fault === 'index before info' ? 39 : 40 });
    if (url.endsWith('/blocks/lastHeaders/1')) return JSON.stringify([
      { height: fault === 'full before header' ? 39 : 40,
        id: fault === 'full before header' ? id(39) : id(40),
        parentId: id(fault === 'full before header' ? 38 : 39) },
    ]);
    return JSON.stringify({ fullHeight: fault === 'header before full' ? 39 : 40,
      indexedHeight: fault === 'header before full' || fault === 'index behind full' ? 39 : 40 });
  }

  it.each(partialSamples)('joins actual raw %s samples to Hold without another operation', async fault => {
    const h = harness(); const r = reads(); h.bind();
    r.text.mockImplementation(async url => sample(url,
      url.startsWith('witness-double') && h.state.now === 0 ? fault : undefined));
    useRawLifetimeReader(h, r);
    expect(await h.api.hold(h.target)).toEqual(snapshot());
    expect(h.hold).toHaveBeenCalledTimes(1); expect(h.arm).not.toHaveBeenCalled(); expect(h.status).not.toHaveBeenCalled();
    expect(h.delay.mock.calls).toEqual([[250], [500]]);
    expect(r.fetch.mock.calls.every(call => call[1].method === 'GET')).toBe(true);
    expect(r.timeout.mock.calls.every(call => call[0] <= constants.REQUEST_TIMEOUT_MS)).toBe(true);
  });

  it.each(['primary', 'witness'])('keeps one deadline and guard for each raw held %s sample', async role => {
    const r = reads();
    expect(await r.api.permit({ role, mode: 'non-mining', child: {} }, watermark(), 110, r.guard)).toEqual(permitRead());
    expect(r.timeout.mock.calls).toEqual([[100], [100], [100]]);
    expect(r.guard).toHaveBeenCalledTimes(10);
  });

  const rawRefusals = ['network', 'full above held', 'header range above bound', 'index full above held',
    'index above full', 'same-height fork', 'header cardinality', 'header ID', 'full type', 'header type',
    'index full type', 'indexed type'] as const;
  it.each(rawRefusals)('seals Hold on isolated actual raw %s before canonical lookup', async fault => {
    const h = harness(); const r = reads(); h.bind();
    r.text.mockImplementation(async url => {
      if (url.endsWith('/info')) return JSON.stringify({ network: fault === 'network' ? 'mainnet' : 'devnet',
        bestFullHeaderId: id(40),
        fullHeight: fault === 'full above held' ? 41 : fault === 'full type' ? '40' : 40 });
      if (url.endsWith('/blocks/lastHeaders/1')) return JSON.stringify(fault === 'header cardinality' ? [] : [{
        height: fault === 'header range above bound' ? 40 + constants.MAX_TRANSACTION_PERMIT_HEADER_ROWS : fault === 'header type' ? 40.5 : 40,
        id: fault === 'header ID' ? 'bad' : fault === 'same-height fork' ? id(41) : id(40),
        parentId: id(39),
      }]);
      return JSON.stringify({ fullHeight: fault === 'index full above held' ? 41
        : fault === 'index above full' ? 39 : fault === 'index full type' ? null : 40,
      indexedHeight: fault === 'indexed type' ? -1 : 40 });
    });
    useRawLifetimeReader(h, r);
    await expect(h.api.hold(h.target)).rejects.toThrow();
    expect(h.canonical).not.toHaveBeenCalled(); expect(h.delay).not.toHaveBeenCalled();
    await remainsFailed(h);
  });

  it('retains the original Hold deadline while partial raw samples remain pending', async () => {
    const h = harness(); const r = reads(); h.bind();
    r.text.mockImplementation(async url => sample(url, 'header before full'));
    useRawLifetimeReader(h, r);
    h.delay.mockImplementation(async () => { h.state.now = constants.MINING_TIMEOUT_MS; });
    await expect(h.api.hold(h.target)).rejects.toThrow('original deadline');
    expect(h.hold).toHaveBeenCalledTimes(1); expect(h.canonical).not.toHaveBeenCalled(); await remainsFailed(h);
  });

  it('refuses a regressed raw sample after the first exact indexed watermark', async () => {
    const h = harness(); const r = reads(); h.bind();
    r.text.mockImplementation(async url => sample(url, h.state.now === 0 ? undefined : 'header before full'));
    useRawLifetimeReader(h, r);
    await expect(h.api.hold(h.target)).rejects.toThrow('watermark regressed'); await remainsFailed(h);
  });

  it.each([
    { before: '|| indexedHeight > indexFullHeight', after: '|| false', fault: 'index above full' },
    { before: '|| (headerHeight === watermark.height && headerIdHex !== watermark.headerId)', after: '|| false', fault: 'same-height fork' },
  ])('kills omission of raw $fault refusal', async ({ before, after, fault }) => {
    const r = reads({ before, after });
    r.text.mockImplementation(async url => url.endsWith('/blocks/lastHeaders/1')
      ? JSON.stringify([{ height: 40, id: fault === 'same-height fork' ? id(41) : id(40), parentId: id(39) }])
      : url.endsWith('/info') ? JSON.stringify({ network: 'devnet', fullHeight: 40, bestFullHeaderId: id(40) })
        : JSON.stringify({ fullHeight: fault === 'index above full' ? 39 : 40, indexedHeight: 40 }));
    const observed = await r.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 110, r.guard);
    expect(observed === undefined || observed.bestHeader.id === id(41)).toBe(true);
  });

  it.each(['primary', 'witness'])('does not hide the other peer fork behind raw %s lag', async pendingRole => {
    const h = harness(); const r = reads(); h.bind();
    r.text.mockImplementation(async url => url.startsWith(`${pendingRole}-double`)
      ? sample(url, 'header before full')
      : url.endsWith('/blocks/lastHeaders/1') ? JSON.stringify([{ ...header(), id: id(41) }])
        : sample(url, undefined));
    useRawLifetimeReader(h, r);
    await expect(h.api.hold(h.target)).rejects.toThrow('contradicts its held parent');
    expect(h.delay).not.toHaveBeenCalled(); expect(h.canonical).not.toHaveBeenCalled(); await remainsFailed(h);
  });

  it.each(['primary', 'witness'].flatMap(role => ['same peer', 'other peer'].map(lag => ({ role, lag }))))(
    'refuses raw $role best-full identity contradiction before $lag index lag can defer it', async ({ role, lag }) => {
      const h = harness(); const r = reads(); h.bind();
      r.text.mockImplementation(async url => {
        const selectedPeer = url.startsWith(`${role}-double`);
        if (selectedPeer && url.endsWith('/info')) {
          return JSON.stringify({ network: 'devnet', fullHeight: 40, bestFullHeaderId: id(39) });
        }
        if (url.endsWith('/blockchain/indexedHeight') && selectedPeer === (lag === 'same peer')) {
          return JSON.stringify({ fullHeight: 40, indexedHeight: 39 });
        }
        return sample(url, undefined);
      });
      useRawLifetimeReader(h, r);
      await expect(h.api.hold(h.target)).rejects.toThrow('contradicts its held parent');
      expect(h.delay).not.toHaveBeenCalled(); expect(h.canonical).not.toHaveBeenCalled(); await remainsFailed(h);
    },
  );

  it('joins raw completion lag to exact indexing and fresh status before another Arm', async () => {
    const h = harness(); await h.armed(); const r = reads();
    h.read.mockClear(); h.canonical.mockClear();
    const start = h.state.now;
    r.text.mockImplementation(async url => {
      const lag = url.startsWith('witness-double') && h.state.now === start;
      if (url.endsWith('/info')) return JSON.stringify({ network: 'devnet', fullHeight: lag ? 50 : 51, bestFullHeaderId: id(lag ? 50 : 51) });
      if (url.endsWith('/blocks/lastHeaders/1')) return JSON.stringify([header(51)]);
      return JSON.stringify({ fullHeight: lag ? 50 : 51, indexedHeight: lag ? 50 : 51 });
    });
    useRawLifetimeReader(h, r);
    const deadline = start + 5_000;
    await h.api.complete(h.target, tx, deadline);
    expect(h.status).toHaveBeenCalledTimes(2);
    expect(h.read.mock.calls.every(call => call[2] === deadline)).toBe(true);
      expect(h.canonical).toHaveBeenCalledTimes(12);
    expect(h.hold).toHaveBeenCalledTimes(1); expect(h.arm).toHaveBeenCalledTimes(1);
    await h.api.arm(h.target, nextTx);
    expect(h.arm).toHaveBeenLastCalledWith(nextTx);
    expect((await h.arm.mock.results[1].value).initialParent).toEqual(watermark(51));
  });

  it('seals completion on raw regression after an exact watermark without another Arm', async () => {
    const h = harness(); await h.armed(); const r = reads(); const start = h.state.now;
    r.text.mockImplementation(async url => {
      const lag = h.state.now > start;
      if (url.endsWith('/info')) return JSON.stringify({ network: 'devnet', fullHeight: lag ? 50 : 51, bestFullHeaderId: id(lag ? 50 : 51) });
      if (url.endsWith('/blocks/lastHeaders/1')) return JSON.stringify([header(51)]);
      return JSON.stringify({ fullHeight: lag ? 50 : 51, indexedHeight: lag ? 50 : 51 });
    });
    useRawLifetimeReader(h, r);
    await expect(h.api.complete(h.target, tx, start + 5_000)).rejects.toThrow('watermark regressed');
    expect(h.status).toHaveBeenCalledTimes(1); expect(h.arm).toHaveBeenCalledTimes(1); await remainsFailed(h);
  });

  it('rechecks the original guard after the raw permit aggregate await', async () => {
    const r = reads(); let calls = 0;
    const guard = () => { if (++calls === 10) throw new Error('aggregate lifetime revoked'); };
    await expect(r.api.permit({ role: 'primary', mode: 'mining', child: {} }, watermark(), 100, guard))
      .rejects.toThrow('aggregate lifetime revoked');
    expect(r.fetch).toHaveBeenCalledTimes(3); expect(calls).toBe(10);
  });

  it.each([undefined, 11, 10_000])('uses the bounded request timeout for absolute deadline %s', async deadline => {
    const h = reads(); await h.api.json('primary-double', '/info', deadline, h.guard);
    expect(h.timeout).toHaveBeenCalledExactlyOnceWith(deadline === 11 ? 1 : 3_000);
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith('primary-double/info', {
      method: 'GET', headers: { 'Accept-Encoding': 'identity', Accept: 'application/json' },
      redirect: 'error', signal: { duration: deadline === 11 ? 1 : 3_000 },
    });
    expect(h.guard).toHaveBeenCalledTimes(3);
  });

  it.each([10, 9, 10.9, NaN, -Infinity])('refuses exhausted or invalid request deadline %s before fetch', async deadline => {
    const h = reads(); await expect(h.api.json('primary-double', '/info', deadline, h.guard)).rejects.toThrow('request budget');
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.timeout).not.toHaveBeenCalled();
  });

  it.each(['fetch', 'text'])('checks original lifetime immediately after %s', async boundary => {
    const h = reads(); const entered = deferred(); const gate = deferred();
    if (boundary === 'fetch') h.fetch.mockImplementationOnce(async () => {
      entered.resolve(); await gate.promise; return { ok: true, text: () => h.text('primary-double/info') };
    });
    else h.text.mockImplementationOnce(async () => { entered.resolve(); await gate.promise; return '{}'; });
    const pending = h.api.json('primary-double', '/info', 100, h.guard);
    const refused = expect(pending).rejects.toThrow('read lifetime revoked');
    await entered.promise; h.state.active = false; gate.resolve(); await refused;
    expect(h.text).toHaveBeenCalledTimes(boundary === 'fetch' ? 0 : 1);
  });

  it.each(['HTTP', 'oversize', 'malformed JSON', 'fetch failure', 'body failure'])('retains actual read refusal for %s', async fault => {
    const h = reads();
    if (fault === 'HTTP') h.fetch.mockResolvedValueOnce({ ok: false, text: () => h.text('unused') });
    if (fault === 'oversize') h.text.mockResolvedValueOnce(' '.repeat(constants.MAX_RESPONSE_BYTES + 1));
    if (fault === 'malformed JSON') h.text.mockResolvedValueOnce('{');
    if (fault === 'fetch failure') h.fetch.mockRejectedValueOnce(new Error('fetch failure'));
    if (fault === 'body failure') h.text.mockRejectedValueOnce(new Error('body failure'));
    await expect(h.api.json('primary-double', '/info', 100, h.guard)).rejects.toThrow();
    expect(h.fetch).toHaveBeenCalledTimes(1); if (fault === 'HTTP') expect(h.text).not.toHaveBeenCalled();
  });

  it.each(['primary', 'witness'])('forwards one original deadline and guard through all %s snapshot reads', async role => {
    const h = reads(); const node = { role, mode: 'non-mining', child: {} };
    expect(await h.api.snapshot(node, false, 110, h.guard)).toEqual(snapshot());
    expect(h.fetch.mock.calls.map(call => call[0])).toEqual([`${role}-double/info`, `${role}-double/blocks/lastHeaders/1`, `${role}-double/blockchain/indexedHeight`]);
    expect(h.timeout.mock.calls).toEqual([[100], [100], [100]]);
    expect(h.guard).toHaveBeenCalledTimes(10);
  });

  it('rejects snapshot lifetime revocation at the final aggregate await', async () => {
    const h = reads();
    let calls = 0;
    const guard = () => { calls += 1; if (calls === 10) throw new Error('aggregate lifetime revoked'); };
    await expect(h.api.snapshot({ role: 'primary', mode: 'mining', child: {} }, false, 100, guard)).rejects.toThrow('aggregate lifetime revoked');
    expect(h.fetch).toHaveBeenCalledTimes(3); expect(calls).toBe(10);
  });

  it.each(['network', 'header cardinality', 'header height', 'header ID', 'index full height'])('isolates snapshot decoding %s', async fault => {
    const h = reads();
    h.text.mockImplementation(async url => {
      if (url.endsWith('/info')) return JSON.stringify({ network: fault === 'network' ? 'mainnet' : 'devnet', fullHeight: 40 });
      if (url.endsWith('/blocks/lastHeaders/1')) return JSON.stringify(fault === 'header cardinality' ? []
        : [{ height: fault === 'header height' ? 41 : 40, id: fault === 'header ID' ? 'bad' : id(40) }]);
      return JSON.stringify({ fullHeight: fault === 'index full height' ? 41 : 40, indexedHeight: 40 });
    });
    await expect(h.api.snapshot({ role: 'primary', mode: 'mining', child: {} }, false, 100, h.guard)).rejects.toThrow();
    expect(h.fetch).toHaveBeenCalledTimes(3);
  });
});
