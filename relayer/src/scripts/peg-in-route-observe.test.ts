import { describe, expect, it } from 'vitest';

import { parsePegInRouteObserveArgs } from './peg-in-route-observe.js';

describe('peg-in route observe CLI', () => {
  it('requires every explicit non-authorizing input', () => {
    expect(parsePegInRouteObserveArgs([
      '--manifest', 'route.json',
      '--expected-manifest-sha256', '11'.repeat(32),
      '--main-chain-lock-source', '../contracts/MainChainLock.es',
      '--settlement-vault-source', '../contracts/MainChainAggregateUnlockTrustless.es',
      '--primary-node-url', 'http://127.0.0.1:9053',
      '--witness-node-url', 'http://127.0.0.1:9054',
      '--json-out', 'route-report.json',
    ])).toEqual({
      manifestPath: 'route.json',
      expectedManifestSha256Hex: '11'.repeat(32),
      mainChainLockSourcePath: '../contracts/MainChainLock.es',
      settlementVaultSourcePath: '../contracts/MainChainAggregateUnlockTrustless.es',
      primaryNodeUrl: 'http://127.0.0.1:9053',
      witnessNodeUrl: 'http://127.0.0.1:9054',
      jsonOut: 'route-report.json',
      help: false,
    });
  });

  it('rejects missing, duplicate, and unknown arguments', () => {
    expect(() => parsePegInRouteObserveArgs([])).toThrow('--manifest is required');
    expect(() => parsePegInRouteObserveArgs(['--unknown', 'value'])).toThrow('Unknown argument');
    expect(() => parsePegInRouteObserveArgs([
      '--manifest', 'a.json', '--manifest', 'b.json',
    ])).toThrow('may be provided only once');
  });

  it('accepts help without any file or network arguments', () => {
    expect(parsePegInRouteObserveArgs(['--help'])).toEqual({ help: true });
  });
});
