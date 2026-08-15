import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export const COMMITTEE_GOVERNANCE_RECONCILE_COMMAND = 'governance:reconcile:validate';

export type CommitteeGovernanceReconciliationKind =
  | 'deployment-state-reconciliation'
  | 'wrong-network-negative';
export type CommitteeGovernanceReconciliationStatus = 'LINKED' | 'BLOCKED';

export interface CommitteeGovernanceReconciliationBoundary {
  readOnly: boolean;
  sanitizedPublicInputOnly: boolean;
  privateDeploymentStateIncluded: boolean;
  deploymentStateOpened: boolean;
  runtimeDatabaseOpened: boolean;
  secretOrEnvironmentFileRead: boolean;
  signingOrWalletMaterialRead: boolean;
  nodeOrRpcRequestPerformed: boolean;
  keyRotationAuthorized: boolean;
  transactionBroadcastOrMutation: boolean;
  gate6Closure: boolean;
  governanceReadyClaimSupport: boolean;
  productionClaimSupport: boolean;
  testnetProductionCandidateClaimSupport: boolean;
}

export interface CommitteeAuthorityIdentifiers {
  label: string;
  publicIdentifiers: string[];
}

export interface CommitteeGovernanceNewCommittee {
  threshold: number;
  memberCount: number;
  publicIdentifiers: string[];
}

export interface CommitteeGovernanceRollbackBinding {
  previousAuthorityDigestHex: string;
  rollbackStateDigestHex: string;
  recoveryPath: string;
}

export interface CommitteeGovernanceNetworkBinding {
  expectedNetwork: string;
  observedNetwork: string;
  matched: boolean;
}

export interface CommitteeGovernanceReconciliationReport {
  schemaVersion: 1;
  command: typeof COMMITTEE_GOVERNANCE_RECONCILE_COMMAND;
  status: CommitteeGovernanceReconciliationStatus;
  kind: CommitteeGovernanceReconciliationKind | 'invalid';
  reason: string;
  observedAt?: string;
  sourceLabel?: string;
  targetLabel?: string;
  deploymentStateDigestHex?: string;
  sidechainIdHex?: string;
  scsNftId?: string;
  singletonIdentities: Record<string, string>;
  oldAuthority?: CommitteeAuthorityIdentifiers;
  newCommittee?: CommitteeGovernanceNewCommittee;
  rollback?: CommitteeGovernanceRollbackBinding;
  stopCondition?: string;
  networkBinding?: CommitteeGovernanceNetworkBinding;
  issueCount: number;
  issues: string[];
  commandLine?: string;
  workingDirectory?: string;
  boundary: CommitteeGovernanceReconciliationBoundary;
}

export interface CommitteeGovernanceReconciliationReportOptions {
  commandLine?: string;
  workingDirectory?: string;
}

const ALLOWED_FIELDS = new Set([
  'kind',
  'sourceLabel',
  'targetLabel',
  'observedAt',
  'expectedNetwork',
  'observedNetwork',
  'deploymentStateDigestHex',
  'sidechainIdHex',
  'scsNftId',
  'singletonIdentities',
  'oldAuthority',
  'newCommittee',
  'rollback',
  'stopCondition',
  'boundary',
]);
const OLD_AUTHORITY_FIELDS = new Set(['label', 'publicIdentifiers']);
const NEW_COMMITTEE_FIELDS = new Set(['threshold', 'memberCount', 'publicIdentifiers']);
const ROLLBACK_FIELDS = new Set(['previousAuthorityDigestHex', 'rollbackStateDigestHex', 'recoveryPath']);
const BOUNDARY_EXPECTATIONS: Record<keyof CommitteeGovernanceReconciliationBoundary, boolean> = {
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

export function validateCommitteeGovernanceReconciliationJson(
  json: unknown,
  options: CommitteeGovernanceReconciliationReportOptions = {},
): CommitteeGovernanceReconciliationReport {
  const errors: string[] = [];
  if (!isRecord(json)) {
    return buildReport({
      errors: ['reconciliation JSON must be an object'],
      options,
      singletonIdentities: {},
      boundary: expectedBoundary(),
    });
  }

  validateAllowedFields(errors, 'reconciliation JSON', json, ALLOWED_FIELDS);
  const kind = parseKind(json.kind, errors);
  const sourceLabel = parsePublicString(json.sourceLabel, 'sourceLabel', errors);
  const targetLabel = parsePublicString(json.targetLabel, 'targetLabel', errors);
  const observedAt = parseObservedAt(json.observedAt, errors);
  const expectedNetwork = parseNetwork(json.expectedNetwork, 'expectedNetwork', errors);
  const observedNetwork = parseNetwork(json.observedNetwork, 'observedNetwork', errors);
  const deploymentStateDigestHex = parseHex(json.deploymentStateDigestHex, 32, 'deploymentStateDigestHex', errors);
  const stopCondition = parsePublicString(json.stopCondition, 'stopCondition', errors);
  const boundary = parseBoundary(json.boundary, errors);
  const networkBinding = expectedNetwork && observedNetwork
    ? {
        expectedNetwork,
        observedNetwork,
        matched: normalizeNetwork(expectedNetwork) === normalizeNetwork(observedNetwork),
      }
    : undefined;

  let sidechainIdHex: string | undefined;
  let scsNftId: string | undefined;
  let singletonIdentities: Record<string, string> = {};
  let oldAuthority: CommitteeAuthorityIdentifiers | undefined;
  let newCommittee: CommitteeGovernanceNewCommittee | undefined;
  let rollback: CommitteeGovernanceRollbackBinding | undefined;

  if (kind === 'deployment-state-reconciliation') {
    sidechainIdHex = parseHex(json.sidechainIdHex, 32, 'sidechainIdHex', errors);
    scsNftId = parseHex(json.scsNftId, 32, 'scsNftId', errors);
    singletonIdentities = parseSingletonIdentities(json.singletonIdentities, errors);
    oldAuthority = parseAuthority(json.oldAuthority, 'oldAuthority', errors);
    newCommittee = parseNewCommittee(json.newCommittee, errors);
    rollback = parseRollback(json.rollback, errors);

    if (networkBinding && !networkBinding.matched) {
      errors.push('deployment-state reconciliation requires expected and observed networks to match');
    }
  } else if (kind === 'wrong-network-negative') {
    if (networkBinding?.matched) {
      errors.push('wrong-network negative evidence requires expected and observed networks to differ');
    }
  }

  if (stopCondition && !isActionableStopCondition(stopCondition)) {
    errors.push('stopCondition must explicitly stop, block, reject, refuse, fail, abort, halt, or disable rotation');
  }

  return buildReport({
    errors,
    kind,
    observedAt,
    sourceLabel,
    targetLabel,
    deploymentStateDigestHex,
    sidechainIdHex,
    scsNftId,
    singletonIdentities,
    oldAuthority,
    newCommittee,
    rollback,
    stopCondition,
    networkBinding,
    boundary,
    options,
  });
}

export function formatCommitteeGovernanceReconciliationReportMarkdown(
  report: CommitteeGovernanceReconciliationReport,
): string {
  const issueRows = report.issues.length > 0
    ? report.issues.map(issue => `- ${escapeMarkdownText(issue)}`).join('\n')
    : '- None.';
  const scopeRows = [
    ['Source', report.sourceLabel ?? '<not recorded>'],
    ['Target label', report.targetLabel ?? '<not recorded>'],
    ['Observed at', report.observedAt ?? '<not recorded>'],
    ['Deployment-state digest', report.deploymentStateDigestHex ?? '<not recorded>'],
  ];

  const networkRows = report.networkBinding
    ? [
        ['Expected network', report.networkBinding.expectedNetwork],
        ['Observed network', report.networkBinding.observedNetwork],
        ['Network binding matched', report.networkBinding.matched ? 'yes' : 'no'],
      ]
    : [
        ['Expected network', '<not recorded>'],
        ['Observed network', '<not recorded>'],
        ['Network binding matched', 'no'],
      ];

  const evidenceRows = report.kind === 'wrong-network-negative'
    ? [
        ['Wrong-network rejection linked', report.status === 'LINKED' ? 'yes' : 'no'],
        ['Stop condition', report.stopCondition ?? '<not recorded>'],
      ]
    : [
        ['Deployment-state reconciliation linked', report.status === 'LINKED' ? 'yes' : 'no'],
        ['Sidechain ID', report.sidechainIdHex ?? '<not recorded>'],
        ['SCS NFT ID', report.scsNftId ?? '<not recorded>'],
        ['Singleton identity count', String(Object.keys(report.singletonIdentities).length)],
        ['Old authority identifiers', String(report.oldAuthority?.publicIdentifiers.length ?? 0)],
        ['New committee threshold', report.newCommittee ? `${report.newCommittee.threshold}/${report.newCommittee.memberCount}` : '<not recorded>'],
        ['Rollback binding linked', report.rollback ? 'yes' : 'no'],
      ];

  return [
    '# Gate 6 Deployment-State Reconciliation Report',
    '',
    'This report validates sanitized public JSON for Gate 6 committee governance prerequisites.',
    'It does not open private deployment state, rotate keys, mutate runtime state, authorize',
    'broadcast, close Gate 6, or support public release claims.',
    '',
    '## Command Result',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Result', report.status],
      ['Reason', report.reason],
      ['Kind', report.kind],
      ['Command', report.commandLine ?? report.command],
      ['Working directory', report.workingDirectory ?? '<not recorded>'],
      ['Structural issues', String(report.issueCount)],
    ]),
    '',
    '## Issues',
    '',
    issueRows,
    '',
    '## Packet Scope',
    '',
    markdownTable([
      ['Field', 'Value'],
      ...scopeRows,
    ]),
    '',
    '## Network Binding',
    '',
    markdownTable([
      ['Field', 'Value'],
      ...networkRows,
    ]),
    '',
    '## Governance Evidence Binding',
    '',
    markdownTable([
      ['Field', 'Value'],
      ...evidenceRows,
    ]),
    '',
    '## Boundary',
    '',
    markdownTable([
      ['Boundary', 'Value'],
      ['Read-only validator', yesNo(report.boundary.readOnly)],
      ['Sanitized public input only', yesNo(report.boundary.sanitizedPublicInputOnly)],
      ['Private deployment state included', yesNo(report.boundary.privateDeploymentStateIncluded)],
      ['Deployment state opened', yesNo(report.boundary.deploymentStateOpened)],
      ['Runtime database opened', yesNo(report.boundary.runtimeDatabaseOpened)],
      ['Secret or environment file read', yesNo(report.boundary.secretOrEnvironmentFileRead)],
      ['Signing key or wallet material read', yesNo(report.boundary.signingOrWalletMaterialRead)],
      ['Node, RPC, or explorer request performed', yesNo(report.boundary.nodeOrRpcRequestPerformed)],
      ['Key rotation authorized', yesNo(report.boundary.keyRotationAuthorized)],
      ['Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed', yesNo(report.boundary.transactionBroadcastOrMutation)],
      ['Gate 6 committee governance closure claimed', yesNo(report.boundary.gate6Closure)],
      ['Governance-ready claim supported', yesNo(report.boundary.governanceReadyClaimSupport)],
      ['Production-ready claim supported', yesNo(report.boundary.productionClaimSupport)],
      ['Testnet production-candidate claim supported', yesNo(report.boundary.testnetProductionCandidateClaimSupport)],
    ]),
    '',
  ].join('\n');
}

function buildReport(input: {
  errors: string[];
  kind?: CommitteeGovernanceReconciliationKind;
  observedAt?: string;
  sourceLabel?: string;
  targetLabel?: string;
  deploymentStateDigestHex?: string;
  sidechainIdHex?: string;
  scsNftId?: string;
  singletonIdentities: Record<string, string>;
  oldAuthority?: CommitteeAuthorityIdentifiers;
  newCommittee?: CommitteeGovernanceNewCommittee;
  rollback?: CommitteeGovernanceRollbackBinding;
  stopCondition?: string;
  networkBinding?: CommitteeGovernanceNetworkBinding;
  boundary: CommitteeGovernanceReconciliationBoundary;
  options: CommitteeGovernanceReconciliationReportOptions;
}): CommitteeGovernanceReconciliationReport {
  const status: CommitteeGovernanceReconciliationStatus = input.errors.length > 0 ? 'BLOCKED' : 'LINKED';
  return {
    schemaVersion: 1,
    command: COMMITTEE_GOVERNANCE_RECONCILE_COMMAND,
    status,
    kind: input.kind ?? 'invalid',
    reason: status === 'LINKED'
      ? linkedReason(input.kind)
      : `Committee governance reconciliation evidence BLOCKED: ${input.errors.length} structural issue(s).`,
    observedAt: input.observedAt,
    sourceLabel: input.sourceLabel,
    targetLabel: input.targetLabel,
    deploymentStateDigestHex: input.deploymentStateDigestHex,
    sidechainIdHex: input.sidechainIdHex,
    scsNftId: input.scsNftId,
    singletonIdentities: input.singletonIdentities,
    oldAuthority: input.oldAuthority,
    newCommittee: input.newCommittee,
    rollback: input.rollback,
    stopCondition: input.stopCondition,
    networkBinding: input.networkBinding,
    issueCount: input.errors.length,
    issues: [...new Set(input.errors.map(sanitizeReportText))],
    commandLine: input.options.commandLine,
    workingDirectory: input.options.workingDirectory,
    boundary: input.boundary,
  };
}

function linkedReason(kind: CommitteeGovernanceReconciliationKind | undefined): string {
  return kind === 'wrong-network-negative'
    ? 'Wrong-network negative evidence blocks committee governance rotation when network binding mismatches.'
    : 'Sanitized deployment-state reconciliation binds network, singleton identity, old authority, new committee authority, and rollback state.';
}

function parseKind(value: unknown, errors: string[]): CommitteeGovernanceReconciliationKind | undefined {
  if (value !== 'deployment-state-reconciliation' && value !== 'wrong-network-negative') {
    errors.push('kind must be deployment-state-reconciliation or wrong-network-negative');
    return undefined;
  }
  return value;
}

function parseObservedAt(value: unknown, errors: string[]): string | undefined {
  const observedAt = parsePublicString(value, 'observedAt', errors);
  if (!observedAt) return undefined;
  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime())) {
    errors.push('observedAt must be an ISO-compatible timestamp');
    return undefined;
  }
  return date.toISOString();
}

function parseNetwork(value: unknown, label: string, errors: string[]): string | undefined {
  const network = parsePublicString(value, label, errors);
  if (!network) return undefined;
  if (/\b(main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(network)) {
    errors.push(`${label} must be a non-mainnet network label`);
  }
  if (!/^[a-z0-9][a-z0-9._ -]{1,63}$/i.test(network)) {
    errors.push(`${label} must be a concrete network label`);
  }
  return network.trim();
}

function parsePublicString(value: unknown, label: string, errors: string[]): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string`);
    return undefined;
  }
  const trimmed = value.trim();
  if (hasLocalPathOrUri(trimmed)) {
    errors.push(`${label} must not contain local paths or URI targets`);
  }
  if (hasSecretOrRuntimeText(trimmed)) {
    errors.push(`${label} must not contain secret-bearing or runtime-state text`);
  }
  if (classifyPublicationClaimText(trimmed).hasProductionClaim) {
    errors.push(`${label} must not contain production or mainnet claim wording`);
  }
  return sanitizeReportText(trimmed);
}

function parseHex(value: unknown, expectedBytes: number, label: string, errors: string[]): string | undefined {
  if (typeof value !== 'string') {
    errors.push(`${label} must be a ${expectedBytes}-byte hex string`);
    return undefined;
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== expectedBytes * 2) {
    errors.push(`${label} must be a ${expectedBytes}-byte hex string`);
    return undefined;
  }
  return clean.toLowerCase();
}

function parsePublicIdentifier(value: unknown, label: string, errors: string[]): string | undefined {
  if (typeof value !== 'string') {
    errors.push(`${label} must be a 32-byte or 33-byte public identifier hex string`);
    return undefined;
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || (clean.length !== 64 && clean.length !== 66)) {
    errors.push(`${label} must be a 32-byte or 33-byte public identifier hex string`);
    return undefined;
  }
  return clean.toLowerCase();
}

function parseSingletonIdentities(value: unknown, errors: string[]): Record<string, string> {
  if (!isRecord(value)) {
    errors.push('singletonIdentities must be an object');
    return {};
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    errors.push('singletonIdentities must include at least one singleton binding');
    return {};
  }

  const identities: Record<string, string> = {};
  for (const [name, rawHex] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(name)) {
      errors.push(`singletonIdentities.${name} must use a safe public binding name`);
      continue;
    }
    const parsed = parseHex(rawHex, 32, `singletonIdentities.${name}`, errors);
    if (parsed) identities[name] = parsed;
  }
  return identities;
}

function parseAuthority(
  value: unknown,
  label: string,
  errors: string[],
): CommitteeAuthorityIdentifiers | undefined {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return undefined;
  }
  validateAllowedFields(errors, label, value, OLD_AUTHORITY_FIELDS);
  const authorityLabel = parsePublicString(value.label, `${label}.label`, errors);
  const publicIdentifiers = parsePublicIdentifierList(value.publicIdentifiers, `${label}.publicIdentifiers`, errors);
  if (!authorityLabel || publicIdentifiers.length === 0) return undefined;
  return {
    label: authorityLabel,
    publicIdentifiers,
  };
}

function parseNewCommittee(value: unknown, errors: string[]): CommitteeGovernanceNewCommittee | undefined {
  if (!isRecord(value)) {
    errors.push('newCommittee must be an object');
    return undefined;
  }
  validateAllowedFields(errors, 'newCommittee', value, NEW_COMMITTEE_FIELDS);
  const threshold = parsePositiveSafeInteger(value.threshold, 'newCommittee.threshold', errors);
  const memberCount = parsePositiveSafeInteger(value.memberCount, 'newCommittee.memberCount', errors);
  const publicIdentifiers = parsePublicIdentifierList(
    value.publicIdentifiers,
    'newCommittee.publicIdentifiers',
    errors,
  );

  if (threshold !== undefined && threshold < 2) {
    errors.push('newCommittee.threshold must be at least 2');
  }
  if (memberCount !== undefined && memberCount < 3) {
    errors.push('newCommittee.memberCount must be at least 3');
  }
  if (threshold !== undefined && memberCount !== undefined && threshold >= memberCount) {
    errors.push('newCommittee.threshold must be lower than memberCount to prove member-loss tolerance');
  }
  if (memberCount !== undefined && publicIdentifiers.length > 0 && publicIdentifiers.length !== memberCount) {
    errors.push('newCommittee.publicIdentifiers length must match memberCount');
  }
  if (threshold === undefined || memberCount === undefined || publicIdentifiers.length === 0) return undefined;
  return {
    threshold,
    memberCount,
    publicIdentifiers,
  };
}

function parseRollback(value: unknown, errors: string[]): CommitteeGovernanceRollbackBinding | undefined {
  if (!isRecord(value)) {
    errors.push('rollback must be an object');
    return undefined;
  }
  validateAllowedFields(errors, 'rollback', value, ROLLBACK_FIELDS);
  const previousAuthorityDigestHex = parseHex(
    value.previousAuthorityDigestHex,
    32,
    'rollback.previousAuthorityDigestHex',
    errors,
  );
  const rollbackStateDigestHex = parseHex(
    value.rollbackStateDigestHex,
    32,
    'rollback.rollbackStateDigestHex',
    errors,
  );
  const recoveryPath = parsePublicString(value.recoveryPath, 'rollback.recoveryPath', errors);
  if (recoveryPath && !/\b(rollback|previous[- ]authority|recovery)\b/i.test(recoveryPath)) {
    errors.push('rollback.recoveryPath must identify rollback, previous-authority, or recovery handling');
  }
  if (!previousAuthorityDigestHex || !rollbackStateDigestHex || !recoveryPath) return undefined;
  return {
    previousAuthorityDigestHex,
    rollbackStateDigestHex,
    recoveryPath,
  };
}

function parsePublicIdentifierList(value: unknown, label: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  if (value.length === 0) {
    errors.push(`${label} must include at least one public identifier`);
    return [];
  }
  const identifiers: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parsePublicIdentifier(value[index], `${label}[${index}]`, errors);
    if (parsed) identifiers.push(parsed);
  }
  if (new Set(identifiers).size !== identifiers.length) {
    errors.push(`${label} must not contain duplicate public identifiers`);
  }
  return identifiers;
}

function parsePositiveSafeInteger(value: unknown, label: string, errors: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    errors.push(`${label} must be a positive safe integer`);
    return undefined;
  }
  return value;
}

function parseBoundary(value: unknown, errors: string[]): CommitteeGovernanceReconciliationBoundary {
  if (!isRecord(value)) {
    errors.push('boundary must be an object');
    return expectedBoundary();
  }
  validateAllowedFields(errors, 'boundary', value, new Set(Object.keys(BOUNDARY_EXPECTATIONS)));
  const boundary = expectedBoundary();
  for (const [field, expected] of Object.entries(BOUNDARY_EXPECTATIONS) as [keyof CommitteeGovernanceReconciliationBoundary, boolean][]) {
    if (typeof value[field] !== 'boolean') {
      errors.push(`boundary.${field} must be ${String(expected)}`);
      continue;
    }
    boundary[field] = value[field];
    if (value[field] !== expected) {
      errors.push(`boundary.${field} must be ${String(expected)}`);
    }
  }
  return boundary;
}

function expectedBoundary(): CommitteeGovernanceReconciliationBoundary {
  return { ...BOUNDARY_EXPECTATIONS };
}

function validateAllowedFields(
  errors: string[],
  label: string,
  value: Record<string, unknown>,
  allowedFields: Set<string>,
): void {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      errors.push(`${label} unexpected field ${field} is not allowed`);
    }
  }
}

function hasLocalPathOrUri(value: string): boolean {
  return /(?:^|[^A-Za-z])(?:[A-Za-z]:[\\/]|file:\/\/|https?:\/\/|\/Users\/|\/home\/)/i.test(value);
}

function hasSecretOrRuntimeText(value: string): boolean {
  return /\b(?:privateKey|private_key|mnemonic|seed phrase|seedPhrase|api[_ -]?key|bridge-state\.sqlite|\.sqlite|\.env)\b/i.test(value);
}

function isActionableStopCondition(value: string): boolean {
  return /\b(stop|block|blocked|reject|rejected|refuse|refused|fail|failed|abort|aborted|halt|halted|disable|disabled)\b/i.test(value);
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
