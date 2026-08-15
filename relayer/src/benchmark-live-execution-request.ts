import { sanitizeReportText } from './report-text-sanitizer.js';

export interface BenchmarkLiveExecutionRequestInput {
  sourceCommit: string;
  captureManifestTarget: string;
  captureManifestMarkdown: string;
  command: string;
}

export interface BenchmarkLiveExecutionRequestReport {
  status: 'LIVE_BENCHMARK_EXECUTION_REQUEST_BLOCKED';
  exitCode: 1;
  command: string;
  sourceCommit: string;
  captureManifestTarget: string;
  candidateTarget: string;
  captureManifestPrerequisiteResult: string;
  captureManifestStructuralIssues: number;
  reviewPacketStatus: string;
  readinessRequestTarget?: string;
  operatorRequests: BenchmarkLiveOperatorRequest[];
  evidenceTargetsToProduce: string[];
  forbiddenInputs: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface BenchmarkLiveOperatorRequest {
  phase: string;
  operatorAction: string;
  evidenceToReturn: string;
  stopCondition: string;
}

const forbiddenInputs = [
  'Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, or seed phrases.',
  'Do not provide raw runtime databases, private bridge-state SQLite files, deployment-state dumps, or node data directories.',
  'Do not approve signing, submit, broadcast, deployment, publication, PR, mainnet activity, or production throughput claims through this request.',
  'Do not enable broadcast or attempt any legacy V1 aggregate submit command; approval cannot override the conservation quarantine.',
];

export function buildBenchmarkLiveExecutionRequestCommand(input: {
  sourceCommit: string;
  captureManifest: string;
  out?: string;
  jsonOut?: string;
}): string {
  const parts = [
    'npm run benchmark:live-execution-request --',
    '--source-commit',
    sanitize(input.sourceCommit),
    '--capture-manifest',
    sanitize(input.captureManifest),
  ];
  if (input.out) parts.push('--out <request.md>');
  if (input.jsonOut) parts.push('--json-out <request.json>');
  return parts.join(' ');
}

export function buildBenchmarkLiveExecutionRequestReport(
  input: BenchmarkLiveExecutionRequestInput,
): BenchmarkLiveExecutionRequestReport {
  const candidateTarget = extractCurrentInputTarget(input.captureManifestMarkdown, 'Gate 7 candidate') ?? 'unknown';
  const prerequisiteStatus =
    extractCurrentInputStatus(input.captureManifestMarkdown, 'Gate 7 prerequisite map') ?? 'unknown';
  const reviewPacketStatus =
    extractCurrentInputStatus(input.captureManifestMarkdown, 'Gate 7 review packet') ?? 'unknown';
  const readinessRequestTarget = extractCurrentInputTarget(
    input.captureManifestMarkdown,
    'Current readiness operator request',
  );

  return {
    status: 'LIVE_BENCHMARK_EXECUTION_REQUEST_BLOCKED',
    exitCode: 1,
    command: sanitize(input.command),
    sourceCommit: sanitize(input.sourceCommit),
    captureManifestTarget: sanitize(input.captureManifestTarget),
    candidateTarget: sanitize(candidateTarget),
    captureManifestPrerequisiteResult: sanitize(prerequisiteStatus),
    captureManifestStructuralIssues: extractStructuralIssueCount(prerequisiteStatus),
    reviewPacketStatus: sanitize(reviewPacketStatus),
    readinessRequestTarget: readinessRequestTarget ? sanitize(readinessRequestTarget) : undefined,
    operatorRequests: buildOperatorRequests(),
    evidenceTargetsToProduce: buildEvidenceTargetsToProduce(),
    forbiddenInputs: [...forbiddenInputs],
    boundary: buildBoundary(),
  };
}

export function formatBenchmarkLiveExecutionRequestMarkdown(
  report: BenchmarkLiveExecutionRequestReport,
): string {
  const summaryRows: string[][] = [
    ['Field', 'Value'],
    ['Status', report.status],
    ['Source commit', report.sourceCommit],
    ['Capture manifest', report.captureManifestTarget],
    ['Gate 7 candidate', report.candidateTarget],
    ['Capture manifest prerequisite result', report.captureManifestPrerequisiteResult],
    ['Capture manifest structural issues', String(report.captureManifestStructuralIssues)],
    ['Review packet status', report.reviewPacketStatus],
  ];
  if (report.readinessRequestTarget) {
    summaryRows.push(['Readiness operator request', report.readinessRequestTarget]);
  }

  return [
    '# Gate 7 Live Benchmark Execution Request - BLOCKED',
    '',
    'This request records why the current legacy V1 route cannot execute a live-batch benchmark and the non-broadcast diagnostics that remain valid.',
    'It is planning output only and does not inspect private runtime state, read secrets, authorize signing, submit, broadcast, close Gate 7, or support release claims. A reviewed and activated external-fee profile plus legacy-route retirement is required before a new execution request can be READY.',
    '',
    '## Summary',
    '',
    markdownTable(summaryRows),
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

export function validateBenchmarkLiveExecutionRequestReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--live-benchmark-request-json report must be an object'];
  if (value.status !== 'LIVE_BENCHMARK_EXECUTION_REQUEST_BLOCKED') {
    errors.push('--live-benchmark-request-json report.status must be LIVE_BENCHMARK_EXECUTION_REQUEST_BLOCKED');
  }
  if (value.exitCode !== 1) errors.push('--live-benchmark-request-json report.exitCode must be 1');
  for (const field of [
    'command',
    'sourceCommit',
    'captureManifestTarget',
    'candidateTarget',
    'captureManifestPrerequisiteResult',
    'reviewPacketStatus',
  ]) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--live-benchmark-request-json report.${field} must be a non-empty string`);
    }
  }
  if (!isNonNegativeSafeInteger(value.captureManifestStructuralIssues)) {
    errors.push('--live-benchmark-request-json report.captureManifestStructuralIssues must be a non-negative safe integer');
  }
  if (value.readinessRequestTarget !== undefined && (typeof value.readinessRequestTarget !== 'string' || value.readinessRequestTarget.trim().length === 0)) {
    errors.push('--live-benchmark-request-json report.readinessRequestTarget must be a non-empty string when present');
  }
  validateExactStringArray(
    value.evidenceTargetsToProduce,
    buildEvidenceTargetsToProduce(),
    'evidenceTargetsToProduce',
    errors,
  );
  validateExactStringArray(value.forbiddenInputs, forbiddenInputs, 'forbiddenInputs', errors);
  if (!Array.isArray(value.operatorRequests) || value.operatorRequests.length === 0) {
    errors.push('--live-benchmark-request-json report.operatorRequests must be a non-empty array');
  } else {
    const expectedRequests = buildOperatorRequests();
    if (value.operatorRequests.length !== expectedRequests.length) {
      errors.push(`--live-benchmark-request-json report.operatorRequests must contain exactly ${expectedRequests.length} canonical blocked requests`);
    }
    value.operatorRequests.forEach((request, index) => {
      validateOperatorRequest(request, index, errors);
      const expected = expectedRequests[index];
      if (!expected || !isRecord(request)) return;
      for (const field of ['phase', 'operatorAction', 'evidenceToReturn', 'stopCondition'] as const) {
        if (request[field] !== expected[field]) {
          errors.push(`--live-benchmark-request-json report.operatorRequests[${index}].${field} must match the canonical blocked request`);
        }
      }
    });
  }
  validateBoundary(value.boundary, errors);
  if (findLocalPathLeak(value)) {
    errors.push('--live-benchmark-request-json report must not serialize local absolute paths');
  }
  if (findLegacyV1LiveInstruction(value)) {
    errors.push('--live-benchmark-request-json report must not contain a legacy V1 submit command or broadcast-enable instruction');
  }
  return errors;
}

export function validateBenchmarkLiveCaptureManifestForExecution(markdown: string): string[] {
  if (!markdown.includes('# Gate 7 Live Benchmark Capture Manifest')) {
    return ['--capture-manifest must be a Gate 7 Live Benchmark Capture Manifest'];
  }
  const requiredSnippets = [
    '## Current Inputs',
    '## Capture Sequence',
    '## Boundary',
    'Gate 7 candidate',
    'Gate 7 prerequisite map',
    'Gate 7 review packet',
    'Bind live-batch identity inputs',
    'Unsigned legacy shape diagnostic',
    'Replacement-profile target-node acceptance',
    'Live submit blocked',
    'no legacy V1 submit command is emitted',
    '| Secret or environment file read | no |',
    '| Runtime database opened | no |',
    '| Private deployment state opened | no |',
    '| Live transaction signing performed | no |',
    '| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |',
  ];
  const errors = requiredSnippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `--capture-manifest must include ${snippet}`);
  if (findLegacyV1LiveInstruction(markdown)) {
    errors.push('--capture-manifest must not contain a legacy V1 submit command or broadcast-enable instruction');
  }
  return errors;
}

function buildOperatorRequests(): BenchmarkLiveOperatorRequest[] {
  return [
    {
      phase: '1. Bind live-batch identity inputs',
      operatorAction:
        'Choose one non-mainnet network, one Gate 7 candidate, one ordered burn set, one batch window, and the operator-provided read-only state/deployed-state input targets for the non-broadcast check.',
      evidenceToReturn:
        'Identity packet with network, candidate target, ordered burn set, batch window, sourceBindings.state target class, sourceBindings.deployedState target class, and no submit/broadcast scope.',
      stopCondition:
        'Stop if identity inputs are generic, targetless, private runtime defaults, secret-bearing, mainnet-scoped, or grant broader signing/broadcast permission.',
    },
    {
      phase: '2. Produce unsigned legacy shape diagnostics',
      operatorAction:
        'Run unsigned prepare-batch diagnostics for the selected ordered burn set without signing, node checking, Expected transaction ID generation, authorization, submit, or broadcast.',
      evidenceToReturn:
        'Unsigned diagnostic output binding the ordered burn set and settlement shape with explicit no-check, no-sign, no-authority, no-submit, and no-broadcast boundaries.',
      stopCondition:
        'Stop if unsigned output is presented as target-node acceptance, funds authority, live benchmark evidence, or permission to recreate legacy signing.',
    },
    {
      phase: '3. Record the legacy settlement quarantine',
      operatorAction:
        'Record that the legacy V1 route is disabled because its miner fee reduces protected Ergo backing without an equal sidechain supply reduction.',
      evidenceToReturn:
        'Quarantine artifact naming the exact legacy profile, disabled daemon/CLI/programmatic boundaries, and the separately versioned external-fee activation and legacy-retirement prerequisites.',
      stopCondition:
        'Stop if an approval, checked Expected transaction ID, local status, or broadcast setting is presented as authority to lift the quarantine.',
    },
    {
      phase: '4. Define replacement-profile target-node acceptance',
      operatorAction:
        'Wait for the separately versioned external-fee profile to be reviewed and activated, then define a profile-specific no-submit target-node acceptance packet.',
      evidenceToReturn:
        'Activated profile identity, application-bound source finality, conservation equation, global DUP cutover lineage, exact chain-resident setup/admission state, and stateful node acceptance plan.',
      stopCondition:
        'Stop while activation, finality, conservation, replay, chain-state, or target-node acceptance remains open.',
    },
    {
      phase: '5. Verify the quarantine remains active',
      operatorAction:
        'Keep broadcast and aggregate settlement disabled, then verify startup and every legacy submit facade fail closed before state acquisition, signing, or transport.',
      evidenceToReturn:
        'Broadcast-disabled readiness output, unsigned diagnostic boundary evidence, and the legacy submission boundary-test artifact.',
      stopCondition:
        'Stop if generated output contains an executable legacy submit command, requests broadcast enablement, or treats diagnostic check evidence as funds authority.',
    },
    {
      phase: '6. Live execution blocked',
      operatorAction:
        'Do not sign or submit legacy V1. Hand the exact conservation, target-node, authority, and retirement prerequisites to the corrected-profile work package.',
      evidenceToReturn:
        'Reviewed external-fee profile identity, target-node acceptance plan, exact funds-authority transition, and permanent legacy-route retirement plan.',
      stopCondition:
        'Stop unconditionally while the legacy profile is selected; explicit approval cannot override this blocker.',
    },
    {
      phase: '7. Preserve Gate 7 as blocked',
      operatorAction:
        'Keep Gate 7 and all release claims blocked until the corrected profile has activation, live submission, confirmation, and reconciliation evidence.',
      evidenceToReturn:
        'Updated blocker map and a future corrected-profile evidence request; historical reconciliation is not accepted as a new live-batch benchmark.',
      stopCondition:
        'Stop if Gate 7 is marked complete before corrected-profile evidence exists or if production, mainnet, testnet-candidate, or throughput claims broaden.',
    },
  ];
}

function buildEvidenceTargetsToProduce(): string[] {
  return [
    '../evidence/benchmarks/artifacts/<gate7-live-batch-identity-packet.md>',
    '../evidence/benchmarks/artifacts/<gate7-legacy-v1-unsigned-shape.json>',
    '../evidence/benchmarks/artifacts/<gate7-legacy-v1-quarantine.md>',
    '../evidence/benchmarks/artifacts/<gate7-replacement-profile-target-node-acceptance.md>',
    '../evidence/benchmarks/artifacts/<gate7-legacy-submission-boundary-tests.md>',
    '../evidence/benchmarks/artifacts/<gate7-external-fee-activation-prerequisites.md>',
  ];
}

function buildBoundary(): Record<string, 'yes' | 'no'> {
  return {
    'Planning output only': 'yes',
    'Capture manifest reused': 'yes',
    'Concrete operator execution request produced': 'yes',
    'Legacy V1 submission executable': 'no',
    'Secret or environment file read': 'no',
    'Wallet recovery material or private key read': 'no',
    'Node config secret read': 'no',
    'Runtime database opened by request command': 'no',
    'Private deployment state opened by request command': 'no',
    'Node or RPC request performed by request command': 'no',
    'Live transaction signing performed': 'no',
    'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'no',
    'Gate 7 benchmark evidence claimed complete': 'no',
    'Release gate PASS claimed': 'no',
    'Production-ready claim allowed': 'no',
    'Production throughput claim allowed': 'no',
    'Mainnet-grade evidence linked': 'no',
  };
}

function extractCurrentInputTarget(markdown: string, inputName: string): string | undefined {
  const row = extractCurrentInputRow(markdown, inputName);
  return row?.target;
}

function extractCurrentInputStatus(markdown: string, inputName: string): string | undefined {
  const row = extractCurrentInputRow(markdown, inputName);
  return row?.status;
}

function extractCurrentInputRow(markdown: string, inputName: string): { target: string; status: string } | undefined {
  const escaped = inputName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|`, 'im'));
  if (!match) return undefined;
  return {
    target: stripInlineCode(match[1].trim()),
    status: stripInlineCode(match[2].trim()),
  };
}

function stripInlineCode(value: string): string {
  return value.replace(/^`/, '').replace(/`$/, '');
}

function extractStructuralIssueCount(status: string): number {
  const match = status.match(/\bwith\s+(\d+)\s+structural issues?\b/i);
  return match ? Number(match[1]) : 0;
}

function validateOperatorRequest(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--live-benchmark-request-json report.operatorRequests[${index}] must be an object`);
    return;
  }
  for (const field of ['phase', 'operatorAction', 'evidenceToReturn', 'stopCondition']) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--live-benchmark-request-json report.operatorRequests[${index}].${field} must be a non-empty string`);
    }
  }
}

function validateExactStringArray(
  value: unknown,
  expected: string[],
  field: string,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0 || value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
    errors.push(`--live-benchmark-request-json report.${field} must be a non-empty string array`);
    return;
  }
  if (value.length !== expected.length || value.some((entry, index) => entry !== expected[index])) {
    errors.push(`--live-benchmark-request-json report.${field} must match the canonical blocked request`);
  }
}

function validateBoundary(value: unknown, errors: string[]): void {
  const expected = buildBoundary();
  if (!isRecord(value)) {
    errors.push('--live-benchmark-request-json report.boundary must be an object');
    return;
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--live-benchmark-request-json report.boundary.${field} must be ${expectedValue}`);
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

function findLegacyV1LiveInstruction(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const directCommand = /(?:npm(?:\.cmd)?\s+run|npx(?:\.cmd)?)\s+settle:aggregate\s+--\s+submit(?:\s|[-*])/i;
    const directScript = /\b(?:node|tsx)\b[^\r\n]{0,120}\baggregate-settlement(?:\.[cm]?[jt]s)?\b[^\r\n]{0,40}\bsubmit(?:\s|[-*])/i;
    const broadcastEnable = /BRIDGE_BROADCAST_ENABLED\s*=\s*(?:true|1|yes|on)\b/i;
    const unsafeProse = value.split(/\r?\n/).find(line => {
      const describesAction = /\b(?:run|execute|invoke|attempt|allow|approve|enable|perform)\b/i.test(line);
      const namesLegacySubmit = /\b(?:legacy(?:\s+v1)?|aggregate)\b.{0,100}\bsubmit(?:tal|ting)?\b/i.test(line);
      const isFailClosed = /\b(?:no|do not|must not|cannot|can't|block(?:ed)?|disabled|quarantin(?:e|ed))\b/i.test(line);
      return describesAction && namesLegacySubmit && !isFailClosed;
    });
    return directCommand.test(value)
      || directScript.test(value)
      || broadcastEnable.test(value)
      || unsafeProse !== undefined
      ? value
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const instruction = findLegacyV1LiveInstruction(item);
      if (instruction) return instruction;
    }
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const instruction = findLegacyV1LiveInstruction(item);
      if (instruction) return instruction;
    }
  }
  return undefined;
}
