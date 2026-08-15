import { createHash } from 'node:crypto';

import {
  assertFrontierBackingReadAgreementCaptureOrder,
  assertFrontierBackingReadAgreementNodeIdentityBinding,
  assertFrontierBackingReadAgreementProvenance,
  type FrontierBackingReadAgreementSnapshot,
  type FrontierBackingReadAgreementSources,
} from '../../adapters/frontier-backing-read-agreement.js';
import {
  assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt,
  assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt,
  type OwnedAuthoritySafeDevnetRecoveryBestTipV1,
  type OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt,
  type OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt,
} from '../../substrate-federated-authority-safe-devnet-process-v1.js';
import {
  projectSubstrateFederatedDatabaseLossInventoryObservationV1,
  reconstructSubstrateFederatedDatabaseLossStateV1,
  type SubstrateFederatedDatabaseLossInventoryObservationV1,
  type SubstrateFederatedDatabaseLossRecoveryStateV1,
} from './substrate-federated-database-loss-recovery-v1.js';

export const SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_COMPOSITION_V1_SCHEMA =
  'e2s.substrate-federated-dual-node-recovery-composition.v1' as const;

const RECEIPTS = new WeakSet<object>();

export interface SubstrateFederatedDualNodeRecoverySnapshotsV1 {
  readonly initial: unknown;
  readonly lagRecovered: unknown;
  readonly restarted: unknown;
  readonly replacement: unknown;
}

export interface SubstrateFederatedDualNodeRecoveryCompositionV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_COMPOSITION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'reconstructed_non_authorizing';
  readonly processBindingDigestHex: string;
  readonly lifecycleDigestHex: string;
  readonly sourceIdsHex: readonly [string, string];
  readonly observationAgreementDigestsHex: readonly [
    string,
    string,
    string,
    string,
  ];
  readonly recoveryPin: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
  readonly replacementObservationPin:
    Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
  readonly recoveryInventoryDigestHex: string;
  readonly observedBurnCount: number;
  readonly timelineDigestHex: string;
  readonly checks: Readonly<{
    recoveryProcessProvenanceMatched: true;
    processIdentityBindingMatched: true;
    exactLifecyclePinsMatched: true;
    strictObservationOrderMatched: true;
    finalizedAnchorInventoryReconstructed: true;
    replacementObservedWithoutFinalityClaim: true;
    continuityHoldRetained: true;
    onlyInventoryAndHoldReconstructed: true;
    noProcessOrTransportCapabilityReturned: true;
  }>;
  readonly boundaries: Readonly<{
    sameOwnedProcessLifetimeEstablished: false;
    completeDatabaseDeletionObserved: false;
    independentAdministrationEstablished: false;
    sourceConsensusAuthenticated: false;
    sourceFinalityAuthenticated: false;
    localRecordAuthoritative: false;
    lifecycleAuthorityRestored: false;
    checkerAuthorityRestored: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    transportAuthorized: false;
    broadcastAuthorized: false;
    mintAuthorized: false;
    payoutAuthorized: false;
    fundsAuthorityEstablished: false;
  }>;
}

interface ProjectedTimelineSnapshotV1 {
  readonly snapshot: Readonly<FrontierBackingReadAgreementSnapshot>;
  readonly inventory:
    Readonly<SubstrateFederatedDatabaseLossInventoryObservationV1>;
}

export async function composeSubstrateFederatedDualNodeRecoveryV1(
  input: Readonly<{
    process: unknown;
    lifecycle: unknown;
    sources: FrontierBackingReadAgreementSources;
    snapshots: Readonly<SubstrateFederatedDualNodeRecoverySnapshotsV1>;
    state: SubstrateFederatedDatabaseLossRecoveryStateV1;
  }>,
): Promise<Readonly<SubstrateFederatedDualNodeRecoveryCompositionV1Receipt>> {
  assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt(input.process);
  assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt(input.lifecycle);
  const process: Readonly<OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt> =
    input.process;
  const lifecycle: Readonly<OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt> =
    input.lifecycle;
  if (process.processBindingDigestHex !== lifecycle.processBindingDigestHex) {
    throw new Error('dual-node recovery lifecycle differs from its process binding');
  }
  assertFrontierBackingReadAgreementNodeIdentityBinding(input.sources, {
    primaryNodeIdentityDigestHex: process.primaryPeerIdSha256Hex,
    witnessNodeIdentityDigestHex: process.witnessPeerIdSha256Hex,
  });
  assertLifecycleSequence(lifecycle);

  const initial = projectTimelineSnapshot(
    input.sources,
    input.snapshots.initial,
  );
  const lagRecovered = projectTimelineSnapshot(
    input.sources,
    input.snapshots.lagRecovered,
  );
  const restarted = projectTimelineSnapshot(
    input.sources,
    input.snapshots.restarted,
  );
  const replacement = projectTimelineSnapshot(
    input.sources,
    input.snapshots.replacement,
  );
  assertExactHeight(initial.inventory, lifecycle.initialAgreement, 'initial');
  assertExactHeight(
    lagRecovered.inventory,
    lifecycle.lagRecovery.recoveredAgreement,
    'lag-recovered',
  );
  assertExactHeight(
    restarted.inventory,
    lifecycle.connectedRestart.after,
    'connected-restart',
  );
  assertExactHeight(
    replacement.inventory,
    lifecycle.emptyTailReplacement.replacementTip,
    'replacement',
  );
  assertExactHeight(
    initial.inventory,
    lifecycle.emptyTailReplacement.finalizedAnchor,
    'finalized-anchor',
  );
  assertFrontierBackingReadAgreementCaptureOrder(input.sources, [
    input.snapshots.initial,
    input.snapshots.lagRecovered,
    input.snapshots.restarted,
    input.snapshots.replacement,
  ]);
  assertStrictObservationOrder([
    initial.inventory,
    lagRecovered.inventory,
    restarted.inventory,
    replacement.inventory,
  ]);

  const recoveryPin = lifecycle.emptyTailReplacement.finalizedAnchor;
  const replacementObservationPin =
    lifecycle.emptyTailReplacement.replacementTip;
  const recovery = await reconstructSubstrateFederatedDatabaseLossStateV1({
    cycle: {
      sidechainFinalizedNativeHeight: recoveryPin.height,
      sidechainFinalizedNativeBlockHashHex: recoveryPin.blockHashHex,
      sidechainFinalizedExecutionBlockHashHex:
        initial.inventory.pinnedBlockHashHex,
    },
    state: input.state,
    collectCompleteBurnInventory: async () => initial.inventory,
  });
  if (
    recovery.inventory.pinnedHeight !== recoveryPin.height
    || recovery.inventory.pinnedBlockHashHex
      !== initial.inventory.pinnedBlockHashHex
    || recovery.inventory.observedCount
      !== initial.snapshot.observedPegOutCount
  ) {
    throw new Error(
      'dual-node recovery result differs from the finalized-anchor snapshot',
    );
  }
  const observationAgreementDigestsHex = Object.freeze([
    initial.snapshot.agreementDigestHex,
    lagRecovered.snapshot.agreementDigestHex,
    restarted.snapshot.agreementDigestHex,
    replacement.snapshot.agreementDigestHex,
  ]) as readonly [string, string, string, string];
  const lifecycleDigestHex =
    substrateFederatedDualNodeRecoveryLifecycleDigestV1(lifecycle);
  const timelineDigestHex = sha256Canonical({
    schema: SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_COMPOSITION_V1_SCHEMA,
    processBindingDigestHex: process.processBindingDigestHex,
    lifecycleDigestHex,
    sourceIdsHex: input.sources.sourceIdsHex,
    observationAgreementDigestsHex,
    recoveryPin,
    replacementObservationPin,
    recoveryInventoryDigestHex: initial.snapshot.inventoryDigestHex,
    observedBurnCount: recovery.inventory.observedCount,
  });
  const receipt = deepFreeze({
    schema: SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_COMPOSITION_V1_SCHEMA,
    version: 1 as const,
    status: 'reconstructed_non_authorizing' as const,
    processBindingDigestHex: process.processBindingDigestHex,
    lifecycleDigestHex,
    sourceIdsHex: input.sources.sourceIdsHex,
    observationAgreementDigestsHex,
    recoveryPin,
    replacementObservationPin,
    recoveryInventoryDigestHex: initial.snapshot.inventoryDigestHex,
    observedBurnCount: recovery.inventory.observedCount,
    timelineDigestHex,
    checks: {
      recoveryProcessProvenanceMatched: true as const,
      processIdentityBindingMatched: true as const,
      exactLifecyclePinsMatched: true as const,
      strictObservationOrderMatched: true as const,
      finalizedAnchorInventoryReconstructed: true as const,
      replacementObservedWithoutFinalityClaim: true as const,
      continuityHoldRetained: true as const,
      onlyInventoryAndHoldReconstructed: true as const,
      noProcessOrTransportCapabilityReturned: true as const,
    },
    boundaries: {
      sameOwnedProcessLifetimeEstablished: false as const,
      completeDatabaseDeletionObserved: false as const,
      independentAdministrationEstablished: false as const,
      sourceConsensusAuthenticated: false as const,
      sourceFinalityAuthenticated: false as const,
      localRecordAuthoritative: false as const,
      lifecycleAuthorityRestored: false as const,
      checkerAuthorityRestored: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      transportAuthorized: false as const,
      broadcastAuthorized: false as const,
      mintAuthorized: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
    },
  });
  RECEIPTS.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedDualNodeRecoveryCompositionV1Receipt(
  value: unknown,
): asserts value is SubstrateFederatedDualNodeRecoveryCompositionV1Receipt {
  if (typeof value !== 'object' || value === null || !RECEIPTS.has(value)) {
    throw new Error('dual-node recovery composition receipt provenance is missing');
  }
}

function projectTimelineSnapshot(
  sources: FrontierBackingReadAgreementSources,
  value: unknown,
): Readonly<ProjectedTimelineSnapshotV1> {
  assertFrontierBackingReadAgreementProvenance(sources, value);
  const snapshot: Readonly<FrontierBackingReadAgreementSnapshot> = value;
  return Object.freeze({
    snapshot,
    inventory: projectSubstrateFederatedDatabaseLossInventoryObservationV1({
      sources,
      snapshot,
    }),
  });
}

function assertLifecycleSequence(
  lifecycle: Readonly<OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt>,
): void {
  assertSameTip(
    lifecycle.initialAgreement,
    lifecycle.lagRecovery.before,
    'initial and lag-start tips differ',
  );
  assertSameTip(
    lifecycle.initialAgreement,
    lifecycle.emptyTailReplacement.finalizedAnchor,
    'initial tip and retained finalized anchor differ',
  );
  assertSameTip(
    lifecycle.lagRecovery.primaryWhileWitnessStopped,
    lifecycle.lagRecovery.recoveredAgreement,
    'lagged primary and recovered witness tips differ',
  );
  if (
    lifecycle.lagRecovery.recoveredAgreement.height
      !== lifecycle.initialAgreement.height + lifecycle.lagRecovery.lagBlocks
  ) {
    throw new Error('dual-node recovery lag height differs from its fixed policy');
  }
  assertSameTip(
    lifecycle.lagRecovery.recoveredAgreement,
    lifecycle.connectedRestart.before,
    'lag recovery and restart-start tips differ',
  );
  assertSameTip(
    lifecycle.connectedRestart.before,
    lifecycle.connectedRestart.after,
    'connected restart changed the canonical tip',
  );
  assertSameTip(
    lifecycle.connectedRestart.after,
    lifecycle.emptyTailReplacement.commonParent,
    'restart and replacement-parent tips differ',
  );
  const replacement = lifecycle.emptyTailReplacement;
  if (
    replacement.abandonedTip.height !== replacement.commonParent.height + 1
    || replacement.replacementAtAbandonedHeight.height
      !== replacement.abandonedTip.height
    || replacement.replacementAtAbandonedHeight.blockHashHex
      === replacement.abandonedTip.blockHashHex
    || replacement.replacementTip.height !== replacement.abandonedTip.height + 1
    || replacement.finalizedAnchor.height >= replacement.abandonedTip.height
  ) {
    throw new Error('dual-node recovery tail replacement sequence is invalid');
  }
}

function assertExactHeight(
  observation: Readonly<SubstrateFederatedDatabaseLossInventoryObservationV1>,
  expected: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  label: string,
): void {
  if (observation.pinnedHeight !== expected.height) {
    throw new Error(`${label} inventory snapshot differs from the lifecycle pin`);
  }
}

function assertStrictObservationOrder(
  observations: readonly SubstrateFederatedDatabaseLossInventoryObservationV1[],
): void {
  if (
    observations.length !== 4
    || observations[1].pinnedHeight <= observations[0].pinnedHeight
    || observations[2].pinnedHeight !== observations[1].pinnedHeight
    || observations[2].pinnedBlockHashHex !== observations[1].pinnedBlockHashHex
    || observations[3].pinnedHeight <= observations[2].pinnedHeight
  ) {
    throw new Error('dual-node recovery observations are out of order');
  }
}

function assertSameTip(
  left: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  right: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  message: string,
): void {
  if (
    left.height !== right.height
    || left.blockHashHex !== right.blockHashHex
  ) {
    throw new Error(message);
  }
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

export function substrateFederatedDualNodeRecoveryLifecycleDigestV1(
  lifecycle: unknown,
): string {
  return sha256Canonical(lifecycle);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
