import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { validateBenchmarkEvidence } from '../benchmark-evidence.js';
import {
  buildBenchmarkValidationReport,
  formatBenchmarkValidationReportMarkdown,
} from '../benchmark-evidence-report.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

const usage = [
  'Usage: npm run benchmark:validate -- <completed-benchmark-evidence.md> [...] [--report-out <report.md>]',
  'This command validates completed Benchmark Evidence Markdown for Gate 7 single, batch, sharded-lane, bottleneck, and benchmark-claim evidence.',
  'Boundary: checked Gate 7 evidence still requires release:gate -- --benchmark-evidence <completed-benchmark-evidence.md> against the same completed artifact.',
  'Release-gate use requires a benchmark validation target, command-specific benchmark command output evidence, and Release gate structural issues = 0.',
  'A standalone PASS does not authorize public claims, production-ready wording, mainnet deployment wording, production throughput wording, or broadcast enablement.',
  'Scaling or testnet production-candidate wording requires release:gate PASS with all required evidence rows, Structural issues = 0, and bounded benchmark claims.',
  'Required Gate 7 markers: Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0; Release notes updated = yes.',
  'When --report-out is provided, exactly one benchmark target is allowed and the Markdown report records the PASS/BLOCKED result without authorizing claims or broadcast.',
  'This command is evidence validation only; it does not sign, submit, publish, push, broadcast, or open runtime databases.',
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
  console.error('--report-out requires exactly one benchmark evidence target.');
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
  const result = validateBenchmarkEvidence(markdown);

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
  validation?: ReturnType<typeof validateBenchmarkEvidence>,
): void {
  if (!args.reportOut || !reportOutput?.path) return;

  const report = buildBenchmarkValidationReport({
    command: `npm run benchmark:validate -- ${target} --report-out <report.md>`,
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    validatedTarget: target,
    readErrors,
    validation,
  });
  mkdirSync(dirname(reportOutput.path), { recursive: true });
  writeFileSync(reportOutput.path, `${formatBenchmarkValidationReportMarkdown(report).trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
  console.log('Wrote benchmark validation report to --report-out target.');
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
