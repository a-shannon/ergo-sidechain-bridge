import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildReadinessOperatorRequestCommand,
  buildReadinessOperatorRequestReport,
  formatReadinessOperatorRequestMarkdown,
} from '../readiness-operator-request.js';
import {
  validateReadinessHandoffReportJson,
} from '../readiness-handoff.js';
import type {
  ReadinessHandoffReport,
} from '../readiness-handoff.js';

interface CliArgs {
  handoffJson?: string;
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
    if (arg === '--handoff-json') {
      args.handoffJson = requireValue(argv, index, arg);
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
    'Usage: npm run readiness:operator-request -- --handoff-json <handoff.json> [--out <request.md>] [--json-out <request.json>]',
    'Builds a compact operator/reviewer request bundle from a validated readiness handoff JSON report.',
    'This command is planning output only; it does not probe nodes, read deployment state, close evidence rows, authorize claims, deploy, sign, submit, rotate keys, or broadcast transactions.',
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

if (!args.handoffJson) {
  console.error('--handoff-json requires a JSON report target.');
  usage();
  process.exit(1);
}

const handoffRead = readEvidenceJsonTarget(args.handoffJson, '--handoff-json');
if (handoffRead.errors.length > 0) {
  for (const error of handoffRead.errors) console.error(error);
  process.exit(1);
}

const validationErrors = validateReadinessHandoffReportJson(handoffRead.json);
if (validationErrors.length > 0) {
  for (const error of validationErrors) console.error(error);
  process.exit(1);
}

const command = buildReadinessOperatorRequestCommand({
  handoffJson: args.handoffJson,
  out: args.out,
  jsonOut: args.jsonOut,
});
const report = buildReadinessOperatorRequestReport({
  command,
  handoffReport: handoffRead.json as ReadinessHandoffReport,
  handoffSource: {
    mode: 'json',
    target: handoffRead.label,
  },
});
const markdown = formatReadinessOperatorRequestMarkdown(report);
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
  console.log(formatOfflineReportJsonWriteLine('readiness operator request JSON report', jsonOut));
}
