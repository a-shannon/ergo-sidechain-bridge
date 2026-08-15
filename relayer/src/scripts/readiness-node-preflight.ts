import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildReadinessNodePreflightCommand,
  formatReadinessNodePreflightReportMarkdown,
  runReadinessNodePreflight,
} from '../readiness-node-preflight.js';

interface CliArgs {
  nodeUrl?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
  explicitNodeUrl: boolean;
}

const DEFAULT_NODE_URL = 'http://127.0.0.1:9052';

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, explicitNodeUrl: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--node-url') {
      args.nodeUrl = requireValue(argv, index, arg);
      args.explicitNodeUrl = true;
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

function usage(): void {
  console.error([
    'Usage: npm run readiness:node-preflight -- [--node-url <http://...>] [--out <report.md>] [--json-out <report.json>]',
    'Checks whether a non-mainnet Ergo node supports the node-backed evidence prerequisites used by bridge readiness commands.',
    'Defaults to ERGO_NODE, then http://127.0.0.1:9052. This command does not read ERGO_API_KEY and does not send auth headers.',
  ].join('\n'));
}

function writeReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, markdown, { encoding: 'utf8', flag: 'wx' });
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error: any) {
  console.error(error?.message ?? String(error));
  usage();
  process.exit(1);
}

if (args.help) {
  usage();
  process.exit(0);
}

const nodeUrl = args.nodeUrl ?? process.env.ERGO_NODE ?? DEFAULT_NODE_URL;
const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}
const command = buildReadinessNodePreflightCommand({
  nodeUrl,
  explicitNodeUrl: args.explicitNodeUrl,
  out: args.out,
  jsonOut: args.jsonOut,
});
const report = await runReadinessNodePreflight({ command, nodeUrl });
const markdown = formatReadinessNodePreflightReportMarkdown(report);
console.log(markdown);
writeReport(args.out, markdown);
writeJsonReport(args.jsonOut, report);
process.exitCode = report.exitCode;

function writeJsonReport(jsonOut: string | undefined, report: unknown): void {
  if (!jsonOut) return;
  const output = writeOfflineReportJson(jsonOut, report);
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  console.log(formatOfflineReportJsonWriteLine('node preflight JSON report', jsonOut));
}
