import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { Readable } from 'stream';
import { afterAll, describe, expect, it } from 'vitest';

import {
  AUTHENTICATED_V2_CANONICAL_TEMPLATE_SHA256,
  parseAuthenticatedV2ProvisioningArgs,
  resolveProvisioningInputPath,
  resolveProvisioningOutputPath,
} from './scripts/plan-authenticated-v2-provisioning.js';
import { runAuthenticatedV2StageRebuildCli } from './scripts/plan-authenticated-v2-stage-rebuild.js';
import {
  parseAuthenticatedV2PreSetupFundingRevalidationArgs,
} from './scripts/revalidate-authenticated-v2-pre-setup-funding.js';
import {
  parseAuthenticatedV2PreSetupFundingValidationArgs,
} from './scripts/validate-authenticated-v2-pre-setup-funding.js';
import {
  createAuthenticatedV2SetupCheckTransport,
  parseAuthenticatedV2SetupCheckArgs,
  readPipedMnemonic,
} from './scripts/check-authenticated-v2-setup.js';
import {
  assertAuthenticatedV2SetupCheckPolicy,
} from './authenticated-v2-setup-check-policy.js';

const sandbox = mkdtempSync(join(tmpdir(), 'authenticated-v2-plan-'));
const testBridgeRoot = join(sandbox, 'bridge');
const workingDirectory = join(testBridgeRoot, 'relayer');
mkdirSync(workingDirectory, { recursive: true });

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('authenticated V2 provisioning CLI boundary', () => {
  it('pins the exact checked-in authenticated contract templates in code', () => {
    const paths = {
      tracker: new URL('../../contracts/SPVTrackerAuthenticated.es', import.meta.url),
      unlock: new URL('../../contracts/MainChainAggregateUnlockAuthenticated.es', import.meta.url),
      duplicatePrevention: new URL(
        '../../contracts/DoubleUnlockPreventionAuthenticated.es',
        import.meta.url,
      ),
    };
    for (const label of Object.keys(paths) as Array<keyof typeof paths>) {
      const digest = createHash('sha256').update(readFileSync(paths[label])).digest('hex');
      expect(digest).toBe(AUTHENTICATED_V2_CANONICAL_TEMPLATE_SHA256[label]);
    }
  });

  it('requires one explicit input and one explicit output', () => {
    expect(parseAuthenticatedV2ProvisioningArgs([
      '--input',
      'candidate.json',
      '--out',
      'plans/candidate.json',
    ])).toEqual({
      input: 'candidate.json',
      out: 'plans/candidate.json',
      help: false,
      errors: [],
    });

    expect(parseAuthenticatedV2ProvisioningArgs([]).errors).toEqual([
      '--input is required',
      '--out is required',
    ]);
    expect(parseAuthenticatedV2ProvisioningArgs([
      '--input', 'one.json', '--input', 'two.json', '--out', 'plan.json',
    ]).errors).toContain('--input may be provided only once');
    expect(parseAuthenticatedV2ProvisioningArgs(['--unknown']).errors)
      .toContain('unknown option: --unknown');
  });

  it('requires one exact package digest and explicit node for pre-setup revalidation', () => {
    expect(parseAuthenticatedV2PreSetupFundingRevalidationArgs([
      '--input', 'candidate.json',
      '--expected-package-digest', 'ab'.repeat(32),
      '--node-url', 'http://127.0.0.1:9052',
      '--out', 'reports/pre-setup.json',
    ])).toEqual({
      input: 'candidate.json',
      expectedPackageDigest: 'ab'.repeat(32),
      nodeUrl: 'http://127.0.0.1:9052',
      out: 'reports/pre-setup.json',
      help: false,
      errors: [],
    });
    expect(parseAuthenticatedV2PreSetupFundingRevalidationArgs([]).errors).toEqual([
      '--input is required',
      '--expected-package-digest is required',
      '--node-url is required',
      '--out is required',
    ]);
    expect(parseAuthenticatedV2PreSetupFundingRevalidationArgs([
      '--input', 'one.json', '--input', 'two.json',
    ]).errors).toContain('--input may be provided only once');
  });

  it('requires separately captured package and fresh-observation digests offline', () => {
    expect(parseAuthenticatedV2PreSetupFundingValidationArgs([
      '--input', 'candidate.json',
      '--report', 'reports/pre-setup.json',
      '--expected-package-digest', 'ab'.repeat(32),
      '--expected-fresh-observation-digest', 'cd'.repeat(32),
    ])).toEqual({
      input: 'candidate.json',
      report: 'reports/pre-setup.json',
      expectedPackageDigest: 'ab'.repeat(32),
      expectedFreshObservationDigest: 'cd'.repeat(32),
      help: false,
      errors: [],
    });
    expect(parseAuthenticatedV2PreSetupFundingValidationArgs([]).errors).toEqual([
      '--input is required',
      '--report is required',
      '--expected-package-digest is required',
      '--expected-fresh-observation-digest is required',
    ]);
    expect(parseAuthenticatedV2PreSetupFundingValidationArgs([
      '--report', 'one.json', '--report', 'two.json',
    ]).errors).toContain('--report may be provided only once');
  });

  it('accepts only explicit sanitized JSON inputs', () => {
    const inputPath = join(workingDirectory, 'candidate.json');
    writeFileSync(inputPath, '{}\n', 'utf8');
    expect(resolveProvisioningInputPath('candidate.json', { cwd: workingDirectory }))
      .toBe(realpathSync(inputPath));

    for (const target of [
      '.env.json',
      'deployed_state.json',
      'wallet-input.json',
      'private-runtime.json',
      'runtime.sqlite.json',
    ]) {
      expect(() => resolveProvisioningInputPath(target, { cwd: workingDirectory }))
        .toThrow(/secret or runtime material/i);
    }
    expect(() => resolveProvisioningInputPath('candidate.txt', { cwd: workingDirectory }))
      .toThrow(/JSON file/i);
  });

  it('creates only new JSON targets inside the bridge repository', () => {
    const output = resolveProvisioningOutputPath('plans/candidate.json', {
      cwd: workingDirectory,
      bridgeRoot: testBridgeRoot,
    });
    expect(output).toBe(resolve(workingDirectory, 'plans/candidate.json'));

    expect(() => resolveProvisioningOutputPath('../../outside.json', {
      cwd: workingDirectory,
      bridgeRoot: testBridgeRoot,
    })).toThrow(/inside the bridge repository/i);
    expect(() => resolveProvisioningOutputPath('plans/wallet-plan.json', {
      cwd: workingDirectory,
      bridgeRoot: testBridgeRoot,
    })).toThrow(/secret or runtime material/i);

    const existing = join(workingDirectory, 'existing.json');
    writeFileSync(existing, '{}\n', 'utf8');
    expect(() => resolveProvisioningOutputPath('existing.json', {
      cwd: workingDirectory,
      bridgeRoot: testBridgeRoot,
    })).toThrow(/new file/i);
  });

  it('rejects malformed stage JSON before creating an output', async () => {
    const input = join(workingDirectory, 'malformed-stage.json');
    const output = join(workingDirectory, 'plans', 'malformed-stage-output.json');
    writeFileSync(input, '{\n', 'utf8');

    await expect(runAuthenticatedV2StageRebuildCli([
      '--input',
      'malformed-stage.json',
      '--out',
      'plans/malformed-stage-output.json',
    ], {
      cwd: workingDirectory,
      bridgeRoot: testBridgeRoot,
    })).rejects.toThrow(/not valid JSON/i);
    expect(existsSync(output)).toBe(false);
  });

  it('keeps pre-setup revalidation outside signer, runtime, and mutation surfaces', () => {
    const core = readFileSync(new URL(
      './authenticated-v2-pre-setup-funding-revalidation.ts',
      import.meta.url,
    ), 'utf8');
    const cli = readFileSync(new URL(
      './scripts/revalidate-authenticated-v2-pre-setup-funding.ts',
      import.meta.url,
    ), 'utf8');
    const validatorCli = readFileSync(new URL(
      './scripts/validate-authenticated-v2-pre-setup-funding.ts',
      import.meta.url,
    ), 'utf8');
    const source = `${core}\n${cli}\n${validatorCli}`;
    expect(source).not.toMatch(/from ['"].*(?:config|ergo-client|fleet-signer|state-tracker)/i);
    expect(source).not.toMatch(/process\.env|dotenv|wallet|privateKey|mnemonic/i);
    expect(source).not.toMatch(/\/transactions(?:\/check)?|signAndCheck|signAndSubmit|submitTransaction/i);
    expect(source).not.toMatch(/broadcast-policy|BRIDGE_BROADCAST_ENABLED|deployed_state|\.sqlite/i);
  });

  it('requires every explicit setup-check binding and stdin-only signer material', () => {
    expect(parseAuthenticatedV2SetupCheckArgs([
      '--input', 'candidate.json',
      '--expected-package-digest', 'ab'.repeat(32),
      '--node-url', 'http://127.0.0.1:9052',
      '--ergo-source', '../pinned-ergo',
      '--mnemonic-stdin',
      '--out', 'reports/setup-check.json',
    ])).toEqual({
      input: 'candidate.json',
      expectedPackageDigest: 'ab'.repeat(32),
      nodeUrl: 'http://127.0.0.1:9052',
      ergoSource: '../pinned-ergo',
      out: 'reports/setup-check.json',
      mnemonicStdin: true,
      help: false,
      errors: [],
    });
    expect(parseAuthenticatedV2SetupCheckArgs([]).errors).toEqual([
      '--input is required',
      '--expected-package-digest is required',
      '--node-url is required',
      '--ergo-source is required',
      '--mnemonic-stdin is required',
      '--out is required',
    ]);
    const prohibitedSignerArgument = parseAuthenticatedV2SetupCheckArgs([
      '--mnemonic', 'forbidden-value',
    ]);
    expect(prohibitedSignerArgument.errors).toContain('unknown option');
    expect(JSON.stringify(prohibitedSignerArgument)).not.toContain('forbidden-value');
  });

  it('enforces explicit check-only loopback policy', () => {
    expect(assertAuthenticatedV2SetupCheckPolicy({
      checkEnabled: true,
      broadcastEnabled: false,
      nodeUrl: 'http://127.0.0.1:9052',
    })).toBe('http://127.0.0.1:9052');

    for (const input of [
      { checkEnabled: false, broadcastEnabled: false, nodeUrl: 'http://127.0.0.1:9052' },
      { checkEnabled: true, broadcastEnabled: true, nodeUrl: 'http://127.0.0.1:9052' },
      { checkEnabled: true, broadcastEnabled: false, nodeUrl: 'http://example.org:9052' },
      { checkEnabled: true, broadcastEnabled: false, nodeUrl: 'http://user@127.0.0.1:9052' },
      { checkEnabled: true, broadcastEnabled: false, nodeUrl: 'http://127.0.0.1:9052/path' },
    ]) {
      expect(() => assertAuthenticatedV2SetupCheckPolicy(input)).toThrow();
    }
  });

  it('allows only fixed read endpoints and /transactions/check on the node transport', async () => {
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    const txId = 'ab'.repeat(32);
    const exactPowDistance = '12345678901234567890123456789012345678901234567890';
    const fetchFn: typeof fetch = async (input, init) => {
      const target = new URL(String(input));
      requests.push({
        path: target.pathname,
        method: String(init?.method ?? 'GET'),
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      if (target.pathname === '/blocks/lastHeaders/10') {
        return new Response(
          `[{"id":"${'01'.repeat(32)}","height":10,"powSolutions":{"d":${exactPowDistance}}}]`,
          {
          status: 200,
          },
        );
      }
      if (target.pathname === '/transactions/check') {
        return new Response(JSON.stringify(txId), { status: 200 });
      }
      throw new Error(`unexpected path ${target.pathname}`);
    };
    const transport = createAuthenticatedV2SetupCheckTransport(
      'http://127.0.0.1:9052',
      fetchFn,
    );

    await expect(transport.observeStateContextHeaders()).resolves.toEqual([
      { id: '01'.repeat(32), height: 10, powSolutions: { d: exactPowDistance } },
    ]);
    await expect(transport.checkSignedTransaction({ id: txId })).resolves.toBe(txId);
    await expect(transport.fundingFetch(
      'http://127.0.0.1:9052/transactions',
      { method: 'GET' },
    )).rejects.toThrow(/rejected a request/i);
    await expect(transport.fundingFetch(
      'http://127.0.0.1:9052/info',
      { method: 'POST' },
    )).rejects.toThrow(/rejected a request/i);
    expect(requests.map(request => [request.path, request.method])).toEqual([
      ['/blocks/lastHeaders/10', 'GET'],
      ['/transactions/check', 'POST'],
    ]);
    expect(requests[1].body).toBe(JSON.stringify({ id: txId }));
  });

  it('rejects invalid node check responses and interactive or multiline signer input', async () => {
    const invalidTransport = createAuthenticatedV2SetupCheckTransport(
      'http://127.0.0.1:9052',
      async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }),
    );
    await expect(invalidTransport.checkSignedTransaction({ id: 'ab'.repeat(32) }))
      .rejects.toThrow(/invalid transaction ID/i);

    await expect(readPipedMnemonic(Readable.from(['synthetic signer words\n'])))
      .resolves.toBe('synthetic signer words');
    await expect(readPipedMnemonic(Readable.from(['first line\nsecond line\n'])))
      .rejects.toThrow(/exactly one non-empty line/i);
    const tty = Object.assign(Readable.from([]), { isTTY: true });
    await expect(readPipedMnemonic(tty)).rejects.toThrow(/non-interactive piped stdin/i);
  });

  it('bounds chunked node responses before buffering the entire body', async () => {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024 + 1));
        controller.close();
      },
    });
    const transport = createAuthenticatedV2SetupCheckTransport(
      'http://127.0.0.1:9052',
      async () => new Response(oversized, { status: 200 }),
    );

    await expect(transport.checkSignedTransaction({ id: 'ab'.repeat(32) }))
      .rejects.toThrow(/exceeds the size limit/i);
  });

  it('keeps the setup check on explicit local signing and one check-only POST surface', () => {
    const cli = readFileSync(new URL(
      './scripts/check-authenticated-v2-setup.ts',
      import.meta.url,
    ), 'utf8');
    const policy = readFileSync(new URL(
      './authenticated-v2-setup-check-policy.ts',
      import.meta.url,
    ), 'utf8');
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const source = `${cli}\n${policy}`;

    expect(packageJson.scripts['settle:authenticated:setup-check'])
      .toBe('tsx src/scripts/check-authenticated-v2-setup.ts');
    expect(source).not.toMatch(/from ['"].*(?:config|ergo-helpers|broadcast-policy)|import\(['"].*(?:config|ergo-helpers|broadcast-policy)/i);
    expect(source).not.toMatch(/deployed_state|\.sqlite|WALLET_MNEMONIC|signAndSubmit|npost|node-wallet/i);
    expect(source).not.toMatch(/['"]\/transactions['"]|\/wallet\/transaction\/sign/i);
    expect(source.match(/['"]\/transactions\/check['"]/g)).toHaveLength(1);
    expect(source).toContain('flag: \'wx\'');
    expect(source).toContain('Signed bytes are never persisted');
  });
});
