import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  buildReadinessNodePreflightCommand,
  runReadinessNodePreflight,
} from '../readiness-node-preflight.js';
import type {
  ReadinessNodePreflightReport,
} from '../readiness-node-preflight.js';
import {
  buildReadinessTriageReport,
  discoverDefaultReadinessTriageTargets,
} from '../readiness-triage.js';
import type {
  ReadinessTriageCategory,
  ReadinessTriageLane,
  ReadinessTriageLocalClosureStatus,
  ReadinessTriageReport,
} from '../readiness-triage.js';
import {
  buildReadinessRuntimePrereqsCommand,
  buildReadinessRuntimePrereqsReport,
  formatReadinessRuntimePrereqsReportMarkdown,
} from '../readiness-runtime-prereqs.js';
import type {
  ReadinessRuntimePrereqsAnchorPreflightReport,
  ReadinessRuntimePrereqsAnchorPreflightSource,
  ReadinessRuntimePrereqsNodePreflightSource,
} from '../readiness-runtime-prereqs.js';

interface CliArgs {
  nodeUrl?: string;
  explicitNodeUrl: boolean;
  triageJson?: string;
  nodePreflightJson?: string;
  anchorPreflightJson?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

const DEFAULT_NODE_URL = 'http://127.0.0.1:9052';
const READINESS_TRIAGE_CATEGORIES: ReadinessTriageCategory[] = [
  'target-access',
  'local-evidence',
  'node-backed-or-live-drill',
  'reviewer-or-external',
  'claim-or-publication-boundary',
  'other',
];
const READINESS_TRIAGE_LOCAL_CLOSURE_STATUSES: ReadinessTriageLocalClosureStatus[] = [
  'complete',
  'local-evidence-work-available',
  'external-or-live-required',
  'manual-triage-required',
];
const READINESS_TRIAGE_LANES: ReadinessTriageLane[] = [
  'security-review',
  'trustless-burn',
  'committee-governance',
  'benchmark',
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { explicitNodeUrl: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--node-url') {
      args.nodeUrl = requireValue(argv, index, arg);
      args.explicitNodeUrl = true;
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--node-preflight-json') {
      args.nodePreflightJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--triage-json') {
      args.triageJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--anchor-preflight-json') {
      args.anchorPreflightJson = requireValue(argv, index, arg);
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
    'Usage: npm run readiness:runtime-prereqs -- [--node-url <http://...>] [--triage-json <report.json>] [--node-preflight-json <report.json>] [--anchor-preflight-json <report.json>] [--out <report.md>] [--json-out <report.json>]',
    'Combines default or JSON-backed Gate 4/5/6/7 readiness triage with the non-mainnet Ergo node preflight and optional anchor preflight provenance.',
    'This command is planning output only; it does not close evidence rows, authorize claims, deploy, sign, submit, or broadcast transactions.',
  ].join('\n'));
}

function writeReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, markdown, { encoding: 'utf8', flag: 'wx' });
}

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

const nodeUrl = args.nodeUrl ?? process.env.ERGO_NODE ?? DEFAULT_NODE_URL;
const reportCommand = buildReadinessRuntimePrereqsCommand({
  nodeUrl,
  explicitNodeUrl: args.explicitNodeUrl,
  triageJson: args.triageJson,
  nodePreflightJson: args.nodePreflightJson,
  anchorPreflightJson: args.anchorPreflightJson,
  out: args.out,
  jsonOut: args.jsonOut,
});

const { report: triageReport, source: triageSource } = args.triageJson
  ? loadTriageReportFromJson(args.triageJson)
  : buildDefaultTriageReport();
const { report: nodePreflightReport, source: nodePreflightSource } = args.nodePreflightJson
  ? loadNodePreflightReportFromJson(args.nodePreflightJson)
  : await runNodePreflight(nodeUrl, args.explicitNodeUrl);
const anchorPreflight = args.anchorPreflightJson
  ? loadAnchorPreflightReportFromJson(args.anchorPreflightJson)
  : undefined;
const report = buildReadinessRuntimePrereqsReport({
  command: reportCommand,
  triageReport,
  triageSource,
  nodePreflightReport,
  nodePreflightSource,
  ...(anchorPreflight
    ? {
        anchorPreflightReport: anchorPreflight.report,
        anchorPreflightSource: anchorPreflight.source,
      }
    : {}),
});
const markdown = formatReadinessRuntimePrereqsReportMarkdown(report);
console.log(markdown);
writeReport(args.out, markdown);
writeJsonReport(args.jsonOut, report);
process.exitCode = report.exitCode;

function writeJsonReport(jsonOut: string | undefined, report: unknown): void {
  if (!jsonOut) return;
  const output = writeOfflineReportJson(jsonOut, report);
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  console.log(formatOfflineReportJsonWriteLine('runtime prerequisites JSON report', jsonOut));
}

async function runNodePreflight(
  nodeUrl: string,
  explicitNodeUrl: boolean,
): Promise<{
  report: ReadinessNodePreflightReport;
  source: ReadinessRuntimePrereqsNodePreflightSource;
}> {
  const nodeCommand = buildReadinessNodePreflightCommand({
    nodeUrl,
    explicitNodeUrl,
  });
  return {
    report: await runReadinessNodePreflight({
      command: nodeCommand,
      nodeUrl,
    }),
    source: { mode: 'live' },
  };
}

function buildDefaultTriageReport(): {
  report: ReadinessTriageReport;
  source: { mode: 'default-discovery' };
} {
  const discovery = discoverDefaultReadinessTriageTargets();
  if (discovery.errors.length > 0) {
    for (const error of discovery.errors) console.error(error);
    process.exit(1);
  }
  return {
    report: buildReadinessTriageReport(discovery.targets),
    source: { mode: 'default-discovery' },
  };
}

function loadTriageReportFromJson(target: string): {
  report: ReadinessTriageReport;
  source: { mode: 'json'; target: string };
} {
  const read = readEvidenceJsonTarget(target, '--triage-json');
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }

  const validationErrors = validateReadinessTriageReportJson(read.json);
  if (validationErrors.length > 0) {
    for (const error of validationErrors) console.error(error);
    process.exit(1);
  }

  return {
    report: read.json as ReadinessTriageReport,
    source: {
      mode: 'json',
      target: read.label,
    },
  };
}

function loadNodePreflightReportFromJson(target: string): {
  report: ReadinessNodePreflightReport;
  source: ReadinessRuntimePrereqsNodePreflightSource;
} {
  const read = readEvidenceJsonTarget(target, '--node-preflight-json');
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }

  const validationErrors = validateNodePreflightReportJson(read.json);
  if (validationErrors.length > 0) {
    for (const error of validationErrors) console.error(error);
    process.exit(1);
  }

  return {
    report: read.json as ReadinessNodePreflightReport,
    source: {
      mode: 'json',
      target: read.label,
    },
  };
}

function loadAnchorPreflightReportFromJson(target: string): {
  report: ReadinessRuntimePrereqsAnchorPreflightReport;
  source: ReadinessRuntimePrereqsAnchorPreflightSource;
} {
  const read = readEvidenceJsonTarget(target, '--anchor-preflight-json');
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }

  const validationErrors = validateAnchorPreflightReportJson(read.json);
  if (validationErrors.length > 0) {
    for (const error of validationErrors) console.error(error);
    process.exit(1);
  }

  return {
    report: read.json as ReadinessRuntimePrereqsAnchorPreflightReport,
    source: {
      mode: 'json',
      target: read.label,
    },
  };
}

function validateReadinessTriageReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--triage-json report must be a JSON object'];

  requireEnum(value.status, ['PASS', 'BLOCKED'], '--triage-json report.status', errors);
  requireOptionalGitCommit(value.sourceCommit, '--triage-json report.sourceCommit', errors);
  requireSafeInteger(value.totalStructuralIssues, '--triage-json report.totalStructuralIssues', errors);

  if (!Array.isArray(value.lanes)) {
    errors.push('--triage-json report.lanes must be an array');
  } else {
    value.lanes.forEach((lane, index) => validateReadinessTriageLaneJson(lane, index, errors));
  }

  if (!Array.isArray(value.issues)) {
    errors.push('--triage-json report.issues must be an array');
  } else {
    value.issues.forEach((issue, index) => validateReadinessTriageIssueJson(issue, index, errors));
    if (Number.isSafeInteger(value.totalStructuralIssues) && value.totalStructuralIssues !== value.issues.length) {
      errors.push('--triage-json report.totalStructuralIssues must equal report.issues.length');
    }
  }

  if (!Array.isArray(value.categorySummaries)) {
    errors.push('--triage-json report.categorySummaries must be an array');
  } else {
    value.categorySummaries.forEach((summary, index) => validateReadinessTriageCategorySummaryJson(summary, index, errors));
  }

  validateReadinessTriageLocalClosureJson(
    value.localClosure,
    value.totalStructuralIssues,
    Array.isArray(value.issues) ? value.issues : undefined,
    errors,
  );

  if (!isRecord(value.boundary)) {
    errors.push('--triage-json report.boundary must be an object');
  } else {
    for (const [field, boundaryValue] of Object.entries(value.boundary)) {
      if (boundaryValue !== 'yes' && boundaryValue !== 'no') {
        errors.push(`--triage-json report.boundary.${field} must be yes or no`);
      }
    }
    requireBoundaryNo(value.boundary, 'Release gate PASS claimed', errors, '--triage-json');
    requireBoundaryNo(value.boundary, 'Public claim authorization granted', errors, '--triage-json');
    requireBoundaryNo(value.boundary, 'Evidence row closure claimed', errors, '--triage-json');
    requireBoundaryNo(value.boundary, 'Runtime database or deployment state opened', errors, '--triage-json');
    requireBoundaryNo(
      value.boundary,
      'Transaction broadcast, deploy, key rotation, or state mutation performed',
      errors,
      '--triage-json',
    );
  }

  return errors;
}

function validateNodePreflightReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--node-preflight-json report must be a JSON object'];

  requireEnum(value.result, ['PASS', 'BLOCKED'], '--node-preflight-json report.result', errors);
  requireSafeInteger(value.exitCode, '--node-preflight-json report.exitCode', errors);
  requireString(value.command, '--node-preflight-json report.command', errors);
  requireString(value.nodeEndpoint, '--node-preflight-json report.nodeEndpoint', errors);
  requireString(value.reason, '--node-preflight-json report.reason', errors);
  requireOptionalString(value.observedError, '--node-preflight-json report.observedError', errors);
  requireOptionalString(value.network, '--node-preflight-json report.network', errors);
  requireOptionalString(value.height, '--node-preflight-json report.height', errors);

  if (!Array.isArray(value.checks)) {
    errors.push('--node-preflight-json report.checks must be an array');
  } else {
    value.checks.forEach((check, index) => validateNodePreflightCheck(check, index, errors));
  }

  if (!isRecord(value.boundary)) {
    errors.push('--node-preflight-json report.boundary must be an object');
  } else {
    for (const [field, boundaryValue] of Object.entries(value.boundary)) {
      if (boundaryValue !== 'yes' && boundaryValue !== 'no') {
        errors.push(`--node-preflight-json report.boundary.${field} must be yes or no`);
      }
    }
    requireBoundaryNo(value.boundary, 'Evidence row closure claimed', errors);
    requireBoundaryNo(value.boundary, 'Release gate PASS claimed', errors);
    requireBoundaryNo(value.boundary, 'Transaction broadcast, submit, deploy, or state mutation performed', errors);
  }

  return errors;
}

function validateAnchorPreflightReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--anchor-preflight-json report must be a JSON object'];

  requireEnum(value.status, ['PASS', 'WARN', 'FAIL'], '--anchor-preflight-json report.status', errors);
  requireSafeInteger(value.exitCode, '--anchor-preflight-json report.exitCode', errors);

  if (!isRecord(value.expectedRoot)) {
    errors.push('--anchor-preflight-json report.expectedRoot must be an object');
  } else {
    requireString(value.expectedRoot.mode, '--anchor-preflight-json report.expectedRoot.mode', errors);
    requireEnum(
      value.expectedRoot.status,
      ['PASS', 'WARN', 'FAIL'],
      '--anchor-preflight-json report.expectedRoot.status',
      errors,
    );
    requireBoolean(value.expectedRoot.provided, '--anchor-preflight-json report.expectedRoot.provided', errors);
    requireOptionalString(value.expectedRoot.rootHex, '--anchor-preflight-json report.expectedRoot.rootHex', errors);
    requireString(value.expectedRoot.message, '--anchor-preflight-json report.expectedRoot.message', errors);
  }

  if (!isRecord(value.node)) {
    errors.push('--anchor-preflight-json report.node must be an object');
  } else {
    requireString(value.node.endpoint, '--anchor-preflight-json report.node.endpoint', errors);
    requireBoolean(value.node.requestAttempted, '--anchor-preflight-json report.node.requestAttempted', errors);
    if (value.node.currentHeight !== undefined) {
      requireSafeInteger(value.node.currentHeight, '--anchor-preflight-json report.node.currentHeight', errors);
    }
  }

  if (value.scanWindow !== undefined) validateAnchorScanWindow(value.scanWindow, errors);
  if (value.anchorScan !== undefined) validateAnchorScan(value.anchorScan, errors);

  if (!Array.isArray(value.checks)) {
    errors.push('--anchor-preflight-json report.checks must be an array');
  } else {
    value.checks.forEach((check, index) => validateAnchorPreflightCheck(check, index, errors));
  }

  if (!isRecord(value.boundary)) {
    errors.push('--anchor-preflight-json report.boundary must be an object');
  } else {
    for (const [field, boundaryValue] of Object.entries(value.boundary)) {
      if (boundaryValue !== 'yes' && boundaryValue !== 'no') {
        errors.push(`--anchor-preflight-json report.boundary.${field} must be yes or no`);
      }
    }
    requireBoundaryNo(value.boundary, 'Node wallet used', errors, '--anchor-preflight-json');
    requireBoundaryNo(value.boundary, 'ERGO_API_KEY read', errors, '--anchor-preflight-json');
    requireBoundaryNo(value.boundary, 'Runtime database opened', errors, '--anchor-preflight-json');
    requireBoundaryNo(value.boundary, 'Deployment state opened', errors, '--anchor-preflight-json');
    requireBoundaryNo(value.boundary, 'Private key material serialized', errors, '--anchor-preflight-json');
    requireBoundaryNo(value.boundary, 'Evidence row closure claimed', errors, '--anchor-preflight-json');
    requireBoundaryNo(value.boundary, 'Release gate PASS claimed', errors, '--anchor-preflight-json');
    requireBoundaryNo(
      value.boundary,
      'Transaction broadcast, submit, deploy, or state mutation performed',
      errors,
      '--anchor-preflight-json',
    );
  }

  return errors;
}

function validateReadinessTriageLaneJson(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--triage-json report.lanes[${index}] must be an object`);
    return;
  }

  requireReadinessLane(value.lane, `--triage-json report.lanes[${index}].lane`, errors);
  requireString(value.target, `--triage-json report.lanes[${index}].target`, errors);
  requireString(value.label, `--triage-json report.lanes[${index}].label`, errors);
  requireEnum(value.status, ['PASS', 'BLOCKED'], `--triage-json report.lanes[${index}].status`, errors);
  requireBoolean(value.validatorCompleted, `--triage-json report.lanes[${index}].validatorCompleted`, errors);
  requireStringArray(value.errors, `--triage-json report.lanes[${index}].errors`, errors);
}

function validateReadinessTriageIssueJson(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--triage-json report.issues[${index}] must be an object`);
    return;
  }

  requireReadinessLane(value.lane, `--triage-json report.issues[${index}].lane`, errors);
  requireString(value.target, `--triage-json report.issues[${index}].target`, errors);
  requireReadinessCategory(value.category, `--triage-json report.issues[${index}].category`, errors);
  requireString(value.issue, `--triage-json report.issues[${index}].issue`, errors);
}

function validateReadinessTriageCategorySummaryJson(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--triage-json report.categorySummaries[${index}] must be an object`);
    return;
  }

  requireReadinessCategory(value.category, `--triage-json report.categorySummaries[${index}].category`, errors);
  requireSafeInteger(value.count, `--triage-json report.categorySummaries[${index}].count`, errors);
  requireString(value.meaning, `--triage-json report.categorySummaries[${index}].meaning`, errors);
}

function validateReadinessTriageLocalClosureJson(
  value: unknown,
  totalStructuralIssues: unknown,
  issues: unknown[] | undefined,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('--triage-json report.localClosure must be an object');
    return;
  }

  requireEnum(
    value.status,
    READINESS_TRIAGE_LOCAL_CLOSURE_STATUSES,
    '--triage-json report.localClosure.status',
    errors,
  );
  requireSafeInteger(value.localOnlyIssueCount, '--triage-json report.localClosure.localOnlyIssueCount', errors);
  requireSafeInteger(value.externalOrLiveIssueCount, '--triage-json report.localClosure.externalOrLiveIssueCount', errors);
  requireSafeInteger(value.manualTriageIssueCount, '--triage-json report.localClosure.manualTriageIssueCount', errors);
  requireString(value.summary, '--triage-json report.localClosure.summary', errors);

  const localOnlyIssueCount = value.localOnlyIssueCount;
  const externalOrLiveIssueCount = value.externalOrLiveIssueCount;
  const manualTriageIssueCount = value.manualTriageIssueCount;
  if (
    typeof localOnlyIssueCount === 'number' &&
    Number.isSafeInteger(localOnlyIssueCount) &&
    typeof externalOrLiveIssueCount === 'number' &&
    Number.isSafeInteger(externalOrLiveIssueCount) &&
    typeof manualTriageIssueCount === 'number' &&
    Number.isSafeInteger(manualTriageIssueCount)
  ) {
    if (localOnlyIssueCount < 0 || externalOrLiveIssueCount < 0 || manualTriageIssueCount < 0) {
      errors.push('--triage-json report.localClosure issue counts must be non-negative');
    }
    const localClosureIssueCount = localOnlyIssueCount + externalOrLiveIssueCount + manualTriageIssueCount;
    if (
      typeof totalStructuralIssues === 'number' &&
      Number.isSafeInteger(totalStructuralIssues) &&
      localClosureIssueCount !== totalStructuralIssues
    ) {
      errors.push('--triage-json report.localClosure issue counts must equal report.totalStructuralIssues');
    }
    if (
      localOnlyIssueCount >= 0 &&
      externalOrLiveIssueCount >= 0 &&
      manualTriageIssueCount >= 0 &&
      typeof value.status === 'string' &&
      isReadinessTriageLocalClosureStatus(value.status)
    ) {
      const expectedStatus = expectedLocalClosureStatus(
        localOnlyIssueCount,
        externalOrLiveIssueCount,
        manualTriageIssueCount,
      );
      if (value.status !== expectedStatus) {
        errors.push('--triage-json report.localClosure.status must match issue-count buckets');
      }
    }
  }

  if (issues) {
    const categorizedCounts = countLocalClosureIssues(issues);
    if (categorizedCounts) {
      if (value.localOnlyIssueCount !== categorizedCounts.localOnlyIssueCount) {
        errors.push('--triage-json report.localClosure.localOnlyIssueCount must equal local-only issue categories');
      }
      if (value.externalOrLiveIssueCount !== categorizedCounts.externalOrLiveIssueCount) {
        errors.push('--triage-json report.localClosure.externalOrLiveIssueCount must equal external/live/claim issue categories');
      }
      if (value.manualTriageIssueCount !== categorizedCounts.manualTriageIssueCount) {
        errors.push('--triage-json report.localClosure.manualTriageIssueCount must equal manual-triage issue categories');
      }
    }
  }
}

function countLocalClosureIssues(
  issues: unknown[],
): { localOnlyIssueCount: number; externalOrLiveIssueCount: number; manualTriageIssueCount: number } | undefined {
  let localOnlyIssueCount = 0;
  let externalOrLiveIssueCount = 0;
  let manualTriageIssueCount = 0;

  for (const issue of issues) {
    if (!isRecord(issue) || typeof issue.category !== 'string' || !isReadinessTriageCategory(issue.category)) {
      return undefined;
    }
    if (issue.category === 'target-access' || issue.category === 'local-evidence') {
      localOnlyIssueCount += 1;
    } else if (issue.category === 'other') {
      manualTriageIssueCount += 1;
    } else {
      externalOrLiveIssueCount += 1;
    }
  }

  return { localOnlyIssueCount, externalOrLiveIssueCount, manualTriageIssueCount };
}

function validateNodePreflightCheck(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--node-preflight-json report.checks[${index}] must be an object`);
    return;
  }

  requireString(value.name, `--node-preflight-json report.checks[${index}].name`, errors);
  requireEnum(
    value.result,
    ['PASS', 'BLOCKED'],
    `--node-preflight-json report.checks[${index}].result`,
    errors,
  );
  requireString(value.detail, `--node-preflight-json report.checks[${index}].detail`, errors);
}

function validateAnchorScanWindow(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('--anchor-preflight-json report.scanWindow must be an object when present');
    return;
  }

  requireSafeInteger(value.minHeight, '--anchor-preflight-json report.scanWindow.minHeight', errors);
  requireSafeInteger(value.maxHeight, '--anchor-preflight-json report.scanWindow.maxHeight', errors);
  requireSafeInteger(value.lookbackBlocks, '--anchor-preflight-json report.scanWindow.lookbackBlocks', errors);
  requireSafeInteger(value.maxScanBlocks, '--anchor-preflight-json report.scanWindow.maxScanBlocks', errors);
  requireSafeInteger(value.scannedBlocks, '--anchor-preflight-json report.scanWindow.scannedBlocks', errors);
}

function validateAnchorScan(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('--anchor-preflight-json report.anchorScan must be an object when present');
    return;
  }

  if (value.anchorKey !== '0401') {
    errors.push('--anchor-preflight-json report.anchorScan.anchorKey must be 0401');
  }
  requireSafeInteger(value.anchorCount, '--anchor-preflight-json report.anchorScan.anchorCount', errors);
  if (value.newestAnchorHeight !== undefined) {
    requireSafeInteger(value.newestAnchorHeight, '--anchor-preflight-json report.anchorScan.newestAnchorHeight', errors);
  }
  if (value.newestAnchorAge !== undefined) {
    requireSafeInteger(value.newestAnchorAge, '--anchor-preflight-json report.anchorScan.newestAnchorAge', errors);
  }
}

function validateAnchorPreflightCheck(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--anchor-preflight-json report.checks[${index}] must be an object`);
    return;
  }

  requireString(value.name, `--anchor-preflight-json report.checks[${index}].name`, errors);
  requireEnum(
    value.status,
    ['PASS', 'WARN', 'FAIL'],
    `--anchor-preflight-json report.checks[${index}].status`,
    errors,
  );
  requireString(value.message, `--anchor-preflight-json report.checks[${index}].message`, errors);
}

function requireReadinessLane(value: unknown, label: string, errors: string[]): void {
  requireEnum(value, READINESS_TRIAGE_LANES, label, errors);
}

function requireReadinessCategory(value: unknown, label: string, errors: string[]): void {
  requireEnum(value, READINESS_TRIAGE_CATEGORIES, label, errors);
}

function isReadinessTriageCategory(value: string): value is ReadinessTriageCategory {
  return READINESS_TRIAGE_CATEGORIES.includes(value as ReadinessTriageCategory);
}

function isReadinessTriageLocalClosureStatus(value: string): value is ReadinessTriageLocalClosureStatus {
  return READINESS_TRIAGE_LOCAL_CLOSURE_STATUSES.includes(value as ReadinessTriageLocalClosureStatus);
}

function expectedLocalClosureStatus(
  localOnlyIssueCount: number,
  externalOrLiveIssueCount: number,
  manualTriageIssueCount: number,
): ReadinessTriageLocalClosureStatus {
  if (localOnlyIssueCount + externalOrLiveIssueCount + manualTriageIssueCount === 0) return 'complete';
  if (manualTriageIssueCount > 0) return 'manual-triage-required';
  if (localOnlyIssueCount > 0) return 'local-evidence-work-available';
  return 'external-or-live-required';
}

function requireString(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label} must be present`);
  }
}

function requireStringArray(value: unknown, label: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }
  value.forEach((entry, index) => requireString(entry, `${label}[${index}]`, errors));
}

function requireOptionalString(value: unknown, label: string, errors: string[]): void {
  if (value !== undefined && typeof value !== 'string') {
    errors.push(`${label} must be a string when present`);
  }
}

function requireOptionalGitCommit(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^[0-9a-f]{7,40}$/i.test(value)) {
    errors.push(`${label} must be a 7-40 character Git commit SHA`);
  }
}

function requireBoolean(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'boolean') {
    errors.push(`${label} must be a boolean`);
  }
}

function requireSafeInteger(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    errors.push(`${label} must be a safe integer`);
  }
}

function requireEnum(value: unknown, allowed: string[], label: string, errors: string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    errors.push(`${label} must be ${allowed.join(' or ')}`);
  }
}

function requireBoundaryNo(
  boundary: Record<string, unknown>,
  field: string,
  errors: string[],
  optionName = '--node-preflight-json',
): void {
  if (boundary[field] !== 'no') {
    errors.push(`${optionName} report.boundary.${field} must be no`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
