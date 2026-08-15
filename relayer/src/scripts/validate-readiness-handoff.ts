import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildReadinessHandoffValidationCommand,
  buildReadinessHandoffValidationReport,
  formatReadinessHandoffValidationReportMarkdown,
  validateReadinessHandoffReportJson,
} from '../readiness-handoff.js';
import type {
  ReadinessHandoffReport,
} from '../readiness-handoff.js';

interface CliArgs {
  handoffJson?: string;
  expectedSourceCommit?: string;
  reportOut?: string;
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
    if (arg === '--report-out') {
      args.reportOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--json-out') {
      args.jsonOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--expected-source-commit') {
      const value = requireValue(argv, index, arg);
      if (!isGitCommit(value)) {
        throw new Error('--expected-source-commit must be a 7-40 character Git commit SHA');
      }
      args.expectedSourceCommit = value.toLowerCase();
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (args.handoffJson) {
      throw new Error('Only one handoff JSON target may be provided');
    }
    args.handoffJson = arg;
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
    'Usage: npm run readiness:handoff:validate -- <handoff.json> [--expected-source-commit <commit>] [--report-out <report.md>] [--json-out <report.json>]',
    'Validates a readiness handoff JSON report, including lane-packet coverage and no-closure/no-broadcast boundaries.',
    'This command is read-only; it does not close evidence rows, authorize claims, deploy, sign, submit, or broadcast transactions.',
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
  console.error('handoff JSON target is required.');
  usage();
  process.exit(1);
}

const handoffRead = readEvidenceJsonTarget(args.handoffJson, '--handoff-json');
if (handoffRead.errors.length > 0) {
  for (const error of handoffRead.errors) console.error(error);
  process.exit(1);
}

const validationErrors = validateReadinessHandoffReportJson(handoffRead.json);
if (validationErrors.length > 0 && !isReportableHandoff(handoffRead.json)) {
  for (const error of validationErrors) console.error(error);
  process.exit(1);
}

const command = buildReadinessHandoffValidationCommand({
  handoffJson: args.handoffJson,
  expectedSourceCommit: args.expectedSourceCommit,
  reportOut: args.reportOut,
  jsonOut: args.jsonOut,
});
const report = buildReadinessHandoffValidationReport({
  command,
  handoffReport: handoffRead.json as ReadinessHandoffReport,
  handoffSource: {
    mode: 'json',
    target: handoffRead.label,
  },
  expectedSourceCommit: args.expectedSourceCommit,
});
const markdown = formatReadinessHandoffValidationReportMarkdown(report);
console.log(markdown);
writeReport(args.reportOut, markdown);
writeJsonReport(args.jsonOut, report);
process.exitCode = report.exitCode;

function writeReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out, { optionName: '--report-out' });
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
  console.log(formatOfflineReportJsonWriteLine('readiness handoff validation JSON report', jsonOut));
}

function isReportableHandoff(value: unknown): value is ReadinessHandoffReport {
  return typeof value === 'object'
    && value !== null
    && Array.isArray((value as any).liveEvidenceRequests)
    && Array.isArray((value as any).lanePackets)
    && Array.isArray((value as any).workPackages)
    && Array.isArray((value as any).nextActions)
    && typeof (value as any).boundary === 'object'
    && (value as any).boundary !== null;
}

function isGitCommit(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value);
}
