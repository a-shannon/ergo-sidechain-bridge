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
  formatTrustlessObservationReconciliationMarkdown,
  reconcileTrustlessObservationReports,
} from '../trustless-observation-reconciliation.js';

interface CliArgs {
  anchorReportJson?: string;
  spvTrackerReportJson?: string;
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
    if (arg === '--anchor-report-json') {
      args.anchorReportJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--spv-tracker-report-json') {
      args.spvTrackerReportJson = requireValue(argv, index, arg);
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
    'Usage: npm run trustless:observation-reconcile -- --anchor-report-json <anchor-report.json> --spv-tracker-report-json <spv-tracker-report.json> [--observed-at <iso>] [--out <report.md>]',
    '       npm run trustless:observation-reconcile -- --anchor-report-json <anchor-report.json> --spv-tracker-report-json <spv-tracker-report.json> [--observed-at <iso>] --json-out <report.json>',
    'Reads sanitized public trustless:anchor-observe and trustless:spv-tracker-observe JSON reports and checks that both bind the same bridgeEventRoot and ergoAnchorHeight.',
    'This command reuses existing JSON reports only; it does not read deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, sign, submit, deploy, broadcast, or authorize release claims.',
  ].join('\n'));
}

function buildCommand(args: Required<Pick<
  CliArgs,
  'anchorReportJson' | 'spvTrackerReportJson' | 'observedAt'
>> & Pick<CliArgs, 'out' | 'jsonOut'>): string {
  const parts = [
    'npm run trustless:observation-reconcile --',
    '--anchor-report-json',
    args.anchorReportJson,
    '--spv-tracker-report-json',
    args.spvTrackerReportJson,
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
  console.log(formatOfflineReportJsonWriteLine('trustless observation reconciliation JSON report', jsonOut));
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
  if (!args.anchorReportJson) {
    console.error('--anchor-report-json requires a sanitized trustless anchor observation report JSON target.');
    usage();
    process.exit(1);
  }
  if (!args.spvTrackerReportJson) {
    console.error('--spv-tracker-report-json requires a sanitized SPV tracker observation report JSON target.');
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

  const anchorRead = readEvidenceJsonTarget(args.anchorReportJson, '--anchor-report-json');
  if (anchorRead.errors.length > 0) {
    for (const error of anchorRead.errors) console.error(error);
    process.exit(1);
  }
  const spvRead = readEvidenceJsonTarget(args.spvTrackerReportJson, '--spv-tracker-report-json');
  if (spvRead.errors.length > 0) {
    for (const error of spvRead.errors) console.error(error);
    process.exit(1);
  }

  const observedAt = args.observedAt ?? new Date().toISOString();
  const commandLine = buildCommand({
    anchorReportJson: args.anchorReportJson,
    spvTrackerReportJson: args.spvTrackerReportJson,
    observedAt,
    out: args.out,
    jsonOut: args.jsonOut,
  });

  let report;
  try {
    report = reconcileTrustlessObservationReports({
      anchorObservationReportTarget: args.anchorReportJson,
      spvTrackerObservationReportTarget: args.spvTrackerReportJson,
      anchorObservationReport: anchorRead.json,
      spvTrackerObservationReport: spvRead.json,
      observedAt,
      commandLine,
      workingDirectory: 'ergo-sidechain-bridge/relayer',
    });
  } catch (error: any) {
    console.error(error?.message ?? String(error));
    process.exit(1);
  }

  const markdown = formatTrustlessObservationReconciliationMarkdown(report);
  console.log(markdown);
  writeReport(args.out, reportOutput, markdown);
  writeJsonReport(args.jsonOut, jsonReportOutput, report);
  process.exitCode = report.status === 'LINKED' ? 0 : 1;
}

main();
