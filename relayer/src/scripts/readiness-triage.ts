import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildReadinessTriageReport,
  discoverDefaultReadinessTriageTargets,
  formatReadinessTriageReportMarkdown,
  formatReadinessTriageText,
  type ReadinessTriageLane,
  type ReadinessTriageTarget,
} from '../readiness-triage.js';

const usage = [
  'Usage: npm run readiness:triage -- [--security <evidence.md>] [--trustless <evidence.md>] [--governance <evidence.md>] [--benchmark <evidence.md>] [--source-commit <commit>] [--markdown] [--out <report.md>] [--json-out <report.json>]',
  'Summarizes remaining Gate 4, Gate 5, Gate 6, and Gate 7 validator blockers into actionability buckets.',
  'With no explicit targets, the command discovers the latest known Gate 4/5/6/7 blocker maps under ../evidence.',
  '--out writes the Markdown triage report inside the bridge repository.',
  '--json-out writes the structured triage report inside the bridge repository.',
  'This command is planning output only; it does not close release evidence, authorize claims, publish, deploy, rotate keys, open runtime databases, or broadcast transactions.',
  'Evidence targets are read through the same guarded Markdown target reader used by the gate validators.',
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

const targetDiscovery = args.targets.length === 0
  ? discoverDefaultReadinessTriageTargets()
  : { targets: args.targets, errors: [] };

if (targetDiscovery.errors.length > 0) {
  for (const error of targetDiscovery.errors) console.error(error);
  process.exit(1);
}

const report = buildReadinessTriageReport(targetDiscovery.targets, { sourceCommit: args.sourceCommit });
const markdown = formatReadinessTriageReportMarkdown(report);
console.log(args.markdown ? markdown : formatReadinessTriageText(report));
writeReport(args.out, markdown);
writeJsonReport(args.jsonOut, report);

if (report.status === 'BLOCKED') {
  process.exitCode = 1;
}

function parseArgs(argv: string[]): {
  targets: ReadinessTriageTarget[];
  markdown: boolean;
  out?: string;
  jsonOut?: string;
  sourceCommit?: string;
  help: boolean;
  errors: string[];
} {
  const targets: ReadinessTriageTarget[] = [];
  const errors: string[] = [];
  let markdown = false;
  let help = false;
  let out: string | undefined;
  let jsonOut: string | undefined;
  let sourceCommit: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--markdown') {
      markdown = true;
      continue;
    }
    if (arg === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--out requires a Markdown report target.');
      } else {
        out = value;
        i += 1;
      }
      continue;
    }
    if (arg === '--json-out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--json-out requires a JSON report target.');
      } else {
        jsonOut = value;
        i += 1;
      }
      continue;
    }
    if (arg === '--source-commit') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--source-commit requires a 7-40 character Git commit SHA.');
      } else if (!isGitCommit(value)) {
        errors.push('--source-commit must be a 7-40 character Git commit SHA.');
        i += 1;
      } else {
        sourceCommit = value.toLowerCase();
        i += 1;
      }
      continue;
    }
    const lane = laneForOption(arg);
    if (lane) {
      const target = argv[i + 1];
      if (!target) {
        errors.push(`${arg} requires a Markdown evidence target.`);
      } else {
        targets.push({ lane, target });
        i += 1;
      }
      continue;
    }
    errors.push(`Unknown readiness triage option: ${arg}`);
  }

  return { targets, markdown, out, jsonOut, sourceCommit, help, errors };
}

function laneForOption(option: string): ReadinessTriageLane | undefined {
  if (option === '--security') return 'security-review';
  if (option === '--trustless') return 'trustless-burn';
  if (option === '--governance') return 'committee-governance';
  if (option === '--benchmark') return 'benchmark';
  return undefined;
}

function isGitCommit(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value);
}

function writeReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, `${markdown.trimEnd()}\n`, { encoding: 'utf8', flag: 'wx' });
}

function writeJsonReport(jsonOut: string | undefined, report: unknown): void {
  if (!jsonOut) return;
  const output = writeOfflineReportJson(jsonOut, report);
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  console.log(formatOfflineReportJsonWriteLine('readiness triage JSON report', jsonOut));
}
