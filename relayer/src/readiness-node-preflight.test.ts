import { spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildReadinessNodePreflightCommand,
  formatReadinessNodePreflightReportMarkdown,
  runReadinessNodePreflight,
  type NodePreflightFetch,
} from './readiness-node-preflight.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestPath(input: string | URL | Request): string {
  const url = new URL(String(input));
  return url.pathname;
}

describe('readiness node preflight', () => {
  it('passes only after non-mainnet info, header, and script compile endpoints respond without auth headers', async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const fetchFn: NodePreflightFetch = async (input, init) => {
      const path = requestPath(input);
      calls.push({ path, init });
      if (path === '/info') {
        return jsonResponse({ network: 'testnet', fullHeight: 12345 });
      }
      if (path === '/blocks/lastHeaders/1') {
        return jsonResponse([{ id: 'aa'.repeat(32), height: 12345 }]);
      }
      if (path === '/script/p2sAddress') {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('sigmaProp(true)');
        expect(new Headers(init?.headers).has('api_key')).toBe(false);
        expect(new Headers(init?.headers).has('Authorization')).toBe(false);
        return jsonResponse({ address: '9fPreflightAddress' });
      }
      throw new Error(`unexpected path ${path}`);
    };

    const report = await runReadinessNodePreflight({
      command: 'npm run readiness:node-preflight -- --node-url http://127.0.0.1:9052',
      nodeUrl: 'http://127.0.0.1:9052',
    }, fetchFn);

    expect(report.result).toBe('PASS');
    expect(report.exitCode).toBe(0);
    expect(report.network).toBe('testnet');
    expect(report.height).toBe('12345');
    expect(calls.map(call => call.path)).toEqual([
      '/info',
      '/blocks/lastHeaders/1',
      '/script/p2sAddress',
    ]);
    expect(report.boundary['ERGO_API_KEY read']).toBe('no');
    expect(report.boundary['Auth header sent']).toBe('no');
    expect(report.boundary['Transaction broadcast, submit, deploy, or state mutation performed']).toBe('no');

    const markdown = formatReadinessNodePreflightReportMarkdown(report);
    expect(markdown).toContain('| Result | PASS |');
    expect(markdown).toContain('| Script compile endpoint reachable | yes |');
    expect(markdown).not.toContain('api_key');
  });

  it('blocks mainnet nodes before header or compile probes run', async () => {
    const calls: string[] = [];
    const fetchFn: NodePreflightFetch = async (input) => {
      calls.push(requestPath(input));
      return jsonResponse({ network: 'mainnet', fullHeight: 987654 });
    };

    const report = await runReadinessNodePreflight({
      command: 'npm run readiness:node-preflight --',
      nodeUrl: 'https://node.example.test',
    }, fetchFn);

    expect(report.result).toBe('BLOCKED');
    expect(report.exitCode).toBe(1);
    expect(report.reason).toContain('Mainnet node rejected');
    expect(calls).toEqual(['/info']);
    expect(report.boundary['Node network identified as non-mainnet']).toBe('no');
    expect(report.boundary['Header endpoint reachable']).toBe('no');
    expect(report.boundary['Script compile endpoint reachable']).toBe('no');
  });

  it('blocks nodes that do not identify a concrete non-mainnet network', async () => {
    const calls: string[] = [];
    const fetchFn: NodePreflightFetch = async (input) => {
      calls.push(requestPath(input));
      return jsonResponse({ fullHeight: 42 });
    };

    const report = await runReadinessNodePreflight({
      command: 'npm run readiness:node-preflight --',
      nodeUrl: 'http://127.0.0.1:9052',
    }, fetchFn);

    expect(report.result).toBe('BLOCKED');
    expect(report.reason).toContain('non-mainnet network');
    expect(calls).toEqual(['/info']);
    expect(report.boundary['Node network identified as non-mainnet']).toBe('no');
  });

  it('records unavailable node blockers without serializing local paths or sensitive labels', async () => {
    const localPath = ['C:', 'tmp', 'bridge', 'privateKey.txt'].join('\\');
    const localOut = ['C:', 'tmp', 'blocked.md'].join('\\');
    const error = new Error(`fetch failed for ${localPath}`) as Error & {
      cause?: unknown;
    };
    error.cause = {
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 9052,
    };
    const fetchFn: NodePreflightFetch = async () => {
      throw error;
    };

    const report = await runReadinessNodePreflight({
      command: `npm run readiness:node-preflight -- --out ${localOut}`,
      nodeUrl: 'http://127.0.0.1:9052',
    }, fetchFn);
    const markdown = formatReadinessNodePreflightReportMarkdown(report);

    expect(report.result).toBe('BLOCKED');
    expect(report.observedError).toContain('connect ECONNREFUSED 127.0.0.1:9052');
    expect(markdown).not.toContain(localPath);
    expect(markdown).not.toContain(localOut);
    expect(markdown).not.toContain('privateKey');
    expect(report.boundary['ERGO_API_KEY read']).toBe('no');
    expect(report.boundary['Runtime database opened']).toBe('no');
  });

  it('rejects credential-bearing node URLs before any fetch without echoing the raw target', async () => {
    const fetchFn: NodePreflightFetch = async () => {
      throw new Error('fetch should not be called');
    };

    const report = await runReadinessNodePreflight({
      command: 'npm run readiness:node-preflight -- --node-url <node-url>',
      nodeUrl: 'http://user:pass@127.0.0.1:9052?api_key=secret',
    }, fetchFn);
    const markdown = formatReadinessNodePreflightReportMarkdown(report);

    expect(report.result).toBe('BLOCKED');
    expect(report.reason).toBe('node URL must not include credentials or credential query parameters');
    expect(markdown).not.toContain('user:pass');
    expect(markdown).not.toContain('secret');
    expect(report.boundary['Ergo node request attempted']).toBe('no');
  });

  it('builds a bounded command label without serializing output paths', () => {
    expect(buildReadinessNodePreflightCommand({
      nodeUrl: 'http://127.0.0.1:9052',
      explicitNodeUrl: true,
      out: '../evidence/readiness/node-preflight.md',
      jsonOut: '../evidence/readiness/node-preflight.json',
    })).toBe(
      'npm run readiness:node-preflight -- --node-url http://127.0.0.1:9052 --out <report.md> --json-out <report.json>',
    );
  });

  it('writes guarded JSON output for blocked node prerequisites without closing evidence', () => {
    const jsonOut = `../evidence/readiness/tmp-node-preflight-output-${process.pid}-${Date.now()}.json`;
    const jsonOutPath = join(process.cwd(), jsonOut);
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-node-preflight.ts',
          '--node-url',
          'http://127.0.0.1:1',
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('# Bridge Readiness Node Preflight Report');
      expect(result.stdout).toContain('- node preflight JSON report written: ../evidence/readiness/');
      expect(result.stderr).toBe('');
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      expect(written.result).toBe('BLOCKED');
      expect(written.exitCode).toBe(1);
      expect(written.boundary['Evidence row closure claimed']).toBe('no');
      expect(written.boundary['Transaction broadcast, submit, deploy, or state mutation performed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(jsonOutPath, { force: true });
    }
  });
});
