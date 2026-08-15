import { mkdirSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  observeAuthenticatedV2StatefulCheckReadiness,
  validateAuthenticatedV2StatefulCheckReadinessReport,
} from '../authenticated-v2-stateful-check-readiness.js';
import type { AuthenticatedSpvTrackerNodeSourceFactory } from '../authenticated-spv-tracker-dual-observation.js';
import { resolveProvisioningOutputPath } from '../authenticated-v2-sanitized-io.js';
import { MINER_FEE } from '../ergo-encoding.js';

export interface AuthenticatedV2StatefulCheckReadinessCliArgs {
  environment?: string;
  primaryNodeUrl?: string;
  witnessNodeUrl?: string;
  trackerNftId?: string;
  trackerGenesisBoxId?: string;
  trackerErgoTree?: string;
  sidechainId?: string;
  duplicatePreventionBoxId?: string;
  duplicatePreventionNftId?: string;
  duplicatePreventionErgoTree?: string;
  vaultBoxId?: string;
  vaultErgoTree?: string;
  burnId?: string;
  payoutAmountNanoErg?: string;
  minerFeeNanoErg?: string;
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
  '--dup-box-id',
  '--dup-nft-id',
  '--dup-ergo-tree',
  '--vault-box-id',
  '--vault-ergo-tree',
  '--burn-id',
  '--payout-amount-nanoerg',
  '--miner-fee-nanoerg',
  '--out',
] as const;

const usage = [
  `Usage: npm run trustless:wp06-stateful-readiness -- --environment <non-mainnet> --primary-node-url <origin> --witness-node-url <distinct-origin> --tracker-nft-id <64hex> --tracker-genesis-box-id <64hex> --tracker-ergo-tree <hex> --sidechain-id <64hex> --dup-box-id <64hex> --dup-nft-id <64hex> --dup-ergo-tree <hex> --vault-box-id <64hex> --vault-ergo-tree <hex> --burn-id <64hex> --payout-amount-nanoerg <positive-safe-integer> --miner-fee-nanoerg <${MINER_FEE}> --out <new-report.json>`,
  'Reconstructs the exact authenticated V2 tracker through two bounded read-only sources, then requires the same canonical tracker, DUP, and vault bytes under one stable synchronized snapshot. Vault liquidity is derived from the explicit burn payout plus miner fee.',
  'Only credential-free GET node routes are used. This command reads no bridge config, environment credentials, runtime database, deployment state, signer, or wallet material.',
  'This command does not build or construct a transaction, call /transactions/check, sign, submit, broadcast, or deploy.',
  'Distinct node agreement is not independent control or canonical consensus. R9 remains the finality authority, GRANDPA/STARK is not Ergo-verified, Gate 5 remains open, and the bridge is not production-ready.',
];

export async function runAuthenticatedV2StatefulCheckReadinessCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2StatefulCheckReadinessArgs(argv);
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
  const report = await observeAuthenticatedV2StatefulCheckReadiness({
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
    duplicatePreventionBoxIdHex: requireArg(args.duplicatePreventionBoxId, '--dup-box-id'),
    duplicatePreventionNftIdHex: requireArg(args.duplicatePreventionNftId, '--dup-nft-id'),
    duplicatePreventionErgoTreeHex: requireArg(
      args.duplicatePreventionErgoTree,
      '--dup-ergo-tree',
    ),
    vaultBoxIdHex: requireArg(args.vaultBoxId, '--vault-box-id'),
    vaultErgoTreeHex: requireArg(args.vaultErgoTree, '--vault-ergo-tree'),
    burnIdHex: requireArg(args.burnId, '--burn-id'),
    payoutAmountNanoErg: requireArg(args.payoutAmountNanoErg, '--payout-amount-nanoerg'),
    minerFeeNanoErg: requireArg(args.minerFeeNanoErg, '--miner-fee-nanoerg'),
  }, {
    createSource: options.createSource,
    now: options.now,
  });
  await validateAuthenticatedV2StatefulCheckReadinessReport(report);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 stateful-check readiness report written: ${relative(cwd, outputPath)}`);
  console.log(`Agreed tracker tip: ${report.trackerObservation.tracker.tipBoxIdHex}`);
  console.log(`Agreed DUP input: ${report.duplicatePrevention.box.boxIdHex}`);
  console.log(`Agreed vault input: ${report.vault.box.boxIdHex}`);
  console.log(`Report digest: ${report.reportDigestHex}`);
  console.log(
    'Boundary: read-only prerequisite observation only; node agreement is not independent control or canonical consensus. '
    + 'R9 remains the finality authority, GRANDPA/STARK is not Ergo-verified, Gate 5 remains open, and the bridge is not production-ready.',
  );
}

export function parseAuthenticatedV2StatefulCheckReadinessArgs(
  argv: string[],
): AuthenticatedV2StatefulCheckReadinessCliArgs {
  const result: AuthenticatedV2StatefulCheckReadinessCliArgs = {
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
    else if (argument === '--dup-box-id') result.duplicatePreventionBoxId = value;
    else if (argument === '--dup-nft-id') result.duplicatePreventionNftId = value;
    else if (argument === '--dup-ergo-tree') result.duplicatePreventionErgoTree = value;
    else if (argument === '--vault-box-id') result.vaultBoxId = value;
    else if (argument === '--vault-ergo-tree') result.vaultErgoTree = value;
    else if (argument === '--burn-id') result.burnId = value;
    else if (argument === '--payout-amount-nanoerg') result.payoutAmountNanoErg = value;
    else if (argument === '--miner-fee-nanoerg') result.minerFeeNanoErg = value;
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
    if (!result.duplicatePreventionBoxId) result.errors.push('--dup-box-id is required');
    if (!result.duplicatePreventionNftId) result.errors.push('--dup-nft-id is required');
    if (!result.duplicatePreventionErgoTree) result.errors.push('--dup-ergo-tree is required');
    if (!result.vaultBoxId) result.errors.push('--vault-box-id is required');
    if (!result.vaultErgoTree) result.errors.push('--vault-ergo-tree is required');
    if (!result.burnId) result.errors.push('--burn-id is required');
    if (!result.payoutAmountNanoErg) result.errors.push('--payout-amount-nanoerg is required');
    if (!result.minerFeeNanoErg) result.errors.push('--miner-fee-nanoerg is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

function requireArg(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`${optionName} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedV2StatefulCheckReadinessCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
