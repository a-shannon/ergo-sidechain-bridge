import { describe, expect, it } from 'vitest';

import {
  assertErgoNodeEndpointAlignment,
  canonicalNodeOrigin,
} from './ergo-node-endpoint-alignment.js';

describe('canonicalNodeOrigin', () => {
  it('normalizes case and default ports without merging distinct hosts', () => {
    expect(canonicalNodeOrigin('http://localhost:9052', 'ERGO_NODE_URL'))
      .toBe('http://localhost:9052');
    expect(canonicalNodeOrigin('http://127.0.0.1:9052/', 'ERGO_NODE'))
      .toBe('http://127.0.0.1:9052');
    expect(canonicalNodeOrigin('http://[::1]:9052', 'ERGO_NODE'))
      .toBe('http://[::1]:9052');
    expect(canonicalNodeOrigin('https://node.example.test', 'ERGO_NODE'))
      .toBe('https://node.example.test:443');
  });

  it('rejects malformed or non-http node URLs', () => {
    expect(() => canonicalNodeOrigin('not a url', 'ERGO_NODE')).toThrow('valid URL');
    expect(() => canonicalNodeOrigin('file:///tmp/node', 'ERGO_NODE')).toThrow('http or https');
  });

  it('rejects credentials and non-origin URL components', () => {
    expect(() => canonicalNodeOrigin('http://user:pass@node.example.test:9052', 'ERGO_NODE'))
      .toThrow('must not include URL credentials');
    expect(() => canonicalNodeOrigin('http://node.example.test:9052/api', 'ERGO_NODE'))
      .toThrow('without a path, query, or fragment');
    expect(() => canonicalNodeOrigin('http://node.example.test:9052/?network=testnet', 'ERGO_NODE'))
      .toThrow('without a path, query, or fragment');
    expect(() => canonicalNodeOrigin('http://node.example.test:9052/#status', 'ERGO_NODE'))
      .toThrow('without a path, query, or fragment');
  });
});

describe('assertErgoNodeEndpointAlignment', () => {
  it('passes when ErgoClient and signer endpoints target the exact same origin', () => {
    expect(assertErgoNodeEndpointAlignment('aggregate check', {
      ergoNode: 'http://127.0.0.1:9051',
      ergoNodeUrl: 'http://127.0.0.1:9051/',
    })).toEqual({
      ergoNodeOrigin: 'http://127.0.0.1:9051',
      ergoNodeUrlOrigin: 'http://127.0.0.1:9051',
    });
  });

  it('rejects loopback aliases because they may target different listeners', () => {
    expect(() => assertErgoNodeEndpointAlignment('aggregate check', {
      ergoNode: 'http://127.0.0.1:9051',
      ergoNodeUrl: 'http://localhost:9051',
    })).toThrow('different Ergo node origins');
    expect(() => assertErgoNodeEndpointAlignment('aggregate check', {
      ergoNode: 'http://127.0.0.1:9051',
      ergoNodeUrl: 'http://[::1]:9051',
    })).toThrow('different Ergo node origins');
  });

  it('fails closed when only one endpoint was moved to a custom node', () => {
    expect(() => assertErgoNodeEndpointAlignment('aggregate check', {
      ergoNode: 'http://127.0.0.1:9052',
      ergoNodeUrl: 'http://127.0.0.1:9051',
    })).toThrow('different Ergo node origins');
  });

  it('fails closed when ERGO_NODE_URL moved but ERGO_NODE still uses the default local node', () => {
    expect(() => assertErgoNodeEndpointAlignment('aggregate check', {
      ergoNode: 'http://127.0.0.1:9052',
      ergoNodeUrl: 'http://127.0.0.1:9051',
    })).toThrow('9052 vs http://127.0.0.1:9051');
  });

  it('fails closed when signer and ErgoClient endpoints target different hosts', () => {
    expect(() => assertErgoNodeEndpointAlignment('aggregate check', {
      ergoNode: 'http://127.0.0.1:9051',
      ergoNodeUrl: 'https://testnet-node.example',
    })).toThrow('Set both to the same node');
  });
});
