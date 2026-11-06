import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { parseErgoFullBlockObservationV1, assertErgoFullBlockHeaderProofV1 }
  from '../../ergo-settlement-core/ergo-full-block-observation-v1.js';

const rootSource = readFileSync(new URL('./substrate-federated-genesis-target-root-v1.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('root.ts', rootSource, ts.ScriptTarget.ES2022, true);
function id(height: number) { return height.toString(16).padStart(64, '0'); }

// The condition and throw are extracted together from the first-deposit branch.
type Mutation = { before: string; after: string };
function productionFundingEquality(mutation?: Mutation) {
  const matches: ts.IfStatement[] = [];
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && ts.isBlock(node.thenStatement) && node.thenStatement.statements.length === 1) {
      const statement = node.thenStatement.statements[0];
      if (ts.isThrowStatement(statement) && statement.expression && ts.isNewExpression(statement.expression)) {
        const argument = statement.expression.arguments?.[0];
        if (argument && ts.isStringLiteral(argument)
          && argument.text === 'FED deposit funding does not follow the confirmed genesis issuance') matches.push(node);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed); expect(matches).toHaveLength(1);
  let body = matches[0].getText(parsed);
  if (mutation) { expect(body.split(mutation.before)).toHaveLength(2); body = body.replace(mutation.before, mutation.after); }
  const code = ts.transpileModule(body, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  expect(code).not.toMatch(/\brequire\s*\(/u);
  return new Function('funding', 'heldDepositSnapshot', 'batch', 'transactions', code) as (...args: unknown[]) => void;
}

function heldConfirmationFixture(headerHeight = 40, brokenHeldParent = false, mutation?: Mutation) {
  const names = ['assertHeldDepositConfirmationsV1', 'settleReads', 'record'];
  const declarations = names.map(name => {
    const matches = parsed.statements.filter((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    expect(matches).toHaveLength(1); expect(matches[0].body).toBeDefined();
    return matches[0].getText(parsed);
  });
  let body = declarations.join('\n').replace(/\r\n/g, '\n');
  if (mutation) { expect(body.split(mutation.before)).toHaveLength(2); body = body.replace(mutation.before, mutation.after); }
  const code = ts.transpileModule(body, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  expect(code).not.toMatch(/\brequire\s*\(/u);
  const target = Object.freeze({ primaryNodeOrigin: 'primary-double', witnessNodeOrigin: 'witness-double' });
  const held = Object.freeze({ fullHeight: 40, headerIdHex: id(40) });
  const confirmations = [{ confirmationHeight: 39, confirmationHeaderIdHex: id(39) }];
  const row = (height: number) => ({ id: id(height), height,
    parentId: brokenHeldParent && height === 40 ? id(37) : id(height - 1) });
  const begin = vi.fn(); const end = vi.fn();
  const sources = new Map(['primary-double', 'witness-double'].map(origin => [origin, {
    beginAuthenticatedTrackerReconstruction: () => begin(origin),
    endAuthenticatedTrackerReconstruction: () => end(origin),
    getInfo: vi.fn(async (): Promise<unknown> => ({ network: 'devnet', fullHeight: 40, bestFullHeaderId: id(40) })),
    getIndexedHeight: vi.fn(async () => ({ fullHeight: 40, indexedHeight: 40 })),
    getBestHeader: vi.fn(async (): Promise<unknown> => row(headerHeight)),
    getBlockHeaderIdsAtHeight: vi.fn(async (height: number): Promise<unknown> => [id(height)]),
    getBlockHeaderById: vi.fn(async (selectedId: string) => row(Number(BigInt(`0x${selectedId}`)))),
    getBlockHeaderChainSlice: vi.fn(async (fromHeight: number, toHeight: number): Promise<unknown> =>
      Array.from({ length: toHeight - fromHeight }, (_, index) => row(fromHeight + index + 1))),
  }]));
  const state = { custody: true };
  const custody = vi.fn(() => { if (!state.custody) throw new Error('synthetic read custody revoked'); });
  const owned = vi.fn((value: unknown) => { expect(value).toBe(target); });
  const helper = new Function('assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1',
    'createBoundedAuthenticatedSpvTrackerReadOnlySource', 'parseErgoFullBlockObservationV1', 'assertErgoFullBlockHeaderProofV1',
    `${code}\nreturn assertHeldDepositConfirmationsV1;`)(
    owned, (origin: string) => sources.get(origin), parseErgoFullBlockObservationV1, assertErgoFullBlockHeaderProofV1) as
    (target: object, held: object, confirmations: object[], custody: () => void, kind: string) => Promise<void>;
  return { target, held, confirmations, custody, sources, begin, end, state, row,
    run: () => helper(target, held, confirmations, custody, 'issuance') };
}

describe('native held full-block anchor pair', () => {
  it('root retains full W40 for a coherent header-only H41 extension and preserves the original funding equality', async () => {
    const baseline = heldConfirmationFixture(); const equality = productionFundingEquality();
    const genesis = id(1); const batch = { request: { target: { genesisHeaderIdHex: genesis } } };
    const funding = (height: number) => ({ target: { genesisHeaderIdHex: genesis, tipHeight: height, tipHeaderIdHex: id(height) } });
    await expect(baseline.run()).resolves.toBeUndefined();
    expect(() => equality(funding(40), baseline.held, batch, baseline.confirmations)).not.toThrow();
    // A report retaining full anchor 41 must fail the unchanged root condition.
    expect(() => equality(funding(41), baseline.held, batch, baseline.confirmations))
      .toThrow('FED deposit funding does not follow the confirmed genesis issuance');
    // Keep H=W here so the held-tip check cannot masquerade as ancestry coverage.
    const broken = heldConfirmationFixture(40, true);
    await expect(broken.run()).rejects.toThrow('confirmation is not canonical under its held snapshot');
    expect(broken.end).toHaveBeenCalledTimes(2);
    const extended = heldConfirmationFixture(41);
    expect(extended.sources.get('primary-double')!.getInfo).not.toHaveBeenCalled();
    await expect(extended.run()).resolves.toBeUndefined();
    expect(() => equality(funding(40), extended.held, batch, extended.confirmations)).not.toThrow();
  });

  it.each(['primary-double', 'witness-double'].flatMap(role => ['full height', 'full ID', 'canonical IDs', 'ancestry'].map(field => ({ role, field })) ))(
    'refuses the isolated $role $field before releasing the held snapshot', async ({ role, field }) => {
      const h = heldConfirmationFixture(41); const peer = h.sources.get(role)!;
      if (field === 'full height') peer.getInfo.mockResolvedValue({ network: 'devnet', fullHeight: 41, bestFullHeaderId: id(41) });
      if (field === 'full ID') peer.getInfo.mockResolvedValue({ network: 'devnet', fullHeight: 40, bestFullHeaderId: id(9) });
      if (field === 'canonical IDs') peer.getBlockHeaderIdsAtHeight.mockImplementation(async height => height === 40 ? [id(9), id(40)] : [id(height)]);
      if (field === 'ancestry') peer.getBlockHeaderChainSlice.mockImplementation(async (from, to) =>
        Array.from({ length: to - from }, (_, index) => ({ ...h.row(from + index + 1),
          ...(from + index + 1 === 41 ? { parentId: id(9) } : {}) })));
      await expect(h.run()).rejects.toThrow(); expect(h.end).toHaveBeenCalledTimes(2);
      if (field.startsWith('full')) expect(peer.getBlockHeaderChainSlice).not.toHaveBeenCalled();
    },
  );

  it.each(['primary-double', 'witness-double'].flatMap(role => ['full height', 'full ID'].map(field => ({ role, field })) ))(
    'refuses isolated $role $field drift at the closing bracket', async ({ role, field }) => {
      const h = heldConfirmationFixture(41); const peer = h.sources.get(role)!;
      peer.getInfo.mockResolvedValueOnce({ network: 'devnet', fullHeight: 40, bestFullHeaderId: id(40) })
        .mockResolvedValue(field === 'full height' ? { network: 'devnet', fullHeight: 41, bestFullHeaderId: id(41) }
          : { network: 'devnet', fullHeight: 40, bestFullHeaderId: id(9) });
      await expect(h.run()).rejects.toThrow('confirmation is not canonical');
      expect(peer.getInfo).toHaveBeenCalledTimes(2); expect(h.end).toHaveBeenCalledTimes(2);
    },
  );

  it('retains W while a valid header-only extension advances between the two full-state brackets', async () => {
    const h = heldConfirmationFixture(41);
    for (const peer of h.sources.values()) peer.getBestHeader.mockResolvedValueOnce(h.row(41)).mockResolvedValue(h.row(42));
    await expect(h.run()).resolves.toBeUndefined();
    for (const peer of h.sources.values()) expect(peer.getBlockHeaderChainSlice.mock.calls).toContainEqual([39, 42]);
  });

  it.each(['primary-double', 'witness-double'].flatMap(role =>
    ['getInfo', 'getBestHeader', 'getBlockHeaderIdsAtHeight', 'getBlockHeaderChainSlice'].map(operation => ({ role, operation })) ))(
    'drains the paired read when $role $operation rejects before scope cleanup', async ({ role, operation }) => {
      const h = heldConfirmationFixture(41); const peer = h.sources.get(role)!;
      const selected = operation as 'getInfo' | 'getBestHeader' | 'getBlockHeaderIdsAtHeight' | 'getBlockHeaderChainSlice';
      const companion = selected === 'getInfo' ? 'getBestHeader' : selected === 'getBestHeader' ? 'getInfo'
        : selected === 'getBlockHeaderIdsAtHeight' ? 'getBlockHeaderChainSlice' : 'getBlockHeaderIdsAtHeight';
      const failure = new Error(`${role} ${operation} refusal`);
      let entered!: () => void; let release!: () => void;
      const reached = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
      peer[selected].mockRejectedValueOnce(failure);
      const original = peer[companion].getMockImplementation()! as (...args: number[]) => Promise<unknown>;
      peer[companion].mockImplementationOnce(async (...args: number[]) => { entered(); await gate; return original(...args); });
      const pending = h.run(); const refused = expect(pending).rejects.toBe(failure);
      let settled = false; void pending.catch(() => {}).finally(() => { settled = true; });
      await reached; await Promise.resolve(); expect(settled).toBe(false); expect(h.end).not.toHaveBeenCalled();
      release(); await refused; expect(h.end).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['primary-double', 'witness-double'].flatMap(role => ['getInfo', 'getBlockHeaderChainSlice'].map(operation => ({ role, operation })) ))(
    'rechecks custody after the awaited $role $operation', async ({ role, operation }) => {
      const h = heldConfirmationFixture(41); const peer = h.sources.get(role)!;
      const selected = operation as 'getInfo' | 'getBlockHeaderChainSlice';
      let entered!: () => void; let release!: () => void;
      const reached = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
      const original = peer[selected].getMockImplementation()! as (...args: number[]) => Promise<unknown>;
      peer[selected].mockImplementationOnce(async (...args: number[]) => { entered(); await gate; return original(...args); });
      const pending = h.run(); const refused = expect(pending).rejects.toThrow('synthetic read custody revoked');
      await reached; h.state.custody = false; release(); await refused; expect(h.end).toHaveBeenCalledTimes(2);
    },
  );

  it('kills omission of the closing full-state bracket with an unchanged positive twin', async () => {
    const mutation = { before: '    await assertHeldTips();\n    assertActive();\n  } catch (cause)',
      after: '    assertActive();\n  } catch (cause)' };
    for (const h of [heldConfirmationFixture(41), heldConfirmationFixture(41, false, mutation)]) await expect(h.run()).resolves.toBeUndefined();
    const actual = heldConfirmationFixture(41); const mutant = heldConfirmationFixture(41, false, mutation);
    for (const h of [actual, mutant]) h.sources.get('witness-double')!.getInfo
      .mockResolvedValueOnce({ network: 'devnet', fullHeight: 40, bestFullHeaderId: id(40) })
      .mockResolvedValue({ network: 'devnet', fullHeight: 41, bestFullHeaderId: id(41) });
    await expect(actual.run()).rejects.toThrow('confirmation is not canonical');
    await expect(mutant.run()).resolves.toBeUndefined();
  });

  it.each([
    { field: 'genesis', before: 'funding.target.genesisHeaderIdHex !== batch.request.target.genesisHeaderIdHex', change: 'genesisHeaderIdHex' },
    { field: 'height', before: 'funding.target.tipHeight !== heldDepositSnapshot.fullHeight', change: 'tipHeight' },
    { field: 'ID', before: 'funding.target.tipHeaderIdHex !== heldDepositSnapshot.headerIdHex', change: 'tipHeaderIdHex' },
    { field: 'receipt floor', before: 'funding.target.tipHeight < Math.max(...transactions.map(receipt => receipt.confirmationHeight))', change: 'confirmationHeight' },
  ])('kills omission of original funding equality $field with a positive twin', ({ before, change }) => {
    const actual = productionFundingEquality(); const mutant = productionFundingEquality({ before, after: 'false' });
    const h = heldConfirmationFixture(); const batch = { request: { target: { genesisHeaderIdHex: id(1) } } };
    const make = () => ({ target: { genesisHeaderIdHex: id(1), tipHeight: 40, tipHeaderIdHex: id(40) } });
    for (const check of [actual, mutant]) expect(() => check(make(), h.held, batch, h.confirmations)).not.toThrow();
    const funding = make(); const confirmations = [...h.confirmations];
    if (change === 'genesisHeaderIdHex') funding.target.genesisHeaderIdHex = id(9);
    if (change === 'tipHeight') funding.target.tipHeight = 39;
    if (change === 'tipHeaderIdHex') funding.target.tipHeaderIdHex = id(9);
    if (change === 'confirmationHeight') confirmations[0] = { ...confirmations[0], confirmationHeight: 41 };
    expect(() => actual(funding, h.held, batch, confirmations)).toThrow('does not follow');
    expect(() => mutant(funding, h.held, batch, confirmations)).not.toThrow();
  });
});
