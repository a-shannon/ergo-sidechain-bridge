import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildTrustlessBurnInstanceBindingCommand,
  buildTrustlessBurnInstanceBindingReport,
  formatTrustlessBurnInstanceBindingMarkdown,
  validateTrustlessBurnCandidateForInstanceBinding,
  validateTrustlessBurnExecutionRequestForInstanceBinding,
  validateTrustlessBurnInstanceBindingReportJson,
} from '../trustless-burn-instance-binding.js';

interface CliArgs {
  sourceCommit?: string;
  executionRequest?: string;
  candidate?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

const usage = [
  'Usage: npm run trustless:instance-binding -- --source-commit <7-40 hex> --execution-request <request.md> --candidate <candidate.md> [--out <binding.md>] [--json-out <binding.json>]',
  'Builds a Gate 5 non-mainnet trustless-burn instance binding packet from the guarded execution request and SPV-linked candidate Markdown targets.',
  'The command reads only the provided guarded Markdown targets. It does not read .env files, mnemonics, node config secrets, runtime databases, private deployment state, wallet material, or execute node/RPC probes.',
  'Boundary: binding output is not Gate 5 closure, not signing/check/broadcast authorization, not release-gate PASS, and not a production-ready, mainnet, or testnet production-candidate claim.',
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
const executionRequest = requireArg(args.executionRequest, '--execution-request');
const candidate = requireArg(args.candidate, '--candidate');

if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  console.error('--source-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const requestRead = readRequiredMarkdown(executionRequest, '--execution-request');
const requestErrors = validateTrustlessBurnExecutionRequestForInstanceBinding(requestRead.markdown);
if (requestErrors.length > 0) {
  for (const error of requestErrors) console.error(error);
  process.exit(1);
}

const candidateRead = readRequiredMarkdown(candidate, '--candidate');
const candidateErrors = validateTrustlessBurnCandidateForInstanceBinding(candidateRead.markdown);
if (candidateErrors.length > 0) {
  for (const error of candidateErrors) console.error(error);
  process.exit(1);
}

const command = buildTrustlessBurnInstanceBindingCommand({
  sourceCommit,
  executionRequest,
  candidate,
  out: args.out,
  jsonOut: args.jsonOut,
});
const report = buildTrustlessBurnInstanceBindingReport({
  sourceCommit,
  executionRequestTarget: executionRequest,
  executionRequestMarkdown: requestRead.markdown,
  candidateTarget: candidate,
  candidateMarkdown: candidateRead.markdown,
  command,
});
const reportErrors = validateTrustlessBurnInstanceBindingReportJson(report);
if (reportErrors.length > 0) {
  for (const error of reportErrors) console.error(error);
  process.exit(1);
}

const markdown = formatTrustlessBurnInstanceBindingMarkdown(report);
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
    if (arg === '--execution-request') {
      args.executionRequest = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--candidate') {
      args.candidate = requireValue(argv, index, arg);
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
  console.log(formatOfflineReportJsonWriteLine('trustless burn instance binding JSON report', jsonOut));
}
