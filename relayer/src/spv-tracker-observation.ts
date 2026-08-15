import {
  buildSpvTrackerGetProof,
  decodeSpvTrackerValue,
  deriveSpvTrackerKey,
  encodeSpvTrackerValue,
  getSpvTrackerDigest,
  type SpvTrackerEntry,
  type SpvTrackerHistoryEntry,
} from './spv-tracker.js';

export const TRUSTLESS_SPV_TRACKER_OBSERVE_COMMAND = 'trustless:spv-tracker-observe';

export type SpvTrackerObservationStatus = 'LINKED' | 'BLOCKED';

export interface SpvTrackerObservationBoundary {
  readOnly: true;
  publicObservationInputOnly: true;
  deploymentStateOpened: false;
  runtimeDatabaseOpened: false;
  secretOrEnvironmentFileRead: false;
  signingOrWalletMaterialRead: false;
  nodeOrRpcRequestPerformed: false;
  transactionBroadcastOrMutation: false;
  gate5Closure: false;
  settlementReadiness: false;
  productionClaimSupport: false;
  testnetProductionCandidateClaimSupport: false;
}

export interface SpvTrackerObservationInput {
  sourceLabel: string;
  network?: string;
  nodeUrl?: string;
  observedAt: string;
  commandLine?: string;
  workingDirectory?: string;
  trackerDigestHex: string;
  trackerBox?: {
    boxId: string;
    nftId: string;
  };
  expectedEntry: SpvTrackerEntry;
  sidechainFinality: SpvTrackerSidechainFinalityInput;
  history: SpvTrackerHistoryEntry[];
}

export interface SpvTrackerSidechainFinalityInput {
  finalityRule: string;
  sidechainBlockHeight: number;
  observedSidechainHeight: number;
  requiredConfirmations: number;
}

export interface SpvTrackerSidechainFinalityEvidence extends SpvTrackerSidechainFinalityInput {
  observedConfirmations: number;
  status: 'FINALIZED' | 'UNFINALIZED';
}

export interface ParsedSpvTrackerObservationJson {
  errors: string[];
  input?: SpvTrackerObservationInput;
}

export interface SpvTrackerObservationReport {
  schemaVersion: 1;
  command: typeof TRUSTLESS_SPV_TRACKER_OBSERVE_COMMAND;
  status: SpvTrackerObservationStatus;
  reason: string;
  observedAt: string;
  sourceLabel: string;
  network?: string;
  nodeUrl?: string;
  commandLine?: string;
  workingDirectory?: string;
  trackerBox?: {
    boxId: string;
    nftId: string;
  };
  expectedEntry: SpvTrackerEntry;
  sidechainFinality: SpvTrackerSidechainFinalityEvidence;
  historyLength: number;
  trackerDigestHex: string;
  rebuiltTrackerDigestHex: string;
  expectedKeyHex: string;
  expectedValueHex: string;
  observedValueHex?: string;
  proofDigestHex?: string;
  getProofHex?: string;
  decodedValue?: {
    bridgeEventRootHex: string;
    ergoAnchorHeight: number;
  };
  boundary: SpvTrackerObservationBoundary;
}

const OBSERVATION_INPUT_FIELDS = new Set([
  'sourceLabel',
  'network',
  'nodeUrl',
  'observedAt',
  'trackerDigestHex',
  'trackerBox',
  'expectedEntry',
  'sidechainFinality',
  'history',
]);
const TRACKER_BOX_FIELDS = new Set(['boxId', 'nftId']);
const EXPECTED_ENTRY_FIELDS = new Set([
  'sidechainIdHex',
  'sidechainHeight',
  'sidechainHeaderHashHex',
  'bridgeEventRootHex',
  'ergoAnchorHeight',
]);
const SIDECHAIN_FINALITY_FIELDS = new Set([
  'finalityRule',
  'sidechainBlockHeight',
  'observedSidechainHeight',
  'requiredConfirmations',
]);
const HISTORY_ENTRY_FIELDS = new Set(['key', 'value']);

export function buildSpvTrackerObservationInput(
  input: SpvTrackerObservationInput,
  overrides: Partial<Pick<SpvTrackerObservationInput, 'observedAt' | 'commandLine' | 'workingDirectory'>> = {},
): SpvTrackerObservationInput {
  return {
    ...input,
    observedAt: overrides.observedAt ?? input.observedAt,
    commandLine: overrides.commandLine ?? input.commandLine,
    workingDirectory: overrides.workingDirectory ?? input.workingDirectory,
  };
}

export function observeTrustlessSpvTracker(
  input: SpvTrackerObservationInput,
): SpvTrackerObservationReport {
  const expectedEntry = normalizeSpvTrackerEntry(input.expectedEntry);
  const trackerDigestHex = normalizeHex(input.trackerDigestHex, 33, 'trackerDigestHex');
  const observedAt = normalizeObservedAt(input.observedAt);
  const history = input.history.map((entry, index) => normalizeHistoryEntry(entry, `history[${index}]`));
  const sidechainFinality = summarizeSidechainFinality(input.sidechainFinality);
  const expectedKeyHex = deriveSpvTrackerKey(expectedEntry);
  const expectedValueHex = encodeSpvTrackerValue(expectedEntry);
  const rebuiltTrackerDigestHex = getSpvTrackerDigest(history);

  let observedValueHex: string | undefined;
  let proofDigestHex: string | undefined;
  let getProofHex: string | undefined;
  let decodedValue: { bridgeEventRootHex: string; ergoAnchorHeight: number } | undefined;
  let reason = '';

  try {
    const proof = buildSpvTrackerGetProof(history, expectedEntry);
    observedValueHex = normalizeHex(proof.valueHex, 36, 'observed tracker value');
    proofDigestHex = normalizeHex(proof.digestHex, 33, 'SPV tracker proof digest');
    getProofHex = normalizeNonEmptyHex(proof.getProofHex, 'SPV tracker get proof');
    decodedValue = decodeSpvTrackerValue(observedValueHex);
  } catch {
    reason = 'SPV tracker history does not contain expected sidechain commitment entry';
  }

  if (!reason && rebuiltTrackerDigestHex !== trackerDigestHex) {
    reason = 'SPV tracker digest does not match rebuilt public history digest';
  }
  if (!reason && proofDigestHex !== trackerDigestHex) {
    reason = 'SPV tracker proof digest does not match observed tracker digest';
  }
  if (!reason && observedValueHex !== expectedValueHex) {
    reason = 'SPV tracker observed value does not match expected bridge event root and anchor height';
  }
  if (
    !reason &&
    (decodedValue?.bridgeEventRootHex !== expectedEntry.bridgeEventRootHex ||
      decodedValue?.ergoAnchorHeight !== expectedEntry.ergoAnchorHeight)
  ) {
    reason = 'SPV tracker decoded value does not match expected bridge event root and anchor height';
  }
  if (!reason && sidechainFinality.sidechainBlockHeight !== expectedEntry.sidechainHeight) {
    reason = 'sidechain finality block height does not match expected tracker sidechain height';
  }
  if (!reason && sidechainFinality.status !== 'FINALIZED') {
    reason = 'sidechain finality depth is below required confirmations';
  }

  const status: SpvTrackerObservationStatus = reason ? 'BLOCKED' : 'LINKED';
  return {
    schemaVersion: 1,
    command: TRUSTLESS_SPV_TRACKER_OBSERVE_COMMAND,
    status,
    reason: reason || 'SPV tracker history contains expected sidechain commitment entry',
    observedAt,
    sourceLabel: input.sourceLabel,
    network: input.network,
    nodeUrl: input.nodeUrl,
    commandLine: input.commandLine,
    workingDirectory: input.workingDirectory,
    trackerBox: input.trackerBox,
    expectedEntry,
    sidechainFinality,
    historyLength: history.length,
    trackerDigestHex,
    rebuiltTrackerDigestHex,
    expectedKeyHex,
    expectedValueHex,
    observedValueHex,
    proofDigestHex,
    getProofHex,
    decodedValue,
    boundary: spvTrackerObservationBoundary(),
  };
}

export function parseSpvTrackerObservationJson(json: unknown): ParsedSpvTrackerObservationJson {
  const errors: string[] = [];
  if (!isRecord(json)) {
    return { errors: ['observation JSON must be an object'] };
  }

  validateAllowedFields(errors, 'observation JSON', json, OBSERVATION_INPUT_FIELDS);
  const sourceLabel = optionalString(json.sourceLabel, 'sourceLabel', errors) ??
    'operator sanitized SPV tracker observation';
  const network = optionalString(json.network, 'network', errors);
  const nodeUrl = optionalString(json.nodeUrl, 'nodeUrl', errors);
  const observedAt = requiredString(json.observedAt, 'observedAt', errors);
  const trackerDigestHex = parseHex(json.trackerDigestHex, 33, 'trackerDigestHex', errors);
  const trackerBox = parseTrackerBox(json.trackerBox, errors);
  const expectedEntry = parseExpectedEntry(json.expectedEntry, errors);
  const sidechainFinality = parseSidechainFinality(json.sidechainFinality, errors);
  const history = parseHistory(json.history, errors);

  if (errors.length > 0 || !observedAt || !trackerDigestHex || !expectedEntry || !sidechainFinality) {
    return { errors };
  }

  return {
    errors: [],
    input: {
      sourceLabel,
      network,
      nodeUrl,
      observedAt,
      trackerDigestHex,
      trackerBox,
      expectedEntry,
      sidechainFinality,
      history,
    },
  };
}

export function formatSpvTrackerObservationReportMarkdown(
  report: SpvTrackerObservationReport,
): string {
  const trackerRows = report.status === 'LINKED'
    ? [
        ['SPV tracker key/value linked', 'yes'],
        ['Expected tracker key', report.expectedKeyHex],
        ['Expected tracker value', report.expectedValueHex],
        ['Observed tracker value', report.observedValueHex ?? '<not observed>'],
        ['Tracker digest', report.trackerDigestHex],
      ]
    : [
        ['SPV tracker key/value linked', 'no'],
        ['Blocker', report.reason],
        ['Expected tracker key', report.expectedKeyHex],
        ['Tracker digest', report.trackerDigestHex],
        ['Rebuilt digest', report.rebuiltTrackerDigestHex],
      ];

  return [
    '# Gate 5 SPV Tracker Observation Report',
    '',
    'This report records a read-only SPV tracker key/value observation from sanitized public JSON.',
    'It is prerequisite evidence only. It does not prove full burn inclusion, on-chain proof',
    'acceptance, Gate 5 closure, settlement readiness, broadcast authorization, or',
    'production-ready, mainnet, or testnet production-candidate claims.',
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
      ['History entries', String(report.historyLength)],
      ['Tracker box', report.trackerBox?.boxId ?? '<not recorded>'],
      ['Tracker NFT', report.trackerBox?.nftId ?? '<not recorded>'],
    ]),
    '',
    '## Sidechain Finality',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Finality rule', report.sidechainFinality.finalityRule],
      ['Sidechain block height', String(report.sidechainFinality.sidechainBlockHeight)],
      ['Observed sidechain height', String(report.sidechainFinality.observedSidechainHeight)],
      ['Required confirmations', String(report.sidechainFinality.requiredConfirmations)],
      ['Observed confirmations', String(report.sidechainFinality.observedConfirmations)],
      ['Finality status', report.sidechainFinality.status],
    ]),
    '',
    '## Tracker Observation',
    '',
    markdownTable([
      ['Field', 'Value'],
      ...trackerRows,
    ]),
    '',
    '## Boundary',
    '',
    markdownTable([
      ['Boundary', 'Value'],
      ['SPV tracker key/value proof checked', 'yes'],
      ['Runtime database opened', 'no'],
      ['Deployment state opened', 'no'],
      ['Secret or environment file read', 'no'],
      ['Signing key or wallet material read', 'no'],
      ['Node, RPC, or explorer request performed', 'no'],
      ['Transaction broadcast, submit, deploy, or state mutation performed', 'no'],
      ['Burn inclusion proof completed', 'no'],
      ['Sidechain finality binding checked', 'yes'],
      ['On-chain proof acceptance evidence completed', 'no'],
      ['Gate 5 closure allowed', 'no'],
      ['Production-ready claim allowed', 'no'],
      ['Mainnet deployment claim allowed', 'no'],
      ['Testnet production-candidate claim allowed', 'no'],
    ]),
    '',
  ].join('\n');
}

function spvTrackerObservationBoundary(): SpvTrackerObservationBoundary {
  return {
    readOnly: true,
    publicObservationInputOnly: true,
    deploymentStateOpened: false,
    runtimeDatabaseOpened: false,
    secretOrEnvironmentFileRead: false,
    signingOrWalletMaterialRead: false,
    nodeOrRpcRequestPerformed: false,
    transactionBroadcastOrMutation: false,
    gate5Closure: false,
    settlementReadiness: false,
    productionClaimSupport: false,
    testnetProductionCandidateClaimSupport: false,
  };
}

function parseExpectedEntry(value: unknown, errors: string[]): SpvTrackerEntry | undefined {
  if (!isRecord(value)) {
    errors.push('expectedEntry must be an object');
    return undefined;
  }
  validateAllowedFields(errors, 'expectedEntry', value, EXPECTED_ENTRY_FIELDS);
  const sidechainIdHex = parseHex(value.sidechainIdHex, 32, 'expectedEntry.sidechainIdHex', errors);
  const sidechainHeight = parseNonNegativeInteger(value.sidechainHeight, 'expectedEntry.sidechainHeight', errors);
  const sidechainHeaderHashHex = parseHex(
    value.sidechainHeaderHashHex,
    32,
    'expectedEntry.sidechainHeaderHashHex',
    errors,
  );
  const bridgeEventRootHex = parseHex(value.bridgeEventRootHex, 32, 'expectedEntry.bridgeEventRootHex', errors);
  const ergoAnchorHeight = parseNonNegativeInteger(value.ergoAnchorHeight, 'expectedEntry.ergoAnchorHeight', errors);
  if (
    !sidechainIdHex ||
    sidechainHeight === undefined ||
    !sidechainHeaderHashHex ||
    !bridgeEventRootHex ||
    ergoAnchorHeight === undefined
  ) {
    return undefined;
  }
  return {
    sidechainIdHex,
    sidechainHeight,
    sidechainHeaderHashHex,
    bridgeEventRootHex,
    ergoAnchorHeight,
  };
}

function parseTrackerBox(value: unknown, errors: string[]): SpvTrackerObservationInput['trackerBox'] {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    errors.push('trackerBox must be an object');
    return undefined;
  }
  validateAllowedFields(errors, 'trackerBox', value, TRACKER_BOX_FIELDS);
  const boxId = parseHex(value.boxId, 32, 'trackerBox.boxId', errors);
  const nftId = parseHex(value.nftId, 32, 'trackerBox.nftId', errors);
  return boxId && nftId ? { boxId, nftId } : undefined;
}

function parseSidechainFinality(value: unknown, errors: string[]): SpvTrackerSidechainFinalityInput | undefined {
  if (!isRecord(value)) {
    errors.push('sidechainFinality must be an object');
    return undefined;
  }
  validateAllowedFields(errors, 'sidechainFinality', value, SIDECHAIN_FINALITY_FIELDS);
  const finalityRule = requiredString(value.finalityRule, 'sidechainFinality.finalityRule', errors);
  const sidechainBlockHeight = parseNonNegativeInteger(
    value.sidechainBlockHeight,
    'sidechainFinality.sidechainBlockHeight',
    errors,
  );
  const observedSidechainHeight = parseNonNegativeInteger(
    value.observedSidechainHeight,
    'sidechainFinality.observedSidechainHeight',
    errors,
  );
  const requiredConfirmations = parsePositiveInteger(
    value.requiredConfirmations,
    'sidechainFinality.requiredConfirmations',
    errors,
  );
  if (
    !finalityRule ||
    sidechainBlockHeight === undefined ||
    observedSidechainHeight === undefined ||
    requiredConfirmations === undefined
  ) {
    return undefined;
  }
  return {
    finalityRule,
    sidechainBlockHeight,
    observedSidechainHeight,
    requiredConfirmations,
  };
}

function parseHistory(value: unknown, errors: string[]): SpvTrackerHistoryEntry[] {
  if (!Array.isArray(value)) {
    errors.push('history must be an array');
    return [];
  }
  const history: SpvTrackerHistoryEntry[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry)) {
      errors.push(`history[${index}] must be an object`);
      continue;
    }
    validateAllowedFields(errors, `history[${index}]`, entry, HISTORY_ENTRY_FIELDS);
    const key = parseHex(entry.key, 32, `history[${index}].key`, errors);
    const historyValue = parseHex(entry.value, 36, `history[${index}].value`, errors);
    if (key && historyValue) history.push({ key, value: historyValue });
  }
  return history;
}

function normalizeSpvTrackerEntry(entry: SpvTrackerEntry): SpvTrackerEntry {
  return {
    sidechainIdHex: normalizeHex(entry.sidechainIdHex, 32, 'sidechainIdHex'),
    sidechainHeight: normalizeNonNegativeInteger(entry.sidechainHeight, 'sidechainHeight'),
    sidechainHeaderHashHex: normalizeHex(entry.sidechainHeaderHashHex, 32, 'sidechainHeaderHashHex'),
    bridgeEventRootHex: normalizeHex(entry.bridgeEventRootHex, 32, 'bridgeEventRootHex'),
    ergoAnchorHeight: normalizeNonNegativeInteger(entry.ergoAnchorHeight, 'ergoAnchorHeight'),
  };
}

function normalizeHistoryEntry(entry: SpvTrackerHistoryEntry, label: string): SpvTrackerHistoryEntry {
  return {
    key: normalizeHex(entry.key, 32, `${label}.key`),
    value: normalizeHex(entry.value, 36, `${label}.value`),
  };
}

function parseHex(
  value: unknown,
  expectedBytes: number,
  label: string,
  errors: string[],
): string | undefined {
  if (typeof value !== 'string') {
    errors.push(`${label} must be a ${expectedBytes}-byte hex string`);
    return undefined;
  }
  try {
    return normalizeHex(value, expectedBytes, label);
  } catch {
    errors.push(`${label} must be a ${expectedBytes}-byte hex string`);
    return undefined;
  }
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

function normalizeNonEmptyHex(value: string, label: string): string {
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length === 0 || value.length % 2 !== 0) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return value.toLowerCase();
}

function parseNonNegativeInteger(value: unknown, label: string, errors: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(`${label} must be a non-negative safe integer`);
    return undefined;
  }
  return value;
}

function parsePositiveInteger(value: unknown, label: string, errors: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    errors.push(`${label} must be a positive safe integer`);
    return undefined;
  }
  return value;
}

function normalizeNonNegativeInteger(value: number | bigint, label: string): number {
  const normalized = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return normalized;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function summarizeSidechainFinality(
  input: SpvTrackerSidechainFinalityInput,
): SpvTrackerSidechainFinalityEvidence {
  const finalityRule = normalizeNonEmptyString(input.finalityRule, 'sidechainFinality.finalityRule');
  const sidechainBlockHeight = normalizeNonNegativeInteger(
    input.sidechainBlockHeight,
    'sidechainFinality.sidechainBlockHeight',
  );
  const observedSidechainHeight = normalizeNonNegativeInteger(
    input.observedSidechainHeight,
    'sidechainFinality.observedSidechainHeight',
  );
  const requiredConfirmations = normalizePositiveInteger(
    input.requiredConfirmations,
    'sidechainFinality.requiredConfirmations',
  );
  const observedConfirmations = Math.max(0, observedSidechainHeight - sidechainBlockHeight);
  return {
    finalityRule,
    sidechainBlockHeight,
    observedSidechainHeight,
    requiredConfirmations,
    observedConfirmations,
    status: observedConfirmations >= requiredConfirmations ? 'FINALIZED' : 'UNFINALIZED',
  };
}

function normalizeObservedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('observedAt must be an ISO-compatible timestamp');
  }
  return date.toISOString();
}

function normalizeNonEmptyString(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
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
