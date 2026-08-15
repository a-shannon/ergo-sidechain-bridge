import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { validateTrustlessUnsignedTxEvidenceJsonTarget } from '../aggregate-settlement-candidate-evidence-json.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildTrustlessBurnInstanceRefreshCommand,
  buildTrustlessBurnInstanceRefreshReport,
  formatTrustlessBurnInstanceRefreshMarkdown,
  validateTrustlessBurnInstanceRefreshReportJson,
} from '../trustless-burn-instance-refresh.js';

interface CliArgs {
  sourceCommit?: string;
  instanceBinding?: string;
  instanceBindingJson?: string;
  candidate?: string;
  proofVectorReport?: string;
  unsignedTxReport?: string;
  unsignedTxJson?: string;
  contractAcceptanceJson?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

const usage = [
  'Usage: npm run trustless:instance-refresh -- --source-commit <7-40 hex> --instance-binding <binding.md> --instance-binding-json <binding.json> --candidate <candidate.md> --proof-vector-report <proof-vector.json> --unsigned-tx-report <unsigned-validation.md> --unsigned-tx-json <unsigned.json> [--contract-acceptance-json <contract-acceptance.json>] [--out <refresh.md>] [--json-out <refresh.json>]',
  'Checks that local proof-vector, candidate, trustless unsigned transaction evidence, and optionally local contract-equivalent acceptance evidence bind to the same Gate 5 non-mainnet trustless-burn instance.',
  'The command reads only the provided guarded Markdown and JSON evidence targets. It does not read .env files, mnemonics, node config secrets, runtime databases, private deployment state, wallet material, or execute node/RPC probes.',
  'Boundary: refresh output is not Gate 5 closure, not transaction-check evidence, not signing/check/broadcast authorization, not release-gate PASS, and not a production-ready, mainnet, or testnet production-candidate claim.',
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
const instanceBinding = requireArg(args.instanceBinding, '--instance-binding');
const instanceBindingJson = requireArg(args.instanceBindingJson, '--instance-binding-json');
const candidate = requireArg(args.candidate, '--candidate');
const proofVectorReport = requireArg(args.proofVectorReport, '--proof-vector-report');
const unsignedTxReport = requireArg(args.unsignedTxReport, '--unsigned-tx-report');
const unsignedTxJson = requireArg(args.unsignedTxJson, '--unsigned-tx-json');

if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  console.error('--source-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const instanceBindingRead = readRequiredMarkdown(instanceBinding, '--instance-binding');
const candidateRead = readRequiredMarkdown(candidate, '--candidate');
const unsignedTxReportRead = readRequiredMarkdown(unsignedTxReport, '--unsigned-tx-report');
const bindingJsonRead = readRequiredJson(instanceBindingJson, '--instance-binding-json');
const proofVectorJsonRead = readRequiredJson(proofVectorReport, '--proof-vector-report');
const unsignedTxValidation = validateTrustlessUnsignedTxEvidenceJsonTarget(unsignedTxJson);
const contractAcceptanceJsonRead = args.contractAcceptanceJson
  ? readRequiredJson(args.contractAcceptanceJson, '--contract-acceptance-json')
  : undefined;

const command = buildTrustlessBurnInstanceRefreshCommand({
  sourceCommit,
  instanceBinding,
  instanceBindingJson,
  candidate,
  proofVectorReport,
  unsignedTxReport,
  unsignedTxJson,
  contractAcceptanceJson: args.contractAcceptanceJson,
  out: args.out,
  jsonOut: args.jsonOut,
});

let report;
try {
  report = buildTrustlessBurnInstanceRefreshReport({
    sourceCommit,
    command,
    instanceBindingTarget: instanceBinding,
    instanceBindingJsonTarget: instanceBindingJson,
    instanceBindingJson: bindingJsonRead.json,
    instanceBindingMarkdown: instanceBindingRead.markdown,
    candidateTarget: candidate,
    candidateMarkdown: candidateRead.markdown,
    proofVectorReportTarget: proofVectorReport,
    proofVectorReportJson: proofVectorJsonRead.json,
    unsignedTxReportTarget: unsignedTxReport,
    unsignedTxReportMarkdown: unsignedTxReportRead.markdown,
    unsignedTxJsonTarget: unsignedTxJson,
    unsignedTxValidation,
    contractAcceptanceJsonTarget: args.contractAcceptanceJson,
    contractAcceptanceJson: contractAcceptanceJsonRead?.json,
  });
} catch (error: any) {
  console.error(error?.message ?? String(error));
  process.exit(1);
}

const reportErrors = validateTrustlessBurnInstanceRefreshReportJson(report);
if (reportErrors.length > 0) {
  for (const error of reportErrors) console.error(error);
  process.exit(1);
}

const markdown = formatTrustlessBurnInstanceRefreshMarkdown(report);
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
    if (arg === '--instance-binding') {
      args.instanceBinding = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--instance-binding-json') {
      args.instanceBindingJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--candidate') {
      args.candidate = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--proof-vector-report') {
      args.proofVectorReport = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--unsigned-tx-report') {
      args.unsignedTxReport = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--unsigned-tx-json') {
      args.unsignedTxJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--contract-acceptance-json') {
      args.contractAcceptanceJson = requireValue(argv, index, arg);
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
  console.log(formatOfflineReportJsonWriteLine('trustless burn instance refresh JSON report', jsonOut));
}
