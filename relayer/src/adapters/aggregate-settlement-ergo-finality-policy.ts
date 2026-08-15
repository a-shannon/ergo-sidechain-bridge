import { createHash } from 'crypto';

export const AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY_VERSION = 1 as const;
export const MIN_AGGREGATE_SETTLEMENT_ERGO_CONFIRMATIONS = 10;

export interface AggregateSettlementErgoFinalityPolicyV1 {
  version: typeof AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY_VERSION;
  requiredConfirmations: number;
}

export const DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY = Object.freeze({
  version: AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY_VERSION,
  requiredConfirmations: MIN_AGGREGATE_SETTLEMENT_ERGO_CONFIRMATIONS,
}) satisfies AggregateSettlementErgoFinalityPolicyV1;

export type AggregateSettlementErgoObservationStatus =
  | 'absent'
  | 'mempool'
  | 'confirmed_pre_finality'
  | 'confirmed_final';

export interface AggregateSettlementErgoObservationRecord {
  policyVersion: typeof AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY_VERSION;
  requiredConfirmations: number;
  status: AggregateSettlementErgoObservationStatus;
  transactionIdHex: string;
  transactionDigestHex: string | null;
  inclusionHeight: number | null;
  inclusionHeaderIdHex: string | null;
  observedTipHeight: number;
  observedTipHeaderIdHex: string;
  confirmations: number;
  observationDigestHex: string;
}

type AggregateSettlementErgoObservationBinding = Omit<
  AggregateSettlementErgoObservationRecord,
  'observationDigestHex'
>;

export function normalizeAggregateSettlementErgoFinalityPolicy(
  policy: AggregateSettlementErgoFinalityPolicyV1,
): AggregateSettlementErgoFinalityPolicyV1 {
  if (policy.version !== AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY_VERSION) {
    throw new Error(`unsupported aggregate settlement Ergo finality policy version: ${policy.version}`);
  }
  if (
    !Number.isSafeInteger(policy.requiredConfirmations)
    || policy.requiredConfirmations < MIN_AGGREGATE_SETTLEMENT_ERGO_CONFIRMATIONS
  ) {
    throw new Error(
      `aggregate settlement Ergo finality requires at least ${MIN_AGGREGATE_SETTLEMENT_ERGO_CONFIRMATIONS} confirmations`,
    );
  }
  return Object.freeze({
    version: AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY_VERSION,
    requiredConfirmations: policy.requiredConfirmations,
  });
}

export function createAggregateSettlementErgoObservationRecord(
  input: AggregateSettlementErgoObservationBinding,
): AggregateSettlementErgoObservationRecord {
  const binding = normalizeObservationBinding(input);
  return Object.freeze({
    ...binding,
    observationDigestHex: sha256Canonical(binding),
  });
}

export function normalizeAggregateSettlementErgoObservationRecord(
  input: AggregateSettlementErgoObservationRecord,
): AggregateSettlementErgoObservationRecord {
  const binding = normalizeObservationBinding(input);
  const expectedDigest = sha256Canonical(binding);
  if (fixedHex(input.observationDigestHex, 'Ergo observation digest') !== expectedDigest) {
    throw new Error('aggregate settlement Ergo observation digest does not match its fields');
  }
  return Object.freeze({ ...binding, observationDigestHex: expectedDigest });
}

function normalizeObservationBinding(
  input: AggregateSettlementErgoObservationBinding,
): AggregateSettlementErgoObservationBinding {
  const policy = normalizeAggregateSettlementErgoFinalityPolicy({
    version: input.policyVersion,
    requiredConfirmations: input.requiredConfirmations,
  });
  const observedTipHeight = nonnegativeInteger(input.observedTipHeight, 'observed Ergo tip height');
  const status = input.status;
  if (
    status !== 'absent'
    && status !== 'mempool'
    && status !== 'confirmed_pre_finality'
    && status !== 'confirmed_final'
  ) {
    throw new Error(`unsupported aggregate settlement Ergo observation status: ${String(status)}`);
  }

  const confirmed = status === 'confirmed_pre_finality' || status === 'confirmed_final';
  const inclusionHeight = input.inclusionHeight === null
    ? null
    : nonnegativeInteger(input.inclusionHeight, 'settlement inclusion height');
  const confirmations = nonnegativeInteger(input.confirmations, 'settlement confirmation count');
  const transactionDigestHex = input.transactionDigestHex === null
    ? null
    : fixedHex(input.transactionDigestHex, 'settlement transaction digest');
  const inclusionHeaderIdHex = input.inclusionHeaderIdHex === null
    ? null
    : fixedHex(input.inclusionHeaderIdHex, 'settlement inclusion header ID');

  if (confirmed) {
    if (inclusionHeight === null || inclusionHeaderIdHex === null || transactionDigestHex === null) {
      throw new Error('confirmed settlement observation requires transaction and inclusion bindings');
    }
    if (observedTipHeight < inclusionHeight) {
      throw new Error('observed Ergo tip precedes settlement inclusion height');
    }
    const expectedConfirmations = observedTipHeight - inclusionHeight + 1;
    if (confirmations !== expectedConfirmations) {
      throw new Error('settlement confirmation count does not match tip and inclusion heights');
    }
    if (status === 'confirmed_final' && confirmations < policy.requiredConfirmations) {
      throw new Error('final settlement observation does not satisfy the confirmation policy');
    }
    if (status === 'confirmed_pre_finality' && confirmations >= policy.requiredConfirmations) {
      throw new Error('pre-finality settlement observation already satisfies the confirmation policy');
    }
  } else if (
    inclusionHeight !== null
    || inclusionHeaderIdHex !== null
    || transactionDigestHex !== null
    || confirmations !== 0
  ) {
    throw new Error(`${status} settlement observation cannot carry confirmed transaction fields`);
  }

  return {
    policyVersion: policy.version,
    requiredConfirmations: policy.requiredConfirmations,
    status,
    transactionIdHex: fixedHex(input.transactionIdHex, 'settlement transaction ID'),
    transactionDigestHex,
    inclusionHeight,
    inclusionHeaderIdHex,
    observedTipHeight,
    observedTipHeaderIdHex: fixedHex(
      input.observedTipHeaderIdHex,
      'observed Ergo tip header ID',
    ),
    confirmations,
  };
}

function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function fixedHex(value: string, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean.toLowerCase();
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Ergo observation cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`Ergo observation cannot serialize ${typeof value}`);
}
