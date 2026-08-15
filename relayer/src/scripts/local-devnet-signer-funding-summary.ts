import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildLocalDevnetSignerFundingSummaryCommand,
  buildLocalDevnetSignerFundingSummaryReport,
  formatLocalDevnetSignerFundingSummaryMarkdown,
  validateLocalDevnetSignerFundingSummaryInputs,
  validateLocalDevnetSignerFundingSummaryReportJson,
} from '../local-devnet-signer-funding-summary.js';

interface CliArgs {
  sourceCommit?: string;
  executionRequest?: string;
  signerOutput?: string;
  fundingOutput?: string;
  signerCommand?: string;
  fundingCommand?: string;
  secretMaterialScope?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

const usage = [
  'Usage: npm run rehearsal:local-devnet-signer-funding-summary -- --source-commit <7-40 hex> --execution-request <request.md> --signer-output <signer-output.md> --funding-output <funding-output.md> --signer-command <command> --funding-command <command> --secret-material-scope <scope> [--out <summary.md>] [--json-out <summary.json>]',
  'Builds a Gate 3 local-devnet signer/funding redacted summary from operator-provided command outputs.',
  'The command reads only guarded Markdown evidence targets. It does not read .env files, mnemonics, node config secrets, runtime databases, private deployment state, wallet material, or execute node/RPC probes.',
  'Boundary: summary output is not Gate 3 closure, not signing or broadcast authorization, not release-gate PASS, and not a production-ready or testnet production-candidate claim.',
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
const signerOutput = requireArg(args.signerOutput, '--signer-output');
const fundingOutput = requireArg(args.fundingOutput, '--funding-output');
const signerCommand = requireArg(args.signerCommand, '--signer-command');
const fundingCommand = requireArg(args.fundingCommand, '--funding-command');
const secretMaterialScope = requireArg(args.secretMaterialScope, '--secret-material-scope');

const executionRequestRead = readRequiredMarkdown(executionRequest, '--execution-request');
const signerOutputRead = readRequiredMarkdown(signerOutput, '--signer-output');
const fundingOutputRead = readRequiredMarkdown(fundingOutput, '--funding-output');

const command = buildLocalDevnetSignerFundingSummaryCommand({
  sourceCommit,
  executionRequest,
  signerOutput,
  fundingOutput,
  signerCommand,
  fundingCommand,
  secretMaterialScope,
  out: args.out,
  jsonOut: args.jsonOut,
});

const input = {
  sourceCommit,
  executionRequestTarget: executionRequest,
  executionRequestMarkdown: executionRequestRead.markdown,
  signerOutputTarget: signerOutput,
  signerOutputMarkdown: signerOutputRead.markdown,
  fundingOutputTarget: fundingOutput,
  fundingOutputMarkdown: fundingOutputRead.markdown,
  signerCommand,
  fundingCommand,
  secretMaterialScope,
  command,
};
const inputErrors = validateLocalDevnetSignerFundingSummaryInputs(input);
if (inputErrors.length > 0) {
  for (const error of inputErrors) console.error(error);
  process.exit(1);
}

const report = buildLocalDevnetSignerFundingSummaryReport(input);
const reportErrors = validateLocalDevnetSignerFundingSummaryReportJson(report);
if (reportErrors.length > 0) {
  for (const error of reportErrors) console.error(error);
  process.exit(1);
}

const markdown = formatLocalDevnetSignerFundingSummaryMarkdown(report);
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
    if (arg === '--signer-output') {
      args.signerOutput = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--funding-output') {
      args.fundingOutput = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--signer-command') {
      args.signerCommand = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--funding-command') {
      args.fundingCommand = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--secret-material-scope') {
      args.secretMaterialScope = requireValue(argv, index, arg);
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
  console.log(formatOfflineReportJsonWriteLine('local-devnet signer/funding summary JSON report', jsonOut));
}
