import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOwnedErgoMiningTransactionPermitControlV1,
  createOwnedErgoMiningTransactionPermitControlV1 } from './owned-ergo-mining-transaction-permit-control-v1.js';
import type { SubstrateFederatedOwnedMiningHoldBoundaryV1,
  SubstrateFederatedOwnedMiningHoldObserverV1 } from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';

const ownerPath = new URL('./substrate-federated-isolated-devnet-ergo-node-process-v1.ts', import.meta.url);
const ownerSource = readFileSync(ownerPath, 'utf8');
assert.equal(createHash('sha256').update(ownerSource).digest('hex'),
  '41811c0701a7be062b56abaa67262dea7d3fb6e14aab13aad026f834cebea75b',
  'freeze the investigated production input before extracting its test compartment');
const selected = [
  'bindOwnedMiningTransactionPermit', 'holdSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1',
  'observeOwnedMiningHoldBoundary',
  'requireOwnedMiningTransactionPermitTarget', 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1',
  'readTransactionPermitTargetSnapshot',
  'assertSubstrateFederatedIsolatedDevnetMiningWatermarkSnapshotsV1',
  'assertSubstrateFederatedIsolatedDevnetPausedMiningIndexedSnapshotV1',
  'assertSubstrateFederatedIsolatedDevnetTransactionPermitCanonicalSnapshotV1',
  'assertSubstrateFederatedIsolatedDevnetTransactionPermitCanonicalHeaderStableV1',
  'transactionPermitHeaderProofWidthV1', 'assertTransactionPermitHeaderAncestryV1',
  'assertExactSnapshot', 'plainRecord', 'nonnegativeInteger', 'fixedHex', 'settleCopiedErgoReads',
] as const;
type Snapshot = Readonly<{ network: string; fullHeight: number; indexedHeight: number; headerIdHex: string }>;
type ModelNode = Readonly<{ role: 'primary' | 'witness'; mode: 'mining'; child: object }>;
interface Compartment {
  bind(target: object, primary: ModelNode, witness: ModelNode, guard: () => void): void;
  hold(target: object, observe?: SubstrateFederatedOwnedMiningHoldObserverV1): Promise<Snapshot>;
}
type Fault = 'wire-schema' | 'wire-operation' | 'wire-parent-height' | 'primary-full-id'
  | 'witness-index-ahead' | 'witness-header-id' | 'primary-chain-parent' | 'witness-chain-empty'
  | 'primary-intermediate-parent';
type SourceMutation = 'bypass-reader' | 'skip-ancestry' | 'omit-paired-stage' | 'skip-read-drain';
const parsed = ts.createSourceFile(fileURLToPath(ownerPath), ownerSource, ts.ScriptTarget.Latest, true);
function numericConstant(name: string): number {
  const found = parsed.statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations.filter(declaration => declaration.name.getText(parsed) === name));
  assert.equal(found.length, 1); assert(found[0].initializer);
  function value(node: ts.Expression): number {
    if (ts.isNumericLiteral(node)) return Number(node.text);
    assert(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken);
    return value(node.left) * value(node.right);
  }
  return value(found[0].initializer);
}
const constants = Object.fromEntries(['MINIMUM_MINED_HEIGHT', 'MINING_TIMEOUT_MS',
  'REQUEST_TIMEOUT_MS', 'STABILITY_DELAY_MS', 'MAX_TRANSACTION_PERMIT_HEADER_ROWS']
  .map(name => [name, numericConstant(name)]));

// Same sealed, import-free exact-body seam as transaction-permit-lifetime-v1.test.ts.
// Private model maps never enter the production module. No process owner, child,
// target admission, journal or database is constructed or exported.
function compartment(dependencies: Record<string, unknown>, mutation?: SourceMutation): Compartment {
  let bodies = selected.map(name => {
    const matches = parsed.statements.filter((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(matches.length, 1, 'one actual production body: ' + name);
    assert(matches[0].body);
    if (mutation === 'bypass-reader' && name === 'readTransactionPermitTargetSnapshot') {
      // Deliberate test-only consumer bypass; never used by the baseline factory.
      return 'async function readTransactionPermitTargetSnapshot(){return ' +
        JSON.stringify({ snapshot: expected, bestHeader: rawHeader() }) + ';}';
    }
    return matches[0].getText(parsed);
  }).join('\n');
  if (mutation === 'skip-ancestry') {
    const check = '|| (previous !== undefined && parentId !== previous.id)';
    assert.equal(bodies.split(check).length, 2, 'one isolated ancestry continuity mutant');
    bodies = bodies.replace(check, '|| false');
  }
  if (mutation === 'omit-paired-stage') {
    const mark = "observeOwnedMiningHoldBoundary(observe, 'paired-snapshot-read');";
    assert.equal(bodies.split(mark).length, 2);
    bodies = bodies.replace(mark, '');
  }
  if (mutation === 'skip-read-drain') {
    const drain = 'await Promise.allSettled([...pendingSnapshots, ...startedReads]);';
    assert.equal(bodies.split(drain).length, 2);
    bodies = bodies.replace(drain, 'void Promise.allSettled([...pendingSnapshots, ...startedReads]);');
  }
  const code = ts.transpileModule(bodies, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  assert(!/\brequire\s*\(/u.test(code), 'owner compartment must remain import-free');
  return new Function('exports', ...Object.keys(dependencies), code +
    '\nreturn {bind:bindOwnedMiningTransactionPermit,hold:holdSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1};')(
    {}, ...Object.values(dependencies)) as Compartment;
}
const height = 40;
const id = (value: number) => value.toString(16).padStart(64, '0');
const primaryOrigin = 'http://127.0.0.1:9051';
const witnessOrigin = 'http://127.0.0.1:9052';
const nonce = 'ab'.repeat(32);
const expected: Snapshot = Object.freeze({ network: 'devnet',
  fullHeight: height, indexedHeight: height, headerIdHex: id(height) });
const rawHeader = (at = height) => ({ id: id(at), height: at, parentId: id(at - 1) });

function fixture(options: Readonly<{ fault?: Fault; witnessLagOnce?: boolean; siblingIds?: boolean;
  headHeight?: 41 | 42; witnessIndexRegresses?: boolean; changeStableParent?: boolean;
  readGate?: (origin: string, route: string) => Promise<void>;
  delayGate?: (duration: number) => void }> = {}, mutation?: SourceMutation) {
  const headHeight = options.headHeight ?? height;
  const target = Object.freeze({});
  const primary: ModelNode = Object.freeze({ role: 'primary', mode: 'mining', child: Object.freeze({}) });
  const witness: ModelNode = Object.freeze({ role: 'witness', mode: 'mining', child: Object.freeze({}) });
  const active = new WeakSet<object>([target]);
  let now = 0; let witnessIndexes = 0; let live = true;
  const ownerFailure = new Error('model owner revoked');
  const requests: { url: string; method: string; headers: Headers; body: BodyInit | null | undefined }[] = [];
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    assert([primaryOrigin, witnessOrigin].includes(url.origin), 'unknown transport origin');
    assert.equal(url.hash, '', 'unexpected transport fragment');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/mining/ownedTransactionHoldV1') {
      assert.equal(url.origin, primaryOrigin); assert.equal(method, 'POST');
      assert.equal(init?.body, undefined);
    } else assert.equal(method, 'GET', 'unexpected transport method');
    if (url.pathname !== '/blocks/chainSlice') assert.equal(url.search, '', 'unexpected transport query');
    const headers = new Headers(init?.headers);
    requests.push({ url: url.href, method: init?.method ?? 'GET', headers, body: init?.body });
    let response: unknown;
    if (url.pathname === '/mining/ownedTransactionHoldV1') {
      // Same JSON fields and primitive types as the published Scala Hold route.
      response = { schema: 'e2s.owned-mining-transaction-hold.v1',
        operationId: headers.get('X-Ergo-Owned-Mining-Operation'), submissionHeld: true,
        maximumBlockHeight: null, parent: { headerId: id(height), height } };
      if (options.fault === 'wire-schema') (response as Record<string, unknown>).schema = 'foreign';
      if (options.fault === 'wire-operation') (response as Record<string, unknown>).operationId = '00'.repeat(32);
      if (options.fault === 'wire-parent-height') (response as { parent: { height: number } }).parent.height = 0;
    } else if (url.pathname === '/info') {
      response = { network: 'devnet', fullHeight: height,
        bestFullHeaderId: options.fault === 'primary-full-id' && url.origin === primaryOrigin ? id(height + 1) : id(height) };
    } else if (url.pathname === '/blocks/lastHeaders/1') {
      response = [{ ...rawHeader(headHeight),
        ...(options.changeStableParent && now > 0 ? { parentId: id(height - 2) } : {}),
        ...(options.fault === 'witness-header-id' && url.origin === witnessOrigin ? { id: id(headHeight + 1) } : {}) }];
    } else if (url.pathname === '/blockchain/indexedHeight') {
      let indexedHeight = height;
      if (url.origin === witnessOrigin) {
        witnessIndexes++;
        if (options.witnessLagOnce && witnessIndexes === 1) indexedHeight--;
        if (options.witnessIndexRegresses && witnessIndexes === 2) indexedHeight--;
        if (options.fault === 'witness-index-ahead') indexedHeight++;
      }
      response = { fullHeight: height, indexedHeight };
    } else if (url.pathname === '/blocks/at/40') {
      response = options.siblingIds ? [id(height), 'cd'.repeat(32)] : [id(height)];
    } else if (url.pathname === '/blocks/chainSlice') {
      assert.equal(url.search, '?fromHeight=39&toHeight=' + headHeight);
      response = options.fault === 'witness-chain-empty' && url.origin === witnessOrigin ? []
        : Array.from({ length: headHeight - height + 1 }, (_, offset) => {
          const at = height + offset;
          const wrongHeldParent = options.fault === 'primary-chain-parent' && at === height;
          const wrongIntermediate = options.fault === 'primary-intermediate-parent' && at === height + 1;
          return { ...rawHeader(at), ...(options.changeStableParent && now > 0 ? { parentId: id(height - 2) } : {}),
            ...((wrongHeldParent || wrongIntermediate) && url.origin === primaryOrigin
            ? { parentId: id(height - 2) } : {}) };
        });
    } else throw new Error('unexpected mock transport route');
    return new Response(JSON.stringify(response), { status: 200,
      headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', transport);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal);
  const control = createOwnedErgoMiningTransactionPermitControlV1(nonce, null, () => false);
  const guard = () => { if (!live) throw ownerFailure; };
  const api = compartment({
    ...constants, performance: { now: () => now },
    delay: async (duration: number) => { options.delayGate?.(duration); now += duration; },
    OWNED_EXECUTION_TARGET_BINDINGS: new WeakMap([[target, {
      assertActiveProcesses: guard, processBindingDigestHex: id(1), executionTargetIdentityDigestHex: id(2),
    }]]),
    ACTIVE_OWNED_EXECUTION_TARGETS: active,
    OWNED_MINING_TRANSACTION_PERMIT_TARGETS: new WeakMap(),
    OWNED_MINING_SUBMISSION_CONTROLS: new WeakMap([[primary.child, { transactionPermits: control }]]),
    assertLive: (_node: ModelNode) => guard(),
    assertOwnedErgoMiningTransactionPermitControlV1,
    getJson: async (origin: string, route: string, _deadline: number, assertActive: () => void) => {
      assertActive();
      await options.readGate?.(origin, route);
      const response = await transport(origin + route);
      const result: unknown = await response.json();
      assertActive();
      return result;
    },
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN: primaryOrigin,
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN: witnessOrigin,
  }, mutation);
  api.bind(target, primary, witness, guard);
  return { hold: (observe?: SubstrateFederatedOwnedMiningHoldObserverV1) => api.hold(target, observe), requests, transport,
    revoke: () => { live = false; active.delete(target); }, revokeProcess: () => { live = false; },
    ownerFailure, clock: () => now };
}
function assertStableRawRoutes(requests: ReturnType<typeof fixture>['requests'], headHeight = height): void {
  assert.equal(requests.length, 21, 'one real Hold request plus two paired raw/canonical observations');
  for (const origin of [primaryOrigin, witnessOrigin]) {
    for (const route of ['/info', '/blocks/lastHeaders/1', '/blockchain/indexedHeight',
      '/blocks/at/40', '/blocks/chainSlice?fromHeight=39&toHeight=' + headHeight]) {
      assert.equal(requests.filter(request => request.url === origin + route && request.method === 'GET').length,
        2, 'two actual reader/stability observations: ' + origin + route);
    }
  }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('actual owned Hold control to paired indexed watermark Source join', () => {
  it('accepts Scala-shaped Hold wire through actual receipt, snapshot and ancestry consumers', async () => {
    const f = fixture();
    expect(await f.hold()).toEqual(expected);
    const first = f.requests[0]!;
    expect(first.url).toBe(primaryOrigin + '/mining/ownedTransactionHoldV1');
    expect(first.method).toBe('POST'); expect(first.body).toBeUndefined();
    expect(first.headers.get('api_key')).toBe('hello');
    expect(first.headers.get('X-Ergo-Owned-Mining-Nonce')).toBe(nonce);
    assertStableRawRoutes(f.requests);
    expect(f.clock()).toBe(constants.STABILITY_DELAY_MS);
  });
  it('preserves permitted distinct canonical-height sibling IDs', async () => {
    expect(await fixture({ siblingIds: true }).hold()).toEqual(expected);
  });
  it('polls a partial witness index then requires two exact paired snapshots', async () => {
    const f = fixture({ witnessLagOnce: true });
    expect(await f.hold()).toEqual(expected);
    expect(f.clock()).toBe(250 + constants.STABILITY_DELAY_MS);
  });
  it.each<Fault>(['wire-schema', 'wire-operation', 'wire-parent-height', 'primary-full-id',
    'witness-index-ahead', 'witness-header-id', 'primary-chain-parent', 'witness-chain-empty'])(
    'refuses the isolated %s producer/consumer fault', async fault => {
      const f = fixture({ fault });
      await expect(f.hold()).rejects.toThrow();
      if (fault.startsWith('wire-')) expect(f.requests).toHaveLength(1);
    });
  it('refuses revoked model lifetime before any Hold transport', async () => {
    const f = fixture(); f.revoke();
    await expect(f.hold()).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
  });
  it('accepts a header at 41 above the independently held full/indexed watermark 40', async () => {
    const f = fixture({ headHeight: 41 });
    expect(await f.hold()).toEqual(expected);
    assertStableRawRoutes(f.requests, 41);
    expect(f.clock()).toBe(constants.STABILITY_DELAY_MS);
  });
  it('kills a bypass-reader mutant with the same raw full-ID fault refused by the baseline', async () => {
    await expect(fixture({ fault: 'primary-full-id' }).hold()).rejects.toThrow();
    const mutant = fixture({ fault: 'primary-full-id' }, 'bypass-reader');
    expect(await mutant.hold()).toEqual(expected);
    expect(() => assertStableRawRoutes(mutant.requests)).toThrow();
    expect(mutant.requests.some(request => request.url.endsWith('/info'))).toBe(false);
  });
  it('isolates a bad intermediate parent with the held anchor and observed tip unchanged', async () => {
    const options = { headHeight: 42 as const, fault: 'primary-intermediate-parent' as const };
    await expect(fixture(options).hold()).rejects.toThrow();
    const mutant = fixture(options, 'skip-ancestry');
    expect(await mutant.hold()).toEqual(expected);
    assertStableRawRoutes(mutant.requests, 42);
  });
});

describe('prospective finite Hold boundary observations', () => {
  it('keeps the actual successful request trace and observes the final post-Hold guard', async () => {
    const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
    const f = fixture();
    expect(await f.hold(stage => { stages.push(stage); return undefined; })).toEqual(expected);
    assertStableRawRoutes(f.requests);
    expect(f.clock()).toBe(constants.STABILITY_DELAY_MS);
    expect(stages).toEqual(['target-admission', 'owner-precondition', 'control-precondition',
      'operation-reservation', 'hold-request', 'hold-response-policy', 'hold-response-body',
      'hold-response-decode', 'control-postactive', 'hold-wire-parse', 'owner-post-control-active',
      'paired-snapshot-read', 'paired-watermark-validation', 'paired-canonical-read', 'ancestry-validation',
      'stability-wait', 'paired-snapshot-read', 'paired-watermark-validation', 'paired-canonical-read',
      'ancestry-validation', 'stability-validation', 'owner-post-snapshot-active', 'post-hold-active']);
  });

  it.each([
    ['wire-schema', 'hold-wire-parse'], ['primary-full-id', 'paired-snapshot-read'],
    ['witness-chain-empty', 'ancestry-validation'],
  ] as const)('observes %s as %s without replacing the control or owner failure', async (fault, last) => {
    const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
    const f = fixture({ fault });
    await expect(f.hold(stage => { stages.push(stage); return undefined; })).rejects.toThrow();
    expect(stages.at(-1)).toBe(last);
  });

  it('retains the target-admission refusal and the exact process-owner exception', async () => {
    const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
    const f = fixture(); f.revokeProcess();
    await expect(f.hold(stage => { stages.push(stage); return undefined; })).rejects.toBe(f.ownerFailure);
    expect(stages).toEqual(['target-admission']);
    expect(f.requests).toHaveLength(0);
  });

  it('still rejects a consumed Hold and revocation at the final post-Hold guard', async () => {
    const first = fixture();
    await first.hold();
    const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
    await expect(first.hold(stage => { stages.push(stage); return undefined; })).rejects.toThrow(/consumed/u);
    expect(stages.at(-1)).toBe('owner-precondition');
    assertStableRawRoutes(first.requests);
    const second = fixture();
    await expect(second.hold(stage => {
      if (stage === 'post-hold-active') second.revokeProcess();
      return undefined;
    })).rejects.toBe(second.ownerFailure);
    assertStableRawRoutes(second.requests);
  });

  it('observes lag only after a lagged read and advances through convergence', async () => {
    const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
    const f = fixture({ witnessLagOnce: true });
    expect(await f.hold(stage => { stages.push(stage); return undefined; })).toEqual(expected);
    expect(stages.filter(stage => stage === 'lag-poll')).toHaveLength(1);
    expect(stages[stages.indexOf('lag-poll') + 1]).toBe('paired-snapshot-read');
    expect(stages.at(-1)).toBe('post-hold-active');
    expect(f.clock()).toBe(250 + constants.STABILITY_DELAY_MS);
  });

  it.each([true, false])('retains the original exception at lag=%s polling or stability wait', async lag => {
    const original = Object.freeze({ synthetic: 'wait failure' });
    const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
    const f = fixture({ witnessLagOnce: lag, delayGate: () => { throw original; } });
    await expect(f.hold(stage => { stages.push(stage); return undefined; })).rejects.toBe(original);
    expect(stages.at(-1)).toBe(lag ? 'lag-poll' : 'stability-wait');
    expect(f.clock()).toBe(0);
  });

  it.each(['regressed-index', 'changed-parent'] as const)(
    'attributes %s to stability comparison after both paired observations settle', async fault => {
      const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
      const f = fixture({ witnessIndexRegresses: fault === 'regressed-index', changeStableParent: fault === 'changed-parent' });
      await expect(f.hold(stage => { stages.push(stage); return undefined; })).rejects.toThrow();
      expect(stages.at(-1)).toBe('stability-validation');
    });

  it('ignores a throwing observer on success and preserves an arbitrary original thrown value', async () => {
    const observe = (): never => { throw new Error('synthetic observation failure'); };
    const success = fixture();
    expect(await success.hold(observe)).toEqual(expected);
    assertStableRawRoutes(success.requests);
    const original = Object.freeze({ synthetic: 'original failure' });
    const failure = fixture({ readGate: async () => { throw original; } });
    await expect(failure.hold(observe)).rejects.toBe(original);
  });

  it('kills omission of the paired-read observation without changing the underlying refusal', async () => {
    for (const mutation of [undefined, 'omit-paired-stage'] as const) {
      const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
      const f = fixture({ fault: 'primary-full-id' }, mutation);
      await expect(f.hold(stage => { stages.push(stage); return undefined; })).rejects.toThrow();
      const check = () => expect(stages.at(-1)).toBe('paired-snapshot-read');
      if (mutation === undefined) check(); else expect(check).toThrow();
    }
  });

  it.each([undefined, 'skip-read-drain'] as const)(
    'keeps the paired boundary and first failure while sibling reads drain: mutant=%s', async mutation => {
      let rejectSibling!: (failure: unknown) => void;
      let reportSiblingStarted!: () => void;
      const siblingStarted = new Promise<void>(resolve => { reportSiblingStarted = resolve; });
      const sibling = new Promise<void>((_resolve, reject) => { rejectSibling = reject; });
      const original = Object.freeze({ synthetic: 'first rejection' });
      const stages: SubstrateFederatedOwnedMiningHoldBoundaryV1[] = [];
      const f = fixture({ readGate: async (origin, route) => {
        if (origin === primaryOrigin && route === '/info') throw original;
        if (origin === witnessOrigin && route === '/info') { reportSiblingStarted(); await sibling; }
      } }, mutation);
      let settled = false;
      const result = f.hold(stage => { stages.push(stage); return undefined; })
        .then(value => { settled = true; return value; }, failure => { settled = true; return failure; });
      await siblingStarted;
      // Drain already-started microtasks without releasing the selected sibling.
      for (let index = 0; index < 32; index++) await Promise.resolve();
      const check = () => expect(settled).toBe(false);
      if (mutation === undefined) check(); else expect(check).toThrow();
      expect(stages.at(-1)).toBe('paired-snapshot-read');
      rejectSibling(new Error('different later sibling failure'));
      expect(await result).toBe(original);
      expect(stages.at(-1)).toBe('paired-snapshot-read');
    });
});
