import { sanitizeReportText } from './report-text-sanitizer.js';

export interface TrustlessBurnInstanceBindingInput {
  sourceCommit: string;
  executionRequestTarget: string;
  executionRequestMarkdown: string;
  candidateTarget: string;
  candidateMarkdown: string;
  command: string;
}

export interface TrustlessBurnInstanceBindingReport {
  status: 'TRUSTLESS_BURN_INSTANCE_BINDING_READY';
  exitCode: 0;
  command: string;
  sourceCommit: string;
  executionRequestTarget: string;
  candidateTarget: string;
  selectedNetwork: string;
  identity: TrustlessBurnInstanceIdentity;
  supportingEvidenceTargets: string[];
  remainingBlockers: string[];
  operatorNextEvidence: string[];
  forbiddenInputs: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface TrustlessBurnInstanceIdentity {
  sidechainIdHex: string;
  sidechainTxHashHex: string;
  sidechainBlockHashHex: string;
  eventIndex: number;
  bridgeEventRootHex: string;
  ergoAnchorHeight: number;
  burnIdHex: string;
  duplicatePreventionKeyHex: string;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string;
  assetIdHex: string;
  proofVectorTarget: string;
}

interface ProofVectorReport {
  leaf?: Record<string, unknown>;
  bridgeEventRootHex?: unknown;
  duplicatePreventionKeyHex?: unknown;
  recipientErgoTreeHashHex?: unknown;
  amountNanoErg?: unknown;
  assetIdHex?: unknown;
}

const forbiddenInputs = [
  'Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, seed phrases, raw runtime databases, private deployment-state files, or node data directories.',
  'Do not provide local absolute paths, raw node config, raw SQLite state, raw deployment-state dumps, or screenshots containing private endpoints or credentials.',
  'Do not approve signing, transaction check, submit, broadcast, deployment, reconciliation, public release, mainnet activity, or production-ready claims through this binding packet.',
];

export function buildTrustlessBurnInstanceBindingCommand(input: {
  sourceCommit: string;
  executionRequest: string;
  candidate: string;
  out?: string;
  jsonOut?: string;
}): string {
  const parts = [
    'npm run trustless:instance-binding --',
    '--source-commit',
    sanitize(input.sourceCommit),
    '--execution-request',
    sanitize(input.executionRequest),
    '--candidate',
    sanitize(input.candidate),
  ];
  if (input.out) parts.push('--out <binding.md>');
  if (input.jsonOut) parts.push('--json-out <binding.json>');
  return parts.join(' ');
}

export function buildTrustlessBurnInstanceBindingReport(
  input: TrustlessBurnInstanceBindingInput,
): TrustlessBurnInstanceBindingReport {
  const identity = extractTrustlessBurnInstanceIdentity(input.candidateMarkdown);
  return {
    status: 'TRUSTLESS_BURN_INSTANCE_BINDING_READY',
    exitCode: 0,
    command: sanitize(input.command),
    sourceCommit: sanitize(input.sourceCommit),
    executionRequestTarget: sanitize(input.executionRequestTarget),
    candidateTarget: sanitize(input.candidateTarget),
    selectedNetwork: selectNonMainnetNetwork(input.candidateMarkdown),
    identity,
    supportingEvidenceTargets: extractSupportingEvidenceTargets(input.candidateMarkdown, identity.proofVectorTarget),
    remainingBlockers: extractRemainingBlockers(input.candidateMarkdown),
    operatorNextEvidence: buildOperatorNextEvidence(),
    forbiddenInputs: [...forbiddenInputs],
    boundary: buildBoundary(),
  };
}

export function formatTrustlessBurnInstanceBindingMarkdown(
  report: TrustlessBurnInstanceBindingReport,
): string {
  return [
    '# Gate 5 Trustless Burn Instance Binding',
    '',
    'This packet binds one non-mainnet trustless-burn instance from the current Gate 5 execution request and SPV-linked candidate.',
    'This packet does not close Gate 5, does not authorize mainnet or testnet-production-candidate claims, and does not authorize transaction signing, transaction checks, submit, broadcast, deployment, or reconciliation.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Status', report.status],
      ['Source commit', report.sourceCommit],
      ['Execution request', report.executionRequestTarget],
      ['Candidate target', report.candidateTarget],
      ['Selected network', report.selectedNetwork],
    ]),
    '',
    '## Bound Instance Identity',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['sidechainId', report.identity.sidechainIdHex],
      ['sidechainTxHash', report.identity.sidechainTxHashHex],
      ['sidechainBlockHash', report.identity.sidechainBlockHashHex],
      ['eventIndex', String(report.identity.eventIndex)],
      ['bridgeEventRoot', report.identity.bridgeEventRootHex],
      ['ergoAnchorHeight', String(report.identity.ergoAnchorHeight)],
      ['burnId', report.identity.burnIdHex],
      ['duplicatePreventionKey', report.identity.duplicatePreventionKeyHex],
      ['recipientErgoTreeHash', report.identity.recipientErgoTreeHashHex],
      ['amountNanoErg', report.identity.amountNanoErg],
      ['assetId', report.identity.assetIdHex],
      ['proofVectorTarget', report.identity.proofVectorTarget],
    ]),
    '',
    '## Source Evidence Targets',
    '',
    ...report.supportingEvidenceTargets.map(target => `- ${escapeMarkdownText(target)}`),
    '',
    '## Remaining Blockers',
    '',
    ...report.remainingBlockers.map(blocker => `- ${escapeMarkdownText(blocker)}`),
    '',
    '## Next Evidence',
    '',
    ...report.operatorNextEvidence.map(item => `- ${escapeMarkdownText(item)}`),
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

export function validateTrustlessBurnInstanceBindingReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--trustless-burn-instance-binding-json report must be an object'];
  if (value.status !== 'TRUSTLESS_BURN_INSTANCE_BINDING_READY') {
    errors.push('--trustless-burn-instance-binding-json report.status must be TRUSTLESS_BURN_INSTANCE_BINDING_READY');
  }
  if (value.exitCode !== 0) errors.push('--trustless-burn-instance-binding-json report.exitCode must be 0');
  for (const field of ['command', 'sourceCommit', 'executionRequestTarget', 'candidateTarget', 'selectedNetwork']) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--trustless-burn-instance-binding-json report.${field} must be a non-empty string`);
    }
  }
  if (
    typeof value.selectedNetwork === 'string' &&
    /\bmainnet\b/i.test(value.selectedNetwork) &&
    !/\bnon-mainnet\b/i.test(value.selectedNetwork)
  ) {
    errors.push('--trustless-burn-instance-binding-json report.selectedNetwork must be non-mainnet');
  }
  validateIdentity(value.identity, errors);
  validateStringArray(value.supportingEvidenceTargets, 'supportingEvidenceTargets', errors);
  validateStringArray(value.remainingBlockers, 'remainingBlockers', errors);
  validateStringArray(value.operatorNextEvidence, 'operatorNextEvidence', errors);
  validateStringArray(value.forbiddenInputs, 'forbiddenInputs', errors);
  validateBoundary(value.boundary, errors);
  if (findLocalPathLeak(value)) {
    errors.push('--trustless-burn-instance-binding-json report must not serialize local absolute paths');
  }
  return errors;
}

export function validateTrustlessBurnExecutionRequestForInstanceBinding(markdown: string): string[] {
  if (!markdown.includes('# Gate 5 Trustless Burn Execution Request')) {
    return ['--execution-request must be a Gate 5 Trustless Burn Execution Request'];
  }
  const requiredSnippets = [
    'TRUSTLESS_BURN_EXECUTION_REQUEST_READY',
    '1. Bind one non-mainnet trustless-burn instance',
    'sidechainId, sidechain transaction hash, sidechain block hash, event index, bridgeEventRoot, Ergo anchor height, burnId, duplicate-prevention key, recipient binding, amount, asset, proof-vector target, and candidate target',
    'Gate 5 instance binding packet with all identifiers',
    'Do not provide .env values',
    '| Planning output only | yes |',
    '| Secret or environment file read | no |',
    '| Wallet recovery material or private key read | no |',
    '| Runtime database opened by request command | no |',
    '| Private deployment state opened by request command | no |',
    '| Node or RPC request performed by request command | no |',
    '| Transaction signing/check/submit/broadcast/reconciliation/deployment performed | no |',
    '| Gate 5 trustless-burn evidence claimed complete | no |',
    '| Release gate PASS claimed | no |',
    '| Mainnet-grade evidence linked | no |',
    '| Testnet production-candidate claim authorized by request | no |',
  ];
  return requiredSnippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `--execution-request must include ${snippet}`);
}

export function validateTrustlessBurnCandidateForInstanceBinding(markdown: string): string[] {
  if (!markdown.includes('# Gate 5 Trustless Burn SPV-Linked Candidate')) {
    return ['--candidate must be a Gate 5 Trustless Burn SPV-Linked Candidate'];
  }
  const requiredSnippets = [
    'No wallet recovery material',
    'Current local prerequisite evidence',
    '## Evidence Classification',
    '## Required Components',
    '## Commitment Format',
    '## Local Proof Vector',
    'Proof-vector validation report:',
    '## Publication Decision',
    '## Reviewer Sign-Off',
    '| Environment | local offline |',
    '| Broadcast mode | disabled |',
    '| Trustless burn verification implemented | no |',
    '| Production-ready claim allowed | no |',
    '| Testnet production-candidate claim allowed | no |',
  ];
  const errors = requiredSnippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `--candidate must include ${snippet}`);
  errors.push(...validateExtractedIdentity(markdown));
  return errors;
}

function extractTrustlessBurnInstanceIdentity(markdown: string): TrustlessBurnInstanceIdentity {
  const proofVector = extractProofVectorReport(markdown);
  const leaf = isRecord(proofVector.leaf) ? proofVector.leaf : {};
  return {
    sidechainIdHex: sanitizeString(leaf.sidechainIdHex),
    sidechainTxHashHex: sanitizeString(leaf.sidechainTxHashHex),
    sidechainBlockHashHex: sanitizeString(leaf.sidechainBlockHashHex),
    eventIndex: Number(leaf.eventIndex),
    bridgeEventRootHex: sanitizeString(proofVector.bridgeEventRootHex),
    ergoAnchorHeight: extractNumericField(markdown, 'ergoAnchorHeight'),
    burnIdHex: sanitizeString(leaf.burnIdHex),
    duplicatePreventionKeyHex: sanitizeString(proofVector.duplicatePreventionKeyHex),
    recipientErgoTreeHashHex: sanitizeString(proofVector.recipientErgoTreeHashHex ?? leaf.recipientErgoTreeHashHex),
    amountNanoErg: sanitizeString(proofVector.amountNanoErg ?? leaf.amountNanoErg),
    assetIdHex: sanitizeString(proofVector.assetIdHex ?? leaf.assetIdHex),
    proofVectorTarget: sanitize(extractProofVectorTarget(markdown)),
  };
}

function validateExtractedIdentity(markdown: string): string[] {
  const identity = extractTrustlessBurnInstanceIdentity(markdown);
  const errors: string[] = [];
  validateIdentityObject(identity as unknown as Record<string, unknown>, '--candidate', errors);
  return errors;
}

function validateIdentity(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('--trustless-burn-instance-binding-json report.identity must be an object');
    return;
  }
  validateIdentityObject(value, '--trustless-burn-instance-binding-json report.identity', errors);
}

function validateIdentityObject(value: Record<string, unknown>, label: string, errors: string[]): void {
  for (const field of [
    'sidechainIdHex',
    'sidechainTxHashHex',
    'sidechainBlockHashHex',
    'bridgeEventRootHex',
    'burnIdHex',
    'duplicatePreventionKeyHex',
    'recipientErgoTreeHashHex',
    'assetIdHex',
  ]) {
    if (!isHex32(value[field])) errors.push(`${label} missing required instance binding field ${field}`);
  }
  if (!isNonNegativeSafeInteger(value.eventIndex)) {
    errors.push(`${label} missing required instance binding field eventIndex`);
  }
  if (!isNonNegativeSafeInteger(value.ergoAnchorHeight)) {
    errors.push(`${label} missing required instance binding field ergoAnchorHeight`);
  }
  if (typeof value.amountNanoErg !== 'string' || !/^[1-9][0-9]*$/.test(value.amountNanoErg)) {
    errors.push(`${label} missing required instance binding field amountNanoErg`);
  }
  if (typeof value.proofVectorTarget !== 'string' || !value.proofVectorTarget.trim().endsWith('.json')) {
    errors.push(`${label} missing required instance binding field proofVectorTarget`);
  }
  if (
    typeof value.burnIdHex === 'string' &&
    typeof value.duplicatePreventionKeyHex === 'string' &&
    value.burnIdHex !== value.duplicatePreventionKeyHex
  ) {
    errors.push(`${label} duplicatePreventionKeyHex must equal burnIdHex`);
  }
}

function extractProofVectorReport(markdown: string): ProofVectorReport {
  const match = markdown.match(/## Local Proof Vector[\s\S]*?```json\s*([\s\S]*?)```/i);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function extractProofVectorTarget(markdown: string): string {
  const match = markdown.match(/Proof-vector validation report:\s*\r?\n([^\r\n]+)/i);
  return match ? match[1].trim() : '';
}

function selectNonMainnetNetwork(markdown: string): string {
  const environment = sanitize(extractFieldValue(markdown, 'Environment') ?? 'unknown');
  if (environment.length > 0 && !/mainnet/i.test(environment)) {
    return `${environment} non-mainnet`;
  }
  return 'unknown non-mainnet';
}

function extractSupportingEvidenceTargets(markdown: string, proofVectorTarget: string): string[] {
  const targets = new Set<string>();
  if (proofVectorTarget.trim().length > 0) targets.add(proofVectorTarget.trim());
  for (const match of markdown.matchAll(/\bartifact:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g)) {
    targets.add(match[0].replace(/[),.;]+$/g, ''));
  }
  return [...targets].map(sanitize).filter(target => target.length > 0).sort();
}

function extractRemainingBlockers(markdown: string): string[] {
  const blockers = new Set<string>();
  const section = extractSection(markdown, 'Required Components');
  for (const line of section.split(/\r?\n/)) {
    const cells = parseMarkdownTableRow(line);
    if (cells.length >= 4 && /^blocker$/i.test(cells[3])) {
      blockers.add(cells[0]);
    }
  }
  if (markdown.includes('| Valid burn proof acceptance | accepted |') && markdown.includes('| blocker |')) {
    blockers.add('Valid burn proof acceptance');
  }
  return [...blockers].map(sanitize).filter(blocker => blocker.length > 0);
}

function buildOperatorNextEvidence(): string[] {
  return [
    'Refresh local proof-vector, candidate, and unsigned transaction validation for this exact instance without transaction check, signing, submit, or broadcast.',
    'Capture sanitized public anchor, SPV tracker, and finality observations for the same bridgeEventRoot and Ergo anchor height.',
    'Reconcile anchor, tracker, proof-vector, DUP key, recipient, amount, and settlement binding before assembling completed Gate 5 evidence.',
    'Collect independent protocol, security, and operator review only after completed Gate 5 evidence validates.',
  ];
}

function buildBoundary(): Record<string, 'yes' | 'no'> {
  return {
    'Planning/prerequisite output only': 'yes',
    'Execution request reused': 'yes',
    'Candidate evidence reused': 'yes',
    'Concrete non-mainnet instance binding produced': 'yes',
    'Secret or environment file read': 'no',
    'Wallet recovery material or private key read': 'no',
    'Node config secret read': 'no',
    'Runtime database opened by binding command': 'no',
    'Private deployment state opened by binding command': 'no',
    'Node or RPC request performed by binding command': 'no',
    'Transaction signing/check/submit/broadcast/reconciliation/deployment performed': 'no',
    'Gate 5 trustless-burn evidence claimed complete': 'no',
    'Release gate PASS claimed': 'no',
    'Production-ready claim allowed': 'no',
    'Mainnet-grade evidence linked': 'no',
    'Testnet production-candidate claim authorized by binding': 'no',
  };
}

function validateStringArray(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
    errors.push(`--trustless-burn-instance-binding-json report.${field} must be a non-empty string array`);
  }
}

function validateBoundary(value: unknown, errors: string[]): void {
  const expected = buildBoundary();
  if (!isRecord(value)) {
    errors.push('--trustless-burn-instance-binding-json report.boundary must be an object');
    return;
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--trustless-burn-instance-binding-json report.boundary.${field} must be ${expectedValue}`);
    }
  }
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
  return match ? Number(match[1]) : Number.NaN;
}

function extractSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const expectedHeading = `## ${heading}`.toLowerCase();
  const start = lines.findIndex(line => line.trim().toLowerCase() === expectedHeading);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n');
}

function parseMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return [];
  const cells = trimmed
    .slice(1, -1)
    .split('|')
    .map(cell => stripInlineCode(cell.trim()));
  return cells.some(cell => /^-+$/.test(cell)) ? [] : cells;
}

function stripInlineCode(value: string): string {
  return value.replace(/^`/, '').replace(/`$/, '');
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

function sanitizeString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? sanitize(String(value)) : '';
}

function sanitize(value: string): string {
  return sanitizeReportText(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHex32(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
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
