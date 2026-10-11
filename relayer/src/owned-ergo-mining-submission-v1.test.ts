import { describe, expect, it } from 'vitest';

import {
  parseOwnedErgoMiningSubmissionPauseReceiptV1,
  type OwnedErgoMiningSubmissionPauseReceiptInputV1,
} from './owned-ergo-mining-submission-v1.js';

const operation = 'ab'.repeat(32);
const headerId = 'cd'.repeat(32);
const errorMessage = 'Invalid owned Ergo mining submission pause receipt';

function wireFixture(): Record<string, any> {
  return {
    schema: 'e2s.owned-mining-submission-pause.v1',
    operationId: operation,
    submissionPaused: true,
    maximumBlockHeight: 100,
    latestAppliedBlock: { headerId, height: 40 },
  };
}

function inputFixture(): OwnedErgoMiningSubmissionPauseReceiptInputV1 {
  return {
    wireText: JSON.stringify(wireFixture()),
    expectedOperationIdHex: operation,
    expectedMaximumBlockHeight: 100,
  };
}

function parseUnknown(input: unknown) {
  return parseOwnedErgoMiningSubmissionPauseReceiptV1(input as OwnedErgoMiningSubmissionPauseReceiptInputV1);
}

function expectRefusal(input: unknown): void {
  let caught: unknown;
  try { parseUnknown(input); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toBe(errorMessage);
}

describe('owned Ergo mining submission pause receipt V1', () => {
  it('parses a synthetic Scala-shaped receipt into an immutable exact five-field value', () => {
    const parsed = parseOwnedErgoMiningSubmissionPauseReceiptV1(inputFixture());
    expect(parsed).toEqual(wireFixture());
    expect(Object.keys(parsed).sort()).toEqual([
      'schema', 'operationId', 'submissionPaused', 'maximumBlockHeight', 'latestAppliedBlock',
    ].sort());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.latestAppliedBlock)).toBe(true);
    expect(Reflect.set(parsed, 'operationId', 'ef'.repeat(32))).toBe(false);
    expect(Reflect.set(parsed.latestAppliedBlock!, 'height', 41)).toBe(false);
    expect(parsed.latestAppliedBlock!.height).toBe(40);
  });

  it.each([null, 0, 2_147_483_647])('accepts a null watermark with the exact ceiling %s', (maximum) => {
    const wire = { ...wireFixture(), maximumBlockHeight: maximum, latestAppliedBlock: null };
    const parsed = parseOwnedErgoMiningSubmissionPauseReceiptV1({
      ...inputFixture(), wireText: JSON.stringify(wire), expectedMaximumBlockHeight: maximum,
    });
    expect(parsed.maximumBlockHeight).toBe(maximum);
    expect(parsed.latestAppliedBlock).toBeNull();
  });

  it.each([
    { maximum: null, height: 2_147_483_647 },
    { maximum: 2_147_483_647, height: 2_147_483_647 },
    { maximum: 1, height: 1 },
  ])('accepts an inclusive watermark bound: $maximum / $height', ({ maximum, height }) => {
    const wire = { ...wireFixture(), maximumBlockHeight: maximum, latestAppliedBlock: { headerId, height } };
    expect(parseOwnedErgoMiningSubmissionPauseReceiptV1({
      ...inputFixture(), wireText: JSON.stringify(wire), expectedMaximumBlockHeight: maximum,
    }).latestAppliedBlock).toEqual({ headerId, height });
  });

  it.each(['schema', 'operationId', 'submissionPaused', 'maximumBlockHeight', 'latestAppliedBlock'])(
    'rejects the isolated missing wire field %s', (key) => {
      const wire = wireFixture();
      delete wire[key];
      expectRefusal({ ...inputFixture(), wireText: JSON.stringify(wire) });
    },
  );

  it.each([
    { name: 'wrong schema', change: (wire: any) => { wire.schema = 'other'; } },
    { name: 'non-string schema', change: (wire: any) => { wire.schema = 1; } },
    { name: 'extra root field', change: (wire: any) => { wire.ownerNonce = 'private-fixture-text'; } },
    { name: 'false pause', change: (wire: any) => { wire.submissionPaused = false; } },
    { name: 'string pause', change: (wire: any) => { wire.submissionPaused = 'true'; } },
    { name: 'numeric pause', change: (wire: any) => { wire.submissionPaused = 1; } },
    { name: 'wrong operation', change: (wire: any) => { wire.operationId = 'ef'.repeat(32); } },
    { name: 'uppercase operation', change: (wire: any) => { wire.operationId = operation.toUpperCase(); } },
    { name: 'short operation', change: (wire: any) => { wire.operationId = operation.slice(1); } },
    { name: 'non-string operation', change: (wire: any) => { wire.operationId = 1; } },
    { name: 'wrong ceiling', change: (wire: any) => { wire.maximumBlockHeight = 101; } },
    { name: 'null ceiling mismatch', change: (wire: any) => { wire.maximumBlockHeight = null; } },
    { name: 'fractional ceiling', change: (wire: any) => { wire.maximumBlockHeight = 100.5; } },
    { name: 'negative ceiling', change: (wire: any) => { wire.maximumBlockHeight = -1; } },
    { name: 'ceiling above Scala Int', change: (wire: any) => { wire.maximumBlockHeight = 2_147_483_648; } },
    { name: 'string ceiling', change: (wire: any) => { wire.maximumBlockHeight = '100'; } },
    { name: 'boolean ceiling', change: (wire: any) => { wire.maximumBlockHeight = true; } },
    { name: 'array watermark', change: (wire: any) => { wire.latestAppliedBlock = []; } },
    { name: 'primitive watermark', change: (wire: any) => { wire.latestAppliedBlock = true; } },
    { name: 'missing watermark id', change: (wire: any) => { delete wire.latestAppliedBlock.headerId; } },
    { name: 'missing watermark height', change: (wire: any) => { delete wire.latestAppliedBlock.height; } },
    { name: 'extra watermark field', change: (wire: any) => { wire.latestAppliedBlock.extra = true; } },
    { name: 'uppercase watermark id', change: (wire: any) => { wire.latestAppliedBlock.headerId = headerId.toUpperCase(); } },
    { name: 'short watermark id', change: (wire: any) => { wire.latestAppliedBlock.headerId = headerId.slice(1); } },
    { name: 'non-string watermark id', change: (wire: any) => { wire.latestAppliedBlock.headerId = 1; } },
    { name: 'zero watermark height', change: (wire: any) => { wire.latestAppliedBlock.height = 0; } },
    { name: 'negative watermark height', change: (wire: any) => { wire.latestAppliedBlock.height = -1; } },
    { name: 'fractional watermark height', change: (wire: any) => { wire.latestAppliedBlock.height = 40.5; } },
    { name: 'watermark above Scala Int', change: (wire: any) => { wire.latestAppliedBlock.height = 2_147_483_648; } },
    { name: 'string watermark height', change: (wire: any) => { wire.latestAppliedBlock.height = '40'; } },
    { name: 'boolean watermark height', change: (wire: any) => { wire.latestAppliedBlock.height = true; } },
    { name: 'watermark above ceiling', change: (wire: any) => { wire.latestAppliedBlock.height = 101; } },
  ])('rejects the isolated wire fault: $name', ({ change }) => {
    const wire = wireFixture();
    change(wire);
    expectRefusal({ ...inputFixture(), wireText: JSON.stringify(wire) });
  });

  it('rejects a positive watermark under a zero ceiling', () => {
    const wire = { ...wireFixture(), maximumBlockHeight: 0, latestAppliedBlock: { headerId, height: 1 } };
    expectRefusal({ ...inputFixture(), wireText: JSON.stringify(wire), expectedMaximumBlockHeight: 0 });
  });

  it.each([0, -1, 1.5, 2_147_483_648, '1', true, null])(
    'rejects invalid watermark height %s independently of a ceiling', (height) => {
      const wire = { ...wireFixture(), maximumBlockHeight: null, latestAppliedBlock: { headerId, height } };
      expectRefusal({ ...inputFixture(), wireText: JSON.stringify(wire), expectedMaximumBlockHeight: null });
    },
  );

  it.each([-1, 100.5, 2_147_483_648, '100', true])(
    'rejects invalid matching ceiling values %s instead of relying on a mismatch', (maximum) => {
      const wire = { ...wireFixture(), maximumBlockHeight: maximum, latestAppliedBlock: null };
      expectRefusal({ ...inputFixture(), wireText: JSON.stringify(wire), expectedMaximumBlockHeight: maximum });
    },
  );

  it('rejects negative-zero wire ceiling even when the expected ceiling is zero', () => {
    const wire = { ...wireFixture(), maximumBlockHeight: 0, latestAppliedBlock: null };
    expectRefusal({
      ...inputFixture(), expectedMaximumBlockHeight: 0,
      wireText: JSON.stringify(wire).replace('"maximumBlockHeight":0', '"maximumBlockHeight":-0'),
    });
  });

  it.each([
    '', 'null', '[]', 'true', '{}', '{',
    `${JSON.stringify(wireFixture())} trailing-private-fixture-text`,
    JSON.stringify(wireFixture()).replace('"maximumBlockHeight":100', '"maximumBlockHeight":NaN'),
  ])('rejects malformed or non-object JSON without echoing it: %s', (wireText) => {
    expectRefusal({ ...inputFixture(), wireText });
  });

  it.each([
    JSON.stringify(wireFixture()).replace('"schema":', '"schema":"private-fixture-text","schema":'),
    JSON.stringify(wireFixture()).replace('"operationId":', '"operationId":"private-fixture-text","\\u006fperationId":'),
    JSON.stringify(wireFixture()).replace('"headerId":', '"headerId":"private-fixture-text","headerId":'),
    JSON.stringify(wireFixture()).replace('"height":40', '"height":40,"\\u0068eight":40'),
  ])('rejects duplicate JSON keys before decoding: %s', (wireText) => {
    expectRefusal({ ...inputFixture(), wireText });
  });

  it('accepts exactly 16 KiB and rejects the next wire byte', () => {
    const wireText = inputFixture().wireText.padEnd(16 * 1024, ' ');
    expect(Buffer.byteLength(wireText, 'utf8')).toBe(16 * 1024);
    expect(parseOwnedErgoMiningSubmissionPauseReceiptV1({ ...inputFixture(), wireText })).toEqual(wireFixture());
    expectRefusal({ ...inputFixture(), wireText: `${wireText} ` });
  });

  it('refuses oversized multibyte UTF-8 text with a shorter character count', () => {
    const wireText = 'é'.repeat(8193);
    expect(wireText.length).toBeLessThan(16 * 1024);
    expect(Buffer.byteLength(wireText, 'utf8')).toBeGreaterThan(16 * 1024);
    expectRefusal({ ...inputFixture(), wireText });
  });

  it.each([
    { field: 'expectedOperationIdHex', value: 'ef'.repeat(32) },
    { field: 'expectedOperationIdHex', value: operation.toUpperCase() },
    { field: 'expectedOperationIdHex', value: 1 },
    { field: 'expectedMaximumBlockHeight', value: null },
    { field: 'expectedMaximumBlockHeight', value: 101 },
    { field: 'expectedMaximumBlockHeight', value: -0 },
    { field: 'expectedMaximumBlockHeight', value: -1 },
    { field: 'expectedMaximumBlockHeight', value: 100.5 },
    { field: 'expectedMaximumBlockHeight', value: 2_147_483_648 },
    { field: 'expectedMaximumBlockHeight', value: NaN },
    { field: 'expectedMaximumBlockHeight', value: Infinity },
    { field: 'expectedMaximumBlockHeight', value: '100' },
    { field: 'wireText', value: new String(inputFixture().wireText) },
    { field: 'wireText', value: undefined },
  ])('rejects an isolated caller binding fault: $field / $value', ({ field, value }) => {
    expectRefusal({ ...inputFixture(), [field]: value });
  });

  it.each(['wireText', 'expectedOperationIdHex', 'expectedMaximumBlockHeight'])(
    'rejects a missing input field %s', (field) => {
      const input: any = inputFixture();
      delete input[field];
      expectRefusal(input);
    },
  );

  it.each(['wireText', 'expectedOperationIdHex', 'expectedMaximumBlockHeight'])(
    'refuses input getter %s without executing it', (field) => {
      let effects = 0;
      const input = inputFixture();
      Object.defineProperty(input, field, { enumerable: true, get: () => { effects++; throw new Error('private-fixture-text'); } });
      expectRefusal(input);
      expect(effects).toBe(0);
    },
  );

  it('rejects extra, symbol and hidden input fields without invoking accessors', () => {
    let effects = 0;
    for (const key of ['extra', Symbol('extra')]) {
      const input = inputFixture();
      Object.defineProperty(input, key, { enumerable: true, get: () => { effects++; return 'private-fixture-text'; } });
      expectRefusal(input);
    }
    const hidden = inputFixture();
    Object.defineProperty(hidden, 'wireText', { value: hidden.wireText, enumerable: false });
    expectRefusal(hidden);
    expect(effects).toBe(0);
  });

  it('rejects custom and inherited prototypes without executing their getters', () => {
    let effects = 0;
    const prototype = Object.defineProperty({}, 'wireText', {
      get: () => { effects++; return 'private-fixture-text'; },
    });
    expectRefusal(Object.defineProperties(Object.create(prototype), Object.getOwnPropertyDescriptors(inputFixture())));
    expectRefusal(Object.create(inputFixture()));
    expectRefusal([]);
    expectRefusal(null);
    expect(effects).toBe(0);
  });

  it('accepts plain null-prototype own data input', () => {
    expect(parseUnknown(Object.assign(Object.create(null), inputFixture()))).toEqual(wireFixture());
  });

  it('rejects an input proxy and revoked proxy before any traps', () => {
    let effects = 0;
    const trap = (): never => { effects++; throw new Error('private-fixture-text'); };
    const proxy = new Proxy(inputFixture(), {
      get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap,
    });
    expectRefusal(proxy);
    const revoked = Proxy.revocable(inputFixture(), {});
    revoked.revoke();
    expectRefusal(revoked.proxy);
    expect(effects).toBe(0);
  });

  it.each(['wireText', 'expectedOperationIdHex', 'expectedMaximumBlockHeight'])(
    'rejects proxy input value %s without coercion or traps', (field) => {
      let effects = 0;
      const proxy = new Proxy({}, {
        get: () => { effects++; throw new Error('private-fixture-text'); },
        getPrototypeOf: () => { effects++; throw new Error('private-fixture-text'); },
      });
      expectRefusal({ ...inputFixture(), [field]: proxy });
      expect(effects).toBe(0);
    },
  );
});
