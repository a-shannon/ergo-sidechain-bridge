import {
  validateAggregateSettlementEvidenceJsonPath,
  validateAggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import type {
  AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';

export interface TestnetPrebroadcastDryRunFieldSummaryInput {
  record: unknown;
  aggregateJsonLinkTarget: string;
  pegInEventIdOrTxId?: string;
  daemonApprovalPreparation?: string;
}

export interface TestnetPrebroadcastDryRunFieldSummary {
  fields: Record<string, string>;
  lines: string[];
}

const DRY_RUN_FIELD_ORDER = [
  'Peg-in event ID or TX ID',
  'Peg-out burn TX ID',
  'Sidechain block height',
  'Sidechain block hash',
  'Bridge event root',
  'Ergo anchor height',
  'Aggregate claim count',
  'Input count',
  'Output count',
  'ContextExtension key counts per input',
  '`/transactions/check` result',
  'Expected transaction ID',
  'Daemon approval preparation',
] as const;

const PENDING_PEG_IN = '<32-byte peg-in event or tx id> plus completed artifact target';
const PENDING_SIDECHAIN_BLOCK_HASH = '<32-byte sidechain block hash> plus completed artifact target';
const PENDING_BRIDGE_EVENT_ROOT = '<32-byte bridge event root> plus completed artifact target';
const PENDING_ERGO_ANCHOR_HEIGHT = '<ergo anchor height> plus completed artifact target';
const DEFAULT_DAEMON_APPROVAL =
  'N/A - explicit CLI submit workflow artifact://prebroadcast/daemon-approval-na.log';

export function buildTestnetPrebroadcastDryRunFieldSummary(
  input: TestnetPrebroadcastDryRunFieldSummaryInput,
): TestnetPrebroadcastDryRunFieldSummary {
  const recordErrors = validateAggregateSettlementPrebroadcastEvidenceRecord(input.record);
  if (recordErrors.length > 0) {
    throw new Error(recordErrors.join('; '));
  }
  const linkErrors = validatePrebroadcastAggregateJsonLinkTarget(input.aggregateJsonLinkTarget);
  if (linkErrors.length > 0) {
    throw new Error(linkErrors.join('; '));
  }

  const record = input.record as AggregateSettlementPrebroadcastEvidenceRecord;
  const primaryClaim = record.claims[0];
  const aggregateJsonLinkTarget = normalizePrebroadcastAggregateJsonLinkTarget(input.aggregateJsonLinkTarget);
  const aggregateJsonLink = `[aggregate JSON](${aggregateJsonLinkTarget})`;
  const fields: Record<string, string> = {
    'Peg-in event ID or TX ID': input.pegInEventIdOrTxId ?? PENDING_PEG_IN,
    'Peg-out burn TX ID': `${primaryClaim.burnTxHash} ${aggregateJsonLink}`,
    'Sidechain block height': String(primaryClaim.sidechainBlockHeight),
    'Sidechain block hash': primaryClaim.sidechainHeaderHashHex
      ? `${primaryClaim.sidechainHeaderHashHex} ${aggregateJsonLink}`
      : PENDING_SIDECHAIN_BLOCK_HASH,
    'Bridge event root': primaryClaim.bridgeEventRootHex
      ? `${primaryClaim.bridgeEventRootHex} ${aggregateJsonLink}`
      : PENDING_BRIDGE_EVENT_ROOT,
    'Ergo anchor height': primaryClaim.ergoAnchorHeight === undefined
      ? PENDING_ERGO_ANCHOR_HEIGHT
      : `${primaryClaim.ergoAnchorHeight} ${aggregateJsonLink}`,
    'Aggregate claim count': String(record.claimCount),
    'Input count': String(record.settlementShape.inputCount),
    'Output count': String(record.settlementShape.outputCount),
    'ContextExtension key counts per input': record.settlementShape.contextExtensionKeyCountsCsv,
    '`/transactions/check` result': `PASS ${aggregateJsonLink}`,
    'Expected transaction ID': `${record.transactionCheck.expectedTxId} ${aggregateJsonLink}`,
    'Daemon approval preparation': input.daemonApprovalPreparation ?? DEFAULT_DAEMON_APPROVAL,
  };

  return {
    fields,
    lines: DRY_RUN_FIELD_ORDER.map(field => `- ${field}: ${fields[field]}`),
  };
}

export function validatePrebroadcastAggregateJsonLinkTarget(target: string): string[] {
  const normalized = normalizePrebroadcastAggregateJsonLinkTarget(target);
  const errors: string[] = [];

  if (!/\.json$/i.test(normalized)) {
    errors.push('aggregate JSON link target must end with .json');
  }
  if (
    normalized.startsWith('/') ||
    /^[a-z]:\//i.test(normalized) ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    errors.push('aggregate JSON link target must be a local relative path');
  }
  if (normalized.split('/').includes('..')) {
    errors.push('aggregate JSON link target must not use parent directory segments');
  }
  for (const pathError of validateAggregateSettlementEvidenceJsonPath(normalized)) {
    errors.push(pathError);
  }

  return errors;
}

function normalizePrebroadcastAggregateJsonLinkTarget(target: string): string {
  return target.trim().replace(/\\/g, '/');
}
