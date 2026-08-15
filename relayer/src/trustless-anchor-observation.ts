import type { ErgoExtensionField } from './ergo-client.js';
import {
  DEFAULT_SIDECHAIN_EXTENSION_KEY,
  type SidechainAnchorField,
  findSidechainAnchorFields,
} from './spv-anchor.js';

export const MAX_TRUSTLESS_ANCHOR_OBSERVATION_HEIGHTS = 10_000;
export const TRUSTLESS_ANCHOR_OBSERVE_COMMAND = 'trustless:anchor-observe';

export type TrustlessAnchorObservationStatus = 'LINKED' | 'BLOCKED' | 'UNAVAILABLE';

export interface TrustlessAnchorObservationBoundary {
  readOnly: true;
  publicObservationInputOnly: true;
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

export interface TrustlessAnchorObservationProvider {
  sourceLabel: string;
  network?: string;
  nodeUrl?: string;
  observedHeights?: number[];
  getSidechainExtensionFieldsAtHeight(height: number): Promise<ErgoExtensionField[]>;
}

export interface TrustlessAnchorObservationInput extends TrustlessAnchorObservationProvider {
  bridgeEventRootHex: string;
  minHeight: number;
  maxHeight: number;
  observedAt: string;
  commandLine?: string;
  workingDirectory?: string;
}

export interface TrustlessAnchorObservationReadFailure {
  height: number;
  detail: string;
}

export interface TrustlessAnchorObservationReport {
  schemaVersion: 1;
  command: typeof TRUSTLESS_ANCHOR_OBSERVE_COMMAND;
  status: TrustlessAnchorObservationStatus;
  reason: string;
  bridgeEventRootHex: string;
  extensionKey: typeof DEFAULT_SIDECHAIN_EXTENSION_KEY;
  minHeight: number;
  maxHeight: number;
  observedAt: string;
  sourceLabel: string;
  network?: string;
  nodeUrl?: string;
  commandLine?: string;
  workingDirectory?: string;
  heightsScanned: number;
  extensionReadsSucceeded: number;
  extensionReadsFailed: number;
  linkedAnchor?: SidechainAnchorField;
  readFailures: TrustlessAnchorObservationReadFailure[];
  boundary: TrustlessAnchorObservationBoundary;
}

export interface ParsedTrustlessAnchorObservationJson {
  errors: string[];
  provider?: TrustlessAnchorObservationProvider;
}

interface ObservationJsonHeightRow {
  height: number;
  fields: ErgoExtensionField[];
}

export async function observeTrustlessAnchor(
  input: TrustlessAnchorObservationInput,
): Promise<TrustlessAnchorObservationReport> {
  const bridgeEventRootHex = normalizeBridgeEventRootHex(input.bridgeEventRootHex);
  const minHeight = normalizeObservationHeight(input.minHeight, 'minHeight');
  const maxHeight = normalizeObservationHeight(input.maxHeight, 'maxHeight');
  const observedAt = normalizeObservedAt(input.observedAt);
  validateObservationWindow(minHeight, maxHeight);

  let heightsScanned = 0;
  let extensionReadsSucceeded = 0;
  let extensionReadsFailed = 0;
  const readFailures: TrustlessAnchorObservationReadFailure[] = [];

  for (let height = minHeight; height <= maxHeight; height += 1) {
    heightsScanned += 1;
    try {
      const fields = await input.getSidechainExtensionFieldsAtHeight(height);
      extensionReadsSucceeded += 1;
      const linkedAnchor = findSidechainAnchorFields(fields)
        .find(anchor => anchor.bridgeEventRootHex === bridgeEventRootHex);
      if (linkedAnchor) {
        return {
          schemaVersion: 1,
          command: TRUSTLESS_ANCHOR_OBSERVE_COMMAND,
          status: 'LINKED',
          reason: 'matching 0x0401 bridgeEventRoot observed',
          bridgeEventRootHex,
          extensionKey: DEFAULT_SIDECHAIN_EXTENSION_KEY,
          minHeight,
          maxHeight,
          observedAt,
          sourceLabel: input.sourceLabel,
          network: input.network,
          nodeUrl: input.nodeUrl,
          commandLine: input.commandLine,
          workingDirectory: input.workingDirectory,
          heightsScanned,
          extensionReadsSucceeded,
          extensionReadsFailed,
          linkedAnchor,
          readFailures,
          boundary: trustlessAnchorObservationBoundary(),
        };
      }
    } catch (error) {
      extensionReadsFailed += 1;
      readFailures.push({
        height,
        detail: formatObservationError(error),
      });
    }
  }

  const status: TrustlessAnchorObservationStatus =
    extensionReadsSucceeded > 0 ? 'BLOCKED' : 'UNAVAILABLE';
  return {
    schemaVersion: 1,
    command: TRUSTLESS_ANCHOR_OBSERVE_COMMAND,
    status,
    reason: status === 'BLOCKED'
      ? 'no matching 0x0401 bridgeEventRoot observed in readable extension observations'
      : 'extension observations could not be read for the requested height window',
    bridgeEventRootHex,
    extensionKey: DEFAULT_SIDECHAIN_EXTENSION_KEY,
    minHeight,
    maxHeight,
    observedAt,
    sourceLabel: input.sourceLabel,
    network: input.network,
    nodeUrl: input.nodeUrl,
    commandLine: input.commandLine,
    workingDirectory: input.workingDirectory,
    heightsScanned,
    extensionReadsSucceeded,
    extensionReadsFailed,
    readFailures,
    boundary: trustlessAnchorObservationBoundary(),
  };
}

export function parseTrustlessAnchorObservationJson(
  json: unknown,
): ParsedTrustlessAnchorObservationJson {
  const errors: string[] = [];
  if (!isRecord(json)) {
    return { errors: ['observation JSON must be an object'] };
  }

  const sourceLabel = optionalString(json.sourceLabel, 'sourceLabel', errors) ??
    'provided public extension observation JSON';
  const network = optionalString(json.network, 'network', errors);
  const nodeUrl = optionalString(json.nodeUrl, 'nodeUrl', errors);
  const rows = parseObservationRows(json.heights, errors);
  if (errors.length > 0) return { errors };

  const fieldsByHeight = new Map<number, ErgoExtensionField[]>();
  for (const row of rows) {
    fieldsByHeight.set(row.height, row.fields);
  }

  return {
    errors: [],
    provider: {
      sourceLabel,
      network,
      nodeUrl,
      observedHeights: [...fieldsByHeight.keys()].sort((a, b) => a - b),
      getSidechainExtensionFieldsAtHeight: async (height: number) =>
        fieldsByHeight.get(height) ?? [],
    },
  };
}

export function formatTrustlessAnchorObservationReportMarkdown(
  report: TrustlessAnchorObservationReport,
): string {
  const linkedAnchorRows = report.linkedAnchor
    ? [
        ['0x0401 bridgeEventRoot observed', 'yes'],
        ['Anchor height', String(report.linkedAnchor.ergoAnchorHeight)],
        ['Anchor header ID', report.linkedAnchor.headerId],
      ]
    : [
        ['0x0401 bridgeEventRoot observed', 'no'],
        ['Blocker', report.reason],
      ];

  const readFailureRows = report.readFailures.length > 0
    ? report.readFailures.map(failure => [
        String(failure.height),
        failure.detail,
      ])
    : [['none', 'none']];

  return [
    '# Gate 5 Trustless Anchor Observation Report',
    '',
    'This report records a read-only 0x0401 extension observation for one expected bridge event root.',
    'It is prerequisite evidence only. It does not prove full burn inclusion, SPV relay operation,',
    'on-chain proof acceptance, Gate 5 closure, settlement readiness, broadcast authorization,',
    'or production-ready, mainnet, or testnet production-candidate claims.',
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
    '## Observation Scope',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Source', report.sourceLabel],
      ['Network', report.network ?? '<not recorded>'],
      ['Node endpoint', report.nodeUrl ? formatNodeEndpointForReport(report.nodeUrl) : '<not recorded>'],
      ['Extension key', `0x${report.extensionKey}`],
      ['Expected bridgeEventRoot', report.bridgeEventRootHex],
      ['Min height', String(report.minHeight)],
      ['Max height', String(report.maxHeight)],
      ['Heights scanned', String(report.heightsScanned)],
      ['Extension reads succeeded', String(report.extensionReadsSucceeded)],
      ['Extension reads failed', String(report.extensionReadsFailed)],
    ]),
    '',
    '## Anchor Observation',
    '',
    markdownTable([
      ['Field', 'Value'],
      ...linkedAnchorRows,
    ]),
    '',
    '## Read Failures',
    '',
    markdownTable([
      ['Height', 'Detail'],
      ...readFailureRows,
    ]),
    '',
    '## Boundary',
    '',
    markdownTable([
      ['Boundary', 'Value'],
      ['0x0401 extension observation checked', 'yes'],
      ['Runtime database opened', 'no'],
      ['Deployment state opened', 'no'],
      ['Secret or environment file read', 'no'],
      ['Signing key or wallet material read', 'no'],
      ['Transaction broadcast, submit, deploy, or state mutation performed', 'no'],
      ['Burn inclusion proof completed', 'no'],
      ['SPV relay or tracker evidence completed', 'no'],
      ['On-chain proof acceptance evidence completed', 'no'],
      ['Gate 5 closure allowed', 'no'],
      ['Production-ready claim allowed', 'no'],
      ['Mainnet deployment claim allowed', 'no'],
      ['Testnet production-candidate claim allowed', 'no'],
    ]),
    '',
  ].join('\n');
}

function trustlessAnchorObservationBoundary(): TrustlessAnchorObservationBoundary {
  return {
    readOnly: true,
    publicObservationInputOnly: true,
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

export function normalizeBridgeEventRootHex(value: string): string {
  let clean = value.trim();
  const lower = clean.toLowerCase();
  if (lower.startsWith('0x0401:')) {
    clean = clean.slice('0x0401:'.length);
  } else if (lower.startsWith('0401:')) {
    clean = clean.slice('0401:'.length);
  } else if (clean.includes(':')) {
    throw new Error('bridgeEventRootHex may only use the 0401:<hex> extension-pair form');
  }
  return normalizeHex(clean, 32, 'bridgeEventRootHex');
}

function parseObservationRows(value: unknown, errors: string[]): ObservationJsonHeightRow[] {
  if (!Array.isArray(value)) {
    errors.push('heights must be an array');
    return [];
  }
  if (value.length === 0) {
    errors.push('heights must contain at least one observation row');
    return [];
  }

  const rows: ObservationJsonHeightRow[] = [];
  const seenHeights = new Set<number>();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!isRecord(row)) {
      errors.push(`heights[${index}] must be an object`);
      continue;
    }

    const height = parseObservationRowHeight(row.height, `heights[${index}].height`, errors);
    const fields = parseObservationFields(row.fields, `heights[${index}].fields`, height, errors);
    if (height === undefined) continue;
    if (seenHeights.has(height)) {
      errors.push(`heights[${index}].height must be unique`);
      continue;
    }
    seenHeights.add(height);
    rows.push({ height, fields });
  }
  return rows;
}

function parseObservationRowHeight(
  value: unknown,
  label: string,
  errors: string[],
): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(`${label} must be a non-negative safe integer`);
    return undefined;
  }
  return value;
}

function parseObservationFields(
  value: unknown,
  label: string,
  height: number | undefined,
  errors: string[],
): ErgoExtensionField[] {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  if (height === undefined) return [];

  const fields: ErgoExtensionField[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const field = value[index];
    if (!isRecord(field)) {
      errors.push(`${label}[${index}] must be an object`);
      continue;
    }

    const key = requiredString(field.key, `${label}[${index}].key`, errors);
    const fieldValue = requiredString(field.value, `${label}[${index}].value`, errors);
    const headerId = requiredString(field.headerId, `${label}[${index}].headerId`, errors);
    if (key === undefined || fieldValue === undefined || headerId === undefined) continue;
    fields.push({ key, value: fieldValue, headerId, height });
  }
  return fields;
}

function normalizeObservationHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function validateObservationWindow(minHeight: number, maxHeight: number): void {
  if (minHeight > maxHeight) {
    throw new Error('minHeight must be less than or equal to maxHeight');
  }
  const windowSize = maxHeight - minHeight + 1;
  if (windowSize > MAX_TRUSTLESS_ANCHOR_OBSERVATION_HEIGHTS) {
    throw new Error(
      `observation window must cover at most ${MAX_TRUSTLESS_ANCHOR_OBSERVATION_HEIGHTS} heights`,
    );
  }
}

function normalizeObservedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('observedAt must be an ISO-compatible timestamp');
  }
  return date.toISOString();
}

function normalizeHex(value: string, expectedBytes: number, label: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function optionalString(value: unknown, label: string, errors: string[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    errors.push(`${label} must be a string`);
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredString(value: unknown, label: string, errors: string[]): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string`);
    return undefined;
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  return value
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function formatObservationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/[a-z]:[\\/]/i.test(message) || /(^|[\\/])users[\\/]/i.test(message)) {
    return '<local read error redacted>';
  }
  return message.trim().length > 0 ? message.trim() : 'read failed';
}

function formatNodeEndpointForReport(nodeUrl: string): string {
  try {
    const parsed = new URL(nodeUrl);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '<provided>';
  }
}
