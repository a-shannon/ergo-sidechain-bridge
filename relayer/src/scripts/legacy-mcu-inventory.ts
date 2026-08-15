import { ErgoClient } from '../ergo-client.js';
import {
  collectLegacyMcuInventory,
  parseLegacyMcuAddresses,
} from '../legacy-mcu-inventory.js';
import { writeOfflineReportJson } from '../offline-report-json.js';

interface CliArgs {
  addressValues: string[];
  nodeUrl: string;
  currentHeight?: number;
  jsonOut?: string;
  help: boolean;
}

const DEFAULT_NODE_URL = 'http://localhost:9052';

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    addressValues: [],
    nodeUrl: DEFAULT_NODE_URL,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--address') {
      args.addressValues.push(requireValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--node-url') {
      args.nodeUrl = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-height') {
      args.currentHeight = parseHeight(requireValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--json-out') {
      args.jsonOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseHeight(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('--current-height must be a non-negative integer');
  }
  const height = Number(value);
  if (!Number.isSafeInteger(height)) {
    throw new Error('--current-height must be a safe integer');
  }
  return height;
}

function usage(): void {
  console.error([
    'Usage:',
    '  npm run inventory:legacy-mcu -- --address <address>[,<address>...] [--address <address> ...] [--node-url <http://...>] [--current-height <n>] [--json-out <report.json>]',
    '',
    'Addresses are mandatory and are never loaded from deployment or runtime state.',
    'The command reads only node height and unspent boxes. Every found box is quarantined.',
  ].join('\n'));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const addresses = parseLegacyMcuAddresses(args.addressValues);
  const client = new ErgoClient(args.nodeUrl, { readOnly: true });
  const report = await collectLegacyMcuInventory({
    addresses,
    client,
    currentHeight: args.currentHeight,
  });

  if (args.jsonOut) {
    const writeResult = writeOfflineReportJson(args.jsonOut, report);
    if (writeResult.errors.length > 0) {
      throw new Error(writeResult.errors.join('; '));
    }
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.addressQueriesComplete || report.summary.malformedBoxes > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
