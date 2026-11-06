import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourcePath = new URL('./substrate-federated-isolated-devnet-ergo-node-process-v1.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const names = {
  common: 'assertSubstrateFederatedIsolatedDevnetMiningWatermarkSnapshotsV1',
  paused: 'assertSubstrateFederatedIsolatedDevnetPausedMiningIndexedSnapshotV1',
  exact: 'assertSubstrateFederatedIsolatedDevnetTransactionPermitIndexedSnapshotV1',
  canonical: 'assertSubstrateFederatedIsolatedDevnetTransactionPermitCanonicalSnapshotV1',
  stable: 'assertSubstrateFederatedIsolatedDevnetTransactionPermitCanonicalHeaderStableV1',
} as const;

type Mutation = Readonly<{ before: string; after: string }>;
type Snapshot = Readonly<{ network: string; fullHeight: number; indexedHeight: number; headerIdHex: string }>;
type Header = Readonly<{ id: string; height: number; parentId: string }>;
type Input = Readonly<{
  watermark: Readonly<{ headerId: string; height: number }> | null;
  primarySnapshot: Snapshot;
  witnessSnapshot: Snapshot;
  primaryHeaderIdsAtWatermark: unknown;
  witnessHeaderIdsAtWatermark: unknown;
  primaryCanonicalHeaders: unknown;
  witnessCanonicalHeaders: unknown;
}>;
interface API {
  paused(input: Input): void;
  exact(input: Input): void;
  canonical(input: Input): Header;
  stable(before: Header, after: Header): void;
}

function extract(mutation?: Mutation): API {
  const parsed = ts.createSourceFile(fileURLToPath(sourcePath), source, ts.ScriptTarget.Latest, true);
  let selected = [...new Set(Object.values(names))].map(name => {
    const matches = parsed.statements.filter((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(matches.length, 1, `exactly one production function: ${name}`);
    assert(matches[0].body);
    return matches[0].getText(parsed);
  }).join('\n').replace(/\r\n/g, '\n');
  if (mutation !== undefined) {
    assert.equal(selected.split(mutation.before).length, 2, 'one isolated source mutation');
    selected = selected.replace(mutation.before, mutation.after);
  }
  const code = ts.transpileModule(selected, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  assert(!/\brequire\s*\(/u.test(code), 'selected production bodies must remain import-free');
  return new Function('exports', 'MINIMUM_MINED_HEIGHT', `${code}\nreturn {${
    Object.entries(names).filter(([alias]) => alias !== 'common')
      .map(([alias, name]) => `${alias}:${name}`).join(',')}};`)({}, 10) as API;
}

const H = 40;
const W = 'aa'.repeat(32);
const S = 'bb'.repeat(32);
const P = 'cc'.repeat(32);
const Q = 'dd'.repeat(32);
const sparseIds = [W]; sparseIds.length = 2;
const accessorIds = [W, S];
Object.defineProperty(accessorIds, '1', { enumerable: true, get: () => { throw new Error('list getter executed'); } });
const customIteratorIds = [W, S];
Object.defineProperty(customIteratorIds, Symbol.iterator, {
  value: function* iterator() { yield W; yield W; },
});
const snapshot = (height = H, headerIdHex = W): Snapshot =>
  ({ network: 'devnet', fullHeight: height, indexedHeight: height, headerIdHex });
const row = (change: Partial<Header> = {}): Header & { nativeExtra: boolean } =>
  ({ id: W, height: H, parentId: P, nativeExtra: true, ...change });
function input(change: Partial<Input> = {}): Input {
  return {
    watermark: { headerId: W, height: H },
    primarySnapshot: snapshot(), witnessSnapshot: snapshot(),
    primaryHeaderIdsAtWatermark: [W], witnessHeaderIdsAtWatermark: [W],
    primaryCanonicalHeaders: [row()], witnessCanonicalHeaders: [row()],
    ...change,
  };
}

describe('transaction permit canonical watermark validator', () => {
  it('preserves the old Pause and exact-permit singleton contracts', () => {
    const api = extract();
    expect(() => api.paused(input())).not.toThrow();
    expect(() => api.exact(input())).not.toThrow();
    const descendant = input({ primarySnapshot: snapshot(H + 1, S), witnessSnapshot: snapshot(H + 1, S) });
    expect(() => api.paused(descendant)).not.toThrow();
    expect(() => api.exact(descendant)).toThrow('exactly at');
    const siblings = input({ primaryHeaderIdsAtWatermark: [W, S], witnessHeaderIdsAtWatermark: [W, S] });
    expect(() => api.paused(siblings)).toThrow('not canonical');
    expect(() => api.exact(siblings)).toThrow('not canonical');
  });

  it.each([
    { name: 'singleton lists', primary: [W], witness: [W] },
    { name: 'siblings on both nodes', primary: [W, S], witness: [W, S] },
    { name: 'siblings only on primary', primary: [W, S], witness: [W] },
    { name: 'siblings only on witness', primary: [W], witness: [W, S] },
  ])('accepts $name with one paired exact native header', ({ primary, witness }) => {
    const observed = extract().canonical(input({
      primaryHeaderIdsAtWatermark: primary, witnessHeaderIdsAtWatermark: witness,
    }));
    expect(observed).toEqual({ id: W, height: H, parentId: P });
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.keys(observed)).toEqual(['id', 'height', 'parentId']);
  });

  it('uses exact own indexed list data without consulting a custom iterator', () => {
    expect(() => extract().canonical(input({ primaryHeaderIdsAtWatermark: customIteratorIds }))).not.toThrow();
  });

  it.each([
    ['null watermark', { watermark: null }],
    ['zero watermark height', { watermark: { headerId: W, height: 0 } }],
    ['unsafe watermark height', { watermark: { headerId: W, height: Number.MAX_SAFE_INTEGER } }],
    ['uppercase watermark ID', { watermark: { headerId: W.toUpperCase(), height: H } }],
  ] as const)('refuses isolated %s', (_name, change) => {
    expect(() => extract().canonical(input(change))).toThrow('watermark');
  });

  it.each(['primarySnapshot', 'witnessSnapshot'] as const)(
    'refuses each malformed or inexact %s independently', role => {
      const api = extract();
      for (const changed of [
        { ...snapshot(), network: 'mainnet' },
        { ...snapshot(), fullHeight: 9, indexedHeight: 9 },
        { ...snapshot(), indexedHeight: H - 1 },
        { ...snapshot(), headerIdHex: W.toUpperCase() },
        snapshot(H + 1, S),
        snapshot(H, S),
      ]) expect(() => api.canonical(input({ [role]: changed }))).toThrow();
    },
  );

  it('refuses paired snapshot disagreement independently of valid canonical evidence', () => {
    expect(() => extract().canonical(input({ witnessSnapshot: snapshot(H + 1, S) }))).toThrow();
  });

  const listFaults: readonly [string, unknown][] = [
    ['non-array', W], ['empty', []], ['canonical ID not first', [S, W]],
    ['malformed member', [W, '00']], ['uppercase member', [W, S.toUpperCase()]],
    ['duplicate', [W, S, S]], ['sparse member', sparseIds], ['accessor member', accessorIds],
  ];
  it.each(['primaryHeaderIdsAtWatermark', 'witnessHeaderIdsAtWatermark'] as const)(
    'isolates every %s list refusal', role => {
      const api = extract();
      for (const [_name, value] of listFaults) {
        expect(() => api.canonical(input({ [role]: value }))).toThrow('height list');
      }
    },
  );

  const accessorRow = {};
  for (const key of ['id', 'height', 'parentId'] as const) {
    Object.defineProperty(accessorRow, key, { enumerable: true, get: () => row()[key] });
  }
  const sliceFaults: readonly [string, unknown][] = [
    ['non-array', row()], ['empty', []], ['extra row', [row(), row()]], ['non-record', [null]],
    ['missing ID', [{ height: H, parentId: P }]], ['accessor fields', [accessorRow]],
    ['wrong ID', [row({ id: S })]], ['wrong height', [row({ height: H + 1 })]],
    ['non-number height', [{ id: W, height: `${H}`, parentId: P }]],
    ['missing parent', [{ id: W, height: H }]], ['uppercase parent', [row({ parentId: P.toUpperCase() })]],
    ['self parent', [row({ parentId: W })]],
  ];
  it.each(['primaryCanonicalHeaders', 'witnessCanonicalHeaders'] as const)(
    'isolates every %s slice refusal', role => {
      const api = extract();
      for (const [_name, value] of sliceFaults) expect(() => api.canonical(input({ [role]: value }))).toThrow();
    },
  );

  it('refuses an otherwise exact parent disagreement between nodes', () => {
    expect(() => extract().canonical(input({ witnessCanonicalHeaders: [row({ parentId: Q })] })))
      .toThrow('disagree');
  });

  it('requires the complete canonical tuple to remain stable', () => {
    const api = extract(); const value = { id: W, height: H, parentId: P };
    expect(() => api.stable(value, { ...value })).not.toThrow();
    for (const after of [{ ...value, id: S }, { ...value, height: H + 1 }, { ...value, parentId: Q }]) {
      expect(() => api.stable(value, after)).toThrow('changed');
    }
  });

  const mutants = [
    {
      name: 'canonical-first',
      mutation: { before: 'seen.size !== ids.length || ids[0] !== watermark.headerId',
        after: 'seen.size !== ids.length || false' },
      invalid: () => input({ primaryHeaderIdsAtWatermark: [S, W] }),
      invoke: (api: API, value: Input) => api.canonical(value),
    },
    {
      name: 'distinct IDs',
      mutation: { before: 'seen.size !== ids.length || ids[0] !== watermark.headerId',
        after: 'false || ids[0] !== watermark.headerId' },
      invalid: () => input({ primaryHeaderIdsAtWatermark: [W, S, S] }),
      invoke: (api: API, value: Input) => api.canonical(value),
    },
    {
      name: 'header ID',
      mutation: { before: "typeof id !== 'string' || id !== watermark.headerId",
        after: "typeof id !== 'string' || false" },
      invalid: () => input({ primaryCanonicalHeaders: [row({ id: S })], witnessCanonicalHeaders: [row({ id: S })] }),
      invoke: (api: API, value: Input) => api.canonical(value),
    },
    {
      name: 'header height',
      mutation: { before: "typeof height !== 'number' || height !== watermark.height",
        after: "typeof height !== 'number' || false" },
      invalid: () => input({ primaryCanonicalHeaders: [row({ height: H + 1 })],
        witnessCanonicalHeaders: [row({ height: H + 1 })] }),
      invoke: (api: API, value: Input) => api.canonical(value),
    },
    {
      name: 'paired parent',
      mutation: { before: '|| headers[0]!.parentId !== headers[1]!.parentId', after: '|| false' },
      invalid: () => input({ witnessCanonicalHeaders: [row({ parentId: Q })] }),
      invoke: (api: API, value: Input) => api.canonical(value),
    },
  ] as const;
  it.each(mutants)('kills the isolated $name mutant while retaining its positive twin', ({ mutation, invalid, invoke }) => {
    const baseline = extract(); const mutated = extract(mutation); const bad = invalid();
    expect(() => invoke(baseline, bad)).toThrow();
    expect(() => invoke(mutated, bad)).not.toThrow();
    expect(() => invoke(baseline, input())).not.toThrow();
    expect(() => invoke(mutated, input())).not.toThrow();
  });

  it('kills the isolated stable-parent mutant while retaining its positive twin', () => {
    const mutation = { before: '|| before.parentId !== after.parentId', after: '|| false' };
    const baseline = extract(); const mutated = extract(mutation);
    const before = { id: W, height: H, parentId: P };
    expect(() => baseline.stable(before, { ...before, parentId: Q })).toThrow();
    expect(() => mutated.stable(before, { ...before, parentId: Q })).not.toThrow();
    expect(() => baseline.stable(before, { ...before })).not.toThrow();
    expect(() => mutated.stable(before, { ...before })).not.toThrow();
  });
});
