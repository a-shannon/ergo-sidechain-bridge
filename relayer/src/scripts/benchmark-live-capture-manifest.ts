import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import {
  buildBenchmarkLiveCaptureManifest,
  formatBenchmarkLiveCaptureManifestMarkdown,
} from '../benchmark-live-capture-manifest.js';
import { resolveEvidenceOutputPath, type ResolvedEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

interface CliArgs {
  sourceCommit?: string;
  prerequisiteMap?: string;
  reviewPacket?: string;
  readinessRequest?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

const usage = [
  'Usage: npm run benchmark:live-capture-manifest -- --source-commit <7-40 hex> --prerequisite-map <map.md> --review-packet <packet.md> [--readiness-request <request.md>] --out <manifest.md>',
  'Builds a blocked Gate 7 benchmark capture manifest from existing guarded planning packets.',
  'The manifest records the legacy V1 settlement quarantine and emits no live submit command.',
  'The command reads only the provided guarded Markdown targets and writes one manifest inside the bridge repository.',
  'It does not read private deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, sign, submit, deploy, reconcile, broadcast, close Gate 7, or authorize release claims.',
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
const reviewPacket = requireArg(args.reviewPacket, '--review-packet');
const out = requireArg(args.out, '--out');

if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
  console.error('--source-commit must be a 7-40 character hex commit identifier.');
  process.exit(1);
}

const manifestOutput = resolveOutput(out, '--out');
const prerequisiteRead = readRequiredMarkdown(prerequisiteMap, '--prerequisite-map');
const reviewRead = readRequiredMarkdown(reviewPacket, '--review-packet');
if (args.readinessRequest) {
  readRequiredMarkdown(args.readinessRequest, '--readiness-request');
}

const command = buildCommand({
  sourceCommit,
  prerequisiteMap,
  reviewPacket,
  readinessRequest: args.readinessRequest,
  out,
});
const manifest = buildBenchmarkLiveCaptureManifest({
  sourceCommit,
  prerequisiteMapTarget: prerequisiteMap,
  prerequisiteMapMarkdown: prerequisiteRead,
  reviewPacketTarget: reviewPacket,
  reviewPacketMarkdown: reviewRead,
  readinessRequestTarget: args.readinessRequest,
  command,
});

writeMarkdown(manifestOutput, formatBenchmarkLiveCaptureManifestMarkdown(manifest), '--out');
console.log(`Gate 7 blocked benchmark capture manifest written: ${out}`);
console.log(`Prerequisite result: ${manifest.prerequisiteResult}`);
console.log(`Prerequisite structural issues: ${manifest.prerequisiteStructuralIssues}`);
console.log('Boundary: legacy V1 settlement remains quarantined; no private deployment state, runtime database, environment file, wallet material, node/RPC request, signing, submit command, deploy, reconcile, broadcast, Gate 7 closure, or release-claim authorization was used.');

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
    if (arg === '--review-packet') {
      args.reviewPacket = readValue(argv, index, arg, args.errors);
      index += 1;
      continue;
    }
    if (arg === '--readiness-request') {
      args.readinessRequest = readValue(argv, index, arg, args.errors);
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
  reviewPacket: string;
  readinessRequest?: string;
  out: string;
}): string {
  const parts = [
    'npm run benchmark:live-capture-manifest --',
    '--source-commit',
    options.sourceCommit,
    '--prerequisite-map',
    options.prerequisiteMap,
    '--review-packet',
    options.reviewPacket,
  ];
  if (options.readinessRequest) {
    parts.push('--readiness-request', options.readinessRequest);
  }
  parts.push('--out', options.out);
  return parts.join(' ');
}
