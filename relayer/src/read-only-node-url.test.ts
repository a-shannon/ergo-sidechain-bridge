import { describe, expect, it } from 'vitest';

import { validateReadOnlyNodeUrl } from './read-only-node-url.js';

describe('read-only node URL validation', () => {
  it('accepts absent and plain http(s) node URLs', () => {
    expect(validateReadOnlyNodeUrl(undefined, 'node')).toEqual([]);
    expect(validateReadOnlyNodeUrl('http://127.0.0.1:9053', 'node')).toEqual([]);
    expect(validateReadOnlyNodeUrl('https://node.example.test/path', 'node')).toEqual([]);
  });

  it('rejects non-http URLs without echoing the raw target', () => {
    const errors = validateReadOnlyNodeUrl('file:///tmp/node', 'node');

    expect(errors).toEqual(['node must be a valid http(s) URL']);
    expect(errors.join('\n')).not.toContain('file:///tmp/node');
  });

  it('rejects credential-bearing URLs without echoing the raw target', () => {
    const urls = [
      'http://user:pass@127.0.0.1:9053',
      'https://node.example.test?api_key=redacted',
      'https://node.example.test?client-secret=redacted',
      'https://node.example.test?access.token=redacted',
    ];

    for (const url of urls) {
      const errors = validateReadOnlyNodeUrl(url, 'node');
      expect(errors).toEqual([
        'node must not include credentials or credential query parameters',
      ]);
      expect(errors.join('\n')).not.toContain(url);
    }
  });

  it('rejects internal fixture, mock, dummy, fake, stub, testdata, synthetic, or simulated endpoint URLs without echoing them', () => {
    const urls = [
      'https://fixture-node.invalid',
      'https://node.invalid/mock-rpc',
      'https://dummy-node.invalid',
      'https://fake-node.invalid',
      'https://node.invalid/stub-rpc',
      'https://node.invalid/testdata/checkpoint',
      'https://synthetic-node.invalid',
      'https://simulated-node.invalid',
    ];

    for (const url of urls) {
      const errors = validateReadOnlyNodeUrl(url, 'node');
      expect(errors).toEqual([
        'node must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      ]);
      expect(errors.join('\n')).not.toContain(url);
    }
  });
});
