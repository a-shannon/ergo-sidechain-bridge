import {
  COMMITTEE_GOVERNANCE_RECONCILE_COMMAND,
  type CommitteeGovernanceReconciliationBoundary,
  type CommitteeGovernanceReconciliationKind,
  type CommitteeGovernanceReconciliationReport,
} from './committee-governance-reconciliation.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export const COMMITTEE_GOVERNANCE_RECONCILE_HANDOFF_COMMAND = 'governance:reconcile:handoff';

export interface CommitteeGovernanceReconciliationHandoffSource {
  mode: 'json';
  target: string;
}

export interface CommitteeGovernanceReconciliationHandoffCommandOptions {
  reconciliationReportJson: string;
  wrongNetworkReportJson: string;
  out?: string;
  jsonOut?: string;
}

export interface CommitteeGovernanceReconciliationHandoffRow {
  row: string;
  status: 'prerequisite-linked' | 'blocked';
  reportTarget: string;
  remainingBoundary: string;
}

export interface CommitteeGovernanceReconciliationOperatorPacket {
  lane: 'committee-governance';
  reconciliationReportTarget: string;
  wrongNetworkReportTarget: string;
  expectedNetwork: string;
  observedNetwork: string;
  wrongNetworkObservedNetwork: string;
  deploymentStateDigestHex?: string;
  sidechainIdHex?: string;
  scsNftId?: string;
  singletonIdentityCount: number;
  oldAuthorityIdentifierCount: number;
  newCommitteeThreshold: string;
  rollbackBindingLinked: boolean;
  stopConditions: string[];
  nextOperatorStep: string;
}

export interface CommitteeGovernanceReconciliationHandoffBoundary {
  'Read-only handoff composer': 'yes';
  'Reconciliation report JSON reused': 'yes';
  'Wrong-network report JSON reused': 'yes';
  'Private deployment state opened': 'no';
  'Runtime database opened': 'no';
  'Secret or environment file read': 'no';
  'Signing key or wallet material read': 'no';
  'Node, RPC, or explorer request performed': 'no';
  'Key rotation authorized': 'no';
  'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no';
  'Gate 6 committee governance closure claimed': 'no';
  'Governance-ready claim supported': 'no';
  'Production-ready claim supported': 'no';
  'Testnet production-candidate claim supported': 'no';
}

export interface CommitteeGovernanceReconciliationHandoffReport {
  schemaVersion: 1;
  command: typeof COMMITTEE_GOVERNANCE_RECONCILE_HANDOFF_COMMAND;
  status: 'READY' | 'BLOCKED';
  exitCode: 0 | 1;
  reason: string;
  reconciliationReportSource: CommitteeGovernanceReconciliationHandoffSource;
  wrongNetworkReportSource: CommitteeGovernanceReconciliationHandoffSource;
  linkedPrerequisiteRows: CommitteeGovernanceReconciliationHandoffRow[];
  operatorPacket: CommitteeGovernanceReconciliationOperatorPacket;
  issueCount: number;
  issues: string[];
  boundary: CommitteeGovernanceReconciliationHandoffBoundary;
}

export interface CommitteeGovernanceReconciliationHandoffBuildOptions {
  command: string;
  reconciliationReport: unknown;
  reconciliationReportSource: CommitteeGovernanceReconciliationHandoffSource;
  wrongNetworkReport: unknown;
  wrongNetworkReportSource: CommitteeGovernanceReconciliationHandoffSource;
}

const EXPECTED_RECONCILIATION_BOUNDARY: CommitteeGovernanceReconciliationBoundary = {
  readOnly: true,
  sanitizedPublicInputOnly: true,
  privateDeploymentStateIncluded: false,
  deploymentStateOpened: false,
  runtimeDatabaseOpened: false,
  secretOrEnvironmentFileRead: false,
  signingOrWalletMaterialRead: false,
  nodeOrRpcRequestPerformed: false,
  keyRotationAuthorized: false,
  transactionBroadcastOrMutation: false,
  gate6Closure: false,
  governanceReadyClaimSupport: false,
  productionClaimSupport: false,
  testnetProductionCandidateClaimSupport: false,
};

export function buildCommitteeGovernanceReconciliationHandoffCommand(
  options: CommitteeGovernanceReconciliationHandoffCommandOptions,
): string {
  const parts = [
    'npm run governance:reconcile:handoff --',
    '--reconciliation-report-json',
    options.reconciliationReportJson,
    '--wrong-network-report-json',
    options.wrongNetworkReportJson,
  ];
  if (options.out) parts.push('--out', '<report.md>');
  if (options.jsonOut) parts.push('--json-out', '<report.json>');
  return parts.join(' ');
}

export function buildCommitteeGovernanceReconciliationHandoffReport(
  options: CommitteeGovernanceReconciliationHandoffBuildOptions,
): CommitteeGovernanceReconciliationHandoffReport {
  const issues: string[] = [];
  const reconciliationReport = parseReport(
    options.reconciliationReport,
    'reconciliation report',
    'deployment-state-reconciliation',
    issues,
  );
  const wrongNetworkReport = parseReport(
    options.wrongNetworkReport,
    'wrong-network report',
    'wrong-network-negative',
    issues,
  );

  if (options.reconciliationReportSource.target === options.wrongNetworkReportSource.target) {
    issues.push('reconciliation and wrong-network report targets must be distinct');
  }

  if (reconciliationReport?.networkBinding && !reconciliationReport.networkBinding.matched) {
    issues.push('reconciliation report network binding must match');
  }
  if (wrongNetworkReport?.networkBinding && wrongNetworkReport.networkBinding.matched) {
    issues.push('wrong-network report network binding must not match');
  }
  if (
    reconciliationReport?.networkBinding?.expectedNetwork &&
    wrongNetworkReport?.networkBinding?.expectedNetwork &&
    normalizeNetwork(reconciliationReport.networkBinding.expectedNetwork) !==
      normalizeNetwork(wrongNetworkReport.networkBinding.expectedNetwork)
  ) {
    issues.push('reconciliation and wrong-network reports must share the same expected network');
  }
  if (
    reconciliationReport?.deploymentStateDigestHex &&
    wrongNetworkReport?.deploymentStateDigestHex &&
    reconciliationReport.deploymentStateDigestHex !== wrongNetworkReport.deploymentStateDigestHex
  ) {
    issues.push('reconciliation and wrong-network reports must share the same deploymentStateDigestHex');
  }

  const uniqueIssues = [...new Set(issues.map(sanitizeReportText))];
  const status = uniqueIssues.length === 0 ? 'READY' : 'BLOCKED';
  return {
    schemaVersion: 1,
    command: COMMITTEE_GOVERNANCE_RECONCILE_HANDOFF_COMMAND,
    status,
    exitCode: status === 'READY' ? 0 : 1,
    reason: status === 'READY'
      ? 'Gate 6 reconciliation prerequisites are ready for operator binding into completed committee governance evidence.'
      : `Gate 6 reconciliation handoff BLOCKED: ${uniqueIssues.length} structural issue(s).`,
    reconciliationReportSource: options.reconciliationReportSource,
    wrongNetworkReportSource: options.wrongNetworkReportSource,
    linkedPrerequisiteRows: buildLinkedPrerequisiteRows(
      options.reconciliationReportSource.target,
      options.wrongNetworkReportSource.target,
      status,
    ),
    operatorPacket: buildOperatorPacket(
      options.reconciliationReportSource.target,
      options.wrongNetworkReportSource.target,
      reconciliationReport,
      wrongNetworkReport,
    ),
    issueCount: uniqueIssues.length,
    issues: uniqueIssues,
    boundary: expectedHandoffBoundary(),
  };
}

export function formatCommitteeGovernanceReconciliationHandoffMarkdown(
  report: CommitteeGovernanceReconciliationHandoffReport,
): string {
  const issueRows = report.issues.length > 0
    ? report.issues.map(issue => `- ${escapeMarkdownText(issue)}`).join('\n')
    : '- None.';

  return [
    '# Gate 6 Governance Reconciliation Operator Handoff',
    '',
    'This handoff converts validated sanitized Gate 6 reconciliation reports into operator-facing prerequisite rows.',
    'This handoff does not close Gate 6, authorize key rotation, mutate runtime state, broadcast transactions,',
    'or support governance-ready, testnet production-candidate, production-ready, or mainnet claims.',
    '',
    '## Command Result',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Result', report.status],
      ['Reason', report.reason],
      ['Command', report.command],
      ['Structural issues', String(report.issueCount)],
    ]),
    '',
    '## Issues',
    '',
    issueRows,
    '',
    '## Linked Prerequisite Rows',
    '',
    markdownTable([
      ['Gate 6 row', 'Status', 'Report target', 'Remaining boundary'],
      ...report.linkedPrerequisiteRows.map(row => [
        displayGate6Row(row.row),
        row.status,
        row.reportTarget,
        row.remainingBoundary,
      ]),
    ]),
    '',
    '## Operator Packet',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Lane', report.operatorPacket.lane],
      ['Reconciliation report target', report.operatorPacket.reconciliationReportTarget],
      ['Wrong-network report target', report.operatorPacket.wrongNetworkReportTarget],
      ['Expected network', report.operatorPacket.expectedNetwork],
      ['Observed network', report.operatorPacket.observedNetwork],
      ['Wrong-network expected network', report.operatorPacket.expectedNetwork],
      ['Wrong-network observed network', report.operatorPacket.wrongNetworkObservedNetwork],
      ['Deployment-state digest', report.operatorPacket.deploymentStateDigestHex ?? '<not recorded>'],
      ['Sidechain ID', report.operatorPacket.sidechainIdHex ?? '<not recorded>'],
      ['SCS NFT ID', report.operatorPacket.scsNftId ?? '<not recorded>'],
      ['Singleton identity count', String(report.operatorPacket.singletonIdentityCount)],
      ['Old authority identifier count', String(report.operatorPacket.oldAuthorityIdentifierCount)],
      ['New committee threshold', report.operatorPacket.newCommitteeThreshold],
      ['Rollback binding linked', yesNo(report.operatorPacket.rollbackBindingLinked)],
      ['Next operator step', report.operatorPacket.nextOperatorStep],
    ]),
    '',
    '## Stop Conditions',
    '',
    report.operatorPacket.stopConditions.length > 0
      ? report.operatorPacket.stopConditions.map(condition => `- ${escapeMarkdownText(condition)}`).join('\n')
      : '- None recorded.',
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

function parseReport(
  value: unknown,
  label: string,
  expectedKind: CommitteeGovernanceReconciliationKind,
  issues: string[],
): CommitteeGovernanceReconciliationReport | undefined {
  if (!isRecord(value)) {
    issues.push(`${label} must be an object`);
    return undefined;
  }

  const report = value as Partial<CommitteeGovernanceReconciliationReport>;
  if (report.schemaVersion !== 1) issues.push(`${label} schemaVersion must be 1`);
  if (report.command !== COMMITTEE_GOVERNANCE_RECONCILE_COMMAND) {
    issues.push(`${label} command must be ${COMMITTEE_GOVERNANCE_RECONCILE_COMMAND}`);
  }
  if (report.status !== 'LINKED') issues.push(`${label} status must be LINKED`);
  if (report.kind !== expectedKind) issues.push(`${label} kind must be ${expectedKind}`);
  if (report.issueCount !== 0) issues.push(`${label} issueCount must be 0`);
  if (!Array.isArray(report.issues) || report.issues.length !== 0) {
    issues.push(`${label} issues must be empty`);
  }
  validateInputBoundary(report.boundary, `${label} boundary`, issues);

  if (!report.networkBinding || !isRecord(report.networkBinding)) {
    issues.push(`${label} networkBinding must be present`);
  }
  if (expectedKind === 'deployment-state-reconciliation') {
    if (!report.newCommittee) issues.push(`${label} newCommittee must be present`);
    if (!report.rollback) issues.push(`${label} rollback must be present`);
    if (!report.singletonIdentities || Object.keys(report.singletonIdentities).length === 0) {
      issues.push(`${label} singletonIdentities must include at least one binding`);
    }
  }
  if (expectedKind === 'wrong-network-negative' && !report.stopCondition) {
    issues.push(`${label} stopCondition must be present`);
  }

  return report as CommitteeGovernanceReconciliationReport;
}

function validateInputBoundary(
  value: CommitteeGovernanceReconciliationBoundary | undefined,
  label: string,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${label} must be present`);
    return;
  }
  for (const [field, expected] of Object.entries(EXPECTED_RECONCILIATION_BOUNDARY) as [keyof CommitteeGovernanceReconciliationBoundary, boolean][]) {
    if (value[field] !== expected) {
      issues.push(`${label}.${field} must be ${String(expected)}`);
    }
  }
}

function buildLinkedPrerequisiteRows(
  reconciliationReportTarget: string,
  wrongNetworkReportTarget: string,
  status: 'READY' | 'BLOCKED',
): CommitteeGovernanceReconciliationHandoffRow[] {
  const rowStatus = status === 'READY' ? 'prerequisite-linked' : 'blocked';
  return [
    {
      row: 'Rotation Plan: Reconcile deployment state',
      status: rowStatus,
      reportTarget: reconciliationReportTarget,
      remainingBoundary: 'Operator must bind this sanitized report into completed committee governance evidence before Gate 6 can close.',
    },
    {
      row: 'Negative Checks: Deployment state points to the wrong network',
      status: rowStatus,
      reportTarget: wrongNetworkReportTarget,
      remainingBoundary: 'Operator must bind this wrong-network negative report into completed committee governance evidence before Gate 6 can close.',
    },
  ];
}

function buildOperatorPacket(
  reconciliationReportTarget: string,
  wrongNetworkReportTarget: string,
  reconciliationReport: CommitteeGovernanceReconciliationReport | undefined,
  wrongNetworkReport: CommitteeGovernanceReconciliationReport | undefined,
): CommitteeGovernanceReconciliationOperatorPacket {
  const expectedNetwork =
    reconciliationReport?.networkBinding?.expectedNetwork ??
    wrongNetworkReport?.networkBinding?.expectedNetwork ??
    '<not recorded>';
  const observedNetwork = reconciliationReport?.networkBinding?.observedNetwork ?? '<not recorded>';
  const wrongNetworkObservedNetwork = wrongNetworkReport?.networkBinding?.observedNetwork ?? '<not recorded>';
  const singletonIdentityCount = Object.keys(reconciliationReport?.singletonIdentities ?? {}).length;
  const oldAuthorityIdentifierCount = reconciliationReport?.oldAuthority?.publicIdentifiers.length ?? 0;
  const newCommitteeThreshold = reconciliationReport?.newCommittee
    ? `${reconciliationReport.newCommittee.threshold}/${reconciliationReport.newCommittee.memberCount}`
    : '<not recorded>';
  const stopConditions = [
    reconciliationReport?.stopCondition,
    wrongNetworkReport?.stopCondition,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return {
    lane: 'committee-governance',
    reconciliationReportTarget,
    wrongNetworkReportTarget,
    expectedNetwork,
    observedNetwork,
    wrongNetworkObservedNetwork,
    deploymentStateDigestHex: reconciliationReport?.deploymentStateDigestHex,
    sidechainIdHex: reconciliationReport?.sidechainIdHex,
    scsNftId: reconciliationReport?.scsNftId,
    singletonIdentityCount,
    oldAuthorityIdentifierCount,
    newCommitteeThreshold,
    rollbackBindingLinked: Boolean(reconciliationReport?.rollback),
    stopConditions,
    nextOperatorStep:
      'Copy both linked prerequisite report targets into the completed committee governance evidence rows, then run npm run governance:validate on that completed evidence document.',
  };
}

function expectedHandoffBoundary(): CommitteeGovernanceReconciliationHandoffBoundary {
  return {
    'Read-only handoff composer': 'yes',
    'Reconciliation report JSON reused': 'yes',
    'Wrong-network report JSON reused': 'yes',
    'Private deployment state opened': 'no',
    'Runtime database opened': 'no',
    'Secret or environment file read': 'no',
    'Signing key or wallet material read': 'no',
    'Node, RPC, or explorer request performed': 'no',
    'Key rotation authorized': 'no',
    'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no',
    'Gate 6 committee governance closure claimed': 'no',
    'Governance-ready claim supported': 'no',
    'Production-ready claim supported': 'no',
    'Testnet production-candidate claim supported': 'no',
  };
}

function displayGate6Row(row: string): string {
  return row.replace(/^Rotation Plan:\s+/, '').replace(/^Negative Checks:\s+/, '');
}

function normalizeNetwork(value: string): string {
  return value.toLowerCase().replace(/[_\s-]+/g, '-').trim();
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
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
