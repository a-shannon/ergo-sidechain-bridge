import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { readAndGateTestnetOfflineRehearsalBundle } from '../testnet-offline-rehearsal-gate.js';

interface CliArgs {
  prebroadcast?: string;
  preflight?: string;
  windowPrep?: string;
  freshCheckpoint?: string;
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
    if (arg === '--preflight') {
      args.preflight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--window-prep') {
      args.windowPrep = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--fresh-checkpoint') {
      args.freshCheckpoint = requireValue(argv, index, arg);
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
    'Usage: npm run rehearsal:offline-gate -- --prebroadcast <prebroadcast-doctor.json> --preflight <rehearsal-preflight.json> --window-prep <testnet-window-prep.json> --fresh-checkpoint <fresh-testnet-checkpoint.json> [--json-out <report.json>]',
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

if (args.help || !args.prebroadcast || !args.preflight || !args.windowPrep || !args.freshCheckpoint) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}

const report = readAndGateTestnetOfflineRehearsalBundle({
  prebroadcast: args.prebroadcast,
  rehearsalPreflight: args.preflight,
  windowPrep: args.windowPrep,
  freshCheckpoint: args.freshCheckpoint,
});

for (const line of report.lines) console.log(line);
if (args.jsonOut) {
  const output = writeOfflineReportJson(args.jsonOut, {
    schemaVersion: 1,
    ...report,
    targetBindings: {
      offlineGate: args.jsonOut,
    },
  });
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(formatOfflineReportJsonWriteLine('offline gate report', args.jsonOut));
  }
}

if (report.status === 'BLOCKED') {
  process.exitCode = 1;
}
