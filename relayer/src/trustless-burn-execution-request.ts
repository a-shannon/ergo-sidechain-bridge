import { sanitizeReportText } from './report-text-sanitizer.js';

export interface TrustlessBurnExecutionRequestInput {
  sourceCommit: string;
  prerequisiteMapTarget: string;
  prerequisiteMapMarkdown: string;
  operatorPacketTarget: string;
  operatorPacketMarkdown: string;
  command: string;
}

export interface TrustlessBurnExecutionRequestReport {
  status: 'TRUSTLESS_BURN_EXECUTION_REQUEST_READY';
  exitCode: 0;
  command: string;
  sourceCommit: string;
  prerequisiteMapTarget: string;
  operatorPacketTarget: string;
  candidateTarget: string;
  prerequisiteMapResult: string;
  prerequisiteMapStructuralIssues: number;
  operatorPacketResult: string;
  operatorPacketStructuralIssues: number;
  operatorRequests: TrustlessBurnOperatorExecutionRequest[];
  evidenceTargetsToProduce: string[];
  forbiddenInputs: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface TrustlessBurnOperatorExecutionRequest {
  phase: string;
  operatorAction: string;
  evidenceToReturn: string;
  stopCondition: string;
}

const forbiddenInputs = [
  'Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, seed phrases, raw runtime databases, private deployment-state files, or node data directories.',
  'Do not provide local absolute paths, raw node config, raw SQLite state, raw deployment-state dumps, or screenshots containing private endpoints or credentials.',
  'Do not approve signing, transaction check, submit, broadcast, deployment, reconciliation, public release, mainnet activity, or production-ready claims through this request.',
];

export function buildTrustlessBurnExecutionRequestCommand(input: {
  sourceCommit: string;
  prerequisiteMap: string;
  operatorPacket: string;
  out?: string;
  jsonOut?: string;
}): string {
  const parts = [
    'npm run trustless:execution-request --',
    '--source-commit',
    sanitize(input.sourceCommit),
    '--prerequisite-map',
    sanitize(input.prerequisiteMap),
    '--operator-packet',
    sanitize(input.operatorPacket),
  ];
  if (input.out) parts.push('--out <request.md>');
  if (input.jsonOut) parts.push('--json-out <request.json>');
  return parts.join(' ');
}

export function buildTrustlessBurnExecutionRequestReport(
  input: TrustlessBurnExecutionRequestInput,
): TrustlessBurnExecutionRequestReport {
  const mapCandidate = extractFieldValue(input.prerequisiteMapMarkdown, 'Candidate target');
  const packetCandidate = extractFieldValue(input.operatorPacketMarkdown, 'Candidate target');

  return {
    status: 'TRUSTLESS_BURN_EXECUTION_REQUEST_READY',
    exitCode: 0,
    command: sanitize(input.command),
    sourceCommit: sanitize(input.sourceCommit),
    prerequisiteMapTarget: sanitize(input.prerequisiteMapTarget),
    operatorPacketTarget: sanitize(input.operatorPacketTarget),
    candidateTarget: sanitize(mapCandidate ?? packetCandidate ?? 'unknown'),
    prerequisiteMapResult: sanitize(extractFieldValue(input.prerequisiteMapMarkdown, 'Result') ?? 'unknown'),
    prerequisiteMapStructuralIssues: extractNumericField(input.prerequisiteMapMarkdown, 'Structural issues'),
    operatorPacketResult: sanitize(extractFieldValue(input.operatorPacketMarkdown, 'Current result') ?? 'unknown'),
    operatorPacketStructuralIssues: extractNumericField(input.operatorPacketMarkdown, 'Structural issues'),
    operatorRequests: buildOperatorRequests(),
    evidenceTargetsToProduce: buildEvidenceTargetsToProduce(),
    forbiddenInputs: [...forbiddenInputs],
    boundary: buildBoundary(),
  };
}

export function formatTrustlessBurnExecutionRequestMarkdown(
  report: TrustlessBurnExecutionRequestReport,
): string {
  return [
    '# Gate 5 Trustless Burn Execution Request',
    '',
    'This request converts the current Gate 5 trustless-burn prerequisite map and operator packet into the next concrete operator evidence captures.',
    'It is planning output only and does not inspect private runtime state, read secrets, query nodes, authorize signing or transaction checks, submit, broadcast, close Gate 5, or support release claims.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Status', report.status],
      ['Source commit', report.sourceCommit],
      ['Prerequisite map', report.prerequisiteMapTarget],
      ['Operator packet', report.operatorPacketTarget],
      ['Candidate target', report.candidateTarget],
      ['Prerequisite map result', report.prerequisiteMapResult],
      ['Prerequisite map structural issues', String(report.prerequisiteMapStructuralIssues)],
      ['Operator packet result', report.operatorPacketResult],
      ['Operator packet structural issues', String(report.operatorPacketStructuralIssues)],
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

export function validateTrustlessBurnExecutionRequestReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--trustless-burn-request-json report must be an object'];
  if (value.status !== 'TRUSTLESS_BURN_EXECUTION_REQUEST_READY') {
    errors.push('--trustless-burn-request-json report.status must be TRUSTLESS_BURN_EXECUTION_REQUEST_READY');
  }
  if (value.exitCode !== 0) errors.push('--trustless-burn-request-json report.exitCode must be 0');
  for (const field of [
    'command',
    'sourceCommit',
    'prerequisiteMapTarget',
    'operatorPacketTarget',
    'candidateTarget',
    'prerequisiteMapResult',
    'operatorPacketResult',
  ]) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--trustless-burn-request-json report.${field} must be a non-empty string`);
    }
  }
  if (!isNonNegativeSafeInteger(value.prerequisiteMapStructuralIssues)) {
    errors.push('--trustless-burn-request-json report.prerequisiteMapStructuralIssues must be a non-negative safe integer');
  }
  if (!isNonNegativeSafeInteger(value.operatorPacketStructuralIssues)) {
    errors.push('--trustless-burn-request-json report.operatorPacketStructuralIssues must be a non-negative safe integer');
  }
  validateStringArray(value.evidenceTargetsToProduce, 'evidenceTargetsToProduce', errors);
  validateStringArray(value.forbiddenInputs, 'forbiddenInputs', errors);
  if (!Array.isArray(value.operatorRequests) || value.operatorRequests.length === 0) {
    errors.push('--trustless-burn-request-json report.operatorRequests must be a non-empty array');
  } else {
    value.operatorRequests.forEach((request, index) => validateOperatorRequest(request, index, errors));
  }
  validateBoundary(value.boundary, errors);
  if (findLocalPathLeak(value)) {
    errors.push('--trustless-burn-request-json report must not serialize local absolute paths');
  }
  return errors;
}

export function validateTrustlessBurnPrerequisiteMapForExecution(markdown: string): string[] {
  if (!markdown.includes('# Gate 5 Trustless Burn Prerequisite Map')) {
    return ['--prerequisite-map must be a Gate 5 Trustless Burn Prerequisite Map'];
  }
  const requiredSnippets = [
    '## Validation Snapshot',
    '## Exact Remaining Validator Issues',
    '## Anchor Observation Input Request',
    '## SPV Tracker Observation Input Request',
    '## Next Evidence Sequence',
    '## Boundary',
    'Candidate target',
    'Result',
    'Structural issues',
    'Required Components: Ergo extension-section anchoring',
    'Required Components: Sidechain header/finality verifier',
    'Required Components: Burn inclusion proof',
    'Required Components: DUP settlement binding',
    'Required Components: Independent review',
    'Positive Proof Acceptance',
    '| Planning output only | yes |',
    '| Evidence row closure claimed | no |',
    '| Release gate PASS claimed | no |',
    '| Secret or environment file read | no |',
    '| Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed | no |',
  ];
  return requiredSnippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `--prerequisite-map must include ${snippet}`);
}

export function validateTrustlessBurnOperatorPacketForExecution(markdown: string): string[] {
  if (!markdown.includes('# Gate 5 Trustless Burn Operator Packet')) {
    return ['--operator-packet must be a Gate 5 Trustless Burn Operator Packet'];
  }
  const requiredSnippets = [
    '## Source Snapshot',
    '## Capture Inputs',
    '## Required Output Bindings',
    '## Boundary',
    'Candidate target',
    'Current result',
    'Structural issues',
    'Proof-path identity',
    'Extension anchoring',
    'SPV tracker and finality',
    'Proof acceptance and DUP settlement',
    'Independent review',
    'Trustless burn verification implemented = yes',
    'Transitional trusted burn path disabled = yes',
    'Critical/high findings open = 0',
    'Production-ready claim allowed = no',
    'Release supported = production deployment candidate',
    '| Planning output only | yes |',
    '| Derived from Gate 5 prerequisite map | yes |',
    '| Completed trustless burn evidence claimed | no |',
    '| Evidence row closure claimed | no |',
    '| Release gate PASS claimed | no |',
    '| Runtime database or deployment state opened | no |',
    '| Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed | no |',
  ];
  return requiredSnippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `--operator-packet must include ${snippet}`);
}

function buildOperatorRequests(): TrustlessBurnOperatorExecutionRequest[] {
  return [
    {
      phase: '1. Bind one non-mainnet trustless-burn instance',
      operatorAction:
        'Select exactly one non-mainnet burn instance and record sidechainId, sidechain transaction hash, sidechain block hash, event index, bridgeEventRoot, Ergo anchor height, burnId, duplicate-prevention key, recipient binding, amount, asset, proof-vector target, and candidate target.',
      evidenceToReturn:
        'Gate 5 instance binding packet with all identifiers, source evidence targets, selected network, reviewer-visible timestamp, and explicit no-mainnet/no-claim/no-broadcast scope.',
      stopCondition:
        'Stop if the instance is generic, targetless, mainnet-scoped, missing any identifier, not bound to the current candidate target, or relies on private deployment/runtime material.',
    },
    {
      phase: '2. Refresh local proof-vector, candidate, and unsigned evidence',
      operatorAction:
        'Produce or refresh guarded local proof-vector validation, trustless candidate validation, and compact unsigned transaction validation for the selected instance without running /transactions/check.',
      evidenceToReturn:
        'Proof-vector JSON and validation report, candidate JSON and validation report, unsigned transaction JSON and trustless:unsigned-tx:validate report with contextExtensionGuard = pass, transactionCheck = no, expectedTxId = no, signing = no, and submit = no.',
      stopCondition:
        'Stop on single-leaf proof evidence, empty proof nodes, failed negative cases, unsafe JSON targets, transaction-check fields, expected-tx-id fields, signing fields, submit fields, or Gate 5 closure wording.',
    },
    {
      phase: '3. Capture public anchor, tracker, and finality observations',
      operatorAction:
        'Run the approved read-only observation captures against sanitized public inputs for the same bridgeEventRoot and anchor height, then bind sidechain finality/tracker history to that identity.',
      evidenceToReturn:
        'Sanitized public extension-observation JSON, trustless:anchor-observe LINKED report, sanitized SPV tracker observation JSON, trustless:spv-tracker-observe LINKED report, and sidechain finality evidence for the same commitment.',
      stopCondition:
        'Stop if inputs contain private node config, runtime DB paths, deployment-state dumps, missing 0x04xx anchor data, mismatched roots/heights, unlinked tracker values, or local-only finality claims.',
    },
    {
      phase: '4. Reconcile observations and settlement binding',
      operatorAction:
        'Run observation reconciliation and assemble proof that the anchor, SPV tracker, proof-vector, burn proof, DUP key, recipient, amount, and settlement outputs all bind to the same instance.',
      evidenceToReturn:
        'trustless:observation-reconcile report plus settlement-binding packet proving exact burnId-to-DUP insertion, payout recipient and amount preservation, and non-broadcast settlement shape.',
      stopCondition:
        'Stop on bridgeEventRoot drift, sidechain header drift, Ergo anchor drift, DUP key mismatch, payout mismatch, missing successor boxes, local mutation, signing, submit, reconcile mutation, or broadcast wording.',
    },
    {
      phase: '5. Complete proof acceptance and Gate 5 evidence validation',
      operatorAction:
        'Link positive proof acceptance and negative rejection evidence, then assemble completed Gate 5 trustless-burn evidence and run trustless:validate on the completed Markdown target.',
      evidenceToReturn:
        'Completed trustless burn evidence Markdown, trustless:validate output, accepted proof evidence, malformed/stale/unfinalized rejection evidence, and distinct completed targets for component, commitment, proof, positive, negative, and publication-update rows.',
      stopCondition:
        'Stop if validation is not PASS, structural issues remain, evidence targets are reused, validation output is used as row evidence, negative cases are targetless, or publication rows are not distinct completed evidence.',
    },
    {
      phase: '6. Collect review and publication-boundary evidence',
      operatorAction:
        'Collect protocol, security, and operator reviewer sign-offs after completed evidence exists, and update release-note/checklist evidence only with bounded testnet-production-candidate wording.',
      evidenceToReturn:
        'Independent review evidence, protocol/security/operator approvals with concrete trustless-burn outcome notes, Critical/high findings open = 0, Transitional trusted burn path disabled = yes, Production-ready claim allowed = no, and completed checklist/release-note update targets.',
      stopCondition:
        'Stop if review predates evidence, reviewer notes approve mainnet or production-ready wording, trusted fallback wording remains, critical/high findings are non-numeric or non-zero, or release-gate PASS is not real.',
    },
  ];
}

function buildEvidenceTargetsToProduce(): string[] {
  return [
    '../evidence/trustless-burn/<gate5-trustless-burn-instance-binding.md>',
    '../evidence/trustless-burn/artifacts/<gate5-trustless-proof-vector-validation.json>',
    '../evidence/trustless-burn/artifacts/<gate5-trustless-candidate-validation.md>',
    '../evidence/trustless-burn/artifacts/<gate5-trustless-unsigned-tx-validation.md>',
    '../evidence/trustless-burn/artifacts/<gate5-trustless-anchor-observe-report.json>',
    '../evidence/trustless-burn/artifacts/<gate5-trustless-spv-tracker-observe-report.json>',
    '../evidence/trustless-burn/artifacts/<gate5-trustless-observation-reconcile-report.json>',
    '../evidence/trustless-burn/<gate5-trustless-proof-acceptance-and-dup-binding.md>',
    '../evidence/trustless-burn/<completed-gate5-trustless-burn-evidence.md>',
    '../evidence/trustless-burn/artifacts/<trustless-validate-completed-gate5.md>',
    '../evidence/security/<gate5-independent-trustless-burn-review.md>',
    '../evidence/release/<completed-gate5-checklist-update-evidence.md>',
    '../evidence/release/<completed-gate5-release-note-update-evidence.md>',
  ];
}

function buildBoundary(): Record<string, 'yes' | 'no'> {
  return {
    'Planning output only': 'yes',
    'Prerequisite map reused': 'yes',
    'Operator packet reused': 'yes',
    'Concrete operator execution request produced': 'yes',
    'Secret or environment file read': 'no',
    'Wallet recovery material or private key read': 'no',
    'Node config secret read': 'no',
    'Runtime database opened by request command': 'no',
    'Private deployment state opened by request command': 'no',
    'Node or RPC request performed by request command': 'no',
    'Transaction signing/check/submit/broadcast/reconciliation/deployment performed': 'no',
    'Gate 5 trustless-burn evidence claimed complete': 'no',
    'Release gate PASS claimed': 'no',
    'Production-ready claim allowed': 'no',
    'Mainnet-grade evidence linked': 'no',
    'Testnet production-candidate claim authorized by request': 'no',
  };
}

function extractFieldValue(markdown: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*([^|]+?)\\s*\\|`, 'im'));
  if (!match) return undefined;
  return stripInlineCode(match[1].trim());
}

function extractNumericField(markdown: string, field: string): number {
  const raw = extractFieldValue(markdown, field) ?? '';
  const match = raw.match(/\b(\d+)\b/);
  return match ? Number(match[1]) : 0;
}

function stripInlineCode(value: string): string {
  return value.replace(/^`/, '').replace(/`$/, '');
}

function validateOperatorRequest(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--trustless-burn-request-json report.operatorRequests[${index}] must be an object`);
    return;
  }
  for (const field of ['phase', 'operatorAction', 'evidenceToReturn', 'stopCondition']) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--trustless-burn-request-json report.operatorRequests[${index}].${field} must be a non-empty string`);
    }
  }
}

function validateStringArray(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
    errors.push(`--trustless-burn-request-json report.${field} must be a non-empty string array`);
  }
}

function validateBoundary(value: unknown, errors: string[]): void {
  const expected = buildBoundary();
  if (!isRecord(value)) {
    errors.push('--trustless-burn-request-json report.boundary must be an object');
    return;
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--trustless-burn-request-json report.boundary.${field} must be ${expectedValue}`);
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
