import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { parseErgoFullBlockObservationV1, assertErgoFullBlockHeaderProofV1 }
  from './ergo-settlement-core/ergo-full-block-observation-v1.js';

function parsedSource(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
}
const discovery = parsedSource('./substrate-federated-isolated-devnet-reward-input-discovery-v1.ts');
const root = parsedSource('./apps/bridge-daemon/substrate-federated-genesis-target-root-v1.ts');
const core = parsedSource('./ergo-settlement-core/ergo-full-block-observation-v1.ts');
function id(height: number) { return height.toString(16).padStart(64, '0'); }

function exactDeclarations(source: ts.SourceFile, functions: string[], constants: string[] = []) {
  return [...functions.map(name => {
    const matches = source.statements.filter((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    expect(matches).toHaveLength(1); expect(matches[0].body).toBeDefined();
    return matches[0].getText(source);
  }), ...constants.map(name => {
    const matches = source.statements.filter((node): node is ts.VariableStatement => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(declaration => declaration.name.getText(source) === name));
    expect(matches).toHaveLength(1); return matches[0].getText(source);
  })].join('\n');
}

function snapshotFixture(fullHeight: number, headerHeight: number, includeFullId = true) {
  const declarations = exactDeclarations(discovery,
    ['observeFullSnapshotV2', 'fixedHex32'], ['MAX_STABLE_SNAPSHOT_ATTEMPTS', 'GENESIS_HEADER_HEIGHT']);
  const code = ts.transpileModule(declarations, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  expect(code).not.toMatch(/\brequire\s*\(/u);
  const source = {
    getInfo: vi.fn(async (): Promise<unknown> => ({ network: 'devnet', fullHeight,
      ...(includeFullId ? { bestFullHeaderId: id(fullHeight) } : {}) })),
    getIndexedHeight: vi.fn(async () => ({ fullHeight, indexedHeight: fullHeight })),
    getBestHeader: vi.fn(async (): Promise<unknown> => ({ height: headerHeight, id: id(headerHeight), parentId: id(headerHeight - 1) })),
    getBlockHeaderIdsAtHeight: vi.fn(async (height: number): Promise<unknown> => [id(height)]),
    getBlockHeaderChainSlice: vi.fn(async (fromHeight: number, toHeight: number): Promise<unknown> =>
      Array.from({ length: toHeight - fromHeight }, (_, index) => ({ height: fromHeight + index + 1,
        id: id(fromHeight + index + 1), parentId: id(fromHeight + index) }))),
  };
  const observe = new Function('exports', 'parseErgoFullBlockObservationV1', 'assertErgoFullBlockHeaderProofV1',
    `${code}\nreturn observeFullSnapshotV2;`)({}, parseErgoFullBlockObservationV1, assertErgoFullBlockHeaderProofV1) as
    (source: object) => Promise<{ network: string; genesisHeaderIdHex: string; tipHeight: number; tipHeaderIdHex: string }>;
  return { source, run: () => observe(source) };
}

function productionFundingEquality() {
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
  visit(root); expect(matches).toHaveLength(1);
  const code = ts.transpileModule(matches[0].getText(root), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  expect(code).not.toMatch(/\brequire\s*\(/u);
  return new Function('funding', 'heldDepositSnapshot', 'batch', 'transactions', code) as (...args: unknown[]) => void;
}

describe('native held full-block anchor pair', () => {
  it('discovery retains full W40 for a coherent header-only H41 extension without best-header fallback', async () => {
    const observedCalls = (functionName: string, callName: string) => {
      const matches = discovery.statements.filter((node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) && node.name?.text === functionName);
      expect(matches).toHaveLength(1);
      let count = 0;
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callName) count++;
        ts.forEachChild(node, visit);
      }
      visit(matches[0]); return count;
    };
    expect(observedCalls('observeSourceWithinBudgetV2', 'observeFullSnapshotV2')).toBe(2);
    expect(observedCalls('observeSourceWithinBudgetV2', 'observeSnapshot')).toBe(0);
    expect(observedCalls('observeSourceWithinBudget', 'observeFullSnapshotV2')).toBe(0);
    expect(observedCalls('observeSourceWithinBudget', 'observeSnapshot')).toBe(2);
    const baseline = snapshotFixture(40, 40);
    const retained = { network: 'devnet', genesisHeaderIdHex: id(1), tipHeight: 40, tipHeaderIdHex: id(40) };
    await expect(baseline.run()).resolves.toEqual(retained);
    const equality = productionFundingEquality(); const held = { fullHeight: 40, headerIdHex: id(40) };
    const batch = { request: { target: { genesisHeaderIdHex: id(1) } } };
    const confirmations = [{ confirmationHeight: 39, confirmationHeaderIdHex: id(39) }];
    expect(() => equality({ target: retained }, held, batch, confirmations)).not.toThrow();
    const fullAdvanced = await snapshotFixture(41, 41).run();
    expect(fullAdvanced).toEqual({ ...retained, tipHeight: 41, tipHeaderIdHex: id(41) });
    expect(() => equality({ target: fullAdvanced }, held, batch, confirmations))
      .toThrow('FED deposit funding does not follow the confirmed genesis issuance');
    // Both independent refusals remain observable even if the first is RED.
    await expect.soft(snapshotFixture(40, 40, false).run()).rejects.toThrow();
    const headerOnly = snapshotFixture(40, 41);
    await expect.soft(headerOnly.run()).resolves.toEqual(retained);
    expect(headerOnly.source.getInfo).toHaveBeenCalled();
  });

  it('retries ordinary header lag within the original three-attempt limit without issuing proofs early', async () => {
    const h = snapshotFixture(40, 40);
    h.source.getBestHeader.mockResolvedValueOnce({ height: 39, id: id(39), parentId: id(38) });
    await expect(h.run()).resolves.toMatchObject({ tipHeight: 40, tipHeaderIdHex: id(40) });
    expect(h.source.getInfo).toHaveBeenCalledTimes(2);
    expect(h.source.getBlockHeaderChainSlice).toHaveBeenCalledExactlyOnceWith(39, 40);
    const behind = snapshotFixture(40, 39);
    await expect(behind.run()).rejects.toThrow('remained behind after bounded attempts');
    expect(behind.source.getInfo).toHaveBeenCalledTimes(3);
    expect(behind.source.getBlockHeaderIdsAtHeight).not.toHaveBeenCalled();
    expect(behind.source.getBlockHeaderChainSlice).not.toHaveBeenCalled();
  });

  it.each([{ genesisIds: [] }, { genesisIds: [id(1), id(9)] }])('preserves singleton genesis refusal for %j after valid full-header proof', async ({ genesisIds }) => {
    const h = snapshotFixture(40, 41);
    h.source.getBlockHeaderIdsAtHeight.mockImplementation(async height => height === 1 ? genesisIds : [id(height)]);
    await expect(h.run()).rejects.toThrow('exactly one height-1 header');
    expect(h.source.getBlockHeaderChainSlice).toHaveBeenCalledExactlyOnceWith(39, 41);
  });

  it.each(['IDs', 'ancestry'] as const)('drains the other V2 proof slot before preserving the %s rejection', async failed => {
    const h = snapshotFixture(40, 41); const failure = new Error(`${failed} refusal`);
    let entered!: () => void; let release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    if (failed === 'IDs') {
      h.source.getBlockHeaderIdsAtHeight.mockRejectedValueOnce(failure);
      const original = h.source.getBlockHeaderChainSlice.getMockImplementation()!;
      h.source.getBlockHeaderChainSlice.mockImplementationOnce(async (...args) => { entered(); await gate; return original(...args); });
    } else {
      h.source.getBlockHeaderChainSlice.mockRejectedValueOnce(failure);
      const original = h.source.getBlockHeaderIdsAtHeight.getMockImplementation()!;
      h.source.getBlockHeaderIdsAtHeight.mockImplementationOnce(async (...args) => { entered(); await gate; return original(...args); });
    }
    const pending = h.run(); const refused = expect(pending).rejects.toBe(failure);
    let settled = false; void pending.catch(() => {}).finally(() => { settled = true; });
    await reached; await Promise.resolve(); expect(settled).toBe(false);
    expect(h.source.getBlockHeaderIdsAtHeight).toHaveBeenCalledTimes(1);
    expect(h.source.getBlockHeaderChainSlice).toHaveBeenCalledTimes(1);
    release(); await refused;
    expect(h.source.getBlockHeaderIdsAtHeight).not.toHaveBeenCalledWith(1);
  });

  it('preserves V2 proof-slot order when ancestry rejects before the IDs request', async () => {
    const h = snapshotFixture(40, 41); const first = new Error('IDs refusal'); const second = new Error('ancestry refusal');
    let entered!: () => void; let release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    h.source.getBlockHeaderIdsAtHeight.mockImplementationOnce(async () => { entered(); await gate; throw first; });
    h.source.getBlockHeaderChainSlice.mockRejectedValueOnce(second);
    const pending = h.run(); const refused = expect(pending).rejects.toBe(first);
    await reached; release(); await refused;
  });
});

describe('pure full-block observation and header proof production boundaries', () => {
  function row(height: number): Record<string, unknown> { return { id: id(height), height, parentId: id(height - 1) }; }
  function info(height = 40): Record<string, unknown> { return { network: 'devnet', fullHeight: height, bestFullHeaderId: id(height) }; }
  function rows(first = 40, last = 42) { return Array.from({ length: last - first + 1 }, (_, index) => row(first + index)); }
  function observation() { return parseErgoFullBlockObservationV1(info(), row(42))!; }
  function mutatedCore(before: string, after: string) {
    const original = exactDeclarations(core, ['ownData', 'height', 'headerId', 'tuple',
      'parseErgoFullBlockObservationV1', 'assertErgoFullBlockHeaderProofV1'], ['MAX_ERGO_HEIGHT', 'ERGO_FULL_BLOCK_HEADER_PROOF_MAX_ROWS_V1'])
      .replace(/\r\n/g, '\n');
    expect(original.split(before)).toHaveLength(2);
    const code = ts.transpileModule(original.replace(before, after), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    expect(code).not.toMatch(/\brequire\s*\(/u);
    return new Function('exports', `${code}\nreturn { parse: parseErgoFullBlockObservationV1, proof: assertErgoFullBlockHeaderProofV1 };`)({}) as {
      parse: typeof parseErgoFullBlockObservationV1; proof: typeof assertErgoFullBlockHeaderProofV1;
    };
  }

  it.each([{ full: 40, head: 40 }, { full: 40, head: 42 }, { full: 40, head: 1063 }, { full: 2_147_483_647, head: 2_147_483_647 }])(
    'accepts full=$full head=$head with complete canonical-first proof', ({ full, head }) => {
      const value = parseErgoFullBlockObservationV1(info(full), row(head))!;
      expect(value.fullHeight).toBe(full); expect(value.fullHeaderIdHex).toBe(id(full)); expect(Object.isFrozen(value)).toBe(true);
      expect(assertErgoFullBlockHeaderProofV1(value, [id(full), id(9)], rows(full, head))).toEqual(row(full));
    },
  );

  it.each(['network', 'full height zero', 'full height fractional', 'full height above Scala Int', 'full height string',
    'full ID absent', 'full ID null', 'full ID uppercase', 'header height zero', 'header height above Scala Int',
    'header ID malformed', 'header parent malformed', 'header self parent', 'same-height contradiction', 'span above 1024'])(
    'refuses isolated parsed %s', fault => {
      const source = info(); const head = row(42);
      if (fault === 'network') source.network = 'mainnet';
      if (fault === 'full height zero') source.fullHeight = 0;
      if (fault === 'full height fractional') source.fullHeight = 40.5;
      if (fault === 'full height above Scala Int') source.fullHeight = 2_147_483_648;
      if (fault === 'full height string') source.fullHeight = '40';
      if (fault === 'full ID absent') delete source.bestFullHeaderId;
      if (fault === 'full ID null') source.bestFullHeaderId = null;
      if (fault === 'full ID uppercase') source.bestFullHeaderId = 'AB'.repeat(32);
      if (fault === 'header height zero') head.height = 0;
      if (fault === 'header height above Scala Int') head.height = 2_147_483_648;
      if (fault === 'header ID malformed') head.id = 'bad';
      if (fault === 'header parent malformed') head.parentId = 'bad';
      if (fault === 'header self parent') head.parentId = head.id;
      if (fault === 'same-height contradiction') { head.height = 40; head.id = id(9); }
      if (fault === 'span above 1024') Object.assign(head, row(1064));
      expect(() => parseErgoFullBlockObservationV1(source, head)).toThrow('Ergo full-block observation');
    },
  );

  it.each(['network', 'fullHeight', 'bestFullHeaderId', 'id', 'height', 'parentId'])(
    'refuses inherited and accessor-only %s without evaluating a getter', field => {
      for (const inherited of [false, true]) {
        const source = info(); const head = row(42); const record = ['id', 'height', 'parentId'].includes(field) ? head : source;
        const value = record[field]; delete record[field]; const get = vi.fn(() => { throw new Error('getter invoked'); });
        if (inherited) Object.setPrototypeOf(record, { [field]: value }); else Object.defineProperty(record, field, { get });
        expect(() => parseErgoFullBlockObservationV1(source, head)).toThrow(); expect(get).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['empty IDs', 'wrong canonical first', 'duplicate IDs', 'malformed sibling ID', 'truncated rows', 'extra rows',
    'row hole', 'inherited row', 'inherited tuple field', 'wrong row height', 'self parent', 'duplicate row ID', 'broken link',
    'wrong full ID', 'first parent backedge', 'wrong observed tip ID', 'wrong observed tip parent'])(
    'refuses isolated proof %s', fault => {
      let ids: unknown = [id(40)]; const ancestry = rows(); let value = observation();
      if (fault === 'empty IDs') ids = [];
      if (fault === 'wrong canonical first') ids = [id(9), id(40)];
      if (fault === 'duplicate IDs') ids = [id(40), id(40)];
      if (fault === 'malformed sibling ID') ids = [id(40), 'bad'];
      if (fault === 'truncated rows') ancestry.pop();
      if (fault === 'extra rows') ancestry.push(row(43));
      if (fault === 'row hole' || fault === 'inherited row') {
        delete ancestry[1]; if (fault === 'inherited row') Object.setPrototypeOf(ancestry, Object.assign(Object.create(Array.prototype), { 1: row(41) }));
      }
      if (fault === 'inherited tuple field') { delete ancestry[1].id; Object.setPrototypeOf(ancestry[1], { id: id(41) }); }
      if (fault === 'wrong row height') ancestry[1].height = 42;
      if (fault === 'self parent') ancestry[1].parentId = id(41);
      if (fault === 'duplicate row ID') { ancestry[2].id = id(40); value = { ...value, bestHeader: { ...value.bestHeader, id: id(40) } }; }
      if (fault === 'broken link') ancestry[1].parentId = id(9);
      if (fault === 'wrong full ID') { ancestry[0].id = id(9); ancestry[1].parentId = id(9); }
      if (fault === 'first parent backedge') ancestry[0].parentId = id(42);
      if (fault === 'wrong observed tip ID') value = { ...value, bestHeader: { ...value.bestHeader, id: id(9) } };
      if (fault === 'wrong observed tip parent') value = { ...value, bestHeader: { ...value.bestHeader, parentId: id(9) } };
      expect(() => assertErgoFullBlockHeaderProofV1(value, ids, ancestry)).toThrow('Ergo full-block observation');
    },
  );

  it.each(['canonical ID entry', 'ancestry entry', 'ancestry id', 'ancestry height', 'ancestry parentId'])(
    'refuses accessor %s without invoking it', field => {
      const ids = [id(40)]; const ancestry = rows(); const get = vi.fn(() => { throw new Error('getter invoked'); });
      if (field === 'canonical ID entry') Object.defineProperty(ids, '0', { get });
      else if (field === 'ancestry entry') Object.defineProperty(ancestry, '1', { get });
      else Object.defineProperty(ancestry[1], field.slice('ancestry '.length), { get });
      expect(() => assertErgoFullBlockHeaderProofV1(observation(), ids, ancestry)).toThrow(); expect(get).not.toHaveBeenCalled();
    },
  );

  it.each([
    { fault: 'full ID fallback', before: "headerId(ownData(info, 'bestFullHeaderId'))", after: "headerId(ownData(info, 'bestFullHeaderId') ?? ownData(bestHeaderValue, 'id'))" },
    { fault: 'inherited full ID', before: 'if (field === undefined) return undefined;', after: 'if (field === undefined) return (value as Record<string, unknown>)[name];' },
    { fault: 'Scala upper bound', before: '|| value > MAX_ERGO_HEIGHT', after: '' },
    { fault: 'row cap', before: 'if (bestHeader.height - fullHeight + 1 > ERGO_FULL_BLOCK_HEADER_PROOF_MAX_ROWS_V1)', after: 'if (false)' },
    { fault: 'canonical first', before: '|| (index === 0 && id !== checked.fullHeaderIdHex)', after: '' },
    { fault: 'duplicate row ID', before: '|| seen.has(current.id)', after: '' },
    { fault: 'parent link', before: '|| (previous !== undefined && current.parentId !== previous.id)', after: '' },
    { fault: 'first parent backedge', before: '|| seen.has(first!.parentId)', after: '' },
    { fault: 'observed tip parent', before: '|| previous!.parentId !== checked.bestHeader.parentId', after: '' },
  ])('kills omission of $fault with an unchanged positive twin', ({ fault, before, after }) => {
    const mutant = mutatedCore(before, after); const positive = observation();
    expect(mutant.parse(info(), row(42))).toEqual(positive);
    expect(mutant.proof(positive, [id(40)], rows())).toEqual(row(40));
    if (['full ID fallback', 'inherited full ID', 'Scala upper bound', 'row cap'].includes(fault)) {
      const source = info(); const head = row(fault === 'full ID fallback' ? 40 : 42);
      if (fault === 'full ID fallback') delete source.bestFullHeaderId;
      if (fault === 'inherited full ID') { delete source.bestFullHeaderId; Object.setPrototypeOf(source, { bestFullHeaderId: id(40) }); }
      if (fault === 'Scala upper bound') { Object.assign(source, info(2_147_483_647)); Object.assign(head, row(2_147_483_648)); }
      if (fault === 'row cap') Object.assign(head, row(1064));
      expect(() => parseErgoFullBlockObservationV1(source, head)).toThrow(); expect(mutant.parse(source, head)).toBeDefined();
      return;
    }
    const ancestry = rows(); let value = observation(); const ids = fault === 'canonical first' ? [id(9), id(40)] : [id(40)];
    if (fault === 'duplicate row ID') { ancestry[2].id = id(40); value = { ...value, bestHeader: { ...value.bestHeader, id: id(40) } }; }
    if (fault === 'parent link') ancestry[1].parentId = id(9);
    if (fault === 'first parent backedge') ancestry[0].parentId = id(42);
    if (fault === 'observed tip parent') value = { ...value, bestHeader: { ...value.bestHeader, parentId: id(9) } };
    expect(() => assertErgoFullBlockHeaderProofV1(value, ids, ancestry)).toThrow();
    expect(mutant.proof(value, ids, ancestry)).toEqual(ancestry[0]);
  });
});
