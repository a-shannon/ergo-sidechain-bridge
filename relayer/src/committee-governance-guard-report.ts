import { sanitizeReportText } from './report-text-sanitizer.js';

export type CommitteeGuardReportResult = 'PASS' | 'BLOCKED' | 'BOUNDARY_ONLY';

export interface CommitteeGuardEvaluationReport {
  result: CommitteeGuardReportResult;
  exitCode: number;
  command: string;
  nodeEndpoint: string;
  reason: string;
  observedError?: string;
  publicIdentifiers?: Record<string, string>;
  checks: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface BlockedCommitteeGuardReportInput {
  command: string;
  nodeEndpoint: string;
  error: unknown;
  ergoApiKeyRead?: boolean;
}

export interface PassedCommitteeGuardReportInput {
  command: string;
  nodeEndpoint: string;
  network: string;
  height: string | number;
  ergoApiKeyRead?: boolean;
  publicIdentifiers?: Record<string, string>;
  checks: string[];
}

export interface BoundaryOnlyCommitteeGuardReportInput {
  command: string;
}

export interface PolicyRejectedCommitteeGuardReportInput {
  command: string;
  reason: string;
}

export function buildBoundaryOnlyCommitteeGuardReport(
  input: BoundaryOnlyCommitteeGuardReportInput,
): CommitteeGuardEvaluationReport {
  return {
    result: 'BOUNDARY_ONLY',
    exitCode: 0,
    command: sanitizeReportText(input.command),
    nodeEndpoint: 'not used (--public-boundary)',
    reason: 'Public-boundary mode completed without reading node credentials, contacting an Ergo node, compiling contracts, generating ephemeral committee keys, signing, or broadcasting.',
    checks: [
      'Phase 010a guard evaluation boundary printed before node-backed contract compilation, header-context construction, key generation, signing, or broadcast paths.',
    ],
    boundary: {
      'ErgoScript contracts compiled': 'no',
      'Committee guard evaluated': 'no',
      'Committee threshold signer quorum evaluated': 'no',
      'Member-loss tolerance evaluated': 'no',
      'Below-threshold rejection evaluated': 'no',
      'Old single signer rejection evaluated': 'no',
      'Non-committee rejection evaluated': 'no',
      'Wrong-signer rejection evaluated': 'no',
      'Ergo node request performed': 'no',
      'ERGO_API_KEY read': 'no',
      'Header context constructed': 'no',
      'Ephemeral committee key generated': 'no',
      'Private key material serialized': 'no',
      'Node wallet used': 'no',
      'Key rotation authorization granted': 'no',
      'Gate 6 committee governance closure claimed': 'no',
      'Transaction broadcast, submit, deploy, or state mutation performed': 'no',
    },
  };
}

export function buildBlockedCommitteeGuardReport(
  input: BlockedCommitteeGuardReportInput,
): CommitteeGuardEvaluationReport {
  return {
    result: 'BLOCKED',
    exitCode: 1,
    command: sanitizeReportText(input.command),
    nodeEndpoint: sanitizeReportText(input.nodeEndpoint),
    reason: 'Local Ergo node was unavailable before contract compilation and header-context construction completed.',
    observedError: summarizeCommitteeGuardError(input.error),
    checks: [],
    boundary: {
      'ErgoScript contracts compiled': 'no',
      'Committee guard evaluated': 'no',
      'Committee threshold signer quorum evaluated': 'no',
      'Member-loss tolerance evaluated': 'no',
      'Below-threshold rejection evaluated': 'no',
      'Old single signer rejection evaluated': 'no',
      'Non-committee rejection evaluated': 'no',
      'Wrong-signer rejection evaluated': 'no',
      'ERGO_API_KEY read': input.ergoApiKeyRead ? 'yes' : 'no',
      'Private key material serialized': 'no',
      'Node wallet used': 'no',
      'Broadcast, submit, deploy, or state mutation performed': 'no',
    },
  };
}

export function buildPolicyRejectedCommitteeGuardReport(
  input: PolicyRejectedCommitteeGuardReportInput,
): CommitteeGuardEvaluationReport {
  return {
    result: 'BLOCKED',
    exitCode: 1,
    command: sanitizeReportText(input.command),
    nodeEndpoint: 'not used (policy rejected before node request)',
    reason: sanitizeReportText(input.reason),
    observedError: sanitizeReportText(input.reason),
    checks: [
      'Committee threshold below policy rejected before node-backed contract compilation, header-context construction, key generation, signing, or broadcast paths.',
    ],
    boundary: {
      'Committee policy validation performed': 'yes',
      'Committee threshold below policy rejected': 'yes',
      'ErgoScript contracts compiled': 'no',
      'Committee guard evaluated': 'no',
      'Committee threshold signer quorum evaluated': 'no',
      'Member-loss tolerance evaluated': 'no',
      'Below-threshold rejection evaluated': 'no',
      'Old single signer rejection evaluated': 'no',
      'Non-committee rejection evaluated': 'no',
      'Wrong-signer rejection evaluated': 'no',
      'Ergo node request performed': 'no',
      'ERGO_API_KEY read': 'no',
      'Header context constructed': 'no',
      'Ephemeral committee key generated': 'no',
      'Private key material serialized': 'no',
      'Node wallet used': 'no',
      'Key rotation authorization granted': 'no',
      'Gate 6 committee governance closure claimed': 'no',
      'Transaction broadcast, submit, deploy, or state mutation performed': 'no',
    },
  };
}

export function buildPassedCommitteeGuardReport(
  input: PassedCommitteeGuardReportInput,
): CommitteeGuardEvaluationReport {
  return {
    result: 'PASS',
    exitCode: 0,
    command: sanitizeReportText(input.command),
    nodeEndpoint: sanitizeReportText(input.nodeEndpoint),
    reason: `Committee guard evaluation completed on ${sanitizeReportText(input.network)} height ${sanitizeReportText(String(input.height))}.`,
    publicIdentifiers: sanitizePublicIdentifiers(input.publicIdentifiers),
    checks: input.checks.map(sanitizeReportText),
    boundary: {
      'ErgoScript contracts compiled': 'yes',
      'Committee guard evaluated': 'yes',
      'Committee threshold signer quorum evaluated': 'yes',
      'Member-loss tolerance evaluated': 'yes',
      'Below-threshold rejection evaluated': 'yes',
      'Old single signer rejection evaluated': 'yes',
      'Non-committee rejection evaluated': 'yes',
      'Wrong-signer rejection evaluated': 'yes',
      'ERGO_API_KEY read': input.ergoApiKeyRead ? 'yes' : 'no',
      'Private key material serialized': 'no',
      'Node wallet used': 'no',
      'Broadcast, submit, deploy, or state mutation performed': 'no',
    },
  };
}

export function formatCommitteeGuardReportMarkdown(report: CommitteeGuardEvaluationReport): string {
  const rows = [
    ['Command', report.command],
    ['Result', report.result],
    ['Exit code', String(report.exitCode)],
    ['Node endpoint', report.nodeEndpoint],
    ['Reason', report.reason],
  ];
  if (report.observedError) rows.push(['Observed error', report.observedError]);

  const checks = report.checks.length > 0
    ? report.checks.map(check => `- ${check}`).join('\n')
    : '- None completed before the blocker.';

  const publicIdentifierSection = formatPublicIdentifierSection(report.publicIdentifiers);

  const boundaryRows = Object.entries(report.boundary)
    .map(([field, value]) => `| ${field} | ${value} |`)
    .join('\n');

  const authorityBoundary =
    report.result === 'PASS'
      ? 'This is command-output evidence for the Phase 010a guard evaluation only. It is not release authorization, key-rotation completion, public-claim approval, deployment approval, or transaction broadcast approval.'
      : report.result === 'BOUNDARY_ONLY'
        ? 'This is public-boundary prerequisite output only. It is not completed Gate 6 command evidence, key-rotation completion, release authorization, deployment approval, or transaction broadcast approval.'
        : 'This is not completed Gate 6 command evidence. It records the exact blocker that prevented the Phase 010a guard evaluation from completing.';

  return [
    '# Phase 010a Committee Guard Evaluation Report',
    '',
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    ...rows.map(([field, value]) => `| ${field} | ${value} |`),
    '',
    '## Completed Checks',
    '',
    checks,
    '',
    publicIdentifierSection,
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    boundaryRows,
    '',
    authorityBoundary,
    '',
  ].join('\n');
}

function summarizeCommitteeGuardError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  const causeSummary = summarizeCause(cause);
  return sanitizeReportText([message, causeSummary].filter(Boolean).join('; '));
}

function summarizeCause(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const record = cause as Record<string, unknown>;
  const code = stringifyCauseField(record.code);
  const syscall = stringifyCauseField(record.syscall);
  const address = stringifyCauseField(record.address);
  const port = stringifyCauseField(record.port);

  if (code && address && port) {
    return `${syscall || 'connect'} ${code} ${address}:${port}`;
  }
  if (code) return code;
  return undefined;
}

function stringifyCauseField(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return undefined;
}

function formatPublicIdentifierSection(publicIdentifiers: Record<string, string> | undefined): string {
  const rows = Object.entries(publicIdentifiers ?? {});
  if (rows.length === 0) return '';

  return [
    '## Public Signer Identifiers',
    '',
    '| Role | Public key/hash identifier |',
    '|---|---|',
    ...rows.map(([role, identifier]) => `| ${sanitizeReportText(role)} | ${sanitizeReportText(identifier)} |`),
    '',
  ].join('\n');
}

function sanitizePublicIdentifiers(
  publicIdentifiers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!publicIdentifiers) return undefined;
  return Object.fromEntries(
    Object.entries(publicIdentifiers)
      .map(([role, identifier]) => [sanitizeReportText(role), sanitizeReportText(identifier)]),
  );
}
