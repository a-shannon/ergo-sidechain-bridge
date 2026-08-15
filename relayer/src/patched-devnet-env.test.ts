import { describe, it, expect } from 'vitest';
import {
  resolvePatchedNodeUrl,
  classifyErgoNodeEnv,
  DEFAULT_PATCHED_NODE_URL,
} from './patched-devnet-env.js';

// ─── resolvePatchedNodeUrl ───────────────────────────────────────

describe('resolvePatchedNodeUrl', () => {
  it('returns PATCHED_ERGO_NODE_URL when set', () => {
    expect(resolvePatchedNodeUrl({
      PATCHED_ERGO_NODE_URL: 'http://custom:9999',
      ERGO_NODE_URL: 'http://other:9052',
      ERGO_NODE: 'http://other:9053',
    })).toBe('http://custom:9999');
  });

  it('falls back to ERGO_NODE_URL', () => {
    expect(resolvePatchedNodeUrl({
      ERGO_NODE_URL: 'http://node-url:9051',
      ERGO_NODE: 'http://node:9052',
    })).toBe('http://node-url:9051');
  });

  it('falls back to ERGO_NODE', () => {
    expect(resolvePatchedNodeUrl({
      ERGO_NODE: 'http://node:9051',
    })).toBe('http://node:9051');
  });

  it('returns default when nothing is set', () => {
    expect(resolvePatchedNodeUrl({})).toBe(DEFAULT_PATCHED_NODE_URL);
  });
});

// ─── classifyErgoNodeEnv ─────────────────────────────────────────

describe('classifyErgoNodeEnv', () => {
  const TARGET = 'http://127.0.0.1:9051';

  it('PASS: both set and equal to target', () => {
    const result = classifyErgoNodeEnv({
      ERGO_NODE: TARGET,
      ERGO_NODE_URL: TARGET,
    }, TARGET);
    expect(result.status).toBe('PASS');
    expect(result.message).toContain(TARGET);
  });

  it('WARN: both set but differ from each other', () => {
    const result = classifyErgoNodeEnv({
      ERGO_NODE: 'http://127.0.0.1:9051',
      ERGO_NODE_URL: 'http://127.0.0.1:9052',
    }, TARGET);
    expect(result.status).toBe('WARN');
    expect(result.message).toContain('!=');
  });

  it('WARN: both set, match each other, but differ from target', () => {
    const result = classifyErgoNodeEnv({
      ERGO_NODE: 'http://127.0.0.1:9052',
      ERGO_NODE_URL: 'http://127.0.0.1:9052',
    }, TARGET);
    expect(result.status).toBe('WARN');
    expect(result.message).toContain('target patched node');
  });

  it('WARN: only ERGO_NODE set', () => {
    const result = classifyErgoNodeEnv({
      ERGO_NODE: TARGET,
    }, TARGET);
    expect(result.status).toBe('WARN');
    expect(result.message).toContain('ERGO_NODE_URL');
  });

  it('WARN: only ERGO_NODE_URL set', () => {
    const result = classifyErgoNodeEnv({
      ERGO_NODE_URL: TARGET,
    }, TARGET);
    expect(result.status).toBe('WARN');
    expect(result.message).toContain('ERGO_NODE');
  });

  it('WARN: neither set', () => {
    const result = classifyErgoNodeEnv({}, TARGET);
    expect(result.status).toBe('WARN');
    expect(result.message).toContain('neither');
  });
});
