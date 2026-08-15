import { readFileSync, realpathSync } from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';

import {
  formatAggregateSettlementEvidenceJsonPathLabel,
  validateAggregateSettlementEvidenceJsonPath,
  validateAggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import type {
  AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import {
  findLocalAggregateSettlementEvidenceJsonTargets,
} from './testnet-prebroadcast-evidence.js';
import type {
  LinkedAggregateSettlementEvidenceJsonRecord,
} from './testnet-prebroadcast-evidence.js';

const blockedLinkedEvidenceJsonTargetLabel = '<blocked evidence JSON target>';

export interface LinkedAggregateSettlementEvidenceJsonSummary {
  target: string;
  label: string;
  status: 'READ' | 'BLOCKED';
  command?: string;
  expectedTxId?: string;
  claimCount?: number;
  inputCount?: number;
  outputCount?: number;
  contextExtensionKeyCountsCsv?: string;
  readError?: string;
}

export function readLinkedAggregateSettlementEvidenceJsonRecords(
  markdownTarget: string,
  markdown: string,
): LinkedAggregateSettlementEvidenceJsonRecord[] {
  const targets = findLocalAggregateSettlementEvidenceJsonTargets(markdown);
  if (targets.length === 0) return [];
  const trimmedMarkdownTarget = markdownTarget.trim();

  let markdownPath: string;
  let bridgeRoot: string;
  try {
    markdownPath = realpathSync(resolve(process.cwd(), trimmedMarkdownTarget));
    bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
  } catch {
    return targets.map(target => ({
      target,
      readError: 'could not resolve completed evidence Markdown path',
    }));
  }

  return targets.map(target => readLinkedAggregateSettlementEvidenceJsonRecord(
    target,
    markdownPath,
    bridgeRoot,
  ));
}

export function summarizeLinkedAggregateSettlementEvidenceJsonRecords(
  records: LinkedAggregateSettlementEvidenceJsonRecord[],
): LinkedAggregateSettlementEvidenceJsonSummary[] {
  return records.map((record) => {
    const label = formatAggregateSettlementEvidenceJsonPathLabel(record.target);
    if (record.readError) {
      return {
        target: record.target,
        label,
        status: 'BLOCKED',
        readError: record.readError,
      };
    }

    const recordErrors = validateAggregateSettlementPrebroadcastEvidenceRecord(record.record);
    if (recordErrors.length > 0 || !isAggregateSettlementEvidenceRecord(record.record)) {
      return {
        target: record.target,
        label,
        status: 'BLOCKED',
        readError: 'invalid aggregate settlement evidence JSON',
      };
    }

    return {
      target: record.target,
      label,
      status: 'READ',
      command: record.record.command,
      expectedTxId: record.record.transactionCheck.expectedTxId,
      claimCount: record.record.claimCount,
      inputCount: record.record.settlementShape.inputCount,
      outputCount: record.record.settlementShape.outputCount,
      contextExtensionKeyCountsCsv: record.record.settlementShape.contextExtensionKeyCountsCsv,
    };
  });
}

function readLinkedAggregateSettlementEvidenceJsonRecord(
  target: string,
  markdownPath: string,
  bridgeRoot: string,
): LinkedAggregateSettlementEvidenceJsonRecord {
  const pathErrors = validateAggregateSettlementEvidenceJsonPath(target);
  if (pathErrors.length > 0) {
    const label = formatAggregateSettlementEvidenceJsonPathLabel(target);
    return {
      target: label,
      readError: 'path validation failed',
    };
  }

  try {
    const jsonPath = realpathSync(resolve(dirname(markdownPath), target));
    if (!isInsidePath(jsonPath, bridgeRoot)) {
      return {
        target: blockedLinkedEvidenceJsonTargetLabel,
        readError: 'refusing to read linked JSON outside the bridge repository',
      };
    }

    return {
      target,
      record: JSON.parse(readFileSync(jsonPath, 'utf8')),
    };
  } catch {
    if (linkedJsonTargetResolvesOutsideBridge(target, markdownPath, bridgeRoot)) {
      return {
        target: blockedLinkedEvidenceJsonTargetLabel,
        readError: 'refusing to read linked JSON outside the bridge repository',
      };
    }
    return {
      target,
      readError: 'linked JSON evidence could not be read or parsed',
    };
  }
}

function linkedJsonTargetResolvesOutsideBridge(
  target: string,
  markdownPath: string,
  bridgeRoot: string,
): boolean {
  try {
    const jsonTarget = resolve(dirname(markdownPath), target);
    const nearestExistingAncestor = realpathNearestExistingAncestor(jsonTarget);
    return !isInsidePath(nearestExistingAncestor, bridgeRoot);
  } catch {
    return false;
  }
}

function realpathNearestExistingAncestor(target: string): string {
  let cursor = target;
  while (true) {
    try {
      return realpathSync(cursor);
    } catch {
      const parent = dirname(cursor);
      if (parent === cursor) {
        throw new Error(`No existing ancestor for ${target}`);
      }
      cursor = parent;
    }
  }
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isAggregateSettlementEvidenceRecord(
  value: unknown,
): value is AggregateSettlementPrebroadcastEvidenceRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
