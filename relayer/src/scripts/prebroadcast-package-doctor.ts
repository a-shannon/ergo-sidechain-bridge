import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { doctorTestnetPreBroadcastPackage } from '../testnet-prebroadcast-package-doctor.js';

interface CliArgs {
  targets: string[];
  jsonOut?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { targets: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--json-out') {
      args.jsonOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    args.targets.push(arg);
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
    'Usage: npm run prebroadcast:doctor -- <completed-testnet-prebroadcast-evidence.md> [...] [--json-out <report.json>]',
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

if (args.help || args.targets.length === 0) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}

let blocked = false;
const reports = [];

for (const target of args.targets) {
  const report = doctorTestnetPreBroadcastPackage(target);
  reports.push(report);
  for (const line of report.lines) console.log(line);
  if (report.status === 'BLOCKED') blocked = true;
}

if (args.jsonOut) {
  const output = writeOfflineReportJson(args.jsonOut, {
    schemaVersion: 1,
    status: blocked ? 'BLOCKED' : 'PASS',
    reports,
  });
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(formatOfflineReportJsonWriteLine('doctor report', args.jsonOut));
  }
}

if (blocked) {
  process.exitCode = 1;
}
