import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { preflightTestnetRehearsalLive } from '../testnet-rehearsal-live-preflight.js';

interface CliArgs {
  rehearsal?: string;
  approvals?: string;
  transcript?: string;
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
    if (arg === '--rehearsal') {
      args.rehearsal = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--approvals') {
      args.approvals = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--transcript') {
      args.transcript = requireValue(argv, index, arg);
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
    'Usage: npm run rehearsal:live-preflight -- --rehearsal <completed-live-rehearsal.md> --approvals <relative-aggregate-approvals-v2.json> --transcript <artifact://.../live-preflight.log> [--json-out <report.json>]',
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

if (args.help || !args.rehearsal || !args.approvals || !args.transcript) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}

const report = preflightTestnetRehearsalLive({
  rehearsalTarget: args.rehearsal,
  approvalsTarget: args.approvals,
  transcriptTarget: args.transcript,
  runtimeBroadcastEnabled: isBroadcastEnabled(process.env.BRIDGE_BROADCAST_ENABLED),
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
    console.log(formatOfflineReportJsonWriteLine('live preflight report', args.jsonOut));
  }
}

if (report.status === 'BLOCKED') {
  process.exitCode = 1;
}

function isBroadcastEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}
