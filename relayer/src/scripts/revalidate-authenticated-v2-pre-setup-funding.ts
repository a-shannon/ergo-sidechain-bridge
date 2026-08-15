import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  revalidateAuthenticatedV2PreSetupFunding,
} from '../authenticated-v2-pre-setup-funding-revalidation.js';
import type { AuthenticatedV2FundingObservationFetch } from '../authenticated-v2-funding-observation.js';
import {
  resolveProvisioningInputPath,
  resolveProvisioningOutputPath,
  type AuthenticatedV2PathResolutionOptions,
} from '../authenticated-v2-sanitized-io.js';
import {
  hydrateAuthenticatedV2ProvisioningInput,
} from './plan-authenticated-v2-provisioning.js';

interface CliArgs {
  input?: string;
  expectedPackageDigest?: string;
  nodeUrl?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

interface CliOptions extends AuthenticatedV2PathResolutionOptions {
  fetch?: AuthenticatedV2FundingObservationFetch;
  now?: () => Date;
}

const valueOptions = [
  '--input',
  '--expected-package-digest',
  '--node-url',
  '--out',
] as const;

const usage = [
  'Usage: npm run settle:authenticated:pre-setup-revalidate -- --input <provisioning-v4.json> --expected-package-digest <64hex> --node-url <non-mainnet-origin> --out <new-report.json>',
  'Rebuilds the exact provenance-bound package before making eight read-only node GET requests for its two funding UTXOs.',
  'The report requires unchanged canonical box bytes, exact package reconstruction, and sufficient tracker/DUP/vault funding.',
  'The one-node header/UTXO window is not atomic and the same inputs must be revalidated again at any separately approved execution boundary.',
  'No configuration, environment credential, deployment state, runtime database, signer, transaction check, setup approval, submit, deploy, Gate 5 closure, or broadcast path is used.',
];

export async function runAuthenticatedV2PreSetupFundingRevalidationCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2PreSetupFundingRevalidationArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const cwd = resolve(options.cwd ?? process.cwd());
  const inputPath = resolveProvisioningInputPath(requireArg(args.input, '--input'), {
    cwd,
    bridgeRoot: options.bridgeRoot,
  });
  const outputPath = resolveProvisioningOutputPath(requireArg(args.out, '--out'), {
    cwd,
    bridgeRoot: options.bridgeRoot,
  });
  const parsed = parseJsonObject(readFileSync(inputPath, 'utf8'), '--input');
  const provisioningInput = await hydrateAuthenticatedV2ProvisioningInput(parsed);
  const report = await revalidateAuthenticatedV2PreSetupFunding({
    provisioningInput,
    priorFundingObservationReport: parsed.fundingObservation,
    expectedProvisioningPackageDigestHex: requireArg(
      args.expectedPackageDigest,
      '--expected-package-digest',
    ),
    nodeUrl: requireArg(args.nodeUrl, '--node-url'),
  }, {
    fetch: options.fetch,
    now: options.now,
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 pre-setup funding revalidation written: ${relative(cwd, outputPath)}`);
  console.log(`Provisioning package digest: ${report.packageDigests.expectedHex}`);
  console.log(`Fresh observation digest: ${report.observations.fresh.reportDigestHex}`);
  console.log('Boundary: read-only point-in-time revalidation only; setup remains unauthorized and must revalidate the same inputs again.');
}

export function parseAuthenticatedV2PreSetupFundingRevalidationArgs(argv: string[]): CliArgs {
  const result: CliArgs = { help: false, errors: [] };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (!(valueOptions as readonly string[]).includes(argument)) {
      result.errors.push(`unknown option: ${argument}`);
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
    else result.out = value;
  }
  if (!result.help) {
    if (!result.input) result.errors.push('--input is required');
    if (!result.expectedPackageDigest) result.errors.push('--expected-package-digest is required');
    if (!result.nodeUrl) result.errors.push('--node-url is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error: any) {
    throw new Error(`${label} is not valid JSON: ${error?.message ?? String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function requireArg(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`${optionName} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedV2PreSetupFundingRevalidationCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
