import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';

import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildLocalDevnetExecutionRequestCommand,
  buildLocalDevnetExecutionRequestReport,
  formatLocalDevnetExecutionRequestMarkdown,
  validatePatchedDevnetPlanJsonReport,
  validateLocalDevnetExecutionRequestReportJson,
  validateSignerFundingDefaultsMarkdown,
  type PatchedDevnetPlanJsonReport,
} from '../local-devnet-execution-request.js';
import { validateGoNoGoJsonReport, type GoNoGoReportValidation } from '../patched-devnet-go-no-go.js';

interface CliArgs {
  sourceCommit?: string;
  captureManifest?: string;
  goNoGoJson?: string;
  goNoGoValidation?: string;
  planJson?: string;
  signerFundingDefaults?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

const usage = [
  'Usage: npm run rehearsal:local-devnet-request -- --source-commit <7-40 hex> --capture-manifest <manifest.md> --go-no-go-json <report.json> --go-no-go-validation <validation.md> [--plan-json <patched-devnet-plan.json>] --signer-funding-defaults <defaults.md> [--out <request.md>] [--json-out <request.json>]',
  'Builds the next local-devnet operator execution request from the current Gate 3 capture manifest, safe patched-devnet go/no-go evidence, optional patched-devnet plan JSON, and no-secret signer/funding defaults.',
  'The command reads only guarded Markdown/JSON evidence targets. It does not read .env files, mnemonics, node config secrets, runtime databases, private deployment state, or execute node/RPC probes.',
  'Boundary: request output is not Gate 3 closure, not signing or broadcast authorization, not release-gate PASS, and not a production-ready claim.',
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
const goNoGoJson = requireArg(args.goNoGoJson, '--go-no-go-json');
const goNoGoValidation = requireArg(args.goNoGoValidation, '--go-no-go-validation');
const signerFundingDefaults = requireArg(args.signerFundingDefaults, '--signer-funding-defaults');

if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  console.error('--source-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const captureRead = readRequiredMarkdown(captureManifest, '--capture-manifest');
const goNoGoReport = readRequiredGoNoGoReport(goNoGoJson);
const validationRead = readRequiredMarkdown(goNoGoValidation, '--go-no-go-validation');
const validationErrors = validateGoNoGoValidationMarkdown(validationRead.markdown, goNoGoJson, goNoGoReport);
if (validationErrors.length > 0) {
  for (const error of validationErrors) console.error(error);
  process.exit(1);
}
const planJsonReport = args.planJson ? readRequiredPatchedDevnetPlanReport(args.planJson) : undefined;
const signerFundingDefaultsRead = readSignerFundingDefaultsMarkdown(signerFundingDefaults);
const signerFundingDefaultsErrors = validateSignerFundingDefaultsMarkdown(
  signerFundingDefaultsRead.markdown,
  signerFundingDefaults,
);
if (signerFundingDefaultsErrors.length > 0) {
  for (const error of signerFundingDefaultsErrors) console.error(error);
  process.exit(1);
}

const command = buildLocalDevnetExecutionRequestCommand({
  sourceCommit,
  captureManifest,
  goNoGoJson,
  goNoGoValidation,
  planJson: args.planJson,
  signerFundingDefaults,
  out: args.out,
  jsonOut: args.jsonOut,
});
const report = buildLocalDevnetExecutionRequestReport({
  sourceCommit,
  captureManifestTarget: captureManifest,
  captureManifestMarkdown: captureRead.markdown,
  goNoGoJsonTarget: goNoGoJson,
  goNoGoValidationTarget: goNoGoValidation,
  goNoGoValidation: goNoGoReport,
  planJsonTarget: args.planJson,
  planJsonReport,
  signerFundingDefaultsTarget: signerFundingDefaults,
  signerFundingDefaultsMarkdown: signerFundingDefaultsRead.markdown,
  command,
});
const reportErrors = validateLocalDevnetExecutionRequestReportJson(report);
if (reportErrors.length > 0) {
  for (const error of reportErrors) console.error(error);
  process.exit(1);
}

const markdown = formatLocalDevnetExecutionRequestMarkdown(report);
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
    if (arg === '--go-no-go-json') {
      args.goNoGoJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--go-no-go-validation') {
      args.goNoGoValidation = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--plan-json') {
      args.planJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--signer-funding-defaults') {
      args.signerFundingDefaults = requireValue(argv, index, arg);
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

function readSignerFundingDefaultsMarkdown(target: string): { markdown: string } {
  const trimmedTarget = target.trim();
  const label = '<signer/funding defaults evidence>';
  const normalized = trimmedTarget.replace(/\\/g, '/').toLowerCase();
  const name = basename(normalized);
  const errors: string[] = [];

  if (trimmedTarget.length === 0) {
    errors.push(`${label}: --signer-funding-defaults is required`);
  }
  if (extname(name) !== '.md') {
    errors.push(`${label}: --signer-funding-defaults must be a Markdown evidence file`);
  }
  if (!/^gate3-devnet-signer-funding-no-secret-defaults-\d{4}-\d{2}-\d{2}-[0-9a-f]{7,40}\.md$/i.test(name)) {
    errors.push(`${label}: --signer-funding-defaults must be a Gate 3 signer/funding no-secret defaults evidence file`);
  }
  if (!normalized.startsWith('../evidence/rehearsal/')) {
    errors.push(`${label}: --signer-funding-defaults must live under ../evidence/rehearsal/`);
  }
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('/') || /^file:\/\/\//i.test(normalized)) {
    errors.push(`${label}: refusing local absolute signer/funding defaults target`);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^file:\/\/\//i.test(normalized)) {
    errors.push(`${label}: refusing URI signer/funding defaults target`);
  }
  if (escapesBridgeRoot(normalized)) {
    errors.push(`${label}: --signer-funding-defaults must resolve inside the bridge repository`);
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const rehearsalRoot = realpathSync(resolve(process.cwd(), '../evidence/rehearsal'));
    const evidencePath = realpathSync(resolve(process.cwd(), trimmedTarget));
    if (!isInsidePath(evidencePath, bridgeRoot)) {
      console.error(`${label}: --signer-funding-defaults must resolve inside the bridge repository`);
      process.exit(1);
    }
    if (!isInsidePath(evidencePath, rehearsalRoot)) {
      console.error(`${label}: --signer-funding-defaults must resolve inside ../evidence/rehearsal/`);
      process.exit(1);
    }
    return { markdown: readFileSync(evidencePath, 'utf8') };
  } catch {
    console.error(`${label}: signer/funding defaults evidence file could not be read`);
    process.exit(1);
  }
}

function readRequiredPatchedDevnetPlanReport(target: string): PatchedDevnetPlanJsonReport {
  const jsonRead = readEvidenceJsonTarget(target, '--plan-json');
  if (jsonRead.errors.length > 0) {
    for (const error of jsonRead.errors) console.error(error);
    process.exit(1);
  }
  const errors = validatePatchedDevnetPlanJsonReport(jsonRead.json);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  return jsonRead.json as PatchedDevnetPlanJsonReport;
}

function readRequiredGoNoGoReport(target: string): GoNoGoReportValidation {
  const jsonRead = readEvidenceJsonTarget(target, '--go-no-go-json');
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
  return validation;
}

function validateGoNoGoValidationMarkdown(
  markdown: string,
  jsonTarget: string,
  validation: GoNoGoReportValidation,
): string[] {
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
  return requiredSnippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `--go-no-go-validation must include ${snippet}`);
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
  console.log(formatOfflineReportJsonWriteLine('local-devnet execution request JSON report', jsonOut));
}

function escapesBridgeRoot(normalized: string): boolean {
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('/') || /^file:\/\/\//i.test(normalized)) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false;

  let depthFromRelayer = 0;
  const parts = normalized.split('/').filter(part => part.length > 0 && part !== '.');
  for (const part of parts) {
    if (part === '..') {
      depthFromRelayer -= 1;
    } else {
      depthFromRelayer += 1;
    }
    if (depthFromRelayer < -1) return true;
  }
  return false;
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
