import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { assembleTestnetRehearsalCandidate } from '../testnet-rehearsal-assemble.js';

interface CliArgs {
  draft?: string;
  livePreflight?: string;
  postSubmit?: string;
  freshCheckpoint?: string;
  failedBroadcast?: string;
  reorgRecovery?: string;
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
    if (arg === '--draft') {
      args.draft = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--live-preflight') {
      args.livePreflight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--post-submit') {
      args.postSubmit = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--fresh-checkpoint') {
      args.freshCheckpoint = requireValue(argv, index, arg);
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
    'Usage:',
    '  npm run rehearsal:assemble -- --draft <draft.md> --live-preflight <live-preflight.log|md|json> [--fresh-checkpoint <fresh-testnet-checkpoint.json>] [--failed-broadcast <failed-broadcast-row.md>] [--reorg-recovery <reorg-stale-singleton-row.md>] [--post-submit <post-submit-observe.json>] [--out <candidate.md>] [--json-out <report.json>]',
    '',
    'This command only assembles already captured local Markdown/text/JSON artifacts. It never signs, queries nodes, submits, confirms, or broadcasts transactions.',
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

if (args.help || !args.draft || !args.livePreflight) {
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

const report = assembleTestnetRehearsalCandidate({
  draft: args.draft,
  livePreflight: args.livePreflight,
  postSubmit: args.postSubmit,
  freshCheckpoint: args.freshCheckpoint,
  failedBroadcast: args.failedBroadcast,
  reorgRecovery: args.reorgRecovery,
  out: args.out,
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
    console.log(formatOfflineReportJsonWriteLine('rehearsal assembly report', args.jsonOut));
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
  console.log(`- rehearsal candidate written: ${args.out}`);
} else if (report.markdown) {
  console.log('');
  console.log(report.markdown.trimEnd());
}
