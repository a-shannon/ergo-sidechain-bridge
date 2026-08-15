import { readFileSync, realpathSync } from 'fs';
import { basename, extname, isAbsolute, relative, resolve } from 'path';

import {
  formatRehearsalValidationTranscriptLines,
  type RehearsalEvidenceValidation,
  validateRehearsalEvidence,
} from './rehearsal-evidence.js';
import { validatePostSubmitObserveJsonReport } from './post-submit-observe-json.js';
import {
  extractBridgeEventRootHexes,
  sameOrderedBridgeEventRoots,
} from './bridge-event-root-evidence.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
} from './evidence-hygiene.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import { validateFreshCheckpointArtifact } from './testnet-offline-rehearsal-gate.js';
import {
  LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE,
  validateLivePreflightJsonReport,
} from './testnet-rehearsal-live-preflight.js';

export type TestnetRehearsalAssembleStatus = 'CREATED' | 'BLOCKED';

export interface TestnetRehearsalAssembleInput {
  draft: string;
  livePreflight: string;
  postSubmit?: string;
  freshCheckpoint?: string;
  failedBroadcast?: string;
  reorgRecovery?: string;
  out?: string;
  workspaceRoot?: string;
  bridgeRoot?: string;
  readFile?: (target: string) => string;
  resolvePath?: (target: string) => string;
}

export interface TestnetRehearsalAssembleReport {
  status: TestnetRehearsalAssembleStatus;
  message: string;
  errors: string[];
  markdown?: string;
  targetBindings: TestnetRehearsalAssembleTargetBindings;
  lines: string[];
  rehearsalValidation?: RehearsalEvidenceValidation;
}

export interface TestnetRehearsalAssemblyReportValidation {
  errors: string[];
  expectedTxId?: string;
  submittedTxId?: string;
  markdown?: string;
}

export interface TestnetRehearsalAssembleTargetBindings {
  draft: string;
  livePreflight: string;
  postSubmitObserveJson?: string;
  freshCheckpoint?: string;
  failedBroadcast?: string;
  reorgRecovery?: string;
  out?: string;
}

interface ArtifactSpec {
  key: 'draft' | 'live-preflight' | 'post-submit' | 'fresh-checkpoint' | 'failed-broadcast' | 'reorg-recovery' | 'out';
  target: string;
  extensions: Set<string>;
  required: boolean;
  read: boolean;
}

interface LoadedArtifacts {
  draft: string;
  draftTarget: string;
  livePreflight: string;
  livePreflightTarget: string;
  postSubmit?: string;
  postSubmitObserveReport?: Record<string, unknown>;
  postSubmitTarget?: string;
  postSubmitObserveJsonTarget?: string;
  freshCheckpoint?: unknown;
  freshCheckpointTarget?: string;
  failedBroadcast?: string;
  failedBroadcastTarget?: string;
  reorgRecovery?: string;
  reorgRecoveryTarget?: string;
}

const blockedTargetLabel = '<blocked rehearsal target>';
const livePreflightHandoffHeading = '## Live Preflight Gate Handoff';
const broadcastEnablementHeading = '## Broadcast Enablement Evidence';
const submitHeading = '## Submit And Confirmation Evidence';
const reconciliationHeading = '## Reconciliation Evidence';
const rollbackHeading = '## Rollback And Cleanup';
const publicationHeading = '## Publication Evidence';
const reviewerSignOffHeading = '## Reviewer Sign-Off';
const dryRunHeading = '## Dry-Run Settlement Evidence';
const lifecycleHeading = '## Lifecycle Gate Classification';
const preflightHeading = '## Preflight Evidence';
const failedBroadcastGate = 'Failed broadcast / phantom AVL evidence';
const reorgRecoveryGate = 'Reorged burn / stale singleton evidence';

const requiredDraftHeadings = [
  '## Session Metadata',
  '## Lifecycle Gate Classification',
  '## Preflight Evidence',
  dryRunHeading,
  livePreflightHandoffHeading,
  broadcastEnablementHeading,
  submitHeading,
  reconciliationHeading,
  rollbackHeading,
  publicationHeading,
  reviewerSignOffHeading,
];

const livePreflightPassLinePattern =
  /^npm run rehearsal:live-preflight command output:\s+(\S+)\s+PASS exit code 0\b(.*)$/im;

interface LivePreflightFacts {
  passLine: string;
  transcriptTarget: string;
  livePreflightTarget: string;
  approvalsTarget: string;
  expectedTxId: string;
}

interface DraftSettlementFacts {
  expectedTxId: string;
  pegOutBurnTxId: string;
  burnTxHashes: string[];
  sidechainBlockHeights: string[];
  sidechainHeaderHashHexes: string[];
  ergoAnchorHeights: string[];
  bridgeEventRootHexes: string[];
  deployedStateHash?: string;
}

interface NormalizedPostSubmitArtifact {
  markdown: string;
  report: Record<string, unknown>;
}

export function assembleTestnetRehearsalCandidate(
  input: TestnetRehearsalAssembleInput,
): TestnetRehearsalAssembleReport {
  const errors: string[] = [];
  const targetBindings = buildTargetBindings(input);
  const artifacts = artifactSpecs(input);
  errors.push(...validateArtifactTargets(artifacts, input));

  const loaded = errors.length === 0 ? loadArtifacts(input, errors) : undefined;
  let liveFacts: LivePreflightFacts | undefined;
  if (loaded) {
    errors.push(...validateDraft(loaded.draft));
    const draftFacts = extractDraftSettlementFacts(loaded.draft);
    if (!draftFacts.expectedTxId) {
      errors.push('draft: Expected transaction ID is required');
    }
    if (!draftFacts.pegOutBurnTxId) {
      errors.push('draft: peg-out burn TX ID is required');
    }

    const liveResult = validateLivePreflight(loaded.livePreflight, draftFacts.expectedTxId);
    liveFacts = liveResult.facts;
    errors.push(...liveResult.errors);
    if (loaded.freshCheckpoint !== undefined) {
      errors.push(...validateFreshCheckpointForAssembly(loaded.freshCheckpoint, draftFacts));
    }
    if (loaded.postSubmit !== undefined) {
      if (loaded.postSubmitObserveReport) {
        errors.push(...validatePostSubmitObserveJsonForAssembly(loaded.postSubmitObserveReport, draftFacts));
      }
      errors.push(...validatePostSubmitFragment(loaded.postSubmit, draftFacts.expectedTxId));
      errors.push(...validateEvidenceCompatibility(loaded.draft, loaded.postSubmit));
    }
    if (loaded.failedBroadcast !== undefined) {
      errors.push(...validateRecoveryRowFragment(
        loaded.failedBroadcast,
        failedBroadcastGate,
        'failed-broadcast',
        { expectedTxId: draftFacts.expectedTxId, pegOutBurnTxId: draftFacts.pegOutBurnTxId },
      ));
    }
    if (loaded.reorgRecovery !== undefined) {
      errors.push(...validateRecoveryRowFragment(
        loaded.reorgRecovery,
        reorgRecoveryGate,
        'reorg-recovery',
        { pegOutBurnTxId: draftFacts.pegOutBurnTxId },
      ));
    }
  }

  if (errors.length > 0 || !loaded) {
    const message = `testnet rehearsal assemble BLOCKED: ${errors.length} issue(s)`;
    return {
      status: 'BLOCKED',
      message,
      errors,
      targetBindings,
      lines: [
        message,
        '- scope: offline Markdown/text artifact assembly only; no signing, node query, submit, or confirmation command executed.',
        '- Remaining issues:',
        ...errors.map(error => `  - ${error}`),
        '- Next safe step: fix local artifact evidence and rerun assembly.',
      ],
    };
  }

  const markdown = renderAssembly(loaded.draft, liveFacts!, loaded);
  const validation = validateAssembledRehearsal(markdown);
  const hasPostSubmit = loaded.postSubmit !== undefined;
  if (hasPostSubmit && validation.result.status === 'BLOCKED') {
    const message = `testnet rehearsal assemble BLOCKED: ${validation.result.errors.length} validation issue(s)`;
    return {
      status: 'BLOCKED',
      message,
      errors: validation.result.errors.map(error => `assembled rehearsal validation: ${error}`),
      markdown,
      targetBindings,
      rehearsalValidation: validation.result,
      lines: [
        message,
        `- draft target: ${input.draft}`,
        `- live-preflight target: ${input.livePreflight}`,
        `- post-submit source: ${input.postSubmit}`,
        `- fresh checkpoint: ${input.freshCheckpoint ?? 'not provided'}`,
        '- scope: offline Markdown/text artifact assembly only; no signing, node query, submit, or confirmation command executed.',
        '- Remaining issues:',
        ...validation.result.errors.map(error => `  - ${error}`),
        ...formatFinalTranscriptRequirementLines(),
        '- Next safe step: fix assembled rehearsal evidence and rerun assembly; do not treat this candidate as completed Gate 3 evidence.',
      ],
    };
  }
  const recoveryRows = [
    loaded.failedBroadcast ? 'failed-broadcast' : undefined,
    loaded.reorgRecovery ? 'reorg-recovery' : undefined,
  ].filter(Boolean).join(', ') || 'not provided';
  const message = `testnet rehearsal assemble CREATED${hasPostSubmit ? '' : ' publication-blocker'}`;
  return {
    status: 'CREATED',
    message,
    errors: [],
    markdown,
    targetBindings,
    rehearsalValidation: validation.result,
    lines: [
      message,
      `- draft target: ${input.draft}`,
      `- live-preflight target: ${input.livePreflight}`,
      `- post-submit source: ${input.postSubmit ?? 'not provided'}`,
      `- fresh checkpoint: ${input.freshCheckpoint ?? 'not provided'}`,
      `- recovery row fragments: ${recoveryRows}`,
      `- assembly status: ${hasPostSubmit ? 'post-submit evidence included' : 'publication-blocker'}`,
      '- scope: offline Markdown/text artifact assembly only; no signing, node query, submit, or confirmation command executed.',
      `- assembled rehearsal validation: ${validation.result.status}`,
      ...validation.lines,
    ],
  };
}

export function validateTestnetRehearsalAssemblyReport(
  report: unknown,
): TestnetRehearsalAssemblyReportValidation {
  const errors: string[] = [];
  if (!isRecord(report)) {
    return { errors: ['assembly: structured assembly report JSON is required'] };
  }

  if (report.schemaVersion !== 1) {
    errors.push('assembly: schemaVersion must be 1');
  }
  if (report.status !== 'CREATED') {
    errors.push('assembly: status must be CREATED');
  }
  if (report.message !== 'testnet rehearsal assemble CREATED') {
    errors.push('assembly: message must be testnet rehearsal assemble CREATED');
  }
  if (!Array.isArray(report.errors)) {
    errors.push('assembly: errors must be an array');
  } else if (report.errors.length > 0) {
    errors.push('assembly: errors must be empty');
  }
  if (typeof report.markdown !== 'string' || report.markdown.trim().length === 0) {
    errors.push('assembly: markdown must be present');
  } else if (hasContradictoryValidationFailureMarker(report.markdown)) {
    errors.push('assembly: markdown must not include contradictory failure markers');
  } else if (hasUnresolvedEvidenceIssueMarker(report.markdown)) {
    errors.push('assembly: markdown must not include remaining issues');
  }
  if (!Array.isArray(report.lines) || report.lines.some(line => typeof line !== 'string')) {
    errors.push('assembly: lines must be an array of strings');
  } else {
    const joinedLines = report.lines.join('\n');
    if (report.lines.some(hasContradictoryValidationFailureMarker)) {
      errors.push('assembly: lines must not include contradictory failure markers');
    }
    if (report.lines.some(hasUnresolvedEvidenceIssueMarker)) {
      errors.push('assembly: lines must not include remaining issues');
    }
    if (!/\bassembly status:\s*post-submit evidence included\b/i.test(joinedLines)) {
      errors.push('assembly: lines must prove post-submit evidence included');
    }
    if (!/\bassembled rehearsal validation:\s*PASS\b/i.test(joinedLines)) {
      errors.push('assembly: lines must prove assembled rehearsal validation PASS');
    }
  }

  const targetBindings = isRecord(report.targetBindings) ? report.targetBindings : undefined;
  if (!targetBindings) {
    errors.push('assembly: targetBindings object is required');
  } else {
    for (const field of ['draft', 'livePreflight', 'postSubmitObserveJson', 'freshCheckpoint'] as const) {
      if (typeof targetBindings[field] !== 'string' || targetBindings[field].trim().length === 0) {
        errors.push(`assembly: targetBindings.${field} must be present`);
      }
    }
    for (const [field, target] of Object.entries(targetBindings)) {
      if (typeof target === 'string' && isLocalOnlyEvidenceTarget(target)) {
        errors.push(`assembly: targetBindings.${field} must not reference a local-only path`);
      }
      if (
        typeof target === 'string' &&
        !isBlockedOrPlaceholderTargetLabel(target.trim()) &&
        hasShellUnsafeTargetContent(target)
      ) {
        errors.push(`assembly: targetBindings.${field} must not contain whitespace or shell metacharacters`);
      }
    }
  }

  const rehearsalValidation = isRecord(report.rehearsalValidation) ? report.rehearsalValidation : undefined;
  if (!rehearsalValidation) {
    errors.push('assembly: rehearsalValidation object is required');
  } else {
    if (rehearsalValidation.status !== 'PASS') {
      errors.push('assembly: rehearsalValidation.status must be PASS');
    }
    if (Array.isArray(rehearsalValidation.errors) && rehearsalValidation.errors.length > 0) {
      errors.push('assembly: rehearsalValidation.errors must be empty');
    }
  }

  const markdown = typeof report.markdown === 'string' ? report.markdown : '';
  if (markdown) {
    if (!/\bAssembly status:\s*post-submit evidence included\b/i.test(markdown)) {
      errors.push('assembly: markdown must prove post-submit evidence included');
    }
    if (!/\bPost-submit fragment:\s*included\b/i.test(markdown)) {
      errors.push('assembly: markdown must prove post-submit fragment included');
    }
    if (!/\bFresh checkpoint lifecycle status:\s*publication blocker\b/i.test(markdown)) {
      errors.push('assembly: markdown must preserve fresh checkpoint publication-blocker status');
    }
  }

  const expectedTxId = extractExpectedTxId(markdown);
  const submittedTxId = extractSubmittedTxId(markdown);
  if (!expectedTxId) {
    errors.push('assembly: markdown must expose Expected transaction ID');
  }
  if (!submittedTxId) {
    errors.push('assembly: markdown must expose submitted transaction ID');
  }
  if (expectedTxId && submittedTxId && expectedTxId !== submittedTxId) {
    errors.push('assembly: submitted transaction ID must match Expected transaction ID');
  }

  return {
    errors,
    expectedTxId,
    submittedTxId,
    markdown: errors.length === 0 && markdown ? markdown : undefined,
  };
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\bBLOCKED\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasUnresolvedEvidenceIssueMarker(segment: string): boolean {
  return hasUnresolvedIssueMarker(normalizeEvidenceMarkerText(segment));
}

function buildTargetBindings(input: TestnetRehearsalAssembleInput): TestnetRehearsalAssembleTargetBindings {
  return {
    draft: formatResolvedArtifactTargetLabel(input, input.draft),
    livePreflight: formatResolvedArtifactTargetLabel(input, input.livePreflight),
    postSubmitObserveJson: input.postSubmit ? formatResolvedArtifactTargetLabel(input, input.postSubmit) : undefined,
    freshCheckpoint: input.freshCheckpoint ? formatResolvedArtifactTargetLabel(input, input.freshCheckpoint) : undefined,
    failedBroadcast: input.failedBroadcast ? formatResolvedArtifactTargetLabel(input, input.failedBroadcast) : undefined,
    reorgRecovery: input.reorgRecovery ? formatResolvedArtifactTargetLabel(input, input.reorgRecovery) : undefined,
    out: input.out ? formatTargetLabel(input.out) : undefined,
  };
}

function artifactSpecs(input: TestnetRehearsalAssembleInput): ArtifactSpec[] {
  return [
    {
      key: 'draft',
      target: input.draft,
      extensions: new Set(['.md']),
      required: true,
      read: true,
    },
    {
      key: 'live-preflight',
      target: input.livePreflight,
      extensions: new Set(['.md', '.log', '.txt', '.json']),
      required: true,
      read: true,
    },
    {
      key: 'post-submit',
      target: input.postSubmit ?? '',
      extensions: new Set(['.json']),
      required: false,
      read: true,
    },
    {
      key: 'fresh-checkpoint',
      target: input.freshCheckpoint ?? '',
      extensions: new Set(['.json']),
      required: false,
      read: true,
    },
    {
      key: 'failed-broadcast',
      target: input.failedBroadcast ?? '',
      extensions: new Set(['.md', '.txt']),
      required: false,
      read: true,
    },
    {
      key: 'reorg-recovery',
      target: input.reorgRecovery ?? '',
      extensions: new Set(['.md', '.txt']),
      required: false,
      read: true,
    },
    {
      key: 'out',
      target: input.out ?? '',
      extensions: new Set(['.md']),
      required: false,
      read: false,
    },
  ];
}

function validateArtifactTargets(
  specs: ArtifactSpec[],
  input: TestnetRehearsalAssembleInput,
): string[] {
  const errors: string[] = [];
  const comparableTargets: string[] = [];

  for (const spec of specs) {
    if (!spec.required && spec.target.trim().length === 0) continue;
    const specErrors = validateSingleArtifactTarget(spec);
    errors.push(...specErrors);
    if (!specErrors.some(error => error.includes('absolute') || error.includes('URI'))) {
      comparableTargets.push(resolveComparableTarget(spec.target, input));
    }
  }

  if (new Set(comparableTargets).size !== comparableTargets.length) {
    errors.push('Artifact targets must be distinct');
  }

  return errors;
}

function validateSingleArtifactTarget(spec: ArtifactSpec): string[] {
  const target = spec.target.trim();
  const label = formatTargetLabel(target);
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  const name = basename(normalized);
  const extension = extname(name);
  const errors: string[] = [];

  if (target.length === 0) {
    errors.push(`${spec.key}: required artifact is missing`);
    return errors;
  }
  if (!spec.extensions.has(extension)) {
    errors.push(`${spec.key}: ${label} must have extension ${[...spec.extensions].join(', ')}`);
  }
  if (isLocalAbsoluteTarget(normalized)) {
    errors.push(`${spec.key}: ${label} must be a relative path inside the bridge repository`);
  }
  if (hasUriSchemeTarget(normalized)) {
    errors.push(`${spec.key}: ${label} must not be a URI`);
  }
  if (!isBlockedOrPlaceholderTargetLabel(target) && hasShellUnsafeTargetContent(target)) {
    errors.push(`${spec.key}: ${label} must not contain whitespace or shell metacharacters`);
  }
  if (escapesBridgeRoot(normalized)) {
    errors.push(`${spec.key}: ${blockedTargetLabel} must not escape the bridge repository`);
  }
  if (isSensitiveOrRuntimeTarget(normalized)) {
    errors.push(`${spec.key}: ${blockedTargetLabel} must not reference runtime or secret-bearing material`);
  }

  return errors;
}

function loadArtifacts(input: TestnetRehearsalAssembleInput, errors: string[]): LoadedArtifacts | undefined {
  const draft = readArtifact(input, input.draft, 'draft', errors);
  const livePreflight = readArtifact(input, input.livePreflight, 'live-preflight', errors);
  const postSubmit = input.postSubmit
    ? readArtifact(input, input.postSubmit, 'post-submit', errors)
    : undefined;
  const freshCheckpointText = input.freshCheckpoint
    ? readArtifact(input, input.freshCheckpoint, 'fresh-checkpoint', errors)
    : undefined;
  const failedBroadcast = input.failedBroadcast
    ? readArtifact(input, input.failedBroadcast, 'failed-broadcast', errors)
    : undefined;
  const reorgRecovery = input.reorgRecovery
    ? readArtifact(input, input.reorgRecovery, 'reorg-recovery', errors)
    : undefined;

  if (errors.length > 0 || draft === undefined || livePreflight === undefined) return undefined;
  const normalizedPostSubmit = postSubmit === undefined
    ? undefined
    : normalizePostSubmitArtifact(
      postSubmit,
      input.postSubmit!,
      errors,
      resolveLivePreflightJsonReportTarget(input.livePreflight, livePreflight),
    );
  const freshCheckpoint = freshCheckpointText === undefined
    ? undefined
    : parseJsonArtifact(freshCheckpointText, input.freshCheckpoint!, 'fresh-checkpoint', errors);
  if (errors.length > 0) return undefined;
  return {
    draft,
    draftTarget: input.draft,
    livePreflight,
    livePreflightTarget: input.livePreflight,
    postSubmit: normalizedPostSubmit?.markdown,
    postSubmitObserveReport: normalizedPostSubmit?.report,
    postSubmitTarget: input.postSubmit,
    postSubmitObserveJsonTarget: input.postSubmit && extname(input.postSubmit).toLowerCase() === '.json'
      ? input.postSubmit
      : undefined,
    freshCheckpoint,
    freshCheckpointTarget: input.freshCheckpoint,
    failedBroadcast,
    failedBroadcastTarget: input.failedBroadcast,
    reorgRecovery,
    reorgRecoveryTarget: input.reorgRecovery,
  };
}

function readArtifact(
  input: TestnetRehearsalAssembleInput,
  target: string,
  label: string,
  errors: string[],
): string | undefined {
  try {
    if (input.readFile) return input.readFile(target);

    const workspaceRoot = resolve(input.workspaceRoot ?? process.cwd());
    const bridgeRoot = resolve(input.bridgeRoot ?? resolve(workspaceRoot, '..'));
    const resolvedBridgeRoot = realpathSync(bridgeRoot);
    const artifactPath = realpathSync(resolve(workspaceRoot, target));
    if (!isInsidePath(artifactPath, resolvedBridgeRoot)) {
      errors.push(`${label}: ${blockedTargetLabel} must resolve inside the bridge repository`);
      return undefined;
    }
    return readFileSync(artifactPath, 'utf8');
  } catch {
    errors.push(`${label}: ${formatTargetLabel(target)} could not be read`);
    return undefined;
  }
}

function parseJsonArtifact(
  text: string,
  target: string,
  label: string,
  errors: string[],
): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    errors.push(`${label}: ${formatTargetLabel(target)} must be valid JSON`);
    return undefined;
  }
}

function normalizePostSubmitArtifact(
  text: string,
  target: string,
  errors: string[],
  livePreflightJsonTarget?: string,
): NormalizedPostSubmitArtifact | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) {
    errors.push('post-submit: JSON observe report must be valid JSON');
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    errors.push('post-submit: JSON observe report must be valid JSON');
    return undefined;
  }

  if (!livePreflightJsonTarget) {
    errors.push('post-submit: live-preflight artifact must cite live preflight report written JSON target');
  }
  const validation = validatePostSubmitObserveJsonReport(value, {
    livePreflightTarget: livePreflightJsonTarget,
  });
  errors.push(...validation.errors);
  if (!validation.markdown || !isRecord(value)) return undefined;
  return {
    markdown: validation.markdown,
    report: value,
  };
}

function validateDraft(markdown: string): string[] {
  const errors: string[] = [];
  if (!/^# Testnet Live Rehearsal Draft\s*$/m.test(markdown)) {
    errors.push('draft: Testnet Live Rehearsal Draft title is required');
  }

  let previousIndex = -1;
  for (const heading of requiredDraftHeadings) {
    const ranges = headingRanges(markdown, heading);
    if (ranges.length === 0) {
      errors.push(`draft: ${heading.slice(3)} section is required`);
      continue;
    }
    if (ranges.length > 1) {
      errors.push(`draft: ${heading.slice(3)} section must appear exactly once`);
      continue;
    }
    if (ranges[0].start <= previousIndex) {
      errors.push(`draft: ${heading.slice(3)} section appears out of order`);
    }
    previousIndex = ranges[0].start;
  }
  return errors;
}

function validateFreshCheckpointForAssembly(
  artifact: unknown,
  draftFacts: DraftSettlementFacts,
): string[] {
  const errors = validateFreshCheckpointArtifact(artifact);
  if (errors.length > 0) return errors;
  if (!isRecord(artifact) || !isRecord(artifact.checkpoint)) {
    return ['fresh-checkpoint: checkpoint object is required'];
  }

  const checkpoint = artifact.checkpoint;
  const expectedTxId = normalizeHex32Value(checkpoint.expectedTxId);
  if (!expectedTxId || expectedTxId !== draftFacts.expectedTxId) {
    errors.push('fresh-checkpoint: Expected transaction ID must match draft Expected transaction ID');
  }

  const burnTxHashes = normalizeHex32ArrayValue(checkpoint.burnTxHashes);
  if (!burnTxHashes || !burnTxHashes.includes(draftFacts.pegOutBurnTxId)) {
    errors.push('fresh-checkpoint: burnTxHashes must include draft peg-out burn TX ID');
  } else if (draftFacts.burnTxHashes.length > 0 && burnTxHashes.join(',') !== draftFacts.burnTxHashes.join(',')) {
    errors.push('fresh-checkpoint: burnTxHashes must match draft ordered burn set');
  }

  const sidechainBlockHeights = normalizeNumberArrayValue(checkpoint.sidechainBlockHeights);
  if (
    sidechainBlockHeights &&
    draftFacts.sidechainBlockHeights.length > 0 &&
    sidechainBlockHeights.join(',') !== draftFacts.sidechainBlockHeights.join(',')
  ) {
    errors.push('fresh-checkpoint: sidechainBlockHeights must match draft sidechain block heights');
  }

  const sidechainHeaderHashHexes = normalizeHex32ArrayValue(checkpoint.sidechainHeaderHashHexes);
  if (
    sidechainHeaderHashHexes &&
    draftFacts.sidechainHeaderHashHexes.length > 0 &&
    sidechainHeaderHashHexes.join(',') !== draftFacts.sidechainHeaderHashHexes.join(',')
  ) {
    errors.push('fresh-checkpoint: sidechainHeaderHashHexes must match draft sidechain block hashes');
  }

  const ergoAnchorHeights = normalizeNumberArrayValue(checkpoint.ergoAnchorHeights);
  if (
    ergoAnchorHeights &&
    draftFacts.ergoAnchorHeights.length > 0 &&
    ergoAnchorHeights.join(',') !== draftFacts.ergoAnchorHeights.join(',')
  ) {
    errors.push('fresh-checkpoint: ergoAnchorHeights must match draft Ergo anchor heights');
  }

  const bridgeEventRootHexes = normalizeHex32ArrayValue(checkpoint.bridgeEventRootHexes);
  if (
    bridgeEventRootHexes &&
    draftFacts.bridgeEventRootHexes.length > 0 &&
    !sameOrderedBridgeEventRoots(bridgeEventRootHexes, draftFacts.bridgeEventRootHexes)
  ) {
    errors.push('fresh-checkpoint: bridgeEventRootHexes must match draft bridge event roots');
  }

  if (draftFacts.deployedStateHash) {
    const singletonCheckpoint = isRecord(checkpoint.singletonCheckpoint) ? checkpoint.singletonCheckpoint : undefined;
    const deployedStateHash = normalizeHex32Value(singletonCheckpoint?.deployedStateHash);
    if (!deployedStateHash || deployedStateHash !== draftFacts.deployedStateHash) {
      errors.push('fresh-checkpoint: deployed-state hash must match draft clean deployment state evidence');
    }
  }

  return errors;
}

function validatePostSubmitObserveJsonForAssembly(
  report: Record<string, unknown>,
  draftFacts: DraftSettlementFacts,
): string[] {
  const errors: string[] = [];
  const observation = isRecord(report.observation) ? report.observation : undefined;
  const txBinding = isRecord(observation?.txBinding) ? observation.txBinding : undefined;
  const expectedTxId = normalizeHex32Value(txBinding?.expectedTxId);
  const submittedTxId = normalizeHex32Value(txBinding?.submittedTxId);

  if (draftFacts.expectedTxId && expectedTxId !== draftFacts.expectedTxId) {
    errors.push('post-submit: JSON observe report expectedTxId must match draft Expected transaction ID');
  }
  if (draftFacts.expectedTxId && submittedTxId !== draftFacts.expectedTxId) {
    errors.push('post-submit: JSON observe report submittedTxId must match draft Expected transaction ID');
  }

  const burnOrder = normalizeHex32ArrayValue(observation?.burnOrder);
  if (draftFacts.pegOutBurnTxId && (!burnOrder || !burnOrder.includes(draftFacts.pegOutBurnTxId))) {
    errors.push('post-submit: JSON observe report burnOrder must include draft peg-out burn TX ID');
  } else if (burnOrder && draftFacts.burnTxHashes.length > 0 && burnOrder.join(',') !== draftFacts.burnTxHashes.join(',')) {
    errors.push('post-submit: JSON observe report burnOrder must match draft ordered burn set');
  }

  return errors;
}

function resolveLivePreflightJsonReportTarget(inputTarget: string, artifactText: string): string | undefined {
  return extname(inputTarget).toLowerCase() === '.json'
    ? inputTarget
    : extractLivePreflightJsonReportTarget(artifactText);
}

function extractLivePreflightJsonReportTarget(text: string): string | undefined {
  return /^-\s*live preflight report written:\s*(\S+\.json)\s*$/im.exec(text)?.[1]?.trim();
}

function validateLivePreflight(
  text: string,
  expectedTxId: string | undefined,
): { errors: string[]; facts?: LivePreflightFacts } {
  const normalized = normalizeLivePreflightText(text);
  if (normalized.errors.length > 0) return { errors: normalized.errors };

  const hasBlocked = /\b(?:BLOCKED|FAIL(?:ED)?)\b/i.test(normalized.text);
  const errors: string[] = [];

  if (hasBlocked) {
    errors.push('live-preflight: artifact must not contain BLOCKED/FAIL');
  }

  const lineMatch = livePreflightPassLinePattern.exec(normalized.text);
  if (!lineMatch) {
    errors.push('live-preflight: artifact must include rehearsal:live-preflight PASS exit code 0 output');
    return { errors };
  }

  const passLine = lineMatch[0].trim();
  const transcriptTarget = lineMatch[1].trim();
  const rest = lineMatch[2].trim();
  errors.push(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
  if (!isCompletedEvidenceTarget(transcriptTarget)) {
    errors.push('live-preflight: transcript target must be a completed artifact target or non-template link');
  }

  const targets = /\blive-preflight target\s+(\S+)\s+approvals file target\s+(\S+)/i.exec(rest);
  const livePreflightTarget = targets?.[1]?.trim() ?? '';
  const approvalsTarget = targets?.[2]?.trim() ?? '';
  if (!targets) {
    errors.push('live-preflight: PASS output must cite live-preflight and approvals targets');
  } else {
    if (new Set([transcriptTarget, livePreflightTarget, approvalsTarget]).size !== 3) {
      errors.push('live-preflight: transcript, live-preflight, and approvals targets must be distinct');
    }
    if (!isCompletedEvidenceTarget(livePreflightTarget)) {
      errors.push('live-preflight: live-preflight target must cite a completed rehearsal artifact target or non-template link');
    }
    if (!isConcreteJsonEvidenceTarget(approvalsTarget)) {
      errors.push('live-preflight: approvals file target must cite a concrete non-template JSON approvals target');
    }
  }

  const liveExpectedTxId = extractExpectedTxIdFromText(passLine);
  if (!liveExpectedTxId) {
    errors.push('live-preflight: PASS output must cite Expected transaction ID');
  } else if (expectedTxId && liveExpectedTxId !== expectedTxId) {
    errors.push('live-preflight: Expected transaction ID must match draft Expected transaction ID');
  }

  const requiredFacts: Array<[RegExp, string]> = [
    [/\bapproval JSON binding matched\b/i, 'approval JSON binding matched'],
    [/\breviewer approval evidence linked\b/i, 'reviewer approval evidence linked'],
    [/\buser explicit live broadcast approval evidence linked\b/i, 'user explicit live broadcast approval evidence linked'],
    [/\bscoped shell evidence\b/i, 'scoped shell evidence'],
    [/\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i, 'BRIDGE_BROADCAST_ENABLED=true'],
    [/\bscope limited\b/i, 'scope limited'],
    [/\bnpm run demo:readiness PASS\b/i, 'npm run demo:readiness PASS'],
    [/\bBroadcast policy PASS\b/i, 'Broadcast policy PASS'],
    [/\bLive settlement signing PASS\b/i, 'Live settlement signing PASS'],
    [/\bErgo node network\b.{0,80}\btest[- ]?net\b/i, 'Ergo node network testnet'],
    [/\bSidechain network\b.{0,80}\b(?:patched[- ]?devnet|test[- ]?net|non[- ]?main[- ]?net)\b/i, 'non-mainnet sidechain network'],
  ];

  for (const [pattern, label] of requiredFacts) {
    if (!pattern.test(passLine)) errors.push(`live-preflight: PASS output must cite ${label}`);
  }
  if (textIndicatesMainnetTarget(passLine)) {
    errors.push('live-preflight: PASS output must not indicate mainnet');
  }

  if (errors.length > 0 || !liveExpectedTxId) {
    return { errors };
  }
  return {
    errors,
    facts: {
      passLine,
      transcriptTarget,
      livePreflightTarget,
      approvalsTarget,
      expectedTxId: liveExpectedTxId,
    },
  };
}

function normalizeLivePreflightText(text: string): { text: string; errors: string[] } {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return { text, errors: [] };

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { text, errors: ['live-preflight: JSON report must be valid JSON'] };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { text, errors: ['live-preflight: JSON report must be an object'] };
  }

  const report = value as Record<string, unknown>;
  const errors = validateLivePreflightJsonReport(report);

  if (errors.length > 0) return { text, errors };
  return { text: (report.lines as string[]).join('\n'), errors: [] };
}

function validatePostSubmitFragment(fragment: string, expectedTxId?: string): string[] {
  const errors: string[] = [];
  for (const heading of [submitHeading, reconciliationHeading]) {
    const ranges = headingRanges(fragment, heading);
    if (ranges.length === 0) errors.push(`post-submit: ${heading.slice(3)} section is required`);
    if (ranges.length > 1) errors.push(`post-submit: ${heading.slice(3)} section must appear exactly once`);
  }
  if (textIndicatesMainnetTarget(fragment)) {
    errors.push('post-submit: fragment must not indicate mainnet');
  }
  if (indicatesMissingBroadcastApproval(fragment)) {
    errors.push('post-submit: fragment must not indicate missing broadcast approval');
  }
  const submitSection = sectionBetween(fragment, submitHeading, reconciliationHeading);
  const reconciliationSection = sectionBetween(fragment, reconciliationHeading);
  const gateBindingSection = sectionBetween(fragment, '## Post-Submit Gate Binding');
  if (!hasCompletedEvidenceTarget(submitSection)) {
    errors.push('post-submit: submit/confirmation section must include completed evidence target');
  }
  if (!hasCompletedEvidenceTarget(reconciliationSection)) {
    errors.push('post-submit: reconciliation section must include completed evidence target');
  }

  const submittedTxId = extractSubmittedTxId(fragment);
  if (!submittedTxId) {
    errors.push('post-submit: Submitted transaction ID is required');
  }
  errors.push(...validatePostSubmitLivePreflightBinding(gateBindingSection, expectedTxId));
  const confirmationPolicy = /^-\s*Confirmation policy met:\s*(.+)$/im.exec(submitSection)?.[1] ?? '';
  if (!/\byes\b/i.test(confirmationPolicy)) {
    errors.push('post-submit: Confirmation policy met must be yes');
  }
  if (!submittedTxId || !confirmationPolicy.toLowerCase().includes(submittedTxId)) {
    errors.push('post-submit: Confirmation policy met must cite submitted transaction ID');
  }
  const confirmationsRequired = parsePositiveInteger(/\bconfirmationsRequired=(\d+)\b/i.exec(confirmationPolicy)?.[1] ?? '');
  const confirmationsObserved = parsePositiveInteger(/\bconfirmationsObserved=(\d+)\b/i.exec(confirmationPolicy)?.[1] ?? '');
  if (confirmationsRequired === undefined) {
    errors.push('post-submit: Confirmation policy met must cite positive confirmationsRequired');
  }
  if (confirmationsObserved === undefined) {
    errors.push('post-submit: Confirmation policy met must cite positive confirmationsObserved');
  }
  if (
    confirmationsRequired !== undefined &&
    confirmationsObserved !== undefined &&
    confirmationsObserved < confirmationsRequired
  ) {
    errors.push('post-submit: confirmationsObserved must be greater than or equal to confirmationsRequired');
  }

  const requiredSubmitFacts: Array<[RegExp, string]> = [
    [/^-\s*DUP successor box ID:\s*(?:0x)?[0-9a-fA-F]{64}\b.*$/im, 'DUP successor box ID'],
    [/^-\s*SPV tracker successor box ID:\s*(?:0x)?[0-9a-fA-F]{64}\b.*$/im, 'SPV tracker successor box ID'],
    [/^-\s*Recipient payout box ID:\s*(?:0x)?[0-9a-fA-F]{64}\b.*$/im, 'Recipient payout box ID'],
  ];
  for (const [pattern, label] of requiredSubmitFacts) {
    if (!pattern.test(submitSection)) errors.push(`post-submit: ${label} is required`);
  }

  const requiredReconciliationFacts: Array<[RegExp, string]> = [
    [/^-\s*Peg-out status after reconciliation:.*\bsubmitted transaction ID\b.*$/im, 'Peg-out status after reconciliation'],
    [/^-\s*DUP history contains only confirmed keys:\s*yes\b.*\bsubmitted DUP successor box ID\b.*$/im, 'DUP confirmed history'],
    [/^-\s*SPV tracker digest matches confirmed successor:\s*yes\b.*\bsubmitted SPV tracker successor box ID\b.*$/im, 'SPV confirmed successor'],
    [/^-\s*No duplicate payout exists for the same burn:\s*yes\b.*\bpeg-out burn TX ID\b.*\brecipient payout box ID\b.*$/im, 'no duplicate payout evidence'],
  ];
  for (const [pattern, label] of requiredReconciliationFacts) {
    if (!pattern.test(reconciliationSection)) errors.push(`post-submit: ${label} is required`);
  }
  return errors;
}

function validatePostSubmitLivePreflightBinding(section: string, expectedTxId?: string): string[] {
  const errors: string[] = [];
  const binding = /^-\s*Live-preflight JSON binding:\s*(.+)$/im.exec(section)?.[1] ?? '';
  if (!binding) {
    return ['post-submit: Live-preflight JSON binding is required'];
  }
  const boundJsonTarget = /(\S+\.json)\b/i.exec(binding)?.[1]?.trim().replace(/[),;]+$/g, '');
  if (!boundJsonTarget || !isConcreteJsonEvidenceTarget(boundJsonTarget)) {
    errors.push('post-submit: Live-preflight JSON binding must cite a concrete non-template JSON report');
  }
  if (!/\bstatus\s+GO\b/i.test(binding)) {
    errors.push('post-submit: Live-preflight JSON binding must cite status GO');
  }
  if (!/\bruntimeBroadcastEnabled\s*[:=]?\s*false\b/i.test(binding)) {
    errors.push('post-submit: Live-preflight JSON binding must cite runtimeBroadcastEnabled false');
  }
  if (expectedTxId && !binding.toLowerCase().includes(expectedTxId)) {
    errors.push('post-submit: Live-preflight JSON binding must cite draft Expected transaction ID');
  }
  if (!/\bpre-submit boundary preserved\b/i.test(binding)) {
    errors.push('post-submit: Live-preflight JSON binding must preserve the pre-submit boundary');
  }
  if (!/\bauthorization evidence linked\b/i.test(binding)) {
    errors.push('post-submit: Live-preflight JSON binding must cite linked authorization evidence');
  }
  return errors;
}

function validateEvidenceCompatibility(draft: string, postSubmit: string): string[] {
  const errors: string[] = [];
  const expectedTxId = extractExpectedTxId(draft);
  const submittedTxId = extractSubmittedTxId(postSubmit);
  if (expectedTxId && submittedTxId && expectedTxId !== submittedTxId) {
    errors.push('post-submit: submitted transaction ID must match draft Expected transaction ID');
  }
  return errors;
}

function validateRecoveryRowFragment(
  fragment: string,
  gate: string,
  label: string,
  expected: { expectedTxId?: string; pegOutBurnTxId?: string },
): string[] {
  const errors: string[] = [];
  const row = extractLifecycleRow(fragment, gate);
  if (!row) {
    errors.push(`${label}: fragment must include exactly one ${gate} lifecycle row`);
    return errors;
  }
  if (hasRecoveryRowFailureMarker(row)) {
    errors.push(`${label}: fragment must not contain BLOCKED/FAIL`);
  }
  if (!isPassLifecycleRow(row, gate)) {
    errors.push(`${label}: ${gate} row status must be pass`);
  }
  if (!hasCompletedEvidenceTarget(row)) {
    errors.push(`${label}: ${gate} row must include completed evidence target`);
  }
  if (!hasRecoveryObservationPassEvidence(row)) {
    errors.push(`${label}: ${gate} row must cite structured recovery observation PASS evidence`);
  }
  if (!hasRecoveryObservationJsonValidationPassEvidence(row)) {
    errors.push(`${label}: ${gate} row must cite recovery-observe JSON validation PASS evidence`);
  }
  if (label === 'reorg-recovery') {
    if (!hasRecoveryValidationPassEvidence(row)) {
      errors.push(`${label}: ${gate} row must cite rehearsal:validate or test PASS evidence`);
    }
  } else if (!/\bnpm run rehearsal:validate command output:\s*PASS\b/i.test(row)) {
    errors.push(`${label}: ${gate} row must cite rehearsal:validate PASS evidence`);
  }
  if (textIndicatesMainnetTarget(row)) {
    errors.push(`${label}: fragment must not indicate mainnet`);
  }
  if (hasRecoveryRowBroadcastEnablement(row)) {
    errors.push(`${label}: fragment must not enable broadcast`);
  }
  if (expected.expectedTxId) {
    const rowExpectedTxId = extractExpectedTxIdFromRecoveryRow(row);
    if (!rowExpectedTxId || rowExpectedTxId !== expected.expectedTxId) {
      errors.push(`${label}: Expected transaction ID must match draft Expected transaction ID`);
    }
  }
  if (expected.pegOutBurnTxId) {
    const rowBurnTxId = extractPegOutBurnTxIdFromText(row);
    if (!rowBurnTxId || rowBurnTxId !== expected.pegOutBurnTxId) {
      errors.push(`${label}: peg-out burn TX ID must match draft peg-out burn TX ID`);
    }
  }
  return errors;
}

function hasRecoveryRowFailureMarker(row: string): boolean {
  return /\bBLOCKED\b|\bFAIL(?:ED)?\b(?![- ]broadcast)/i.test(normalizeEvidenceMarkerText(row));
}

function hasRecoveryRowBroadcastEnablement(row: string): boolean {
  return /\bBRIDGE_BROADCAST_ENABLED\s*(?:=|:|is)\s*true\b/i.test(normalizeEvidenceMarkerText(row));
}

function hasRecoveryObservationPassEvidence(row: string): boolean {
  return /\bstructured recovery observation PASS\b/i.test(row) &&
    /\bobservation\s+artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>|]+/i.test(row);
}

function hasRecoveryObservationJsonValidationPassEvidence(row: string): boolean {
  const observationTarget = extractRecoveryObservationTarget(row);
  const validationTarget = extractRecoveryObservationValidationTarget(row);
  return /\bnpm run rehearsal:recovery-observe:validate command output:\s*PASS\b/i.test(row) &&
    /\brecovery-observe JSON validation PASS\b/i.test(row) &&
    observationTarget !== undefined &&
    validationTarget !== undefined &&
    observationTarget === validationTarget;
}

function extractRecoveryObservationTarget(row: string): string | undefined {
  const match = row.match(/\bobservation\s+(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>|]+)/i);
  return match?.[1]?.toLowerCase();
}

function extractRecoveryObservationValidationTarget(row: string): string | undefined {
  const match = row.match(/\brecovery-observe validation target\s+(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>|]+)/i);
  return match?.[1]?.toLowerCase();
}

function hasRecoveryValidationPassEvidence(row: string): boolean {
  return (
    /\bnpm run rehearsal:validate command output:\s*PASS\b/i.test(row) ||
    /\b(?:test|vitest|CI|workflow) evidence command output:\s*PASS\b/i.test(row)
  );
}

function renderAssembly(draft: string, liveFacts: LivePreflightFacts, loaded: LoadedArtifacts): string {
  const withRecoveryRows = replaceRecoveryRows(draft, loaded);
  const withLivePreflight = replaceSectionBody(
    withRecoveryRows,
    livePreflightHandoffHeading,
    formatLivePreflightHandoff(liveFacts),
  );
  const withPostSubmit = loaded.postSubmit !== undefined
    ? replaceHeadingRange(
      withLivePreflight,
      submitHeading,
      rollbackHeading,
      stripClaimControlLines(loaded.postSubmit).trim(),
    )
    : withLivePreflight;
  const recoveryRows = [
    loaded.failedBroadcast ? 'failed-broadcast' : undefined,
    loaded.reorgRecovery ? 'reorg-recovery' : undefined,
  ].filter(Boolean).join(', ') || 'not provided';
  const freshCheckpointFacts = loaded.freshCheckpoint
    ? summarizeFreshCheckpointForAssembly(loaded.freshCheckpoint)
    : undefined;

  const assemblySection = [
    '## Rehearsal Assembly Evidence',
    '',
    `- Assembly status: ${loaded.postSubmit ? 'post-submit evidence included' : 'publication-blocker'}`,
    `- Draft source target: [draft source](${loaded.draftTarget})`,
    `- Live-preflight source target: [live-preflight source](${loaded.livePreflightTarget})`,
    `- Live-preflight artifact: PASS ${liveFacts.transcriptTarget}`,
    `- Live-preflight Expected transaction ID: ${liveFacts.expectedTxId}`,
    `- Post-submit fragment: ${loaded.postSubmit ? 'included' : 'not provided'}`,
    `- Post-submit source target: ${loaded.postSubmitTarget ? `[post-submit source](${loaded.postSubmitTarget})` : 'not provided'}`,
    `- Post-submit observe JSON report: ${loaded.postSubmitObserveJsonTarget ? `[post-submit observe JSON](${loaded.postSubmitObserveJsonTarget})` : 'not provided'}`,
    `- Fresh checkpoint: ${freshCheckpointFacts ? 'included' : 'not provided'}`,
    `- Fresh checkpoint source target: ${loaded.freshCheckpointTarget ? `[fresh-checkpoint source](${loaded.freshCheckpointTarget})` : 'not provided'}`,
    `- Fresh checkpoint sourceBindings: ${freshCheckpointFacts?.sourceBindingsSummary ?? 'not provided'}`,
    `- Fresh checkpoint lifecycle status: ${freshCheckpointFacts?.lifecycleStatus ?? 'not provided'}`,
    `- Fresh checkpoint Expected transaction ID: ${freshCheckpointFacts?.expectedTxId ?? 'not provided'}`,
    `- Fresh checkpoint deployed-state hash: ${freshCheckpointFacts?.deployedStateHash ?? 'not provided'}`,
    `- Fresh checkpoint singleton freshness: ${freshCheckpointFacts?.freshnessStatus ?? 'not provided'} ageSeconds=${freshCheckpointFacts?.ageSeconds ?? 'not provided'} maxAgeSeconds=${freshCheckpointFacts?.maxAgeSeconds ?? 'not provided'}`,
    `- Fresh checkpoint live anchor observations: ${freshCheckpointFacts?.anchorObservationSummary ?? 'not provided'}`,
    '- Fresh checkpoint boundary: offline/non-broadcast; does not authorize broadcast, close Gate 3, replace live submit/confirmation/reconciliation, or support production-ready/testnet production-candidate claims.',
    `- Recovery row fragments: ${recoveryRows}`,
    `- Failed-broadcast source target: ${loaded.failedBroadcastTarget ? `[failed-broadcast source](${loaded.failedBroadcastTarget})` : 'not provided'}`,
    `- Reorg-recovery source target: ${loaded.reorgRecoveryTarget ? `[reorg-recovery source](${loaded.reorgRecoveryTarget})` : 'not provided'}`,
    '- Offline assembly scope: no signing, node query, submit, confirm, or broadcast command executed by this helper.',
    '',
  ].join('\n');

  return insertAfterTitle(withPostSubmit, assemblySection);
}

function summarizeFreshCheckpointForAssembly(artifact: unknown): {
  expectedTxId?: string;
  lifecycleStatus?: string;
  deployedStateHash?: string;
  freshnessStatus?: string;
  ageSeconds?: string;
  maxAgeSeconds?: string;
  anchorObservationSummary?: string;
  sourceBindingsSummary?: string;
} {
  if (!isRecord(artifact) || !isRecord(artifact.checkpoint)) return {};
  const checkpoint = artifact.checkpoint;
  const singletonCheckpoint = isRecord(checkpoint.singletonCheckpoint) ? checkpoint.singletonCheckpoint : undefined;
  const freshness = isRecord(checkpoint.singletonObservationFreshness)
    ? checkpoint.singletonObservationFreshness
    : undefined;
  return {
    expectedTxId: normalizeHex32Value(checkpoint.expectedTxId),
    lifecycleStatus: typeof checkpoint.lifecycleStatus === 'string' ? checkpoint.lifecycleStatus : undefined,
    deployedStateHash: normalizeHex32Value(singletonCheckpoint?.deployedStateHash),
    freshnessStatus: typeof freshness?.status === 'string' ? freshness.status : undefined,
    ageSeconds: freshness?.ageSeconds === undefined ? undefined : String(freshness.ageSeconds),
    maxAgeSeconds: freshness?.maxAgeSeconds === undefined ? undefined : String(freshness.maxAgeSeconds),
    anchorObservationSummary: summarizeFreshCheckpointAnchorObservations(artifact),
    sourceBindingsSummary: summarizeFreshCheckpointSourceBindings(artifact),
  };
}

function summarizeFreshCheckpointSourceBindings(artifact: Record<string, unknown>): string | undefined {
  const bindings = isRecord(artifact.sourceBindings) ? artifact.sourceBindings : undefined;
  if (!bindings) return undefined;
  const height = isRecord(bindings.heightEvidence) ? bindings.heightEvidence : undefined;
  const singleton = isRecord(bindings.singletonCheckpoint) ? bindings.singletonCheckpoint : undefined;
  const anchor = isRecord(bindings.anchorObservations) ? bindings.anchorObservations : undefined;
  if (!height || !singleton || !anchor) return undefined;

  const heightMode = typeof height.mode === 'string' ? height.mode : 'unspecified';
  const heightTarget = typeof height.target === 'string' && height.target.trim()
    ? ` target=${height.target.trim()}`
    : '';
  const heightErgoReadOnly = height.readOnlyErgoNodeClient === true
    ? ' readOnlyErgoNodeClient=true'
    : height.readOnlyErgoNodeClient === false
      ? ' readOnlyErgoNodeClient=false'
      : '';
  const heightSidechainReadOnly = height.readOnlySidechainRpcClient === true
    ? ' readOnlySidechainRpcClient=true'
    : height.readOnlySidechainRpcClient === false
      ? ' readOnlySidechainRpcClient=false'
      : '';
  const heightErgoNodeUrl = typeof height.ergoNodeUrl === 'string' && height.ergoNodeUrl.trim()
    ? ` ergoNodeUrl=${height.ergoNodeUrl.trim()}`
    : '';
  const heightSidechainRpcUrl = typeof height.sidechainRpcUrl === 'string' && height.sidechainRpcUrl.trim()
    ? ` sidechainRpcUrl=${height.sidechainRpcUrl.trim()}`
    : '';
  const heightNodeAuthHeader = typeof height.nodeAuthHeader === 'string' && height.nodeAuthHeader.trim()
    ? ` nodeAuthHeader=${height.nodeAuthHeader.trim()}`
    : '';
  const heightOperations = Array.isArray(height.operations)
    ? ` operations=${height.operations.map(operation => String(operation)).join(',')}`
    : '';

  const singletonMode = typeof singleton.mode === 'string' ? singleton.mode : 'unspecified';
  const singletonTarget = typeof singleton.target === 'string' && singleton.target.trim()
    ? ` target=${singleton.target.trim()}`
    : '';
  const singletonReadOnly = singleton.readOnlyNodeClient === true
    ? ' readOnlyNodeClient=true'
    : singleton.readOnlyNodeClient === false
      ? ' readOnlyNodeClient=false'
      : '';
  const singletonErgoNodeUrl = typeof singleton.ergoNodeUrl === 'string' && singleton.ergoNodeUrl.trim()
    ? ` ergoNodeUrl=${singleton.ergoNodeUrl.trim()}`
    : '';
  const singletonNodeAuthHeader = typeof singleton.nodeAuthHeader === 'string' && singleton.nodeAuthHeader.trim()
    ? ` nodeAuthHeader=${singleton.nodeAuthHeader.trim()}`
    : '';
  const singletonOperations = Array.isArray(singleton.operations)
    ? ` operations=${singleton.operations.map(operation => String(operation)).join(',')}`
    : '';

  const anchorMode = typeof anchor.mode === 'string' ? anchor.mode : 'unspecified';
  const anchorReadOnly = anchor.readOnlyNodeClient === true
    ? ' readOnlyNodeClient=true'
    : anchor.readOnlyNodeClient === false
      ? ' readOnlyNodeClient=false'
      : '';
  const anchorErgoNodeUrl = typeof anchor.ergoNodeUrl === 'string' && anchor.ergoNodeUrl.trim()
    ? ` ergoNodeUrl=${anchor.ergoNodeUrl.trim()}`
    : '';
  const anchorNodeAuthHeader = typeof anchor.nodeAuthHeader === 'string' && anchor.nodeAuthHeader.trim()
    ? ` nodeAuthHeader=${anchor.nodeAuthHeader.trim()}`
    : '';
  const anchorOperations = Array.isArray(anchor.operations)
    ? ` operations=${anchor.operations.map(operation => String(operation)).join(',')}`
    : '';

  return `height=${heightMode}${heightTarget}${heightErgoNodeUrl}${heightSidechainRpcUrl}${heightErgoReadOnly}${heightSidechainReadOnly}${heightNodeAuthHeader}${heightOperations}; singleton=${singletonMode}${singletonTarget}${singletonErgoNodeUrl}${singletonReadOnly}${singletonNodeAuthHeader}${singletonOperations}; anchor=${anchorMode}${anchorErgoNodeUrl}${anchorReadOnly}${anchorNodeAuthHeader}${anchorOperations}`;
}

function summarizeFreshCheckpointAnchorObservations(artifact: Record<string, unknown>): string | undefined {
  if (!isRecord(artifact.checkpoint)) return undefined;
  const checkpoint = artifact.checkpoint;
  const observations = Array.isArray(checkpoint.anchorObservations)
    ? checkpoint.anchorObservations.filter(isRecord)
    : [];
  const anchorBindings = isRecord(artifact.sourceBindings) && isRecord(artifact.sourceBindings.anchorObservations)
    ? artifact.sourceBindings.anchorObservations
    : undefined;
  if (observations.length === 0 || !anchorBindings) return undefined;
  const matched = observations.every(observation => observation.matchingFieldFound === true);
  const heights = observations
    .map(observation => observation.ergoAnchorHeight)
    .filter((height): height is number => Number.isSafeInteger(height));
  const roots = observations.flatMap(observation =>
    Array.isArray(observation.observedBridgeEventRootHexes)
      ? observation.observedBridgeEventRootHexes.flatMap(root => normalizeHex32Value(root) ?? [])
      : [],
  );
  const observedAts = observations
    .map(observation => typeof observation.observedAt === 'string' ? observation.observedAt : undefined)
    .filter((observedAt): observedAt is string => observedAt !== undefined);
  const nodeHeights = observations
    .map(observation => observation.nodeHeight)
    .filter((height): height is number => Number.isSafeInteger(height));
  const mode = typeof anchorBindings.mode === 'string' ? anchorBindings.mode : 'unspecified';
  const operations = Array.isArray(anchorBindings.operations)
    ? anchorBindings.operations.map(operation => String(operation)).join(',')
    : '<missing>';
  return `${mode} /info observedAt ${observedAts.join(',') || '<missing>'} nodeHeight ${nodeHeights.join(',') || '<missing>'} maxAgeSeconds=900 operations=${operations} 0x0401 bridgeEventRootHex ${matched ? 'matched' : 'not matched'} at each Ergo anchor height count=${observations.length} heights=${heights.join(',') || '<missing>'} roots=${roots.join(',') || '<missing>'}`;
}

function replaceRecoveryRows(markdown: string, loaded: LoadedArtifacts): string {
  let result = markdown;
  if (loaded.failedBroadcast) {
    result = replaceLifecycleRow(result, failedBroadcastGate, extractLifecycleRow(loaded.failedBroadcast, failedBroadcastGate)!);
  }
  if (loaded.reorgRecovery) {
    result = replaceLifecycleRow(result, reorgRecoveryGate, extractLifecycleRow(loaded.reorgRecovery, reorgRecoveryGate)!);
  }
  return result;
}

function extractLifecycleRow(markdown: string, gate: string): string | undefined {
  const rows = markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => isLifecycleRowForGate(line, gate));
  return rows.length === 1 ? rows[0] : undefined;
}

function isPassLifecycleRow(row: string, gate: string): boolean {
  const cells = row.split('|').map(cell => cell.trim()).filter((_, index, all) => index > 0 && index < all.length - 1);
  return cells.length >= 3 && cells[0] === gate && cells[1].toLowerCase() === 'pass';
}

function replaceLifecycleRow(markdown: string, gate: string, replacementRow: string): string {
  const ranges = headingRanges(markdown, lifecycleHeading);
  if (ranges.length !== 1) return markdown;
  const start = ranges[0].start + lifecycleHeading.length;
  const end = headingRanges(markdown, preflightHeading)[0]?.start ?? nextHeadingIndex(markdown, start);
  const before = markdown.slice(0, start);
  const body = markdown.slice(start, end);
  const after = markdown.slice(end);
  const replaced = body
    .split(/\r?\n/)
    .map(line => isLifecycleRowForGate(line.trim(), gate) ? replacementRow : line)
    .join('\n');
  return `${before}${replaced}${after}`;
}

function isLifecycleRowForGate(line: string, gate: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.split('|')[1]?.trim() === gate;
}

function formatLivePreflightHandoff(facts: LivePreflightFacts): string {
  return [
    '',
    `- Live-preflight transcript/report: distinct rehearsal:live-preflight transcript/report ${facts.passLine}`,
    '- Live-preflight status: PASS',
    `- Live-preflight input target: ${facts.livePreflightTarget}`,
    `- Live-preflight approvals file target: ${facts.approvalsTarget}`,
    `- Expected transaction ID binding: ${facts.expectedTxId}`,
    '- Authorization boundary: this assembled candidate does not approve or authorize broadcast.',
    '',
  ].join('\n');
}

function replaceSectionBody(markdown: string, heading: string, replacementBody: string): string {
  const ranges = headingRanges(markdown, heading);
  if (ranges.length !== 1) return markdown;
  const start = ranges[0].start + heading.length;
  const next = nextHeadingIndex(markdown, start);
  return `${markdown.slice(0, start)}${replacementBody.trimEnd()}\n\n${markdown.slice(next).replace(/^\n+/, '')}`;
}

function replaceHeadingRange(markdown: string, startHeading: string, endHeading: string, replacement: string): string {
  const startRanges = headingRanges(markdown, startHeading);
  const endRanges = headingRanges(markdown, endHeading);
  if (startRanges.length !== 1 || endRanges.length !== 1 || endRanges[0].start <= startRanges[0].start) {
    return markdown;
  }
  return `${markdown.slice(0, startRanges[0].start)}${replacement.trimEnd()}\n\n${markdown.slice(endRanges[0].start)}`;
}

function insertAfterTitle(markdown: string, section: string): string {
  const match = /^# .*(?:\r?\n|$)/.exec(markdown);
  if (!match) return `${section}${markdown.trimStart()}`;
  return `${match[0].trimEnd()}\n\n${section}${markdown.slice(match[0].length).replace(/^\n+/, '')}`.trimEnd() + '\n';
}

function sectionBetween(markdown: string, startHeading: string, endHeading?: string): string {
  const startRange = headingRanges(markdown, startHeading)[0];
  if (!startRange) return '';
  const start = startRange.start;
  if (start < 0) return '';
  const bodyStart = start + startHeading.length;
  const end = endHeading
    ? (headingRanges(markdown, endHeading).find(range => range.start > bodyStart)?.start ?? -1)
    : nextHeadingIndex(markdown, bodyStart);
  return markdown.slice(bodyStart, end < 0 ? markdown.length : end).trim();
}

function nextHeadingIndex(markdown: string, from: number): number {
  const slice = markdown.slice(from);
  const match = /^## .+$/gm.exec(slice);
  return match ? from + match.index : markdown.length;
}

function headingRanges(markdown: string, heading: string): Array<{ start: number; end: number }> {
  return [...markdown.matchAll(new RegExp(`^${escapeRegExp(heading)}\\s*$`, 'gm'))]
    .map(match => ({ start: match.index ?? -1, end: (match.index ?? -1) + match[0].length }))
    .filter(range => range.start >= 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripClaimControlLines(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .filter(line => !/^\s*-\s*(?:Production-ready claim allowed by this rehearsal|Testnet production-candidate claim allowed by this rehearsal):/i.test(line))
    .join('\n');
}

function resolveComparableTarget(target: string, input: TestnetRehearsalAssembleInput): string {
  if (input.resolvePath) return input.resolvePath(target).replace(/\\/g, '/').toLowerCase();
  return resolve(input.workspaceRoot ?? process.cwd(), target).replace(/\\/g, '/').toLowerCase();
}

function formatTargetLabel(target: string): string {
  const trimmedTarget = target.trim();
  const normalized = trimmedTarget.replace(/\\/g, '/').toLowerCase();
  if (!isBlockedOrPlaceholderTargetLabel(trimmedTarget) && hasShellUnsafeTargetContent(trimmedTarget)) {
    return blockedTargetLabel;
  }
  if (isSensitiveOrRuntimeTarget(normalized) || hasUriSchemeTarget(normalized) || escapesBridgeRoot(normalized)) {
    return blockedTargetLabel;
  }
  if (isLocalAbsoluteTarget(normalized)) return blockedTargetLabel;
  return target;
}

function hasShellUnsafeTargetContent(target: string): boolean {
  const normalized = target.replace(/\\/g, '/');
  if (/^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._/-]+$/i.test(normalized)) {
    return false;
  }
  return !/^[A-Za-z0-9._/-]+$/.test(normalized);
}

function isBlockedOrPlaceholderTargetLabel(target: string): boolean {
  return /^<[^<>]+>$/.test(target);
}

function formatResolvedArtifactTargetLabel(input: TestnetRehearsalAssembleInput, target: string): string {
  const label = formatTargetLabel(target);
  if (label === blockedTargetLabel) return label;

  try {
    const workspaceRoot = resolve(input.workspaceRoot ?? process.cwd());
    const bridgeRoot = resolve(input.bridgeRoot ?? resolve(workspaceRoot, '..'));
    const resolvedBridgeRoot = realpathSync(bridgeRoot);
    const artifactPath = realpathSync(resolve(workspaceRoot, target));
    return isInsidePath(artifactPath, resolvedBridgeRoot) ? label : blockedTargetLabel;
  } catch {
    return label;
  }
}

function hasCompletedEvidenceTarget(value: string): boolean {
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasClaimEscalatingAssemblyEvidenceReference(value) &&
    firstCompletedEvidenceTarget(value) !== undefined;
}

function firstCompletedEvidenceTarget(value: string): string | undefined {
  const artifactTarget = extractArtifactTargets(value)
    .find(isCompletedEvidenceTarget);
  if (artifactTarget) return artifactTarget;

  return [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map(([, target]) => target.trim())
    .find(isCompletedEvidenceTarget);
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target);
}

function extractEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target.trim()),
  ];
}

function isCompletedEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  return (
    !/<[^>]+>/.test(target) &&
    !isLocalOnlyEvidenceTarget(normalizedTarget) &&
    !hasClaimEscalatingAssemblyEvidenceTarget(normalizedTarget) &&
    !hasNonConcreteEvidenceTargetSegment(normalizedTarget)
  );
}

function isConcreteJsonEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  return isCompletedEvidenceTarget(target) && normalizedTarget.endsWith('.json');
}

function hasClaimEscalatingAssemblyEvidenceReference(value: string): boolean {
  return extractEvidenceTargets(value)
    .some(target => hasClaimEscalatingAssemblyEvidenceTarget(target));
}

function hasClaimEscalatingAssemblyEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  const claim = classifyPublicationClaimText(normalizedTarget);
  return claim.hasProductionClaim;
}

function hasNonConcreteEvidenceTargetSegment(value: string): boolean {
  return value
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase()
    .split(/[\\/]+/)
    .some(segment => isNonConcreteEvidenceTargetSegment(segment));
}

function hasLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return hasEvidenceLocalOnlyInspectionReference(normalized);
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
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

function isNonConcreteEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|live|preflight|rehearsal|approval|approvals)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|live|preflight|rehearsal|approval|approvals)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|live|preflight|rehearsal|approval|approvals)|$)/i.test(normalized)
  );
}

function textIndicatesMainnetTarget(text: string): boolean {
  return text
    .split(/\r?\n/)
    .some(line => {
      const match = /^\s*-?\s*([^:]+):\s*(.+?)\s*$/.exec(line);
      if (!match) return /\b(?:target|network|environment)\b.{0,40}\bmain[- ]?net\b/i.test(stripNonMainnet(line));
      const key = match[1].toLowerCase();
      return (
        /(network|environment|target|chain|scope)/i.test(key) &&
        /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(stripNonMainnet(match[2]))
      );
    });
}

function stripNonMainnet(value: string): string {
  return value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
}

function indicatesMissingBroadcastApproval(value: string): boolean {
  return (
    /\b(?:broadcast|live broadcast)\s+approval\b.{0,80}\b(?:missing|absent|not recorded|not provided|unapproved|denied|declined|rejected)\b/i.test(value) ||
    /\b(?:missing|absent|without|no|not recorded|not provided|unapproved|denied|declined|rejected)\b.{0,80}\b(?:broadcast|live broadcast)\s+approval\b/i.test(value)
  );
}

function extractExpectedTxId(markdown: string): string | undefined {
  const dryRun = sectionBetween(markdown, dryRunHeading, broadcastEnablementHeading);
  return extractSingleHex32(dryRun.match(/^- Expected transaction ID:\s*(.+)$/im)?.[1] ?? '');
}

function extractDraftSettlementFacts(markdown: string): DraftSettlementFacts {
  const dryRun = sectionBetween(markdown, dryRunHeading, broadcastEnablementHeading);
  const preflight = sectionBetween(markdown, preflightHeading, dryRunHeading);
  return {
    expectedTxId: extractExpectedTxId(markdown) ?? '',
    pegOutBurnTxId: extractPegOutBurnTxId(markdown) ?? '',
    burnTxHashes: extractPackageHexArray(dryRun, 'peg-out burn TX ID'),
    sidechainBlockHeights: extractPackageNumberArray(dryRun, 'sidechain block height'),
    sidechainHeaderHashHexes: extractPackageHexArray(dryRun, 'sidechain block hash'),
    ergoAnchorHeights: extractPackageNumberArray(dryRun, 'Ergo anchor height'),
    bridgeEventRootHexes: extractPackageBridgeEventRootArray(dryRun),
    deployedStateHash: extractDeploymentStateHash(preflight),
  };
}

function extractPackageHexArray(text: string, label: string): string[] {
  return [...text.matchAll(new RegExp(`^-\\s*Package\\s+\\d+\\s+${escapeRegExp(label)}:\\s*(.+)$`, 'gim'))]
    .flatMap(([, value]) => value.split(',').map(item => normalizeHex32Value(item)).filter((item): item is string => item !== undefined));
}

function extractPackageBridgeEventRootArray(text: string): string[] {
  const pluralRoots = [...text.matchAll(/^-\s*Package\s+\d+\s+bridge event roots:\s*(.+)$/gim)]
    .flatMap(([, value]) => extractBridgeEventRootHexes(value));
  if (pluralRoots.length > 0) return pluralRoots;
  return extractPackageHexArray(text, 'bridge event root');
}

function extractPackageNumberArray(text: string, label: string): string[] {
  return [...text.matchAll(new RegExp(`^-\\s*Package\\s+\\d+\\s+${escapeRegExp(label)}:\\s*(.+)$`, 'gim'))]
    .flatMap(([, value]) => value.split(',').map(item => normalizeIntegerValue(item)).filter((item): item is string => item !== undefined));
}

function extractDeploymentStateHash(text: string): string | undefined {
  return normalizeHex32Value(text.match(/\bdeployment-state hash\b[^0-9a-fA-F]*(?:0x)?([0-9a-fA-F]{64})/i)?.[1]);
}

function extractPegOutBurnTxId(markdown: string): string | undefined {
  const dryRun = sectionBetween(markdown, dryRunHeading, broadcastEnablementHeading);
  const lifecycle = sectionBetween(markdown, lifecycleHeading, preflightHeading);
  return extractPegOutBurnTxIdFromText(`${dryRun}\n${lifecycle}`);
}

function extractExpectedTxIdFromText(value: string): string | undefined {
  return extractSingleHex32(value.match(/\bExpected transaction ID\b\s+((?:0x)?[0-9a-fA-F]{64})/i)?.[1] ?? '');
}

function extractExpectedTxIdFromRecoveryRow(value: string): string | undefined {
  return extractSingleHex32(value.match(/\bexpected transaction(?: ID)?\s+((?:0x)?[0-9a-fA-F]{64})/i)?.[1] ?? '');
}

function extractPegOutBurnTxIdFromText(value: string): string | undefined {
  return extractSingleHex32(
    value.match(/\b(?:peg-out burn TX ID|burnTxHash=)\s*((?:0x)?[0-9a-fA-F]{64})/i)?.[1] ?? '',
  );
}

function extractSubmittedTxId(markdown: string): string | undefined {
  return extractSingleHex32(
    sectionBetween(markdown, submitHeading, reconciliationHeading)
      .match(/^- Submitted transaction ID:\s*(.+)$/im)?.[1] ?? '',
  );
}

function extractSingleHex32(value: string): string | undefined {
  const matches = [...value.matchAll(/(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g)]
    .map(match => match[1].toLowerCase());
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : undefined;
}

function parsePositiveInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeHex32Value(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeHex32ArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map(normalizeHex32Value);
  return normalized.every((item): item is string => item !== undefined) ? normalized : undefined;
}

function normalizeIntegerValue(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? String(parsed) : undefined;
}

function normalizeNumberArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map(normalizeIntegerValue);
  return normalized.every((item): item is string => item !== undefined) ? normalized : undefined;
}

function validateAssembledRehearsal(markdown: string): {
  result: RehearsalEvidenceValidation;
  lines: string[];
} {
  try {
    const result = validateRehearsalEvidence(markdown);
    return {
      result,
      lines: formatAssemblerValidationLines('assembled candidate', markdown, result),
    };
  } catch (error: any) {
    const result: RehearsalEvidenceValidation = {
      status: 'BLOCKED',
      rows: [],
      sessionMetadata: {
        date: '',
        operator: '',
        reviewer: '',
        environment: '',
        gitCommit: '',
        releaseLevel: '',
        ergoNodeNetwork: '',
        sidechainNetwork: '',
        broadcastModeAtStart: '',
        broadcastModeAtEnd: '',
      },
      publicationEvidence: {
        releaseNotesUpdated: '',
        requiredReleaseNoteUpdates: '',
        pendingEvidenceRegisterUpdated: '',
        requiredChecklistUpdates: '',
        productionReadyClaimAllowed: '',
        testnetProductionCandidateClaimAllowed: '',
      },
      reviewerSignoff: {
        classification: '',
        publicationBlockersDiscovered: '',
        followUpTestsRequired: '',
        followUpRunbookChangesRequired: '',
        reviewer: '',
        date: '',
      },
      errors: [error?.message ?? String(error)],
      message: 'Rehearsal evidence BLOCKED: assembled candidate could not be parsed.',
    };
    return {
      result,
      lines: formatAssemblerValidationLines('assembled candidate', markdown, result),
    };
  }
}

function formatAssemblerValidationLines(
  label: string,
  markdown: string,
  result: RehearsalEvidenceValidation,
): string[] {
  const finalTranscriptRequirement = formatFinalTranscriptRequirementLines();

  if (result.status === 'BLOCKED') {
    return [
      ...formatRehearsalValidationTranscriptLines(label, markdown, result),
      ...finalTranscriptRequirement,
    ];
  }

  return [
    `${label}: ${result.message}`,
    ...finalTranscriptRequirement,
  ];
}

function formatFinalTranscriptRequirementLines(): string[] {
  const finalGate3ValidationCommand = [
    'npm run rehearsal:validate -- --transcript <artifact://.../rehearsal-validate.log>',
    '--assembly-report-json <assembly-report.json>',
    '--live-preflight-json <live-preflight.json>',
    '--post-submit-observe-json <post-submit-observe.json>',
    '--fresh-checkpoint-json <fresh-testnet-checkpoint.json>',
    '--recovery-observe-json <failed-broadcast-observe.json>',
    '--recovery-observe-json <reorg-stale-singleton-observe.json>',
    '<completed-live-rehearsal.md>',
  ].join(' ');
  const finalTranscriptRequirement = [
    `- Final Gate 3 validation transcript required: run ${finalGate3ValidationCommand}.`,
    '- This assembler does not create the distinct rehearsal:validate transcript artifact and cannot close Gate 3 by itself.',
  ];
  return finalTranscriptRequirement;
}

function isSensitiveOrRuntimeTarget(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeInspectionTarget);
}

function isSensitiveOrRuntimeInspectionTarget(normalized: string): boolean {
  const name = basename(normalized);
  return (
    hasSensitiveEnvironmentTargetSegment(normalized) ||
    hasSensitiveRuntimeDatabaseTargetSegment(normalized) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceRuntimeDatabaseTarget(normalized) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true })
  );
}

function hasSensitiveEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasSensitiveRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function isLocalAbsoluteTarget(normalized: string): boolean {
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('/');
}

function hasUriSchemeTarget(normalized: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized);
}

function escapesBridgeRoot(normalized: string): boolean {
  if (isLocalAbsoluteTarget(normalized) || hasUriSchemeTarget(normalized)) return false;

  let depthFromRelayer = 0;
  const parts = normalized.split('/').filter(part => part.length > 0 && part !== '.');
  for (const part of parts) {
    depthFromRelayer += part === '..' ? -1 : 1;
    if (depthFromRelayer < -1) return true;
  }
  return false;
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
