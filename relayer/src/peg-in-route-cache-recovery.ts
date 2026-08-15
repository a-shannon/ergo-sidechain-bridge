/**
 * Replace the local peg-in route inventory from a fresh, complete two-source
 * Ergo observation. The cache is diagnostic/reconstructible state only and
 * cannot restore a mintable peg-in lifecycle row.
 */

import {
  reconstructPegInRouteFromDistinctSources,
  type PegInRouteReconstruction,
} from './peg-in-route-reconstruction.js';
import type { AssessPegInRouteObservationInput } from './peg-in-route-observation.js';
import type {
  PegInRouteReconstructionReplacementResult,
  StateTracker,
} from './state-tracker.js';

export const PEG_IN_ROUTE_CACHE_RECOVERY_SCHEMA =
  'e2s.peg-in-route-cache-recovery.v1';

const validatedReports = new WeakSet<object>();

export interface RecoverPegInRouteCacheInput extends AssessPegInRouteObservationInput {
  readonly stateTracker: StateTracker;
}

export interface PegInRouteCacheRecoveryReport {
  readonly schema: typeof PEG_IN_ROUTE_CACHE_RECOVERY_SCHEMA;
  readonly observedAt: string;
  readonly manifestId: string;
  readonly reconstructionDigestHex: string;
  readonly observationDigestHex: string;
  readonly observedTip: Readonly<{ height: number; idHex: string }>;
  readonly decision: PegInRouteReconstruction['decision'];
  readonly replacement: Readonly<PegInRouteReconstructionReplacementResult>;
  readonly counts: Readonly<{
    activeDeposits: number;
    activeCurrentDeposits: number;
    vaultHistoryBoxes: number;
    vaultCurrentBoxes: number;
    legacyRoutes: number;
    legacyCurrentBoxes: number;
  }>;
  readonly boundary: Readonly<{
    localDatabaseIsReplaceableCache: true;
    pegInLifecycleRowsCreatedOrChanged: false;
    mintEligibilityRestored: false;
    sidechainMintStateInferred: false;
    checkerSignerSubmitterOrBroadcastAuthorityCreated: false;
    routeActivationOrCutoverAuthorized: false;
  }>;
}

export async function recoverPegInRouteCache(
  input: RecoverPegInRouteCacheInput,
): Promise<PegInRouteCacheRecoveryReport> {
  const reconstruction = await reconstructPegInRouteFromDistinctSources(input);
  const replacement = input.stateTracker.replacePegInRouteReconstruction(reconstruction);
  if (replacement.pegInLifecycleRowsCreatedOrChanged !== 0) {
    throw new Error('peg-in route recovery attempted to create lifecycle authority');
  }
  const report = deepFreeze<PegInRouteCacheRecoveryReport>({
    schema: PEG_IN_ROUTE_CACHE_RECOVERY_SCHEMA,
    observedAt: reconstruction.observedAt,
    manifestId: reconstruction.manifest.manifestId,
    reconstructionDigestHex: reconstruction.reconstructionDigestHex,
    observationDigestHex: reconstruction.observationDigestHex,
    observedTip: { ...reconstruction.network.snapshot.tip },
    decision: reconstruction.decision,
    replacement,
    counts: {
      activeDeposits: reconstruction.activeHistory.length,
      activeCurrentDeposits: reconstruction.activeCurrentBoxIdsHex.length,
      vaultHistoryBoxes: reconstruction.vaultHistoryBoxIdsHex.length,
      vaultCurrentBoxes: reconstruction.vaultCurrentBoxIdsHex.length,
      legacyRoutes: reconstruction.legacyRoutes.length,
      legacyCurrentBoxes: reconstruction.legacyRoutes.reduce(
        (sum, route) => sum + route.currentBoxIdsHex.length,
        0,
      ),
    },
    boundary: {
      localDatabaseIsReplaceableCache: true,
      pegInLifecycleRowsCreatedOrChanged: false,
      mintEligibilityRestored: false,
      sidechainMintStateInferred: false,
      checkerSignerSubmitterOrBroadcastAuthorityCreated: false,
      routeActivationOrCutoverAuthorized: false,
    },
  });
  validatedReports.add(report);
  return report;
}

export function assertPegInRouteCacheRecoveryReportProvenance(
  value: unknown,
): asserts value is PegInRouteCacheRecoveryReport {
  if (!value || typeof value !== 'object' || !validatedReports.has(value)) {
    throw new Error('peg-in route cache recovery report provenance is missing');
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
