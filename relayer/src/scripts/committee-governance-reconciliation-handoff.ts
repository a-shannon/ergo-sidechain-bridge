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
  buildCommitteeGovernanceReconciliationHandoffCommand,
  buildCommitteeGovernanceReconciliationHandoffReport,
  COMMITTEE_GOVERNANCE_RECONCILE_HANDOFF_COMMAND,
  formatCommitteeGovernanceReconciliationHandoffMarkdown,
} from '../committee-governance-reconciliation-handoff.js';

interface CliArgs {
  reconciliationReportJson?: string;
  wrongNetworkReportJson?: string;
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
    if (arg === '--reconciliation-report-json') {
      args.reconciliationReportJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--wrong-network-report-json') {
      args.wrongNetworkReportJson = requireValue(argv, index, arg);
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
    'Usage: npm run governance:reconcile:handoff -- --reconciliation-report-json <report.json> --wrong-network-report-json <report.json> [--out <report.md>] [--json-out <report.json>]',
    'Composes validated sanitized Gate 6 deployment-state reconciliation and wrong-network negative reports into an operator handoff packet.',
    'This command reads only the two provided sanitized JSON report targets. It does not read private deployment state, runtime databases, environment files, wallet material, perform node/RPC requests, rotate keys, sign, submit, deploy, broadcast, close Gate 6, or authorize release claims.',
  ].join('\n'));
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
  console.log(formatOfflineReportJsonWriteLine('committee governance reconciliation handoff JSON report', jsonOut));
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

  if (!args.reconciliationReportJson) {
    console.error('--reconciliation-report-json requires a validated reconciliation JSON report target.');
    usage();
    process.exit(1);
  }
  if (!args.wrongNetworkReportJson) {
    console.error('--wrong-network-report-json requires a validated wrong-network JSON report target.');
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

  const reconciliationRead = readEvidenceJsonTarget(
    args.reconciliationReportJson,
    '--reconciliation-report-json',
  );
  const wrongNetworkRead = readEvidenceJsonTarget(
    args.wrongNetworkReportJson,
    '--wrong-network-report-json',
  );
  const readErrors = [...reconciliationRead.errors, ...wrongNetworkRead.errors];
  if (readErrors.length > 0) {
    for (const error of readErrors) console.error(error);
    process.exit(1);
  }

  const command = buildCommitteeGovernanceReconciliationHandoffCommand({
    reconciliationReportJson: args.reconciliationReportJson,
    wrongNetworkReportJson: args.wrongNetworkReportJson,
    out: args.out,
    jsonOut: args.jsonOut,
  });
  const report = buildCommitteeGovernanceReconciliationHandoffReport({
    command,
    reconciliationReport: reconciliationRead.json,
    reconciliationReportSource: {
      mode: 'json',
      target: reconciliationRead.label,
    },
    wrongNetworkReport: wrongNetworkRead.json,
    wrongNetworkReportSource: {
      mode: 'json',
      target: wrongNetworkRead.label,
    },
  });
  const markdown = formatCommitteeGovernanceReconciliationHandoffMarkdown(report);
  console.log(markdown);
  writeReport(args.out, reportOutput, markdown);
  writeJsonReport(args.jsonOut, jsonReportOutput, report);
  process.exitCode = report.exitCode;
}

void COMMITTEE_GOVERNANCE_RECONCILE_HANDOFF_COMMAND;

main();
