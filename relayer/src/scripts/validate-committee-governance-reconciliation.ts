import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import {
  resolveEvidenceJsonOutputPath,
  type ResolvedEvidenceJsonOutputPath,
} from '../evidence-json-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { resolveEvidenceOutputPath, type ResolvedEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  COMMITTEE_GOVERNANCE_RECONCILE_COMMAND,
  formatCommitteeGovernanceReconciliationReportMarkdown,
  validateCommitteeGovernanceReconciliationJson,
} from '../committee-governance-reconciliation.js';

interface CliArgs {
  reconciliationJson?: string;
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
    if (arg === '--reconciliation-json') {
      args.reconciliationJson = requireValue(argv, index, arg);
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
    'Usage: npm run governance:reconcile:validate -- --reconciliation-json <sanitized-reconciliation.json> [--observed-at <iso>] [--out <report.md>] [--json-out <report.json>]',
    'Validates sanitized public Gate 6 committee governance reconciliation packets and wrong-network negative packets.',
    'Accepted kinds: deployment-state-reconciliation and wrong-network-negative.',
    'This command reads only the provided sanitized JSON evidence target. It does not read private deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, rotate keys, sign, submit, deploy, broadcast, or authorize release claims.',
  ].join('\n'));
}

function buildCommand(args: Required<Pick<CliArgs, 'reconciliationJson' | 'observedAt'>> & Pick<CliArgs, 'out' | 'jsonOut'>): string {
  const parts = [
    'npm run governance:reconcile:validate --',
    '--reconciliation-json',
    args.reconciliationJson,
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
  console.log(formatOfflineReportJsonWriteLine('committee governance reconciliation JSON report', jsonOut));
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

  if (!args.reconciliationJson) {
    console.error('--reconciliation-json requires a sanitized JSON evidence target.');
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

  const read = readEvidenceJsonTarget(args.reconciliationJson, '--reconciliation-json');
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }

  const commandLine = buildCommand({
    reconciliationJson: args.reconciliationJson,
    observedAt: args.observedAt ?? new Date().toISOString(),
    out: args.out,
    jsonOut: args.jsonOut,
  });
  const report = validateCommitteeGovernanceReconciliationJson(read.json, {
    commandLine,
    workingDirectory: 'ergo-sidechain-bridge/relayer',
  });
  const markdown = formatCommitteeGovernanceReconciliationReportMarkdown(report);
  console.log(markdown);
  writeReport(args.out, reportOutput, markdown);
  writeJsonReport(args.jsonOut, jsonReportOutput, report);
  process.exitCode = report.status === 'LINKED' ? 0 : 1;
}

void COMMITTEE_GOVERNANCE_RECONCILE_COMMAND;

main();
