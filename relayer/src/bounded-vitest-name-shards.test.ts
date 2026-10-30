import { describe, expect, it } from 'vitest';

import {
  buildExactTestNamePatterns,
  parseListedVitestTests,
  toVitestFilterName,
} from './scripts/bounded-vitest-name-shards.js';

describe('bounded Vitest exact-name shards', () => {
  it('builds exhaustive non-overlapping shards with escaped exact names', () => {
    const tests = parseListedVitestTests([
      { name: 'suite > accepts a.b', file: '/repo/example.test.ts' },
      { name: 'suite > accepts [x]', file: '/repo/example.test.ts' },
      { name: 'suite > accepts (x|y)?', file: '/repo/example.test.ts' },
    ]);
    const patterns = buildExactTestNamePatterns(tests, 2).map(pattern => new RegExp(pattern));

    expect(patterns).toHaveLength(2);
    for (const test of tests) {
      expect(patterns.filter(pattern => pattern.test(toVitestFilterName(test.name)))).toHaveLength(1);
    }
    expect(patterns.some(pattern => pattern.test('suite accepts axb'))).toBe(false);
  });

  it.each([
    [null, /at least one test/],
    [[], /at least one test/],
    [[null], /entry 0 must be an object/],
    [[{ name: '', file: '/repo/example.test.ts' }], /non-empty name/],
    [[{ name: 'test', file: '' }], /non-empty file/],
    [[{ name: 'test', file: '/a' }, { name: 'test', file: '/b' }], /duplicate test name/],
  ])('rejects invalid Vitest list output %#', (value, expected) => {
    expect(() => parseListedVitestTests(value)).toThrow(expected);
  });

  it.each([0, 1.5, 101])('rejects invalid maximum shard size %s', size => {
    expect(() => buildExactTestNamePatterns([
      { name: 'test', file: '/repo/example.test.ts' },
    ], size)).toThrow(/integer from 1 to 100/);
  });

  it('rejects an empty parsed list at the shard boundary', () => {
    expect(() => buildExactTestNamePatterns([], 50)).toThrow(/empty Vitest test list/);
  });

  it('rejects names that become ambiguous for the Vitest filter', () => {
    expect(() => buildExactTestNamePatterns([
      { name: 'suite > test', file: '/repo/example.test.ts' },
      { name: 'suite test', file: '/repo/example.test.ts' },
    ], 50)).toThrow(/ambiguous/);
  });
});
