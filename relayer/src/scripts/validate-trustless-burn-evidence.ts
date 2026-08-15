import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { validateTrustlessBurnEvidence } from '../trustless-burn-evidence.js';
import {
  buildTrustlessBurnValidationReport,
  formatTrustlessBurnValidationReportMarkdown,
} from '../trustless-burn-evidence-report.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

const usage = [
  'Usage: npm run trustless:validate -- <completed-trustless-burn-evidence.md> [...] [--report-out <report.md>]',
  'This command validates completed Trustless Burn Verification Evidence Markdown. It does not sign, submit, reconcile, publish, push, broadcast, or open runtime databases.',
  'Boundary: checked Gate 5 evidence still requires release:gate -- --trustless-burn-evidence <completed-trustless-burn-evidence.md> against the same completed artifact.',
  'Release-gate use requires a trustless burn validation target, a linked completed Proof-vector validation report, and Release gate structural issues = 0.',
  'A standalone PASS is not release authorization. Production-ready and mainnet claims remain blocked.',
  'Required release-support markers: Trustless burn verification implemented = yes; Transitional trusted burn path disabled = yes; Critical/high findings open = 0.',
  'Claim-boundary markers: Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes.',
  'When --report-out is provided, exactly one trustless-burn evidence target is allowed and the Markdown report records the PASS/BLOCKED result without authorizing claims, settlement, reconciliation, or broadcast.',
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
  console.error('--report-out requires exactly one trustless-burn evidence target.');
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
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    console.log(`${label}: evidence target BLOCKED: ${errors.length} structural issue(s).`);
    for (const error of errors) console.log(`- ${error}`);
    writeReportIfRequested(target, errors);
    blocked = true;
    continue;
  }
  const result = validateTrustlessBurnEvidence(markdown);

  console.log(`${label}: ${result.message}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  writeReportIfRequested(target, [], result);

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}

function writeReportIfRequested(
  target: string,
  readErrors: string[],
  validation?: ReturnType<typeof validateTrustlessBurnEvidence>,
): void {
  if (!args.reportOut || !reportOutput?.path) return;

  const report = buildTrustlessBurnValidationReport({
    command: `npm run trustless:validate -- ${target} --report-out <report.md>`,
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    validatedTarget: target,
    readErrors,
    validation,
  });
  mkdirSync(dirname(reportOutput.path), { recursive: true });
  writeFileSync(reportOutput.path, `${formatTrustlessBurnValidationReportMarkdown(report).trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
  console.log('Wrote trustless burn validation report to --report-out target.');
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
