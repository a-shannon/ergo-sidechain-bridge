export const LEGACY_MCU_DISABLED_MESSAGE =
  'Legacy MainChainUnlock creation and spend are disabled: SCS height and Ergo age do not prove a canonical sidechain burn. Use the proof-bound aggregate path or keep the peg-out fail-closed.';

export class LegacyMcuDisabledError extends Error {
  constructor(operation: string) {
    super(`${operation}: ${LEGACY_MCU_DISABLED_MESSAGE}`);
    this.name = 'LegacyMcuDisabledError';
  }
}

export function assertLegacyMcuDisabled(operation: string): void {
  throw new LegacyMcuDisabledError(operation);
}
