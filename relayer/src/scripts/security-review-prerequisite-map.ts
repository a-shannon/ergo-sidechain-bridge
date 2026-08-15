import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  buildSecurityReviewExternalReviewPacket,
  formatSecurityReviewExternalReviewPacketMarkdown,
} from '../security-review-external-review-packet.js';
import {
  buildSecurityReviewPrerequisiteMap,
  formatSecurityReviewPrerequisiteMapMarkdown,
} from '../security-review-prerequisite-map.js';
import { validateSecurityReviewEvidence } from '../security-review-evidence.js';
import {
  buildSecurityReviewValidationReport,
  formatSecurityReviewValidationReportMarkdown,
} from '../security-review-evidence-report.js';
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
  'Usage: npm run security:prerequisite-map -- --candidate <independent-security-review-evidence.md> --validator-commit <7-40 hex> --validator-report-out <report.md> --out <map.md> [--review-packet-out <packet.md>]',
  'Builds a Gate 4 independent security review validator report and prerequisite map from a guarded Markdown target.',
  'Optional --review-packet-out writes an external-review packet with exact reviewer questions and claim-boundary bindings.',
  'The command reads only the provided guarded Markdown evidence target and writes outputs inside the bridge repository.',
  'It does not read private deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, sign, submit, deploy, publish, approve audit findings, close accepted risks, or broadcast transactions.',
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
const validation = read.errors.length > 0 ? undefined : validateSecurityReviewEvidence(read.markdown);
const validationReport = buildSecurityReviewValidationReport({
  command: `npm run security:validate -- ${candidate} --report-out <report.md>`,
  workingDirectory: 'ergo-sidechain-bridge/relayer',
  validatedTarget: candidate,
  readErrors: read.errors,
  validation,
});
const prerequisiteMap = buildSecurityReviewPrerequisiteMap({
  validatorCommit,
  candidateTarget: read.label,
  validatorReportTarget: validatorReportOut,
  command: buildCommand({ candidate, validatorCommit }),
  validationReport,
  validation,
  readErrors: read.errors,
});
const reviewPacket = args.reviewPacketOut
  ? buildSecurityReviewExternalReviewPacket({
      prerequisiteMap,
      prerequisiteMapTarget: out,
      command: buildCommand({ candidate, validatorCommit, reviewPacket: true }),
    })
  : undefined;

writeMarkdown(
  validatorReportOutput,
  formatSecurityReviewValidationReportMarkdown(validationReport),
  '--validator-report-out',
);
writeMarkdown(mapOutput, formatSecurityReviewPrerequisiteMapMarkdown(prerequisiteMap), '--out');
if (reviewPacket && reviewPacketOutput) {
  writeMarkdown(
    reviewPacketOutput,
    formatSecurityReviewExternalReviewPacketMarkdown(reviewPacket),
    '--review-packet-out',
  );
}

console.log(`Security review validation report written: ${validatorReportOut}`);
console.log(`Security review prerequisite map written: ${out}`);
if (args.reviewPacketOut) console.log(`Security review external review packet written: ${args.reviewPacketOut}`);
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
    'npm run security:prerequisite-map --',
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
