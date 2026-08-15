import { mkdirSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  observeAuthenticatedV2Funding,
  type AuthenticatedV2FundingObservationFetch,
} from '../authenticated-v2-funding-observation.js';
import { resolveProvisioningOutputPath } from '../authenticated-v2-sanitized-io.js';

export interface AuthenticatedV2FundingObservationCliArgs {
  environment?: string;
  nodeUrl?: string;
  trackerFundingBoxId?: string;
  dupVaultFundingBoxId?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

interface CliOptions {
  cwd?: string;
  bridgeRoot?: string;
  fetch?: AuthenticatedV2FundingObservationFetch;
  now?: () => Date;
}

const valueOptions = [
  '--environment',
  '--node-url',
  '--tracker-funding-box-id',
  '--dup-vault-funding-box-id',
  '--out',
] as const;

const usage = [
  'Usage: npm run contracts:authenticated-v2:observe-funding -- --environment <non-mainnet> --node-url <origin> --tracker-funding-box-id <64hex> --dup-vault-funding-box-id <64hex> --out <new-report.json>',
  'Reads only explicit non-mainnet node info, latest-header, current-UTXO JSON, and current-UTXO binary endpoints.',
  'The command requires one stable visible tip, rederives both box IDs, compares JSON with canonical Sigma bytes, and accepts only distinct pure-ERG boxes.',
  'Header and UTXO routes are not an atomic snapshot; the report keeps tipUtxoAtomicityProved=false and requires pre-setup revalidation.',
  'No configuration, environment credential, deployment state, runtime database, signer, transaction, check, submit, deploy, Gate 5 closure, or broadcast path is used.',
];

export async function runAuthenticatedV2FundingObservationCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2FundingObservationArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const cwd = resolve(options.cwd ?? process.cwd());
  const outputPath = resolveProvisioningOutputPath(requireArg(args.out, '--out'), {
    cwd,
    bridgeRoot: options.bridgeRoot,
  });
  const report = await observeAuthenticatedV2Funding({
    environment: requireArg(args.environment, '--environment'),
    nodeUrl: requireArg(args.nodeUrl, '--node-url'),
    trackerFundingBoxId: requireArg(args.trackerFundingBoxId, '--tracker-funding-box-id'),
    dupVaultFundingBoxId: requireArg(args.dupVaultFundingBoxId, '--dup-vault-funding-box-id'),
  }, {
    fetch: options.fetch,
    now: options.now,
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 funding observation written: ${relative(cwd, outputPath)}`);
  console.log(`Observed stable non-mainnet tip: ${report.node.tipHeight} ${report.node.tipIdHex}`);
  console.log(`Report digest: ${report.reportDigestHex}`);
  console.log('Boundary: read-only funding observation only; revalidation is required before any separate setup approval.');
}

export function parseAuthenticatedV2FundingObservationArgs(
  argv: string[],
): AuthenticatedV2FundingObservationCliArgs {
  const result: AuthenticatedV2FundingObservationCliArgs = {
    help: false,
    errors: [],
  };
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
    if (argument === '--environment') result.environment = value;
    else if (argument === '--node-url') result.nodeUrl = value;
    else if (argument === '--tracker-funding-box-id') result.trackerFundingBoxId = value;
    else if (argument === '--dup-vault-funding-box-id') result.dupVaultFundingBoxId = value;
    else result.out = value;
  }
  if (!result.help) {
    if (!result.environment) result.errors.push('--environment is required');
    if (!result.nodeUrl) result.errors.push('--node-url is required');
    if (!result.trackerFundingBoxId) result.errors.push('--tracker-funding-box-id is required');
    if (!result.dupVaultFundingBoxId) result.errors.push('--dup-vault-funding-box-id is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

function requireArg(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`${optionName} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedV2FundingObservationCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
