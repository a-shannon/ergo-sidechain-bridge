import type { GoNoGoReportValidation, Verdict } from './patched-devnet-go-no-go.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface LocalDevnetExecutionRequestInput {
  sourceCommit: string;
  captureManifestTarget: string;
  captureManifestMarkdown: string;
  goNoGoJsonTarget: string;
  goNoGoValidationTarget: string;
  goNoGoValidation: GoNoGoReportValidation;
  planJsonTarget?: string;
  planJsonReport?: PatchedDevnetPlanJsonReport;
  signerFundingDefaultsTarget: string;
  signerFundingDefaultsMarkdown: string;
  command: string;
}

export interface PatchedDevnetPlanJsonReport {
  status: 'PATCHED_DEVNET_PLAN_READY';
  exitCode: 0;
  command: string;
  patchedNodeUrl: string;
  stepCount: number;
  stepTitles: string[];
  evidenceTargetsToProduce: string[];
  boundary: Record<string, unknown>;
}

export interface LocalDevnetExecutionRequestReport {
  status: 'LOCAL_DEVNET_REQUEST_READY';
  exitCode: 0;
  command: string;
  sourceCommit: string;
  captureManifestTarget: string;
  captureManifestPrerequisiteResult: string;
  captureManifestStructuralIssues: number;
  goNoGoJsonTarget: string;
  goNoGoValidationTarget: string;
  goNoGoVerdict: Verdict;
  goNoGoValidationMessage: string;
  patchedDevnetPlanJsonTarget: string;
  patchedDevnetPlanStatus: string;
  patchedDevnetPlanStepCount: number;
  signerFundingDefaultsTarget: string;
  signerFundingDefaultsStatus: string;
  operatorRequests: LocalDevnetOperatorRequest[];
  evidenceTargetsToProduce: string[];
  forbiddenInputs: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface LocalDevnetOperatorRequest {
  phase: string;
  operatorAction: string;
  evidenceToReturn: string;
  stopCondition: string;
}

const forbiddenInputs = [
  'Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, or seed phrases.',
  'Do not provide raw runtime databases, private bridge-state SQLite files, deployment-state dumps, or node data directories.',
  'Do not approve deployment, signing, submit, broadcast, publication, PR, or mainnet activity through this request.',
];

export function buildLocalDevnetExecutionRequestCommand(input: {
  sourceCommit: string;
  captureManifest: string;
  goNoGoJson: string;
  goNoGoValidation: string;
  planJson?: string;
  signerFundingDefaults: string;
  out?: string;
  jsonOut?: string;
}): string {
  const parts = [
    'npm run rehearsal:local-devnet-request --',
    '--source-commit',
    sanitize(input.sourceCommit),
    '--capture-manifest',
    sanitize(input.captureManifest),
    '--go-no-go-json',
    sanitize(input.goNoGoJson),
    '--go-no-go-validation',
    sanitize(input.goNoGoValidation),
    ...(input.planJson ? ['--plan-json', sanitize(input.planJson)] : []),
    '--signer-funding-defaults',
    sanitize(input.signerFundingDefaults),
  ];
  if (input.out) parts.push('--out <request.md>');
  if (input.jsonOut) parts.push('--json-out <request.json>');
  return parts.join(' ');
}

export function buildLocalDevnetExecutionRequestReport(
  input: LocalDevnetExecutionRequestInput,
): LocalDevnetExecutionRequestReport {
  const report = input.goNoGoValidation.report;
  if (!report) {
    throw new Error('go/no-go validation report is required');
  }

  return {
    status: 'LOCAL_DEVNET_REQUEST_READY',
    exitCode: 0,
    command: sanitize(input.command),
    sourceCommit: sanitize(input.sourceCommit),
    captureManifestTarget: sanitize(input.captureManifestTarget),
    captureManifestPrerequisiteResult:
      extractCaptureStatus(input.captureManifestMarkdown, 'Gate 3 prerequisite map') ?? 'unknown',
    captureManifestStructuralIssues: extractStructuralIssueCount(input.captureManifestMarkdown),
    goNoGoJsonTarget: sanitize(input.goNoGoJsonTarget),
    goNoGoValidationTarget: sanitize(input.goNoGoValidationTarget),
    goNoGoVerdict: report.summary.verdict,
    goNoGoValidationMessage: sanitize(input.goNoGoValidation.message),
    patchedDevnetPlanJsonTarget: input.planJsonTarget ? sanitize(input.planJsonTarget) : 'not provided',
    patchedDevnetPlanStatus: input.planJsonReport?.status ?? 'not provided',
    patchedDevnetPlanStepCount: input.planJsonReport?.stepCount ?? 0,
    signerFundingDefaultsTarget: sanitize(input.signerFundingDefaultsTarget),
    signerFundingDefaultsStatus: extractSignerFundingDefaultsStatus(input.signerFundingDefaultsMarkdown),
    operatorRequests: buildOperatorRequests(report.summary.verdict, input.signerFundingDefaultsTarget),
    evidenceTargetsToProduce: buildEvidenceTargetsToProduce(),
    forbiddenInputs: [...forbiddenInputs],
    boundary: buildBoundary(Boolean(input.planJsonReport)),
  };
}

export function formatLocalDevnetExecutionRequestMarkdown(
  report: LocalDevnetExecutionRequestReport,
): string {
  return [
    '# Gate 3 Local Devnet Execution Request',
    '',
    'This request converts the current Gate 3 capture manifest into the next operator inputs needed for a real local-devnet rehearsal.',
    'It is planning output only and does not inspect private runtime state, read secrets, authorize signing, submit, broadcast, close Gate 3, or support release claims.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Status', report.status],
      ['Source commit', report.sourceCommit],
      ['Capture manifest', report.captureManifestTarget],
      ['Capture manifest prerequisite result', report.captureManifestPrerequisiteResult],
      ['Capture manifest structural issues', String(report.captureManifestStructuralIssues)],
      ['Go/no-go JSON', report.goNoGoJsonTarget],
      ['Go/no-go validation', report.goNoGoValidationTarget],
      ['Go/no-go verdict', report.goNoGoVerdict],
      ['Go/no-go validation message', report.goNoGoValidationMessage],
      ['Patched devnet plan JSON', report.patchedDevnetPlanJsonTarget],
      ['Patched devnet plan status', report.patchedDevnetPlanStatus],
      ['Patched devnet plan step count', String(report.patchedDevnetPlanStepCount)],
      ['Signer/funding no-secret defaults', report.signerFundingDefaultsTarget],
      ['Signer/funding defaults status', report.signerFundingDefaultsStatus],
    ]),
    '',
    '## Operator Requests',
    '',
    markdownTable([
      ['Phase', 'Operator action', 'Evidence to return', 'Stop condition'],
      ...report.operatorRequests.map(request => [
        request.phase,
        request.operatorAction,
        request.evidenceToReturn,
        request.stopCondition,
      ]),
    ]),
    '',
    '## Evidence Targets To Produce',
    '',
    ...report.evidenceTargetsToProduce.map(target => `- ${escapeMarkdownText(target)}`),
    '',
    '## Do Not Provide',
    '',
    ...report.forbiddenInputs.map(input => `- ${escapeMarkdownText(input)}`),
    '',
    '## Boundary',
    '',
    markdownTable([
      ['Boundary', 'Value'],
      ...Object.entries(report.boundary),
    ]),
    '',
  ].join('\n');
}

export function validateLocalDevnetExecutionRequestReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--local-devnet-request-json report must be an object'];
  if (value.status !== 'LOCAL_DEVNET_REQUEST_READY') {
    errors.push('--local-devnet-request-json report.status must be LOCAL_DEVNET_REQUEST_READY');
  }
  if (value.exitCode !== 0) errors.push('--local-devnet-request-json report.exitCode must be 0');
  for (const field of [
    'command',
    'sourceCommit',
    'captureManifestTarget',
    'captureManifestPrerequisiteResult',
    'goNoGoJsonTarget',
    'goNoGoValidationTarget',
    'goNoGoVerdict',
    'goNoGoValidationMessage',
    'patchedDevnetPlanJsonTarget',
    'patchedDevnetPlanStatus',
    'signerFundingDefaultsTarget',
    'signerFundingDefaultsStatus',
  ]) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--local-devnet-request-json report.${field} must be a non-empty string`);
    }
  }
  if (!isNonNegativeSafeInteger(value.captureManifestStructuralIssues)) {
    errors.push('--local-devnet-request-json report.captureManifestStructuralIssues must be a non-negative safe integer');
  }
  if (!isNonNegativeSafeInteger(value.patchedDevnetPlanStepCount)) {
    errors.push('--local-devnet-request-json report.patchedDevnetPlanStepCount must be a non-negative safe integer');
  }
  const planReused = value.patchedDevnetPlanJsonTarget !== 'not provided';
  if (planReused) {
    if (value.patchedDevnetPlanStatus !== 'PATCHED_DEVNET_PLAN_READY') {
      errors.push('--local-devnet-request-json report.patchedDevnetPlanStatus must be PATCHED_DEVNET_PLAN_READY when a plan JSON is reused');
    }
    if (value.patchedDevnetPlanStepCount === 0) {
      errors.push('--local-devnet-request-json report.patchedDevnetPlanStepCount must be positive when a plan JSON is reused');
    }
  }
  validateStringArray(value.evidenceTargetsToProduce, 'evidenceTargetsToProduce', errors);
  validateStringArray(value.forbiddenInputs, 'forbiddenInputs', errors);
  if (!Array.isArray(value.operatorRequests) || value.operatorRequests.length === 0) {
    errors.push('--local-devnet-request-json report.operatorRequests must be a non-empty array');
  } else {
    value.operatorRequests.forEach((request, index) => validateOperatorRequest(request, index, errors));
  }
  validateBoundary(value.boundary, errors, planReused);
  if (findLocalPathLeak(value)) {
    errors.push('--local-devnet-request-json report must not serialize local absolute paths');
  }
  return errors;
}

export function validatePatchedDevnetPlanJsonReport(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--plan-json report must be an object'];
  if (value.status !== 'PATCHED_DEVNET_PLAN_READY') {
    errors.push('--plan-json report.status must be PATCHED_DEVNET_PLAN_READY');
  }
  if (value.exitCode !== 0) errors.push('--plan-json report.exitCode must be 0');
  if (typeof value.command !== 'string' || !/\bdemo:patched-devnet:plan\b/.test(value.command)) {
    errors.push('--plan-json report.command must identify demo:patched-devnet:plan');
  }
  if (typeof value.patchedNodeUrl !== 'string' || value.patchedNodeUrl.trim().length === 0) {
    errors.push('--plan-json report.patchedNodeUrl must be a non-empty string');
  }
  if (!isPositiveSafeInteger(value.stepCount)) {
    errors.push('--plan-json report.stepCount must be a positive safe integer');
  }
  validateStringArray(value.stepTitles, 'stepTitles', errors, '--plan-json report');
  validateStringArray(value.evidenceTargetsToProduce, 'evidenceTargetsToProduce', errors, '--plan-json report');
  if (isPositiveSafeInteger(value.stepCount) && Array.isArray(value.stepTitles) && value.stepTitles.length !== value.stepCount) {
    errors.push('--plan-json report.stepTitles length must match stepCount');
  }
  validatePatchedDevnetPlanBoundary(value.boundary, errors);
  if (findLocalPathLeak(value)) errors.push('--plan-json report must not serialize local absolute paths');
  return errors;
}

export function validateSignerFundingDefaultsMarkdown(
  markdown: string,
  target: string,
): string[] {
  const requiredSnippets = [
    '# Gate 3 Devnet Signer/Funding No-Secret Defaults',
    'Default signer/funding checks are no-secret and operator-gated',
    '`demo:devnet:signer`',
    '`demo:devnet:funding`',
    '--address <relayer-address>',
    '--include-secret-material',
    '| Mnemonic or private key value read by default | no |',
    '| Node config file read by default | no |',
    '| Gate 3 lifecycle closure supported | no |',
    '| Release gate PASS supported | no |',
  ];
  return requiredSnippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `${target} must include signer/funding no-secret default evidence: ${snippet}`);
}

function buildOperatorRequests(
  verdict: Verdict,
  signerFundingDefaultsTarget: string,
): LocalDevnetOperatorRequest[] {
  const sanitizedSignerFundingDefaultsTarget = sanitize(signerFundingDefaultsTarget);
  return [
    {
      phase: '1. Refresh patched-devnet go/no-go',
      operatorAction:
        'Rerun demo:patched-devnet:go-no-go for the current machine inputs and keep the JSON plus validation output. The current linked verdict is ' +
        verdict +
        ', which is local-prerequisite evidence only.',
      evidenceToReturn:
        'Updated go/no-go JSON and validation Markdown with PASS validation, no secret dump, no signing, no broadcast, and no Gate 3 closure claim.',
      stopCondition:
        'Stop if the verdict is NO-GO, if runtime-state inspection is still skipped without an explicit reviewer rationale, or if any endpoint is not loopback/non-mainnet.',
    },
    {
      phase: '2. Start local nodes and scoped shell',
      operatorAction:
        'Start Frontier and patched Ergo devnet locally, then set ERGO_NODE and ERGO_NODE_URL to the same loopback patched-devnet origin in a scoped shell.',
      evidenceToReturn:
        'Redacted command transcript showing local node reachability, current Ergo height, current sidechain height, PATCHED_STACK_MODE scope, and broadcast disabled before any submit.',
      stopCondition:
        'Stop if endpoints are remote, mismatched, unauthenticated data is unavailable, or BRIDGE_BROADCAST_ENABLED is enabled before explicit approval.',
    },
    {
      phase: '3. Prove funding and signer alignment privately',
      operatorAction:
        'Start from the linked no-secret defaults evidence ' +
        sanitizedSignerFundingDefaultsTarget +
        '. Run demo:devnet:funding -- --address <relayer-address> when the public address is safe to share. Run demo:devnet:signer -- --include-secret-material and demo:devnet:funding -- --include-secret-material only in a scoped private local operator shell.',
      evidenceToReturn:
        'PASS/BLOCKED summary with redacted signer/funding status, enough spendable devnet ERG for the rehearsal, exact command names used, and no serialized wallet material, node config values, or runtime database contents.',
      stopCondition:
        'Stop if signer alignment is unknown, funding is insufficient, no-secret address mode cannot prove public balance, or the only proof requires exposing wallet recovery material or node config secrets.',
    },
    {
      phase: '4. Capture completed local-devnet rehearsal',
      operatorAction:
        'Fill the live rehearsal template for local devnet and validate it with rehearsal:validate plus the concrete JSON bindings requested by the capture manifest.',
      evidenceToReturn:
        'Completed local-devnet rehearsal Markdown, distinct rehearsal:validate transcript/report, preflight/window/fresh-check/aggregate JSON bindings, and claim denials.',
      stopCondition:
        'Stop if any row uses placeholders, if validation output is targetless, if JSON targets drift, or if production-ready/testnet production-candidate claims are allowed.',
    },
  ];
}

function buildEvidenceTargetsToProduce(): string[] {
  return [
    '../evidence/live-rehearsals/<completed-local-devnet-rehearsal.md>',
    '../evidence/rehearsal/artifacts/<local-devnet-rehearsal-validation-report.md>',
    '../evidence/live-rehearsals/<local-devnet-go-no-go.json>',
    '../evidence/live-rehearsals/<local-devnet-signer-funding-redacted-summary.md>',
    '../evidence/live-rehearsals/<local-devnet-preflight.json>',
    '../evidence/live-rehearsals/<local-devnet-window-prep.json>',
    '../evidence/live-rehearsals/<local-devnet-fresh-checkpoint.json>',
    '../evidence/testnet-prebroadcast/<aggregate-check.json>',
  ];
}

function buildBoundary(planReused: boolean): Record<string, 'yes' | 'no'> {
  return {
    'Planning output only': 'yes',
    'Capture manifest reused': 'yes',
    'Go/no-go JSON reused': 'yes',
    'Patched devnet plan reused': planReused ? 'yes' : 'no',
    'Signer/funding no-secret defaults reused': 'yes',
    'Secret or environment file read': 'no',
    'Wallet recovery material or private key read': 'no',
    'Node config secret read': 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Live node probe executed by request command': 'no',
    'Transaction signing performed': 'no',
    'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'no',
    'Gate 3 lifecycle evidence claimed complete': 'no',
    'Release gate PASS claimed': 'no',
    'Production-ready claim allowed': 'no',
    'Testnet production-candidate claim allowed': 'no',
  };
}

function extractSignerFundingDefaultsStatus(markdown: string): string {
  const result = extractMarkdownTableValue(markdown, 'Result');
  return result ? sanitize(result) : 'no-secret defaults linked';
}

function extractCaptureStatus(markdown: string, inputName: string): string | undefined {
  const escaped = inputName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^\\|\\s*${escaped}\\s*\\|[^|]*\\|\\s*([^|]+?)\\s*\\|`, 'im'));
  return match?.[1]?.trim();
}

function extractStructuralIssueCount(markdown: string): number {
  const status = extractCaptureStatus(markdown, 'Gate 3 prerequisite map') ?? '';
  const match = status.match(/\bwith\s+(\d+)\s+structural issues?\b/i);
  return match ? Number(match[1]) : 0;
}

function extractMarkdownTableValue(markdown: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*([^|]+?)\\s*\\|`, 'im'));
  return match?.[1]?.trim();
}

function validateOperatorRequest(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--local-devnet-request-json report.operatorRequests[${index}] must be an object`);
    return;
  }
  for (const field of ['phase', 'operatorAction', 'evidenceToReturn', 'stopCondition']) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--local-devnet-request-json report.operatorRequests[${index}].${field} must be a non-empty string`);
    }
  }
}

function validateStringArray(value: unknown, field: string, errors: string[], prefix = '--local-devnet-request-json report'): void {
  if (!Array.isArray(value) || value.length === 0 || value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
    errors.push(`${prefix}.${field} must be a non-empty string array`);
  }
}

function validateBoundary(value: unknown, errors: string[], planReused: boolean): void {
  const expected = buildBoundary(planReused);
  if (!isRecord(value)) {
    errors.push('--local-devnet-request-json report.boundary must be an object');
    return;
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--local-devnet-request-json report.boundary.${field} must be ${expectedValue}`);
    }
  }
}

function validatePatchedDevnetPlanBoundary(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('--plan-json report.boundary must be an object');
    return;
  }
  const expected: Record<string, 'yes' | 'no'> = {
    'Plan output only': 'yes',
    'Secret or environment file read': 'no',
    'Wallet recovery material or private key read': 'no',
    'Node config secret read': 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Live node probe executed': 'no',
    'Transaction signing performed': 'no',
    'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'no',
    'Gate 3 lifecycle evidence claimed complete': 'no',
    'Release gate PASS claimed': 'no',
    'Production-ready claim allowed': 'no',
    'Testnet production-candidate claim allowed': 'no',
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--plan-json report.boundary.${field} must be ${expectedValue}`);
    }
  }
}

function markdownTable(rows: string[][]): string {
  const [header, ...body] = rows;
  return [
    markdownTableRow(header),
    markdownTableRow(header.map(() => '---')),
    ...body.map(markdownTableRow),
  ].join('\n');
}

function markdownTableRow(cells: string[]): string {
  return `| ${cells.map(escapeMarkdownTableCell).join(' | ')} |`;
}

function escapeMarkdownTableCell(value: string): string {
  return escapeMarkdownText(value).replace(/\|/g, '\\|');
}

function escapeMarkdownText(value: string): string {
  return sanitize(value).replace(/\r?\n/g, '<br>');
}

function sanitize(value: string): string {
  return sanitizeReportText(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function findLocalPathLeak(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return /\b[A-Za-z]:[\\/]/.test(value) || /file:\/\/\//i.test(value) || /\\\\[^\\]/.test(value)
      ? value
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const leaked = findLocalPathLeak(item);
      if (leaked) return leaked;
    }
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const leaked = findLocalPathLeak(item);
      if (leaked) return leaked;
    }
  }
  return undefined;
}
