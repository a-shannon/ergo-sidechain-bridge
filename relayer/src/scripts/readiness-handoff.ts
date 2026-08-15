import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildReadinessHandoffCommand,
  buildReadinessHandoffReport,
  formatReadinessHandoffReportMarkdown,
  validateReadinessRuntimePrereqsJson,
} from '../readiness-handoff.js';
import type {
  ReadinessRuntimePrereqsReport,
} from '../readiness-runtime-prereqs.js';

interface CliArgs {
  runtimePrereqsJson?: string;
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
    if (arg === '--runtime-prereqs-json') {
      args.runtimePrereqsJson = requireValue(argv, index, arg);
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
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function usage(): void {
  console.error([
    'Usage: npm run readiness:handoff -- --runtime-prereqs-json <runtime-prereqs.json> [--out <report.md>] [--json-out <report.json>]',
    'Converts a readiness runtime-prerequisites JSON report into concrete operator/reviewer work packets.',
    'This command is planning output only; it does not close evidence rows, authorize claims, deploy, sign, submit, or broadcast transactions.',
  ].join('\n'));
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error: any) {
  console.error(error?.message ?? String(error));
  usage();
  process.exit(1);
}

if (args.help) {
  usage();
  process.exit(0);
}

if (!args.runtimePrereqsJson) {
  console.error('--runtime-prereqs-json requires a JSON report target.');
  usage();
  process.exit(1);
}

const runtimePrereqsRead = readEvidenceJsonTarget(args.runtimePrereqsJson, '--runtime-prereqs-json');
if (runtimePrereqsRead.errors.length > 0) {
  for (const error of runtimePrereqsRead.errors) console.error(error);
  process.exit(1);
}

const validationErrors = validateReadinessRuntimePrereqsJson(runtimePrereqsRead.json);
if (validationErrors.length > 0) {
  for (const error of validationErrors) console.error(error);
  process.exit(1);
}

const command = buildReadinessHandoffCommand({
  runtimePrereqsJson: args.runtimePrereqsJson,
  out: args.out,
  jsonOut: args.jsonOut,
});
const report = buildReadinessHandoffReport({
  command,
  runtimePrereqsReport: runtimePrereqsRead.json as ReadinessRuntimePrereqsReport,
  runtimePrereqsSource: {
    mode: 'json',
    target: runtimePrereqsRead.label,
  },
});
const markdown = formatReadinessHandoffReportMarkdown(report);
console.log(markdown);
writeReport(args.out, markdown);
writeJsonReport(args.jsonOut, report);
process.exitCode = report.exitCode;

function writeReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, `${markdown.trimEnd()}\n`, { encoding: 'utf8', flag: 'wx' });
}

function writeJsonReport(jsonOut: string | undefined, report: unknown): void {
  if (!jsonOut) return;
  const output = writeOfflineReportJson(jsonOut, report);
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  console.log(formatOfflineReportJsonWriteLine('readiness handoff JSON report', jsonOut));
}
