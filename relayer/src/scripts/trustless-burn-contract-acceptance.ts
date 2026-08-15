import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildTrustlessBurnContractAcceptanceCommand,
  buildTrustlessBurnContractAcceptanceReport,
  formatTrustlessBurnContractAcceptanceMarkdown,
  validateTrustlessBurnContractAcceptanceReportJson,
} from '../trustless-burn-contract-acceptance-report.js';

interface CliArgs {
  sourceCommit?: string;
  candidate?: string;
  instanceBindingJson?: string;
  proofVector?: string;
  currentErgoHeight?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

const usage = [
  'Usage: npm run trustless:contract-acceptance -- --source-commit <7-40 hex> --candidate <candidate.md> --instance-binding-json <binding.json> --proof-vector <proof-vector.json> --current-ergo-height <height> [--out <report.md>] [--json-out <report.json>]',
  'Builds a local contract-equivalent V2 trustless-burn acceptance report for one Gate 5 non-mainnet instance.',
  'The command reads only the provided guarded Markdown/JSON targets. It does not read .env files, mnemonics, node config secrets, runtime databases, private deployment state, wallet material, or execute node/RPC probes.',
  'Boundary: contract-equivalent local acceptance is not ErgoScript VM execution, not on-chain proof acceptance, not Gate 5 closure, not signing/check/broadcast authorization, and not a production or testnet production-candidate claim.',
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
const candidate = requireArg(args.candidate, '--candidate');
const instanceBindingJson = requireArg(args.instanceBindingJson, '--instance-binding-json');
const proofVector = requireArg(args.proofVector, '--proof-vector');
const currentErgoHeight = parseHeight(requireArg(args.currentErgoHeight, '--current-ergo-height'));

if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  console.error('--source-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const candidateRead = readRequiredMarkdown(candidate, '--candidate');
const bindingJsonRead = readRequiredJson(instanceBindingJson, '--instance-binding-json');
const proofVectorRead = readRequiredJson(proofVector, '--proof-vector');
const command = buildTrustlessBurnContractAcceptanceCommand({
  sourceCommit,
  candidate,
  instanceBindingJson,
  proofVector,
  currentErgoHeight,
  out: args.out,
  jsonOut: args.jsonOut,
});

const report = buildTrustlessBurnContractAcceptanceReport({
  sourceCommit,
  command,
  candidateTarget: candidate,
  candidateMarkdown: candidateRead.markdown,
  instanceBindingJsonTarget: instanceBindingJson,
  instanceBindingJson: bindingJsonRead.json,
  proofVectorTarget: proofVector,
  proofVectorJson: proofVectorRead.json,
  currentErgoHeight,
});
const reportErrors = validateTrustlessBurnContractAcceptanceReportJson(report);
if (reportErrors.length > 0) {
  for (const error of reportErrors) console.error(error);
  process.exit(1);
}

const markdown = formatTrustlessBurnContractAcceptanceMarkdown(report);
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
    if (arg === '--candidate') {
      args.candidate = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--instance-binding-json') {
      args.instanceBindingJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--proof-vector') {
      args.proofVector = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-ergo-height') {
      args.currentErgoHeight = requireValue(argv, index, arg);
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

function parseHeight(value: string): number {
  if (!/^[0-9]+$/.test(value)) {
    console.error('--current-ergo-height must be a non-negative integer.');
    process.exit(1);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    console.error('--current-ergo-height must be a safe integer.');
    process.exit(1);
  }
  return parsed;
}

function readRequiredMarkdown(target: string, optionName: string): { markdown: string } {
  const read = readEvidenceMarkdownTarget(target);
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(`${optionName} ${error}`);
    process.exit(1);
  }
  return { markdown: read.markdown };
}

function readRequiredJson(target: string, optionName: string): { json: unknown } {
  const read = readEvidenceJsonTarget(target, optionName);
  if (read.errors.length > 0 || read.json === undefined) {
    for (const error of read.errors) console.error(`${optionName} ${error}`);
    process.exit(1);
  }
  return { json: read.json };
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
  console.log(formatOfflineReportJsonWriteLine('trustless burn contract-equivalent acceptance JSON report', jsonOut));
}
