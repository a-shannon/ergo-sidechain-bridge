import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { buildTestnetRehearsalPrepBundle } from '../testnet-rehearsal-prep-bundle.js';

interface CliArgs {
  prebroadcast?: string;
  approvals?: string;
  currentErgoHeight?: string;
  currentSidechainHeight?: string;
  currentDeployedStateHash?: string;
  ergoNodeNetwork?: string;
  sidechainNetwork?: string;
  doctorArtifact?: string;
  preflightArtifact?: string;
  windowPrepArtifact?: string;
  offlineGateArtifact?: string;
  freshCheckpointArtifact?: string;
  heightEvidenceArtifact?: string;
  failedBroadcast?: string;
  reorgRecovery?: string;
  operator?: string;
  reviewer?: string;
  gitCommit?: string;
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
    if (arg === '--doctor-artifact') {
      args.doctorArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--preflight-artifact') {
      args.preflightArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--window-prep-artifact') {
      args.windowPrepArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--offline-gate-artifact') {
      args.offlineGateArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--fresh-checkpoint-artifact') {
      args.freshCheckpointArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--height-evidence-artifact') {
      args.heightEvidenceArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--failed-broadcast') {
      args.failedBroadcast = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--reorg-recovery') {
      args.reorgRecovery = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--operator') {
      args.operator = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--reviewer') {
      args.reviewer = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--git-commit') {
      args.gitCommit = requireValue(argv, index, arg);
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
  console.error([
    'Usage: npm run rehearsal:prep-bundle -- --prebroadcast <completed-evidence.md> --approvals <aggregate-approvals-v2.json> --current-ergo-height <height> --current-sidechain-height <height> --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --fresh-checkpoint-artifact <fresh-testnet-checkpoint.json> [--height-evidence-artifact <height-evidence.json>] [--failed-broadcast <row.md>] [--reorg-recovery <row.md>] [--out <prep-bundle.md>] [--json-out <prep-bundle.json>]',
    'Builds a quarantined diagnostic bundle; it emits no legacy V1 live-preflight or submit command.',
    'A reviewed external-fee profile and permanent legacy-route retirement are required before any live handoff.',
  ].join('\n'));
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
  !args.currentDeployedStateHash ||
  !args.ergoNodeNetwork ||
  !args.sidechainNetwork ||
  !args.freshCheckpointArtifact
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

const report = buildTestnetRehearsalPrepBundle({
  prebroadcastTarget: args.prebroadcast,
  approvalsPath: args.approvals,
  currentErgoHeight: args.currentErgoHeight,
  currentSidechainHeight: args.currentSidechainHeight,
  currentDeployedStateHash: args.currentDeployedStateHash,
  ergoNodeNetwork: args.ergoNodeNetwork,
  sidechainNetwork: args.sidechainNetwork,
  broadcastEnabled: process.env.BRIDGE_BROADCAST_ENABLED === 'true',
  doctorArtifact: args.doctorArtifact,
  preflightArtifact: args.preflightArtifact,
  windowPrepArtifact: args.windowPrepArtifact,
  offlineGateArtifact: args.offlineGateArtifact,
  freshCheckpointArtifact: args.freshCheckpointArtifact,
  heightEvidenceArtifact: args.heightEvidenceArtifact,
  failedBroadcast: args.failedBroadcast,
  reorgRecovery: args.reorgRecovery,
  operator: args.operator,
  reviewer: args.reviewer,
  gitCommit: args.gitCommit,
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
    console.log(formatOfflineReportJsonWriteLine('prep bundle report', args.jsonOut));
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
  console.log(`- prep bundle written: ${args.out}`);
} else if (report.markdown) {
  console.log('');
  console.log(report.markdown.trimEnd());
}
