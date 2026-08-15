import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { validateSecurityReviewEvidence } from '../security-review-evidence.js';
import {
  buildSecurityReviewValidationReport,
  formatSecurityReviewValidationReportMarkdown,
} from '../security-review-evidence-report.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

const usage = [
  'Usage: npm run security:validate -- <completed-independent-security-review.md> [...] [--report-out <report.md>]',
  'This command validates completed Independent Security Review Evidence Markdown for Gate 4 independent security review evidence.',
  'Boundary: checked Gate 4 security evidence still requires release:gate -- --security-review-evidence <completed-independent-security-review.md> against the same completed artifact.',
  'Release-gate use requires a security review validation target, required evidence package, item-specific evidence-package artifact links, and Release gate structural issues = 0.',
  'A standalone PASS is not release authorization and does not replace reviewer findings, accepted-risk publication updates, or release:gate Structural issues = 0.',
  'Production-ready/mainnet claims remain blocked; testnet production-candidate wording requires approved testnet review evidence, release:gate PASS, Critical/high findings open = 0, Publication blockers = 0, and all required evidence rows.',
  'When --report-out is provided, exactly one independent security review evidence target is allowed and the Markdown report records the PASS/BLOCKED result without authorizing claims, accepted-risk closure, review approval, deployment, or broadcast.',
  'This command is evidence validation only; it does not audit dependencies, sign, submit, publish, push, broadcast, or open runtime databases.',
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
  console.error('--report-out requires exactly one independent security review evidence target.');
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
  const result = validateSecurityReviewEvidence(markdown);

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
  validation?: ReturnType<typeof validateSecurityReviewEvidence>,
): void {
  if (!args.reportOut || !reportOutput?.path) return;

  const report = buildSecurityReviewValidationReport({
    command: `npm run security:validate -- ${target} --report-out <report.md>`,
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    validatedTarget: target,
    readErrors,
    validation,
  });
  mkdirSync(dirname(reportOutput.path), { recursive: true });
  writeFileSync(reportOutput.path, `${formatSecurityReviewValidationReportMarkdown(report).trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
  console.log('Wrote security review validation report to --report-out target.');
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
