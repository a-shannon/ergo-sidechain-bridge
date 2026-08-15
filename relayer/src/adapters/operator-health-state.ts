import type {
  OperatorHealthPersistenceInput,
  OperatorHealthPersistenceSnapshot,
} from '../relayer-core/operator-health-projection.js';

export interface OperatorHealthPersistenceStateSource {
  getOperatorHealthPersistenceState(): Readonly<{
    solvencyDeficitIncidentPresent: boolean;
    reorgQuarantineConditionCount: number;
    activeSettlementAttemptCount: number;
    oldestActiveSettlementUpdatedAtMs: number | null;
  }>;
}

export interface OperatorHealthPersistencePort {
  read(): OperatorHealthPersistenceInput;
}

function normalizeNonnegativeSafeInteger(
  value: unknown,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function normalizeOptionalTimestamp(value: unknown): number | null {
  if (value === null) return null;
  return normalizeNonnegativeSafeInteger(
    value,
    'operator-health persisted timestamp',
  );
}

function normalizeSnapshot(
  value: ReturnType<
    OperatorHealthPersistenceStateSource['getOperatorHealthPersistenceState']
  >,
): OperatorHealthPersistenceSnapshot {
  if (
    typeof value.solvencyDeficitIncidentPresent !== 'boolean'
  ) {
    throw new Error('operator-health solvency incident state must be boolean');
  }
  const activeSettlementAttemptCount = normalizeNonnegativeSafeInteger(
    value.activeSettlementAttemptCount,
    'operator-health active settlement attempt count',
  );
  const oldestActiveSettlementUpdatedAtMs = normalizeOptionalTimestamp(
    value.oldestActiveSettlementUpdatedAtMs,
  );
  if (
    (activeSettlementAttemptCount === 0)
    !== (oldestActiveSettlementUpdatedAtMs === null)
  ) {
    throw new Error(
      'operator-health active settlement count and timestamp disagree',
    );
  }
  return Object.freeze({
    status: 'available',
    solvencyDeficitIncidentPresent:
      value.solvencyDeficitIncidentPresent,
    reorgQuarantineConditionCount: normalizeNonnegativeSafeInteger(
      value.reorgQuarantineConditionCount,
      'operator-health reorg quarantine condition count',
    ),
    activeSettlementAttemptCount,
    oldestActiveSettlementUpdatedAtMs,
  });
}

export function createOperatorHealthPersistenceAdapter(
  state: OperatorHealthPersistenceStateSource,
): OperatorHealthPersistencePort {
  return Object.freeze({
    read: (): OperatorHealthPersistenceInput => {
      try {
        return normalizeSnapshot(state.getOperatorHealthPersistenceState());
      } catch {
        return Object.freeze({ status: 'unavailable' });
      }
    },
  });
}
