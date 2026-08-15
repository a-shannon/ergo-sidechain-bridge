import { validateEvidenceHygiene } from './evidence-hygiene.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type LocalDevnetSignerFundingSummaryStatus =
  | 'LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_READY'
  | 'LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_BLOCKED';

export interface LocalDevnetSignerFundingSummaryInput {
  sourceCommit: string;
  executionRequestTarget: string;
  executionRequestMarkdown: string;
  signerOutputTarget: string;
  signerOutputMarkdown: string;
  fundingOutputTarget: string;
  fundingOutputMarkdown: string;
  signerCommand: string;
  fundingCommand: string;
  secretMaterialScope: string;
  command: string;
}

export interface LocalDevnetSignerFundingSummaryReport {
  status: LocalDevnetSignerFundingSummaryStatus;
  exitCode: 0 | 1;
  command: string;
  sourceCommit: string;
  executionRequestTarget: string;
  signerOutputTarget: string;
  fundingOutputTarget: string;
  signerCommand: string;
  fundingCommand: string;
  secretMaterialScope: string;
  signerStatus: 'PASS' | 'BLOCKED';
  fundingStatus: 'PASS' | 'BLOCKED';
  enoughSpendableDevnetErg: 'yes' | 'no';
  signerSummary: string;
  fundingSummary: string;
  evidenceTargetsToProduce: string[];
  forbiddenInputs: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

const forbiddenInputs = [
  'Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, or seed phrases.',
  'Do not provide raw runtime databases, private bridge-state SQLite files, deployment-state dumps, or node data directories.',
  'Do not approve deployment, signing, submit, broadcast, publication, PR, or mainnet activity through this summary.',
];

export function buildLocalDevnetSignerFundingSummaryCommand(input: {
  sourceCommit: string;
  executionRequest: string;
  signerOutput: string;
  fundingOutput: string;
  signerCommand: string;
  fundingCommand: string;
  secretMaterialScope: string;
  out?: string;
  jsonOut?: string;
}): string {
  const parts = [
    'npm run rehearsal:local-devnet-signer-funding-summary --',
    '--source-commit',
    sanitize(input.sourceCommit),
    '--execution-request',
    sanitize(input.executionRequest),
    '--signer-output',
    sanitize(input.signerOutput),
    '--funding-output',
    sanitize(input.fundingOutput),
    '--signer-command',
    sanitize(input.signerCommand),
    '--funding-command',
    sanitize(input.fundingCommand),
    '--secret-material-scope',
    sanitize(input.secretMaterialScope),
  ];
  if (input.out) parts.push('--out <summary.md>');
  if (input.jsonOut) parts.push('--json-out <summary.json>');
  return parts.join(' ');
}

export function buildLocalDevnetSignerFundingSummaryReport(
  input: LocalDevnetSignerFundingSummaryInput,
): LocalDevnetSignerFundingSummaryReport {
  const signerStatus = classifySignerStatus(input.signerOutputMarkdown);
  const fundingStatus = classifyFundingStatus(input.fundingOutputMarkdown);
  const status =
    signerStatus === 'PASS' && fundingStatus === 'PASS'
      ? 'LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_READY'
      : 'LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_BLOCKED';

  return {
    status,
    exitCode: status === 'LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_READY' ? 0 : 1,
    command: sanitize(input.command),
    sourceCommit: sanitize(input.sourceCommit),
    executionRequestTarget: sanitize(input.executionRequestTarget),
    signerOutputTarget: sanitize(input.signerOutputTarget),
    fundingOutputTarget: sanitize(input.fundingOutputTarget),
    signerCommand: sanitize(input.signerCommand),
    fundingCommand: sanitize(input.fundingCommand),
    secretMaterialScope: sanitize(input.secretMaterialScope),
    signerStatus,
    fundingStatus,
    enoughSpendableDevnetErg: fundingStatus === 'PASS' ? 'yes' : 'no',
    signerSummary: sanitize(extractRelevantLine(input.signerOutputMarkdown, 'Devnet mining target') ?? 'signer alignment not proven'),
    fundingSummary: sanitize(extractRelevantLine(input.fundingOutputMarkdown, 'Relayer funding') ?? 'funding not proven'),
    evidenceTargetsToProduce: buildEvidenceTargetsToProduce(),
    forbiddenInputs: [...forbiddenInputs],
    boundary: buildBoundary(),
  };
}

export function validateLocalDevnetSignerFundingSummaryInputs(
  input: LocalDevnetSignerFundingSummaryInput,
): string[] {
  const errors: string[] = [];
  if (!/^[0-9a-f]{7,40}$/i.test(input.sourceCommit)) {
    errors.push('--source-commit must be a 7-40 character hex commit identifier.');
  }
  errors.push(...validateExecutionRequest(input.executionRequestMarkdown, input.executionRequestTarget));
  errors.push(...validateCommand(input.signerCommand, 'signer', 'npm run demo:devnet:signer'));
  errors.push(...validateCommand(input.fundingCommand, 'funding', 'npm run demo:devnet:funding'));
  errors.push(...validateSecretMaterialScope(input));
  errors.push(...validateOperatorOutput(input.signerOutputMarkdown, input.signerOutputTarget, 'signer'));
  errors.push(...validateOperatorOutput(input.fundingOutputMarkdown, input.fundingOutputTarget, 'funding'));
  if (findLocalPathLeak([
    input.command,
    input.executionRequestTarget,
    input.signerOutputTarget,
    input.fundingOutputTarget,
    input.signerCommand,
    input.fundingCommand,
    input.secretMaterialScope,
  ])) {
    errors.push('--local-devnet-signer-funding-summary inputs must not serialize local absolute paths');
  }
  return errors;
}

export function validateLocalDevnetSignerFundingSummaryReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--local-devnet-signer-funding-summary-json report must be an object'];
  if (
    value.status !== 'LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_READY' &&
    value.status !== 'LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_BLOCKED'
  ) {
    errors.push('--local-devnet-signer-funding-summary-json report.status must be a local-devnet signer/funding summary status');
  }
  if (value.exitCode !== 0 && value.exitCode !== 1) {
    errors.push('--local-devnet-signer-funding-summary-json report.exitCode must be 0 or 1');
  }
  for (const field of [
    'command',
    'sourceCommit',
    'executionRequestTarget',
    'signerOutputTarget',
    'fundingOutputTarget',
    'signerCommand',
    'fundingCommand',
    'secretMaterialScope',
    'signerSummary',
    'fundingSummary',
  ]) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--local-devnet-signer-funding-summary-json report.${field} must be a non-empty string`);
    }
  }
  if (value.signerStatus !== 'PASS' && value.signerStatus !== 'BLOCKED') {
    errors.push('--local-devnet-signer-funding-summary-json report.signerStatus must be PASS or BLOCKED');
  }
  if (value.fundingStatus !== 'PASS' && value.fundingStatus !== 'BLOCKED') {
    errors.push('--local-devnet-signer-funding-summary-json report.fundingStatus must be PASS or BLOCKED');
  }
  if (value.enoughSpendableDevnetErg !== 'yes' && value.enoughSpendableDevnetErg !== 'no') {
    errors.push('--local-devnet-signer-funding-summary-json report.enoughSpendableDevnetErg must be yes or no');
  }
  validateStringArray(value.evidenceTargetsToProduce, 'evidenceTargetsToProduce', errors);
  validateStringArray(value.forbiddenInputs, 'forbiddenInputs', errors);
  validateBoundary(value.boundary, errors);
  if (findLocalPathLeak(value)) {
    errors.push('--local-devnet-signer-funding-summary-json report must not serialize local absolute paths');
  }
  return errors;
}

export function formatLocalDevnetSignerFundingSummaryMarkdown(
  report: LocalDevnetSignerFundingSummaryReport,
): string {
  return [
    '# Gate 3 Local Devnet Signer/Funding Summary',
    '',
    'This artifact summarizes operator-provided redacted signer and funding command outputs for the next local-devnet rehearsal step.',
    'It does not inspect private runtime state, read secrets, authorize signing, submit, broadcast, close Gate 3, or support release claims.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Status', report.status],
      ['Source commit', report.sourceCommit],
      ['Execution request', report.executionRequestTarget],
      ['Signer output', report.signerOutputTarget],
      ['Funding output', report.fundingOutputTarget],
      ['Signer command', report.signerCommand],
      ['Funding command', report.fundingCommand],
      ['Secret material scope', report.secretMaterialScope],
      ['Signer status', report.signerStatus],
      ['Funding status', report.fundingStatus],
      ['Enough spendable devnet ERG', report.enoughSpendableDevnetErg],
      ['Signer summary', report.signerSummary],
      ['Funding summary', report.fundingSummary],
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

function validateExecutionRequest(markdown: string, target: string): string[] {
  const requiredSnippets = [
    '# Gate 3 Local Devnet Execution Request',
    'LOCAL_DEVNET_REQUEST_READY',
    'Signer/funding no-secret defaults',
    'Default signer/funding checks are no-secret and operator-gated',
    '| Secret or environment file read | no |',
    '| Runtime database opened | no |',
    '| Transaction signing performed | no |',
    '| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |',
  ];
  return requiredSnippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `${target}: execution request must include ${snippet}`);
}

function validateCommand(command: string, label: string, expected: string): string[] {
  const errors: string[] = [];
  if (!command.includes(expected)) {
    errors.push(`--${label}-command must include ${expected}`);
  }
  if (findLocalPathLeak(command)) {
    errors.push(`--${label}-command must not contain local absolute paths`);
  }
  return errors;
}

function validateSecretMaterialScope(input: LocalDevnetSignerFundingSummaryInput): string[] {
  const commands = `${input.signerCommand} ${input.fundingCommand}`;
  if (!commands.includes('--include-secret-material')) return [];
  const scope = input.secretMaterialScope.trim().toLowerCase();
  if (scope.length === 0) return ['--secret-material-scope is required when a command uses --include-secret-material'];
  if (!scope.includes('scoped') || !scope.includes('local')) {
    return ['--secret-material-scope must describe a scoped local operator shell when secret material is used'];
  }
  if (!/(no values|redacted|not serialized|without serialized)/i.test(input.secretMaterialScope)) {
    return ['--secret-material-scope must state that secret values are not serialized'];
  }
  return [];
}

function validateOperatorOutput(markdown: string, target: string, kind: 'signer' | 'funding'): string[] {
  const errors = validateEvidenceHygiene(markdown, target);
  if (kind === 'signer') {
    if (!markdown.includes('Devnet Signer / Mining Target Check')) {
      errors.push(`${target}: signer output must include Devnet Signer / Mining Target Check`);
    }
    if (!markdown.includes('npm run demo:devnet:signer')) {
      errors.push(`${target}: signer output must include the demo:devnet:signer command`);
    }
    if (classifySignerStatus(markdown) !== 'PASS') {
      errors.push(`${target}: signer output must include PASS signer or mining-target alignment`);
    }
  } else {
    if (!markdown.includes('Devnet Funding Preflight')) {
      errors.push(`${target}: funding output must include Devnet Funding Preflight`);
    }
    if (!markdown.includes('npm run demo:devnet:funding')) {
      errors.push(`${target}: funding output must include the demo:devnet:funding command`);
    }
    if (classifyFundingStatus(markdown) !== 'PASS') {
      errors.push(`${target}: funding output must include PASS relayer funding and deploy readiness`);
    }
  }
  return errors;
}

function classifySignerStatus(markdown: string): 'PASS' | 'BLOCKED' {
  return /^\s*\[PASS\]\s+Devnet (?:mining target|signer alignment)/im.test(markdown)
    ? 'PASS'
    : 'BLOCKED';
}

function classifyFundingStatus(markdown: string): 'PASS' | 'BLOCKED' {
  return /^\s*\[PASS\]\s+Relayer funding\b/im.test(markdown) &&
    /^\s*\[PASS\]\s+Deploy readiness\b/im.test(markdown)
    ? 'PASS'
    : 'BLOCKED';
}

function extractRelevantLine(markdown: string, label: string): string | undefined {
  return markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.includes(`[PASS] ${label}`) || line.includes(`[WARN] ${label}`));
}

function buildEvidenceTargetsToProduce(): string[] {
  return [
    '../evidence/live-rehearsals/<completed-local-devnet-rehearsal.md>',
    '../evidence/rehearsal/artifacts/<local-devnet-rehearsal-validation-report.md>',
    '../evidence/live-rehearsals/<local-devnet-preflight.json>',
    '../evidence/live-rehearsals/<local-devnet-window-prep.json>',
    '../evidence/live-rehearsals/<local-devnet-fresh-checkpoint.json>',
  ];
}

function buildBoundary(): Record<string, 'yes' | 'no'> {
  return {
    'Operator-provided redacted summary only': 'yes',
    'Execution request reused': 'yes',
    'Signer output reused': 'yes',
    'Funding output reused': 'yes',
    'Secret or environment file read by summary command': 'no',
    'Wallet recovery material or private key read by summary command': 'no',
    'Node config secret read by summary command': 'no',
    'Runtime database opened by summary command': 'no',
    'Deployment state opened by summary command': 'no',
    'Live node probe executed by summary command': 'no',
    'Transaction signing performed by summary command': 'no',
    'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'no',
    'Gate 3 lifecycle evidence claimed complete': 'no',
    'Release gate PASS claimed': 'no',
    'Production-ready claim allowed': 'no',
    'Testnet production-candidate claim allowed': 'no',
  };
}

function validateBoundary(value: unknown, errors: string[]): void {
  const expected = buildBoundary();
  if (!isRecord(value)) {
    errors.push('--local-devnet-signer-funding-summary-json report.boundary must be an object');
    return;
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--local-devnet-signer-funding-summary-json report.boundary.${field} must be ${expectedValue}`);
    }
  }
}

function validateStringArray(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
    errors.push(`--local-devnet-signer-funding-summary-json report.${field} must be a non-empty string array`);
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
