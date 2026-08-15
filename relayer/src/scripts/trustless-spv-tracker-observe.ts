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
  buildSpvTrackerObservationInput,
  formatSpvTrackerObservationReportMarkdown,
  observeTrustlessSpvTracker,
  parseSpvTrackerObservationJson,
} from '../spv-tracker-observation.js';

interface CliArgs {
  observationJson?: string;
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
    if (arg === '--observation-json') {
      args.observationJson = requireValue(argv, index, arg);
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

function usage(): void {
  console.error([
    'Usage: npm run trustless:spv-tracker-observe -- --observation-json <observation.json> [--observed-at <iso>] [--out <report.md>]',
    '       npm run trustless:spv-tracker-observe -- --observation-json <observation.json> [--observed-at <iso>] --json-out <report.json>',
    'Reads a sanitized public SPV tracker observation JSON file and checks whether the expected tracker key/value is bound to the observed tracker digest.',
    'The observation JSON shape is: { "trackerDigestHex": "<33-byte hex>", "expectedEntry": { "sidechainIdHex": "<64hex>", "sidechainHeight": 123, "sidechainHeaderHashHex": "<64hex>", "bridgeEventRootHex": "<64hex>", "ergoAnchorHeight": 456 }, "sidechainFinality": { "finalityRule": "<rule>", "sidechainBlockHeight": 123, "observedSidechainHeight": 135, "requiredConfirmations": 12 }, "history": [{ "key": "<64hex>", "value": "<72hex>" }] }.',
    'This command does not read deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, sign, submit, deploy, broadcast, or authorize release claims.',
  ].join('\n'));
}

function buildCommand(args: Required<Pick<CliArgs, 'observationJson' | 'observedAt'>> & Pick<CliArgs, 'out' | 'jsonOut'>): string {
  const parts = [
    'npm run trustless:spv-tracker-observe --',
    '--observation-json',
    args.observationJson,
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
  console.log(formatOfflineReportJsonWriteLine('SPV tracker observation JSON report', jsonOut));
}

function main(): void {
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

  if (!args.observationJson) {
    console.error('--observation-json requires a sanitized JSON evidence target.');
    usage();
    process.exit(1);
  }

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

  const read = readEvidenceJsonTarget(args.observationJson, '--observation-json');
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }

  const parsed = parseSpvTrackerObservationJson(read.json);
  if (parsed.errors.length > 0 || !parsed.input) {
    for (const error of parsed.errors) console.error(error);
    process.exit(1);
  }

  const observedAt = args.observedAt ?? parsed.input.observedAt;
  const commandLine = buildCommand({
    observationJson: args.observationJson,
    observedAt,
    out: args.out,
    jsonOut: args.jsonOut,
  });
  const report = observeTrustlessSpvTracker(buildSpvTrackerObservationInput(parsed.input, {
    observedAt,
    commandLine,
    workingDirectory: 'ergo-sidechain-bridge/relayer',
  }));
  const markdown = formatSpvTrackerObservationReportMarkdown(report);
  console.log(markdown);
  writeReport(args.out, reportOutput, markdown);
  writeJsonReport(args.jsonOut, jsonReportOutput, report);
  process.exitCode = report.status === 'LINKED' ? 0 : 1;
}

main();
