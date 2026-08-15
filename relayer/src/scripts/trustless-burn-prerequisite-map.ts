import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { resolveEvidenceOutputPath, type ResolvedEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import {
  buildTrustlessBurnValidationReport,
  formatTrustlessBurnValidationReportMarkdown,
} from '../trustless-burn-evidence-report.js';
import { validateTrustlessBurnEvidence } from '../trustless-burn-evidence.js';
import {
  buildTrustlessBurnOperatorPacket,
  formatTrustlessBurnOperatorPacketMarkdown,
} from '../trustless-burn-operator-packet.js';
import {
  buildTrustlessBurnPrerequisiteMap,
  formatTrustlessBurnPrerequisiteMapMarkdown,
} from '../trustless-burn-prerequisite-map.js';

interface CliArgs {
  candidate?: string;
  validatorCommit?: string;
  validatorReportOut?: string;
  out?: string;
  operatorPacketOut?: string;
  help: boolean;
  errors: string[];
}

const usage = [
  'Usage: npm run trustless:prerequisite-map -- --candidate <trustless-burn-evidence.md> --validator-commit <7-40 hex> --validator-report-out <report.md> --out <map.md> [--operator-packet-out <packet.md>]',
  'Builds a Gate 5 trustless-burn validator report and prerequisite map from a guarded Markdown target.',
  'Optional --operator-packet-out writes an operator packet with exact proof-path, aggregate prebroadcast, observation, review, and claim-boundary inputs.',
  'The command reads only the provided guarded Markdown evidence target and writes outputs inside the bridge repository.',
  'It does not read private deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, sign, submit, deploy, reconcile, publish, close Gate 5, or broadcast transactions.',
];

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(usage.join('\n'));
  process.exit(0);
}

if (args.errors.length > 0) {
  for (const error of args.errors) console.error(error);
  console.error(usage.join('\n'));
  process.exit(1);
}

const candidate = requireArg(args.candidate, '--candidate');
const validatorCommit = requireArg(args.validatorCommit, '--validator-commit');
const validatorReportOut = requireArg(args.validatorReportOut, '--validator-report-out');
const out = requireArg(args.out, '--out');
const validatorReportOutput = resolveOutput(validatorReportOut, '--validator-report-out');
const mapOutput = resolveOutput(out, '--out');
const operatorPacketOutput = args.operatorPacketOut
  ? resolveOutput(args.operatorPacketOut, '--operator-packet-out')
  : undefined;

if (!/^[0-9a-f]{7,40}$/i.test(validatorCommit)) {
  console.error('--validator-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const read = readEvidenceMarkdownTarget(candidate);
let validation = undefined;
const cliErrors: string[] = [];
if (read.errors.length === 0) {
  try {
    validation = validateTrustlessBurnEvidence(read.markdown);
  } catch (error: any) {
    cliErrors.push(error?.message ?? String(error));
  }
}
const command = buildCommand({ candidate, validatorCommit });
const validationReport = buildTrustlessBurnValidationReport({
  command: `npm run trustless:validate -- ${candidate} --report-out <report.md>`,
  workingDirectory: 'ergo-sidechain-bridge/relayer',
  validatedTarget: candidate,
  readErrors: read.errors,
  validation,
  cliErrors,
});
const prerequisiteMap = buildTrustlessBurnPrerequisiteMap({
  validatorCommit,
  candidateTarget: candidate,
  validatorReportTarget: validatorReportOut,
  command,
  validationReport,
  validation,
  readErrors: read.errors,
  cliErrors,
});
const operatorPacket = args.operatorPacketOut
  ? buildTrustlessBurnOperatorPacket({
      prerequisiteMap,
      prerequisiteMapTarget: out,
      command: buildCommand({ candidate, validatorCommit, operatorPacket: true }),
    })
  : undefined;

writeMarkdown(validatorReportOutput, formatTrustlessBurnValidationReportMarkdown(validationReport), '--validator-report-out');
writeMarkdown(mapOutput, formatTrustlessBurnPrerequisiteMapMarkdown(prerequisiteMap), '--out');
if (operatorPacket && operatorPacketOutput) {
  writeMarkdown(
    operatorPacketOutput,
    formatTrustlessBurnOperatorPacketMarkdown(operatorPacket),
    '--operator-packet-out',
  );
}

console.log(`Trustless burn validation report written: ${validatorReportOut}`);
console.log(`Trustless burn prerequisite map written: ${out}`);
if (args.operatorPacketOut) console.log(`Trustless burn operator packet written: ${args.operatorPacketOut}`);
console.log(`Result: ${prerequisiteMap.result}`);
console.log(`Structural issues: ${prerequisiteMap.structuralIssues}`);

if (validationReport.result === 'BLOCKED') {
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
    if (arg === '--operator-packet-out') {
      args.operatorPacketOut = readValue(argv, index, arg, args.errors);
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
    console.error(`${optionName} could not be resolved.`);
    process.exit(1);
  }
  mkdirSync(dirname(output.path), { recursive: true });
  writeFileSync(output.path, `${markdown.trimEnd()}\n`, { encoding: 'utf8', flag: 'wx' });
}

function buildCommand(options: {
  candidate: string;
  validatorCommit: string;
  operatorPacket?: boolean;
}): string {
  const parts = [
    'npm run trustless:prerequisite-map --',
    '--candidate',
    options.candidate,
    '--validator-commit',
    options.validatorCommit,
    '--validator-report-out',
    '<report.md>',
    '--out',
    '<map.md>',
  ];
  if (options.operatorPacket) {
    parts.push('--operator-packet-out', '<packet.md>');
  }
  return parts.join(' ');
}
