import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildBenchmarkLiveExecutionRequestCommand,
  buildBenchmarkLiveExecutionRequestReport,
  formatBenchmarkLiveExecutionRequestMarkdown,
  validateBenchmarkLiveCaptureManifestForExecution,
  validateBenchmarkLiveExecutionRequestReportJson,
} from '../benchmark-live-execution-request.js';

interface CliArgs {
  sourceCommit?: string;
  captureManifest?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

const usage = [
  'Usage: npm run benchmark:live-execution-request -- --source-commit <7-40 hex> --capture-manifest <manifest.md> [--out <request.md>] [--json-out <request.json>]',
  'Builds a blocked Gate 7 operator request from a guarded live-batch capture manifest.',
  'The request records the legacy V1 settlement quarantine and emits no live submit command.',
  'The command reads only the provided guarded Markdown target. It does not read .env files, mnemonics, node config secrets, runtime databases, private deployment state, wallet material, or execute node/RPC probes.',
  'Boundary: request output is not Gate 7 closure, not signing or broadcast authorization, not release-gate PASS, and not a production-ready or production-throughput claim.',
];

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error: any) {
  console.error(error?.message ?? String(error));
  console.error(usage.join('\n'));
  process.exit(1);
}

if (args.help) {
  console.log(usage.join('\n'));
  process.exit(0);
}

const sourceCommit = requireArg(args.sourceCommit, '--source-commit');
const captureManifest = requireArg(args.captureManifest, '--capture-manifest');

if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  console.error('--source-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const captureRead = readRequiredMarkdown(captureManifest, '--capture-manifest');
const manifestErrors = validateBenchmarkLiveCaptureManifestForExecution(captureRead.markdown);
if (manifestErrors.length > 0) {
  for (const error of manifestErrors) console.error(error);
  process.exit(1);
}

const command = buildBenchmarkLiveExecutionRequestCommand({
  sourceCommit,
  captureManifest,
  out: args.out,
  jsonOut: args.jsonOut,
});
const report = buildBenchmarkLiveExecutionRequestReport({
  sourceCommit,
  captureManifestTarget: captureManifest,
  captureManifestMarkdown: captureRead.markdown,
  command,
});
const reportErrors = validateBenchmarkLiveExecutionRequestReportJson(report);
if (reportErrors.length > 0) {
  for (const error of reportErrors) console.error(error);
  process.exit(1);
}

const markdown = formatBenchmarkLiveExecutionRequestMarkdown(report);
console.log(markdown);
writeMarkdownReport(args.out, markdown);
writeJsonReport(args.jsonOut, report);
process.exitCode = report.exitCode;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--source-commit') {
      args.sourceCommit = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--capture-manifest') {
      args.captureManifest = requireValue(argv, index, arg);
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

function requireArg(value: string | undefined, option: string): string {
  if (!value) {
    console.error(`${option} is required.`);
    console.error(usage.join('\n'));
    process.exit(1);
  }
  return value;
}

function readRequiredMarkdown(target: string, optionName: string): { markdown: string } {
  const read = readEvidenceMarkdownTarget(target);
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(`${optionName} ${error}`);
    process.exit(1);
  }
  return { markdown: read.markdown };
}

function writeMarkdownReport(out: string | undefined, markdown: string): void {
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
  console.log(formatOfflineReportJsonWriteLine('blocked benchmark execution request JSON report', jsonOut));
}
