import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { deriveTrustlessBurnIdHex } from '../../ergo-settlement-core/trustless-burn-id.js';
import { StateTracker } from '../../state-tracker.js';
import {
  assertSubstrateFederatedSourceLockedRecoveryTimelineV1,
  type SubstrateFederatedSourceLockedRecoveryTimelineV1,
} from '../../substrate-federated-authority-safe-devnet-acceptance-v1.js';
import {
  assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material,
  captureOwnedAuthoritySafeDevnetRecoveryTimelineV1,
  type OwnedAuthoritySafeDevnetProcessV1Input,
  type OwnedAuthoritySafeDevnetRecoveryTimelineV1ObservationInput,
} from '../../substrate-federated-authority-safe-devnet-process-v1.js';
import {
  assertSubstrateFederatedDualNodeRecoveryCompositionV1Receipt,
  composeSubstrateFederatedDualNodeRecoveryV1,
  type SubstrateFederatedDualNodeRecoveryCompositionV1Receipt,
} from './substrate-federated-dual-node-recovery-composition-v1.js';

export const SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_CAMPAIGN_V1_SCHEMA =
  'e2s.substrate-federated-dual-node-recovery-campaign.v1' as const;
export const SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_DRILL_V1_SCHEMA =
  'e2s.substrate-federated-dual-node-recovery-drill.v1' as const;

const CAMPAIGN_RECEIPTS = new WeakSet<object>();
const DRILL_RECEIPTS = new WeakSet<object>();
const SENTINEL_SIDECHAIN_ID_HEX = '11'.repeat(32);
const SENTINEL_TRANSACTION_HASH_HEX = '22'.repeat(32);
const SENTINEL_BLOCK_HASH_HEX = '33'.repeat(32);
const SENTINEL_USER = `0x${'44'.repeat(20)}`;
const SENTINEL_RECIPIENT = `02${'55'.repeat(32)}`;
const SENTINEL_LOG_INDEX = 0;
const SENTINEL_AMOUNT_NANOERG = 10_000_000n;
const SENTINEL_HEIGHT = 1;
const SENTINEL_BURN_ID_HEX = deriveTrustlessBurnIdHex({
  sidechainIdHex: SENTINEL_SIDECHAIN_ID_HEX,
  sidechainTxHashHex: SENTINEL_TRANSACTION_HASH_HEX,
  eventIndex: SENTINEL_LOG_INDEX,
});

export interface SubstrateFederatedDualNodeRecoveryDrillV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_DRILL_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'local_reconstructed_non_authorizing';
  readonly processBindingDigestHex: string;
  readonly lifecycleDigestHex: string;
  readonly timelineDigestHex: string;
  readonly recoveryInventoryDigestHex: string;
  readonly observedBurnCount: number;
  readonly databaseLifecycleDigestHex: string;
  readonly drillDigestHex: string;
  readonly checks: Readonly<{
    exactOwnedTimelineConsumed: true;
    deterministicDualSourceDisagreementRejected: true;
    fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true;
    physicalEphemeralDatabaseDeletedAndRecreated: true;
    preDeletionSentinelAbsentAfterRecreation: true;
    promotedRecoveryCompositionConsumed: true;
    replacementDatabaseReopenedUnderContinuityHold: true;
    noProcessDatabaseOrTransportCapabilityReturned: true;
  }>;
  readonly boundaries: Readonly<{
    sameOwnedProcessLifetimeEstablished: true;
    completeDatabaseDeletionObserved: true;
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

export interface SubstrateFederatedDualNodeRecoveryCampaignV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_CAMPAIGN_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'source_locked_reconstructed_non_authorizing';
  readonly acceptanceDigestHex: string;
  readonly nodeBinarySha256Hex: string;
  readonly acceptedTargetChainSpecSha256Hex: string;
  readonly recoveryDrillChainSpecSha256Hex: string;
  readonly sourceLockedTimelineReceiptDigestHex: string;
  readonly ownedTimelineReceiptDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly lifecycleDigestHex: string;
  readonly timelineDigestHex: string;
  readonly recoveryInventoryDigestHex: string;
  readonly observedBurnCount: number;
  readonly databaseLifecycleDigestHex: string;
  readonly localDrillDigestHex: string;
  readonly campaignDigestHex: string;
  readonly checks: Readonly<{
    exactSourceLockedTimelineConsumed: true;
    acceptedTargetAndRecoveryDrillIdentitiesBound: true;
    completeLifecycleDigestBound: true;
    exactOwnedTimelineConsumed: true;
    deterministicDualSourceDisagreementRejected: true;
    fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true;
    physicalEphemeralDatabaseDeletedAndRecreated: true;
    preDeletionSentinelAbsentAfterRecreation: true;
    promotedRecoveryCompositionConsumed: true;
    replacementDatabaseReopenedUnderContinuityHold: true;
    noProcessDatabaseOrTransportCapabilityReturned: true;
  }>;
  readonly boundaries:
    SubstrateFederatedDualNodeRecoveryDrillV1Receipt['boundaries'];
}

export async function runSubstrateFederatedDualNodeRecoveryDrillV1(
  input: Readonly<{
    process: Readonly<OwnedAuthoritySafeDevnetProcessV1Input>;
    observation:
      Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1ObservationInput>;
  }>,
): Promise<Readonly<SubstrateFederatedDualNodeRecoveryDrillV1Receipt>> {
  const material = await captureOwnedAuthoritySafeDevnetRecoveryTimelineV1(
    input,
  );
  return await runLocalRecoveryDrillFromOwnedTimelineV1(
    material,
  );
}

export async function runSubstrateFederatedDualNodeRecoveryCampaignFromTimelineV1(
  sourceLocked:
    Readonly<SubstrateFederatedSourceLockedRecoveryTimelineV1>,
): Promise<Readonly<SubstrateFederatedDualNodeRecoveryCampaignV1Receipt>> {
  assertSubstrateFederatedSourceLockedRecoveryTimelineV1(sourceLocked);
  const drill = await runLocalRecoveryDrillFromOwnedTimelineV1(
    sourceLocked.material,
  );
  if (
    drill.processBindingDigestHex
      !== sourceLocked.receipt.processBindingDigestHex
    || drill.lifecycleDigestHex !== sourceLocked.receipt.lifecycleDigestHex
  ) {
    throw new Error(
      'source-locked recovery campaign differs from its owned timeline',
    );
  }
  const campaignDigestHex = sha256Canonical({
    schema: SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_CAMPAIGN_V1_SCHEMA,
    acceptanceDigestHex: sourceLocked.receipt.acceptanceDigestHex,
    nodeBinarySha256Hex: sourceLocked.receipt.nodeBinarySha256Hex,
    acceptedTargetChainSpecSha256Hex:
      sourceLocked.receipt.acceptedTargetChainSpecSha256Hex,
    recoveryDrillChainSpecSha256Hex:
      sourceLocked.receipt.recoveryDrillChainSpecSha256Hex,
    sourceLockedTimelineReceiptDigestHex:
      sourceLocked.receipt.receiptDigestHex,
    ownedTimelineReceiptDigestHex:
      sourceLocked.receipt.timelineReceiptDigestHex,
    processBindingDigestHex: drill.processBindingDigestHex,
    lifecycleDigestHex: drill.lifecycleDigestHex,
    timelineDigestHex: drill.timelineDigestHex,
    recoveryInventoryDigestHex: drill.recoveryInventoryDigestHex,
    observedBurnCount: drill.observedBurnCount,
    databaseLifecycleDigestHex: drill.databaseLifecycleDigestHex,
    localDrillDigestHex: drill.drillDigestHex,
  });
  const receipt = deepFreeze({
    schema: SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_CAMPAIGN_V1_SCHEMA,
    version: 1 as const,
    status: 'source_locked_reconstructed_non_authorizing' as const,
    acceptanceDigestHex: sourceLocked.receipt.acceptanceDigestHex,
    nodeBinarySha256Hex: sourceLocked.receipt.nodeBinarySha256Hex,
    acceptedTargetChainSpecSha256Hex:
      sourceLocked.receipt.acceptedTargetChainSpecSha256Hex,
    recoveryDrillChainSpecSha256Hex:
      sourceLocked.receipt.recoveryDrillChainSpecSha256Hex,
    sourceLockedTimelineReceiptDigestHex:
      sourceLocked.receipt.receiptDigestHex,
    ownedTimelineReceiptDigestHex:
      sourceLocked.receipt.timelineReceiptDigestHex,
    processBindingDigestHex: drill.processBindingDigestHex,
    lifecycleDigestHex: drill.lifecycleDigestHex,
    timelineDigestHex: drill.timelineDigestHex,
    recoveryInventoryDigestHex: drill.recoveryInventoryDigestHex,
    observedBurnCount: drill.observedBurnCount,
    databaseLifecycleDigestHex: drill.databaseLifecycleDigestHex,
    localDrillDigestHex: drill.drillDigestHex,
    campaignDigestHex,
    checks: {
      exactSourceLockedTimelineConsumed: true as const,
      acceptedTargetAndRecoveryDrillIdentitiesBound: true as const,
      completeLifecycleDigestBound: true as const,
      ...drill.checks,
    },
    boundaries: drill.boundaries,
  });
  CAMPAIGN_RECEIPTS.add(receipt);
  return receipt;
}

async function runLocalRecoveryDrillFromOwnedTimelineV1(
  material: Awaited<
    ReturnType<typeof captureOwnedAuthoritySafeDevnetRecoveryTimelineV1>
  >,
): Promise<Readonly<SubstrateFederatedDualNodeRecoveryDrillV1Receipt>> {
  assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material(material);
  const recovered = await runPhysicalDatabaseLossRecovery(material);
  if (
    recovered.composition.lifecycleDigestHex
      !== material.receipt.lifecycleDigestHex
  ) {
    throw new Error('local recovery drill differs from its complete lifecycle');
  }
  const drillDigestHex = sha256Canonical({
    schema: SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_DRILL_V1_SCHEMA,
    processBindingDigestHex: material.receipt.processBindingDigestHex,
    lifecycleDigestHex: material.receipt.lifecycleDigestHex,
    observationAgreementDigestsHex:
      material.receipt.observationAgreementDigestsHex,
    timelineDigestHex: recovered.composition.timelineDigestHex,
    recoveryInventoryDigestHex:
      recovered.composition.recoveryInventoryDigestHex,
    observedBurnCount: recovered.composition.observedBurnCount,
    databaseLifecycleDigestHex: recovered.databaseLifecycleDigestHex,
  });
  const receipt = deepFreeze({
    schema: SUBSTRATE_FEDERATED_DUAL_NODE_RECOVERY_DRILL_V1_SCHEMA,
    version: 1 as const,
    status: 'local_reconstructed_non_authorizing' as const,
    processBindingDigestHex: material.receipt.processBindingDigestHex,
    lifecycleDigestHex: material.receipt.lifecycleDigestHex,
    timelineDigestHex: recovered.composition.timelineDigestHex,
    recoveryInventoryDigestHex:
      recovered.composition.recoveryInventoryDigestHex,
    observedBurnCount: recovered.composition.observedBurnCount,
    databaseLifecycleDigestHex: recovered.databaseLifecycleDigestHex,
    drillDigestHex,
    checks: {
      exactOwnedTimelineConsumed: true as const,
      deterministicDualSourceDisagreementRejected: true as const,
      fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true as const,
      physicalEphemeralDatabaseDeletedAndRecreated: true as const,
      preDeletionSentinelAbsentAfterRecreation: true as const,
      promotedRecoveryCompositionConsumed: true as const,
      replacementDatabaseReopenedUnderContinuityHold: true as const,
      noProcessDatabaseOrTransportCapabilityReturned: true as const,
    },
    boundaries: {
      sameOwnedProcessLifetimeEstablished: true as const,
      completeDatabaseDeletionObserved: true as const,
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
  DRILL_RECEIPTS.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedDualNodeRecoveryCampaignV1Receipt(
  value: unknown,
): asserts value is SubstrateFederatedDualNodeRecoveryCampaignV1Receipt {
  if (
    typeof value !== 'object'
    || value === null
    || !CAMPAIGN_RECEIPTS.has(value)
  ) {
    throw new Error('dual-node recovery campaign receipt provenance is missing');
  }
}

export function assertSubstrateFederatedDualNodeRecoveryDrillV1Receipt(
  value: unknown,
): asserts value is SubstrateFederatedDualNodeRecoveryDrillV1Receipt {
  if (typeof value !== 'object' || value === null || !DRILL_RECEIPTS.has(value)) {
    throw new Error('dual-node recovery drill receipt provenance is missing');
  }
}

async function runPhysicalDatabaseLossRecovery(
  material: Awaited<
    ReturnType<typeof captureOwnedAuthoritySafeDevnetRecoveryTimelineV1>
  >,
): Promise<Readonly<{
  composition: Readonly<SubstrateFederatedDualNodeRecoveryCompositionV1Receipt>;
  databaseLifecycleDigestHex: string;
}>> {
  const root = mkdtempSync(join(tmpdir(), 'e2s-dual-node-recovery-campaign-'));
  const runtimeDirectory = join(root, 'ephemeral-runtime');
  const databasePath = join(runtimeDirectory, 'state.sqlite');
  mkdirSync(runtimeDirectory, { mode: 0o700 });
  try {
    const first = new StateTracker(databasePath);
    try {
      first.insertPegOut(
        SENTINEL_TRANSACTION_HASH_HEX,
        SENTINEL_RECIPIENT,
        SENTINEL_AMOUNT_NANOERG,
        SENTINEL_HEIGHT,
        {
          user: SENTINEL_USER,
          sidechainId: SENTINEL_SIDECHAIN_ID_HEX,
          sidechainBlockHash: SENTINEL_BLOCK_HASH_HEX,
          sidechainLogIndex: SENTINEL_LOG_INDEX,
        },
      );
      if (first.getPegOutByBurnId(SENTINEL_BURN_ID_HEX) === undefined) {
        throw new Error('pre-deletion database sentinel was not persisted');
      }
    } finally {
      first.close();
    }
    const before = exactDatabaseIdentity(databasePath, 'pre-deletion database');

    rmSync(runtimeDirectory, {
      recursive: true,
      force: false,
      maxRetries: 5,
      retryDelay: 50,
    });
    if (existsSync(runtimeDirectory) || existsSync(databasePath)) {
      throw new Error('ephemeral recovery database was not physically deleted');
    }
    mkdirSync(runtimeDirectory, { mode: 0o700 });

    const replacement = new StateTracker(databasePath);
    let composition:
      Readonly<SubstrateFederatedDualNodeRecoveryCompositionV1Receipt>;
    try {
      if (replacement.getPegOutByBurnId(SENTINEL_BURN_ID_HEX) !== undefined) {
        throw new Error('pre-deletion sentinel survived database recreation');
      }
      composition = await composeSubstrateFederatedDualNodeRecoveryV1({
        process: material.process,
        lifecycle: material.lifecycle,
        sources: material.sources,
        snapshots: material.snapshots,
        state: replacement,
      });
      assertSubstrateFederatedDualNodeRecoveryCompositionV1Receipt(composition);
    } finally {
      replacement.close();
    }
    const after = exactDatabaseIdentity(databasePath, 'replacement database');
    if (before.digestHex === after.digestHex) {
      throw new Error('replacement database bytes equal the deleted database bytes');
    }

    const reopened = new StateTracker(databasePath);
    try {
      if (reopened.getPegOutByBurnId(SENTINEL_BURN_ID_HEX) !== undefined) {
        throw new Error('pre-deletion sentinel reappeared after database reopen');
      }
      const hold = reopened.getPegInCircuitBreakerState();
      if (!hold.open || !hold.continuityRecoveryRequired) {
        throw new Error('replacement database lost its continuity recovery hold');
      }
      if (
        Object.values(reopened.getSettlementAuthorityInventoryCounts())
          .some(count => count !== 0)
      ) {
        throw new Error('replacement database restored settlement authority');
      }
    } finally {
      reopened.close();
    }

    return Object.freeze({
      composition,
      databaseLifecycleDigestHex: sha256Canonical({
        schema: 'e2s.substrate-federated-physical-database-loss.v1',
        sentinelBurnIdHex: SENTINEL_BURN_ID_HEX,
        preDeletionDatabaseDigestHex: before.digestHex,
        preDeletionDatabaseBytes: before.sizeBytes,
        replacementDatabaseDigestHex: after.digestHex,
        replacementDatabaseBytes: after.sizeBytes,
      }),
    });
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

function exactDatabaseIdentity(
  path: string,
  label: string,
): Readonly<{ digestHex: string; sizeBytes: number }> {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`${label} is not a nonempty regular file`);
  }
  const bytes = readFileSync(path);
  if (bytes.byteLength !== stat.size) {
    throw new Error(`${label} changed while it was read`);
  }
  return Object.freeze({
    digestHex: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
  });
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
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
