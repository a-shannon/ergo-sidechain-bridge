import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { computeDeployedStateHash } from '../config.js';
import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { prepareTestnetWindowPacket } from '../testnet-window-prep.js';

interface CliArgs {
  prebroadcast?: string;
  approvals?: string;
  currentErgoHeight?: string;
  currentSidechainHeight?: string;
  currentDeployedStateHash?: string;
  ergoNodeNetwork?: string;
  sidechainNetwork?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--prebroadcast') {
      args.prebroadcast = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--approvals') {
      args.approvals = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-ergo-height') {
      args.currentErgoHeight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-sidechain-height') {
      args.currentSidechainHeight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-deployed-state-hash') {
      args.currentDeployedStateHash = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--ergo-node-network') {
      args.ergoNodeNetwork = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--sidechain-network') {
      args.sidechainNetwork = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = requireValue(argv, index, arg);
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

function usage(): void {
  console.error(
    'Usage: npm run rehearsal:testnet-window-prep -- --prebroadcast <completed-testnet-prebroadcast-evidence.md> --approvals <aggregate-approvals-v2.json> --current-ergo-height <height> --current-sidechain-height <height> [--current-deployed-state-hash <64hex>] --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> [--out <packet.md>] [--json-out <report.json>]',
  );
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

if (
  args.help ||
  !args.prebroadcast ||
  !args.approvals ||
  !args.currentErgoHeight ||
  !args.currentSidechainHeight ||
  !args.ergoNodeNetwork ||
  !args.sidechainNetwork
) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;
if (outputTarget?.errors.length) {
  for (const error of outputTarget.errors) console.error(error);
  process.exit(1);
}
const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}

let currentDeployedStateHash: string;
if (args.currentDeployedStateHash) {
  currentDeployedStateHash = args.currentDeployedStateHash;
} else {
  try {
    currentDeployedStateHash = computeDeployedStateHash();
  } catch {
    console.error('Deployment state: cannot compute current deployed_state hash');
    process.exit(1);
  }
}

const report = prepareTestnetWindowPacket({
  prebroadcastTarget: args.prebroadcast,
  approvalsPath: args.approvals,
  currentErgoHeight: args.currentErgoHeight,
  currentSidechainHeight: args.currentSidechainHeight,
  currentDeployedStateHash,
  ergoNodeNetwork: args.ergoNodeNetwork,
  sidechainNetwork: args.sidechainNetwork,
  broadcastEnabled: process.env.BRIDGE_BROADCAST_ENABLED === 'true',
});

for (const line of report.lines) console.log(line);
if (args.jsonOut) {
  const output = writeOfflineReportJson(args.jsonOut, {
    schemaVersion: 1,
    ...report,
  });
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(formatOfflineReportJsonWriteLine('window prep report', args.jsonOut));
  }
}

if (report.status === 'BLOCKED') {
  process.exitCode = 1;
} else if (args.out && report.markdown) {
  const outputPath = outputTarget!.path!;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${report.markdown.trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`- packet written: ${args.out}`);
} else if (report.markdown) {
  console.log('');
  console.log(report.markdown.trimEnd());
}
