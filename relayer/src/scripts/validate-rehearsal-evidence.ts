import { mkdirSync, writeFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';

import {
  formatRehearsalValidationTranscriptLines,
  parseLifecycleGateRows,
  validateRehearsalEvidence,
} from '../rehearsal-evidence.js';
import {
  buildRehearsalValidationReport,
  formatRehearsalValidationReportMarkdown,
} from '../rehearsal-evidence-report.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from '../evidence-sensitive-target.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import { validatePostSubmitObserveJsonReport } from '../post-submit-observe-json.js';
import { validateRecoveryObserveJsonReport } from '../recovery-observe-json.js';
import { validateFreshCheckpointArtifact } from '../testnet-offline-rehearsal-gate.js';
import { validateTestnetRehearsalAssemblyReport } from '../testnet-rehearsal-assemble.js';
import { validateLivePreflightJsonReport } from '../testnet-rehearsal-live-preflight.js';
import type { TestnetRecoveryDrillKind } from '../testnet-recovery-drill-evidence.js';

interface Args {
  targets: string[];
  assemblyReportJson?: string;
  freshCheckpointJson?: string;
  livePreflightJson?: string;
  postSubmitObserveJson?: string;
  recoveryObserveJson: string[];
  reportOut?: string;
  transcript?: string;
}

interface RecoveryObserveJsonCliValidation {
  target: string;
  normalizedTarget: string;
  errors: string[];
  kind?: TestnetRecoveryDrillKind;
}

const RECOVERY_GATE_KINDS: Record<string, TestnetRecoveryDrillKind> = {
  'Failed broadcast / phantom AVL evidence': 'failed-broadcast-phantom-avl',
  'Reorged burn / stale singleton evidence': 'reorged-burn-stale-singleton',
};

function parseArgs(argv: string[]): Args {
  const args: Args = { targets: [], recoveryObserveJson: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--transcript') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--transcript requires a completed artifact target or non-template evidence link');
      }
      args.transcript = value;
      index += 1;
      continue;
    }
    if (arg === '--fresh-checkpoint-json') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--fresh-checkpoint-json requires a completed fresh checkpoint JSON target');
      }
      args.freshCheckpointJson = value;
      index += 1;
      continue;
    }
    if (arg === '--live-preflight-json') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--live-preflight-json requires a completed live-preflight JSON target');
      }
      args.livePreflightJson = value;
      index += 1;
      continue;
    }
    if (arg === '--post-submit-observe-json') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--post-submit-observe-json requires a completed post-submit observe JSON target');
      }
      args.postSubmitObserveJson = value;
      index += 1;
      continue;
    }
    if (arg === '--assembly-report-json') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--assembly-report-json requires a completed rehearsal assembly JSON target');
      }
      args.assemblyReportJson = value;
      index += 1;
      continue;
    }
    if (arg === '--recovery-observe-json') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--recovery-observe-json requires a completed recovery-observe JSON target');
      }
      args.recoveryObserveJson.push(value);
      index += 1;
      continue;
    }
    if (arg === '--report-out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--report-out requires a Markdown report path');
      }
      if (args.reportOut) {
        throw new Error('--report-out may be provided only once');
      }
      args.reportOut = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    args.targets.push(arg);
  }
  return args;
}

function isCompletedTranscriptTarget(target: string): boolean {
  return (
    /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>]+$/i.test(target) ||
    /^\[[^\]]+\]\([^)]+\)$/.test(target)
  ) &&
    !/<[^>]+>/.test(target) &&
    !isLocalOnlyEvidenceTarget(target) &&
    !hasNonConcreteTranscriptTarget(target);
}

function normalizeTarget(target: string): string {
  return target
    .replace(/^\[[^\]]+\]\(([^)]+)\)$/, '$1')
    .split('#')[0]
    .split('?')[0]
    .replace(/[),;]+$/g, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function isSensitiveTranscriptTarget(target: string): boolean {
  const normalized = normalizeTarget(target);
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveTranscriptInspectionTarget);
}

function hasNonConcreteTranscriptTarget(target: string): boolean {
  const normalized = normalizeTarget(target);
  return (
    /\b(?:not[-_ ]completed|uncompleted)\b/i.test(normalized) ||
    normalized
      .split(/[\\/]+/)
      .some(segment => isNonConcreteTranscriptTargetSegment(segment))
  );
}

function isNonConcreteTranscriptTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|lifecycle|rehearsal|validate|transcript)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:proof|evidence|artifact|target|log|run|check|update|validator|lifecycle|rehearsal|validate|transcript)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function isSensitiveTranscriptInspectionTarget(normalized: string): boolean {
  return (
    hasEnvironmentTargetSegment(normalized) ||
    hasRuntimeDatabaseTargetSegment(normalized) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalized)
  );
}

function hasEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function isLocalOnlyEvidenceTarget(target: string): boolean {
  const normalized = normalizeTarget(target);
  return evidenceTargetInspectionVariants(normalized).some(isLocalOnlyEvidenceInspectionTarget);
}

function isLocalOnlyEvidenceInspectionTarget(normalized: string): boolean {
  return (
    hasEvidenceLocalOnlyInspectionReference(normalized) ||
    /^file:\/\//i.test(normalized) ||
    /^[a-z]:\//i.test(normalized) ||
    /^\/\/[^/]/.test(normalized) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/i.test(normalized)
  );
}

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  printUsage('stdout');
  process.exit(0);
}

let args: Args;
try {
  args = parseArgs(rawArgs);
} catch (error: any) {
  console.error(error?.message ?? String(error));
  printUsage();
  process.exit(1);
}
const targets = args.targets;

if (targets.length === 0) {
  printUsage();
  process.exit(1);
}
if (args.reportOut && targets.length !== 1) {
  console.error('--report-out requires exactly one live rehearsal evidence target.');
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
if (args.transcript && isLocalOnlyEvidenceTarget(args.transcript)) {
  console.error('--transcript must not reference a local-only path');
  process.exit(1);
}
if (args.transcript && !isCompletedTranscriptTarget(args.transcript)) {
  console.error('--transcript must be a completed artifact target or non-template evidence link');
  process.exit(1);
}
if (args.transcript && isSensitiveTranscriptTarget(args.transcript)) {
  console.error('--transcript must not reference runtime or secret-bearing material');
  process.exit(1);
}

let blocked = false;

for (const target of targets) {
  if (args.transcript && normalizeTarget(args.transcript) === normalizeTarget(target)) {
    const errors = ['--transcript must be distinct from the completed rehearsal target'];
    console.log('evidence target BLOCKED: 1 structural issue(s).');
    console.log(`- ${errors[0]}`);
    writeReportIfRequested(target, errors);
    blocked = true;
    continue;
  }
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    console.log(`${label}: evidence target BLOCKED: ${errors.length} structural issue(s).`);
    for (const error of errors) console.log(`- ${error}`);
    writeReportIfRequested(target, errors);
    blocked = true;
    continue;
  }
  const result = validateRehearsalEvidence(markdown);
  if (result.status === 'PASS' && !args.transcript) {
    const errors = ['--transcript is required for PASS output so Gate 3 evidence has a distinct validation artifact'];
    console.log(`${label}: evidence target BLOCKED: 1 structural issue(s).`);
    console.log(`- ${errors[0]}`);
    writeReportIfRequested(target, [], result, errors);
    blocked = true;
    continue;
  }
  const postSubmitObserveErrors = validateLinkedPostSubmitObserveJson(
    markdown,
    args.postSubmitObserveJson,
    args.livePreflightJson,
  );
  if (postSubmitObserveErrors.length > 0) {
    console.log(`${label}: evidence target BLOCKED: ${postSubmitObserveErrors.length} structural issue(s).`);
    for (const error of postSubmitObserveErrors) console.log(`- ${error}`);
    writeReportIfRequested(target, [], result, postSubmitObserveErrors);
    blocked = true;
    continue;
  }
  const freshCheckpointErrors = validateLinkedFreshCheckpointJson(markdown, args.freshCheckpointJson);
  if (freshCheckpointErrors.length > 0) {
    console.log(`${label}: evidence target BLOCKED: ${freshCheckpointErrors.length} structural issue(s).`);
    for (const error of freshCheckpointErrors) console.log(`- ${error}`);
    writeReportIfRequested(target, [], result, freshCheckpointErrors);
    blocked = true;
    continue;
  }
  const assemblyReportErrors = validateLinkedAssemblyReportJson(markdown, target, args.assemblyReportJson);
  if (assemblyReportErrors.length > 0) {
    console.log(`${label}: evidence target BLOCKED: ${assemblyReportErrors.length} structural issue(s).`);
    for (const error of assemblyReportErrors) console.log(`- ${error}`);
    writeReportIfRequested(target, [], result, assemblyReportErrors);
    blocked = true;
    continue;
  }
  const recoveryObserveErrors = validateLinkedRecoveryObserveJson(markdown, args.recoveryObserveJson);
  if (recoveryObserveErrors.length > 0) {
    console.log(`${label}: evidence target BLOCKED: ${recoveryObserveErrors.length} structural issue(s).`);
    for (const error of recoveryObserveErrors) console.log(`- ${error}`);
    writeReportIfRequested(target, [], result, recoveryObserveErrors);
    blocked = true;
    continue;
  }
  const livePreflightErrors = validateLinkedLivePreflightJson(markdown, args.livePreflightJson);
  if (livePreflightErrors.length > 0) {
    console.log(`${label}: evidence target BLOCKED: ${livePreflightErrors.length} structural issue(s).`);
    for (const error of livePreflightErrors) console.log(`- ${error}`);
    writeReportIfRequested(target, [], result, livePreflightErrors);
    blocked = true;
    continue;
  }

  for (const line of formatRehearsalValidationTranscriptLines(label, markdown, result, args.transcript)) {
    console.log(line);
  }

  writeReportIfRequested(target, [], result);

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}

function printUsage(stream: 'stderr' | 'stdout' = 'stderr'): void {
  const usage = [
    'Usage: npm run rehearsal:validate -- [--transcript <artifact://.../validate.log>] [--assembly-report-json <assembly-report.json>] [--live-preflight-json <live-preflight.json>] [--post-submit-observe-json <post-submit-observe.json>] [--fresh-checkpoint-json <fresh-testnet-checkpoint.json>] [--recovery-observe-json <recovery-observe.json> ...] <completed-live-rehearsal.md> [...]',
    'This command validates completed Live Rehearsal Evidence Markdown for Gate 3 lifecycle and recovery evidence.',
    'Boundary: checked Gate 3 evidence still requires release:gate against the same completed artifact and linked command-output evidence.',
    'Release-gate use requires a rehearsal validation target, command-specific completed rehearsal command output evidence, Release gate structural issues = 0, and a distinct validation artifact named with --transcript before PASS output is printed.',
    'Required Gate 3 markers: Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no.',
    'Required broadcast markers: Broadcast mode at start disabled; Broadcast mode at end disabled; broadcast approval remains explicitly scoped when enabled later.',
    'When --report-out is provided, exactly one live rehearsal evidence target is allowed and the Markdown report records the PASS/BLOCKED result without authorizing claims, live submit, deployment, or broadcast.',
    'This command is evidence validation only; it does not sign, submit, publish, push, broadcast, or open runtime databases.',
  ].join('\n');
  if (stream === 'stdout') {
    console.log(usage);
    return;
  }
  console.error(usage);
}

function writeReportIfRequested(
  target: string,
  readErrors: string[],
  validation?: ReturnType<typeof validateRehearsalEvidence>,
  cliErrors: string[] = [],
): void {
  if (!args.reportOut || !reportOutput?.path) return;

  const report = buildRehearsalValidationReport({
    command: `npm run rehearsal:validate -- ${target} --report-out <report.md>`,
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    validatedTarget: target,
    readErrors,
    validation,
    cliErrors,
  });
  mkdirSync(dirname(reportOutput.path), { recursive: true });
  writeFileSync(reportOutput.path, `${formatRehearsalValidationReportMarkdown(report).trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
  console.log('Wrote rehearsal validation report to --report-out target.');
}

function validateLinkedLivePreflightJson(markdown: string, target: string | undefined): string[] {
  const sourceTarget = extractLivePreflightJsonBindingTarget(markdown);
  if (!sourceTarget) return [];
  if (!target) {
    return ['--live-preflight-json is required when Post-Submit Gate Binding includes a live-preflight JSON binding'];
  }
  if (normalizeTarget(sourceTarget) !== normalizeTarget(target)) {
    return ['--live-preflight-json target must match Live-preflight JSON binding target'];
  }
  const { errors, json } = readEvidenceJsonTarget(target, '--live-preflight-json');
  if (errors.length > 0) return errors;
  return validateLivePreflightJsonReport(json);
}

function validateLinkedFreshCheckpointJson(markdown: string, target: string | undefined): string[] {
  if (!hasIncludedFreshCheckpoint(markdown)) return [];
  if (!target) {
    return ['--fresh-checkpoint-json is required when Rehearsal Assembly Evidence includes a fresh checkpoint'];
  }
  const sourceTarget = extractFreshCheckpointSourceTarget(markdown);
  if (!sourceTarget) {
    return ['Fresh checkpoint source target must be present before --fresh-checkpoint-json can be validated'];
  }
  if (normalizeTarget(sourceTarget) !== normalizeTarget(target)) {
    return ['--fresh-checkpoint-json target must match Fresh checkpoint source target'];
  }
  const { errors, json } = readEvidenceJsonTarget(target, '--fresh-checkpoint-json');
  if (errors.length > 0) return errors;
  return validateFreshCheckpointArtifact(json);
}

function validateLinkedPostSubmitObserveJson(
  markdown: string,
  target: string | undefined,
  livePreflightJsonTarget: string | undefined,
): string[] {
  if (!hasIncludedPostSubmitFragment(markdown)) return [];
  if (!target) {
    return ['--post-submit-observe-json is required when Rehearsal Assembly Evidence includes post-submit evidence'];
  }
  const sourceTarget = extractAssemblySourceTarget(markdown, 'Post-submit observe JSON report');
  if (!sourceTarget) {
    return ['Post-submit observe JSON report target must be present before --post-submit-observe-json can be validated'];
  }
  if (normalizeTarget(sourceTarget) !== normalizeTarget(target)) {
    return ['--post-submit-observe-json target must match Post-submit observe JSON report target'];
  }
  const { errors, json } = readEvidenceJsonTarget(target, '--post-submit-observe-json');
  if (errors.length > 0) return errors;
  const markdownLivePreflightTarget = extractLivePreflightJsonBindingTarget(markdown);
  const canonicalLivePreflightTarget = livePreflightJsonTarget ?? markdownLivePreflightTarget;
  const validationErrors: string[] = [];
  if (
    livePreflightJsonTarget &&
    markdownLivePreflightTarget &&
    normalizeTarget(livePreflightJsonTarget) !== normalizeTarget(markdownLivePreflightTarget)
  ) {
    validationErrors.push('--live-preflight-json target must match Live-preflight JSON binding target');
  }
  validationErrors.push(...validatePostSubmitObserveJsonReport(json, {
    livePreflightTarget: canonicalLivePreflightTarget,
    livePreflightApprovedBurnTxHashes: canonicalLivePreflightTarget
      ? readLivePreflightApprovedBurnTxHashes(canonicalLivePreflightTarget)
      : undefined,
  }).errors);
  return validationErrors;
}

function readLivePreflightApprovedBurnTxHashes(target: string): string[] | undefined {
  const { errors, json } = readEvidenceJsonTarget(target, '--live-preflight-json');
  if (errors.length > 0 || !isRecord(json)) return undefined;
  const approvalBinding = isRecord(json.approvalBinding) ? json.approvalBinding : undefined;
  if (!Array.isArray(approvalBinding?.burnTxHashes)) return undefined;
  const burnTxHashes = approvalBinding.burnTxHashes.map(value =>
    typeof value === 'string' ? value.trim().toLowerCase().replace(/^0x/, '') : '',
  );
  return burnTxHashes.every(value => /^[0-9a-f]{64}$/.test(value)) ? burnTxHashes : undefined;
}

function extractLivePreflightJsonBindingTarget(markdown: string): string | undefined {
  const line = /^-\s*Live-preflight JSON binding:\s*(.+)$/im.exec(markdown)?.[1];
  if (!line) return undefined;
  return /\[[^\]]+\]\(([^)]+\.json[^)]*)\)/i.exec(line)?.[1] ??
    /\b([^\s<>()]+\.json)\b/i.exec(line)?.[1];
}

function extractRecoveryObserveJsonTargets(text: string): string[] {
  return extractEvidenceTargets(text)
    .map(normalizeTarget)
    .filter(target => /\.json$/i.test(target));
}

function extractEvidenceTargets(text: string): string[] {
  const targets = new Set<string>();
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    targets.add(match[1]);
  }
  for (const match of text.matchAll(/\bartifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>|)]+/g)) {
    targets.add(match[0]);
  }
  for (const match of text.matchAll(/\b(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json\b/g)) {
    targets.add(match[0]);
  }
  return [...targets];
}

function validateLinkedAssemblyReportJson(
  markdown: string,
  completedTarget: string,
  target: string | undefined,
): string[] {
  if (!hasRehearsalAssemblyEvidence(markdown)) return [];
  if (!target) {
    return ['--assembly-report-json is required when Rehearsal Assembly Evidence is present'];
  }

  const { errors, json } = readEvidenceJsonTarget(target, '--assembly-report-json');
  if (errors.length > 0) return errors;
  return validateAssemblyReportJson(json, markdown, completedTarget);
}

function validateLinkedRecoveryObserveJson(markdown: string, targets: string[]): string[] {
  const requiredRows = parseLifecycleGateRows(markdown)
    .filter(row => row.status.toLowerCase() === 'pass' && RECOVERY_GATE_KINDS[row.releaseGate]);
  if (requiredRows.length === 0) return [];
  if (targets.length === 0) {
    return requiredRows.map(row => `--recovery-observe-json is required when ${row.releaseGate} is pass`);
  }

  const errors: string[] = [];
  const validations = targets.map(readRecoveryObserveJsonTarget);
  for (const validation of validations) {
    errors.push(...validation.errors);
  }

  for (const row of requiredRows) {
    const expectedKind = RECOVERY_GATE_KINDS[row.releaseGate];
    const linkedTargets = extractRecoveryObserveJsonTargets(row.evidenceArtifact);
    if (linkedTargets.length === 0) {
      errors.push(`${row.releaseGate}: pass evidence must link a completed recovery-observe JSON validation target`);
      continue;
    }
    const matchingValidation = validations.find(validation =>
      validation.kind === expectedKind && linkedTargets.includes(validation.normalizedTarget)
    );
    if (!matchingValidation) {
      errors.push(`--recovery-observe-json target must match linked ${row.releaseGate} recovery observe JSON report`);
    }
  }

  return errors;
}

function readRecoveryObserveJsonTarget(target: string): RecoveryObserveJsonCliValidation {
  const { errors, json } = readEvidenceJsonTarget(target, '--recovery-observe-json');
  if (errors.length > 0) {
    return {
      target,
      normalizedTarget: normalizeTarget(target),
      errors,
    };
  }
  const validation = validateRecoveryObserveJsonReport(json);
  return {
    target,
    normalizedTarget: normalizeTarget(target),
    errors: validation.errors,
    kind: validation.kind,
  };
}

function validateAssemblyReportJson(
  json: unknown,
  completedMarkdown: string,
  completedTarget: string,
): string[] {
  const errors: string[] = [];
  if (!isRecord(json)) {
    return ['assembly report JSON must be an object'];
  }
  errors.push(...validateTestnetRehearsalAssemblyReport(json).errors);
  if (json.schemaVersion !== 1) {
    errors.push('assembly report JSON schemaVersion must be 1');
  }
  if (json.status !== 'CREATED') {
    errors.push('assembly report JSON status must be CREATED');
  }
  if (!Array.isArray(json.errors)) {
    errors.push('assembly report JSON errors must be an array');
  } else if (json.errors.length > 0) {
    errors.push('assembly report JSON errors must be empty');
  }
  if (!Array.isArray(json.lines) || json.lines.some(line => typeof line !== 'string')) {
    errors.push('assembly report JSON lines must be an array of strings');
  }
  if (typeof json.markdown !== 'string' || json.markdown.trim().length === 0) {
    errors.push('assembly report JSON markdown must be present');
  }

  const targetBindings = isRecord(json.targetBindings) ? json.targetBindings : undefined;
  if (!targetBindings) {
    errors.push('assembly report JSON targetBindings must be present');
    return errors;
  }

  requireTargetBindingMatch(
    errors,
    targetBindings,
    'draft',
    completedMarkdown,
    'Draft source target',
  );
  requireTargetBindingMatch(
    errors,
    targetBindings,
    'livePreflight',
    completedMarkdown,
    'Live-preflight source target',
  );
  requireTargetBindingMatch(
    errors,
    targetBindings,
    'postSubmitObserveJson',
    completedMarkdown,
    'Post-submit observe JSON report',
  );
  requireTargetBindingMatch(
    errors,
    targetBindings,
    'postSubmitObserveJson',
    completedMarkdown,
    'Post-submit source target',
  );
  if (hasIncludedFreshCheckpoint(completedMarkdown)) {
    requireTargetBindingMatch(
      errors,
      targetBindings,
      'freshCheckpoint',
      completedMarkdown,
      'Fresh checkpoint source target',
    );
  }
  for (const [bindingField, assemblyField] of [
    ['failedBroadcast', 'Failed-broadcast source target'],
    ['reorgRecovery', 'Reorg-recovery source target'],
  ] as const) {
    if (extractAssemblySourceTarget(completedMarkdown, assemblyField)) {
      requireTargetBindingMatch(errors, targetBindings, bindingField, completedMarkdown, assemblyField);
    }
  }

  const out = typeof targetBindings.out === 'string' ? targetBindings.out : undefined;
  if (out && normalizeTarget(out) !== normalizeTarget(completedTarget)) {
    errors.push('assembly report JSON targetBindings.out must match the completed rehearsal target when present');
  }
  if (typeof json.markdown === 'string') {
    errors.push(...validateAssemblyReportMarkdownBindings(json.markdown, completedMarkdown));
  }

  return errors;
}

function requireTargetBindingMatch(
  errors: string[],
  targetBindings: Record<string, unknown>,
  bindingField: string,
  completedMarkdown: string,
  assemblyField: string,
): void {
  const bindingTarget = typeof targetBindings[bindingField] === 'string'
    ? targetBindings[bindingField].trim()
    : '';
  const markdownTarget = extractAssemblySourceTarget(completedMarkdown, assemblyField);
  if (!bindingTarget) {
    errors.push(`assembly report JSON targetBindings.${bindingField} must be present`);
    return;
  }
  if (!markdownTarget || normalizeTarget(bindingTarget) !== normalizeTarget(markdownTarget)) {
    errors.push(`assembly report JSON targetBindings.${bindingField} must match ${assemblyField}`);
  }
}

function validateAssemblyReportMarkdownBindings(reportMarkdown: string, completedMarkdown: string): string[] {
  const errors: string[] = [];
  for (const field of [
    'Draft source target',
    'Live-preflight source target',
    'Post-submit source target',
    'Post-submit observe JSON report',
    'Fresh checkpoint source target',
    'Failed-broadcast source target',
    'Reorg-recovery source target',
  ]) {
    const completedTarget = extractAssemblySourceTarget(completedMarkdown, field);
    const reportTarget = extractAssemblySourceTarget(reportMarkdown, field);
    if (completedTarget && (!reportTarget || normalizeTarget(completedTarget) !== normalizeTarget(reportTarget))) {
      errors.push(`assembly report JSON markdown ${field} must match completed rehearsal`);
    }
  }
  return errors;
}

function hasRehearsalAssemblyEvidence(markdown: string): boolean {
  return /^## Rehearsal Assembly Evidence\s*$/im.test(markdown);
}

function hasIncludedFreshCheckpoint(markdown: string): boolean {
  return /^\s*-\s*Fresh checkpoint:\s*included\b/im.test(markdown);
}

function hasIncludedPostSubmitFragment(markdown: string): boolean {
  return /^\s*-\s*Post-submit fragment:\s*included\b/im.test(markdown);
}

function extractFreshCheckpointSourceTarget(markdown: string): string | undefined {
  return extractAssemblySourceTarget(markdown, 'Fresh checkpoint source target');
}

function extractAssemblySourceTarget(markdown: string, field: string): string | undefined {
  const match = new RegExp(`^\\s*-\\s*${escapeRegExp(field)}:\\s*(.+?)\\s*$`, 'im').exec(markdown);
  if (!match) return undefined;
  const value = match[1].trim();
  if (/^not provided$/i.test(value)) return undefined;
  const markdownLink = /\[[^\]]+\]\(([^)]+)\)/.exec(value);
  return markdownLink ? markdownLink[1].trim() : value.split(/\s+/)[0];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeBytes32Hex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
