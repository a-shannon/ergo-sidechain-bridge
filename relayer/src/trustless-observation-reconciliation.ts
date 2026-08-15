import { TRUSTLESS_ANCHOR_OBSERVE_COMMAND } from './trustless-anchor-observation.js';
import { TRUSTLESS_SPV_TRACKER_OBSERVE_COMMAND } from './spv-tracker-observation.js';

export const TRUSTLESS_OBSERVATION_RECONCILE_COMMAND = 'trustless:observation-reconcile';

export type TrustlessObservationReconciliationStatus = 'LINKED' | 'BLOCKED';
export type TrustlessObservationReconciliationCheckStatus = 'PASS' | 'BLOCKED';

export interface TrustlessObservationReconciliationBoundary {
  readOnly: true;
  publicObservationInputsOnly: true;
  anchorObservationJsonReused: true;
  spvTrackerObservationJsonReused: true;
  nodeOrRpcRequestPerformed: false;
  deploymentStateOpened: false;
  runtimeDatabaseOpened: false;
  secretOrEnvironmentFileRead: false;
  signingOrWalletMaterialRead: false;
  transactionBroadcastOrMutation: false;
  gate5Closure: false;
  settlementReadiness: false;
  productionClaimSupport: false;
  testnetProductionCandidateClaimSupport: false;
}

export interface TrustlessObservationReconciliationCheck {
  name: string;
  status: TrustlessObservationReconciliationCheckStatus;
  detail: string;
}

export interface TrustlessObservationReconciliationReport {
  schemaVersion: 1;
  command: typeof TRUSTLESS_OBSERVATION_RECONCILE_COMMAND;
  status: TrustlessObservationReconciliationStatus;
  reason: string;
  observedAt: string;
  commandLine?: string;
  workingDirectory?: string;
  anchorObservationReportTarget: string;
  spvTrackerObservationReportTarget: string;
  anchorObservationStatus?: string;
  spvTrackerObservationStatus?: string;
  anchorBridgeEventRootHex?: string;
  spvBridgeEventRootHex?: string;
  reconciledBridgeEventRootHex?: string;
  anchorErgoAnchorHeight?: number;
  spvErgoAnchorHeight?: number;
  reconciledErgoAnchorHeight?: number;
  checks: TrustlessObservationReconciliationCheck[];
  boundary: TrustlessObservationReconciliationBoundary;
}

export interface TrustlessObservationReconciliationInput {
  anchorObservationReportTarget: string;
  spvTrackerObservationReportTarget: string;
  anchorObservationReport: unknown;
  spvTrackerObservationReport: unknown;
  observedAt: string;
  commandLine?: string;
  workingDirectory?: string;
}

interface AnchorObservationSummary {
  command?: string;
  status?: string;
  bridgeEventRootHex?: string;
  linkedBridgeEventRootHex?: string;
  linkedErgoAnchorHeight?: number;
  boundary?: Record<string, unknown>;
}

interface SpvTrackerObservationSummary {
  command?: string;
  status?: string;
  expectedBridgeEventRootHex?: string;
  decodedBridgeEventRootHex?: string;
  expectedErgoAnchorHeight?: number;
  decodedErgoAnchorHeight?: number;
  boundary?: Record<string, unknown>;
}

export function reconcileTrustlessObservationReports(
  input: TrustlessObservationReconciliationInput,
): TrustlessObservationReconciliationReport {
  const anchor = summarizeAnchorObservationReport(input.anchorObservationReport);
  const spv = summarizeSpvTrackerObservationReport(input.spvTrackerObservationReport);
  const checks: TrustlessObservationReconciliationCheck[] = [];

  checks.push(check(
    'Target separation',
    input.anchorObservationReportTarget.trim() !== input.spvTrackerObservationReportTarget.trim(),
    'anchor and SPV tracker observation reports use distinct evidence targets',
    'anchor and SPV tracker observation reports must use distinct evidence targets',
  ));
  checks.push(check(
    'Anchor observation report command',
    anchor.command === TRUSTLESS_ANCHOR_OBSERVE_COMMAND,
    'anchor report was produced by trustless:anchor-observe',
    'anchor report command must be trustless:anchor-observe',
  ));
  checks.push(check(
    'SPV tracker observation report command',
    spv.command === TRUSTLESS_SPV_TRACKER_OBSERVE_COMMAND,
    'SPV tracker report was produced by trustless:spv-tracker-observe',
    'SPV tracker report command must be trustless:spv-tracker-observe',
  ));
  checks.push(check(
    'Anchor observation linked',
    anchor.status === 'LINKED',
    'anchor report observed the requested 0x0401 bridgeEventRoot',
    `anchor report status must be LINKED; observed ${anchor.status ?? '<missing>'}`,
  ));
  checks.push(check(
    'SPV tracker observation linked',
    spv.status === 'LINKED',
    'SPV tracker report linked the expected key/value proof',
    `SPV tracker report status must be LINKED; observed ${spv.status ?? '<missing>'}`,
  ));

  const rootValues = [
    anchor.bridgeEventRootHex,
    anchor.linkedBridgeEventRootHex,
    spv.expectedBridgeEventRootHex,
    spv.decodedBridgeEventRootHex,
  ].filter((value): value is string => typeof value === 'string');
  const rootSet = new Set(rootValues);
  const rootReady = rootValues.length === 4 && rootSet.size === 1;
  checks.push(check(
    'Bridge event root identity',
    rootReady,
    'anchor and SPV tracker reports bind the same bridgeEventRoot',
    'anchor bridgeEventRoot, linkedAnchor.bridgeEventRootHex, SPV expectedEntry.bridgeEventRootHex, and SPV decodedValue.bridgeEventRootHex must all be present and equal',
  ));

  const heightValues = [
    anchor.linkedErgoAnchorHeight,
    spv.expectedErgoAnchorHeight,
    spv.decodedErgoAnchorHeight,
  ].filter((value): value is number => typeof value === 'number');
  const heightSet = new Set(heightValues);
  const heightReady = heightValues.length === 3 && heightSet.size === 1;
  checks.push(check(
    'Ergo anchor height identity',
    heightReady,
    'anchor and SPV tracker reports bind the same ergoAnchorHeight',
    'anchor linkedAnchor.ergoAnchorHeight, SPV expectedEntry.ergoAnchorHeight, and SPV decodedValue.ergoAnchorHeight must all be present and equal',
  ));

  checks.push(check(
    'Anchor observation boundary',
    hasAnchorBoundary(anchor.boundary),
    'anchor report preserves read-only public observation boundaries',
    'anchor report boundary must be read-only, public-input-only, no runtime/deployment/secret/signing material, no mutation, and no Gate 5 or claim support',
  ));
  checks.push(check(
    'SPV tracker observation boundary',
    hasSpvTrackerBoundary(spv.boundary),
    'SPV tracker report preserves read-only public observation boundaries',
    'SPV tracker report boundary must be read-only, public-input-only, no node/RPC request, no runtime/deployment/secret/signing material, no mutation, and no Gate 5 or claim support',
  ));

  const status: TrustlessObservationReconciliationStatus = checks.every(entry => entry.status === 'PASS')
    ? 'LINKED'
    : 'BLOCKED';
  const reason = status === 'LINKED'
    ? 'anchor and SPV tracker observations share bridgeEventRoot and ergoAnchorHeight'
    : checks.find(entry => entry.status === 'BLOCKED')?.detail ?? 'observation reconciliation is blocked';

  return {
    schemaVersion: 1,
    command: TRUSTLESS_OBSERVATION_RECONCILE_COMMAND,
    status,
    reason,
    observedAt: normalizeObservedAt(input.observedAt),
    commandLine: input.commandLine,
    workingDirectory: input.workingDirectory,
    anchorObservationReportTarget: sanitizeTarget(input.anchorObservationReportTarget),
    spvTrackerObservationReportTarget: sanitizeTarget(input.spvTrackerObservationReportTarget),
    anchorObservationStatus: anchor.status,
    spvTrackerObservationStatus: spv.status,
    anchorBridgeEventRootHex: anchor.linkedBridgeEventRootHex ?? anchor.bridgeEventRootHex,
    spvBridgeEventRootHex: spv.decodedBridgeEventRootHex ?? spv.expectedBridgeEventRootHex,
    ...(rootReady ? { reconciledBridgeEventRootHex: rootValues[0] } : {}),
    anchorErgoAnchorHeight: anchor.linkedErgoAnchorHeight,
    spvErgoAnchorHeight: spv.decodedErgoAnchorHeight ?? spv.expectedErgoAnchorHeight,
    ...(heightReady ? { reconciledErgoAnchorHeight: heightValues[0] } : {}),
    checks,
    boundary: reconciliationBoundary(),
  };
}

export function formatTrustlessObservationReconciliationMarkdown(
  report: TrustlessObservationReconciliationReport,
): string {
  return [
    '# Gate 5 Observation Reconciliation Report',
    '',
    'This report reconciles read-only anchor and SPV tracker observation reports for one Gate 5 bridge event root.',
    'It is prerequisite evidence only. It does not prove full burn inclusion, on-chain proof acceptance,',
    'Gate 5 closure, settlement readiness, broadcast authorization, or production-ready, mainnet,',
    'or testnet production-candidate claims.',
    '',
    '## Command Result',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Result', report.status],
      ['Reason', report.reason],
      ['Observed at', report.observedAt],
      ['Command', report.commandLine ?? report.command],
      ['Working directory', report.workingDirectory ?? '<not recorded>'],
    ]),
    '',
    '## Reconciled Inputs',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Anchor observation report', report.anchorObservationReportTarget],
      ['SPV tracker observation report', report.spvTrackerObservationReportTarget],
      ['Anchor status', report.anchorObservationStatus ?? '<missing>'],
      ['SPV tracker status', report.spvTrackerObservationStatus ?? '<missing>'],
      ['Anchor bridgeEventRoot', report.anchorBridgeEventRootHex ?? '<not linked>'],
      ['SPV bridgeEventRoot', report.spvBridgeEventRootHex ?? '<not linked>'],
      ['Reconciled bridgeEventRoot', report.reconciledBridgeEventRootHex ?? '<blocked>'],
      ['Anchor Ergo height', report.anchorErgoAnchorHeight === undefined ? '<not linked>' : String(report.anchorErgoAnchorHeight)],
      ['SPV Ergo height', report.spvErgoAnchorHeight === undefined ? '<not linked>' : String(report.spvErgoAnchorHeight)],
      ['Reconciled Ergo height', report.reconciledErgoAnchorHeight === undefined ? '<blocked>' : String(report.reconciledErgoAnchorHeight)],
    ]),
    '',
    '## Checks',
    '',
    markdownTable([
      ['Check', 'Result', 'Detail'],
      ...report.checks.map(entry => [entry.name, entry.status, entry.detail]),
    ]),
    '',
    '## Boundary',
    '',
    markdownTable([
      ['Boundary', 'Value'],
      ['Planning or prerequisite output only', 'yes'],
      ['Anchor observation JSON reused', 'yes'],
      ['SPV tracker observation JSON reused', 'yes'],
      ['Node, RPC, or explorer request performed', 'no'],
      ['Runtime database opened', 'no'],
      ['Deployment state opened', 'no'],
      ['Secret or environment file read', 'no'],
      ['Signing key or wallet material read', 'no'],
      ['Transaction broadcast, submit, deploy, or state mutation performed', 'no'],
      ['Gate 5 closure allowed', 'no'],
      ['Settlement readiness allowed', 'no'],
      ['Production-ready claim allowed', 'no'],
      ['Mainnet deployment claim allowed', 'no'],
      ['Testnet production-candidate claim allowed', 'no'],
    ]),
    '',
  ].join('\n');
}

function summarizeAnchorObservationReport(value: unknown): AnchorObservationSummary {
  if (!isRecord(value)) return {};
  const linkedAnchor = isRecord(value.linkedAnchor) ? value.linkedAnchor : undefined;
  return {
    command: optionalString(value.command),
    status: optionalString(value.status),
    bridgeEventRootHex: optionalHex32(value.bridgeEventRootHex),
    linkedBridgeEventRootHex: optionalHex32(linkedAnchor?.bridgeEventRootHex),
    linkedErgoAnchorHeight: optionalSafeInteger(linkedAnchor?.ergoAnchorHeight),
    boundary: isRecord(value.boundary) ? value.boundary : undefined,
  };
}

function summarizeSpvTrackerObservationReport(value: unknown): SpvTrackerObservationSummary {
  if (!isRecord(value)) return {};
  const expectedEntry = isRecord(value.expectedEntry) ? value.expectedEntry : undefined;
  const decodedValue = isRecord(value.decodedValue) ? value.decodedValue : undefined;
  return {
    command: optionalString(value.command),
    status: optionalString(value.status),
    expectedBridgeEventRootHex: optionalHex32(expectedEntry?.bridgeEventRootHex),
    decodedBridgeEventRootHex: optionalHex32(decodedValue?.bridgeEventRootHex),
    expectedErgoAnchorHeight: optionalSafeInteger(expectedEntry?.ergoAnchorHeight),
    decodedErgoAnchorHeight: optionalSafeInteger(decodedValue?.ergoAnchorHeight),
    boundary: isRecord(value.boundary) ? value.boundary : undefined,
  };
}

function check(
  name: string,
  passed: boolean,
  passDetail: string,
  blockDetail: string,
): TrustlessObservationReconciliationCheck {
  return {
    name,
    status: passed ? 'PASS' : 'BLOCKED',
    detail: passed ? passDetail : blockDetail,
  };
}

function hasAnchorBoundary(boundary: Record<string, unknown> | undefined): boolean {
  return !!boundary &&
    boundary.readOnly === true &&
    boundary.publicObservationInputOnly === true &&
    boundary.deploymentStateOpened === false &&
    boundary.runtimeDatabaseOpened === false &&
    boundary.secretOrEnvironmentFileRead === false &&
    boundary.signingOrWalletMaterialRead === false &&
    boundary.transactionBroadcastOrMutation === false &&
    boundary.gate5Closure === false &&
    boundary.settlementReadiness === false &&
    boundary.productionClaimSupport === false &&
    boundary.testnetProductionCandidateClaimSupport === false;
}

function hasSpvTrackerBoundary(boundary: Record<string, unknown> | undefined): boolean {
  return !!boundary &&
    boundary.readOnly === true &&
    boundary.publicObservationInputOnly === true &&
    boundary.deploymentStateOpened === false &&
    boundary.runtimeDatabaseOpened === false &&
    boundary.secretOrEnvironmentFileRead === false &&
    boundary.signingOrWalletMaterialRead === false &&
    boundary.nodeOrRpcRequestPerformed === false &&
    boundary.transactionBroadcastOrMutation === false &&
    boundary.gate5Closure === false &&
    boundary.settlementReadiness === false &&
    boundary.productionClaimSupport === false &&
    boundary.testnetProductionCandidateClaimSupport === false;
}

function reconciliationBoundary(): TrustlessObservationReconciliationBoundary {
  return {
    readOnly: true,
    publicObservationInputsOnly: true,
    anchorObservationJsonReused: true,
    spvTrackerObservationJsonReused: true,
    nodeOrRpcRequestPerformed: false,
    deploymentStateOpened: false,
    runtimeDatabaseOpened: false,
    secretOrEnvironmentFileRead: false,
    signingOrWalletMaterialRead: false,
    transactionBroadcastOrMutation: false,
    gate5Closure: false,
    settlementReadiness: false,
    productionClaimSupport: false,
    testnetProductionCandidateClaimSupport: false,
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalHex32(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().startsWith('0x') ? value.trim().slice(2) : value.trim();
  return /^[0-9a-fA-F]{64}$/.test(clean) ? clean.toLowerCase() : undefined;
}

function optionalSafeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function normalizeObservedAt(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error('observedAt must be an ISO-compatible timestamp');
  }
  return value.trim();
}

function sanitizeTarget(target: string): string {
  return target.trim().replace(/\\/g, '/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function markdownTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const [header, ...body] = rows;
  return [
    `| ${header.map(escapeMarkdownCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map(row => `| ${row.map(escapeMarkdownCell).join(' | ')} |`),
  ].join('\n');
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
