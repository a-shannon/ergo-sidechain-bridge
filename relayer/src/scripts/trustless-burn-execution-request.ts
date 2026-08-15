import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildTrustlessBurnExecutionRequestCommand,
  buildTrustlessBurnExecutionRequestReport,
  formatTrustlessBurnExecutionRequestMarkdown,
  validateTrustlessBurnExecutionRequestReportJson,
  validateTrustlessBurnOperatorPacketForExecution,
  validateTrustlessBurnPrerequisiteMapForExecution,
} from '../trustless-burn-execution-request.js';

interface CliArgs {
  sourceCommit?: string;
  prerequisiteMap?: string;
  operatorPacket?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

const usage = [
  'Usage: npm run trustless:execution-request -- --source-commit <7-40 hex> --prerequisite-map <map.md> --operator-packet <packet.md> [--out <request.md>] [--json-out <request.json>]',
  'Builds the next Gate 5 trustless-burn operator execution request from guarded prerequisite-map and operator-packet Markdown targets.',
  'The command reads only the provided guarded Markdown targets. It does not read .env files, mnemonics, node config secrets, runtime databases, private deployment state, wallet material, or execute node/RPC probes.',
  'Boundary: request output is not Gate 5 closure, not signing/check/broadcast authorization, not release-gate PASS, and not a production-ready, mainnet, or testnet production-candidate claim.',
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
const prerequisiteMap = requireArg(args.prerequisiteMap, '--prerequisite-map');
const operatorPacket = requireArg(args.operatorPacket, '--operator-packet');

if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  console.error('--source-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const mapRead = readRequiredMarkdown(prerequisiteMap, '--prerequisite-map');
const mapErrors = validateTrustlessBurnPrerequisiteMapForExecution(mapRead.markdown);
if (mapErrors.length > 0) {
  for (const error of mapErrors) console.error(error);
  process.exit(1);
}

const packetRead = readRequiredMarkdown(operatorPacket, '--operator-packet');
const packetErrors = validateTrustlessBurnOperatorPacketForExecution(packetRead.markdown);
if (packetErrors.length > 0) {
  for (const error of packetErrors) console.error(error);
  process.exit(1);
}

const command = buildTrustlessBurnExecutionRequestCommand({
  sourceCommit,
  prerequisiteMap,
  operatorPacket,
  out: args.out,
  jsonOut: args.jsonOut,
});
const report = buildTrustlessBurnExecutionRequestReport({
  sourceCommit,
  prerequisiteMapTarget: prerequisiteMap,
  prerequisiteMapMarkdown: mapRead.markdown,
  operatorPacketTarget: operatorPacket,
  operatorPacketMarkdown: packetRead.markdown,
  command,
});
const reportErrors = validateTrustlessBurnExecutionRequestReportJson(report);
if (reportErrors.length > 0) {
  for (const error of reportErrors) console.error(error);
  process.exit(1);
}

const markdown = formatTrustlessBurnExecutionRequestMarkdown(report);
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
    if (arg === '--prerequisite-map') {
      args.prerequisiteMap = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--operator-packet') {
      args.operatorPacket = requireValue(argv, index, arg);
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
  console.log(formatOfflineReportJsonWriteLine('trustless burn execution request JSON report', jsonOut));
}
