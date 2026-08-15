import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { buildTestnetRehearsalDraft } from '../testnet-rehearsal-draft.js';

interface CliArgs {
  prebroadcast?: string;
  approvals?: string;
  out?: string;
  jsonOut?: string;
  doctorArtifact?: string;
  preflightArtifact?: string;
  operator?: string;
  reviewer?: string;
  gitCommit?: string;
  sidechainNetwork?: string;
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
    if (arg === '--sidechain-network') {
      args.sidechainNetwork = requireValue(argv, index, arg);
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
    'Usage: npm run rehearsal:draft -- --prebroadcast <completed-testnet-prebroadcast-evidence.md> --approvals <aggregate-approvals-v2.json> [--out <draft.md>] [--json-out <draft.json>]',
    'Builds a quarantine-aware rehearsal draft for diagnostic and historical evidence only.',
    'The draft emits no legacy V1 live submit command and does not authorize signing or broadcast.',
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

if (args.help || !args.prebroadcast || !args.approvals) {
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

const report = buildTestnetRehearsalDraft({
  prebroadcastTarget: args.prebroadcast,
  approvalsPath: args.approvals,
  doctorArtifact: args.doctorArtifact,
  preflightArtifact: args.preflightArtifact,
  operator: args.operator,
  reviewer: args.reviewer,
  gitCommit: args.gitCommit,
  sidechainNetwork: args.sidechainNetwork,
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
    console.log(formatOfflineReportJsonWriteLine('draft report', args.jsonOut));
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
  console.log(`- draft written: ${args.out}`);
} else if (report.markdown) {
  console.log('');
  console.log(report.markdown.trimEnd());
}
