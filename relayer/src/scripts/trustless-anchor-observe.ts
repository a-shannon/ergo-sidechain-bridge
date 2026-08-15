import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath, type ResolvedEvidenceOutputPath } from '../evidence-output-path.js';
import {
  resolveEvidenceJsonOutputPath,
  type ResolvedEvidenceJsonOutputPath,
} from '../evidence-json-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  formatTrustlessAnchorObservationReportMarkdown,
  observeTrustlessAnchor,
  parseTrustlessAnchorObservationJson,
} from '../trustless-anchor-observation.js';

interface CliArgs {
  bridgeEventRootHex?: string;
  observationsJson?: string;
  minHeight?: number;
  maxHeight?: number;
  observedAt?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--bridge-event-root') {
      args.bridgeEventRootHex = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--observations-json') {
      args.observationsJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--min-height') {
      args.minHeight = parseHeight(requireValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === '--max-height') {
      args.maxHeight = parseHeight(requireValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === '--observed-at') {
      args.observedAt = requireValue(argv, index, arg);
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

function parseHeight(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${option} must be a non-negative safe integer`);
  }
  return parsed;
}

function usage(): void {
  console.error([
    'Usage: npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <observations.json> --min-height <n> --max-height <n> [--observed-at <iso>] [--out <report.md>]',
    '       npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <observations.json> --min-height <n> --max-height <n> --json-out <report.json>',
    'Reads a sanitized public extension-observation JSON file and checks whether a matching 0x0401 bridgeEventRoot is present in the requested height window.',
    'The observations JSON shape is: { "heights": [{ "height": 123, "fields": [{ "key": "0401", "value": "<64hex>", "headerId": "<64hex>" }] }] }.',
    'This command does not read deployment state, runtime databases, environment files, wallet material, sign, submit, deploy, broadcast, or authorize release claims.',
  ].join('\n'));
}

function buildCommand(args: Required<Pick<
  CliArgs,
  'bridgeEventRootHex' | 'observationsJson' | 'minHeight' | 'maxHeight' | 'observedAt'
>> & Pick<CliArgs, 'out' | 'jsonOut'>): string {
  const parts = [
    'npm run trustless:anchor-observe --',
    '--bridge-event-root',
    args.bridgeEventRootHex,
    '--observations-json',
    args.observationsJson,
    '--min-height',
    String(args.minHeight),
    '--max-height',
    String(args.maxHeight),
    '--observed-at',
    args.observedAt,
  ];
  if (args.out) parts.push('--out', args.out);
  if (args.jsonOut) parts.push('--json-out', args.jsonOut);
  return parts.join(' ');
}

function resolveReportOutput(out: string | undefined): ResolvedEvidenceOutputPath | undefined {
  if (!out) return undefined;
  return resolveEvidenceOutputPath(out);
}

function resolveJsonReportOutput(jsonOut: string | undefined): ResolvedEvidenceJsonOutputPath | undefined {
  if (!jsonOut) return undefined;
  return resolveEvidenceJsonOutputPath(jsonOut);
}

function writeReport(
  out: string | undefined,
  resolved: ResolvedEvidenceOutputPath | undefined,
  markdown: string,
): void {
  if (!out) return;
  if (!resolved) {
    console.error('--out could not be resolved');
    process.exit(1);
  }
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, `${markdown.trimEnd()}\n`, { encoding: 'utf8', flag: 'wx' });
}

function writeJsonReport(
  jsonOut: string | undefined,
  resolved: ResolvedEvidenceJsonOutputPath | undefined,
  report: unknown,
): void {
  if (!jsonOut) return;
  if (!resolved) {
    console.error('--json-out could not be resolved');
    process.exit(1);
  }
  if (resolved.errors.length > 0) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  const output = writeOfflineReportJson(jsonOut, report);
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  console.log(formatOfflineReportJsonWriteLine('trustless anchor observation JSON report', jsonOut));
}

async function main(): Promise<void> {
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

  if (!args.bridgeEventRootHex) {
    console.error('--bridge-event-root requires a bridge event root.');
    usage();
    process.exit(1);
  }
  if (!args.observationsJson) {
    console.error('--observations-json requires a sanitized JSON evidence target.');
    usage();
    process.exit(1);
  }
  if (args.minHeight === undefined) {
    console.error('--min-height is required.');
    usage();
    process.exit(1);
  }
  if (args.maxHeight === undefined) {
    console.error('--max-height is required.');
    usage();
    process.exit(1);
  }

  const observedAt = args.observedAt ?? new Date().toISOString();
  const reportOutput = resolveReportOutput(args.out);
  if (reportOutput && reportOutput.errors.length > 0) {
    for (const error of reportOutput.errors) console.error(error);
    process.exit(1);
  }
  const jsonReportOutput = resolveJsonReportOutput(args.jsonOut);
  if (jsonReportOutput && jsonReportOutput.errors.length > 0) {
    for (const error of jsonReportOutput.errors) console.error(error);
    process.exit(1);
  }

  const requiredArgs = {
    bridgeEventRootHex: args.bridgeEventRootHex,
    observationsJson: args.observationsJson,
    minHeight: args.minHeight,
    maxHeight: args.maxHeight,
    observedAt,
    out: args.out,
    jsonOut: args.jsonOut,
  };

  const read = readEvidenceJsonTarget(args.observationsJson, '--observations-json');
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }

  const parsed = parseTrustlessAnchorObservationJson(read.json);
  if (parsed.errors.length > 0 || !parsed.provider) {
    for (const error of parsed.errors) console.error(error);
    process.exit(1);
  }

  const command = buildCommand(requiredArgs);
  const report = await observeTrustlessAnchor({
    ...parsed.provider,
    bridgeEventRootHex: args.bridgeEventRootHex,
    minHeight: args.minHeight,
    maxHeight: args.maxHeight,
    observedAt,
    commandLine: command,
    workingDirectory: 'ergo-sidechain-bridge/relayer',
  });
  const markdown = formatTrustlessAnchorObservationReportMarkdown(report);
  console.log(markdown);
  writeReport(args.out, reportOutput, markdown);
  writeJsonReport(args.jsonOut, jsonReportOutput, report);
  process.exitCode = report.status === 'LINKED' ? 0 : 1;
}

main().catch((error: any) => {
  console.error(error?.message ?? String(error));
  process.exit(1);
});
