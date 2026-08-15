import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { resolveEvidenceOutputPath, type ResolvedEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import { validateGoNoGoJsonReport, type GoNoGoReportValidation } from '../patched-devnet-go-no-go.js';
import {
  buildRehearsalCaptureManifest,
  formatRehearsalCaptureManifestMarkdown,
} from '../rehearsal-capture-manifest.js';

interface CliArgs {
  sourceCommit?: string;
  prerequisiteMap?: string;
  operatorPacket?: string;
  liveTemplate?: string;
  operatorRunbook?: string;
  readinessRequest?: string;
  patchedDevnetGoNoGoJson?: string;
  patchedDevnetGoNoGoValidation?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

const usage = [
  'Usage: npm run rehearsal:capture-manifest -- --source-commit <7-40 hex> --prerequisite-map <map.md> --operator-packet <packet.md> --live-template <template.md> --operator-runbook <runbook.md> [--readiness-request <request.md>] [--patched-devnet-go-no-go-json <report.json> --patched-devnet-go-no-go-validation <validation.md>] --out <manifest.md>',
  'Builds a Gate 3 live rehearsal capture manifest from existing guarded planning packets.',
  'The command reads only the provided guarded Markdown/JSON targets and writes one manifest inside the bridge repository.',
  'It does not read private deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, sign, submit, deploy, reconcile, broadcast, close Gate 3, or authorize release claims.',
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

const sourceCommit = requireArg(args.sourceCommit, '--source-commit');
const prerequisiteMap = requireArg(args.prerequisiteMap, '--prerequisite-map');
const operatorPacket = requireArg(args.operatorPacket, '--operator-packet');
const liveTemplate = requireArg(args.liveTemplate, '--live-template');
const operatorRunbook = requireArg(args.operatorRunbook, '--operator-runbook');
const out = requireArg(args.out, '--out');

if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  console.error('--source-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}
if (Boolean(args.patchedDevnetGoNoGoJson) !== Boolean(args.patchedDevnetGoNoGoValidation)) {
  console.error('--patched-devnet-go-no-go-json and --patched-devnet-go-no-go-validation must be provided together.');
  process.exit(1);
}

const manifestOutput = resolveOutput(out, '--out');
const prerequisiteRead = readRequiredMarkdown(prerequisiteMap, '--prerequisite-map');
const operatorRead = readRequiredMarkdown(operatorPacket, '--operator-packet');
readRequiredMarkdown(liveTemplate, '--live-template');
readRequiredMarkdown(operatorRunbook, '--operator-runbook');
if (args.readinessRequest) {
  readRequiredMarkdown(args.readinessRequest, '--readiness-request');
}
const patchedDevnetGoNoGo = readPatchedDevnetGoNoGoBinding(args);

const command = buildCommand({
  sourceCommit,
  prerequisiteMap,
  operatorPacket,
  liveTemplate,
  operatorRunbook,
  readinessRequest: args.readinessRequest,
  patchedDevnetGoNoGoJson: args.patchedDevnetGoNoGoJson,
  patchedDevnetGoNoGoValidation: args.patchedDevnetGoNoGoValidation,
  out,
});
const manifest = buildRehearsalCaptureManifest({
  sourceCommit,
  prerequisiteMapTarget: prerequisiteMap,
  prerequisiteMapMarkdown: prerequisiteRead,
  operatorPacketTarget: operatorPacket,
  operatorPacketMarkdown: operatorRead,
  liveTemplateTarget: liveTemplate,
  operatorRunbookTarget: operatorRunbook,
  readinessRequestTarget: args.readinessRequest,
  patchedDevnetGoNoGoJsonTarget: args.patchedDevnetGoNoGoJson,
  patchedDevnetGoNoGoValidationTarget: args.patchedDevnetGoNoGoValidation,
  patchedDevnetGoNoGoVerdict: patchedDevnetGoNoGo?.validation.report?.summary.verdict,
  patchedDevnetGoNoGoValidationMessage: patchedDevnetGoNoGo?.validation.message,
  command,
});

writeMarkdown(manifestOutput, formatRehearsalCaptureManifestMarkdown(manifest), '--out');
console.log(`Gate 3 live rehearsal capture manifest written: ${out}`);
console.log(`Prerequisite result: ${manifest.prerequisiteResult}`);
console.log(`Prerequisite structural issues: ${manifest.prerequisiteStructuralIssues}`);
if (patchedDevnetGoNoGo?.validation.report) {
  console.log(`Patched-devnet go/no-go verdict: ${patchedDevnetGoNoGo.validation.report.summary.verdict}`);
}
console.log('Boundary: no private deployment state, runtime database, environment file, wallet material, node/RPC request, signing, submit, deploy, reconcile, broadcast, Gate 3 closure, or release-claim authorization was used.');

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, errors: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--source-commit') {
      args.sourceCommit = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--prerequisite-map') {
      args.prerequisiteMap = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--operator-packet') {
      args.operatorPacket = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--live-template') {
      args.liveTemplate = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--operator-runbook') {
      args.operatorRunbook = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--readiness-request') {
      args.readinessRequest = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--patched-devnet-go-no-go-json') {
      args.patchedDevnetGoNoGoJson = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--patched-devnet-go-no-go-validation') {
      args.patchedDevnetGoNoGoValidation = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = readValue(argv, index, arg, args.errors);
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

function readRequiredMarkdown(target: string, optionName: string): string {
  const read = readEvidenceMarkdownTarget(target);
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(`${optionName} ${error}`);
    process.exit(1);
  }
  return read.markdown;
}

function readPatchedDevnetGoNoGoBinding(args: CliArgs): { validation: GoNoGoReportValidation } | undefined {
  if (!args.patchedDevnetGoNoGoJson || !args.patchedDevnetGoNoGoValidation) return undefined;

  const jsonRead = readEvidenceJsonTarget(args.patchedDevnetGoNoGoJson, '--patched-devnet-go-no-go-json');
  if (jsonRead.errors.length > 0) {
    for (const error of jsonRead.errors) console.error(error);
    process.exit(1);
  }

  const validation = validateGoNoGoJsonReport(jsonRead.json);
  if (validation.status !== 'PASS') {
    console.error(validation.message);
    for (const error of validation.errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const validationMarkdown = readRequiredMarkdown(
    args.patchedDevnetGoNoGoValidation,
    '--patched-devnet-go-no-go-validation',
  );
  const validationErrors = validateGoNoGoValidationMarkdown(
    validationMarkdown,
    args.patchedDevnetGoNoGoJson,
    validation,
  );
  if (validationErrors.length > 0) {
    for (const error of validationErrors) console.error(error);
    process.exit(1);
  }

  return { validation };
}

function validateGoNoGoValidationMarkdown(
  markdown: string,
  jsonTarget: string,
  validation: GoNoGoReportValidation,
): string[] {
  const errors: string[] = [];
  const verdict = validation.report?.summary.verdict;
  const requiredSnippets = [
    jsonTarget,
    'PASS go/no-go prerequisite report',
    verdict ? `verdict=${verdict}` : undefined,
    'not Gate 3 closure',
    'not broadcast authorization',
    'Validation status: PASS',
    'Does not close Gate 3',
    'Does not authorize transaction broadcast',
  ].filter((value): value is string => Boolean(value));

  for (const snippet of requiredSnippets) {
    if (!markdown.includes(snippet)) {
      errors.push(`--patched-devnet-go-no-go-validation must include ${snippet}`);
    }
  }

  return errors;
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
  sourceCommit: string;
  prerequisiteMap: string;
  operatorPacket: string;
  liveTemplate: string;
  operatorRunbook: string;
  readinessRequest?: string;
  patchedDevnetGoNoGoJson?: string;
  patchedDevnetGoNoGoValidation?: string;
  out: string;
}): string {
  const parts = [
    'npm run rehearsal:capture-manifest --',
    '--source-commit',
    options.sourceCommit,
    '--prerequisite-map',
    options.prerequisiteMap,
    '--operator-packet',
    options.operatorPacket,
    '--live-template',
    options.liveTemplate,
    '--operator-runbook',
    options.operatorRunbook,
  ];
  if (options.readinessRequest) {
    parts.push('--readiness-request', options.readinessRequest);
  }
  if (options.patchedDevnetGoNoGoJson && options.patchedDevnetGoNoGoValidation) {
    parts.push(
      '--patched-devnet-go-no-go-json',
      options.patchedDevnetGoNoGoJson,
      '--patched-devnet-go-no-go-validation',
      options.patchedDevnetGoNoGoValidation,
    );
  }
  parts.push('--out', options.out);
  return parts.join(' ');
}
