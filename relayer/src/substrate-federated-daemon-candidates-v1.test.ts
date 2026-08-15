import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import blakejs from 'blakejs';
import { describe, expect, it, vi } from 'vitest';

import type {
  AuthenticatedSettlementCandidateStateTracker,
} from './adapters/authenticated-settlement-candidate-journal.js';
import {
  assertSubstrateFederatedCandidatePreparationV1,
} from './adapters/substrate-federated-candidate-provenance-v1.js';
import {
  createPegOutBackingInventoryPersistence,
} from './adapters/peg-out-backing-inventory-state.js';
import {
  collectSubstrateFederatedMintReservationProducerV1,
  createSubstrateFederatedMintReservationSourcePairV1,
} from './substrate-federated-mint-reservation-producer-v1.js';
import {
  runSubstrateFederatedCandidateIntegrationV1,
} from './apps/bridge-daemon/substrate-federated-candidate-integration-v1.js';
import {
  reconstructSubstrateFederatedDatabaseLossStateV1,
  type SubstrateFederatedDatabaseLossInventoryObservationV1,
  type SubstrateFederatedDatabaseLossRecoveryV1Result,
} from './apps/bridge-daemon/substrate-federated-database-loss-recovery-v1.js';
import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  deriveTrustlessBurnIdHex,
} from './ergo-settlement-core/trustless-burn-id.js';
import {
  encodeRuntimeBridgeCommitmentScaleHex,
} from './finalized-bridge-checkpoint.js';
import {
  reconcileCompletePegOutBackingInventory,
  type PegOutBackingInventoryPersistencePort,
} from './relayer-core/peg-out-backing-inventory.js';
import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointProfileV1Input,
  type SubstrateFederatedCheckpointStatementV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedBurnSettlementV1FixtureInput,
  buildSubstrateFederatedBurnSettlementV1FixturePacket,
  getSubstrateFederatedSettlementFamilyV1FixtureIdentity,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import {
  buildSubstrateFederatedBurnSettlementV1,
} from './substrate-federated-burn-settlement-v1.js';
import {
  collectSubstrateFederatedCheckpointTrackerProducerV1,
  createSubstrateFederatedCheckpointTrackerSourceSetV1,
  type SubstrateFederatedTrackerErgoSourceV1,
} from './substrate-federated-checkpoint-tracker-producer-v1.js';
import {
  collectSubstrateFederatedSettlementPredecessorProducerV1,
  createSubstrateFederatedSettlementPredecessorSourceSetV1,
  type SubstrateFederatedSettlementPredecessorErgoSourceV1,
} from './substrate-federated-settlement-predecessor-producer-v1.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
} from './substrate-federated-settlement-family-v1.js';
import {
  ReadOnlySubstrateFinalityRpc,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';
import {
  ACTIVE_SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1,
  SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1_SCHEMA,
  revalidateSubstrateFederatedDaemonSchedulingObservationV1,
  runSubstrateFederatedDaemonSchedulingV1,
  type SubstrateFederatedDaemonSchedulingObservationV1,
  type SubstrateFederatedDaemonSchedulingProfileV1,
} from './substrate-federated-daemon-scheduling-v1.js';
import {
  SubstrateFederatedDaemonLifecycleIncidentPersistenceErrorV1,
  SubstrateFederatedDaemonLifecycleProcessHoldErrorV1,
  runSubstrateFederatedDaemonLifecycleV1,
} from './substrate-federated-daemon-lifecycle-v1.js';
import {
  runSubstrateFederatedPreReleaseContainmentV1,
} from './substrate-federated-pre-release-containment-v1.js';
import {
  buildSubstrateFederatedDaemonCandidatesV1,
  type SubstrateFederatedBurnDaemonCandidateV1,
} from './substrate-federated-daemon-candidates-v1.js';
import { StateTracker } from './state-tracker.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  deriveValidityApplicationPooledReserveMintIdentityV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  type ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

interface MintVector {
  readonly expected: { readonly statementHex: string };
}

interface TrackerVector {
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement: Omit<
      SubstrateFederatedCheckpointStatementV1Input,
      'profile'
    >;
  };
}

const MINT_VECTOR = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json',
    import.meta.url,
  ),
  'utf8',
)) as MintVector;
const TRACKER_VECTOR = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/substrate-federated-v1-tracker-admission.json',
    import.meta.url,
  ),
  'utf8',
)) as TrackerVector;

const SCHEDULING_CYCLE = Object.freeze({
  ergoHeight: 1_038,
  ergoHeaderIdHex: '90'.repeat(32),
  sidechainFinalizedNativeHeight: 2_500,
  sidechainFinalizedNativeBlockHashHex: '44'.repeat(32),
  pegOutObservationComplete: true as const,
});

const DATABASE_LOSS_EXECUTION_BLOCK_HASH_HEX = '55'.repeat(32);

const SETTLEMENT_AUTHORITY_COUNT_KEYS = Object.freeze([
  'pegInEvents',
  'pegInMintTransportAttempts',
  'aggregateSettlementAttempts',
  'authenticatedSettlementCandidates',
  'authenticatedSettlementExecutionReservations',
  'authenticatedSettlementSubmissionAttempts',
  'ergoOperationalTransactionAttempts',
  'pendingDupHeartbeats',
] as const);
const CURRENT_INPUT_REVALIDATION_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_CURRENT_INPUT_REVALIDATION_V1';
const FEDERATED_MINT_SOURCE_PROOF_SYSTEM_ID = `0x${'77'.repeat(32)}`;
const FEDERATED_MINT_SOURCE_PROOF_PROFILE_ID = `0x${'88'.repeat(32)}`;
const FEDERATED_MINT_RUNTIME_CODE_HEX = '0x01020304';
const FEDERATED_MINT_RUNTIME_CODE_SHA256 = createHash('sha256')
  .update(Buffer.from(FEDERATED_MINT_RUNTIME_CODE_HEX.slice(2), 'hex'))
  .digest('hex');
const FEDERATED_MINT_FINALIZED_HEAD = `0x${'44'.repeat(32)}`;
const FEDERATED_MINT_FINALIZED_HEIGHT =
  SCHEDULING_CYCLE.sidechainFinalizedNativeHeight;

async function buildCandidates(options: Readonly<{
  mintReservationExpiresBeforeLastUse?: boolean;
  checkpointTargetReplacedBeforeLastUse?: boolean;
  onMintLastUseRecollection?: () => void;
  sourceGenerationConflictActive?: () => boolean;
}> = {}) {
  const familyIdentity =
    getSubstrateFederatedSettlementFamilyV1FixtureIdentity();
  const family = decodeSubstrateFederatedSettlementFamilyV1Profile(
    familyIdentity.profile,
  );
  const settlementPacket =
    await buildSubstrateFederatedBurnSettlementV1FixturePacket();
  const checkpointProfile = buildSubstrateFederatedCheckpointProfileV1(
    TRACKER_VECTOR.input.profile,
  );
  const checkpointStatement = buildSubstrateFederatedCheckpointStatementV1({
    profile: checkpointProfile,
    ...TRACKER_VECTOR.input.statement,
    bridgeEventRootHex:
      settlementPacket.tracker.decodedValue.bridgeEventRootHex,
    burnLeafCount: settlementPacket.tracker.decodedValue.burnLeafCount,
  });
  const mintReservationStatement = compatibleMintReservation(family);
  const mintProducer = await buildMintProducer(
    mintReservationStatement,
    familyIdentity.profile.familyIdHex,
    {
      expiresBeforeLastUse:
        options.mintReservationExpiresBeforeLastUse ?? false,
      onLastUseRecollection: options.onMintLastUseRecollection,
    },
  );
  const checkpointProducer = await buildCheckpointProducer({
    checkpointProfile,
    checkpointStatement,
    familyIdentity,
    settlementPacket,
  }, {
    targetReplacedBeforeLastUse:
      options.checkpointTargetReplacedBeforeLastUse ?? false,
    sourceGenerationConflictActive:
      options.sourceGenerationConflictActive,
  });
  const settlementPredecessorProducer =
    await buildSettlementPredecessorProducer({
      familyIdentity,
      settlementPacket,
    });
  return {
    candidates: buildSubstrateFederatedDaemonCandidatesV1({
      mintReservationStatement,
      checkpointProfile,
      checkpointStatement,
      familyIdentity,
      settlementPacket,
    }),
    familyIdentity,
    settlementPacket,
    checkpointProfile,
    checkpointStatement,
    mintReservationStatement,
    mintProducer,
    checkpointProducer,
    settlementPredecessorProducer,
  };
}

function compatibleMintReservation(
  family: ReturnType<typeof decodeSubstrateFederatedSettlementFamilyV1Profile>,
): ValidityApplicationPooledReserveMintReservationStatementV4 {
  const baseline =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      MINT_VECTOR.expected.statementHex,
    );
  const baselineIntent = decodePegInSourceIntentV2Hex(
    baseline.sourceIntentHex,
  );
  const sourceIntent = {
    ...baselineIntent,
    sourceNetworkIdHex: family.sourceNetworkIdHex,
    sidechainIdHex: family.sidechainIdHex,
    bridgeAddressHex: family.bridgeAddressHex,
    tokenAddressHex: family.tokenAddressHex,
    settlementProfileIdHex: family.settlementProfileIdHex,
    sourceAssetIdHex: family.settlementAssetIdHex,
  };
  const sourceIntentHex = encodePegInSourceIntentV2Hex(sourceIntent);
  return {
    ...baseline,
    sourceIntentHex,
    sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(sourceIntent),
    mintIdentityHex: deriveValidityApplicationPooledReserveMintIdentityV4Hex({
      lineageProfileIdHex: baseline.lineageProfileIdHex,
      sourceLockBoxIdHex: baseline.sourceLockBoxIdHex,
      depositCommitmentHex: baseline.depositCommitmentHex,
    }),
  };
}

function mintObservation(
  mint: Awaited<ReturnType<typeof buildCandidates>>['candidates']['mint'],
) {
  return {
    statementIdHex: mint.statementIdHex,
    reservationKeyHex: mint.reservationKeyHex,
    lineageProfileIdHex: mint.lineageProfileIdHex,
    familyIdHex: mint.familyIdHex,
    targetHeaderIdHex: mint.targetHeaderIdHex,
    targetHeight: mint.targetHeight,
    lifecycleStatus: 'pending' as const,
    classification: 'pending_hold' as const,
    observationDigestHex: 'aa'.repeat(32),
    localObservationAuthoritative: false as const,
    mintAuthorized: false as const,
  };
}

function settlementState(
  burn: SubstrateFederatedBurnDaemonCandidateV1,
  settlementPacket: Awaited<ReturnType<typeof buildCandidates>>['settlementPacket'],
  invalidated = vi.fn(),
  reverted: AuthenticatedSettlementCandidateStateTracker<
    SubstrateFederatedBurnDaemonCandidateV1
  >['markPegOutBurnRevertedAndInvalidateCandidates'] = () => {
    throw new Error('confirmed burn must not be marked reverted');
  },
): AuthenticatedSettlementCandidateStateTracker<
  SubstrateFederatedBurnDaemonCandidateV1
> {
  return {
    getActiveAuthenticatedSettlementCandidates: () => [burn],
    getPegOutByBurnId: burnId => burnId === burn.burnId
      ? {
        sidechainBurnTxHash: settlementPacket.burn.leaf.sidechainTxHashHex,
        ergoRecipientAddress: settlementPacket.burn.recipientErgoTreeHex,
        amountNanoErg: BigInt(settlementPacket.burn.leaf.amountNanoErg),
        sidechainBurnHeight: Number(
          settlementPacket.tracker.decodedValue.sourceNativeBlockHeight,
        ),
        sidechainBlockHash:
          settlementPacket.burn.leaf.sidechainBlockHashHex,
        sidechainLogIndex: settlementPacket.burn.leaf.eventIndex,
        user: 'federated-runtime-observation',
      }
      : undefined,
    invalidateAuthenticatedSettlementCandidate: invalidated,
    markPegOutBurnRevertedAndInvalidateCandidates: reverted,
  };
}

function databaseLossSettlementState(
  state: StateTracker,
): AuthenticatedSettlementCandidateStateTracker<
  SubstrateFederatedBurnDaemonCandidateV1
> {
  return {
    getActiveAuthenticatedSettlementCandidates: () => [],
    getPegOutByBurnId: burnId => state.getPegOutByBurnId(burnId),
    invalidateAuthenticatedSettlementCandidate: (candidateId, reason) =>
      state.invalidateAuthenticatedSettlementCandidate(candidateId, reason),
    markPegOutBurnRevertedAndInvalidateCandidates: (lookup, reason) =>
      state.markPegOutBurnRevertedAndInvalidateCandidates(lookup, reason),
  };
}

function databaseLossInventoryObservation(
  fixture: Awaited<ReturnType<typeof buildCandidates>>,
): Readonly<SubstrateFederatedDatabaseLossInventoryObservationV1> {
  return Object.freeze({
    scanFromHeight: 0 as const,
    pinnedHeight: SCHEDULING_CYCLE.sidechainFinalizedNativeHeight,
    pinnedBlockHashHex: DATABASE_LOSS_EXECUTION_BLOCK_HASH_HEX,
    entries: Object.freeze([{
      burnIdHex: normalizeFixtureHex(fixture.candidates.burn.burnId),
      sidechainIdHex: normalizeFixtureHex(fixture.candidates.burn.sidechainId),
      sidechainTransactionHashHex: normalizeFixtureHex(
        fixture.settlementPacket.burn.leaf.sidechainTxHashHex,
      ),
      sidechainBlockHashHex: normalizeFixtureHex(
        fixture.settlementPacket.burn.leaf.sidechainBlockHashHex,
      ),
      sidechainLogIndex: fixture.settlementPacket.burn.leaf.eventIndex,
      sidechainBurnHeight: Number(
        fixture.settlementPacket.tracker.decodedValue.sourceNativeBlockHeight,
      ),
      amountNanoErg: BigInt(
        fixture.settlementPacket.burn.leaf.amountNanoErg,
      ),
      ergoRecipientAddress:
        fixture.settlementPacket.burn.recipientErgoTreeHex,
      user: 'federated-runtime-observation',
    }]),
  });
}

function normalizeFixtureHex(value: string): string {
  return value.replace(/^0x/i, '').toLowerCase();
}

function databaseLossExpectedWork(
  fixture: Awaited<ReturnType<typeof buildCandidates>>,
) {
  const burn = databaseLossInventoryObservation(fixture).entries[0];
  return Object.freeze({
    burn,
    candidateIdHex: normalizeFixtureHex(fixture.candidates.burn.candidateId),
    settlementTransactionIdHex: normalizeFixtureHex(
      fixture.candidates.burn.settlementTransactionIdHex,
    ),
  });
}

async function withDeletedFederatedLifecycleState<T>(
  fixture: Awaited<ReturnType<typeof buildCandidates>>,
  run: (
    replacement: StateTracker,
    observation: Readonly<
      SubstrateFederatedDatabaseLossInventoryObservationV1
    >,
  ) => Promise<T>,
): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'e2s-fed-4b1b-'));
  const runtimeDirectory = join(directory, 'runtime');
  mkdirSync(runtimeDirectory);
  const dbPath = join(runtimeDirectory, 'state.sqlite');
  const observation = databaseLossInventoryObservation(fixture);
  const burn = observation.entries[0];
  const first = new StateTracker(dbPath);
  try {
    first.insertPegOut(
      burn.sidechainTransactionHashHex,
      burn.ergoRecipientAddress,
      burn.amountNanoErg,
      burn.sidechainBurnHeight,
      {
        user: burn.user,
        sidechainId: burn.sidechainIdHex,
        sidechainBlockHash: burn.sidechainBlockHashHex,
        sidechainLogIndex: burn.sidechainLogIndex,
      },
    );
    first.updatePegOutStatus({ burnId: burn.burnIdHex }, 'confirmed');
    if (first.getPegOutByBurnId(burn.burnIdHex)?.status !== 'confirmed') {
      throw new Error(
        'FED-4B1b fixture did not create lifecycle-bearing peg-out state',
      );
    }
  } finally {
    first.close();
  }

  rmSync(runtimeDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
  mkdirSync(runtimeDirectory);

  const replacement = new StateTracker(dbPath);
  try {
    if (replacement.getPegOutByBurnId(burn.burnIdHex) !== undefined) {
      throw new Error('FED-4B1b replacement retained the deleted peg-out row');
    }
    return await run(replacement, observation);
  } finally {
    replacement.close();
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}

function candidateProducerInputs(
  fixture: Awaited<ReturnType<typeof buildCandidates>>,
) {
  return {
    mint: fixture.mintProducer,
    checkpoint: fixture.checkpointProducer,
    settlementPredecessors: fixture.settlementPredecessorProducer,
    familyIdentity: fixture.familyIdentity,
    settlementPacket: fixture.settlementPacket,
  };
}

async function buildMintProducer(
  statement: ValidityApplicationPooledReserveMintReservationStatementV4,
  familyIdHex: string,
  options: Readonly<{
    expiresBeforeLastUse?: boolean;
    onLastUseRecollection?: () => void;
  }> = {},
) {
  const sourceIntent = decodePegInSourceIntentV2Hex(statement.sourceIntentHex);
  const runtimeProfileScaleHex =
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex({
      formatVersion: 4,
      lineageProfileIdHex: statement.lineageProfileIdHex,
      sourceNetworkIdHex: sourceIntent.sourceNetworkIdHex,
      sidechainIdHex: sourceIntent.sidechainIdHex,
      bridgeAddressHex: sourceIntent.bridgeAddressHex,
      tokenAddressHex: sourceIntent.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex: `0x${'b1'.repeat(32)}`,
      bridgeRuntimeCodeBytes: 4_096,
      tokenRuntimeCodeSha256Hex: `0x${'b2'.repeat(32)}`,
      tokenRuntimeCodeBytes: 2_048,
      settlementProfileIdHex: sourceIntent.settlementProfileIdHex,
      ergoDepositFinalityPolicyIdHex:
        statement.ergoDepositFinalityPolicyIdHex,
      sourceProofSystemIdHex: FEDERATED_MINT_SOURCE_PROOF_SYSTEM_ID,
      sourceProofProfileIdHex: FEDERATED_MINT_SOURCE_PROOF_PROFILE_ID,
      activationHeight: '1',
      maxPendingBlocks: 20,
    });
  const runtimeProfileIdHex =
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(
      runtimeProfileScaleHex,
    );
  const statementHex =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statement,
    );
  const statementIdHex =
    deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
      statement,
    );
  const reservationKeyHex = `0x${statement.mintIdentityHex.replace(/^0x/, '')}`;
  const storageKeys =
    derivePooledReserveMintReservationRuntimeStorageKeysV4(
      reservationKeyHex,
    );
  const pending = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(runtimeProfileIdHex.slice(2), 'hex'),
    Buffer.from([0x6d, 0x09]),
    Buffer.from(statementHex.slice(2), 'hex'),
    Buffer.from(statementIdHex.slice(2), 'hex'),
    Buffer.from(reservationKeyHex.slice(2), 'hex'),
    Buffer.from(blake2b256Hex(Buffer.from(statementHex.slice(2), 'hex')), 'hex'),
    Buffer.alloc(32, 0x77),
    Buffer.alloc(32, 0x88),
    uint64Le(BigInt(FEDERATED_MINT_FINALIZED_HEIGHT - 11)),
    Buffer.alloc(32, 0x91),
    Buffer.alloc(32, 0x92),
    Buffer.alloc(32, 0x93),
    uint64Le(BigInt(FEDERATED_MINT_FINALIZED_HEIGHT - 10)),
    uint64Le(BigInt(FEDERATED_MINT_FINALIZED_HEIGHT + 5)),
  ]);
  const values = new Map<string, string | null>([
    [storageKeys.runtimeCodeStorageKeyHex, FEDERATED_MINT_RUNTIME_CODE_HEX],
    [storageKeys.currentProfileStorageKeyHex, runtimeProfileScaleHex],
    [storageKeys.enforcementStorageKeyHex, '0x01'],
    [storageKeys.pendingKeysStorageKeyHex, `0x04${reservationKeyHex.slice(2)}`],
    [storageKeys.pendingReservationStorageKeyHex, `0x${pending.toString('hex')}`],
    [storageKeys.consumedReservationStorageKeyHex, null],
    [storageKeys.invalidatedReservationStorageKeyHex, null],
  ]);
  const replacementValues = new Map(values);
  if (options.expiresBeforeLastUse) {
    const expiredPending = Buffer.from(pending);
    expiredPending.writeBigUInt64LE(
      BigInt(FEDERATED_MINT_FINALIZED_HEIGHT - 20),
      expiredPending.length - 8,
    );
    replacementValues.set(
      storageKeys.pendingReservationStorageKeyHex,
      `0x${expiredPending.toString('hex')}`,
    );
  }
  const primary = new ReadOnlySubstrateFinalityRpc(
    new FederatedMintFixtureTransport(
      values,
      'https://source.example.test',
      options.expiresBeforeLastUse ? replacementValues : undefined,
      options.onLastUseRecollection,
    ),
  );
  const witness = new ReadOnlySubstrateFinalityRpc(
    new FederatedMintFixtureTransport(
      values,
      'https://witness.example.test',
      options.expiresBeforeLastUse ? replacementValues : undefined,
      options.onLastUseRecollection,
    ),
  );
  return collectSubstrateFederatedMintReservationProducerV1({
    sources: createSubstrateFederatedMintReservationSourcePairV1({
      primaryRpc: primary,
      witnessRpc: witness,
    }),
    mintReservationStatement: statement,
    familyIdHex,
    expectedRuntimeCodeSha256Hex: FEDERATED_MINT_RUNTIME_CODE_SHA256,
    expectedRuntimeCodeBytes: 4,
    expectedRuntimeProfileScaleHex: runtimeProfileScaleHex,
    expectedSourceProofSystemIdHex: FEDERATED_MINT_SOURCE_PROOF_SYSTEM_ID,
    expectedSourceProofProfileIdHex: FEDERATED_MINT_SOURCE_PROOF_PROFILE_ID,
  });
}

async function buildCheckpointProducer(
  input: {
    readonly checkpointProfile: ReturnType<
      typeof buildSubstrateFederatedCheckpointProfileV1
    >;
    readonly checkpointStatement: ReturnType<
      typeof buildSubstrateFederatedCheckpointStatementV1
    >;
    readonly familyIdentity: ReturnType<
      typeof getSubstrateFederatedSettlementFamilyV1FixtureIdentity
    >;
    readonly settlementPacket: Awaited<ReturnType<
      typeof buildSubstrateFederatedBurnSettlementV1FixturePacket
    >>;
  },
  options: {
    readonly finalizedHeadHashHex?: string;
    readonly finalizedHeadHeight?: number;
    readonly ergoTipIdHex?: string;
    readonly ergoTipHeight?: number;
    readonly targetReplacedBeforeLastUse?: boolean;
    readonly sourceGenerationConflictActive?: () => boolean;
  } = {},
) {
  const substrateView = {
    checkpointStatement: input.checkpointStatement,
    finalizedHeadHashHex:
      options.finalizedHeadHashHex
        ?? SCHEDULING_CYCLE.sidechainFinalizedNativeBlockHashHex,
    finalizedHeadHeight:
      options.finalizedHeadHeight
        ?? SCHEDULING_CYCLE.sidechainFinalizedNativeHeight,
  };
  const ergoView = {
    trackerBox: input.settlementPacket.boxes.trackerDataInput,
    anchorHeaderIdHex:
      input.settlementPacket.tracker.decodedValue.anchorHeaderIdHex,
    anchorHeaderHeight:
      input.settlementPacket.tracker.decodedValue.anchorHeaderHeight,
    tipIdHex: options.ergoTipIdHex ?? SCHEDULING_CYCLE.ergoHeaderIdHex,
    tipHeight: options.ergoTipHeight ?? SCHEDULING_CYCLE.ergoHeight,
  };
  return collectSubstrateFederatedCheckpointTrackerProducerV1({
    sources: createSubstrateFederatedCheckpointTrackerSourceSetV1({
      primarySubstrateRpc: new ReadOnlySubstrateFinalityRpc(
        new FederatedCheckpointFixtureTransport(
          'https://checkpoint-primary.example.test',
          substrateView,
          options.targetReplacedBeforeLastUse ?? false,
          options.sourceGenerationConflictActive,
        ),
      ),
      witnessSubstrateRpc: new ReadOnlySubstrateFinalityRpc(
        new FederatedCheckpointFixtureTransport(
          'https://checkpoint-witness.example.test',
          substrateView,
          options.targetReplacedBeforeLastUse ?? false,
          options.sourceGenerationConflictActive,
        ),
      ),
      primaryErgoSource: new FederatedTrackerFixtureSource(
        'https://ergo-primary.example.test',
        ergoView,
      ),
      witnessErgoSource: new FederatedTrackerFixtureSource(
        'https://ergo-witness.example.test',
        ergoView,
      ),
    }),
    checkpointProfile: input.checkpointProfile,
    checkpointStatement: input.checkpointStatement,
    familyIdentity: input.familyIdentity,
    trackerHistory: [{
      key: input.settlementPacket.tracker.keyHex,
      value: input.settlementPacket.tracker.valueHex,
    }],
  });
}

async function buildSettlementPredecessorProducer(
  input: {
    readonly familyIdentity: ReturnType<
      typeof getSubstrateFederatedSettlementFamilyV1FixtureIdentity
    >;
    readonly settlementPacket: Awaited<ReturnType<
      typeof buildSubstrateFederatedBurnSettlementV1FixturePacket
    >>;
  },
  options: {
    readonly ergoTipIdHex?: string;
    readonly ergoTipHeight?: number;
    readonly feeUnavailableAfterFirstCollection?: boolean;
  } = {},
) {
  const view = {
    familyIdentity: input.familyIdentity,
    settlementPacket: input.settlementPacket,
    tipIdHex: options.ergoTipIdHex ?? SCHEDULING_CYCLE.ergoHeaderIdHex,
    tipHeight: options.ergoTipHeight ?? SCHEDULING_CYCLE.ergoHeight,
    feeUnavailableAfterFirstCollection:
      options.feeUnavailableAfterFirstCollection ?? false,
  };
  return collectSubstrateFederatedSettlementPredecessorProducerV1({
    sources: createSubstrateFederatedSettlementPredecessorSourceSetV1({
      primaryErgoSource: new FederatedSettlementPredecessorFixtureSource(
        'https://settlement-primary.example.test',
        view,
      ),
      witnessErgoSource: new FederatedSettlementPredecessorFixtureSource(
        'https://settlement-witness.example.test',
        view,
      ),
    }),
    familyIdentity: input.familyIdentity,
    settlementPacket: input.settlementPacket,
  });
}

class FederatedCheckpointFixtureTransport implements SubstrateRpcTransport {
  private finalizedHeadCalls = 0;

  constructor(
    readonly canonicalOrigin: string,
    private readonly view: {
      readonly checkpointStatement: ReturnType<
        typeof buildSubstrateFederatedCheckpointStatementV1
      >;
      readonly finalizedHeadHashHex: string;
      readonly finalizedHeadHeight: number;
    },
    private readonly targetReplacedBeforeLastUse = false,
    private readonly sourceGenerationConflictActive?: () => boolean,
  ) {}

  request<T = unknown>(
    method: string,
    params: readonly unknown[],
  ): Promise<T> {
    const statement = this.view.checkpointStatement;
    if (method === 'chain_getFinalizedHead') {
      this.finalizedHeadCalls += 1;
      return Promise.resolve(`0x${this.view.finalizedHeadHashHex}` as T);
    }
    if (method === 'chain_getBlockHash') {
      const targetHash = (
        this.targetReplacedBeforeLastUse
          && this.finalizedHeadCalls > 2
      ) || this.sourceGenerationConflictActive?.()
        ? '99'.repeat(32)
        : statement.sourceNativeBlockHashHex;
      return Promise.resolve(`0x${targetHash}` as T);
    }
    if (method === 'chain_getHeader') {
      const requested = String(params[0]).replace(/^0x/i, '').toLowerCase();
      const isTarget = requested === statement.sourceNativeBlockHashHex;
      return Promise.resolve({
        parentHash: `0x${(isTarget ? '02' : '43').repeat(32)}`,
        number: `0x${(
          isTarget
            ? Number(statement.sourceNativeBlockHeight)
            : this.view.finalizedHeadHeight
        ).toString(16)}`,
        stateRoot: `0x${(isTarget ? '55' : '56').repeat(32)}`,
        extrinsicsRoot: `0x${(isTarget ? '65' : '66').repeat(32)}`,
        digest: { logs: [] },
      } as T);
    }
    if (method === 'state_getStorage') {
      return Promise.resolve(`0x${encodeRuntimeBridgeCommitmentScaleHex({
        sidechainIdHex: statement.sidechainIdHex,
        sidechainHeight: statement.sourceNativeBlockHeight,
        executionBlockHashHex: statement.executionBlockHashHex,
        bridgeEventRootHex: statement.bridgeEventRootHex,
        burnLeafCount: statement.burnLeafCount,
      })}` as T);
    }
    if (method === 'state_getReadProof') {
      return Promise.resolve({
        at: params[1],
        proof: ['0x0102', '0x0304'],
      } as T);
    }
    return Promise.reject(new Error(`unexpected RPC method: ${method}`));
  }
}

class FederatedTrackerFixtureSource
implements SubstrateFederatedTrackerErgoSourceV1 {
  constructor(
    readonly observationSourceId: string,
    private readonly view: {
      readonly trackerBox: Eip12Box;
      readonly anchorHeaderIdHex: string;
      readonly anchorHeaderHeight: number;
      readonly tipIdHex: string;
      readonly tipHeight: number;
    },
  ) {}

  getIndexedHeight(): Promise<unknown> {
    return Promise.resolve({
      indexedHeight: this.view.tipHeight,
      fullHeight: this.view.tipHeight,
    });
  }

  getBestHeader(): Promise<unknown> {
    return Promise.resolve({
      id: this.view.tipIdHex,
      parentId: this.selectedHeaderIdAtHeight(this.view.tipHeight - 1),
      height: this.view.tipHeight,
      extensionRoot: '92'.repeat(32),
    });
  }

  getIndexedBoxesByTokenId(_tokenId: string): Promise<unknown[]> {
    return Promise.resolve([{
      ...this.view.trackerBox,
      inclusionHeight: this.view.anchorHeaderHeight,
      spentTransactionId: null,
      spendingProof: null,
    }]);
  }

  getBoxByIdOrNull(boxId: string): Promise<unknown | null> {
    return Promise.resolve(
      boxId === this.view.trackerBox.boxId
        ? this.view.trackerBox
        : null,
    );
  }

  getBlockHeaderById(headerId: string): Promise<unknown | null> {
    for (
      let height = this.view.anchorHeaderHeight;
      height <= this.view.tipHeight;
      height += 1
    ) {
      if (headerId === this.selectedHeaderIdAtHeight(height)) {
        return Promise.resolve({
          id: headerId,
          parentId: height === this.view.anchorHeaderHeight
            ? '0d'.repeat(32)
            : this.selectedHeaderIdAtHeight(height - 1),
          height,
          extensionRoot: height === this.view.anchorHeaderHeight
            ? '93'.repeat(32)
            : '94'.repeat(32),
        });
      }
    }
    return Promise.resolve(null);
  }

  getBlockHeaderIdsAtHeight(_height: number): Promise<string[]> {
    return Promise.resolve([this.view.anchorHeaderIdHex]);
  }

  private selectedHeaderIdAtHeight(height: number): string {
    if (height === this.view.tipHeight) return this.view.tipIdHex;
    if (height === this.view.anchorHeaderHeight) {
      return this.view.anchorHeaderIdHex;
    }
    return height.toString(16).padStart(64, '0');
  }
}

class FederatedSettlementPredecessorFixtureSource
implements SubstrateFederatedSettlementPredecessorErgoSourceV1 {
  private readonly profile;
  private feeLookupCount = 0;

  constructor(
    readonly observationSourceId: string,
    private readonly view: {
      readonly familyIdentity: ReturnType<
        typeof getSubstrateFederatedSettlementFamilyV1FixtureIdentity
      >;
      readonly settlementPacket: Awaited<ReturnType<
        typeof buildSubstrateFederatedBurnSettlementV1FixturePacket
      >>;
      readonly tipIdHex: string;
      readonly tipHeight: number;
      readonly feeUnavailableAfterFirstCollection: boolean;
    },
  ) {
    this.profile = decodeSubstrateFederatedSettlementFamilyV1Profile(
      view.familyIdentity.profile,
    );
  }

  getIndexedHeight(): Promise<unknown> {
    return Promise.resolve({
      indexedHeight: this.view.tipHeight,
      fullHeight: this.view.tipHeight,
    });
  }

  getBestHeader(): Promise<unknown> {
    return Promise.resolve({
      id: this.view.tipIdHex,
      parentId: '8f'.repeat(32),
      height: this.view.tipHeight,
      extensionRoot: '93'.repeat(32),
    });
  }

  getIndexedBoxesByTokenId(tokenId: string): Promise<unknown[]> {
    const packet = this.view.settlementPacket;
    if (tokenId === this.profile.pooledReserveNftIdHex) {
      return Promise.resolve([indexedPredecessor(
        packet.boxes.reservePredecessor,
      )]);
    }
    if (tokenId === this.profile.duplicatePreventionNftIdHex) {
      return Promise.resolve([indexedPredecessor(
        packet.boxes.duplicatePreventionPredecessor,
      )]);
    }
    return Promise.resolve([]);
  }

  getBoxByIdOrNull(boxId: string): Promise<unknown | null> {
    const packet = this.view.settlementPacket;
    if (boxId === packet.boxes.feeFundingInput.boxId) {
      this.feeLookupCount += 1;
      if (
        this.view.feeUnavailableAfterFirstCollection
        && this.feeLookupCount > 1
      ) {
        return Promise.resolve(null);
      }
    }
    for (const box of [
      packet.boxes.reservePredecessor,
      packet.boxes.duplicatePreventionPredecessor,
      packet.boxes.feeFundingInput,
    ]) {
      if (box.boxId === boxId) return Promise.resolve(box);
    }
    return Promise.resolve(null);
  }
}

function indexedPredecessor(box: Eip12Box) {
  return {
    ...box,
    inclusionHeight: 1_020,
    spentTransactionId: null,
    spendingProof: null,
  };
}

async function buildAlternativeSettlementPacket(
  role: 'reserve' | 'duplicatePrevention' | 'feeFunding',
) {
  const input = await buildSubstrateFederatedBurnSettlementV1FixtureInput();
  const predecessor = role === 'reserve'
    ? input.reserveState.predecessor
    : role === 'duplicatePrevention'
      ? input.duplicatePreventionState.predecessor
      : input.feeFundingInput;
  const changed = await materializeUnsignedTransaction({
    inputs: [{ ...predecessor, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: predecessor.value,
      ergoTree: predecessor.ergoTree,
      assets: predecessor.assets,
      additionalRegisters: predecessor.additionalRegisters,
      creationHeight: predecessor.creationHeight + 1,
    }],
  }, `alternate ${role} predecessor`);
  const changedBox = changed.outputs[0];
  return buildSubstrateFederatedBurnSettlementV1({
    ...input,
    reserveState: role === 'reserve'
      ? { predecessor: changedBox }
      : input.reserveState,
    duplicatePreventionState: role === 'duplicatePrevention'
      ? {
          ...input.duplicatePreventionState,
          predecessor: changedBox,
        }
      : input.duplicatePreventionState,
    feeFundingInput: role === 'feeFunding'
      ? changedBox
      : input.feeFundingInput,
  });
}

class FederatedMintFixtureTransport implements SubstrateRpcTransport {
  private finalizedHeadCalls = 0;

  constructor(
    private readonly values: ReadonlyMap<string, string | null>,
    readonly canonicalOrigin: string,
    private readonly replacementValues?:
      ReadonlyMap<string, string | null>,
    private readonly onLastUseRecollection?: () => void,
  ) {}

  request<T = unknown>(
    method: string,
    params: readonly unknown[],
  ): Promise<T> {
    if (method === 'chain_getFinalizedHead') {
      this.finalizedHeadCalls += 1;
      if (this.finalizedHeadCalls > 2) {
        this.onLastUseRecollection?.();
      }
      return Promise.resolve(FEDERATED_MINT_FINALIZED_HEAD as T);
    }
    if (method === 'chain_getHeader') {
      return Promise.resolve({
        parentHash: `0x${'43'.repeat(32)}`,
        number: `0x${FEDERATED_MINT_FINALIZED_HEIGHT.toString(16)}`,
        stateRoot: `0x${'55'.repeat(32)}`,
        extrinsicsRoot: `0x${'66'.repeat(32)}`,
        digest: { logs: [] },
      } as T);
    }
    if (method === 'state_getStorage') {
      const values = this.replacementValues !== undefined
        && this.finalizedHeadCalls > 2
        ? this.replacementValues
        : this.values;
      return Promise.resolve(values.get(String(params[0])) as T);
    }
    if (method === 'state_getReadProof') {
      return Promise.resolve({
        at: params[1],
        proof: ['0x0102', '0x0304'],
      } as T);
    }
    return Promise.reject(new Error(`unexpected RPC method: ${method}`));
  }
}

function uint64Le(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function schedulingProfile(
  fixture: Awaited<ReturnType<typeof buildCandidates>>,
  overrides: Partial<
    SubstrateFederatedDaemonSchedulingProfileV1<{
      expectedTxId: string;
      revalidationDigestHex: string;
    }>
  > = {},
) {
  return Object.freeze({
    schema: SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1_SCHEMA,
    version: 1 as const,
    profileIdHex: '91'.repeat(32),
    collectFreshProducerInputs: async () =>
      candidateProducerInputs(fixture),
    state: settlementState(fixture.candidates.burn, fixture.settlementPacket),
    ergo: {
      getBlockHeaderHash: async () => fixture.candidates.burn.anchorHeaderId,
      getBoxByIdOrNull: async () => ({ present: true }),
    },
    observeBurn: async () => 'confirmed' as const,
    recollect: async (
      candidate: Awaited<ReturnType<typeof buildCandidates>>['candidates']['burn'],
    ) => ({
      expectedTxId: candidate.settlementTransactionIdHex,
      revalidationDigestHex: sha256CanonicalJson({
        candidateId: candidate.candidateId,
        settlementTransactionIdHex: candidate.settlementTransactionIdHex,
        trackerInputDigestHex: candidate.trackerInputDigestHex,
      }, 'E2S_SUBSTRATE_FEDERATED_DAEMON_REVALIDATION_V1'),
    }),
    ...overrides,
  });
}

describe('substrate federated daemon candidates V1', () => {
  it('projects independent FED-1 mint and FED-2/3 burn work without authority', async () => {
    const { candidates, settlementPacket } = await buildCandidates();

    expect(candidates.trustModel).toBe('federated_non_trustless');
    expect(candidates.mint.candidateId).not.toBe(candidates.burn.candidateId);
    expect(candidates.mint.familyIdHex).toBe(candidates.sharedProfile.familyIdHex);
    expect(candidates.burn.familyIdHex).toBe(candidates.sharedProfile.familyIdHex);
    expect(candidates.burn.settlementTransactionIdHex).toBe(
      settlementPacket.transaction.txId,
    );
    expect(candidates.burn.sidechainId).toBe(
      candidates.sharedProfile.sidechainIdHex,
    );
    expect(candidates.checks).toEqual({
      canonicalMintReservationDecoded: true,
      canonicalFederatedCheckpointDecoded: true,
      exactFederatedSettlementFamilyVerified: true,
      exactFederatedSettlementPacketVerified: true,
      sourceAndSettlementProfilesBound: true,
      mintAndBurnRemainIndependentPoolWorkItems: true,
    });
    expect(candidates.boundary).toMatchObject({
      mintAndBurnCausallyPaired: false,
      localSnapshotCanRestoreCandidate: false,
      freshMintObservationRequiredBeforeScheduling: true,
      freshBurnObservationRequiredBeforeScheduling: true,
      freshSettlementPreparationRequiredAfterRestart: true,
      mintAuthorized: false,
      payoutAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
    });
    expect(Object.entries(candidates.mint.boundary)
      .every(([, value]) => value === false)).toBe(true);
    expect(Object.entries(candidates.burn.boundary)
      .every(([, value]) => value === false)).toBe(true);
  });

  it('requires same-process preparation provenance instead of snapshot reconstruction', async () => {
    const { candidates, settlementPacket } = await buildCandidates();
    const observeMint = vi.fn(async () => mintObservation(candidates.mint));

    expect(() =>
      assertSubstrateFederatedCandidatePreparationV1(candidates)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedCandidatePreparationV1(
        structuredClone(candidates),
      )
    ).toThrow(/same-process preparation provenance/i);

    await expect(runSubstrateFederatedCandidateIntegrationV1({
      prepareFresh: async () => structuredClone(candidates),
      observeMint,
      state: settlementState(candidates.burn, settlementPacket),
      ergo: {
        getBlockHeaderHash: async () => candidates.burn.anchorHeaderId,
        getBoxByIdOrNull: async () => ({ present: true }),
      },
      revalidations: new Map(),
      observeBurn: async () => 'confirmed',
      recollect: async () => null,
    })).rejects.toThrow(/same-process preparation provenance/i);
    expect(observeMint).not.toHaveBeenCalled();
  });

  it('connects fresh mint observation and exact burn reconciliation without authority', async () => {
    const { candidates, settlementPacket } = await buildCandidates();
    const invalidated = vi.fn();
    const cache = new Map<string, {
      expectedTxId: string;
      revalidationDigestHex: string;
    }>();
    const prepareFresh = vi.fn(async () => candidates);
    const observeMint = vi.fn(async () => mintObservation(candidates.mint));

    const result = await runSubstrateFederatedCandidateIntegrationV1({
      prepareFresh,
      observeMint,
      state: settlementState(candidates.burn, settlementPacket, invalidated),
      ergo: {
        getBlockHeaderHash: async height => {
          expect(height).toBe(candidates.burn.anchorHeaderHeight);
          return candidates.burn.anchorHeaderId;
        },
        getBoxByIdOrNull: async () => ({ present: true }),
      },
      revalidations: cache,
      observeBurn: async pegOut => {
        expect(pegOut.sidechainTxHash).toBe(
          settlementPacket.burn.leaf.sidechainTxHashHex,
        );
        return 'confirmed';
      },
      recollect: async candidate => ({
        expectedTxId: candidate.settlementTransactionIdHex,
        revalidationDigestHex: sha256CanonicalJson({
          candidateId: candidate.candidateId,
          settlementTransactionIdHex: candidate.settlementTransactionIdHex,
          trackerInputDigestHex: candidate.trackerInputDigestHex,
        }, 'E2S_SUBSTRATE_FEDERATED_DAEMON_REVALIDATION_V1'),
      }),
    });

    expect(prepareFresh).toHaveBeenCalledOnce();
    expect(observeMint).toHaveBeenCalledWith(candidates.mint);
    expect(result).toMatchObject({
      mintCandidateId: candidates.mint.candidateId,
      burnCandidateId: candidates.burn.candidateId,
      burnReconciliation: {
        activeCandidates: 1,
        refreshedRevalidations: 1,
        invalidatedCandidates: 0,
        revertedBurns: 0,
      },
      boundary: {
        candidatesPreparedFreshInProcess: true,
        producerProvenanceVerified: true,
        mintObservationMatchedBeforeScheduling: true,
        burnCandidateReconciledThroughSharedPorts: true,
        localJournalAuthoritative: false,
        mintAuthorized: false,
        payoutAuthorized: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
      },
    });
    expect(invalidated).not.toHaveBeenCalled();
    expect(cache.get(candidates.burn.candidateId)).toMatchObject({
      expectedTxId: candidates.burn.settlementTransactionIdHex,
    });
  });

  it('rejects mint-observation drift before burn reconciliation or journaling', async () => {
    const { candidates, settlementPacket } = await buildCandidates();
    const observeBurn = vi.fn(async () => 'confirmed' as const);
    const changedObservation = {
      ...mintObservation(candidates.mint),
      familyIdHex: 'ff'.repeat(32),
    };

    await expect(runSubstrateFederatedCandidateIntegrationV1({
      prepareFresh: async () => candidates,
      observeMint: async () => changedObservation,
      state: settlementState(candidates.burn, settlementPacket),
      ergo: {
        getBlockHeaderHash: async () => candidates.burn.anchorHeaderId,
        getBoxByIdOrNull: async () => ({ present: true }),
      },
      revalidations: new Map(),
      observeBurn,
      recollect: async () => null,
    })).rejects.toThrow(/mint observation family ID mismatch/i);

    expect(observeBurn).not.toHaveBeenCalled();
  });

  it('rejects a mint profile drift before either work item reaches a journal', async () => {
    const fixture = await buildCandidates();
    const intent = decodePegInSourceIntentV2Hex(
      fixture.mintReservationStatement.sourceIntentHex,
    );
    const changedIntent = {
      ...intent,
      sidechainIdHex: 'ff'.repeat(32),
    };
    const changedStatement = {
      ...fixture.mintReservationStatement,
      sourceIntentHex: encodePegInSourceIntentV2Hex(changedIntent),
      sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(changedIntent),
    };

    expect(() => buildSubstrateFederatedDaemonCandidatesV1({
      mintReservationStatement: changedStatement,
      checkpointProfile: fixture.checkpointProfile,
      checkpointStatement: fixture.checkpointStatement,
      familyIdentity: fixture.familyIdentity,
      settlementPacket: fixture.settlementPacket,
    })).toThrow(/mint sidechain ID mismatch/i);
  });

  it('keeps the real daemon profile statically inactive', async () => {
    const record = vi.fn();
    const result = await runSubstrateFederatedDaemonSchedulingV1({
      profile: ACTIVE_SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1,
      cycle: SCHEDULING_CYCLE,
      record,
    });

    expect(result).toMatchObject({
      status: 'inactive',
      boundary: {
        localRecordAuthoritative: false,
        candidateSnapshotRestorable: false,
        mintAuthorized: false,
        payoutAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
      },
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects extra capabilities on a future static scheduling profile', async () => {
    const fixture = await buildCandidates();
    const collectFreshProducerInputs = vi.fn(async () =>
      candidateProducerInputs(fixture)
    );
    const profile = Object.freeze({
      ...schedulingProfile(fixture, { collectFreshProducerInputs }),
      submit: () => undefined,
    });

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile,
      cycle: SCHEDULING_CYCLE,
      record: vi.fn(),
    })).rejects.toThrow(/scheduling profile must contain exactly/i);
    expect(collectFreshProducerInputs).not.toHaveBeenCalled();
  });

  it('rejects copied mint producer state before candidate reconstruction', async () => {
    const fixture = await buildCandidates();
    const record = vi.fn();
    const collectFreshProducerInputs = vi.fn(async () => ({
      ...candidateProducerInputs(fixture),
      mint: structuredClone(fixture.mintProducer),
    }));

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture, { collectFreshProducerInputs }),
      cycle: SCHEDULING_CYCLE,
      record,
    })).rejects.toThrow(/producer provenance is missing/i);
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects copied checkpoint producer state before candidate reconstruction', async () => {
    const fixture = await buildCandidates();
    const record = vi.fn();
    const collectFreshProducerInputs = vi.fn(async () => ({
      ...candidateProducerInputs(fixture),
      checkpoint: structuredClone(fixture.checkpointProducer),
    }));

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture, { collectFreshProducerInputs }),
      cycle: SCHEDULING_CYCLE,
      record,
    })).rejects.toThrow(/checkpoint\/tracker producer provenance is missing/i);
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects copied settlement predecessor state before candidate reconstruction', async () => {
    const fixture = await buildCandidates();
    const record = vi.fn();
    const collectFreshProducerInputs = vi.fn(async () => ({
      ...candidateProducerInputs(fixture),
      settlementPredecessors: structuredClone(
        fixture.settlementPredecessorProducer,
      ),
    }));

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture, { collectFreshProducerInputs }),
      cycle: SCHEDULING_CYCLE,
      record,
    })).rejects.toThrow(/predecessor producer provenance is missing/i);
    expect(record).not.toHaveBeenCalled();
  });

  it('consumes each genuine producer result exactly once', async () => {
    const fixture = await buildCandidates();
    const record = vi.fn();
    const input = {
      profile: schedulingProfile(fixture),
      cycle: SCHEDULING_CYCLE,
      record,
    };

    await expect(runSubstrateFederatedDaemonSchedulingV1(input))
      .resolves.toMatchObject({ status: 'scheduled_non_authorizing' });
    await expect(runSubstrateFederatedDaemonSchedulingV1(input))
      .rejects.toThrow(/producer result was already consumed/i);
    expect(record).toHaveBeenCalledOnce();
  });

  it('rejects a genuine mint producer from a different scheduling block', async () => {
    const fixture = await buildCandidates();
    const record = vi.fn();

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture),
      cycle: {
        ...SCHEDULING_CYCLE,
        sidechainFinalizedNativeHeight:
          SCHEDULING_CYCLE.sidechainFinalizedNativeHeight + 1,
      },
      record,
    })).rejects.toThrow(/producer block differs from the scheduling cycle/i);
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects same-height finalized native block drift', async () => {
    const fixture = await buildCandidates();
    const record = vi.fn();

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture),
      cycle: {
        ...SCHEDULING_CYCLE,
        sidechainFinalizedNativeBlockHashHex: '45'.repeat(32),
      },
      record,
    })).rejects.toThrow(/producer block differs from the scheduling cycle/i);
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects each finalized-head field independently', async () => {
    const mutations = [{
      finalizedHeadHashHex: '46'.repeat(32),
    }, {
      finalizedHeadHeight:
        SCHEDULING_CYCLE.sidechainFinalizedNativeHeight + 1,
    }];
    for (const mutation of mutations) {
      const fixture = await buildCandidates();
      const record = vi.fn();
      const checkpoint = await buildCheckpointProducer(fixture, mutation);
      await expect(runSubstrateFederatedDaemonSchedulingV1({
        profile: schedulingProfile(fixture, {
          collectFreshProducerInputs: async () => ({
            ...candidateProducerInputs(fixture),
            checkpoint,
          }),
        }),
        cycle: SCHEDULING_CYCLE,
        record,
      })).rejects.toThrow(/checkpoint producer finalized head differs/i);
      expect(record).not.toHaveBeenCalled();
    }
  });

  it('rejects each Ergo-tip field independently', async () => {
    const mutations = [{
      ergoTipIdHex: '91'.repeat(32),
    }, {
      ergoTipHeight: SCHEDULING_CYCLE.ergoHeight + 1,
    }];
    for (const mutation of mutations) {
      const fixture = await buildCandidates();
      const record = vi.fn();
      const checkpoint = await buildCheckpointProducer(fixture, mutation);
      await expect(runSubstrateFederatedDaemonSchedulingV1({
        profile: schedulingProfile(fixture, {
          collectFreshProducerInputs: async () => ({
            ...candidateProducerInputs(fixture),
            checkpoint,
          }),
        }),
        cycle: SCHEDULING_CYCLE,
        record,
      })).rejects.toThrow(/checkpoint producer Ergo tip differs/i);
      expect(record).not.toHaveBeenCalled();
    }
  });

  it('rejects each settlement predecessor Ergo-tip field independently', async () => {
    const mutations = [{
      ergoTipIdHex: '92'.repeat(32),
    }, {
      ergoTipHeight: SCHEDULING_CYCLE.ergoHeight + 1,
    }];
    for (const mutation of mutations) {
      const fixture = await buildCandidates();
      const record = vi.fn();
      const settlementPredecessors =
        await buildSettlementPredecessorProducer(fixture, mutation);
      await expect(runSubstrateFederatedDaemonSchedulingV1({
        profile: schedulingProfile(fixture, {
          collectFreshProducerInputs: async () => ({
            ...candidateProducerInputs(fixture),
            settlementPredecessors,
          }),
        }),
        cycle: SCHEDULING_CYCLE,
        record,
      })).rejects.toThrow(/predecessor producer Ergo tip differs/i);
      expect(record).not.toHaveBeenCalled();
    }
  });

  it('reobserves the exact fee UTXO after reconciliation and rejects disappearance', async () => {
    const fixture = await buildCandidates();
    const settlementPredecessors =
      await buildSettlementPredecessorProducer(fixture, {
        feeUnavailableAfterFirstCollection: true,
      });
    const record = vi.fn();

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture, {
        collectFreshProducerInputs: async () => ({
          ...candidateProducerInputs(fixture),
          settlementPredecessors,
        }),
      }),
      cycle: SCHEDULING_CYCLE,
      record,
    })).rejects.toThrow(/external-fee input is absent/i);
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects each settlement tracker field independently', async () => {
    const mutate = [
      (fixture: Awaited<ReturnType<typeof buildCandidates>>) => ({
        ...fixture.settlementPacket,
        boxes: {
          ...fixture.settlementPacket.boxes,
          trackerDataInput: {
            ...fixture.settlementPacket.boxes.trackerDataInput,
            boxId: 'f1'.repeat(32),
          },
        },
      }),
      (fixture: Awaited<ReturnType<typeof buildCandidates>>) => ({
        ...fixture.settlementPacket,
        tracker: {
          ...fixture.settlementPacket.tracker,
          inputDigestHex: 'f2'.repeat(33),
        },
      }),
      (fixture: Awaited<ReturnType<typeof buildCandidates>>) => ({
        ...fixture.settlementPacket,
        tracker: {
          ...fixture.settlementPacket.tracker,
          keyHex: 'f3'.repeat(32),
        },
      }),
      (fixture: Awaited<ReturnType<typeof buildCandidates>>) => ({
        ...fixture.settlementPacket,
        tracker: {
          ...fixture.settlementPacket.tracker,
          valueHex: 'f4'.repeat(370),
        },
      }),
    ];
    for (const mutation of mutate) {
      const fixture = await buildCandidates();
      const record = vi.fn();
      const settlementPacket = mutation(fixture) as Awaited<ReturnType<
        typeof buildSubstrateFederatedBurnSettlementV1FixturePacket
      >>;
      await expect(runSubstrateFederatedDaemonSchedulingV1({
        profile: schedulingProfile(fixture, {
          collectFreshProducerInputs: async () => ({
            ...candidateProducerInputs(fixture),
            settlementPacket,
          }),
        }),
        cycle: SCHEDULING_CYCLE,
        record,
      })).rejects.toThrow(/tracker differs from the settlement packet/i);
      expect(record).not.toHaveBeenCalled();
    }
  });

  it('rejects genuine reserve, DUP, or fee packet drift independently', async () => {
    for (const role of ['reserve', 'duplicatePrevention', 'feeFunding'] as const) {
      const fixture = await buildCandidates();
      const record = vi.fn();
      const settlementPacket = await buildAlternativeSettlementPacket(role);
      await expect(runSubstrateFederatedDaemonSchedulingV1({
        profile: schedulingProfile(fixture, {
          collectFreshProducerInputs: async () => ({
            ...candidateProducerInputs(fixture),
            settlementPacket,
          }),
        }),
        cycle: SCHEDULING_CYCLE,
        record,
      })).rejects.toThrow(/predecessor producer differs from the settlement packet/i);
      expect(record).not.toHaveBeenCalled();
    }
  });

  it('rejects an incomplete cycle or producer failure before observation', async () => {
    const fixture = await buildCandidates();
    const collectIncomplete = vi.fn(async () =>
      candidateProducerInputs(fixture)
    );
    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture, {
        collectFreshProducerInputs: collectIncomplete,
      }),
      cycle: {
        ...SCHEDULING_CYCLE,
        pegOutObservationComplete: false,
      } as never,
      record: vi.fn(),
    })).rejects.toThrow(/complete peg-out observation pass/i);
    expect(collectIncomplete).not.toHaveBeenCalled();

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture, {
        collectFreshProducerInputs: collectIncomplete,
      }),
      cycle: {
        ...SCHEDULING_CYCLE,
        sidechainHeight: 2_500,
      } as never,
      record: vi.fn(),
    })).rejects.toThrow(/scheduling cycle must contain exactly/i);
    expect(collectIncomplete).not.toHaveBeenCalled();

    const recordFailedProducer = vi.fn();
    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture, {
        collectFreshProducerInputs: async () => {
          throw new Error('federated producer input is absent');
        },
      }),
      cycle: SCHEDULING_CYCLE,
      record: recordFailedProducer,
    })).rejects.toThrow(/producer input is absent/i);
    expect(recordFailedProducer).not.toHaveBeenCalled();
  });

  it('recollects producer inputs and rebuilds candidates on every restart pass', async () => {
    const fixture = await buildCandidates();
    const records: SubstrateFederatedDaemonSchedulingObservationV1[] = [];
    const collectFirst = vi.fn(async () => {
      const fresh = await buildCandidates();
      return candidateProducerInputs(fresh);
    });
    const firstProfile = schedulingProfile(fixture, {
      collectFreshProducerInputs: collectFirst,
    });
    const first = await runSubstrateFederatedDaemonSchedulingV1({
      profile: firstProfile,
      cycle: SCHEDULING_CYCLE,
      record: observation => {
        records.push(observation);
      },
    });

    const collectAfterRestart = vi.fn(async () => {
      const fresh = await buildCandidates();
      return candidateProducerInputs(fresh);
    });
    const restartedProfile = schedulingProfile(fixture, {
      collectFreshProducerInputs: collectAfterRestart,
    });
    const restarted = await runSubstrateFederatedDaemonSchedulingV1({
      profile: restartedProfile,
      cycle: SCHEDULING_CYCLE,
      record: observation => {
        records.push(observation);
      },
    });

    expect(collectFirst).toHaveBeenCalledOnce();
    expect(collectAfterRestart).toHaveBeenCalledOnce();
    expect(first.status).toBe('scheduled_non_authorizing');
    expect(restarted.status).toBe('scheduled_non_authorizing');
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(records[1]);
    expect(records[1]).toMatchObject({
      status: 'scheduled_non_authorizing',
      reconciliation: {
        activeCandidates: 1,
        refreshedRevalidations: 1,
        retainedRevalidations: 0,
        deferredCandidates: 0,
        invalidatedCandidates: 0,
        revertedBurns: 0,
      },
      boundary: {
        producerInputsCollectedFresh: true,
        mintProducerProvenanceVerified: true,
        mintProducerCycleBlockMatched: true,
        checkpointProducerProvenanceVerified: true,
        checkpointProducerFinalizedHeadMatched: true,
        checkpointProducerErgoTipMatched: true,
        checkpointProducerSettlementTrackerMatched: true,
        settlementPredecessorProducerProvenanceVerified: true,
        settlementPredecessorProducerErgoTipMatched: true,
        settlementPredecessorProducerPacketMatched: true,
        mintProducerReobservedAtLastUse: true,
        checkpointProducerReobservedAtLastUse: true,
        settlementPredecessorsReobservedAtLastUse: true,
        sourceGenerationStableAtLastUse: true,
        burnReconciledAfterSourceReobservation: true,
        candidatesRebuiltInCurrentProcess: true,
        runLocalRevalidationCacheUsed: true,
        localRecordAuthoritative: false,
        candidateSnapshotRestorable: false,
        checkPassed: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
      },
    });
    expect(records[1].settlementPredecessorLastUseObservationDigestHex)
      .toMatch(/^[0-9a-f]{64}$/);
    expect(records[1].sourceGenerationRevalidationDigestHex)
      .toMatch(/^[0-9a-f]{64}$/);
    expect(records[1].currentInputRevalidationDigestHex).toBe(
      sha256CanonicalJson({
        burnCandidateId: records[1].burnCandidateId,
        settlementTransactionIdHex: records[1].settlementTransactionIdHex,
        burnRevalidationDigestHex: records[1].burnRevalidationDigestHex,
        sourceGenerationRevalidationDigestHex:
          records[1].sourceGenerationRevalidationDigestHex,
        settlementPredecessorLastUseObservationDigestHex:
          records[1].settlementPredecessorLastUseObservationDigestHex,
      }, CURRENT_INPUT_REVALIDATION_DOMAIN),
    );
    expect(Object.isFrozen(records[1])).toBe(true);
  });

  it('reruns fresh producers after restart without reading the prior local record', async () => {
    const firstFixture = await buildCandidates();
    const firstRecords: SubstrateFederatedDaemonSchedulingObservationV1[] = [];
    const firstCollect = vi.fn(async () =>
      candidateProducerInputs(await buildCandidates()));
    const firstProcessHold = vi.fn();
    const firstDurableHold = vi.fn();
    const first = await runSubstrateFederatedDaemonLifecycleV1({
      profile: schedulingProfile(firstFixture, {
        collectFreshProducerInputs: firstCollect,
      }),
      collectCycle: async () => SCHEDULING_CYCLE,
      record: observation => {
        firstRecords.push(observation);
      },
      incidents: {
        latchProcessHold: firstProcessHold,
        persistHold: firstDurableHold,
      },
    });

    const replacementFixture = await buildCandidates();
    const replacementRecords: SubstrateFederatedDaemonSchedulingObservationV1[] = [];
    const replacementCollect = vi.fn(async () =>
      candidateProducerInputs(await buildCandidates()));
    const restarted = await runSubstrateFederatedDaemonLifecycleV1({
      profile: schedulingProfile(replacementFixture, {
        collectFreshProducerInputs: replacementCollect,
      }),
      collectCycle: async () => SCHEDULING_CYCLE,
      record: observation => {
        replacementRecords.push(observation);
      },
      incidents: {
        latchProcessHold: vi.fn(),
        persistHold: vi.fn(),
      },
    });

    expect(first.status).toBe('scheduled_non_authorizing');
    expect(restarted.status).toBe('scheduled_non_authorizing');
    expect(firstCollect).toHaveBeenCalledOnce();
    expect(replacementCollect).toHaveBeenCalledOnce();
    expect(firstRecords).toHaveLength(1);
    expect(replacementRecords).toHaveLength(1);
    expect(replacementRecords[0]).toEqual(firstRecords[0]);
    expect(firstProcessHold).not.toHaveBeenCalled();
    expect(firstDurableHold).not.toHaveBeenCalled();
  });

  it('reconstructs only the exact burn after deleting lifecycle-bearing state', async () => {
    const fixture = await buildCandidates();
    await withDeletedFederatedLifecycleState(
      fixture,
      async (replacement, observation) => {
        const records: SubstrateFederatedDaemonSchedulingObservationV1[] = [];
        const collectFreshProducerInputs = vi.fn(async () =>
          candidateProducerInputs(await buildCandidates()));
        const processHold = vi.fn();
        const durableHold = vi.fn();
        let recovery:
          Readonly<SubstrateFederatedDatabaseLossRecoveryV1Result> | null = null;

        const result = await runSubstrateFederatedDaemonLifecycleV1({
          profile: schedulingProfile(fixture, {
            collectFreshProducerInputs,
            state: databaseLossSettlementState(replacement),
          }),
          collectCycle: async () => SCHEDULING_CYCLE,
          reconstructNonAuthorizingState: async cycle => {
            recovery = await reconstructSubstrateFederatedDatabaseLossStateV1({
              cycle: {
                ...cycle,
                sidechainFinalizedExecutionBlockHashHex:
                  DATABASE_LOSS_EXECUTION_BLOCK_HASH_HEX,
              },
              state: replacement,
              collectCompleteBurnInventory: async () => observation,
            });
          },
          record: value => {
            records.push(value);
          },
          incidents: {
            latchProcessHold: processHold,
            persistHold: durableHold,
          },
        });

        const expected = databaseLossExpectedWork(fixture);
        expect(result.status).toBe('scheduled_non_authorizing');
        expect(collectFreshProducerInputs).toHaveBeenCalledOnce();
        expect(records).toHaveLength(1);
        expect(processHold).not.toHaveBeenCalled();
        expect(durableHold).not.toHaveBeenCalled();
        expect(recovery).not.toBeNull();
        expect(recovery!.inventory.insertedBurnIds).toEqual([
          expected.burn.burnIdHex,
        ]);
        expect(recovery!.boundary).toMatchObject({
          executionCyclePinMatched: true,
          nativeExecutionCorrespondenceAuthenticated: false,
          databaseContinuityRecoveryRequired: true,
          fundsReleaseHoldOpen: true,
          completeBurnInventoryReconstructed: true,
          pegInLifecycleRestored: false,
          settlementCandidateRestored: false,
          checkStateRestored: false,
          executionReservationRestored: false,
          aggregateSettlementAttemptRestored: false,
          submissionAttemptRestored: false,
          signingAuthorized: false,
          submissionAuthorized: false,
          transportAuthorized: false,
          broadcastAuthorized: false,
          fundsAuthorityEstablished: false,
        });
        expect(replacement.getPegOutByBurnId(expected.burn.burnIdHex)?.status)
          .toBe('detected');
        expect(replacement.getActiveAuthenticatedSettlementCandidates())
          .toEqual([]);
        expect(replacement.getAggregateSettlementAttempt(
          expected.settlementTransactionIdHex,
        )).toBeNull();
        expect(replacement.getAuthenticatedSettlementCandidate(
          expected.candidateIdHex,
        )).toBeNull();
        expect(replacement.getAuthenticatedSettlementExecutionReservation({
          candidateId: expected.candidateIdHex,
        })).toBeNull();
        expect(replacement.getAuthenticatedSettlementSubmissionAttempt({
          expectedTxId: expected.settlementTransactionIdHex,
        })).toBeNull();
        expect(replacement.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          continuityRecoveryRequired: true,
        });
        expect(replacement.getSettlementAuthorityInventoryCounts()).toEqual({
          pegInEvents: 0,
          pegInMintTransportAttempts: 0,
          aggregateSettlementAttempts: 0,
          authenticatedSettlementCandidates: 0,
          authenticatedSettlementExecutionReservations: 0,
          authenticatedSettlementSubmissionAttempts: 0,
          ergoOperationalTransactionAttempts: 0,
          pendingDupHeartbeats: 0,
        });
      },
    );
  });

  it.each(SETTLEMENT_AUTHORITY_COUNT_KEYS)(
    'holds nonempty %s authority state before source collection',
    async authorityKey => {
      const fixture = await buildCandidates();
      await withDeletedFederatedLifecycleState(
        fixture,
        async (replacement, observation) => {
          const counts = replacement.getSettlementAuthorityInventoryCounts();
          const authority = vi.spyOn(
            replacement,
            'getSettlementAuthorityInventoryCounts',
          ).mockReturnValue(Object.freeze({
            ...counts,
            [authorityKey]: 1,
          }));
          const collectCompleteBurnInventory = vi.fn(async () => observation);
          const collectFreshProducerInputs = vi.fn(async () =>
            candidateProducerInputs(await buildCandidates()));
          const record = vi.fn();
          const callOrder: string[] = [];

          const result = await runSubstrateFederatedDaemonLifecycleV1({
            profile: schedulingProfile(fixture, {
              collectFreshProducerInputs,
              state: databaseLossSettlementState(replacement),
            }),
            collectCycle: async () => SCHEDULING_CYCLE,
            reconstructNonAuthorizingState: async cycle => {
              await reconstructSubstrateFederatedDatabaseLossStateV1({
                cycle: {
                  ...cycle,
                  sidechainFinalizedExecutionBlockHashHex:
                    DATABASE_LOSS_EXECUTION_BLOCK_HASH_HEX,
                },
                state: replacement,
                collectCompleteBurnInventory,
              });
            },
            record,
            incidents: {
              latchProcessHold: () => {
                callOrder.push('process');
              },
              persistHold: incident => {
                callOrder.push('durable');
                expect(incident.failureStage).toBe('database_reconstruction');
                replacement.holdFundsReleaseForOperatorReview(incident.reason);
              },
            },
          });
          authority.mockRestore();

          expect(result.status).toBe('held_non_authorizing');
          expect(callOrder).toEqual(['process', 'durable']);
          expect(collectCompleteBurnInventory).not.toHaveBeenCalled();
          expect(collectFreshProducerInputs).not.toHaveBeenCalled();
          expect(record).not.toHaveBeenCalled();
        },
      );
    },
  );

  it('holds source disagreement during database reconstruction before scheduling', async () => {
    const fixture = await buildCandidates();
    await withDeletedFederatedLifecycleState(
      fixture,
      async replacement => {
        const collectFreshProducerInputs = vi.fn(async () =>
          candidateProducerInputs(await buildCandidates()));
        const record = vi.fn();
        const callOrder: string[] = [];
        const result = await runSubstrateFederatedDaemonLifecycleV1({
          profile: schedulingProfile(fixture, {
            collectFreshProducerInputs,
            state: databaseLossSettlementState(replacement),
          }),
          collectCycle: async () => SCHEDULING_CYCLE,
          reconstructNonAuthorizingState: async cycle => {
            await reconstructSubstrateFederatedDatabaseLossStateV1({
              cycle: {
                ...cycle,
                sidechainFinalizedExecutionBlockHashHex:
                  DATABASE_LOSS_EXECUTION_BLOCK_HASH_HEX,
              },
              state: replacement,
              collectCompleteBurnInventory: async () => {
                throw new Error('bounded source views disagree');
              },
            });
          },
          record,
          incidents: {
            latchProcessHold: () => {
              callOrder.push('process');
            },
            persistHold: incident => {
              callOrder.push('durable');
              expect(incident.failureStage).toBe('database_reconstruction');
              replacement.holdFundsReleaseForOperatorReview(incident.reason);
            },
          },
        });

        expect(result.status).toBe('held_non_authorizing');
        expect(callOrder).toEqual(['process', 'durable']);
        expect(collectFreshProducerInputs).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
        expect(replacement.getPegOutByBurnId(
          databaseLossExpectedWork(fixture).burn.burnIdHex,
        )).toBeUndefined();
      },
    );
  });

  it('holds an out-of-order database reconstruction before persistence', async () => {
    const fixture = await buildCandidates();
    await withDeletedFederatedLifecycleState(
      fixture,
      async (replacement, observation) => {
        const collectFreshProducerInputs = vi.fn(async () =>
          candidateProducerInputs(await buildCandidates()));
        const record = vi.fn();
        const processHold = vi.fn();
        const durableHold = vi.fn(incident => {
          expect(incident.failureStage).toBe('database_reconstruction');
          replacement.holdFundsReleaseForOperatorReview(incident.reason);
        });
        const result = await runSubstrateFederatedDaemonLifecycleV1({
          profile: schedulingProfile(fixture, {
            collectFreshProducerInputs,
            state: databaseLossSettlementState(replacement),
          }),
          collectCycle: async () => SCHEDULING_CYCLE,
          reconstructNonAuthorizingState: async cycle => {
            await reconstructSubstrateFederatedDatabaseLossStateV1({
              cycle: {
                ...cycle,
                sidechainFinalizedExecutionBlockHashHex:
                  DATABASE_LOSS_EXECUTION_BLOCK_HASH_HEX,
              },
              state: replacement,
              collectCompleteBurnInventory: async () => ({
                ...observation,
                pinnedHeight: observation.pinnedHeight - 1,
              }),
            });
          },
          record,
          incidents: {
            latchProcessHold: processHold,
            persistHold: durableHold,
          },
        });

        expect(result.status).toBe('held_non_authorizing');
        expect(processHold).toHaveBeenCalledOnce();
        expect(durableHold).toHaveBeenCalledOnce();
        expect(collectFreshProducerInputs).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
        expect(replacement.getPegOutByBurnId(
          databaseLossExpectedWork(fixture).burn.burnIdHex,
        )).toBeUndefined();
      },
    );
  });

  it.each(['amount', 'recipient'] as const)(
    'holds mismatched reconstructed burn %s before recording',
    async mismatchedField => {
      const fixture = await buildCandidates();
      await withDeletedFederatedLifecycleState(
        fixture,
        async (replacement, observation) => {
          const collectFreshProducerInputs = vi.fn(async () =>
            candidateProducerInputs(await buildCandidates()));
          const record = vi.fn();
          const processHold = vi.fn();
          const durableHold = vi.fn(incident => {
            expect(incident.failureStage).toBe('candidate_reconciliation');
            replacement.holdFundsReleaseForOperatorReview(incident.reason);
          });
          const [burn] = observation.entries;
          const mismatchedBurn = mismatchedField === 'amount'
            ? { ...burn, amountNanoErg: burn.amountNanoErg + 1n }
            : {
                ...burn,
                ergoRecipientAddress: `0008cd02${'55'.repeat(32)}`,
              };
          const result = await runSubstrateFederatedDaemonLifecycleV1({
            profile: schedulingProfile(fixture, {
              collectFreshProducerInputs,
              state: databaseLossSettlementState(replacement),
            }),
            collectCycle: async () => SCHEDULING_CYCLE,
            reconstructNonAuthorizingState: async cycle => {
              await reconstructSubstrateFederatedDatabaseLossStateV1({
                cycle: {
                  ...cycle,
                  sidechainFinalizedExecutionBlockHashHex:
                    DATABASE_LOSS_EXECUTION_BLOCK_HASH_HEX,
                },
                state: replacement,
                collectCompleteBurnInventory: async () => ({
                  ...observation,
                  entries: [mismatchedBurn],
                }),
              });
            },
            record,
            incidents: {
              latchProcessHold: processHold,
              persistHold: durableHold,
            },
          });

          expect(result.status).toBe('held_non_authorizing');
          expect(processHold).toHaveBeenCalledOnce();
          expect(durableHold).toHaveBeenCalledOnce();
          expect(collectFreshProducerInputs).toHaveBeenCalledOnce();
          expect(record).not.toHaveBeenCalled();
          const reconstructed = replacement.getPegOutByBurnId(
            databaseLossExpectedWork(fixture).burn.burnIdHex,
          );
          expect(reconstructed).toMatchObject(mismatchedField === 'amount'
            ? { amount_nanoerg: (burn.amountNanoErg + 1n).toString() }
            : { ergo_recipient_address: mismatchedBurn.ergoRecipientAddress });
        },
      );
    },
  );

  it('holds an injected database write failure before scheduling', async () => {
    const fixture = await buildCandidates();
    await withDeletedFederatedLifecycleState(
      fixture,
      async (replacement, observation) => {
        const collectFreshProducerInputs = vi.fn(async () =>
          candidateProducerInputs(await buildCandidates()));
        const record = vi.fn();
        const callOrder: string[] = [];
        const firstBurn = observation.entries[0];
        const secondTransactionHashHex = 'ab'.repeat(32);
        const secondLogIndex = firstBurn.sidechainLogIndex + 1;
        const secondBurn = Object.freeze({
          ...firstBurn,
          burnIdHex: deriveTrustlessBurnIdHex({
            sidechainIdHex: firstBurn.sidechainIdHex,
            sidechainTxHashHex: secondTransactionHashHex,
            eventIndex: secondLogIndex,
          }),
          sidechainTransactionHashHex: secondTransactionHashHex,
          sidechainLogIndex: secondLogIndex,
        });
        const originalInsertPegOut = replacement.insertPegOut.bind(replacement);
        let insertCalls = 0;
        const insertPegOut = vi.spyOn(replacement, 'insertPegOut')
          .mockImplementation((...args) => {
            insertCalls += 1;
            if (insertCalls === 2) {
              throw new Error('injected database persistence failure');
            }
            originalInsertPegOut(...args);
          });
        const result = await runSubstrateFederatedDaemonLifecycleV1({
          profile: schedulingProfile(fixture, {
            collectFreshProducerInputs,
            state: databaseLossSettlementState(replacement),
          }),
          collectCycle: async () => SCHEDULING_CYCLE,
          reconstructNonAuthorizingState: async cycle => {
            await reconstructSubstrateFederatedDatabaseLossStateV1({
              cycle: {
                ...cycle,
                sidechainFinalizedExecutionBlockHashHex:
                  DATABASE_LOSS_EXECUTION_BLOCK_HASH_HEX,
              },
              state: replacement,
              collectCompleteBurnInventory: async () => ({
                ...observation,
                entries: [firstBurn, secondBurn],
              }),
            });
          },
          record,
          incidents: {
            latchProcessHold: () => {
              callOrder.push('process');
            },
            persistHold: incident => {
              callOrder.push('durable');
              expect(incident.failureStage).toBe('database_reconstruction');
              replacement.holdFundsReleaseForOperatorReview(incident.reason);
            },
          },
        });
        insertPegOut.mockRestore();

        expect(result.status).toBe('held_non_authorizing');
        expect(callOrder).toEqual(['process', 'durable']);
        expect(collectFreshProducerInputs).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
        expect(replacement.getPegOutByBurnId(
          firstBurn.burnIdHex,
        )).toBeUndefined();
        expect(replacement.getPegOutByBurnId(secondBurn.burnIdHex))
          .toBeUndefined();
      },
    );
  });

  it('rolls back persistence when batch result validation rejects', async () => {
    const fixture = await buildCandidates();
    await withDeletedFederatedLifecycleState(
      fixture,
      async (replacement, observation) => {
        const persistence = createPegOutBackingInventoryPersistence(replacement);
        const malformedPersistence: PegOutBackingInventoryPersistencePort = {
          persistAndRevalidateAll: (entries, validate) =>
            persistence.persistAndRevalidateAll(
              entries,
              () => validate([]),
            ),
        };

        expect(() => reconcileCompletePegOutBackingInventory({
          entries: observation.entries,
          persistence: malformedPersistence,
          scanFromHeight: observation.scanFromHeight,
          pinnedHeight: observation.pinnedHeight,
          pinnedBlockHashHex: observation.pinnedBlockHashHex,
        })).toThrow(
          'complete peg-out inventory persistence result count mismatch',
        );
        expect(replacement.getPegOutByBurnId(
          observation.entries[0].burnIdHex,
        )).toBeUndefined();
      },
    );
  });

  it('holds out-of-order producer observations before recording', async () => {
    const fixture = await buildCandidates();
    const callOrder: string[] = [];
    const record = vi.fn();
    const result = await runSubstrateFederatedDaemonLifecycleV1({
      profile: schedulingProfile(fixture),
      collectCycle: async () => ({
        ...SCHEDULING_CYCLE,
        sidechainFinalizedNativeHeight:
          SCHEDULING_CYCLE.sidechainFinalizedNativeHeight + 1,
      }),
      record,
      incidents: {
        latchProcessHold: () => {
          callOrder.push('process');
        },
        persistHold: incident => {
          callOrder.push('durable');
          expect(incident.failureStage).toBe('producer_collection');
        },
      },
    });

    expect(result.status).toBe('held_non_authorizing');
    expect(callOrder).toEqual(['process', 'durable']);
    expect(record).not.toHaveBeenCalled();
  });

  it('holds divergent source collection before recording', async () => {
    const fixture = await buildCandidates();
    const record = vi.fn();
    const result = await runSubstrateFederatedDaemonLifecycleV1({
      profile: schedulingProfile(fixture, {
        collectFreshProducerInputs: async () => {
          throw new Error('bounded source views disagree');
        },
      }),
      collectCycle: async () => SCHEDULING_CYCLE,
      record,
      incidents: {
        latchProcessHold: vi.fn(),
        persistHold: incident => {
          expect(incident.failureStage).toBe('producer_collection');
          expect(incident.failureDigestHex).toMatch(/^[0-9a-f]{64}$/);
        },
      },
    });

    expect(result.status).toBe('held_non_authorizing');
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an expired mint reservation',
      { mintReservationExpiresBeforeLastUse: true },
    ],
    [
      'a replaced finalized checkpoint target',
      { checkpointTargetReplacedBeforeLastUse: true },
    ],
  ] as const)(
    'reobserves and holds %s before recording',
    async (_label, fixtureOptions) => {
      const fixture = await buildCandidates(fixtureOptions);
      const record = vi.fn();
      const callOrder: string[] = [];
      const result = await runSubstrateFederatedDaemonLifecycleV1({
        profile: schedulingProfile(fixture),
        collectCycle: async () => SCHEDULING_CYCLE,
        record,
        incidents: {
          latchProcessHold: () => {
            callOrder.push('process');
          },
          persistHold: incident => {
            callOrder.push('durable');
            expect(incident.failureStage)
              .toBe('source_generation_revalidation');
          },
        },
      });

      expect(result.status).toBe('held_non_authorizing');
      expect(callOrder).toEqual(['process', 'durable']);
      expect(record).not.toHaveBeenCalled();
    },
  );

  it('holds burn disappearance and transaction drift through the lifecycle root', async () => {
    const revertedFixture = await buildCandidates();
    const driftedFixture = await buildCandidates();
    const reverted = vi.fn();
    const profiles = [
      schedulingProfile(revertedFixture, {
        observeBurn: async () => 'reverted',
        state: settlementState(
          revertedFixture.candidates.burn,
          revertedFixture.settlementPacket,
          vi.fn(),
          reverted,
        ),
      }),
      schedulingProfile(driftedFixture, {
        recollect: async () => ({
          expectedTxId: 'ff'.repeat(32),
          revalidationDigestHex: 'aa'.repeat(32),
        }),
      }),
    ];

    for (const profile of profiles) {
      const record = vi.fn();
      const callOrder: string[] = [];
      const result = await runSubstrateFederatedDaemonLifecycleV1({
        profile,
        collectCycle: async () => SCHEDULING_CYCLE,
        record,
        incidents: {
          latchProcessHold: () => {
            callOrder.push('process');
          },
          persistHold: incident => {
            callOrder.push('durable');
            expect(incident.failureStage).toBe('candidate_reconciliation');
          },
        },
      });

      expect(result.status).toBe('held_non_authorizing');
      expect(callOrder).toEqual(['process', 'durable']);
      expect(record).not.toHaveBeenCalled();
    }
    expect(reverted).toHaveBeenCalledOnce();
  });

  it('holds a burn that disappears during last-use producer recollection', async () => {
    let sourceRecollected = false;
    const fixture = await buildCandidates({
      onMintLastUseRecollection: () => {
        sourceRecollected = true;
      },
    });
    const reverted = vi.fn();
    let burnObservations = 0;
    const record = vi.fn();
    const callOrder: string[] = [];
    const result = await runSubstrateFederatedDaemonLifecycleV1({
      profile: schedulingProfile(fixture, {
        observeBurn: async () => {
          burnObservations += 1;
          if (burnObservations === 1) {
            return 'confirmed';
          }
          expect(sourceRecollected).toBe(true);
          return 'reverted';
        },
        state: settlementState(
          fixture.candidates.burn,
          fixture.settlementPacket,
          vi.fn(),
          reverted,
        ),
      }),
      collectCycle: async () => SCHEDULING_CYCLE,
      record,
      incidents: {
        latchProcessHold: () => {
          callOrder.push('process');
        },
        persistHold: incident => {
          callOrder.push('durable');
          expect(incident.failureStage)
            .toBe('final_candidate_reconciliation');
        },
      },
    });

    expect(result.status).toBe('held_non_authorizing');
    expect(burnObservations).toBe(2);
    expect(reverted).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(['process', 'durable']);
    expect(record).not.toHaveBeenCalled();
  });

  it('holds settlement transaction drift during last-use producer recollection', async () => {
    let sourceRecollected = false;
    const fixture = await buildCandidates({
      onMintLastUseRecollection: () => {
        sourceRecollected = true;
      },
    });
    let recollections = 0;
    const record = vi.fn();
    const callOrder: string[] = [];
    const result = await runSubstrateFederatedDaemonLifecycleV1({
      profile: schedulingProfile(fixture, {
        recollect: async candidate => {
          recollections += 1;
          if (recollections > 1) {
            expect(sourceRecollected).toBe(true);
          }
          const expectedTxId = recollections === 1
            ? candidate.settlementTransactionIdHex
            : 'ff'.repeat(32);
          return {
            expectedTxId,
            revalidationDigestHex: sha256CanonicalJson({
              candidateId: candidate.candidateId,
              expectedTxId,
            }, 'E2S_SUBSTRATE_FEDERATED_DAEMON_REVALIDATION_V1'),
          };
        },
      }),
      collectCycle: async () => SCHEDULING_CYCLE,
      record,
      incidents: {
        latchProcessHold: () => {
          callOrder.push('process');
        },
        persistHold: incident => {
          callOrder.push('durable');
          expect(incident.failureStage)
            .toBe('final_candidate_reconciliation');
        },
      },
    });

    expect(result.status).toBe('held_non_authorizing');
    expect(recollections).toBe(2);
    expect(callOrder).toEqual(['process', 'durable']);
    expect(record).not.toHaveBeenCalled();
  });

  it('holds finalized-cycle collection failure before producer collection', async () => {
    const fixture = await buildCandidates();
    const collectFreshProducerInputs = vi.fn(async () =>
      candidateProducerInputs(await buildCandidates()));
    const record = vi.fn();
    const callOrder: string[] = [];
    const result = await runSubstrateFederatedDaemonLifecycleV1({
      profile: schedulingProfile(fixture, { collectFreshProducerInputs }),
      collectCycle: async () => {
        throw new Error('finalized head source is unavailable');
      },
      record,
      incidents: {
        latchProcessHold: () => {
          callOrder.push('process');
        },
        persistHold: incident => {
          callOrder.push('durable');
          expect(incident.failureStage).toBe('cycle_collection');
        },
      },
    });

    expect(result.status).toBe('held_non_authorizing');
    expect(callOrder).toEqual(['process', 'durable']);
    expect(collectFreshProducerInputs).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ['an Error', () => {
      throw new Error('injected hold persistence failure');
    }],
    ['null', () => {
      throw null;
    }],
  ] as const)(
    'keeps the process hold latched when persistence throws %s',
    async (_failureKind, failPersistence) => {
      const fixture = await buildCandidates();
      const callOrder: string[] = [];
      const record = vi.fn();
      let persistenceError: unknown;
      try {
        await runSubstrateFederatedDaemonLifecycleV1({
          profile: schedulingProfile(fixture, {
            collectFreshProducerInputs: async () => {
              throw new Error('source view is unavailable');
            },
          }),
          collectCycle: async () => SCHEDULING_CYCLE,
          record,
          incidents: {
            latchProcessHold: () => {
              callOrder.push('process');
            },
            persistHold: () => {
              callOrder.push('durable');
              failPersistence();
            },
          },
        });
      } catch (error) {
        persistenceError = error;
      }
      expect(persistenceError).toBeInstanceOf(
        SubstrateFederatedDaemonLifecycleIncidentPersistenceErrorV1,
      );
      expect((persistenceError as Error).message)
        .not.toContain('injected hold persistence failure');
      expect(
        (persistenceError as SubstrateFederatedDaemonLifecycleIncidentPersistenceErrorV1)
          .persistenceFailureDigestHex,
      ).toMatch(/^[0-9a-f]{64}$/);
      expect(callOrder).toEqual(['process', 'durable']);
      expect(record).not.toHaveBeenCalled();
    },
  );

  it('cannot restore scheduling from a copied local observation', async () => {
    const fixture = await buildCandidates();
    let retainedObservation:
      SubstrateFederatedDaemonSchedulingObservationV1 | null = null;
    await runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture),
      cycle: SCHEDULING_CYCLE,
      record: observation => {
        retainedObservation = structuredClone(observation);
      },
    });
    const record = vi.fn();
    const restartedProfile = schedulingProfile(fixture, {
      collectFreshProducerInputs: async () =>
        retainedObservation as never,
    });

    await expect(runSubstrateFederatedDaemonSchedulingV1({
      profile: restartedProfile,
      cycle: SCHEDULING_CYCLE,
      record,
    })).rejects.toThrow(/fresh producer input must contain exactly/i);
    expect(record).not.toHaveBeenCalled();
  });

  it('revalidates original producer ports across every pre-release boundary without authority', async () => {
    const fixture = await buildCandidates();
    const record = vi.fn();
    const incidents = {
      latchProcessHold: vi.fn(),
      persistHold: vi.fn(),
    };
    const result = await runSubstrateFederatedPreReleaseContainmentV1({
      profile: schedulingProfile(fixture),
      collectCycle: async () => SCHEDULING_CYCLE,
      record,
      incidents,
    });

    expect(result.status).toBe('contained_non_authorizing');
    if (result.status !== 'contained_non_authorizing') {
      throw new Error('expected contained federated pre-release result');
    }
    expect(record).toHaveBeenCalledOnce();
    expect(incidents.latchProcessHold).not.toHaveBeenCalled();
    expect(incidents.persistHold).not.toHaveBeenCalled();
    expect(result.trackerAdmission).toMatchObject({
      status: 'tracker_admission_replayed_non_authorizing',
      burnCandidateId: fixture.candidates.burn.candidateId,
      checkpointProfileIdHex:
        fixture.candidates.burn.checkpointProfileIdHex,
      checkpointStatementIdHex:
        fixture.candidates.burn.checkpointStatementIdHex,
      trackerKeyHex: fixture.candidates.burn.trackerKeyHex,
      trackerValueHex: fixture.candidates.burn.trackerValueHex,
      trackerInputDigestHex: fixture.candidates.burn.trackerInputDigestHex,
    });
    expect(result.check).toMatchObject({
      status: 'settlement_packet_replayed_non_authorizing',
      settlementTransactionIdHex:
        fixture.candidates.burn.settlementTransactionIdHex,
      settlementTransactionDigestHex:
        fixture.candidates.burn.settlementTransactionDigestHex,
      trackerAdmissionReceiptDigestHex:
        result.trackerAdmission.receiptDigestHex,
      boundary: {
        localPacketProvenanceVerified: true,
        targetNodeCheckPerformed: false,
        checkPassed: false,
        submissionAuthorized: false,
      },
    });
    expect(result.submissionDenial).toMatchObject({
      status: 'submission_denied_pre_release',
      settlementTransactionIdHex:
        fixture.candidates.burn.settlementTransactionIdHex,
      checkBoundaryReceiptDigestHex: result.check.receiptDigestHex,
      boundary: {
        targetNodeCheckRequiredBeforeAuthorization: true,
        targetNodeCheckPassed: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
      },
    });
    expect(result.boundary).toEqual({
      originalProducerPortsReusedAtEveryBoundary: true,
      trackerAdmissionTransactionBuilt: false,
      targetNodeCheckPerformed: false,
      authorityJournalTransitioned: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
    });
    expect(Object.values(result.revalidations).every(revalidation =>
      revalidation.boundary.originalProducerPortsReused
      && !revalidation.boundary.signingAuthorized
      && !revalidation.boundary.submissionAuthorized
      && !revalidation.boundary.broadcastAuthorized
    )).toBe(true);
  });

  it('rejects a copied scheduling observation at later source revalidation', async () => {
    const fixture = await buildCandidates();
    const result = await runSubstrateFederatedDaemonSchedulingV1({
      profile: schedulingProfile(fixture),
      cycle: SCHEDULING_CYCLE,
      record: vi.fn(),
    });
    expect(result.status).toBe('scheduled_non_authorizing');
    if (result.status !== 'scheduled_non_authorizing') {
      throw new Error('expected scheduled federated observation');
    }

    await expect(
      revalidateSubstrateFederatedDaemonSchedulingObservationV1(
        structuredClone(result.observation),
      ),
    ).rejects.toThrow(/provenance is missing/i);
    await expect(
      revalidateSubstrateFederatedDaemonSchedulingObservationV1(
        result.observation,
      ),
    ).resolves.toMatchObject({
      status: 'current_non_authorizing',
      boundary: {
        originalProducerPortsReused: true,
        sourceGenerationStable: true,
        fundsAuthorityEstablished: false,
      },
    });
  });

  it.each([
    ['burn disappearance', 3, 'pre_tracker_admission_revalidation'],
    ['burn disappearance', 5, 'post_tracker_admission_revalidation'],
    ['burn disappearance', 7, 'post_check_revalidation'],
    ['burn disappearance', 9, 'post_submission_authorization_revalidation'],
    ['source generation conflict', 3, 'pre_tracker_admission_revalidation'],
    ['source generation conflict', 5, 'post_tracker_admission_revalidation'],
    ['source generation conflict', 7, 'post_check_revalidation'],
    ['source generation conflict', 9, 'post_submission_authorization_revalidation'],
  ] as const)(
    'holds %s introduced on source observation %i',
    async (fault, faultObservation, expectedFailureStage) => {
      let burnObservationCalls = 0;
      let sourceGenerationConflictActive = false;
      const fixture = await buildCandidates({
        sourceGenerationConflictActive: () =>
          fault === 'source generation conflict'
          && sourceGenerationConflictActive,
      });
      const holdOrder: string[] = [];
      const reverted = vi.fn();
      const record = vi.fn();
      const result = await runSubstrateFederatedPreReleaseContainmentV1({
        profile: schedulingProfile(fixture, {
          observeBurn: async () => {
            burnObservationCalls += 1;
            if (burnObservationCalls >= faultObservation) {
              sourceGenerationConflictActive = true;
              if (fault === 'burn disappearance') return 'reverted';
            }
            return 'confirmed';
          },
          state: settlementState(
            fixture.candidates.burn,
            fixture.settlementPacket,
            vi.fn(),
            reverted,
          ),
        }),
        collectCycle: async () => SCHEDULING_CYCLE,
        record,
        incidents: {
          latchProcessHold: () => {
            holdOrder.push('process');
          },
          persistHold: incident => {
            holdOrder.push('durable');
            expect(incident.failureStage).toBe(expectedFailureStage);
            expect(incident.boundary).toMatchObject({
              signingAuthorized: false,
              submissionAuthorized: false,
              broadcastAuthorized: false,
              fundsAuthorityEstablished: false,
            });
          },
        },
      });

      expect(result.status).toBe('held_non_authorizing');
      expect(record).toHaveBeenCalledOnce();
      expect(holdOrder).toEqual(['process', 'durable']);
      expect(burnObservationCalls).toBe(faultObservation);
      if (fault === 'burn disappearance') {
        expect(reverted).toHaveBeenCalledOnce();
      } else {
        expect(reverted).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ['asynchronously', async () => {
      await Promise.resolve();
      throw new Error('injected process latch failure');
    }],
    ['with null', () => {
      throw null;
    }],
  ] as const)(
    'persists the hold when the process latch fails %s',
    async (_failureKind, latchProcessHold) => {
      const fixture = await buildCandidates();
      const persistHold = vi.fn();
      let processHoldError: unknown;
      try {
        await runSubstrateFederatedPreReleaseContainmentV1({
          profile: schedulingProfile(fixture, {
            observeBurn: async () => 'reverted',
          }),
          collectCycle: async () => SCHEDULING_CYCLE,
          record: vi.fn(),
          incidents: {
            latchProcessHold,
            persistHold: incident => {
              persistHold(incident);
              expect(incident.failureStage).toBe('candidate_reconciliation');
            },
          },
        });
      } catch (error) {
        processHoldError = error;
      }
      expect(processHoldError).toBeInstanceOf(
        SubstrateFederatedDaemonLifecycleProcessHoldErrorV1,
      );
      expect((processHoldError as Error).message)
        .not.toContain('injected process latch failure');
      expect(
        (processHoldError as SubstrateFederatedDaemonLifecycleProcessHoldErrorV1)
          .processHoldFailureDigestHex,
      ).toMatch(/^[0-9a-f]{64}$/);
      expect(persistHold).toHaveBeenCalledOnce();
    },
  );

  it('retains both failure digests when both hold ports throw null', async () => {
    const fixture = await buildCandidates();
    let processHoldError: unknown;
    try {
      await runSubstrateFederatedPreReleaseContainmentV1({
        profile: schedulingProfile(fixture, {
          observeBurn: async () => 'reverted',
        }),
        collectCycle: async () => SCHEDULING_CYCLE,
        record: vi.fn(),
        incidents: {
          latchProcessHold: () => {
            throw null;
          },
          persistHold: () => {
            throw null;
          },
        },
      });
    } catch (error) {
      processHoldError = error;
    }
    expect(processHoldError).toBeInstanceOf(
      SubstrateFederatedDaemonLifecycleProcessHoldErrorV1,
    );
    const typedError = processHoldError as
      SubstrateFederatedDaemonLifecycleProcessHoldErrorV1;
    expect(typedError.processHoldFailureDigestHex)
      .toMatch(/^[0-9a-f]{64}$/);
    expect(typedError.persistenceFailureDigestHex)
      .toMatch(/^[0-9a-f]{64}$/);
  });

  it('records nothing for unknown, stale, or transaction-drifted burn work', async () => {
    const reverted = vi.fn();
    const unknownFixture = await buildCandidates();
    const revertedFixture = await buildCandidates();
    const staleFixture = await buildCandidates();
    const driftedFixture = await buildCandidates();

    for (const profile of [
      schedulingProfile(unknownFixture, {
        observeBurn: async () => 'unknown',
      }),
      schedulingProfile(revertedFixture, {
        observeBurn: async () => 'reverted',
        state: settlementState(
          revertedFixture.candidates.burn,
          revertedFixture.settlementPacket,
          vi.fn(),
          reverted,
        ),
      }),
      schedulingProfile(staleFixture, {
        ergo: {
          getBlockHeaderHash: async () => 'ff'.repeat(32),
          getBoxByIdOrNull: async () => ({ present: true }),
        },
      }),
      schedulingProfile(driftedFixture, {
        recollect: async () => ({
          expectedTxId: 'ff'.repeat(32),
          revalidationDigestHex: 'aa'.repeat(32),
        }),
      }),
    ]) {
      const record = vi.fn();
      await expect(runSubstrateFederatedDaemonSchedulingV1({
        profile,
        cycle: SCHEDULING_CYCLE,
        record,
      })).rejects.toThrow(
        /freshly revalidated burn candidate|revalidation transaction ID mismatch/i,
      );
      expect(record).not.toHaveBeenCalled();
    }
    expect(reverted).toHaveBeenCalledOnce();
  });

  it('wires scheduling after a complete peg-out scan and before later work', () => {
    const daemonSource = readFileSync(
      new URL('./relayer-daemon.ts', import.meta.url),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const scan = daemonSource.indexOf(
      'completePegOutInventory = await this.processPegOuts(',
    );
    const complete = daemonSource.indexOf(
      'if (completePegOutInventory !== null)',
      scan,
    );
    const schedule = daemonSource.indexOf(
      'await this.scheduleSubstrateFederatedCandidates(',
      complete,
    );
    const laterWork = daemonSource.indexOf(
      'await this.updateSCSOracle(',
      schedule,
    );

    expect(scan).toBeGreaterThan(-1);
    expect(complete).toBeGreaterThan(scan);
    expect(schedule).toBeGreaterThan(complete);
    expect(laterWork).toBeGreaterThan(schedule);
    const schedulingMethod = daemonSource.indexOf(
      'private async scheduleSubstrateFederatedCandidates(',
    );
    const profile = daemonSource.indexOf(
      'const profile = ACTIVE_SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1',
      schedulingMethod,
    );
    const inactive = daemonSource.indexOf(
      'if (profile === null) return',
      profile,
    );
    const runner = daemonSource.indexOf(
      'await runSubstrateFederatedPreReleaseContainmentV1({',
      inactive,
    );
    const cycleCollector = daemonSource.indexOf(
      'collectCycle: async () => {',
      runner,
    );
    const finalizedHead = daemonSource.indexOf(
      'await requestSubstrateFinalizedHeadHash(this.sidechainFinalityRpc)',
      cycleCollector,
    );
    const recoveryRequired = daemonSource.indexOf(
      'this.state.getPegInCircuitBreakerState().continuityRecoveryRequired',
      runner,
    );
    const databaseRecovery = daemonSource.indexOf(
      'await reconstructSubstrateFederatedDatabaseLossStateV1({',
      recoveryRequired,
    );
    const recoveryInventory = daemonSource.indexOf(
      'entries: completeInventory.entries',
      databaseRecovery,
    );
    expect(schedulingMethod).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(schedulingMethod);
    expect(inactive).toBeGreaterThan(profile);
    expect(runner).toBeGreaterThan(inactive);
    expect(cycleCollector).toBeGreaterThan(runner);
    expect(finalizedHead).toBeGreaterThan(cycleCollector);
    expect(recoveryRequired).toBeGreaterThan(finalizedHead);
    expect(databaseRecovery).toBeGreaterThan(recoveryRequired);
    expect(recoveryInventory).toBeGreaterThan(databaseRecovery);
    expect(daemonSource.slice(runner, runner + 100)).toContain('profile,');
    const lifecycleSource = daemonSource.slice(runner, runner + 4_000);
    const processHold = lifecycleSource.indexOf(
      'this.fundsReleaseHoldOpen = true',
    );
    const durableHold = lifecycleSource.indexOf(
      'this.state.holdFundsReleaseForOperatorReview(',
    );
    expect(processHold).toBeGreaterThan(-1);
    expect(durableHold).toBeGreaterThan(processHold);
  });
});
