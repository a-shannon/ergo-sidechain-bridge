import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { validateTrustlessUnsignedTxEvidenceJsonTarget } from '../aggregate-settlement-candidate-evidence-json.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  buildTrustlessUnsignedTxValidationReport,
  formatTrustlessUnsignedTxValidationReportMarkdown,
} from '../trustless-unsigned-tx-evidence-report.js';

const usage = [
  'Usage: npm run trustless:unsigned-tx:validate -- <trustless-single-leaf-unsigned-tx-evidence.json> [...] [--report-out <report.md>]',
  'This command validates read-only trustless single-leaf unsigned transaction evidence JSON; it does not sign, check, approve, submit, reconcile, broadcast, mutate runtime databases, or authorize claims.',
  'Boundary: validation PASS is not Gate 5 closure, not pre-broadcast evidence, not transaction-check evidence, not expected-tx-id evidence, not signing authorization, and not claim authorization.',
  'When --report-out is provided, exactly one unsigned transaction evidence target is allowed and the Markdown report records the PASS/BLOCKED result without authorizing claims, checks, signing, settlement, or broadcast.',
];
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(usage.join('\n'));
  process.exit(0);
}

if (args.errors.length > 0) {
  for (const error of args.errors) console.error(error);
  process.exit(1);
}

if (args.targets.length === 0) {
  console.error(usage.join('\n'));
  process.exit(1);
}

if (args.reportOut && args.targets.length !== 1) {
  console.error('--report-out requires exactly one trustless unsigned transaction evidence target.');
  process.exit(1);
}

const reportOutput = args.reportOut
  ? resolveEvidenceOutputPath(args.reportOut, {
      workspaceRoot: process.cwd(),
      bridgeRoot: resolve(process.cwd(), '..'),
      optionName: '--report-out',
    })
  : undefined;
if (reportOutput && reportOutput.errors.length > 0) {
  for (const error of reportOutput.errors) console.error(error);
  process.exit(1);
}

let blocked = false;

for (const target of args.targets) {
  const result = validateTrustlessUnsignedTxEvidenceJsonTarget(target);
  console.log(`${result.label}: ${result.message}`);
  for (const error of result.errors) console.log(`- ${error}`);
  writeReportIfRequested(target, result);
  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}

function writeReportIfRequested(
  target: string,
  validation: ReturnType<typeof validateTrustlessUnsignedTxEvidenceJsonTarget>,
): void {
  if (!args.reportOut || !reportOutput?.path) return;

  const report = buildTrustlessUnsignedTxValidationReport({
    command: 'npm run trustless:unsigned-tx:validate -- <trustless-single-leaf-unsigned-tx-evidence.json> --report-out <report.md>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    validatedTarget: target,
    validation,
  });
  mkdirSync(dirname(reportOutput.path), { recursive: true });
  writeFileSync(reportOutput.path, `${formatTrustlessUnsignedTxValidationReportMarkdown(report).trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
  console.log('Wrote trustless unsigned transaction validation report to --report-out target.');
}

function parseArgs(argv: string[]): { targets: string[]; reportOut?: string; help: boolean; errors: string[] } {
  const targets: string[] = [];
  const errors: string[] = [];
  let reportOut: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--report-out') {
      const value = argv[i + 1];
      if (!value) {
        errors.push('--report-out requires a Markdown report path.');
      } else if (reportOut) {
        errors.push('--report-out may be provided only once.');
      } else {
        reportOut = value;
        i += 1;
      }
      continue;
    }
    targets.push(arg);
  }

  return { targets, reportOut, help, errors };
}
