import { readFileSync } from 'fs';

import {
  resolveAggregateSettlementEvidenceJsonPath,
  validateAggregateSettlementPrebroadcastEvidenceRecord,
  validateAggregateSettlementTrustlessCandidateEvidenceRecord,
  validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord,
  type AggregateSettlementTrustlessCandidateEvidenceRecord,
  type AggregateSettlementTrustlessUnsignedTxEvidenceRecord,
} from './aggregate-settlement-evidence.js';

export interface TrustlessCandidateEvidenceJsonValidation {
  label: string;
  status: 'PASS' | 'BLOCKED';
  message: string;
  errors: string[];
  record?: AggregateSettlementTrustlessCandidateEvidenceRecord;
}

export interface TrustlessUnsignedTxEvidenceJsonValidation {
  label: string;
  status: 'PASS' | 'BLOCKED';
  message: string;
  errors: string[];
  record?: AggregateSettlementTrustlessUnsignedTxEvidenceRecord;
}

export function validateTrustlessCandidateEvidenceJsonTarget(
  target: string,
): TrustlessCandidateEvidenceJsonValidation {
  const resolved = resolveAggregateSettlementEvidenceJsonPath(target);
  const label = resolved.label;
  if (resolved.errors.length > 0) {
    return {
      label,
      status: 'BLOCKED',
      message: `Trustless candidate evidence BLOCKED: ${resolved.errors.length} structural issue(s).`,
      errors: resolved.errors,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved.path!, 'utf8'));
  } catch {
    return {
      label,
      status: 'BLOCKED',
      message: 'Trustless candidate evidence BLOCKED: 1 structural issue(s).',
      errors: [`${label}: trustless candidate evidence JSON could not be read or parsed`],
    };
  }

  const errors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(parsed);
  if (errors.length === 0 && validateAggregateSettlementPrebroadcastEvidenceRecord(parsed).length === 0) {
    errors.push('trustless candidate evidence must not validate as aggregate pre-broadcast evidence');
  }
  if (errors.length > 0) {
    return {
      label,
      status: 'BLOCKED',
      message: `Trustless candidate evidence BLOCKED: ${errors.length} structural issue(s).`,
      errors,
    };
  }

  const record = parsed as AggregateSettlementTrustlessCandidateEvidenceRecord;
  return {
    label,
    status: 'PASS',
    message:
      `Trustless candidate evidence PASS: ${record.claimCount} read-only candidate claim(s), ` +
      `broadcast=no, contractCompatibility=${record.contractCompatibility}; ` +
      'candidate-only evidence, not Gate 5 closure, pre-broadcast evidence, settlement readiness, or claim authorization.',
    errors: [],
    record,
  };
}

export function validateTrustlessUnsignedTxEvidenceJsonTarget(
  target: string,
): TrustlessUnsignedTxEvidenceJsonValidation {
  const resolved = resolveAggregateSettlementEvidenceJsonPath(target);
  const label = resolved.label;
  if (resolved.errors.length > 0) {
    return {
      label,
      status: 'BLOCKED',
      message: `Trustless unsigned TX evidence BLOCKED: ${resolved.errors.length} structural issue(s).`,
      errors: resolved.errors,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved.path!, 'utf8'));
  } catch {
    return {
      label,
      status: 'BLOCKED',
      message: 'Trustless unsigned TX evidence BLOCKED: 1 structural issue(s).',
      errors: [`${label}: trustless unsigned TX evidence JSON could not be read or parsed`],
    };
  }

  const errors = validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord(parsed);
  if (errors.length === 0 && validateAggregateSettlementPrebroadcastEvidenceRecord(parsed).length === 0) {
    errors.push('trustless unsigned TX evidence must not validate as aggregate pre-broadcast evidence');
  }
  if (errors.length === 0 && validateAggregateSettlementTrustlessCandidateEvidenceRecord(parsed).length === 0) {
    errors.push('trustless unsigned TX evidence must not validate as candidate-only identity evidence');
  }
  if (errors.length > 0) {
    return {
      label,
      status: 'BLOCKED',
      message: `Trustless unsigned TX evidence BLOCKED: ${errors.length} structural issue(s).`,
      errors,
    };
  }

  const record = parsed as AggregateSettlementTrustlessUnsignedTxEvidenceRecord;
  return {
    label,
    status: 'PASS',
    message:
      `Trustless unsigned TX evidence PASS: ${record.claimCount} single-leaf unsigned transaction source-boundary claim(s), ` +
      `broadcast=no, contextExtensionGuard=${record.contextExtensionGuard.status}; ` +
      'not Gate 5 closure, pre-broadcast evidence, transaction-check evidence, expected-tx-id evidence, signing authorization, or claim authorization.',
    errors: [],
    record,
  };
}
