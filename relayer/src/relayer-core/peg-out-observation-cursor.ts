export interface PegOutObservationCursorStatePort {
  getSyncState(): Readonly<{
    latestSidechainHeight: number;
  }>;
  updateSyncState(updates: Readonly<{
    ergoHeight: number;
    sidechainHeight: number;
  }>): void;
}

export interface PegOutObservationCursorUpdate {
  readonly ergoHeight: number;
  readonly observedSidechainHeight: number;
  readonly observationComplete: boolean;
}

function assertHeight(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

/**
 * Persist a monotone burn-observation cursor after the complete daemon cycle.
 * An incomplete or skipped observation may update the Ergo tip, but it cannot
 * authorize skipping any sidechain height on the next inclusive scan.
 */
export function persistPegOutObservationCursor(
  state: PegOutObservationCursorStatePort,
  update: PegOutObservationCursorUpdate,
): number {
  assertHeight(update.ergoHeight, 'Ergo height');
  assertHeight(update.observedSidechainHeight, 'observed sidechain height');
  const previousSidechainHeight = state.getSyncState().latestSidechainHeight;
  assertHeight(previousSidechainHeight, 'persisted sidechain observation cursor');
  const nextSidechainHeight = update.observationComplete
    ? Math.max(previousSidechainHeight, update.observedSidechainHeight)
    : previousSidechainHeight;
  state.updateSyncState({
    ergoHeight: update.ergoHeight,
    sidechainHeight: nextSidechainHeight,
  });
  return nextSidechainHeight;
}
