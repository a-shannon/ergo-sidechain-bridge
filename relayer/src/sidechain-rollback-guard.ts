export interface SidechainRollbackDecision {
  rollbackDetected: boolean;
  highWaterHeight: number;
  pegOutProcessingAllowed: boolean;
}

function normalizeHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

export function evaluateSidechainRollback(
  previousHighWaterHeight: number,
  currentHeight: number,
): SidechainRollbackDecision {
  const previous = normalizeHeight(previousHighWaterHeight, 'previous sidechain high-water height');
  const current = normalizeHeight(currentHeight, 'current sidechain height');
  const rollbackDetected = previous > 0 && current < previous;
  return {
    rollbackDetected,
    highWaterHeight: Math.max(previous, current),
    pegOutProcessingAllowed: !rollbackDetected,
  };
}
