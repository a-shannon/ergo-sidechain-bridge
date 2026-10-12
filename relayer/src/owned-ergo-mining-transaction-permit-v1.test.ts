import { readFileSync } from 'node:fs';
import { types } from 'node:util';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { assertNoDuplicateJsonKeys } from './ergo-settlement-core/strict-json.js';
import {
  parseOwnedErgoMiningTransactionArmReceiptV1,
  parseOwnedErgoMiningTransactionHoldReceiptV1,
  parseOwnedErgoMiningTransactionStatusReceiptV1,
  type OwnedErgoMiningTransactionArmReceiptInputV1,
  type OwnedErgoMiningTransactionHoldReceiptInputV1,
} from './owned-ergo-mining-transaction-permit-v1.js';

const operation = 'ab'.repeat(32);
const transaction = 'cd'.repeat(32);
const header = 'ef'.repeat(32);
const finalHeader = '12'.repeat(32);
const message = 'Invalid owned Ergo mining transaction permit receipt';
const kinds = ['hold', 'arm', 'status'] as const;
type Kind = typeof kinds[number];
type RecordValue = Record<string, unknown>;

function wire(kind: Kind): RecordValue {
  const common = { schema: `e2s.owned-mining-transaction-${kind}.v1`, operationId: operation, maximumBlockHeight: 100 };
  if (kind === 'hold') return { ...common, submissionHeld: true, parent: { headerId: header, height: 40 } };
  const bound = { ...common, transactionId: transaction, initialParent: { headerId: header, height: 40 }, confirmations: 10 };
  return kind === 'arm' ? { ...bound, accepted: true }
    : { ...bound, completed: true, finalWatermark: { headerId: finalHeader, height: 51 } };
}

function input(kind: Kind, value = wire(kind)): RecordValue {
  return { wireText: JSON.stringify(value), expectedOperationIdHex: operation, expectedMaximumBlockHeight: 100,
    ...(kind === 'hold' ? {} : { expectedTransactionIdHex: transaction, expectedInitialParent: { headerId: header, height: 40 } }) };
}

function parse(kind: Kind, value: unknown) {
  if (kind === 'hold') return parseOwnedErgoMiningTransactionHoldReceiptV1(value as OwnedErgoMiningTransactionHoldReceiptInputV1);
  if (kind === 'arm') return parseOwnedErgoMiningTransactionArmReceiptV1(value as OwnedErgoMiningTransactionArmReceiptInputV1);
  return parseOwnedErgoMiningTransactionStatusReceiptV1(value as OwnedErgoMiningTransactionArmReceiptInputV1);
}

function refuse(kind: Kind, value: unknown): void {
  expect(() => parse(kind, value)).toThrowError(new Error(message));
}

for (const kind of kinds) {
  describe(`owned transaction ${kind} receipt`, () => {
    it('accepts exact native fields and freezes fresh nested output', () => {
      const args = input(kind);
      const parsed = parse(kind, args);
      expect(parsed).toEqual(wire(kind));
      expect(Object.isFrozen(parsed)).toBe(true);
      for (const value of Object.values(parsed)) if (value !== null && typeof value === 'object') expect(Object.isFrozen(value)).toBe(true);
      if (kind !== 'hold') {
        expect((parsed as { initialParent: unknown }).initialParent).not.toBe(args.expectedInitialParent);
        (args.expectedInitialParent as RecordValue).height = 99;
        expect((parsed as { initialParent: { height: number } }).initialParent.height).toBe(40);
      }
    });

    it.each([null, 100, 2_147_483_647])('accepts exact nullable/inclusive maximum %s', maximum => {
      const value = { ...wire(kind), maximumBlockHeight: maximum };
      expect(parse(kind, { ...input(kind, value), expectedMaximumBlockHeight: maximum }).maximumBlockHeight).toBe(maximum);
    });

    for (const key of Object.keys(wire(kind))) {
      it(`refuses missing wire field ${key}`, () => {
        const value = wire(kind); delete value[key]; refuse(kind, input(kind, value));
      });
    }
    for (const key of Object.keys(input(kind))) {
      it(`refuses missing expected field ${key}`, () => {
        const value = input(kind); delete value[key]; refuse(kind, value);
      });
      it(`refuses accessor expected field ${key} without executing it`, () => {
        let effects = 0;
        const value = input(kind);
        Object.defineProperty(value, key, { enumerable: true, get: () => { effects += 1; throw new Error('synthetic secret'); } });
        refuse(kind, value); expect(effects).toBe(0);
      });
      it(`refuses proxy expected field ${key} without coercion`, () => {
        let effects = 0;
        const proxy = new Proxy({}, { get: () => { effects += 1; throw new Error('synthetic secret'); },
          getPrototypeOf: () => { effects += 1; throw new Error('synthetic secret'); } });
        refuse(kind, { ...input(kind), [key]: proxy }); expect(effects).toBe(0);
      });
    }

    it.each(['schema', 'operationId', 'maximumBlockHeight'])('refuses independently different %s', key => {
      const value = wire(kind); value[key] = key === 'maximumBlockHeight' ? 101 : '34'.repeat(32);
      refuse(kind, input(kind, value));
    });
    it.each(['expectedOperationIdHex', 'expectedMaximumBlockHeight'])('refuses independently different expectation %s', key => {
      refuse(kind, { ...input(kind), [key]: key === 'expectedOperationIdHex' ? '34'.repeat(32) : 101 });
    });
    it.each(['', 'A'.repeat(64), 'g'.repeat(64), header + '\n', header.slice(1), null, 1])('refuses malformed operation %s', value => {
      refuse(kind, input(kind, { ...wire(kind), operationId: value }));
      refuse(kind, { ...input(kind), expectedOperationIdHex: value });
    });
    it.each([-1, -0, 1.5, 2_147_483_648, '100', undefined, false])('refuses malformed expected maximum %s', maximum => {
      refuse(kind, { ...input(kind), expectedMaximumBlockHeight: maximum });
    });
    it.each(['100.0', '1e2', '-0', '01', '2147483648', '"100"'])('refuses noncanonical wire maximum token %s', token => {
      refuse(kind, { ...input(kind), wireText: JSON.stringify(wire(kind)).replace('"maximumBlockHeight":100', `"maximumBlockHeight":${token}`) });
    });
    it.each(['40.0', '4e1', '-0', '0', '-1', '2147483648', '"40"'])('refuses noncanonical parent height %s', token => {
      refuse(kind, { ...input(kind), wireText: JSON.stringify(wire(kind)).replace('"height":40', `"height":${token}`) });
    });
    it.each(['unknown', '__proto__', 'constructor'])('refuses extra wire key %s', key => {
      const text = JSON.stringify(wire(kind)).replace(/}$/, `,"${key}":null}`);
      refuse(kind, { ...input(kind), wireText: text });
    });
    it('refuses duplicate root and escaped nested keys', () => {
      const text = JSON.stringify(wire(kind));
      refuse(kind, { ...input(kind), wireText: text.replace(/}$/, `,"operationId":"${operation}"}`) });
      refuse(kind, { ...input(kind), wireText: text.replace('"height":40', '"height":40,"he\\u0069ght":40') });
    });
    it('refuses extra argument, symbol and nonenumerable fields', () => {
      refuse(kind, { ...input(kind), extra: 1 });
      refuse(kind, { ...input(kind), [Symbol('extra')]: 1 });
      refuse(kind, Object.defineProperty(input(kind), 'wireText', { enumerable: false }));
    });
    it('refuses proxies, revoked proxies and hostile prototypes without traps', () => {
      let effects = 0;
      const trap = (): never => { effects += 1; throw new Error('synthetic secret'); };
      const proxy = new Proxy(input(kind), { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
      refuse(kind, proxy);
      const revoked = Proxy.revocable(input(kind), {}); revoked.revoke(); refuse(kind, revoked.proxy);
      refuse(kind, Object.defineProperties(Object.create(proxy), Object.getOwnPropertyDescriptors(input(kind))));
      refuse(kind, Object.assign(Object.create(Object.defineProperty({}, 'toJSON', { get: trap })), input(kind)));
      expect(effects).toBe(0);
    });
    it('accepts exact plain null-prototype arguments', () => {
      expect(parse(kind, Object.assign(Object.create(null), input(kind)))).toEqual(wire(kind));
    });
    it('refuses oversized, deeply nested and malformed text with generic errors', () => {
      for (const wireText of [' '.repeat(16 * 1024 + 1), 'é'.repeat(8193), '['.repeat(300) + '0' + ']'.repeat(300),
        '{"secret":"synthetic secret"', '\ufeff' + JSON.stringify(wire(kind)), 'null', '[]', 'true']) {
        refuse(kind, { ...input(kind), wireText });
      }
    });
    it('accepts exactly the 16 KiB wire boundary', () => {
      const text = JSON.stringify(wire(kind));
      expect(parse(kind, { ...input(kind), wireText: text + ' '.repeat(16 * 1024 - Buffer.byteLength(text)) })).toEqual(wire(kind));
    });
  });
}

describe('transaction permit cross-field bindings', () => {
  it.each([false, null, 1, 'true'])('requires strict hold/arm flag %s', flag => {
    refuse('hold', input('hold', { ...wire('hold'), submissionHeld: flag }));
    refuse('arm', input('arm', { ...wire('arm'), accepted: flag }));
  });
  it('accepts hold at its ceiling and refuses one higher', () => {
    expect(parse('hold', { ...input('hold', { ...wire('hold'), maximumBlockHeight: 40 }), expectedMaximumBlockHeight: 40 }).maximumBlockHeight).toBe(40);
    refuse('hold', { ...input('hold', { ...wire('hold'), maximumBlockHeight: 39 }), expectedMaximumBlockHeight: 39 });
  });
  it('accepts a held parent at the inclusive Scala Int maximum without requiring another permit', () => {
    const value = { ...wire('hold'), maximumBlockHeight: null, parent: { headerId: header, height: 2_147_483_647 } };
    expect(parse('hold', { ...input('hold', value), expectedMaximumBlockHeight: null })).toEqual(value);
  });
  for (const kind of ['arm', 'status'] as const) {
    it(`${kind} refuses matching but malformed transaction identities`, () => {
      for (const transactionId of ['', 'A'.repeat(64), 'g'.repeat(64), transaction + '\n', transaction.slice(1), null, 1]) {
        refuse(kind, { ...input(kind, { ...wire(kind), transactionId }), expectedTransactionIdHex: transactionId });
      }
    });
    it(`${kind} requires exact enumerable own expected-parent fields`, () => {
      const parent = { headerId: header, height: 40 };
      for (const bad of [{ ...parent, extra: 1 }, Object.defineProperty({ ...parent }, 'height', { enumerable: false }),
        Object.assign(Object.create({ inherited: true }), parent)]) {
        refuse(kind, { ...input(kind), expectedInitialParent: bad });
      }
    });
    it(`${kind} accepts endpoint exactly at Scala maximum`, () => {
      const parent = { headerId: header, height: 2_147_483_636 };
      const value = { ...wire(kind), initialParent: parent, maximumBlockHeight: 2_147_483_647,
        ...(kind === 'status' ? { finalWatermark: { headerId: finalHeader, height: 2_147_483_647 } } : {}) };
      expect(parse(kind, { ...input(kind, value), expectedInitialParent: parent,
        expectedMaximumBlockHeight: 2_147_483_647 }).maximumBlockHeight).toBe(2_147_483_647);
    });
    it.each(['transaction', 'parent id', 'parent height'])(`${kind} binds expected %s independently`, field => {
      const args = input(kind);
      if (field === 'transaction') args.expectedTransactionIdHex = '34'.repeat(32);
      else args.expectedInitialParent = { headerId: field === 'parent id' ? '34'.repeat(32) : header,
        height: field === 'parent height' ? 41 : 40 };
      refuse(kind, args);
    });
    it.each([9, 11, '10', null, true])(`${kind} refuses confirmations %s`, confirmations => {
      refuse(kind, input(kind, { ...wire(kind), confirmations }));
    });
    it.each([90, 2_147_483_637])(`${kind} refuses endpoint beyond cap/Int at parent %s`, height => {
      const parent = { headerId: header, height };
      const maximum = height === 90 ? 100 : null;
      const value = { ...wire(kind), initialParent: parent, maximumBlockHeight: maximum,
        ...(kind === 'status' ? { completed: false, finalWatermark: null } : {}) };
      refuse(kind, { ...input(kind, value), expectedInitialParent: parent, expectedMaximumBlockHeight: maximum });
    });
    it(`${kind} refuses nested expected-parent accessors/proxies without effects`, () => {
      let effects = 0;
      const trap = (): never => { effects += 1; throw new Error('synthetic secret'); };
      refuse(kind, { ...input(kind), expectedInitialParent: Object.defineProperty({ headerId: header }, 'height', { enumerable: true, get: trap }) });
      refuse(kind, { ...input(kind), expectedInitialParent: new Proxy({ headerId: header, height: 40 }, { get: trap, getPrototypeOf: trap, ownKeys: trap }) });
      expect(effects).toBe(0);
    });
  }
  it('accepts pending only with a null final watermark', () => {
    const value = { ...wire('status'), completed: false, finalWatermark: null };
    expect(parse('status', input('status', value))).toEqual(value);
    refuse('status', input('status', { ...wire('status'), completed: false }));
    refuse('status', input('status', { ...wire('status'), finalWatermark: null }));
  });
  it.each([null, 0, 1, 'true', 'false'])('refuses nonboolean completion %s', completed => {
    refuse('status', input('status', { ...wire('status'), completed }));
  });
  it.each([50, 52])('refuses wrong completed endpoint height %s', height => {
    refuse('status', input('status', { ...wire('status'), finalWatermark: { headerId: finalHeader, height } }));
  });
  it.each(['parent', 'initialParent', 'finalWatermark'])('requires exact block record %s', key => {
    const kind: Kind = key === 'parent' ? 'hold' : 'status';
    for (const bad of [null, [], { headerId: header }, { height: 40 }, { headerId: header, height: 40, extra: 1 },
      { headerId: header + '\n', height: key === 'finalWatermark' ? 51 : 40 }]) {
      refuse(kind, input(kind, { ...wire(kind), [key]: bad }));
    }
  });
});

describe('isolated parser relaxation mutants', () => {
  const source = readFileSync(new URL('./owned-ergo-mining-transaction-permit-v1.ts', import.meta.url), 'utf8');
  function mutant(before: string, after: string): Record<string, (value: unknown) => unknown> {
    expect(source.split(before)).toHaveLength(2);
    const compiled = ts.transpileModule(source.replace(before, after), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const exports: Record<string, (value: unknown) => unknown> = {};
    runInNewContext(compiled, { exports, Buffer, Object, Reflect, JSON, Number, Error,
      require: (name: string) => {
        if (name === 'node:util') return { types };
        if (name === './ergo-settlement-core/strict-json.js') return { assertNoDuplicateJsonKeys };
        throw new Error('Unexpected parser dependency');
      } }, { timeout: 1000 });
    return exports;
  }
  it('kills operation-identity relaxation', () => {
    const args = input('hold', { ...wire('hold'), operationId: '34'.repeat(32) });
    refuse('hold', args);
    expect(mutant('wire.operationId !== args.operation', 'false').parseOwnedErgoMiningTransactionHoldReceiptV1(args)).toBeDefined();
  });
  it('kills ten-confirmation ceiling relaxation', () => {
    const parent = { headerId: header, height: 95 };
    const args = { ...input('arm', { ...wire('arm'), initialParent: parent }), expectedInitialParent: parent };
    refuse('arm', args);
    expect(mutant('parent.height + OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1 > maximum', 'parent.height > maximum').parseOwnedErgoMiningTransactionArmReceiptV1(args)).toBeDefined();
  });
  it('kills completed-height relaxation', () => {
    const args = input('status', { ...wire('status'), finalWatermark: { headerId: finalHeader, height: 50 } });
    refuse('status', args);
    expect(mutant('finalWatermark.height !== binding.initialParent.height + OWNED_ERGO_MINING_TRANSACTION_APPLICATIONS_V1', 'false').parseOwnedErgoMiningTransactionStatusReceiptV1(args)).toBeDefined();
  });
  it('kills contradictory pending-watermark relaxation', () => {
    const args = input('status', { ...wire('status'), completed: false });
    refuse('status', args);
    expect(mutant('wire.finalWatermark !== null', 'false').parseOwnedErgoMiningTransactionStatusReceiptV1(args)).toBeDefined();
  });
});
