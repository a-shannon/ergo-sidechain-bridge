import type {
  ReadinessHandoffLanePacket,
  ReadinessHandoffLocalRequest,
  ReadinessHandoffLiveRequest,
  ReadinessHandoffReport,
  ReadinessHandoffReviewerRequest,
} from './readiness-handoff.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type ReadinessOperatorRequestStatus = 'REQUESTS_READY' | 'NO_ACTION';

export interface ReadinessOperatorRequestCommandInput {
  handoffJson: string;
  out?: string;
  jsonOut?: string;
}

export interface ReadinessOperatorLaneRequest {
  lane: string;
  laneLabel: string;
  localEvidenceRequests: string[];
  liveEvidenceRequests: string[];
  reviewerOrExternalRequests: string[];
  evidenceTemplate: string;
  validatorCommand: string;
  releaseGateFlag: string;
  triageTarget?: string;
  currentPrerequisiteMap: string;
  supportingPackets: string[];
  nextOperatorStep: string;
  closureBoundary: string;
  operatorEvidenceInputs: string[];
}

export interface ReadinessOperatorRequestReport {
  status: ReadinessOperatorRequestStatus;
  exitCode: 0;
  command: string;
  sourceCommit?: string;
  handoffSource: {
    mode: 'json';
    target: string;
  };
  localEvidenceRequestCount: number;
  liveEvidenceRequestCount: number;
  reviewerOrExternalRequestCount: number;
  laneRequestCount: number;
  operatorEvidenceInputCount: number;
  laneRequests: ReadinessOperatorLaneRequest[];
  immediateActions: string[];
  forbiddenInputs: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

const FORBIDDEN_INPUTS = [
  'Do not send .env values, API keys, mnemonics, private keys, wallet material, or seed phrases.',
  'Do not send raw runtime databases, private bridge-state SQLite files, or private deployment-state file dumps.',
  'Do not approve signing, key rotation, transaction submit, broadcast, deployment, publication, PR, or mainnet activity through this bundle.',
  'Do not use this bundle as evidence-row closure, release-gate PASS evidence, governance-ready support, production-ready support, or mainnet readiness support.',
];

export function buildReadinessOperatorRequestCommand(input: ReadinessOperatorRequestCommandInput): string {
  const parts = [
    'npm run readiness:operator-request --',
    '--handoff-json',
    formatOperatorRequestTargetForCommand(input.handoffJson),
  ];
  if (input.out) parts.push('--out <request.md>');
  if (input.jsonOut) parts.push('--json-out <request.json>');
  return parts.join(' ');
}

export function buildReadinessOperatorRequestReport(input: {
  command: string;
  handoffReport: ReadinessHandoffReport;
  handoffSource: {
    mode: 'json';
    target: string;
  };
}): ReadinessOperatorRequestReport {
  const handoff = input.handoffReport;
  const lanes = collectLanePackets(handoff);
  const laneRequests = lanes.map(packet => buildLaneRequest(packet, handoff));
  const localEvidenceRequestCount = handoff.localEvidenceRequests.length;
  const liveEvidenceRequestCount = handoff.liveEvidenceRequests.length;
  const reviewerOrExternalRequestCount = handoff.reviewerOrExternalRequests.length;
  const totalRequests = localEvidenceRequestCount + liveEvidenceRequestCount + reviewerOrExternalRequestCount;
  const immediateActions = laneRequests.length > 0
    ? laneRequests.map(request => `${request.laneLabel}: ${request.nextOperatorStep}`)
    : ['No operator or reviewer request remains in the supplied readiness handoff.'];

  return {
    status: totalRequests > 0 ? 'REQUESTS_READY' : 'NO_ACTION',
    exitCode: 0,
    command: input.command,
    sourceCommit: handoff.sourceCommit,
    handoffSource: input.handoffSource,
    localEvidenceRequestCount,
    liveEvidenceRequestCount,
    reviewerOrExternalRequestCount,
    laneRequestCount: laneRequests.length,
    operatorEvidenceInputCount: laneRequests.reduce(
      (total, request) => total + request.operatorEvidenceInputs.length,
      0,
    ),
    laneRequests,
    immediateActions,
    forbiddenInputs: [...FORBIDDEN_INPUTS],
    boundary: buildOperatorRequestBoundary(),
  };
}

export function formatReadinessOperatorRequestMarkdown(report: ReadinessOperatorRequestReport): string {
  const laneSummaryRows = report.laneRequests.length > 0
    ? report.laneRequests.map(request => [
        request.laneLabel,
        String(request.localEvidenceRequests.length),
        String(request.liveEvidenceRequests.length),
        String(request.reviewerOrExternalRequests.length),
        request.nextOperatorStep,
      ])
    : [[
        'None',
        '0',
        '0',
        '0',
        'No operator or reviewer request remains in the supplied readiness handoff.',
      ]];

  const laneSections = report.laneRequests.length > 0
    ? report.laneRequests.map(formatLaneSection).join('\n\n')
    : ['## Lane Inputs', '', '- None.'].join('\n');

  return [
    '# Bridge Readiness Operator Request Bundle',
    '',
    'This bundle converts the current readiness handoff into a compact request list for operators and reviewers.',
    'It is planning output only and does not close evidence rows, authorize claims, deploy, sign, submit, rotate keys, or broadcast transactions.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Result', report.status],
      ['Source commit', report.sourceCommit ?? '<not recorded>'],
      ['Handoff source', report.handoffSource.target],
      ['Local evidence requests', String(report.localEvidenceRequestCount)],
      ['Node-backed or live evidence requests', String(report.liveEvidenceRequestCount)],
      ['Reviewer or external requests', String(report.reviewerOrExternalRequestCount)],
      ['Lane request packets', String(report.laneRequestCount)],
      ['Operator input checklists', String(report.operatorEvidenceInputCount)],
    ]),
    '',
    '## Immediate Actions',
    '',
    ...report.immediateActions.map(action => `- ${escapeMarkdownText(action)}`),
    '',
    '## Request Summary By Lane',
    '',
    markdownTable([
      ['Lane', 'Local', 'Live/node-backed', 'Reviewer/external', 'First action'],
      ...laneSummaryRows,
    ]),
    '',
    laneSections,
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

export function validateReadinessOperatorRequestReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ['--operator-request-json report must be an object'];
  }
  if (value.status !== 'REQUESTS_READY' && value.status !== 'NO_ACTION') {
    errors.push('--operator-request-json report.status must be REQUESTS_READY or NO_ACTION');
  }
  if (value.exitCode !== 0) {
    errors.push('--operator-request-json report.exitCode must be 0');
  }
  if (typeof value.command !== 'string' || !value.command.includes('readiness:operator-request')) {
    errors.push('--operator-request-json report.command must identify readiness:operator-request');
  }
  if (!isRecord(value.handoffSource) || value.handoffSource.mode !== 'json' || typeof value.handoffSource.target !== 'string') {
    errors.push('--operator-request-json report.handoffSource must identify the source JSON target');
  }
  requireSafeCount(value.localEvidenceRequestCount, 'localEvidenceRequestCount', errors);
  requireSafeCount(value.liveEvidenceRequestCount, 'liveEvidenceRequestCount', errors);
  requireSafeCount(value.reviewerOrExternalRequestCount, 'reviewerOrExternalRequestCount', errors);
  requireSafeCount(value.laneRequestCount, 'laneRequestCount', errors);
  requireSafeCount(value.operatorEvidenceInputCount, 'operatorEvidenceInputCount', errors);
  if (!Array.isArray(value.laneRequests)) {
    errors.push('--operator-request-json report.laneRequests must be an array');
  } else {
    if (typeof value.laneRequestCount === 'number' && value.laneRequests.length !== value.laneRequestCount) {
      errors.push('--operator-request-json report.laneRequestCount must equal laneRequests length');
    }
    value.laneRequests.forEach((request, index) => validateLaneRequest(request, index, errors));
  }
  if (!Array.isArray(value.immediateActions) || value.immediateActions.length === 0) {
    errors.push('--operator-request-json report.immediateActions must be a non-empty array');
  }
  if (!Array.isArray(value.forbiddenInputs) || value.forbiddenInputs.length !== FORBIDDEN_INPUTS.length) {
    errors.push('--operator-request-json report.forbiddenInputs must preserve the required forbidden-input list');
  }
  validateOperatorRequestBoundary(value.boundary, errors);
  return errors;
}

function collectLanePackets(handoff: ReadinessHandoffReport): ReadinessHandoffLanePacket[] {
  return handoff.lanePackets.filter(packet => {
    const local = filterRequestsByLane(handoff.localEvidenceRequests, packet.lane);
    const live = filterRequestsByLane(handoff.liveEvidenceRequests, packet.lane);
    const reviewers = filterRequestsByLane(handoff.reviewerOrExternalRequests, packet.lane);
    return local.length + live.length + reviewers.length > 0;
  });
}

function buildLaneRequest(
  packet: ReadinessHandoffLanePacket,
  handoff: ReadinessHandoffReport,
): ReadinessOperatorLaneRequest {
  return {
    lane: packet.lane,
    laneLabel: packet.laneLabel,
    localEvidenceRequests: filterRequestsByLane(handoff.localEvidenceRequests, packet.lane).map(request => request.issue),
    liveEvidenceRequests: filterRequestsByLane(handoff.liveEvidenceRequests, packet.lane).map(request => request.issue),
    reviewerOrExternalRequests: filterRequestsByLane(handoff.reviewerOrExternalRequests, packet.lane).map(request => request.issue),
    evidenceTemplate: packet.evidenceTemplate,
    validatorCommand: packet.validatorCommand,
    releaseGateFlag: packet.releaseGateFlag,
    ...(packet.triageTarget ? { triageTarget: packet.triageTarget } : {}),
    currentPrerequisiteMap: packet.currentPrerequisiteMap,
    supportingPackets: supportingPacketsForLane(packet.lane),
    nextOperatorStep: packet.nextOperatorStep,
    closureBoundary: packet.closureBoundary,
    operatorEvidenceInputs: [...(packet.operatorEvidenceInputs ?? [])],
  };
}

function filterRequestsByLane<T extends { lane: string }>(
  requests: Array<T>,
  lane: string,
): Array<T> {
  return requests.filter(request => request.lane === lane);
}

function formatLaneSection(request: ReadinessOperatorLaneRequest): string {
  return [
    `## ${escapeMarkdownText(request.laneLabel)}`,
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Evidence template', request.evidenceTemplate],
      ['Validator command', request.validatorCommand],
      ['Release-gate flag', request.releaseGateFlag],
      ['Triage target', request.triageTarget ?? request.currentPrerequisiteMap],
      ['Current prerequisite map', request.currentPrerequisiteMap],
      ['Supporting packets', request.supportingPackets.join('<br>')],
      ['Closure boundary', request.closureBoundary],
    ]),
    '',
    'Operator inputs:',
    '',
    ...formatBulletList(request.operatorEvidenceInputs),
    '',
    'Live or node-backed evidence still needed:',
    '',
    ...formatBulletList(request.liveEvidenceRequests),
    '',
    'Reviewer or external decisions still needed:',
    '',
    ...formatBulletList(request.reviewerOrExternalRequests),
    '',
    'Local evidence still needed:',
    '',
    ...formatBulletList(request.localEvidenceRequests),
  ].join('\n');
}

function formatBulletList(values: string[]): string[] {
  if (values.length === 0) return ['- None.'];
  return values.map(value => `- ${escapeMarkdownText(value)}`);
}

function buildOperatorRequestBoundary(): Record<string, 'yes' | 'no'> {
  return {
    'Planning output only': 'yes',
    'Readiness handoff JSON reused': 'yes',
    'Live node probe executed by operator-request command': 'no',
    'ERGO_API_KEY read': 'no',
    'Auth header sent': 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Private key material serialized': 'no',
    'Evidence row closure claimed': 'no',
    'Release gate PASS claimed': 'no',
    'Public claim authorization granted': 'no',
    'Claim/publication fields unlocked': 'no',
    'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no',
  };
}

function validateLaneRequest(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`--operator-request-json report.laneRequests[${index}] must be an object`);
    return;
  }
  for (const field of [
    'lane',
    'laneLabel',
    'evidenceTemplate',
    'validatorCommand',
    'releaseGateFlag',
    'currentPrerequisiteMap',
    'nextOperatorStep',
    'closureBoundary',
  ]) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--operator-request-json report.laneRequests[${index}].${field} must be a non-empty string`);
    }
  }
  if (value.triageTarget !== undefined && (typeof value.triageTarget !== 'string' || value.triageTarget.trim().length === 0)) {
    errors.push(`--operator-request-json report.laneRequests[${index}].triageTarget must be a non-empty string when present`);
  }
  for (const field of [
    'localEvidenceRequests',
    'liveEvidenceRequests',
    'reviewerOrExternalRequests',
    'operatorEvidenceInputs',
    'supportingPackets',
  ]) {
    if (!Array.isArray(value[field])) {
      errors.push(`--operator-request-json report.laneRequests[${index}].${field} must be an array`);
    }
  }
  if (Array.isArray(value.supportingPackets) && value.supportingPackets.length === 0) {
    errors.push(`--operator-request-json report.laneRequests[${index}].supportingPackets must include at least one packet target`);
  }
  const expectedSupportingPackets = typeof value.lane === 'string'
    ? supportingPacketsForLaneName(value.lane)
    : undefined;
  if (expectedSupportingPackets && Array.isArray(value.supportingPackets) && !sameStringArray(value.supportingPackets, expectedSupportingPackets)) {
    errors.push(`--operator-request-json report.laneRequests[${index}].supportingPackets must match the ${value.lane} supporting packet list`);
  }
}

function supportingPacketsForLane(lane: ReadinessHandoffLanePacket['lane']): string[] {
  return supportingPacketsForLaneName(lane) ?? [];
}

function supportingPacketsForLaneName(lane: string): string[] | undefined {
  switch (lane) {
    case 'security-review':
      return [
        '../evidence/security/gate4-independent-security-external-review-packet-2026-07-09-c6fea203.md',
        '../evidence/security/gate4-independent-security-review-input-manifest-2026-07-09-c2a52595.md',
      ];
    case 'trustless-burn':
      return [
        '../evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-07-2401733f.md',
        '../evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md',
        '../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md',
        '../evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-faf05c0b.md',
        '../evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-07-faf05c0b.md',
      ];
    case 'committee-governance':
      return [
        '../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-04-9fd9d7e1.md',
        '../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-09-57a50625.md',
      ];
    case 'benchmark':
      return [
        '../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-09-e91f591c.md',
        '../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-c2a52595.md',
        '../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-c2a52595.md',
      ];
    default:
      return undefined;
  }
}

function sameStringArray(value: unknown[], expected: string[]): boolean {
  return value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function validateOperatorRequestBoundary(value: unknown, errors: string[]): void {
  const expected = buildOperatorRequestBoundary();
  if (!isRecord(value)) {
    errors.push('--operator-request-json report.boundary must be an object');
    return;
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--operator-request-json report.boundary.${field} must be ${expectedValue}`);
    }
  }
}

function requireSafeCount(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(`--operator-request-json report.${field} must be a non-negative safe integer`);
  }
}

function formatOperatorRequestTargetForCommand(target: string): string {
  return sanitizeReportText(target).replace(/\s+/g, ' ');
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
  return sanitizeReportText(value).replace(/\r?\n/g, '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
