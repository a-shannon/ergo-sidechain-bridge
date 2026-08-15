/**
 * Devnet Signer / Mining Target CLI - verifies Fleet signer + mining target alignment.
 *
 * Read-only. No .env loading. No signing. No DB writes. No mnemonic printed.
 * Default mode does not read mnemonic env values or node config files.
 * Exit 0 always (informational).
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  checkSignerAlignment,
  formatAlignmentReport,
  type FullAlignmentResult,
} from '../devnet-signer-alignment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RELAYER_ROOT = resolve(__dirname, '..', '..');
const BRIDGE_ROOT = resolve(RELAYER_ROOT, '..');

// Default config path relative to bridge root
const DEFAULT_CONFIG_REL = '../ergo-source/src/main/resources/node1/application.conf';

interface CliArgs {
  help: boolean;
  includeSecretMaterial: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, includeSecretMaterial: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--include-secret-material') {
      args.includeSecretMaterial = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log([
    'Usage: npm run demo:devnet:signer -- [--include-secret-material]',
    '',
    'Read-only patched-devnet signer/mining diagnostic.',
    'Default mode does not read WALLET_MNEMONIC values, node configs, .env files, runtime databases, or deployment state.',
    'Use --include-secret-material only in a local devnet operator shell when signer/mining alignment must be derived.',
  ].join('\n'));
}

function skippedSecretMaterialReport(): FullAlignmentResult {
  const skipped = {
    status: 'WARN' as const,
    label: 'Devnet signer alignment',
    detail: 'not inspected -- secret material inspection disabled; pass --include-secret-material only in a local devnet operator shell',
  };
  return {
    alignment: skipped,
    miningTargetAlignment: {
      status: 'WARN',
      label: 'Devnet mining target',
      detail: 'not inspected -- secret material inspection disabled',
    },
    configExists: false,
    configPath: '(not inspected)',
    hasTestMnemonic: false,
    minerRewardDelay: null,
    miningAddress: null,
    relayerAddress: null,
    miningTarget: null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.includeSecretMaterial) {
    console.log(formatAlignmentReport(skippedSecretMaterialReport()));
    process.exit(0);
  }

  const configPath = process.env.PATCHED_DEVNET_NODE_CONFIG
    ?? resolve(BRIDGE_ROOT, DEFAULT_CONFIG_REL);

  let configContent: string | null = null;
  if (existsSync(configPath)) {
    configContent = readFileSync(configPath, 'utf-8');
  }

  const relayerMnemonic = process.env.WALLET_MNEMONIC?.trim() || null;
  const networkPrefix = parseInt(process.env.ERGO_NETWORK_PREFIX ?? '16', 10);
  const miningTarget = process.env.DEVNET_MINING_TARGET?.trim() || null;
  const fleetMiningAddress = process.env.DEVNET_FLEET_ADDRESS?.trim() || null;

  const result = await checkSignerAlignment(
    configContent,
    configPath,
    relayerMnemonic,
    networkPrefix,
    miningTarget,
    fleetMiningAddress,
  );

  console.log(formatAlignmentReport(result));
  process.exit(0);
}

main().catch((err: any) => {
  console.error(`Signer alignment error: ${err.message ?? err}`);
  process.exit(0); // informational, never hard-fail
});
