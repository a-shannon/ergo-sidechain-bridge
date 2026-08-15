import {
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, relative, resolve } from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

import {
  revalidateAuthenticatedV2PreSetupFunding,
} from '../authenticated-v2-pre-setup-funding-revalidation.js';
import type {
  AuthenticatedV2FundingObservationFetch,
} from '../authenticated-v2-funding-observation.js';
import {
  runAuthenticatedV2SetupJvmCheck,
} from '../authenticated-v2-setup-jvm-check.js';
import {
  parseNodeJsonPreservingPowDistance,
} from '../ergo-node-json.js';
import {
  resolveProvisioningOutputPath,
  resolveProvisioningRepositoryInputPath,
  type AuthenticatedV2PathResolutionOptions,
} from '../authenticated-v2-sanitized-io.js';
import {
  runAuthenticatedV2SourceTreeConformance,
} from '../authenticated-v2-source-tree-conformance.js';
import {
  assertAuthenticatedV2SetupCheckPolicy,
  AUTHENTICATED_V2_SETUP_CHECK_ENABLED_ENV,
} from '../authenticated-v2-setup-check-policy.js';
import {
  deriveUnsignedTransactionId,
  prepareLocalWasmCheckSigner,
  sanitizeSignerErrorText,
} from '../fleet-signer.js';
import {
  hydrateAuthenticatedV2ProvisioningInput,
} from './plan-authenticated-v2-provisioning.js';

interface CliArgs {
  input?: string;
  expectedPackageDigest?: string;
  nodeUrl?: string;
  ergoSource?: string;
  out?: string;
  mnemonicStdin: boolean;
  help: boolean;
  errors: string[];
}

interface CliOptions extends AuthenticatedV2PathResolutionOptions {
  worktreeRoot?: string;
  fetch?: typeof fetch;
  readMnemonic?: () => Promise<string>;
  checkEnabled?: boolean;
  broadcastEnabled?: boolean;
  now?: () => Date;
}

const usage = [
  'Usage: npm run settle:authenticated:setup-check -- --input <provisioning-v5.json> --expected-package-digest <64hex> --node-url <loopback-non-mainnet-origin> --ergo-source <pinned-ergo-checkout> --mnemonic-stdin --out <new-report.json>',
  `Requires ${AUTHENTICATED_V2_SETUP_CHECK_ENABLED_ENV}=true and BRIDGE_BROADCAST_ENABLED to remain false.`,
  'The command opens signer material only through non-interactive stdin; it never opens a signer file or reads signer material from environment, dotenv, config, deployment state, or runtime databases. Upstream stdin provenance cannot be detected and remains an operator-enforced boundary: file redirection is prohibited.',
  'The command reruns pinned source-to-tree conformance, preloads ten parent-linked mined headers from lastHeaders/10, derives the node simplifiedUpcoming H+1 preheader, performs fresh exact-package funding revalidation, signs both setup candidates in memory, and calls only /transactions/check.',
  'Signed bytes are valid and broadcastable if captured. Use only a trusted loopback non-mainnet node and low-value test funding. Signed bytes are never persisted or printed, and no submit, deploy, broadcast, Gate 5 closure, or production-ready route exists.',
];

export async function runAuthenticatedV2SetupCheckCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2SetupCheckArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = realpathSync(resolve(options.bridgeRoot ?? resolve(scriptDir, '..', '..', '..')));
  const worktreeRoot = realpathSync(resolve(options.worktreeRoot ?? resolve(bridgeRoot, '..')));
  const cwd = resolve(options.cwd ?? process.cwd());
  const nodeUrl = requireArg(args.nodeUrl, '--node-url');
  const checkEnabled = options.checkEnabled
    ?? (process.env[AUTHENTICATED_V2_SETUP_CHECK_ENABLED_ENV] === 'true');
  const broadcastEnabled = options.broadcastEnabled
    ?? (process.env.BRIDGE_BROADCAST_ENABLED === 'true');
  const normalizedNodeUrl = assertAuthenticatedV2SetupCheckPolicy({
    checkEnabled,
    broadcastEnabled,
    nodeUrl,
  });
  const inputPath = resolveProvisioningRepositoryInputPath(requireArg(args.input, '--input'), {
    cwd,
    bridgeRoot,
  });
  const outputPath = resolveProvisioningOutputPath(requireArg(args.out, '--out'), {
    cwd,
    bridgeRoot,
  });
  const ergoSourcePath = realpathSync(resolve(cwd, requireArg(args.ergoSource, '--ergo-source')));
  if (!statSync(ergoSourcePath).isDirectory()) throw new Error('--ergo-source must be a directory');
  const parsed = parseJsonObject(readFileSync(inputPath, 'utf8'), '--input');
  const provisioningInput = await hydrateAuthenticatedV2ProvisioningInput(parsed);
  const transport = createAuthenticatedV2SetupCheckTransport(
    normalizedNodeUrl,
    options.fetch ?? fetch,
  );
  const readMnemonic = options.readMnemonic ?? (() => readPipedMnemonic(process.stdin));
  const report = await runAuthenticatedV2SetupJvmCheck({
    provisioningInput,
    priorFundingObservationReport: parsed.fundingObservation,
    expectedProvisioningPackageDigestHex: requireArg(
      args.expectedPackageDigest,
      '--expected-package-digest',
    ),
    nodeUrl: normalizedNodeUrl,
    checkEnabled,
    broadcastEnabled,
    bridgeRoot,
    worktreeRoot,
    ergoSourcePath,
  }, {
    runSourceTreeConformance: runAuthenticatedV2SourceTreeConformance,
    observeStateContextHeaders: transport.observeStateContextHeaders,
    revalidateFunding: request => revalidateAuthenticatedV2PreSetupFunding(request, {
      fetch: transport.fundingFetch,
      now: options.now,
    }),
    loadSigner: async headers => prepareLocalWasmCheckSigner({
      mnemonic: await readMnemonic(),
      networkPrefix: 16,
      headers,
    }),
    deriveUnsignedTransactionId,
    checkSignedTransaction: transport.checkSignedTransaction,
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 setup JVM check report written: ${relative(cwd, outputPath)}`);
  console.log(`Provisioning package digest: ${report.provisioningPackageDigestHex}`);
  console.log(`Fresh funding observation digest: ${report.fundingRevalidation.freshObservationDigestHex}`);
  console.log(`Report digest: ${report.reportDigestHex}`);
  console.log('Result: both independent setup candidates passed /transactions/check; no input was spent.');
  console.log('Boundary: signed bytes were not retained; setup, submit, deploy, broadcast, Gate 5 closure, and production readiness remain unauthorized.');
}

export function parseAuthenticatedV2SetupCheckArgs(argv: string[]): CliArgs {
  const result: CliArgs = { mnemonicStdin: false, help: false, errors: [] };
  const seen = new Set<string>();
  const valueOptions = new Set([
    '--input',
    '--expected-package-digest',
    '--node-url',
    '--ergo-source',
    '--out',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (argument === '--mnemonic-stdin') {
      if (seen.has(argument)) result.errors.push(`${argument} may be provided only once`);
      seen.add(argument);
      result.mnemonicStdin = true;
      continue;
    }
    if (!valueOptions.has(argument)) {
      result.errors.push(argument.startsWith('--')
        ? 'unknown option'
        : 'unexpected positional argument');
      continue;
    }
    if (seen.has(argument)) {
      result.errors.push(`${argument} may be provided only once`);
      index += 1;
      continue;
    }
    seen.add(argument);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      result.errors.push(`${argument} requires a value`);
      continue;
    }
    index += 1;
    if (argument === '--input') result.input = value;
    else if (argument === '--expected-package-digest') result.expectedPackageDigest = value;
    else if (argument === '--node-url') result.nodeUrl = value;
    else if (argument === '--ergo-source') result.ergoSource = value;
    else result.out = value;
  }
  if (!result.help) {
    if (!result.input) result.errors.push('--input is required');
    if (!result.expectedPackageDigest) result.errors.push('--expected-package-digest is required');
    if (!result.nodeUrl) result.errors.push('--node-url is required');
    if (!result.ergoSource) result.errors.push('--ergo-source is required');
    if (!result.mnemonicStdin) result.errors.push('--mnemonic-stdin is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

export function createAuthenticatedV2SetupCheckTransport(
  nodeUrl: string,
  fetchFn: typeof fetch,
): {
  fundingFetch: AuthenticatedV2FundingObservationFetch;
  observeStateContextHeaders: () => Promise<unknown>;
  checkSignedTransaction: (signedTransaction: unknown) => Promise<unknown>;
} {
  const origin = assertAuthenticatedV2SetupCheckPolicy({
    checkEnabled: true,
    broadcastEnabled: false,
    nodeUrl,
  });
  const request = async (
    path: string,
    init: RequestInit,
    maxBytes: number,
  ): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchFn(`${origin}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error('authenticated V2 setup check node request failed');
    }
    const length = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error('authenticated V2 setup check node response exceeds the size limit');
    }
    return response;
  };
  const fundingFetch: AuthenticatedV2FundingObservationFetch = async (input, init) => {
    const target = new URL(String(input));
    const allowedPath = target.pathname === '/info'
      || target.pathname === '/blocks/lastHeaders/1'
      || /^\/utxo\/byId(?:Binary)?\/[0-9a-f]{64}$/.test(target.pathname);
    if (
      target.origin !== origin
      || target.username
      || target.password
      || target.search
      || target.hash
      || !allowedPath
      || String(init?.method ?? 'GET').toUpperCase() !== 'GET'
    ) {
      throw new Error('authenticated V2 setup funding transport rejected a request');
    }
    return request(target.pathname, { method: 'GET', headers: { accept: 'application/json' } }, 4 * 1024 * 1024);
  };
  return {
    fundingFetch,
    async observeStateContextHeaders() {
      const response = await request(
        '/blocks/lastHeaders/10',
        { method: 'GET', headers: { accept: 'application/json' } },
        4 * 1024 * 1024,
      );
      if (!response.ok) throw new Error('authenticated V2 setup header request was rejected');
      return parseNodeJsonPreservingPowDistance(
        await readBoundedResponse(response, 4 * 1024 * 1024),
      );
    },
    async checkSignedTransaction(signedTransaction) {
      const response = await request('/transactions/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(signedTransaction),
      }, 64 * 1024);
      if (!response.ok) throw new Error('authenticated V2 setup /transactions/check was rejected');
      const text = await readBoundedResponse(response, 64 * 1024);
      let result: unknown;
      try {
        result = JSON.parse(text);
      } catch {
        result = text.trim();
      }
      if (typeof result !== 'string' || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(result)) {
        throw new Error('authenticated V2 setup /transactions/check returned an invalid transaction ID');
      }
      return result;
    },
  };
}

export async function readPipedMnemonic(stream: Readable): Promise<string> {
  if ((stream as Readable & { isTTY?: boolean }).isTTY) {
    throw new Error('--mnemonic-stdin requires non-interactive piped stdin');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 2_048) throw new Error('piped mnemonic exceeds the size limit');
    chunks.push(buffer);
  }
  const lines = Buffer.concat(chunks).toString('utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) throw new Error('piped mnemonic must contain exactly one non-empty line');
  return lines[0];
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('authenticated V2 setup check node response exceeds the size limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
}

function parseBoundedJson(source: string, label: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`authenticated V2 setup ${label} is not valid JSON`);
  }
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  const value = parseBoundedJson(source, label);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireArg(value: string | undefined, option: string): string {
  if (!value) throw new Error(`${option} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedV2SetupCheckCli(process.argv.slice(2)).catch(error => {
    console.error(sanitizeSignerErrorText(error instanceof Error ? error.message : String(error)));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
