/**
 * Rebuild the chain-derived authenticated V2 caches after restart or local DB
 * loss. This orchestration is deliberately non-authorizing: it does not build
 * candidates or restore checker, signer, submission, or broadcast state.
 */

import {
  reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources,
  type AuthenticatedSpvTrackerReconstruction,
} from './authenticated-spv-tracker-reconstruction.js';
import {
  reconstructAuthenticatedV2DupHistoryFromDistinctSources,
  type AuthenticatedV2DupReconstruction,
} from './authenticated-v2-dup-reconstruction.js';
import {
  reconstructAuthenticatedV2VaultForestFromDistinctSources,
  type AuthenticatedV2VaultChainSource,
  type AuthenticatedV2VaultReconstruction,
} from './authenticated-v2-vault-reconstruction.js';
import type {
  AuthenticatedV2RecoveryCacheReplacementResult,
  StateTracker,
} from './state-tracker.js';

export const AUTHENTICATED_V2_CACHE_RECOVERY_SCHEMA =
  'e2s.authenticated-v2-cache-recovery.v1';
export const AUTHENTICATED_V2_READ_ONLY_RECONSTRUCTION_SCHEMA =
  'e2s.authenticated-v2-read-only-reconstruction.v1';

const AUTHENTICATED_V2_CACHE_RECOVERY_REPORTS = new WeakSet<object>();
const AUTHENTICATED_V2_READ_ONLY_RECONSTRUCTIONS = new WeakSet<object>();

export interface ReconstructAuthenticatedV2ReadOnlyInput {
  readonly primarySource: AuthenticatedV2VaultChainSource;
  readonly witnessSource: AuthenticatedV2VaultChainSource;
  readonly trackerNftIdHex: string;
  readonly trackerErgoTreeHex: string;
  readonly expectedSidechainIdHex: string;
  readonly expectedTrackerGenesisBoxIdHex: string;
  readonly duplicatePreventionNftIdHex: string;
  readonly duplicatePreventionErgoTreeHex: string;
  readonly expectedNetwork: string;
  readonly vaultAddress: string;
  readonly vaultErgoTreeHex: string;
  readonly now?: () => Date;
}

export interface RecoverAuthenticatedV2CachesInput
  extends ReconstructAuthenticatedV2ReadOnlyInput {
  readonly stateTracker: StateTracker;
}

export interface AuthenticatedV2ReadOnlyReconstruction {
  readonly schema: typeof AUTHENTICATED_V2_READ_ONLY_RECONSTRUCTION_SCHEMA;
  readonly tracker: AuthenticatedSpvTrackerReconstruction;
  readonly duplicatePrevention: AuthenticatedV2DupReconstruction;
  readonly vault: AuthenticatedV2VaultReconstruction;
  readonly observedTip: Readonly<{
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  }>;
  readonly reconstructionDigests: Readonly<{
    tracker: string;
    duplicatePrevention: string;
    vault: string;
  }>;
  readonly boundary: Readonly<{
    dependencyOrderWasTrackerThenDupThenVault: true;
    sameStableErgoSnapshotVerified: true;
    localPersistenceWasNotReadOrWritten: true;
    noCandidateOrAttemptAuthorityCreated: true;
    noJvmCheckSignerSubmissionConfirmationOrBroadcastAuthority: true;
    distinctOriginsDetectDisagreementButDoNotProveConsensus: true;
  }>;
}

export interface AuthenticatedV2CacheRecoveryReport {
  readonly schema: typeof AUTHENTICATED_V2_CACHE_RECOVERY_SCHEMA;
  readonly observedTip: Readonly<{
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  }>;
  readonly reconstructionDigests: Readonly<{
    tracker: string;
    duplicatePrevention: string;
    vault: string;
  }>;
  readonly currentInputs: Readonly<{
    trackerBoxIdHex: string;
    duplicatePreventionBoxIdHex: string;
    vaultBoxIdsHex: readonly string[];
  }>;
  readonly replacement: Readonly<AuthenticatedV2RecoveryCacheReplacementResult>;
  readonly boundary: Readonly<{
    dependencyOrderWasTrackerThenDupThenVault: true;
    localDatabaseIsReplaceableCache: true;
    noCandidateOrAttemptAuthorityCreated: true;
    noJvmCheckSignerSubmissionConfirmationOrBroadcastAuthority: true;
    distinctOriginsDetectDisagreementButDoNotProveConsensus: true;
  }>;
}

export async function reconstructAuthenticatedV2ReadOnly(
  input: ReconstructAuthenticatedV2ReadOnlyInput,
): Promise<AuthenticatedV2ReadOnlyReconstruction> {
  const tracker = await reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources({
    primarySource: input.primarySource,
    witnessSource: input.witnessSource,
    trackerNftIdHex: input.trackerNftIdHex,
    trackerErgoTreeHex: input.trackerErgoTreeHex,
    expectedSidechainIdHex: input.expectedSidechainIdHex,
    expectedGenesisBoxIdHex: input.expectedTrackerGenesisBoxIdHex,
  });
  const duplicatePrevention = await reconstructAuthenticatedV2DupHistoryFromDistinctSources({
    primarySource: input.primarySource,
    witnessSource: input.witnessSource,
    duplicatePreventionNftIdHex: input.duplicatePreventionNftIdHex,
    duplicatePreventionErgoTreeHex: input.duplicatePreventionErgoTreeHex,
  });
  assertSameSnapshot(tracker, duplicatePrevention);
  const vault = await reconstructAuthenticatedV2VaultForestFromDistinctSources({
    primarySource: input.primarySource,
    witnessSource: input.witnessSource,
    expectedNetwork: input.expectedNetwork,
    vaultAddress: input.vaultAddress,
    vaultErgoTreeHex: input.vaultErgoTreeHex,
    duplicatePrevention,
    now: input.now,
  });
  assertVaultSnapshot(duplicatePrevention, vault);

  const reconstruction = deepFreeze<AuthenticatedV2ReadOnlyReconstruction>({
    schema: AUTHENTICATED_V2_READ_ONLY_RECONSTRUCTION_SCHEMA,
    tracker,
    duplicatePrevention,
    vault,
    observedTip: { ...tracker.observedTip },
    reconstructionDigests: {
      tracker: tracker.observationDigestHex,
      duplicatePrevention: duplicatePrevention.observationDigestHex,
      vault: vault.observationDigestHex,
    },
    boundary: {
      dependencyOrderWasTrackerThenDupThenVault: true as const,
      sameStableErgoSnapshotVerified: true as const,
      localPersistenceWasNotReadOrWritten: true as const,
      noCandidateOrAttemptAuthorityCreated: true as const,
      noJvmCheckSignerSubmissionConfirmationOrBroadcastAuthority: true as const,
      distinctOriginsDetectDisagreementButDoNotProveConsensus: true as const,
    },
  });
  AUTHENTICATED_V2_READ_ONLY_RECONSTRUCTIONS.add(reconstruction);
  return reconstruction;
}

export async function recoverAuthenticatedV2Caches(
  input: RecoverAuthenticatedV2CachesInput,
): Promise<AuthenticatedV2CacheRecoveryReport> {
  const reconstruction = await reconstructAuthenticatedV2ReadOnly(input);
  const {
    tracker,
    duplicatePrevention,
    vault,
  } = reconstruction;

  const replacement = input.stateTracker.replaceAuthenticatedV2RecoveryCaches({
    trackerReconstruction: tracker,
    duplicatePreventionReconstruction: duplicatePrevention,
    duplicatePreventionIdentity: {
      duplicatePreventionNftIdHex: input.duplicatePreventionNftIdHex,
      duplicatePreventionErgoTreeHex: input.duplicatePreventionErgoTreeHex,
    },
    vaultReconstruction: vault,
    vaultIdentity: {
      vaultAddress: input.vaultAddress,
      vaultErgoTreeHex: input.vaultErgoTreeHex,
    },
  });

  const report = deepFreeze<AuthenticatedV2CacheRecoveryReport>({
    schema: AUTHENTICATED_V2_CACHE_RECOVERY_SCHEMA,
    observedTip: { ...tracker.observedTip },
    reconstructionDigests: {
      tracker: tracker.observationDigestHex,
      duplicatePrevention: duplicatePrevention.observationDigestHex,
      vault: vault.observationDigestHex,
    },
    currentInputs: {
      trackerBoxIdHex: tracker.tipBoxId,
      duplicatePreventionBoxIdHex: duplicatePrevention.tipBoxIdHex,
      vaultBoxIdsHex: [...vault.currentUnspentBoxIdsHex].sort(),
    },
    replacement,
    boundary: {
      dependencyOrderWasTrackerThenDupThenVault: true as const,
      localDatabaseIsReplaceableCache: true as const,
      noCandidateOrAttemptAuthorityCreated: true as const,
      noJvmCheckSignerSubmissionConfirmationOrBroadcastAuthority: true as const,
      distinctOriginsDetectDisagreementButDoNotProveConsensus: true as const,
    },
  });
  AUTHENTICATED_V2_CACHE_RECOVERY_REPORTS.add(report);
  return report;
}

export function assertAuthenticatedV2ReadOnlyReconstructionProvenance(
  reconstruction: unknown,
): asserts reconstruction is AuthenticatedV2ReadOnlyReconstruction {
  if (
    typeof reconstruction !== 'object'
    || reconstruction === null
    || !AUTHENTICATED_V2_READ_ONLY_RECONSTRUCTIONS.has(reconstruction)
  ) {
    throw new Error('authenticated V2 read-only reconstruction provenance is missing');
  }
}

export function assertAuthenticatedV2CacheRecoveryReportProvenance(
  report: unknown,
): asserts report is AuthenticatedV2CacheRecoveryReport {
  if (
    typeof report !== 'object'
    || report === null
    || !AUTHENTICATED_V2_CACHE_RECOVERY_REPORTS.has(report)
  ) {
    throw new Error('authenticated V2 cache recovery report provenance is missing');
  }
}

function assertSameSnapshot(
  tracker: AuthenticatedSpvTrackerReconstruction,
  duplicatePrevention: AuthenticatedV2DupReconstruction,
): void {
  if (canonicalSnapshot(tracker.observedTip) !== canonicalSnapshot(duplicatePrevention.observedTip)) {
    throw new Error('tracker and DUP reconstructions were captured out of order');
  }
}

function assertVaultSnapshot(
  duplicatePrevention: AuthenticatedV2DupReconstruction,
  vault: AuthenticatedV2VaultReconstruction,
): void {
  if (
    canonicalSnapshot(duplicatePrevention.observedTip)
      !== canonicalSnapshot(vault.stableSnapshot.bestHeader)
    || duplicatePrevention.indexedHeight !== vault.stableSnapshot.indexedHeight
    || duplicatePrevention.fullHeight !== vault.stableSnapshot.fullHeight
  ) {
    throw new Error('DUP and vault reconstructions were captured out of order');
  }
  if (
    duplicatePrevention.observationDigestHex !== vault.duplicatePreventionObservationDigestHex
    || duplicatePrevention.tipBoxIdHex !== vault.duplicatePreventionTipBoxIdHex
  ) {
    throw new Error('vault reconstruction does not bind the recovered DUP identity');
  }
}

function canonicalSnapshot(value: Readonly<{
  idHex: string;
  parentIdHex: string;
  height: number;
  extensionRootHex: string;
}>): string {
  return JSON.stringify({
    idHex: value.idHex,
    parentIdHex: value.parentIdHex,
    height: value.height,
    extensionRootHex: value.extensionRootHex,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
