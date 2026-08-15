import { mkdirSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  observeAuthenticatedSpvTrackerFromDistinctNodeOrigins,
  validateAuthenticatedSpvTrackerDualObservationReport,
  type AuthenticatedSpvTrackerNodeSourceFactory,
} from '../authenticated-spv-tracker-dual-observation.js';
import { resolveProvisioningOutputPath } from '../authenticated-v2-sanitized-io.js';

export interface AuthenticatedSpvTrackerDualObservationCliArgs {
  environment?: string;
  primaryNodeUrl?: string;
  witnessNodeUrl?: string;
  trackerNftId?: string;
  trackerGenesisBoxId?: string;
  trackerErgoTree?: string;
  sidechainId?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

interface CliOptions {
  cwd?: string;
  bridgeRoot?: string;
  createSource?: AuthenticatedSpvTrackerNodeSourceFactory;
  now?: () => Date;
}

const valueOptions = [
  '--environment',
  '--primary-node-url',
  '--witness-node-url',
  '--tracker-nft-id',
  '--tracker-genesis-box-id',
  '--tracker-ergo-tree',
  '--sidechain-id',
  '--out',
] as const;

const usage = [
  'Usage: npm run trustless:wp06-dual-observe -- --environment <non-mainnet> --primary-node-url <origin> --witness-node-url <distinct-origin> --tracker-nft-id <64hex> --tracker-genesis-box-id <64hex> --tracker-ergo-tree <hex> --sidechain-id <64hex> --out <new-report.json>',
  'Reconstructs the complete authenticated V2 tracker lineage through two bounded, credential-free, read-only Ergo node clients and requires exact lineage, AVL replay, canonical tip, and snapshot agreement.',
  'The target nodes must expose synchronized full-block and extra-index routes for the tracker singleton lineage. Both nodes must report the same explicit non-mainnet network.',
  'No configuration, environment credential, deployment state, runtime database, signer, wallet, transaction construction, /transactions/check, submission, deployment, Gate 5 closure, or broadcast path is used.',
];

export async function runAuthenticatedSpvTrackerDualObservationCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseAuthenticatedSpvTrackerDualObservationArgs(argv);
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
  const report = await observeAuthenticatedSpvTrackerFromDistinctNodeOrigins({
    environment: requireArg(args.environment, '--environment'),
    primaryNodeUrl: requireArg(args.primaryNodeUrl, '--primary-node-url'),
    witnessNodeUrl: requireArg(args.witnessNodeUrl, '--witness-node-url'),
    trackerNftIdHex: requireArg(args.trackerNftId, '--tracker-nft-id'),
    trackerGenesisBoxIdHex: requireArg(
      args.trackerGenesisBoxId,
      '--tracker-genesis-box-id',
    ),
    trackerErgoTreeHex: requireArg(args.trackerErgoTree, '--tracker-ergo-tree'),
    sidechainIdHex: requireArg(args.sidechainId, '--sidechain-id'),
  }, {
    createSource: options.createSource,
    now: options.now,
  });
  validateAuthenticatedSpvTrackerDualObservationReport(report);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 dual-source observation written: ${relative(cwd, outputPath)}`);
  console.log(`Agreed tracker tip: ${report.tracker.tipBoxIdHex}`);
  console.log(`Replayed tracker entries: ${report.entries.length}`);
  console.log(`Report digest: ${report.reportDigestHex}`);
  console.log('Boundary: dual-source read-only reconstruction only; R9 remains the finality authority and Gate 5 remains open.');
}

export function parseAuthenticatedSpvTrackerDualObservationArgs(
  argv: string[],
): AuthenticatedSpvTrackerDualObservationCliArgs {
  const result: AuthenticatedSpvTrackerDualObservationCliArgs = {
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
    else if (argument === '--primary-node-url') result.primaryNodeUrl = value;
    else if (argument === '--witness-node-url') result.witnessNodeUrl = value;
    else if (argument === '--tracker-nft-id') result.trackerNftId = value;
    else if (argument === '--tracker-genesis-box-id') result.trackerGenesisBoxId = value;
    else if (argument === '--tracker-ergo-tree') result.trackerErgoTree = value;
    else if (argument === '--sidechain-id') result.sidechainId = value;
    else result.out = value;
  }
  if (!result.help) {
    if (!result.environment) result.errors.push('--environment is required');
    if (!result.primaryNodeUrl) result.errors.push('--primary-node-url is required');
    if (!result.witnessNodeUrl) result.errors.push('--witness-node-url is required');
    if (!result.trackerNftId) result.errors.push('--tracker-nft-id is required');
    if (!result.trackerGenesisBoxId) result.errors.push('--tracker-genesis-box-id is required');
    if (!result.trackerErgoTree) result.errors.push('--tracker-ergo-tree is required');
    if (!result.sidechainId) result.errors.push('--sidechain-id is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

function requireArg(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`${optionName} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedSpvTrackerDualObservationCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
