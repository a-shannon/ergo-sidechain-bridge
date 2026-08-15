/**
 * Reconstruct and atomically persist the complete Ergo/Frontier peg-in view.
 * The resulting SQLite state is replaceable inventory only and cannot create
 * or promote a mint lifecycle.
 */

import type { AssessPegInRouteObservationInput } from './peg-in-route-observation.js';
import {
  reconstructPegInRouteFromDistinctSources,
} from './peg-in-route-reconstruction.js';
import {
  reconstructPegInSidechainHistory,
  type PegInSidechainObservationSource,
  type PegInSidechainProfileV1,
  type PegInSidechainReconstruction,
} from './peg-in-sidechain-reconstruction.js';
import type {
  PegInJoinedReconstructionReplacementResult,
  StateTracker,
} from './state-tracker.js';

export const PEG_IN_JOINED_CACHE_RECOVERY_SCHEMA =
  'e2s.peg-in-joined-cache-recovery.v1';

const validatedReports = new WeakSet<object>();

export interface RecoverPegInJoinedCacheInput {
  readonly stateTracker: StateTracker;
  readonly ergoRouteObservation: AssessPegInRouteObservationInput;
  readonly profile: PegInSidechainProfileV1;
  readonly primaryFrontierSource: PegInSidechainObservationSource;
  readonly witnessFrontierSource: PegInSidechainObservationSource;
  readonly observedAt: string;
}

export interface PegInJoinedCacheRecoveryReport {
  readonly schema: typeof PEG_IN_JOINED_CACHE_RECOVERY_SCHEMA;
  readonly observedAt: string;
  readonly ergoRouteReconstructionDigestHex: string;
  readonly frontierViewDigestHex: string;
  readonly reconstructionDigestHex: string;
  readonly ergoObservedTip: Readonly<{ height: number; idHex: string }>;
  readonly frontierObservedTip: Readonly<{ height: number; idHex: string }>;
  readonly decision: PegInSidechainReconstruction['decision'];
  readonly replacement: Readonly<PegInJoinedReconstructionReplacementResult>;
  readonly counts: Readonly<{
    routeDeposits: number;
    routeVaultBoxes: number;
    crossChainEntries: number;
    observedMintEvents: number;
    issues: number;
  }>;
  readonly boundary: Readonly<{
    localDatabaseIsReplaceableCache: true;
    completeErgoRouteReobservedAfterFrontier: true;
    frontierSourcesRecheckedAfterErgo: true;
    pegInLifecycleRowsCreatedOrChanged: false;
    settlementAuthorityRowsCreatedOrChanged: false;
    mintEligibilityRestored: false;
    grandpaFinalityRestored: false;
    checkerSignerSubmitterOrBroadcastAuthorityCreated: false;
  }>;
}

export async function recoverPegInJoinedCache(
  input: RecoverPegInJoinedCacheInput,
): Promise<PegInJoinedCacheRecoveryReport> {
  const route = await reconstructPegInRouteFromDistinctSources(
    input.ergoRouteObservation,
  );
  const sidechain = await reconstructPegInSidechainHistory({
    profile: input.profile,
    ergoRoute: route,
    primarySource: input.primaryFrontierSource,
    witnessSource: input.witnessFrontierSource,
    ergoRouteReobservationInput: input.ergoRouteObservation,
    observedAt: input.observedAt,
  });
  const replacement = input.stateTracker.replacePegInJoinedReconstruction({
    routeReconstruction: route,
    sidechainReconstruction: sidechain,
  });
  if (
    replacement.pegInLifecycleRowsCreatedOrChanged !== 0
    || replacement.settlementAuthorityRowsCreatedOrChanged !== 0
  ) {
    throw new Error('joined peg-in recovery attempted to create lifecycle authority');
  }
  const report = deepFreeze<PegInJoinedCacheRecoveryReport>({
    schema: PEG_IN_JOINED_CACHE_RECOVERY_SCHEMA,
    observedAt: sidechain.observedAt,
    ergoRouteReconstructionDigestHex: route.reconstructionDigestHex,
    frontierViewDigestHex: sidechain.frontierViewDigestHex,
    reconstructionDigestHex: sidechain.reconstructionDigestHex,
    ergoObservedTip: { ...route.network.snapshot.tip },
    frontierObservedTip: { ...sidechain.observedTip },
    decision: sidechain.decision,
    replacement,
    counts: {
      routeDeposits: route.activeHistory.length,
      routeVaultBoxes: route.vaultHistoryBoxIdsHex.length,
      crossChainEntries: sidechain.entries.length,
      observedMintEvents: sidechain.entries.filter(entry => entry.event !== null).length,
      issues: sidechain.issues.length,
    },
    boundary: {
      localDatabaseIsReplaceableCache: true,
      completeErgoRouteReobservedAfterFrontier: true,
      frontierSourcesRecheckedAfterErgo: true,
      pegInLifecycleRowsCreatedOrChanged: false,
      settlementAuthorityRowsCreatedOrChanged: false,
      mintEligibilityRestored: false,
      grandpaFinalityRestored: false,
      checkerSignerSubmitterOrBroadcastAuthorityCreated: false,
    },
  });
  validatedReports.add(report);
  return report;
}

export function assertPegInJoinedCacheRecoveryReportProvenance(
  value: unknown,
): asserts value is PegInJoinedCacheRecoveryReport {
  if (!value || typeof value !== 'object' || !validatedReports.has(value)) {
    throw new Error('joined peg-in cache recovery report provenance is missing');
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
