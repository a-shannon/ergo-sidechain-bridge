/**
 * Devnet Session Environment Check CLI.
 *
 * Read-only. No .env loading. No signing. No DB writes.
 * Default mode does not read mnemonic env values or node config files.
 * Exit 0 always (informational).
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  checkNodeUrlAlignment,
  checkBatchEnabled,
  checkBatchMaxClaims,
  checkMinConfirmations,
  checkSignerPresence,
  checkSignerMatch,
  checkSecretMaterialInspection,
  formatEnvCheckReport,
  type EnvCheckResult,
} from '../devnet-session-env.js';
import {
  checkSignerAlignment,
} from '../devnet-signer-alignment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RELAYER_ROOT = resolve(__dirname, '..', '..');
const BRIDGE_ROOT = resolve(RELAYER_ROOT, '..');
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
    'Usage: npm run demo:devnet:env -- [--include-secret-material]',
    '',
    'Read-only patched-devnet environment diagnostic.',
    'Default mode does not read WALLET_MNEMONIC values, node configs, .env files, runtime databases, or deployment state.',
    'Use --include-secret-material only in a local devnet operator shell when signer/mining alignment must be derived.',
  ].join('\n'));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const results: EnvCheckResult[] = [];

  // Node URL alignment
  results.push(checkNodeUrlAlignment(
    process.env.ERGO_NODE,
    process.env.ERGO_NODE_URL,
    process.env.PATCHED_ERGO_NODE_URL,
  ));

  // Batch config
  results.push(checkBatchEnabled(process.env.AGGREGATE_BATCH_ENABLED));
  results.push(checkBatchMaxClaims(process.env.AGGREGATE_BATCH_MAX_CLAIMS));

  // Anchor confirmations
  results.push(checkMinConfirmations(process.env.AGGREGATE_ANCHOR_MIN_CONFIRMATIONS));

  // Signer presence
  results.push(checkSecretMaterialInspection(args.includeSecretMaterial));

  if (!args.includeSecretMaterial) {
    results.push({
      status: 'WARN',
      label: 'WALLET_MNEMONIC',
      detail: 'not inspected -- secret material inspection disabled',
    });
    results.push({
      status: 'WARN',
      label: 'Signer/mining alignment',
      detail: 'not inspected -- pass --include-secret-material only in a local devnet operator shell',
    });
    console.log(formatEnvCheckReport(results));
    process.exit(0);
  }

  const { existsSync, readFileSync } = await import('fs');
  const hasMnemonic = !!process.env.WALLET_MNEMONIC?.trim();
  results.push(checkSignerPresence(hasMnemonic));

  // Signer/mining alignment via existing helpers
  const configPath = process.env.PATCHED_DEVNET_NODE_CONFIG
    ?? resolve(BRIDGE_ROOT, DEFAULT_CONFIG_REL);
  let configContent: string | null = null;
  if (existsSync(configPath)) {
    configContent = readFileSync(configPath, 'utf-8');
  }

  const relayerMnemonic = process.env.WALLET_MNEMONIC?.trim() || null;
  const networkPrefix = parseInt(process.env.ERGO_NETWORK_PREFIX ?? '16', 10);

  const alignResult = await checkSignerAlignment(
    configContent,
    configPath,
    relayerMnemonic,
    networkPrefix,
  );

  results.push(checkSignerMatch(
    alignResult.relayerAddress,
    alignResult.miningAddress,
  ));

  console.log(formatEnvCheckReport(results));
  process.exit(0);
}

main().catch((err: any) => {
  console.error(`Env check error: ${err.message ?? err}`);
  process.exit(0);
});
