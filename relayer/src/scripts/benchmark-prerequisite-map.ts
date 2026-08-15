import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  buildBenchmarkLiveReviewPacket,
  formatBenchmarkLiveReviewPacketMarkdown,
} from '../benchmark-live-review-packet.js';
import {
  buildBenchmarkPrerequisiteMap,
  formatBenchmarkPrerequisiteMapMarkdown,
} from '../benchmark-prerequisite-map.js';
import { validateBenchmarkEvidence } from '../benchmark-evidence.js';
import {
  buildBenchmarkValidationReport,
  formatBenchmarkValidationReportMarkdown,
} from '../benchmark-evidence-report.js';
import { resolveEvidenceOutputPath, type ResolvedEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

interface CliArgs {
  candidate?: string;
  validatorCommit?: string;
  validatorReportOut?: string;
  out?: string;
  reviewPacketOut?: string;
  help: boolean;
  errors: string[];
}

const usage = [
  'Usage: npm run benchmark:prerequisite-map -- --candidate <benchmark-evidence.md> --validator-commit <7-40 hex> --validator-report-out <report.md> --out <map.md> [--review-packet-out <packet.md>]',
  'Builds a Gate 7 benchmark validator report and live-batch prerequisite map from a guarded benchmark Markdown target.',
  'Optional --review-packet-out writes a live-run reviewer packet with exact approval questions and claim-boundary bindings.',
  'The command reads only the provided guarded Markdown evidence target and writes outputs inside the bridge repository.',
  'It does not read private deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, sign, submit, deploy, publish, or broadcast transactions.',
];

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(usage.join('\n'));
  process.exit(0);
}

if (args.errors.length > 0) {
  for (const error of args.errors) console.error(error);
  process.exit(1);
}

const candidate = requireArg(args.candidate, '--candidate');
const validatorCommit = requireArg(args.validatorCommit, '--validator-commit');
const validatorReportOut = requireArg(args.validatorReportOut, '--validator-report-out');
const out = requireArg(args.out, '--out');
const validatorReportOutput = resolveOutput(validatorReportOut, '--validator-report-out');
const mapOutput = resolveOutput(out, '--out');
const reviewPacketOutput = args.reviewPacketOut
  ? resolveOutput(args.reviewPacketOut, '--review-packet-out')
  : undefined;

if (!/^[0-9a-f]{7,40}$/i.test(validatorCommit)) {
  console.error('--validator-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const read = readEvidenceMarkdownTarget(candidate);
const validation = read.errors.length > 0 ? undefined : validateBenchmarkEvidence(read.markdown);
const validationReport = buildBenchmarkValidationReport({
  command: `npm run benchmark:validate -- ${candidate} --report-out <report.md>`,
  workingDirectory: 'ergo-sidechain-bridge/relayer',
  validatedTarget: candidate,
  readErrors: read.errors,
  validation,
});
const prerequisiteMap = buildBenchmarkPrerequisiteMap({
  validatorCommit,
  candidateTarget: read.label,
  validatorReportTarget: validatorReportOut,
  command: buildCommand({ candidate, validatorCommit }),
  validationReport,
  validation,
  readErrors: read.errors,
});
const reviewPacket = args.reviewPacketOut
  ? buildBenchmarkLiveReviewPacket({
      prerequisiteMap,
      prerequisiteMapTarget: out,
      command: buildCommand({ candidate, validatorCommit, reviewPacket: true }),
    })
  : undefined;

writeMarkdown(validatorReportOutput, formatBenchmarkValidationReportMarkdown(validationReport), '--validator-report-out');
writeMarkdown(mapOutput, formatBenchmarkPrerequisiteMapMarkdown(prerequisiteMap), '--out');
if (reviewPacket && reviewPacketOutput) {
  writeMarkdown(reviewPacketOutput, formatBenchmarkLiveReviewPacketMarkdown(reviewPacket), '--review-packet-out');
}

console.log(`Benchmark validation report written: ${validatorReportOut}`);
console.log(`Benchmark prerequisite map written: ${out}`);
if (args.reviewPacketOut) console.log(`Benchmark live review packet written: ${args.reviewPacketOut}`);
console.log(`Result: ${prerequisiteMap.result}`);
console.log(`Structural issues: ${prerequisiteMap.structuralIssues}`);

if (prerequisiteMap.result === 'BLOCKED') {
  process.exitCode = 1;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, errors: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--candidate') {
      args.candidate = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--validator-commit') {
      args.validatorCommit = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--validator-report-out') {
      args.validatorReportOut = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--review-packet-out') {
      args.reviewPacketOut = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    args.errors.push(`Unknown argument: ${arg}`);
  }
  return args;
}

function readValue(argv: string[], index: number, option: string, errors: string[]): string | undefined {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    errors.push(`${option} requires a value.`);
    return undefined;
  }
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

function resolveOutput(target: string, optionName: string): ResolvedEvidenceOutputPath {
  const output = resolveEvidenceOutputPath(target, {
    workspaceRoot: process.cwd(),
    bridgeRoot: resolve(process.cwd(), '..'),
    optionName,
  });
  if (output.errors.length > 0 || !output.path) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  return output;
}

function writeMarkdown(output: ResolvedEvidenceOutputPath, markdown: string, optionName: string): void {
  if (!output.path) {
    console.error(`${optionName} did not resolve to an output path.`);
    process.exit(1);
  }
  mkdirSync(dirname(output.path), { recursive: true });
  writeFileSync(output.path, `${markdown.trimEnd()}\n`, { encoding: 'utf8', flag: 'wx' });
}

function buildCommand(options: {
  candidate: string;
  validatorCommit: string;
  reviewPacket?: boolean;
}): string {
  const parts = [
    'npm run benchmark:prerequisite-map --',
    '--candidate',
    options.candidate,
    '--validator-commit',
    options.validatorCommit,
    '--validator-report-out',
    '<report.md>',
    '--out',
    '<map.md>',
  ];
  if (options.reviewPacket) {
    parts.push('--review-packet-out', '<packet.md>');
  }
  return parts.join(' ');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Module body performs the CLI work above.
}
