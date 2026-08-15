import { createHash } from 'crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./authenticated-settlement-candidate.js', () => ({
  assertNativeVerifiedAuthenticatedSettlementCandidateProvenance: vi.fn(),
}));
vi.mock('./authenticated-settlement-check-admission.js', () => ({
  assertAuthenticatedSettlementCheckAdmissionProvenance: vi.fn(),
}));
vi.mock('./authenticated-v2-dup-reconstruction.js', () => ({
  assertAuthenticatedV2DupReconstructionProvenance: vi.fn(),
}));
vi.mock('./authenticated-v2-vault-reconstruction.js', () => ({
  AUTHENTICATED_V2_VAULT_MAX_BOXES: 4_096,
  assertAuthenticatedV2VaultReconstructionProvenance: vi.fn(),
}));
vi.mock('./aggregate-settlement-ergo-observation.js', () => ({
  AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE:
    'e2s.aggregate-settlement-ergo-source-authority.v2',
  assertMatchingAggregateSettlementErgoObservationConsensusProvenance: vi.fn(),
  assertStableAggregateSettlementErgoObservationProvenance: vi.fn(),
}));
vi.mock('./authenticated-settlement-transport-attempt.js', async () => {
  const actual = await vi.importActual<
    typeof import('./authenticated-settlement-transport-attempt.js')
  >('./authenticated-settlement-transport-attempt.js');
  return {
    ...actual,
    assertAuthenticatedSettlementTransportAttemptAdmissionProvenance:
      vi.fn(),
  };
});

import { getDupTreeDigest } from './avl-bridge.js';
import {
  AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
} from './authenticated-settlement-candidate-schema.js';
import {
  AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA,
  deriveAuthenticatedSettlementCandidateAuthorityDigest,
} from './authenticated-settlement-execution-reservation.js';
import {
  AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION,
  AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA,
  deriveAuthenticatedSettlementTransportAttemptIdentity,
  type AuthenticatedSettlementTransportAttemptAdmission,
} from './authenticated-settlement-transport-attempt.js';
import {
  deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-payout-binding.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerValue,
} from './spv-tracker-authenticated.js';
import { getSpvTrackerDigest } from './spv-tracker.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import { createAggregateSettlementErgoObservationRecord } from './aggregate-settlement-ergo-finality-policy.js';
import type {
  MatchingAggregateSettlementErgoObservationConsensus,
  StableAggregateSettlementErgoObservation,
} from './aggregate-settlement-ergo-observation.js';
import {
  createLocalContinuityWitnessText,
  pegInLifecycleDigestHex,
  StateTracker,
  type AuthenticatedSettlementCandidateInput,
  type AuthenticatedSpvTrackerHistoryEntry,
  type SpvTrackerHistoryEntry,
} from './state-tracker.js';
import {
  createPegInCommitmentReceipt,
  parsePegInCommitmentReceiptJson,
  pegInCommitmentReceiptDigestHex,
  pegInCommitmentReceiptJson,
} from './peg-in-commitment-receipt.js';
import {
  DUP_HEARTBEAT_OPERATION_PROFILE,
  SCS_ORACLE_UPDATE_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  reconcileCompletePegOutBackingInventory,
} from './relayer-core/peg-out-backing-inventory.js';
import {
  createPegOutBackingInventoryPersistence,
} from './adapters/peg-out-backing-inventory-state.js';
import {
  PEG_IN_MINT_FEE_POLICY_ID,
  PEG_IN_MINT_TRANSPORT_SCHEMA,
} from './relayer-core/peg-in-mint-transport-lifecycle.js';

function pegInCommitmentVerification(
  transactionIdHex: string,
  height: number,
  headerIdHex = '44'.repeat(32),
  overrides: Record<string, unknown> = {},
) {
  return {
    headerIdHex,
    height,
    blockVersion: 2,
    transactionsRootHex: '55'.repeat(32),
    transactionIdHex,
    transactionSigmaDigestHex: '66'.repeat(32),
    transactionIndex: 0,
    transactionCount: 1,
    headerIdMatchedCanonicalBytes: true as const,
    transactionsRootMatchedCanonicalHeaderBytes: true as const,
    transactionRootMatched: true as const,
    ...overrides,
  };
}

function pegInCommitmentConfirmation(
  transactionIdHex: string,
  height: number,
  headerIdHex = '44'.repeat(32),
  overrides: Record<string, unknown> = {},
) {
  return {
    inclusionHeight: height,
    inclusionHeaderId: headerIdHex,
    verification: pegInCommitmentVerification(
      transactionIdHex,
      height,
      headerIdHex,
      overrides,
    ),
  };
}

function withTrackerDb(run: (tracker: StateTracker) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-state-test-'));
  const tracker = new StateTracker(join(dir, 'state.sqlite'));
  try {
    run(tracker);
  } finally {
    tracker.close();
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}

function withTrackerDbPath(run: (dbPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-state-test-'));
  try {
    run(join(dir, 'state.sqlite'));
  } finally {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}

const readOnlyError = /read-only mode/;
const authenticatedSidechainId = 'a0'.repeat(32);

function establishTestFundsReleaseContinuity(
  tracker: StateTracker,
): ReturnType<StateTracker['assertFundsReleaseAuthorized']> {
  const rawDb = (tracker as unknown as { db: Database.Database }).db;
  rawDb.exec(`
    DROP TRIGGER local_continuity_state_no_update;
    UPDATE local_continuity_state SET status = 'established' WHERE id = 1;
    CREATE TRIGGER local_continuity_state_no_update
    BEFORE UPDATE ON local_continuity_state
    BEGIN
      SELECT RAISE(ABORT, 'local continuity state is immutable without reviewed recovery');
    END;
  `);
  const continuityIdentity = rawDb.prepare(`
    SELECT identity_hex
    FROM local_continuity_identity
    WHERE id = 1
  `).get() as { identity_hex: string };
  const continuityPath = (
    tracker as unknown as { fundsReleaseContinuityPath: string | null }
  ).fundsReleaseContinuityPath;
  if (continuityPath !== null) {
    const suffix = '.funds-release-continuity';
    if (!continuityPath.endsWith(suffix)) {
      throw new Error('unexpected test continuity witness path');
    }
    writeFileSync(
      continuityPath,
      createLocalContinuityWitnessText(
        continuityIdentity.identity_hex,
        continuityPath.slice(0, -suffix.length),
      ),
      { encoding: 'utf8', mode: 0o600 },
    );
  }
  const holdPath = (
    tracker as unknown as { fundsReleaseHoldPath: string | null }
  ).fundsReleaseHoldPath;
  if (holdPath !== null && existsSync(holdPath)) {
    unlinkSync(holdPath);
  }
  tracker.acquireFundsExecutionAuthority();
  return tracker.assertFundsReleaseAuthorized();
}

function markPendingAggregateSettlementSubmitted(
  tracker: StateTracker,
  transactionId: string,
): boolean {
  const attempt = tracker.getAggregateSettlementAttempt(transactionId);
  if (!attempt || attempt.status !== 'pending') {
    throw new Error(`pending aggregate settlement attempt not found: ${transactionId}`);
  }
  const reservation = tracker.startPendingAggregateSettlementSubmission({
    expectedTxId: attempt.expectedTxId,
    lifecycleVersion: attempt.lifecycleVersion,
    mode: attempt.mode,
    burnTxHashes: attempt.burnTxHashes,
  });
  return tracker.markAggregateSettlementAttemptSubmitted(reservation, transactionId);
}

function stableFinalObservation(
  transactionIdHex: string,
  options: {
    transactionDigestHex?: string;
    inclusionHeight?: number;
    inclusionHeaderIdHex?: string;
    observedTipHeight?: number;
    observedTipHeaderIdHex?: string;
    confirmations?: number;
  } = {},
): StableAggregateSettlementErgoObservation {
  const record = createAggregateSettlementErgoObservationRecord({
    policyVersion: 1,
    requiredConfirmations: 10,
    status: 'confirmed_final',
    transactionIdHex,
    transactionDigestHex: options.transactionDigestHex ?? 'e1'.repeat(32),
    inclusionHeight: options.inclusionHeight ?? 100,
    inclusionHeaderIdHex: options.inclusionHeaderIdHex ?? 'e2'.repeat(32),
    observedTipHeight: options.observedTipHeight ?? 109,
    observedTipHeaderIdHex: options.observedTipHeaderIdHex ?? 'e3'.repeat(32),
    confirmations: options.confirmations ?? 10,
  });
  return { record, transaction: Object.freeze({ id: transactionIdHex }) };
}

function stablePreFinalObservation(transactionIdHex: string): StableAggregateSettlementErgoObservation {
  const record = createAggregateSettlementErgoObservationRecord({
    policyVersion: 1,
    requiredConfirmations: 10,
    status: 'confirmed_pre_finality',
    transactionIdHex,
    transactionDigestHex: 'e1'.repeat(32),
    inclusionHeight: 101,
    inclusionHeaderIdHex: 'e2'.repeat(32),
    observedTipHeight: 109,
    observedTipHeaderIdHex: 'e3'.repeat(32),
    confirmations: 9,
  });
  return { record, transaction: Object.freeze({ id: transactionIdHex }) };
}

function stableAbsentObservation(transactionIdHex: string): StableAggregateSettlementErgoObservation {
  const record = createAggregateSettlementErgoObservationRecord({
    policyVersion: 1,
    requiredConfirmations: 10,
    status: 'absent',
    transactionIdHex,
    transactionDigestHex: null,
    inclusionHeight: null,
    inclusionHeaderIdHex: null,
    observedTipHeight: 109,
    observedTipHeaderIdHex: 'e3'.repeat(32),
    confirmations: 0,
  });
  return { record, transaction: null };
}

function spvTrackerSuccessorDigest(
  entries: Array<{ keyHex: string; valueHex: string }> = [],
): string {
  return getSpvTrackerDigest(entries.map(entry => ({
    key: entry.keyHex,
    value: entry.valueHex,
  })));
}

function matchingObservationConsensus(
  observation: StableAggregateSettlementErgoObservation,
): MatchingAggregateSettlementErgoObservationConsensus {
  return {
    sourceAuthorityProfile: 'e2s.aggregate-settlement-ergo-source-authority.v2',
    record: observation.record,
    sourceIdsHex: Object.freeze(['f1'.repeat(32), 'f2'.repeat(32)]),
    sourceCount: 2,
    consensusDigestHex: 'f3'.repeat(32),
  };
}

const authenticatedTransportSidechainBlockHash = '7f'.repeat(32);
const authenticatedTransportRecipientErgoTree = `0008cd02${'96'.repeat(32)}`;
const authenticatedTransportAuthority = Object.freeze({
  executionReservationDigestHex: '71'.repeat(32),
  candidateId: '72'.repeat(32),
  burnTxHash: '74'.repeat(32),
  burnId: deriveTrustlessBurnIdHex({
    sidechainIdHex: authenticatedSidechainId,
    sidechainTxHashHex: '74'.repeat(32),
    eventIndex: 0,
  }),
  expectedTxId: '75'.repeat(32),
  unsignedTxDigestHex: '76'.repeat(32),
  unsignedPackageDigestHex: '77'.repeat(32),
  trackerBoxId: '79'.repeat(32),
  duplicatePreventionBoxId: '7a'.repeat(32),
  vaultBoxId: '7b'.repeat(32),
  signedTransactionDigestHex: '7c'.repeat(32),
  preSubmitRevalidationDigestHex: '7d'.repeat(32),
  broadcastAuthorizationDigestHex: '7e'.repeat(32),
  payoutDigestHex:
    deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest({
      candidateId: '72'.repeat(32),
      burnId: deriveTrustlessBurnIdHex({
        sidechainIdHex: authenticatedSidechainId,
        sidechainTxHashHex: '74'.repeat(32),
        eventIndex: 0,
      }),
      sidechainId: authenticatedSidechainId,
      burnTxHash: '74'.repeat(32),
      sidechainHeight: 100n,
      executionBlockHash: authenticatedTransportSidechainBlockHash,
      eventIndex: 0,
      amountNanoErg: 1_000_000n,
      recipientErgoTreeHex: authenticatedTransportRecipientErgoTree,
      vaultBoxId: '7b'.repeat(32),
    }),
});

function seedAuthenticatedTransportAuthority(
  dbPath: string,
): AuthenticatedSettlementTransportAttemptAdmission {
  const initialize = new StateTracker(dbPath);
  initialize.insertPegOut(
    authenticatedTransportAuthority.burnTxHash,
    authenticatedTransportRecipientErgoTree,
    1_000_000n,
    100,
    {
      sidechainId: authenticatedSidechainId,
      sidechainBlockHash: authenticatedTransportSidechainBlockHash,
      sidechainLogIndex: 0,
    },
  );
  initialize.close();
  const db = new Database(dbPath);
  try {
    db.prepare(`
      INSERT INTO authenticated_settlement_candidates (
        candidate_schema_version,
        candidate_id,
        burn_id,
        burn_tx_hash,
        sidechain_id,
        sidechain_height,
        sidechain_block_hash,
        sidechain_log_index,
        tracker_key,
        tracker_value,
        tracker_box_id,
        anchor_header_id,
        anchor_header_height,
        dup_input_box_id,
        dup_input_digest,
        vault_box_id,
        unsigned_tx_digest,
        creation_height,
        observed_sidechain_tip,
        observed_ergo_tip,
        status,
        check_expected_tx_id,
        check_unsigned_package_digest,
        check_signed_transaction_digest,
        check_response_digest,
        check_signer_context_digest,
        check_checker_identity_digest,
        check_revalidation_digest,
        check_native_verification_request_digest,
        check_trust_anchor_digest,
        check_finality_horizon_hash,
        check_finality_horizon_height,
        check_finality_statement_digest,
        check_finality_program_id,
        check_finality_proof_system_id,
        check_finality_verifier_profile_id,
        check_finality_proof_payload_digest,
        check_finality_proof_digest,
        check_stable_ergo_view_digest,
        check_stable_sidechain_view_digest,
        check_admission_digest
      ) VALUES (
        @schemaVersion, @candidateId, @burnId, @burnTxHash, @sidechainId,
        '100', @sidechainBlockHash, 0, @trackerKey, @trackerValue,
        @trackerBoxId, @anchorHeaderId, 100, @dupInputBoxId, @dupInputDigest,
        @vaultBoxId, @unsignedTxDigest, 100, '110', 110, 'check_passed',
        @expectedTxId, @unsignedPackageDigest, @signedTransactionDigest,
        @checkResponseDigest, @signerContextDigest, @checkerIdentityDigest,
        @revalidationDigest, @nativeRequestDigest, @trustAnchorDigest,
        @finalityHorizonHash, '100', @finalityStatementDigest,
        @finalityProgramId, 1, @finalityVerifierProfileId,
        @finalityProofPayloadDigest, @finalityProofDigest,
        @stableErgoViewDigest, @stableSidechainViewDigest, @checkAdmissionDigest
      )
    `).run({
      schemaVersion: AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
      candidateId: authenticatedTransportAuthority.candidateId,
      burnId: authenticatedTransportAuthority.burnId,
      burnTxHash: authenticatedTransportAuthority.burnTxHash,
      sidechainId: authenticatedSidechainId,
      sidechainBlockHash: authenticatedTransportSidechainBlockHash,
      trackerKey: '80'.repeat(32),
      trackerValue: '81'.repeat(66),
      trackerBoxId: authenticatedTransportAuthority.trackerBoxId,
      anchorHeaderId: '82'.repeat(32),
      dupInputBoxId: authenticatedTransportAuthority.duplicatePreventionBoxId,
      dupInputDigest: '83'.repeat(33),
      vaultBoxId: authenticatedTransportAuthority.vaultBoxId,
      unsignedTxDigest: authenticatedTransportAuthority.unsignedTxDigestHex,
      expectedTxId: authenticatedTransportAuthority.expectedTxId,
      unsignedPackageDigest:
        authenticatedTransportAuthority.unsignedPackageDigestHex,
      signedTransactionDigest:
        authenticatedTransportAuthority.signedTransactionDigestHex,
      checkResponseDigest: '84'.repeat(32),
      signerContextDigest: '85'.repeat(32),
      checkerIdentityDigest: '86'.repeat(32),
      revalidationDigest: '87'.repeat(32),
      nativeRequestDigest: '88'.repeat(32),
      trustAnchorDigest: '89'.repeat(32),
      finalityHorizonHash: '8a'.repeat(32),
      finalityStatementDigest: '8b'.repeat(32),
      finalityProgramId: '8c'.repeat(32),
      finalityVerifierProfileId: '8d'.repeat(32),
      finalityProofPayloadDigest: '8e'.repeat(32),
      finalityProofDigest: '91'.repeat(32),
      stableErgoViewDigest: '92'.repeat(32),
      stableSidechainViewDigest: '93'.repeat(32),
      checkAdmissionDigest: '94'.repeat(32),
    });
  } finally {
    db.close();
  }
  const authorityState = new StateTracker(dbPath);
  const candidate = authorityState.getAuthenticatedSettlementCandidate(
    authenticatedTransportAuthority.candidateId,
  );
  authorityState.close();
  if (!candidate) {
    throw new Error('authenticated transport authority candidate seed failed');
  }
  const reservationDb = new Database(dbPath);
  try {
    reservationDb.prepare(`
      INSERT INTO authenticated_settlement_execution_reservations (
        schema,
        reservation_digest,
        candidate_id,
        candidate_authority_digest,
        burn_id,
        burn_tx_hash,
        amount_nanoerg,
        recipient_ergo_tree,
        dup_input_box_id,
        vault_box_id,
        expected_tx_id,
        unsigned_tx_digest,
        unsigned_package_digest,
        signed_transaction_digest,
        check_response_digest,
        signer_context_digest,
        checker_identity_digest,
        revalidation_digest,
        stable_ergo_view_digest,
        stable_sidechain_view_digest,
        finality_proof_digest,
        check_admission_digest,
        authorization_digest
      ) VALUES (?, ?, ?, ?, ?, ?, '1000000', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA,
      authenticatedTransportAuthority.executionReservationDigestHex,
      authenticatedTransportAuthority.candidateId,
      deriveAuthenticatedSettlementCandidateAuthorityDigest(candidate),
      authenticatedTransportAuthority.burnId,
      authenticatedTransportAuthority.burnTxHash,
      authenticatedTransportRecipientErgoTree,
      authenticatedTransportAuthority.duplicatePreventionBoxId,
      authenticatedTransportAuthority.vaultBoxId,
      authenticatedTransportAuthority.expectedTxId,
      authenticatedTransportAuthority.unsignedTxDigestHex,
      authenticatedTransportAuthority.unsignedPackageDigestHex,
      authenticatedTransportAuthority.signedTransactionDigestHex,
      '84'.repeat(32),
      '85'.repeat(32),
      '86'.repeat(32),
      '87'.repeat(32),
      '92'.repeat(32),
      '93'.repeat(32),
      '91'.repeat(32),
      '94'.repeat(32),
      '97'.repeat(32),
    );
  } finally {
    reservationDb.close();
  }
  const identity = deriveAuthenticatedSettlementTransportAttemptIdentity(
    authenticatedTransportAuthority,
  );
  return Object.freeze({
    schema: AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA,
    lifecycleVersion:
      AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION,
    ...authenticatedTransportAuthority,
    ...identity,
  });
}

function authenticatedEntry(
  overrides: Partial<AuthenticatedSpvTrackerHistoryEntry> = {},
): AuthenticatedSpvTrackerHistoryEntry {
  const core = {
    sidechainId: overrides.sidechainId ?? authenticatedSidechainId,
    sidechainHeight: overrides.sidechainHeight ?? 1234n,
    executionBlockHash: overrides.executionBlockHash ?? '33'.repeat(32),
    bridgeEventRoot: overrides.bridgeEventRoot ?? '44'.repeat(32),
    anchorHeaderId: overrides.anchorHeaderId ?? '66'.repeat(32),
    anchorHeaderHeight: overrides.anchorHeaderHeight ?? 330_000,
  };
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: core.sidechainId,
    sidechainHeight: core.sidechainHeight,
    sidechainConsensusBlockHashHex: '22'.repeat(32),
    executionBlockHashHex: core.executionBlockHash,
    bridgeEventRootHex: core.bridgeEventRoot,
    burnLeafCount: 1,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '55'.repeat(32),
    finalityProofHashHex: '56'.repeat(32),
  });
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '57'.repeat(32),
    finalityHorizonHeight: core.sidechainHeight,
    finalityHorizonHashHex: '58'.repeat(32),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: '59'.repeat(32),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from('state-tracker-authenticated-history-proof', 'ascii'),
  });
  const commitment = buildAggregateFinalityCommitmentV1(proof);
  const metadata = {
    ...core,
    checkpointCommitment:
      overrides.checkpointCommitment ?? checkpoint.checkpointCommitmentHex,
  };
  return {
    ...metadata,
    keyHex: overrides.keyHex ?? deriveAuthenticatedSpvTrackerKey({
      sidechainIdHex: metadata.sidechainId,
      sidechainHeight: metadata.sidechainHeight,
      executionBlockHashHex: metadata.executionBlockHash,
    }),
    valueHex: overrides.valueHex ?? encodeAuthenticatedSpvTrackerValue({
      bridgeEventRootHex: metadata.bridgeEventRoot,
      checkpointCommitmentHex: metadata.checkpointCommitment,
      anchorHeaderIdHex: metadata.anchorHeaderId,
      anchorHeaderHeight: metadata.anchorHeaderHeight,
      finalityProofSystemId: commitment.proofSystemId,
      finalityStatementDigestHex: commitment.statementDigestHex,
      finalityProgramIdHex: commitment.statement.programIdHex,
      finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
      finalityProofPayloadDigestHex: commitment.payloadDigestHex,
      finalityProofDigestHex: commitment.proofDigestHex,
    }),
  };
}

function authenticatedCandidate(
  overrides: Partial<AuthenticatedSettlementCandidateInput> = {},
): AuthenticatedSettlementCandidateInput {
  const entry = authenticatedEntry({
    sidechainId: overrides.sidechainId,
    sidechainHeight: overrides.sidechainHeight,
    executionBlockHash: overrides.sidechainBlockHash,
  });
  const burnTxHash = overrides.burnTxHash ?? '91'.repeat(32);
  const sidechainLogIndex = overrides.sidechainLogIndex ?? 7;
  const burnId = overrides.burnId ?? deriveTrustlessBurnIdHex({
    sidechainIdHex: entry.sidechainId,
    sidechainTxHashHex: burnTxHash,
    eventIndex: sidechainLogIndex,
  });
  return {
    schemaVersion: overrides.schemaVersion
      ?? AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
    candidateId: overrides.candidateId ?? '90'.repeat(32),
    burnId,
    burnTxHash,
    sidechainId: entry.sidechainId,
    sidechainHeight: entry.sidechainHeight,
    sidechainBlockHash: entry.executionBlockHash,
    sidechainLogIndex,
    trackerKey: overrides.trackerKey ?? entry.keyHex,
    trackerValue: overrides.trackerValue ?? entry.valueHex,
    trackerBoxId: overrides.trackerBoxId ?? '92'.repeat(32),
    anchorHeaderId: overrides.anchorHeaderId ?? entry.anchorHeaderId,
    anchorHeaderHeight: overrides.anchorHeaderHeight ?? entry.anchorHeaderHeight,
    dupInputBoxId: overrides.dupInputBoxId ?? '93'.repeat(32),
    dupInputDigest: overrides.dupInputDigest ?? '94'.repeat(33),
    vaultBoxId: overrides.vaultBoxId ?? '95'.repeat(32),
    unsignedTxDigest: overrides.unsignedTxDigest ?? '96'.repeat(32),
    creationHeight: overrides.creationHeight ?? entry.anchorHeaderHeight + 10,
    observedSidechainTip: overrides.observedSidechainTip ?? entry.sidechainHeight + 50n,
    observedErgoTip: overrides.observedErgoTip ?? entry.anchorHeaderHeight + 20,
  };
}

function authenticatedCheckAdmission(
  candidateId: string,
  overrides: Partial<{
    expectedTxId: string;
    unsignedPackageDigestHex: string;
    signedTransactionDigestHex: string;
    checkResponseDigestHex: string;
    signerContextDigestHex: string;
    checkerIdentityDigestHex: string;
    revalidationDigestHex: string;
    nativeVerificationRequestDigestHex: string;
    trustAnchorDigestHex: string;
    finalityHorizonHashHex: string;
    finalityHorizonHeight: bigint;
    finalityStatementDigestHex: string;
    finalityProgramIdHex: string;
    finalityProofSystemId: number;
    finalityVerifierProfileIdHex: string;
    finalityProofPayloadDigestHex: string;
    finalityProofDigestHex: string;
    stableErgoViewDigestHex: string;
    stableSidechainViewDigestHex: string;
    admissionDigestHex: string;
  }> = {},
) {
  return {
    candidateId,
    expectedTxId: overrides.expectedTxId ?? 'a1'.repeat(32),
    unsignedPackageDigestHex: overrides.unsignedPackageDigestHex ?? 'a0'.repeat(32),
    signedTransactionDigestHex: overrides.signedTransactionDigestHex ?? 'af'.repeat(32),
    checkResponseDigestHex: overrides.checkResponseDigestHex ?? 'a2'.repeat(32),
    signerContextDigestHex: overrides.signerContextDigestHex ?? 'b3'.repeat(32),
    checkerIdentityDigestHex: overrides.checkerIdentityDigestHex ?? 'b4'.repeat(32),
    revalidationDigestHex: overrides.revalidationDigestHex ?? 'a3'.repeat(32),
    nativeVerificationRequestDigestHex:
      overrides.nativeVerificationRequestDigestHex ?? 'a4'.repeat(32),
    trustAnchorDigestHex: overrides.trustAnchorDigestHex ?? 'a5'.repeat(32),
    finalityHorizonHashHex: overrides.finalityHorizonHashHex ?? 'a6'.repeat(32),
    finalityHorizonHeight: overrides.finalityHorizonHeight ?? 1_300n,
    finalityStatementDigestHex:
      overrides.finalityStatementDigestHex ?? 'a7'.repeat(32),
    finalityProgramIdHex: overrides.finalityProgramIdHex ?? 'a8'.repeat(32),
    finalityProofSystemId: overrides.finalityProofSystemId ?? 1,
    finalityVerifierProfileIdHex:
      overrides.finalityVerifierProfileIdHex ?? 'a9'.repeat(32),
    finalityProofPayloadDigestHex:
      overrides.finalityProofPayloadDigestHex ?? 'aa'.repeat(32),
    finalityProofDigestHex: overrides.finalityProofDigestHex ?? 'ab'.repeat(32),
    stableErgoViewDigestHex: overrides.stableErgoViewDigestHex ?? 'ac'.repeat(32),
    stableSidechainViewDigestHex:
      overrides.stableSidechainViewDigestHex ?? 'ad'.repeat(32),
    admissionDigestHex: overrides.admissionDigestHex ?? 'ae'.repeat(32),
  } as any;
}

function insertCandidatePegOut(
  tracker: StateTracker,
  candidate: AuthenticatedSettlementCandidateInput,
): void {
  tracker.insertPegOut(
    candidate.burnTxHash,
    `02${'97'.repeat(32)}`,
    1_000_000n,
    Number(candidate.sidechainHeight),
    {
      user: `0x${'98'.repeat(20)}`,
      sidechainId: candidate.sidechainId,
      sidechainBlockHash: candidate.sidechainBlockHash,
      sidechainLogIndex: candidate.sidechainLogIndex,
    },
  );
}

const authenticatedDupCacheIdentity = Object.freeze({
  duplicatePreventionNftIdHex: 'b1'.repeat(32),
  duplicatePreventionErgoTreeHex: `1008cd02${'b2'.repeat(32)}`,
});

function authenticatedDupReconstruction(input: {
  tipBoxId: string;
  tipDigest: string;
  historyKey?: string;
  observationDigest?: string;
}) {
  const historyKeys = input.historyKey ? [input.historyKey] : [];
  return {
    ...authenticatedDupCacheIdentity,
    genesisBoxIdHex: 'b3'.repeat(32),
    tipBoxIdHex: input.tipBoxId,
    tipDigestHex: input.tipDigest,
    tipCounter: String(historyKeys.length),
    authoritySigmaPropRegisterHex: 'b4',
    historyKeys,
    transitions: input.historyKey ? [{
      burnIdHex: input.historyKey,
      spendingTransactionIdHex: 'b5'.repeat(32),
      spendingBlockIdHex: 'b6'.repeat(32),
      spendingInclusionHeight: 90,
      dupInputBoxIdHex: 'b3'.repeat(32),
      dupSuccessorBoxIdHex: input.tipBoxId,
      vaultInputBoxIdHex: 'b7'.repeat(32),
      vaultSuccessorBoxIdHex: null,
      payoutBoxIdHex: 'b8'.repeat(32),
      payoutValueNanoErg: '1000000',
      minerFeeNanoErg: '1000000',
      successorDigestHex: input.tipDigest,
    }] : [],
    tipSigmaSerializedHex: 'b9',
    tipSigmaSerializedSha256Hex: 'ba'.repeat(32),
    observedTip: {
      idHex: 'bb'.repeat(32),
      parentIdHex: 'bc'.repeat(32),
      height: 100,
      extensionRootHex: 'bd'.repeat(32),
    },
    indexedHeight: 100,
    fullHeight: 100,
    observationDigestHex: input.observationDigest ?? 'be'.repeat(32),
    distinctSourceAgreement: true,
  } as any;
}

const authenticatedVaultCacheIdentity = Object.freeze({
  vaultAddress: `9${'A'.repeat(50)}`,
  vaultErgoTreeHex: `1008cd02${'c0'.repeat(32)}`,
});

function authenticatedVaultReconstruction(input: {
  currentBoxIds?: string[];
  observationDigest?: string;
  observedTipId?: string;
}) {
  const currentBoxIds = input.currentBoxIds ?? ['c1'.repeat(32), 'c2'.repeat(32)];
  const spentBoxId = 'c3'.repeat(32);
  const spendingTransactionId = 'c4'.repeat(32);
  const allBoxIds = [...currentBoxIds, spentBoxId];
  const boxes = allBoxIds.map((boxId, index) => {
    const current = currentBoxIds.includes(boxId);
    const sigmaSerializedHex = `${(0xf0 + index).toString(16)}`;
    return {
      boxIdHex: boxId,
      transactionIdHex: `${(0xd0 + index).toString(16)}`.repeat(32),
      outputIndex: index,
      creationHeight: 90 + index,
      valueNanoErg: String(5_000_000 + index),
      ergoTreeHex: authenticatedVaultCacheIdentity.vaultErgoTreeHex,
      assets: [],
      additionalRegisters: {
        R4: `0e20${`${(0xe0 + index).toString(16)}`.repeat(32)}`,
        R5: `0e14${'e5'.repeat(20)}`,
        R6: '05a0c21e',
        R7: `0e22${`1008cd02${'e6'.repeat(32)}`}`,
      },
      depositIdHex: `${(0xe0 + index).toString(16)}`.repeat(32),
      targetEvmAddressHex: 'e5'.repeat(20),
      originalAmountNanoErg: '5000000',
      provenanceHex: `1008cd02${'e6'.repeat(32)}`,
      spentTransactionIdHex: current ? null : spendingTransactionId,
      sigmaSerializedHex,
      sigmaSerializedSha256Hex: createHash('sha256')
        .update(Buffer.from(sigmaSerializedHex, 'hex'))
        .digest('hex'),
      currentUtxoBinaryMatched: current,
    };
  });
  return {
    schema: 'e2s.authenticated-v2-vault-reconstruction.v1',
    network: 'testnet',
    ...authenticatedVaultCacheIdentity,
    duplicatePreventionObservationDigestHex: 'a5'.repeat(32),
    duplicatePreventionTipBoxIdHex: 'a6'.repeat(32),
    stableSnapshot: {
      indexedHeight: 100,
      fullHeight: 100,
      bestHeader: {
        idHex: input.observedTipId ?? 'a7'.repeat(32),
        parentIdHex: 'a8'.repeat(32),
        height: 100,
        extensionRootHex: 'a9'.repeat(32),
      },
    },
    boxes,
    currentUnspentBoxIdsHex: currentBoxIds,
    rootBoxIdsHex: allBoxIds,
    unresolvedRootProvenanceBoxIdsHex: allBoxIds,
    transitions: [{
      burnIdHex: 'aa'.repeat(32),
      spendingTransactionIdHex: spendingTransactionId,
      inputBoxIdHex: spentBoxId,
      successorBoxIdHex: null,
      payoutBoxIdHex: 'ab'.repeat(32),
      payoutValueNanoErg: '3000000',
      minerFeeNanoErg: '1000000',
    }],
    observationDigestHex: input.observationDigest ?? 'ac'.repeat(32),
    observedAt: '2026-07-15T10:00:00.000Z',
    sources: { primary: 'primary', witness: 'witness' },
    distinctSourceAgreement: true,
    boundary: {
      completeIndexedAddressHistoryMatched: true,
      currentUtxoSetAndCanonicalBinaryMatched: true,
      duplicatePreventionLineageBoundEverySpend: true,
      sameErgoSnapshotAsDuplicatePreventionHistory: true,
      rootCreationProvenanceRequiresSeparateProof: true,
      localPersistenceIsNotAuthority: true,
      noCandidateCheckSignatureSubmissionOrBroadcastAuthority: true,
      distinctOriginsDoNotProveIndependentOperation: true,
    },
  } as any;
}

describe('StateTracker committed-vault peg-in lifecycle', () => {
  const boxId = '11'.repeat(32);
  const commitTxId = '22'.repeat(32);
  const vaultBoxId = '33'.repeat(32);

  it('rejects receipts outside the exact WP-01C verification shape', () => {
    const input = {
      sourceBoxIdHex: boxId,
      committedVaultBoxIdHex: vaultBoxId,
      commitmentTxIdHex: commitTxId,
      verification: pegInCommitmentVerification(commitTxId, 330_010),
    };
    expect(() => createPegInCommitmentReceipt({
      ...input,
      verification: {
        ...input.verification,
        blockVersion: 0,
      },
    })).toThrow('receipt block version must be a safe integer between 1 and 127');
    expect(() => createPegInCommitmentReceipt({
      ...input,
      verification: {
        ...input.verification,
        transactionRootMatched: false,
      },
    })).toThrow('must retain all WP-01C verification results');

    const receiptWithExtraKey = JSON.stringify({
      ...createPegInCommitmentReceipt(input),
      extra: true,
    });
    expect(() => parsePegInCommitmentReceiptJson(receiptWithExtraKey))
      .toThrow('must contain exactly');
  });

  it('persists the consume-confirm-mint progression and returns typed rows', () => {
    withTrackerDb((tracker) => {
      tracker.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
        '0008cd02' + '66'.repeat(32),
      );
      tracker.recordPegInConsumeSubmitted(boxId, commitTxId);
      tracker.recordPegInConsumeConfirmed(
        boxId,
        vaultBoxId,
        pegInCommitmentConfirmation(commitTxId, 330_010),
      );
      tracker.beginPegInMint(boxId);
      tracker.recordPegInMinted(boxId, '0x' + '55'.repeat(32));

      expect(tracker.getPegInByBoxId(boxId)).toEqual(expect.objectContaining({
        ergoLockBoxId: boxId,
        targetEvmAddress: '0x' + '44'.repeat(20),
        amountNanoErg: 5_000_000n,
        ergoLockHeight: 330_000,
        status: 'minted',
        sourceClassification: 'active_committed_vault',
        depositorErgoTreeHex: '0008cd02' + '66'.repeat(32),
        commitTxId,
        committedVaultBoxId: vaultBoxId,
        commitInclusionHeight: 330_010,
        commitInclusionHeaderId: '44'.repeat(32),
        commitmentReceipt: {
          schema: 'e2s.peg-in-commitment-receipt.v1',
          sourceBoxIdHex: boxId,
          committedVaultBoxIdHex: vaultBoxId,
          commitmentTxIdHex: commitTxId,
          verification: pegInCommitmentVerification(commitTxId, 330_010),
        },
        commitmentReceiptDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
        sidechainMintTxHash: '0x' + '55'.repeat(32),
      }));
    });
  });

  it('orders every mint-submitted row for exhaustive restart and reorg reconciliation', () => {
    withTrackerDb((tracker) => {
      const mintingBoxId = '12'.repeat(32);
      const mintingCommitTxId = '23'.repeat(32);
      const mintingVaultBoxId = '34'.repeat(32);
      for (const input of [
        { boxId, txId: commitTxId, vaultId: vaultBoxId, height: 330_010 },
        {
          boxId: mintingBoxId,
          txId: mintingCommitTxId,
          vaultId: mintingVaultBoxId,
          height: 330_011,
        },
      ]) {
        tracker.insertPegIn(
          input.boxId,
          '0x' + '44'.repeat(20),
          5_000_000n,
          input.height - 10,
          'active_committed_vault',
          '0008cd02' + '66'.repeat(32),
        );
        tracker.recordPegInConsumeSubmitted(input.boxId, input.txId);
        tracker.recordPegInConsumeConfirmed(
          input.boxId,
          input.vaultId,
          pegInCommitmentConfirmation(input.txId, input.height),
        );
        tracker.beginPegInMint(input.boxId);
      }
      tracker.recordPegInMinted(boxId);

      expect(
        tracker.getPegInsRequiringPostSubmissionReconciliation().map(
          row => [row.ergoLockBoxId, row.status],
        ),
      ).toEqual([
        [boxId, 'minted'],
        [mintingBoxId, 'minting'],
      ]);
    });
  });

  it('retains the exact WP-01C receipt across restart and refuses replacement', () => {
    withTrackerDbPath((dbPath) => {
      const verification = pegInCommitmentVerification(commitTxId, 330_010);
      const first = new StateTracker(dbPath);
      first.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
        '0008cd02' + '66'.repeat(32),
      );
      first.recordPegInConsumeSubmitted(boxId, commitTxId);
      first.recordPegInConsumeConfirmed(boxId, vaultBoxId, {
        inclusionHeight: verification.height,
        inclusionHeaderId: verification.headerIdHex,
        verification,
      });
      const retained = first.getPegInByBoxId(boxId)!;
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getPegInByBoxId(boxId)).toMatchObject({
          status: 'consume_confirmed',
          commitInclusionHeaderId: verification.headerIdHex,
          commitmentReceipt: retained.commitmentReceipt,
          commitmentReceiptDigestHex: retained.commitmentReceiptDigestHex,
        });
        expect(() => reopened.recordPegInConsumeConfirmed(
          boxId,
          vaultBoxId,
          pegInCommitmentConfirmation(commitTxId, 330_010, '77'.repeat(32)),
        )).toThrow('Cannot replace an existing peg-in commitment receipt');
        expect(reopened.getPegInByBoxId(boxId)?.commitmentReceiptDigestHex)
          .toBe(retained.commitmentReceiptDigestHex);
      } finally {
        reopened.close();
      }
    });
  });

  it('pins the canonical WP-01C receipt JSON and domain-separated digest', () => {
    const receipt = createPegInCommitmentReceipt({
      sourceBoxIdHex: '11'.repeat(32),
      committedVaultBoxIdHex: '33'.repeat(32),
      commitmentTxIdHex: '22'.repeat(32),
      verification: pegInCommitmentVerification('22'.repeat(32), 330_010),
    });

    expect(pegInCommitmentReceiptJson(receipt)).toBe(
      '{"commitmentTxIdHex":"2222222222222222222222222222222222222222222222222222222222222222","committedVaultBoxIdHex":"3333333333333333333333333333333333333333333333333333333333333333","schema":"e2s.peg-in-commitment-receipt.v1","sourceBoxIdHex":"1111111111111111111111111111111111111111111111111111111111111111","verification":{"blockVersion":2,"headerIdHex":"4444444444444444444444444444444444444444444444444444444444444444","headerIdMatchedCanonicalBytes":true,"height":330010,"transactionCount":1,"transactionIdHex":"2222222222222222222222222222222222222222222222222222222222222222","transactionIndex":0,"transactionRootMatched":true,"transactionSigmaDigestHex":"6666666666666666666666666666666666666666666666666666666666666666","transactionsRootHex":"5555555555555555555555555555555555555555555555555555555555555555","transactionsRootMatchedCanonicalHeaderBytes":true}}',
    );
    expect(pegInCommitmentReceiptDigestHex(receipt)).toBe(
      'e4d2626d1ad776e5220600eecdd7ab3a8819edbceaf089d07271453fa577020c',
    );
  });

  it('binds retained header and WP-01C receipt evidence into the lifecycle digest', () => {
    withTrackerDb((tracker) => {
      tracker.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
        '0008cd02' + '66'.repeat(32),
      );
      tracker.recordPegInConsumeSubmitted(boxId, commitTxId);
      tracker.recordPegInConsumeConfirmed(
        boxId,
        vaultBoxId,
        pegInCommitmentConfirmation(commitTxId, 330_010),
      );
      const retained = tracker.getPegInByBoxId(boxId)!;
      const retainedDigest = pegInLifecycleDigestHex(retained);

      const replacementHeaderReceipt = createPegInCommitmentReceipt({
        sourceBoxIdHex: boxId,
        committedVaultBoxIdHex: vaultBoxId,
        commitmentTxIdHex: commitTxId,
        verification: pegInCommitmentVerification(
          commitTxId,
          330_010,
          '77'.repeat(32),
        ),
      });
      const replacementRootReceipt = createPegInCommitmentReceipt({
        sourceBoxIdHex: boxId,
        committedVaultBoxIdHex: vaultBoxId,
        commitmentTxIdHex: commitTxId,
        verification: pegInCommitmentVerification(
          commitTxId,
          330_010,
          '44'.repeat(32),
          { transactionsRootHex: '88'.repeat(32) },
        ),
      });

      expect(pegInLifecycleDigestHex({
        ...retained,
        commitInclusionHeaderId: '77'.repeat(32),
        commitmentReceipt: replacementHeaderReceipt,
        commitmentReceiptDigestHex:
          pegInCommitmentReceiptDigestHex(replacementHeaderReceipt),
      })).not.toBe(retainedDigest);
      expect(pegInLifecycleDigestHex({
        ...retained,
        commitmentReceipt: replacementRootReceipt,
        commitmentReceiptDigestHex:
          pegInCommitmentReceiptDigestHex(replacementRootReceipt),
      })).not.toBe(retainedDigest);
    });
  });

  it('migrates legacy peg-in rows fail-closed without inventing receipt evidence', () => {
    withTrackerDbPath((dbPath) => {
      const legacy = new Database(dbPath);
      legacy.exec(`
        CREATE TABLE peg_in_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ergo_lock_box_id TEXT UNIQUE NOT NULL,
          target_evm_address TEXT NOT NULL,
          amount_nanoerg TEXT NOT NULL,
          ergo_lock_height INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'detected',
          source_classification TEXT NOT NULL DEFAULT 'unknown',
          depositor_ergo_tree_hex TEXT,
          commit_tx_id TEXT,
          committed_vault_box_id TEXT,
          commit_inclusion_height INTEGER,
          commit_failure TEXT,
          sidechain_mint_tx_hash TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      legacy.prepare(`
        INSERT INTO peg_in_events (
          ergo_lock_box_id,
          target_evm_address,
          amount_nanoerg,
          ergo_lock_height,
          status,
          source_classification,
          commit_tx_id,
          committed_vault_box_id,
          commit_inclusion_height,
          sidechain_mint_tx_hash
        ) VALUES (?, ?, ?, ?, ?, 'active_committed_vault', ?, ?, ?, ?)
      `).run(
        boxId,
        '0x' + '44'.repeat(20),
        '5000000',
        330_000,
        'consume_confirmed',
        commitTxId,
        vaultBoxId,
        330_010,
        '0x' + '55'.repeat(32),
      );
      legacy.prepare(`
        INSERT INTO peg_in_events (
          ergo_lock_box_id,
          target_evm_address,
          amount_nanoerg,
          ergo_lock_height,
          status
        ) VALUES (?, ?, ?, ?, 'incident')
      `).run(
        '12'.repeat(32),
        '0x' + '45'.repeat(20),
        '5000000',
        330_001,
      );
      const legacyMintedBoxId = '13'.repeat(32);
      legacy.prepare(`
        INSERT INTO peg_in_events (
          ergo_lock_box_id,
          target_evm_address,
          amount_nanoerg,
          ergo_lock_height,
          status,
          source_classification,
          commit_tx_id,
          committed_vault_box_id,
          commit_inclusion_height,
          sidechain_mint_tx_hash
        ) VALUES (?, ?, ?, ?, 'minted', 'active_committed_vault', ?, ?, ?, ?)
      `).run(
        legacyMintedBoxId,
        '0x' + '46'.repeat(20),
        '5000000',
        330_002,
        '14'.repeat(32),
        '15'.repeat(32),
        330_012,
        '0x' + '47'.repeat(32),
      );
      legacy.close();

      const migrated = new StateTracker(dbPath);
      try {
        expect(migrated.getPegInByBoxId(boxId)).toMatchObject({
          status: 'consume_confirmed',
          commitInclusionHeaderId: null,
          commitmentReceipt: null,
          commitmentReceiptDigestHex: null,
        });
        expect(migrated.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 2,
        });
        expect(migrated.getPegInByBoxId(legacyMintedBoxId)).toMatchObject({
          status: 'minted',
          commitmentReceipt: null,
          commitmentReceiptDigestHex: null,
        });
        expect(() => migrated.resetPegInMintForRetry(
          legacyMintedBoxId,
          'must retain a legacy safety hold',
        )).toThrow('Cannot reset mint before committed-vault confirmation');
        expect(() => migrated.beginPegInMint(boxId))
          .toThrow('Cannot mint peg-in before committed-vault confirmation');
      } finally {
        migrated.close();
      }
    });
  });

  it('rejects corrupted receipt JSON or digest at the SQLite mapper boundary', () => {
    withTrackerDbPath((dbPath) => {
      const tracker = new StateTracker(dbPath);
      tracker.insertPegIn(boxId, '0x' + '44'.repeat(20), 5_000_000n, 330_000);
      tracker.recordPegInConsumeSubmitted(boxId, commitTxId);
      tracker.recordPegInConsumeConfirmed(
        boxId,
        vaultBoxId,
        pegInCommitmentConfirmation(commitTxId, 330_010),
      );
      tracker.beginPegInMint(boxId);
      tracker.recordPegInMinted(boxId);
      tracker.close();

      const raw = new Database(dbPath);
      raw.prepare(`
        UPDATE peg_in_events
        SET commit_verification_receipt_digest = ?
        WHERE ergo_lock_box_id = ?
      `).run('00'.repeat(32), boxId);
      raw.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(() => reopened.getPegInByBoxId(boxId))
          .toThrow('receipt digest does not match JSON');
        expect(() => reopened.getPegInCircuitBreakerState())
          .toThrow('receipt digest does not match JSON');
      } finally {
        reopened.close();
      }
    });
  });

  it('refuses to begin minting directly from a refundable detected deposit', () => {
    withTrackerDb((tracker) => {
      tracker.insertPegIn(boxId, '0x' + '44'.repeat(20), 5_000_000n, 330_000);
      expect(() => tracker.beginPegInMint(boxId)).toThrow(
        'Cannot mint peg-in before committed-vault confirmation',
      );
      expect(tracker.getPegInByBoxId(boxId)?.status).toBe('detected');
    });
  });

  it('survives restart in consume_submitted state and can reset a reorged commit', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      first.insertPegIn(boxId, '0x' + '44'.repeat(20), 5_000_000n, 330_000);
      first.recordPegInConsumeSubmitted(boxId, commitTxId);
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getPendingPegIns()).toEqual([
          expect.objectContaining({ status: 'consume_submitted', commitTxId }),
        ]);
        reopened.resetPegInCommit(boxId, 'commit transaction left the canonical chain');
        expect(reopened.getPegInByBoxId(boxId)).toEqual(expect.objectContaining({
          status: 'detected',
          commitTxId: null,
          committedVaultBoxId: null,
          commitInclusionHeight: null,
          commitInclusionHeaderId: null,
          commitmentReceipt: null,
          commitmentReceiptDigestHex: null,
          commitFailure: 'commit transaction left the canonical chain',
        }));
      } finally {
        reopened.close();
      }
    });
  });

  it('records legacy safety classification independently from lifecycle status', () => {
    withTrackerDb((tracker) => {
      tracker.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'legacy_unminted_refundable',
      );
      tracker.updatePegInClassification(boxId, 'legacy_minted_requires_migration');
      tracker.markPegInIncident(boxId, 'legacy source is still refundable after mint');

      expect(tracker.getPegInByBoxId(boxId)).toEqual(expect.objectContaining({
        sourceClassification: 'legacy_minted_requires_migration',
        status: 'incident',
      }));
    });
  });

  it('keeps a mint-submitted row out of pre-mint reset and invalidation paths', () => {
    withTrackerDb((tracker) => {
      tracker.insertPegIn(boxId, '0x' + '44'.repeat(20), 5_000_000n, 330_000);
      tracker.recordPegInConsumeSubmitted(boxId, commitTxId);
      tracker.recordPegInConsumeConfirmed(
        boxId,
        vaultBoxId,
        pegInCommitmentConfirmation(commitTxId, 330_010),
      );
      tracker.beginPegInMint(boxId);

      tracker.resetPegInCommit(boxId, 'must not demote a submitted mint');
      tracker.markPegInCommitInvalid(boxId, 'must not invalidate a submitted mint');

      expect(tracker.getPegInByBoxId(boxId)).toMatchObject({
        status: 'minting',
        commitmentReceipt: expect.any(Object),
        commitmentReceiptDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
    });
  });

  it('retains and reconciles one exact historical mint reservation across restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-state-test-'));
    const dbPath = join(dir, 'state.sqlite');
    const recipientAddress = '0x' + '44'.repeat(20);
    const bridgeAddress = '0x' + '77'.repeat(20);
    const sergAddress = '0x' + '88'.repeat(20);
    const relayerAddress = '0x' + '99'.repeat(20);
    const callDataHex = [
      '0xf28ee187',
      '0'.repeat(24),
      recipientAddress.slice(2),
      (5_000_000n).toString(16).padStart(64, '0'),
      boxId,
    ].join('');
    const transactionHashHex = 'f1'.repeat(32);
    let first: StateTracker | null = new StateTracker(dbPath);
    let reopened: StateTracker | null = null;
    try {
      first.insertPegIn(
        boxId,
        recipientAddress,
        5_000_000n,
        330_000,
        'active_committed_vault',
        '0008cd02' + '66'.repeat(32),
      );
      first.recordPegInConsumeSubmitted(boxId, commitTxId);
      first.recordPegInConsumeConfirmed(
        boxId,
        vaultBoxId,
        pegInCommitmentConfirmation(commitTxId, 330_010),
      );
      const commitmentReceiptDigestHex =
        first.getPegInByBoxId(boxId)!.commitmentReceiptDigestHex!;
      first.beginPegInMint(boxId);
      const firstDb = (
        first as unknown as { db: Database.Database }
      ).db;
      const row = firstDb.prepare(`
        SELECT id FROM peg_in_events WHERE ergo_lock_box_id = ?
      `).get(boxId) as { id: number };
      firstDb.prepare(`
        INSERT INTO peg_in_mint_transport_attempts (
          schema, peg_in_id, operation_digest, envelope_digest,
          authorization_digest, signed_envelope_digest, attempt_digest,
          source_box_id, committed_vault_box_id, commitment_receipt_digest,
          recipient_address, amount_nanoerg, chain_id, bridge_address,
          serg_address, relayer_address, bridge_code_hash, serg_owner_address,
          serg_code_hash, fee_policy_id, admitted_block_number,
          admitted_block_hash, observed_pending_nonce, expires_at_block_number,
          call_data_hex, transaction_type, nonce, gas_limit, gas_price_wei,
          max_fee_per_gas_wei, max_priority_fee_per_gas_wei,
          access_list_digest, unsigned_transaction_digest,
          signed_transaction_digest, expected_transaction_hash, status
        ) VALUES (
          @schema, @pegInId, @operationDigest, @envelopeDigest,
          @authorizationDigest, @signedEnvelopeDigest, @attemptDigest,
          @sourceBoxId, @vaultBoxId, @receiptDigest, @recipient, @amount,
          @chainId, @bridge, @serg, @relayer, @bridgeCodeHash, @bridge,
          @sergCodeHash, @feePolicyId, @admittedBlockNumber,
          @admittedBlockHash, @nonce, @expiresAtBlockNumber, @callData,
          2, @nonce, '120000', NULL, '2000000000', '1000000000',
          @accessListDigest, @unsignedDigest, @signedDigest,
          @transactionHash, 'pending'
        )
      `).run({
        schema: PEG_IN_MINT_TRANSPORT_SCHEMA,
        pegInId: row.id,
        operationDigest: 'd1'.repeat(32),
        envelopeDigest: 'd2'.repeat(32),
        authorizationDigest: 'd3'.repeat(32),
        signedEnvelopeDigest: 'd4'.repeat(32),
        attemptDigest: 'd5'.repeat(32),
        sourceBoxId: boxId,
        vaultBoxId,
        receiptDigest: commitmentReceiptDigestHex,
        recipient: recipientAddress,
        amount: '5000000',
        chainId: '31337',
        bridge: bridgeAddress,
        serg: sergAddress,
        relayer: relayerAddress,
        bridgeCodeHash: 'aa'.repeat(32),
        sergCodeHash: 'ab'.repeat(32),
        feePolicyId: PEG_IN_MINT_FEE_POLICY_ID,
        admittedBlockNumber: 100,
        admittedBlockHash: 'cc'.repeat(32),
        nonce: 7,
        expiresAtBlockNumber: 108,
        callData: callDataHex,
        accessListDigest: 'ee'.repeat(32),
        unsignedDigest: 'dd'.repeat(32),
        signedDigest: 'f2'.repeat(32),
        transactionHash: transactionHashHex,
      });
      expect(first.getLatestPegInMintTransportAttempt(boxId)).toMatchObject({
        status: 'pending',
        sourceBoxIdHex: boxId,
        committedVaultBoxIdHex: vaultBoxId,
        commitmentReceiptDigestHex,
        chainId: '31337',
        relayerAddress,
        nonce: 7,
        expectedTransactionHashHex: transactionHashHex,
        unsignedTransactionDigestHex: 'dd'.repeat(32),
        signedTransactionDigestHex: 'f2'.repeat(32),
      });
      first.close();
      first = null;

      reopened = new StateTracker(dbPath);
      expect(reopened.getLatestPegInMintTransportAttempt(boxId)).toMatchObject({
        status: 'pending',
        expectedTransactionHashHex: transactionHashHex,
        nonce: 7,
      });

      const rawDb = (
        reopened as unknown as { db: Database.Database }
      ).db;
      expect(() => reopened!.recordPegInMinted(
        boxId,
        `0x${'99'.repeat(32)}`,
      )).toThrow(
        'Peg-in mint transaction hash does not match the exact transport reservation.',
      );
      expect(reopened.getPegInByBoxId(boxId)).toMatchObject({
        status: 'minting',
        sidechainMintTxHash: null,
      });
      expect(reopened.getLatestPegInMintTransportAttempt(boxId))
        .toMatchObject({ status: 'pending' });
      reopened.confirmPegInMintTransportRecovery(
        boxId,
        transactionHashHex,
        {
          status: 'accepted',
          transactionHashHex,
          responseDigestHex: 'f3'.repeat(32),
          confirmationBlockNumber: 102,
          confirmationBlockHashHex: 'f4'.repeat(32),
          confirmationCount: 3,
        },
      );
      expect(reopened.getLatestPegInMintTransportAttempt(boxId))
        .toMatchObject({ status: 'confirmed' });
      expect(reopened.getPegInByBoxId(boxId)).toMatchObject({
        status: 'minted',
        sidechainMintTxHash: `0x${transactionHashHex}`,
      });

      reopened.resetPegInMintForRetry(
        boxId,
        'confirmed mint disappeared from the canonical EVM chain',
      );
      expect(reopened.getLatestPegInMintTransportAttempt(boxId))
        .toMatchObject({ status: 'abandoned' });
      expect(rawDb.prepare(`
        SELECT COUNT(*) AS count
        FROM peg_in_mint_transport_attempts
        WHERE chain_id = '31337'
          AND relayer_address = ?
          AND nonce = 7
          AND status IN (
            'pending',
            'accepted',
            'ambiguous',
            'confirmed',
            'quarantined'
          )
      `).get(relayerAddress)).toEqual({ count: 0 });
    } finally {
      first?.close();
      reopened?.close();
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    }
  });

  it('holds a newly created database until reviewed continuity recovery exists', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      const beforeRestart = first.getPegInCircuitBreakerState();
      expect(beforeRestart).toMatchObject({
        open: true,
        incidentCount: 0,
        continuityStatus: 'recovery_required',
        continuityRecoveryRequired: true,
        externalContinuityWitnessCurrent: false,
        retainedExecutionAuthority: false,
      });
      expect(() => first.assertFundsReleaseAuthorized()).toThrow(
        'local funds-release hold is open',
      );

      const rawDb = (first as unknown as { db: any }).db;
      expect(() => rawDb.prepare(`
        UPDATE local_continuity_state SET status = 'established' WHERE id = 1
      `).run()).toThrow('immutable without reviewed recovery');
      expect(() => rawDb.prepare(`
        DELETE FROM local_continuity_state WHERE id = 1
      `).run()).toThrow('cannot be cleared without reviewed recovery');
      expect(() => rawDb.prepare(`
        UPDATE local_continuity_identity SET identity_hex = ? WHERE id = 1
      `).run('ff'.repeat(32))).toThrow('identity is immutable');
      expect(() => rawDb.prepare(`
        DELETE FROM local_continuity_identity WHERE id = 1
      `).run()).toThrow('identity cannot be cleared');
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getPegInCircuitBreakerState()).toEqual(beforeRestart);
      } finally {
        reopened.close();
      }
    });
  });

  it('does not infer continuity from a retained bridge table after marker loss', () => {
    withTrackerDbPath((dbPath) => {
      const legacy = new StateTracker(dbPath);
      const rawDb = (legacy as unknown as { db: any }).db;
      rawDb.exec(`
        DROP TRIGGER local_continuity_state_no_update;
        DROP TRIGGER local_continuity_state_no_delete;
        DROP TABLE local_continuity_state;
      `);
      legacy.close();

      const migrated = new StateTracker(dbPath);
      try {
        expect(migrated.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 0,
          continuityStatus: 'recovery_required',
          continuityRecoveryRequired: true,
        });
      } finally {
        migrated.close();
      }
    });
  });

  it('holds one exclusive funds execution epoch across the final transport boundary', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      let competing: StateTracker | null = new StateTracker(dbPath);
      let successor: StateTracker | null = null;
      try {
        const authorization = establishTestFundsReleaseContinuity(first);
        const firstLease = {
          schema: 'e2s.funds-execution-authority.v1' as const,
          epochHex: authorization.executionAuthorityEpochHex,
        };
        expect(authorization.executionAuthorityEpochHex)
          .toBe(firstLease.epochHex);
        expect(() => competing!.acquireFundsExecutionAuthority())
          .toThrow(/retained funds execution lock/);
        expect(() => competing!.insertPegIn(
          '93'.repeat(32),
          '0x' + '94'.repeat(20),
          5_000_000n,
          330_000,
        )).toThrow(/another process holds funds execution authority/);

        const transportStarted = first.startFundsReleaseTransport(
          authorization.stateDigestHex,
          authorization.executionAuthorityEpochHex,
          () => 'started',
        );
        expect(transportStarted).toBe('started');

        first.releaseFundsExecutionAuthority();
        competing.close();
        competing = null;
        successor = new StateTracker(dbPath);
        const secondLease = successor.acquireFundsExecutionAuthority();
        expect(successor.assertFundsReleaseAuthorized(
          authorization.stateDigestHex,
          secondLease.epochHex,
        ).executionAuthorityEpochHex).toBe(secondLease.epochHex);
        successor.releaseFundsExecutionAuthority();
      } finally {
        first.close();
        competing?.close();
        successor?.close();
      }
    });
  });

  it('keeps funds release held when a stale clean SQLite backup is restored', () => {
    withTrackerDbPath((dbPath) => {
      const backupPath = `${dbPath}.clean-backup`;
      const first = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(first);
      first.releaseFundsExecutionAuthority();
      first.close();
      copyFileSync(dbPath, backupPath);

      const incidentWriter = new StateTracker(dbPath);
      incidentWriter.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
      );
      incidentWriter.markPegInIncident(boxId, {
        kind: 'commitment_disappeared',
        reason: 'incident must survive stale SQLite restore',
      });
      const holdPath = (
        incidentWriter as unknown as { fundsReleaseHoldPath: string }
      ).fundsReleaseHoldPath;
      expect(existsSync(holdPath)).toBe(true);
      incidentWriter.close();

      copyFileSync(backupPath, dbPath);
      const restored = new StateTracker(dbPath);
      try {
        expect(restored.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 0,
          continuityStatus: 'established',
          continuityRecoveryRequired: false,
        });
        const lease = restored.acquireFundsExecutionAuthority();
        expect(() => restored.assertFundsReleaseAuthorized(
          undefined,
          lease.epochHex,
        )).toThrow(/local funds-release hold is open/);
        restored.releaseFundsExecutionAuthority();
      } finally {
        restored.close();
      }
    });
  });

  it('holds a clean database copy that lacks its external continuity witness', () => {
    withTrackerDbPath((dbPath) => {
      const copiedPath = `${dbPath}.copied`;
      const source = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(source);
      source.releaseFundsExecutionAuthority();
      source.close();
      copyFileSync(dbPath, copiedPath);

      const copied = new StateTracker(copiedPath);
      try {
        expect(copied.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 0,
          continuityStatus: 'established',
          continuityRecoveryRequired: false,
          externalContinuityWitnessCurrent: false,
          retainedExecutionAuthority: false,
        });
        const lease = copied.acquireFundsExecutionAuthority();
        expect(() => copied.assertFundsReleaseAuthorized(
          undefined,
          lease.epochHex,
        )).toThrow(/local funds-release hold is open/);
        copied.releaseFundsExecutionAuthority();
      } finally {
        copied.close();
      }
    });
  });

  it('holds a clean database copy even when its external continuity witness is copied', () => {
    withTrackerDbPath((dbPath) => {
      const copiedPath = `${dbPath}.copied`;
      const source = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(source);
      source.releaseFundsExecutionAuthority();
      source.close();
      copyFileSync(dbPath, copiedPath);
      copyFileSync(
        `${dbPath}.funds-release-continuity`,
        `${copiedPath}.funds-release-continuity`,
      );

      const copied = new StateTracker(copiedPath);
      try {
        expect(copied.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 0,
          continuityStatus: 'established',
          continuityRecoveryRequired: false,
          externalContinuityWitnessCurrent: false,
          retainedExecutionAuthority: false,
        });
        const lease = copied.acquireFundsExecutionAuthority();
        expect(() => copied.assertFundsReleaseAuthorized(
          undefined,
          lease.epochHex,
        )).toThrow(/local funds-release hold is open/);
        copied.releaseFundsExecutionAuthority();
      } finally {
        copied.close();
      }
    });
  });

  it('binds v2 continuity witness bytes to the filesystem-canonical database location', () => {
    withTrackerDbPath((dbPath) => {
      const tracker = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(tracker);
      tracker.releaseFundsExecutionAuthority();
      tracker.close();

      const rawDb = new Database(dbPath, { readonly: true });
      const row = rawDb.prepare(`
        SELECT identity_hex
        FROM local_continuity_identity
        WHERE id = 1
      `).get() as { identity_hex: string };
      rawDb.close();
      const rawCanonicalPath = realpathSync.native(dbPath);
      const canonicalPath = process.platform === 'win32'
        ? rawCanonicalPath.replace(/\\/g, '/')
        : rawCanonicalPath;
      const locationDigestHex = createHash('sha256')
        .update(
          'ergo-sidechain-bridge:local-continuity-location:v1\0',
          'ascii',
        )
        .update(canonicalPath, 'utf8')
        .digest('hex');
      expect(readFileSync(
        `${realpathSync.native(dbPath)}.funds-release-continuity`,
        'utf8',
      )).toBe(
        `e2s.local-continuity-witness.v2\n${row.identity_hex}\n${locationDigestHex}\n`,
      );
    });
  });

  it('holds a legacy v1 continuity witness until reviewed migration creates v2', () => {
    withTrackerDbPath((dbPath) => {
      const tracker = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(tracker);
      tracker.releaseFundsExecutionAuthority();
      tracker.close();

      const rawDb = new Database(dbPath, { readonly: true });
      const row = rawDb.prepare(`
        SELECT identity_hex
        FROM local_continuity_identity
        WHERE id = 1
      `).get() as { identity_hex: string };
      rawDb.close();
      writeFileSync(
        `${realpathSync.native(dbPath)}.funds-release-continuity`,
        `e2s.local-continuity-witness.v1\n${row.identity_hex}\n`,
        'utf8',
      );

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          continuityStatus: 'established',
          externalContinuityWitnessCurrent: false,
        });
        const lease = reopened.acquireFundsExecutionAuthority();
        expect(() => reopened.assertFundsReleaseAuthorized(
          undefined,
          lease.epochHex,
        )).toThrow(/local funds-release hold is open/);
        reopened.releaseFundsExecutionAuthority();
      } finally {
        reopened.close();
      }
    });
  });

  it('treats a dangling hold-path directory entry as an active hold', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(first);
      first.releaseFundsExecutionAuthority();
      const holdPath = (
        first as unknown as { fundsReleaseHoldPath: string }
      ).fundsReleaseHoldPath;
      symlinkSync(
        `${dbPath}.missing-hold-target`,
        holdPath,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      expect(existsSync(holdPath)).toBe(false);
      expect(first.getPegInCircuitBreakerState()).toMatchObject({
        open: true,
      });
      expect(() => first.assertFundsReleaseAuthorized())
        .toThrow(/local funds-release hold is open/);
      first.close();
    });
  });

  it('retains the execution epoch when an incident hold marker cannot be written', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(first);
      const lockPath = (
        first as unknown as { fundsExecutionLockPath: string }
      ).fundsExecutionLockPath;
      const continuityPath = (
        first as unknown as { fundsReleaseContinuityPath: string }
      ).fundsReleaseContinuityPath;
      (
        first as unknown as { fundsReleaseHoldPath: string }
      ).fundsReleaseHoldPath = join(
        `${dbPath}.missing-parent`,
        'funds-release-hold',
      );
      first.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
      );

      expect(() => first.markPegInIncident(boxId, {
        kind: 'commitment_disappeared',
        reason: 'hold marker write failure must retain the execution epoch',
      })).toThrow();
      expect(() => first.assertFundsReleaseAuthorized())
        .toThrow(/retained for reviewed recovery/);
      expect(() => first.close())
        .toThrow(/retained for reviewed recovery/);
      expect(existsSync(lockPath)).toBe(true);
      expect(existsSync(continuityPath)).toBe(false);
      expect(() => new StateTracker(dbPath))
        .toThrow(/retained funds execution lock/);
    });
  });

  it('persists a recovery authority when marker failure occurs without a live lease', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(first);
      first.releaseFundsExecutionAuthority();
      (
        first as unknown as { fundsReleaseHoldPath: string }
      ).fundsReleaseHoldPath = join(
        `${dbPath}.missing-parent`,
        'funds-release-hold',
      );
      first.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
      );

      expect(() => first.markPegInIncident(boxId, {
        kind: 'commitment_disappeared',
        reason: 'marker failure without a live lease must persist recovery authority',
      })).toThrow();
      first.close();

      const restarted = new StateTracker(dbPath);
      try {
        expect(restarted.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          externalContinuityWitnessCurrent: false,
          retainedExecutionAuthority: true,
        });
        expect(() => restarted.acquireFundsExecutionAuthority())
          .toThrow(/retained funds execution authority/);
        expect(() => restarted.assertFundsReleaseAuthorized())
          .toThrow(/local funds-release hold is open/);
      } finally {
        restarted.close();
      }
    });
  });

  it('keeps recovery held when both marker creation and sentinel insertion fail', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(first);
      first.releaseFundsExecutionAuthority();
      const rawDb = (
        first as unknown as { db: Database.Database }
      ).db;
      rawDb.exec('DROP TABLE funds_execution_authority;');
      (
        first as unknown as { fundsReleaseHoldPath: string }
      ).fundsReleaseHoldPath = join(
        `${dbPath}.missing-parent`,
        'funds-release-hold',
      );
      first.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
      );

      expect(() => first.markPegInIncident(boxId, {
        kind: 'commitment_disappeared',
        reason: 'continuity witness invalidation is the final durable fallback',
      })).toThrow();
      first.close();

      const restarted = new StateTracker(dbPath);
      try {
        expect(restarted.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          externalContinuityWitnessCurrent: false,
          retainedExecutionAuthority: false,
        });
        const lease = restarted.acquireFundsExecutionAuthority();
        expect(() => restarted.assertFundsReleaseAuthorized(
          undefined,
          lease.epochHex,
        )).toThrow(/local funds-release hold is open/);
        restarted.releaseFundsExecutionAuthority();
      } finally {
        restarted.close();
      }
    });
  });

  it('retains the database epoch when the owned execution lock is lost', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(first);
      const lockPath = (
        first as unknown as { fundsExecutionLockPath: string }
      ).fundsExecutionLockPath;
      unlinkSync(lockPath);

      expect(() => first.releaseFundsExecutionAuthority())
        .toThrow(/funds execution lock is not current/);
      expect(() => first.close())
        .toThrow(/funds execution lock is not current/);

      const restarted = new StateTracker(dbPath);
      try {
        expect(() => restarted.acquireFundsExecutionAuthority())
          .toThrow(/retained funds execution authority/);
      } finally {
        restarted.close();
      }
    });
  });

  it('persists idempotent peg-in and solvency incidents as a restart-safe circuit latch', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      first.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
      );
      first.markPegInIncident(boxId, {
        kind: 'commitment_disappeared',
        reason: 'minted commitment disappeared after a deep reorg',
      });
      first.markPegInIncident(boxId, {
        kind: 'commitment_disappeared',
        reason: 'minted commitment disappeared after a deep reorg',
      });
      expect(first.recordPegInSolvencyDeficitIncident({
        ergoHeight: 330_100,
        totalSupplyNanoErg: 6_000_000n,
        totalLockedNanoErg: 5_000_000n,
      })).toBe(true);
      expect(first.recordPegInSolvencyDeficitIncident({
        ergoHeight: 330_100,
        totalSupplyNanoErg: 6_000_000n,
        totalLockedNanoErg: 5_000_000n,
      })).toBe(false);
      expect(first.recordPegInSolvencyDeficitIncident({
        ergoHeight: 330_101,
        totalSupplyNanoErg: 7_000_000n,
        totalLockedNanoErg: 5_000_000n,
      })).toBe(false);
      const beforeRestart = first.getPegInCircuitBreakerState();
      expect(beforeRestart).toMatchObject({ open: true, incidentCount: 2 });
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getPegInCircuitBreakerState()).toEqual(beforeRestart);
        expect(() => reopened.recordPegInSolvencyDeficitIncident({
          ergoHeight: 330_101,
          totalSupplyNanoErg: 5_000_000n,
          totalLockedNanoErg: 5_000_000n,
        })).toThrow('positive backing deficit');
      } finally {
        reopened.close();
      }
    });
  });

  it('persists an unavailable backing alarm hold across restart', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(first);

      first.holdFundsReleaseForOperatorReview(
        'backing alarm unavailable during canonical vault observation',
      );
      expect(first.getPegInCircuitBreakerState()).toMatchObject({
        open: true,
        incidentCount: 0,
      });
      expect(() => first.assertFundsReleaseAuthorized())
        .toThrow('local funds-release hold is open');
      first.releaseFundsExecutionAuthority();
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 0,
        });
        const lease = reopened.acquireFundsExecutionAuthority();
        expect(() => reopened.assertFundsReleaseAuthorized(
          undefined,
          lease.epochHex,
        )).toThrow('local funds-release hold is open');
        reopened.releaseFundsExecutionAuthority();
      } finally {
        reopened.close();
      }
    });
  });

  it('keeps funds release held after solvency incident persistence fails', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      establishTestFundsReleaseContinuity(first);
      const rawDb = (
        first as unknown as { db: Database.Database }
      ).db;
      rawDb.exec(`
        CREATE TRIGGER peg_in_solvency_incident_injected_failure
        BEFORE INSERT ON peg_in_safety_incidents
        BEGIN
          SELECT RAISE(ABORT, 'injected solvency incident persistence failure');
        END;
      `);

      first.holdFundsReleaseForOperatorReview(
        'backing deficit observed before peg-out candidate advancement',
      );
      expect(() => first.recordPegInSolvencyDeficitIncident({
        ergoHeight: 330_100,
        totalSupplyNanoErg: 6_000_000n,
        totalLockedNanoErg: 5_000_000n,
      })).toThrow('injected solvency incident persistence failure');
      expect(first.getPegInCircuitBreakerState()).toMatchObject({
        open: true,
        incidentCount: 0,
      });
      first.releaseFundsExecutionAuthority();
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        const lease = reopened.acquireFundsExecutionAuthority();
        expect(() => reopened.assertFundsReleaseAuthorized(
          undefined,
          lease.epochHex,
        )).toThrow('local funds-release hold is open');
        reopened.releaseFundsExecutionAuthority();
      } finally {
        reopened.close();
      }
    });
  });

  it('retains distinct observed receipt digests for otherwise identical incidents', () => {
    withTrackerDb((tracker) => {
      tracker.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
      );
      const incident = {
        kind: 'canonical_header_replaced' as const,
        reason: 'canonical commitment header changed after mint submission',
        observedCommitmentReceiptDigestHex: '77'.repeat(32),
      };
      tracker.markPegInIncident(boxId, incident);
      tracker.markPegInIncident(boxId, incident);
      tracker.markPegInIncident(boxId, {
        ...incident,
        observedCommitmentReceiptDigestHex: '88'.repeat(32),
      });

      expect(tracker.getPegInCircuitBreakerState()).toMatchObject({
        open: true,
        incidentCount: 2,
      });
    });
  });

  it('never demotes a terminal incident through a stale commit-invalid call', () => {
    withTrackerDb((tracker) => {
      tracker.insertPegIn(
        boxId,
        '0x' + '44'.repeat(20),
        5_000_000n,
        330_000,
        'active_committed_vault',
      );
      tracker.markPegInIncident(boxId, {
        kind: 'commitment_disappeared',
        reason: 'terminal incident must remain terminal',
      });

      tracker.markPegInCommitInvalid(boxId, 'stale invalidation');

      expect(tracker.getPegInByBoxId(boxId)).toMatchObject({
        status: 'incident',
        commitFailure: 'terminal incident must remain terminal',
      });
      expect(tracker.getPegInCircuitBreakerState()).toMatchObject({
        open: true,
        incidentCount: 1,
      });
    });
  });

  it('enforces one deterministic solvency incident across concurrent database handles', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      const second = new StateTracker(dbPath);
      try {
        expect(first.recordPegInSolvencyDeficitIncident({
          ergoHeight: 330_100,
          totalSupplyNanoErg: 6_000_000n,
          totalLockedNanoErg: 5_000_000n,
        })).toBe(true);
        expect(second.recordPegInSolvencyDeficitIncident({
          ergoHeight: 330_101,
          totalSupplyNanoErg: 7_000_000n,
          totalLockedNanoErg: 5_000_000n,
        })).toBe(false);

        expect(first.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 1,
        });
        expect(second.getPegInCircuitBreakerState())
          .toEqual(first.getPegInCircuitBreakerState());
        const rawDb = (first as unknown as { db: any }).db;
        expect(rawDb.prepare(`
          SELECT sql
          FROM sqlite_master
          WHERE type = 'index'
            AND name = 'peg_in_single_solvency_deficit'
        `).get()?.sql).toContain("WHERE kind = 'solvency_deficit'");
      } finally {
        second.close();
        first.close();
      }
    });
  });

  it('reads the circuit breaker from one snapshot while another handle journals an incident', () => {
    withTrackerDbPath((dbPath) => {
      const reader = new StateTracker(dbPath);
      const writer = new StateTracker(dbPath);
      let prepareSpy: ReturnType<typeof vi.spyOn> | undefined;
      try {
        writer.insertPegIn(
          boxId,
          '0x' + '44'.repeat(20),
          5_000_000n,
          330_000,
          'active_committed_vault',
        );
        const writerDb = (writer as unknown as { db: any }).db;
        writerDb.prepare(`
          UPDATE peg_in_events
          SET status = 'incident', commit_failure = ?
          WHERE ergo_lock_box_id = ?
        `).run('legacy incident without a journal', boxId);

        const readerDb = (reader as unknown as { db: any }).db;
        const originalPrepare = readerDb.prepare.bind(readerDb);
        let interleaved = false;
        prepareSpy = vi.spyOn(readerDb, 'prepare').mockImplementation((
          (sql: string) => {
            const statement = originalPrepare(sql);
            if (!sql.includes('SELECT evidence_digest')) return statement;
            return {
              all: (...args: unknown[]) => {
                const rows = statement.all(...args);
                writer.markPegInIncident(boxId, {
                  kind: 'commitment_disappeared',
                  reason: 'legacy incident without a journal',
                });
                interleaved = true;
                return rows;
              },
            };
          }
        ) as any);

        expect(reader.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 1,
        });
        expect(interleaved).toBe(true);
      } finally {
        prepareSpy?.mockRestore();
        writer.close();
        reader.close();
      }
    });
  });

  it('pages every minted peg-in with a reconciliation cursor that survives restart', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      for (let i = 1; i <= 55; i++) {
        const rowBoxId = i.toString(16).padStart(2, '0').repeat(32);
        first.insertPegIn(
          rowBoxId,
          '0x' + '44'.repeat(20),
          5_000_000n,
          330_000 + i,
          'active_committed_vault',
          '0008cd02' + '66'.repeat(32),
        );
        first.recordPegInConsumeSubmitted(rowBoxId, commitTxId);
        first.recordPegInConsumeConfirmed(
          rowBoxId,
          vaultBoxId,
          pegInCommitmentConfirmation(commitTxId, 330_100 + i),
        );
        first.beginPegInMint(rowBoxId);
        first.recordPegInMinted(rowBoxId);
      }

      const firstBatch = first.getPegInReconciliationBatch(50);
      expect(firstBatch).toHaveLength(50);
      expect(firstBatch[0].ergoLockBoxId).toBe('01'.repeat(32));
      expect(firstBatch[49].ergoLockBoxId).toBe('32'.repeat(32));
      first.advancePegInReconciliationCursor(firstBatch[49].id);
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        const secondBatch = reopened.getPegInReconciliationBatch(50);
        expect(secondBatch.map(row => row.ergoLockBoxId)).toEqual(
          [51, 52, 53, 54, 55].map(i => i.toString(16).padStart(2, '0').repeat(32)),
        );
        reopened.advancePegInReconciliationCursor(secondBatch[4].id);
        expect(reopened.getPegInReconciliationBatch(50)[0].ergoLockBoxId).toBe(
          '01'.repeat(32),
        );
      } finally {
        reopened.close();
      }
    });
  });

  it('pages runtime reconciliation deterministically without authorizing a backlog', () => {
    withTrackerDb((tracker) => {
      for (let i = 1; i <= 3; i++) {
        tracker.insertPegIn(
          i.toString(16).padStart(2, '0').repeat(32),
          '0x' + '44'.repeat(20),
          5_000_000n,
          330_000 + i,
          'active_committed_vault',
        );
      }

      expect(tracker.hasPegInRuntimeReconciliationLifecycleRows()).toBe(true);
      const firstPage = tracker.getPegInRuntimeReconciliationCandidates(
        'aa'.repeat(32),
        2,
      );
      expect(firstPage.candidates.map(row => row.id)).toEqual([1, 2]);
      expect(firstPage.remainingCandidates).toBe(true);
      expect(tracker.getPegInRuntimeReconciliationCandidates(
        'aa'.repeat(32),
        3,
      )).toMatchObject({
        candidates: [
          expect.objectContaining({ id: 1 }),
          expect.objectContaining({ id: 2 }),
          expect.objectContaining({ id: 3 }),
        ],
        remainingCandidates: false,
      });

      tracker.markPegInIncident('01'.repeat(32), 'terminal review state');
      expect(tracker.getPegInRuntimeReconciliationCandidates(
        'aa'.repeat(32),
        2,
      ).candidates.map(row => row.ergoLockBoxId))
        .toEqual(['02'.repeat(32), '03'.repeat(32)]);
      expect(() => tracker.getPegInRuntimeReconciliationCandidates('aa'.repeat(32), 0))
        .toThrow('must be between 1 and 1000');
    });
  });

  it('prioritizes unheld rows and then the oldest stale hold under moving tips', () => {
    withTrackerDb((tracker) => {
      for (let i = 1; i <= 3; i++) {
        tracker.insertPegIn(
          i.toString(16).padStart(2, '0').repeat(32),
          '0x' + '44'.repeat(20),
          5_000_000n,
          330_000 + i,
          'active_committed_vault',
        );
      }
      const rawDb = (tracker as unknown as { db: any }).db;
      const insertJournal = rawDb.prepare(`
        INSERT INTO peg_in_reconciliation_journal (
          schema, peg_in_id, ergo_lock_box_id, lifecycle_status,
          lifecycle_digest, joined_reconstruction_digest,
          ergo_route_reconstruction_digest, frontier_view_digest,
          observed_tip_height, observed_tip_id, joined_entry_state,
          joined_event_transaction_hash, disposition, reason, observed_at,
          observation_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let pegInId = 1; pegInId <= 2; pegInId++) {
        const boxId = pegInId.toString(16).padStart(2, '0').repeat(32);
        const inserted = insertJournal.run(
          'e2s.peg-in-reconciliation-observation.v1',
          pegInId,
          boxId,
          'detected',
          `${pegInId}`.repeat(64),
          'bb'.repeat(32),
          'cc'.repeat(32),
          'dd'.repeat(32),
          100,
          'ee'.repeat(32),
          null,
          null,
          'deferred',
          'native_grandpa_finality_unavailable',
          '2026-07-16T10:00:00.000Z',
          (10 + pegInId).toString(16).repeat(64),
        );
        rawDb.prepare(`
          INSERT INTO peg_in_reconciliation_state (peg_in_id, latest_journal_id)
          VALUES (?, ?)
        `).run(pegInId, inserted.lastInsertRowid);
      }

      const page = tracker.getPegInRuntimeReconciliationCandidates('aa'.repeat(32), 2);
      expect(page.candidates.map(row => row.ergoLockBoxId)).toEqual([
        '03'.repeat(32),
        '01'.repeat(32),
      ]);
      expect(page.remainingCandidates).toBe(true);
    });
  });
});

describe('StateTracker authenticated SPV tracker history', () => {
  it('round-trips reconstructible V2 history and identity in insertion order', () => {
    withTrackerDb((tracker) => {
      const first = authenticatedEntry();
      const second = authenticatedEntry({
        sidechainHeight: 1235n,
        executionBlockHash: '77'.repeat(32),
        bridgeEventRoot: '88'.repeat(32),
      });

      tracker.insertAuthenticatedSpvTrackerEntry(first);
      tracker.insertAuthenticatedSpvTrackerEntry(second);

      expect(tracker.getAuthenticatedSpvTrackerHistory(authenticatedSidechainId)).toEqual([
        { key: first.keyHex, value: first.valueHex },
        { key: second.keyHex, value: second.valueHex },
      ]);
      expect(tracker.getAuthenticatedSpvTrackerIdentityByHeight(
        first.sidechainHeight,
        authenticatedSidechainId,
      )).toEqual({
        sidechainIdHex: authenticatedSidechainId,
        sidechainHeight: first.sidechainHeight,
        executionBlockHashHex: first.executionBlockHash,
      });
      expect(tracker.getAuthenticatedSpvTrackerIdentityByHeight(
        9999n,
        authenticatedSidechainId,
      )).toBeNull();
    });
  });

  it('accepts only byte-identical rows as idempotent', () => {
    withTrackerDb((tracker) => {
      const entry = authenticatedEntry();
      tracker.insertAuthenticatedSpvTrackerEntry(entry);
      tracker.insertAuthenticatedSpvTrackerEntry({ ...entry });
      expect(tracker.getAuthenticatedSpvTrackerHistory(authenticatedSidechainId)).toEqual([
        { key: entry.keyHex, value: entry.valueHex },
      ]);
    });
  });

  it('partitions equal heights by sidechain ID and verifies each derived key', () => {
    withTrackerDb((tracker) => {
      const first = authenticatedEntry();
      const otherSidechainId = 'b0'.repeat(32);
      const second = authenticatedEntry({ sidechainId: otherSidechainId });
      tracker.insertAuthenticatedSpvTrackerEntry(first);
      tracker.insertAuthenticatedSpvTrackerEntry(second);

      expect(tracker.getAuthenticatedSpvTrackerHistory(authenticatedSidechainId)).toEqual([
        { key: first.keyHex, value: first.valueHex },
      ]);
      expect(tracker.getAuthenticatedSpvTrackerHistory(otherSidechainId)).toEqual([
        { key: second.keyHex, value: second.valueHex },
      ]);
      expect(tracker.getAuthenticatedSpvTrackerIdentityByHeight(
        first.sidechainHeight,
        otherSidechainId,
      )?.executionBlockHashHex).toBe(second.executionBlockHash);
    });
  });

  it('rejects conflicting rows at either the same key or the same height', () => {
    withTrackerDb((tracker) => {
      const entry = authenticatedEntry();
      tracker.insertAuthenticatedSpvTrackerEntry(entry);

      expect(() => tracker.insertAuthenticatedSpvTrackerEntry(authenticatedEntry({
        bridgeEventRoot: '77'.repeat(32),
      }))).toThrow(/conflicting authenticated SPV tracker entry/);
      expect(() => tracker.insertAuthenticatedSpvTrackerEntry(authenticatedEntry({
        sidechainHeight: entry.sidechainHeight,
        executionBlockHash: 'aa'.repeat(32),
      }))).toThrow(/conflicting authenticated SPV tracker entry/);

      expect(tracker.getAuthenticatedSpvTrackerHistory(authenticatedSidechainId)).toEqual([
        { key: entry.keyHex, value: entry.valueHex },
      ]);
    });
  });

  it('rejects malformed V2 values and metadata before persistence', () => {
    withTrackerDb((tracker) => {
      const valid = authenticatedEntry();
      const insert = (entry: AuthenticatedSpvTrackerHistoryEntry) =>
        tracker.insertAuthenticatedSpvTrackerEntry(entry);

      expect(() => insert({ ...valid, keyHex: '11'.repeat(31) })).toThrow(/32 bytes/);
      expect(() => insert({ ...valid, keyHex: '11'.repeat(32) })).toThrow(/key or value does not match/);
      expect(() => insert({ ...valid, valueHex: '22'.repeat(263) })).toThrow(/264 bytes/);
      expect(() => insert({ ...valid, sidechainHeight: 0n })).toThrow(/positive signed Long/);
      expect(() => insert({ ...valid, sidechainHeight: 0x8000_0000_0000_0000n })).toThrow(/positive signed Long/);
      expect(() => insert({ ...valid, executionBlockHash: '33'.repeat(31) })).toThrow(/32 bytes/);
      expect(() => insert({ ...valid, bridgeEventRoot: 'not-hex' })).toThrow(/even-length hex/);
      expect(() => insert({
        ...valid,
        anchorHeaderHeight: Number.MAX_SAFE_INTEGER + 1,
      })).toThrow(/nonnegative safe signed Int/);
      expect(() => insert({ ...valid, bridgeEventRoot: 'ff'.repeat(32) })).toThrow(
        /value does not match entry metadata/,
      );
      const unsupportedProofSystem = Buffer.from(valid.valueHex, 'hex');
      unsupportedProofSystem[103] ^= 0x01;
      expect(() => insert({
        ...valid,
        valueHex: unsupportedProofSystem.toString('hex'),
      })).toThrow(/proof system/i);
      const unactivatedProgram = Buffer.from(valid.valueHex, 'hex');
      unactivatedProgram[136] ^= 0x01;
      expect(() => insert({
        ...valid,
        valueHex: unactivatedProgram.toString('hex'),
      })).toThrow(/program ID/i);
      expect(tracker.getAuthenticatedSpvTrackerHistory(authenticatedSidechainId)).toEqual([]);
    });
  });

  it('fails closed when persisted history contains a legacy 100-byte authenticated value', () => {
    withTrackerDbPath((dbPath) => {
      const entry = authenticatedEntry();
      const initialized = new StateTracker(dbPath);
      initialized.close();

      const seed = new Database(dbPath);
      seed.prepare(`
        INSERT INTO authenticated_spv_tracker_history (
          key_hex, value_hex, sidechain_id, sidechain_height, execution_block_hash,
          bridge_event_root, checkpoint_commitment, anchor_header_id, anchor_header_height
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.keyHex,
        entry.valueHex.slice(0, 100 * 2),
        entry.sidechainId,
        entry.sidechainHeight.toString(),
        entry.executionBlockHash,
        entry.bridgeEventRoot,
        entry.checkpointCommitment,
        entry.anchorHeaderId,
        entry.anchorHeaderHeight,
      );
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(() => reopened.getAuthenticatedSpvTrackerHistory(entry.sidechainId))
          .toThrow(/authenticated tracker value must be 264 bytes/);
      } finally {
        reopened.close();
      }
    });
  });

  it('keeps legacy 36-byte history separate from authenticated V2 history', () => {
    withTrackerDb((tracker) => {
      const legacy: SpvTrackerHistoryEntry = {
        keyHex: '11'.repeat(32),
        valueHex: '22'.repeat(36),
        sidechainHeight: 1234n,
        sidechainHeaderHash: '33'.repeat(32),
        bridgeEventRoot: '44'.repeat(32),
        ergoAnchorHeight: 330_000,
      };
      const authenticated = authenticatedEntry();

      tracker.insertSpvTrackerEntry(legacy);
      tracker.insertAuthenticatedSpvTrackerEntry(authenticated);

      expect(tracker.getSpvTrackerHistory()).toEqual([
        { key: legacy.keyHex, value: legacy.valueHex },
      ]);
      expect(tracker.getAuthenticatedSpvTrackerHistory(authenticatedSidechainId)).toEqual([
        { key: authenticated.keyHex, value: authenticated.valueHex },
      ]);
    });
  });

  it('fails closed when a corrupted schema contains duplicate heights', () => {
    withTrackerDbPath((dbPath) => {
      const first = authenticatedEntry();
      const second = authenticatedEntry({ keyHex: '99'.repeat(32) });
      const seed = new Database(dbPath);
      seed.exec(`
        CREATE TABLE authenticated_spv_tracker_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key_hex TEXT NOT NULL,
          value_hex TEXT NOT NULL,
          sidechain_id TEXT NOT NULL,
          sidechain_height TEXT NOT NULL,
          execution_block_hash TEXT NOT NULL,
          bridge_event_root TEXT NOT NULL,
          checkpoint_commitment TEXT NOT NULL,
          anchor_header_id TEXT NOT NULL,
          anchor_header_height INTEGER NOT NULL
        )
      `);
      const insert = seed.prepare(`
        INSERT INTO authenticated_spv_tracker_history (
          key_hex, value_hex, sidechain_id, sidechain_height, execution_block_hash,
          bridge_event_root, checkpoint_commitment, anchor_header_id, anchor_header_height
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const entry of [first, second]) {
        insert.run(
          entry.keyHex,
          entry.valueHex,
          entry.sidechainId,
          entry.sidechainHeight.toString(),
          entry.executionBlockHash,
          entry.bridgeEventRoot,
          entry.checkpointCommitment,
          entry.anchorHeaderId,
          entry.anchorHeaderHeight,
        );
      }
      seed.close();

      const tracker = new StateTracker(dbPath);
      try {
        expect(() => tracker.getAuthenticatedSpvTrackerIdentityByHeight(
          first.sidechainHeight,
          authenticatedSidechainId,
        )).toThrow(/multiple authenticated SPV tracker entries/);
      } finally {
        tracker.close();
      }
    });
  });
});

describe('StateTracker authenticated settlement candidate journal', () => {
  it('atomically rolls back authenticated DUP history and invalidates only stale candidates', () => {
    withTrackerDb((tracker) => {
      const historyKey = 'c1'.repeat(32);
      const priorTipBoxId = 'c2'.repeat(32);
      const priorTipDigest = getDupTreeDigest([historyKey]);
      const rollbackTipBoxId = 'b3'.repeat(32);
      const rollbackTipDigest = getDupTreeDigest([]);
      expect(tracker.replaceAuthenticatedV2DupHistory(
        authenticatedDupReconstruction({
          tipBoxId: priorTipBoxId,
          tipDigest: priorTipDigest,
          historyKey,
        }),
        authenticatedDupCacheIdentity,
      )).toEqual({
        changed: true,
        previousEntries: 0,
        currentEntries: 1,
        invalidatedCandidates: 0,
      });

      const stale = authenticatedCandidate({
        candidateId: 'c3'.repeat(32),
        burnTxHash: 'c4'.repeat(32),
        sidechainLogIndex: 1,
        dupInputBoxId: priorTipBoxId,
        dupInputDigest: priorTipDigest,
        vaultBoxId: 'c5'.repeat(32),
        unsignedTxDigest: 'c6'.repeat(32),
      });
      const current = authenticatedCandidate({
        candidateId: 'c7'.repeat(32),
        burnTxHash: 'c8'.repeat(32),
        sidechainLogIndex: 2,
        dupInputBoxId: rollbackTipBoxId,
        dupInputDigest: rollbackTipDigest,
        vaultBoxId: 'c9'.repeat(32),
        unsignedTxDigest: 'ca'.repeat(32),
      });
      insertCandidatePegOut(tracker, stale);
      insertCandidatePegOut(tracker, current);
      tracker.recordAuthenticatedSettlementCandidate(stale);
      tracker.recordAuthenticatedSettlementCandidate(current);

      expect(tracker.replaceAuthenticatedV2DupHistory(
        authenticatedDupReconstruction({
          tipBoxId: rollbackTipBoxId,
          tipDigest: rollbackTipDigest,
          observationDigest: 'cb'.repeat(32),
        }),
        authenticatedDupCacheIdentity,
      )).toEqual({
        changed: true,
        previousEntries: 1,
        currentEntries: 0,
        invalidatedCandidates: 1,
      });
      expect(tracker.getAuthenticatedV2DupHistory()).toEqual([]);
      expect(tracker.getAuthenticatedSettlementCandidate(stale.candidateId)?.status)
        .toBe('invalidated');
      expect(tracker.getAuthenticatedSettlementCandidate(current.candidateId)?.status)
        .toBe('prepared');
      expect(() => tracker.replaceAuthenticatedV2DupHistory(
        authenticatedDupReconstruction({
          tipBoxId: rollbackTipBoxId,
          tipDigest: rollbackTipDigest,
        }),
        {
          ...authenticatedDupCacheIdentity,
          duplicatePreventionNftIdHex: 'cc'.repeat(32),
        },
      )).toThrow(/does not match the configured cache identity/);
    });
  });

  it('atomically persists and reopens the reconstructed settlement-vault forest', () => {
    withTrackerDbPath((dbPath) => {
      const first = new StateTracker(dbPath);
      const reconstruction = authenticatedVaultReconstruction({});
      try {
        expect(first.replaceAuthenticatedV2VaultForest(
          reconstruction,
          authenticatedVaultCacheIdentity,
        )).toEqual({
          changed: true,
          previousBoxes: 0,
          currentBoxes: 3,
          previousUnspentBoxes: 0,
          currentUnspentBoxes: 2,
          invalidatedCandidates: 0,
        });
        expect(first.getAuthenticatedV2CurrentVaultBoxIds())
          .toEqual(['c1'.repeat(32), 'c2'.repeat(32)]);
        expect(first.getAuthenticatedV2VaultHistory()).toEqual([
          expect.objectContaining({
            boxIdHex: 'c1'.repeat(32),
            currentUtxoBinaryMatched: true,
            spentTransactionIdHex: null,
          }),
          expect.objectContaining({
            boxIdHex: 'c2'.repeat(32),
            currentUtxoBinaryMatched: true,
            spentTransactionIdHex: null,
          }),
          expect.objectContaining({
            boxIdHex: 'c3'.repeat(32),
            currentUtxoBinaryMatched: false,
            spentTransactionIdHex: 'c4'.repeat(32),
          }),
        ]);
      } finally {
        first.close();
      }

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedV2CurrentVaultBoxIds())
          .toEqual(['c1'.repeat(32), 'c2'.repeat(32)]);
        expect(reopened.getAuthenticatedV2VaultReconstructionState()).toEqual({
          vaultAddress: authenticatedVaultCacheIdentity.vaultAddress,
          vaultErgoTreeHex: authenticatedVaultCacheIdentity.vaultErgoTreeHex,
          duplicatePreventionObservationDigestHex: 'a5'.repeat(32),
          duplicatePreventionTipBoxIdHex: 'a6'.repeat(32),
          observationDigestHex: 'ac'.repeat(32),
          observedErgoTip: 100,
          observedErgoTipIdHex: 'a7'.repeat(32),
          observedErgoParentIdHex: 'a8'.repeat(32),
          observedErgoExtensionRootHex: 'a9'.repeat(32),
        });
      } finally {
        reopened.close();
      }
    });
  });

  it('invalidates only candidates whose vault is no longer current', () => {
    withTrackerDb((tracker) => {
      tracker.replaceAuthenticatedV2VaultForest(
        authenticatedVaultReconstruction({}),
        authenticatedVaultCacheIdentity,
      );
      const stale = authenticatedCandidate({
        candidateId: 'd1'.repeat(32),
        burnTxHash: 'd2'.repeat(32),
        sidechainLogIndex: 21,
        vaultBoxId: 'c1'.repeat(32),
      });
      const retained = authenticatedCandidate({
        candidateId: 'd3'.repeat(32),
        burnTxHash: 'd4'.repeat(32),
        sidechainLogIndex: 22,
        dupInputBoxId: 'd7'.repeat(32),
        dupInputDigest: 'd8'.repeat(33),
        vaultBoxId: 'c2'.repeat(32),
      });
      insertCandidatePegOut(tracker, stale);
      insertCandidatePegOut(tracker, retained);
      tracker.recordAuthenticatedSettlementCandidate(stale);
      tracker.recordAuthenticatedSettlementCandidate(retained);

      expect(tracker.replaceAuthenticatedV2VaultForest(
        authenticatedVaultReconstruction({
          currentBoxIds: ['c2'.repeat(32)],
          observationDigest: 'ad'.repeat(32),
          observedTipId: 'ae'.repeat(32),
        }),
        authenticatedVaultCacheIdentity,
      )).toEqual({
        changed: true,
        previousBoxes: 3,
        currentBoxes: 2,
        previousUnspentBoxes: 2,
        currentUnspentBoxes: 1,
        invalidatedCandidates: 1,
      });
      expect(tracker.getAuthenticatedSettlementCandidate(stale.candidateId)?.status)
        .toBe('invalidated');
      expect(tracker.getAuthenticatedSettlementCandidate(retained.candidateId)?.status)
        .toBe('prepared');
    });
  });

  it('refreshes snapshot metadata without invalidating an unchanged vault forest', () => {
    withTrackerDb((tracker) => {
      tracker.replaceAuthenticatedV2VaultForest(
        authenticatedVaultReconstruction({}),
        authenticatedVaultCacheIdentity,
      );
      const candidate = authenticatedCandidate({
        candidateId: 'd5'.repeat(32),
        burnTxHash: 'd6'.repeat(32),
        sidechainLogIndex: 23,
        vaultBoxId: 'c1'.repeat(32),
      });
      insertCandidatePegOut(tracker, candidate);
      tracker.recordAuthenticatedSettlementCandidate(candidate);

      expect(tracker.replaceAuthenticatedV2VaultForest(
        authenticatedVaultReconstruction({
          observationDigest: 'af'.repeat(32),
          observedTipId: 'b0'.repeat(32),
        }),
        authenticatedVaultCacheIdentity,
      )).toEqual({
        changed: false,
        previousBoxes: 3,
        currentBoxes: 3,
        previousUnspentBoxes: 2,
        currentUnspentBoxes: 2,
        invalidatedCandidates: 0,
      });
      expect(tracker.getAuthenticatedSettlementCandidate(candidate.candidateId)?.status)
        .toBe('prepared');
      expect(tracker.getAuthenticatedV2VaultReconstructionState()?.observationDigestHex)
        .toBe('af'.repeat(32));
      expect(tracker.getAuthenticatedV2VaultReconstructionState()?.observedErgoTipIdHex)
        .toBe('b0'.repeat(32));
    });
  });

  it('rejects vault identity drift, malformed cache payloads, and read-only replacement', () => {
    withTrackerDb((tracker) => {
      const reconstruction = authenticatedVaultReconstruction({});
      expect(() => tracker.replaceAuthenticatedV2VaultForest(reconstruction, {
        ...authenticatedVaultCacheIdentity,
        vaultErgoTreeHex: `1008cd02${'b1'.repeat(32)}`,
      })).toThrow(/does not match the configured cache identity/i);

      const malformed = authenticatedVaultReconstruction({});
      malformed.boxes[0].currentUtxoBinaryMatched = false;
      expect(() => tracker.replaceAuthenticatedV2VaultForest(
        malformed,
        authenticatedVaultCacheIdentity,
      )).toThrow(/binary status is inconsistent/i);
    });

    withTrackerDbPath((dbPath) => {
      const writable = new StateTracker(dbPath);
      writable.close();
      const readOnly = new StateTracker(dbPath, { readOnly: true });
      try {
        expect(() => readOnly.replaceAuthenticatedV2VaultForest(
          authenticatedVaultReconstruction({}),
          authenticatedVaultCacheIdentity,
        )).toThrow(readOnlyError);
      } finally {
        readOnly.close();
      }
    });
  });

  it('persists and addresses multiple burn events from one EVM transaction', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = '89'.repeat(32);
      const sidechainBlockHash = '8a'.repeat(32);
      const firstBurnId = deriveTrustlessBurnIdHex({
        sidechainIdHex: authenticatedSidechainId,
        sidechainTxHashHex: burnTxHash,
        eventIndex: 4,
      });
      const secondBurnId = deriveTrustlessBurnIdHex({
        sidechainIdHex: authenticatedSidechainId,
        sidechainTxHashHex: burnTxHash,
        eventIndex: 9,
      });

      tracker.insertPegOut(
        `0x${burnTxHash}`,
        `02${'8b'.repeat(32)}`,
        1_000_000n,
        1_234,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash,
          sidechainLogIndex: 4,
        },
      );
      tracker.insertPegOut(
        burnTxHash,
        `02${'8c'.repeat(32)}`,
        2_000_000n,
        1_234,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash,
          sidechainLogIndex: 9,
        },
      );

      expect(tracker.getPendingPegOuts()).toHaveLength(2);
      expect((tracker as any).getPegOutEventCountByTxHash(burnTxHash)).toBe(2);
      expect(tracker.getPegOutByBurnId(firstBurnId)).toEqual(
        expect.objectContaining({ sidechain_log_index: 4, amount_nanoerg: '1000000' }),
      );
      expect(tracker.getPegOutByBurnId(secondBurnId)).toEqual(
        expect.objectContaining({ sidechain_log_index: 9, amount_nanoerg: '2000000' }),
      );
      expect(tracker.getPegOutByEvent(burnTxHash, 9)).toEqual(
        expect.objectContaining({ burn_id: secondBurnId }),
      );
      expect(() => tracker.getPegOutByTxHash(burnTxHash)).toThrow(
        /ambiguous.*burn event identity/i,
      );
      expect(() => tracker.insertPegOut(
        burnTxHash,
        `02${'8c'.repeat(32)}`,
        2_000_001n,
        1_234,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash,
          sidechainLogIndex: 9,
        },
      )).toThrow(/event identity conflicts with an existing persisted row/);
    });
  });

  it('migrates a hash-unique legacy peg-out table without discarding its row', () => {
    withTrackerDbPath((dbPath) => {
      const burnTxHash = '8d'.repeat(32);
      const seed = new Database(dbPath);
      seed.exec(`
        CREATE TABLE peg_out_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sidechain_burn_tx_hash TEXT UNIQUE NOT NULL,
          ergo_recipient_address TEXT NOT NULL,
          amount_nanoerg TEXT NOT NULL,
          sidechain_burn_height INTEGER NOT NULL,
          user TEXT,
          sidechain_block_hash TEXT,
          sidechain_log_index INTEGER,
          status TEXT NOT NULL DEFAULT 'detected',
          phase1_box_id TEXT,
          phase2_unlock_tx_id TEXT,
          avl_proof_hex TEXT,
          pending_avl_key TEXT,
          ergo_anchor_height INTEGER,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO peg_out_events (
          sidechain_burn_tx_hash,
          ergo_recipient_address,
          amount_nanoerg,
          sidechain_burn_height
        ) VALUES (
          '0x${burnTxHash}',
          '02${'8e'.repeat(32)}',
          '1000000',
          1200
        );
      `);
      seed.close();

      const tracker = new StateTracker(dbPath);
      try {
        expect(() => tracker.insertPegOut(
          burnTxHash,
          `02${'8f'.repeat(32)}`,
          2_000_000n,
          1_234,
          {
            sidechainId: authenticatedSidechainId,
            sidechainBlockHash: '90'.repeat(32),
            sidechainLogIndex: 3,
          },
        )).toThrow(/legacy hash-only row.*explicit repair/i);

        expect(tracker.getPendingPegOuts()).toHaveLength(1);
        expect(tracker.getPegOutByEvent(burnTxHash, 3)).toBeUndefined();

        expect(tracker.repairDetectedPegOut(
          burnTxHash,
          `02${'8e'.repeat(32)}`,
          1_000_000n,
          1_200,
          {
            sidechainId: authenticatedSidechainId,
            sidechainBlockHash: '90'.repeat(32),
            sidechainLogIndex: 3,
          },
        )).toBe(true);
        expect(tracker.getPegOutByEvent(burnTxHash, 3)).toEqual(
          expect.objectContaining({ amount_nanoerg: '1000000' }),
        );

        tracker.insertPegOut(
          burnTxHash,
          `02${'8f'.repeat(32)}`,
          2_000_000n,
          1_234,
          {
            sidechainId: authenticatedSidechainId,
            sidechainBlockHash: '90'.repeat(32),
            sidechainLogIndex: 7,
          },
        );
        expect(tracker.getPendingPegOuts()).toHaveLength(2);
        expect(tracker.getPegOutByEvent(burnTxHash, 7)).toEqual(
          expect.objectContaining({ amount_nanoerg: '2000000' }),
        );
        expect(() => tracker.getPegOutByTxHash(burnTxHash)).toThrow(
          /ambiguous.*burn event identity/i,
        );
      } finally {
        tracker.close();
      }
    });
  });

  it('journals the exact burnId when two persisted events share a transaction hash', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'a4'.repeat(32);
      const first = authenticatedCandidate({
        candidateId: 'a5'.repeat(32),
        burnTxHash,
        sidechainLogIndex: 2,
      });
      const second = authenticatedCandidate({
        candidateId: 'a6'.repeat(32),
        burnTxHash,
        sidechainLogIndex: 6,
        dupInputBoxId: 'a7'.repeat(32),
        dupInputDigest: 'a8'.repeat(33),
        vaultBoxId: 'a9'.repeat(32),
        unsignedTxDigest: 'aa'.repeat(32),
      });
      insertCandidatePegOut(tracker, first);
      insertCandidatePegOut(tracker, second);

      expect(tracker.recordAuthenticatedSettlementCandidate(second)).toEqual(
        expect.objectContaining({
          burnId: second.burnId,
          burnTxHash,
          sidechainLogIndex: 6,
          status: 'prepared',
        }),
      );
      expect(tracker.getPegOutByBurnId(first.burnId)).toEqual(
        expect.objectContaining({ sidechain_log_index: 2 }),
      );
      expect(tracker.getPegOutByBurnId(second.burnId)).toEqual(
        expect.objectContaining({ sidechain_log_index: 6 }),
      );
    });
  });

  it('blocks a newly discovered sibling event after a legacy aggregate lifecycle has started', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'ad'.repeat(32);
      tracker.insertPegOut(
        burnTxHash,
        `02${'ae'.repeat(32)}`,
        1_000_000n,
        1_234,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: 'af'.repeat(32),
          sidechainLogIndex: 2,
        },
      );
      tracker.updatePegOutStatus(
        { burnTxHash, sidechainLogIndex: 2 },
        'aggregate_submitted',
        { phase1BoxId: 'b0'.repeat(32), pendingAvlKey: burnTxHash },
      );

      expect(() => tracker.insertPegOut(
        burnTxHash,
        `02${'b1'.repeat(32)}`,
        2_000_000n,
        1_234,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: 'af'.repeat(32),
          sidechainLogIndex: 8,
        },
      )).toThrow(/legacy aggregate lifecycle.*manual reconciliation/i);
      expect(tracker.getPegOutEventCountByTxHash(burnTxHash)).toBe(1);
    });
  });

  it('blocks a sibling event while a legacy aggregate journal is pending', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'b2'.repeat(32);
      tracker.insertPegOut(
        burnTxHash,
        `02${'b3'.repeat(32)}`,
        1_000_000n,
        1_234,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: 'b4'.repeat(32),
          sidechainLogIndex: 1,
        },
      );
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], 'b5'.repeat(32));

      expect(() => tracker.insertPegOut(
        burnTxHash,
        `02${'b6'.repeat(32)}`,
        2_000_000n,
        1_234,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: 'b4'.repeat(32),
          sidechainLogIndex: 5,
        },
      )).toThrow(/active legacy aggregate journal.*manual reconciliation/i);
      expect(tracker.getPegOutEventCountByTxHash(burnTxHash)).toBe(1);
    });
  });

  it('repairs a partial creation-height migration and invalidates the legacy candidate', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const seed = new Database(dbPath);
      seed.exec(`
        CREATE TABLE peg_out_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sidechain_burn_tx_hash TEXT UNIQUE NOT NULL,
          ergo_recipient_address TEXT NOT NULL,
          amount_nanoerg TEXT NOT NULL,
          sidechain_burn_height INTEGER NOT NULL,
          user TEXT,
          sidechain_block_hash TEXT,
          sidechain_log_index INTEGER,
          status TEXT NOT NULL DEFAULT 'detected',
          phase1_box_id TEXT,
          phase2_unlock_tx_id TEXT,
          avl_proof_hex TEXT,
          pending_avl_key TEXT,
          ergo_anchor_height INTEGER,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE authenticated_settlement_candidates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          candidate_id TEXT UNIQUE NOT NULL,
          burn_tx_hash TEXT NOT NULL,
          sidechain_id TEXT NOT NULL,
          sidechain_height TEXT NOT NULL,
          sidechain_block_hash TEXT NOT NULL,
          sidechain_log_index INTEGER NOT NULL,
          tracker_key TEXT NOT NULL,
          tracker_value TEXT NOT NULL,
          tracker_box_id TEXT NOT NULL,
          anchor_header_id TEXT NOT NULL,
          anchor_header_height INTEGER NOT NULL,
          dup_input_box_id TEXT NOT NULL,
          dup_input_digest TEXT NOT NULL,
          vault_box_id TEXT NOT NULL,
          unsigned_tx_digest TEXT NOT NULL,
          creation_height INTEGER,
          observed_sidechain_tip TEXT NOT NULL,
          observed_ergo_tip INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'prepared',
          check_expected_tx_id TEXT,
          check_response_digest TEXT,
          invalidation_reason TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      seed.prepare(`
        INSERT INTO peg_out_events (
          sidechain_burn_tx_hash,
          ergo_recipient_address,
          amount_nanoerg,
          sidechain_burn_height,
          sidechain_block_hash,
          sidechain_log_index
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `0x${candidate.burnTxHash}`,
        `02${'ab'.repeat(32)}`,
        '1000000',
        Number(candidate.sidechainHeight),
        candidate.sidechainBlockHash,
        candidate.sidechainLogIndex,
      );
      seed.prepare(`
        INSERT INTO authenticated_settlement_candidates (
          candidate_id,
          burn_tx_hash,
          sidechain_id,
          sidechain_height,
          sidechain_block_hash,
          sidechain_log_index,
          tracker_key,
          tracker_value,
          tracker_box_id,
          anchor_header_id,
          anchor_header_height,
          dup_input_box_id,
          dup_input_digest,
          vault_box_id,
          unsigned_tx_digest,
          observed_sidechain_tip,
          observed_ergo_tip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidate.candidateId,
        candidate.burnTxHash,
        candidate.sidechainId,
        candidate.sidechainHeight.toString(),
        candidate.sidechainBlockHash,
        candidate.sidechainLogIndex,
        candidate.trackerKey,
        candidate.trackerValue,
        candidate.trackerBoxId,
        candidate.anchorHeaderId,
        candidate.anchorHeaderHeight,
        candidate.dupInputBoxId,
        candidate.dupInputDigest,
        candidate.vaultBoxId,
        candidate.unsignedTxDigest,
        candidate.observedSidechainTip.toString(),
        candidate.observedErgoTip,
      );
      seed.close();

      const tracker = new StateTracker(dbPath);
      try {
        expect(tracker.getPegOutByBurnId(candidate.burnId)).toEqual(
          expect.objectContaining({
            sidechain_id: candidate.sidechainId,
            burn_id: candidate.burnId,
            sidechain_log_index: candidate.sidechainLogIndex,
          }),
        );
        expect(tracker.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            burnId: candidate.burnId,
            creationHeight: candidate.observedErgoTip,
            status: 'invalidated',
            invalidationReason: 'candidate predates explicit transaction creation-height binding',
          }),
        );
      } finally {
        tracker.close();
      }
    });
  });

  it('invalidates ambiguous prepared rows when durable recovery provenance is introduced', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.close();

      const seed = new Database(dbPath);
      seed.exec(`
        DROP TRIGGER authenticated_execution_reservation_candidate_drift;
        DROP TRIGGER authenticated_execution_reservation_candidate_delete;
        DROP TRIGGER authenticated_execution_reservation_peg_out_drift;
        DROP TRIGGER authenticated_execution_reservation_peg_out_delete;
        DROP TABLE authenticated_settlement_execution_reservations;
      `);
      for (const column of [
        'recovery_schema',
        'recovery_sidechain_consensus_digest',
        'recovery_admission_digest',
        'recovery_sidechain_tip_hash',
        'recovery_sidechain_source_count',
      ]) {
        seed.exec(`ALTER TABLE authenticated_settlement_candidates DROP COLUMN ${column}`);
      }
      seed.prepare(`
        DELETE FROM state_tracker_migrations WHERE migration_id = ?
      `).run('authenticated-v2-recovery-provenance-v1');
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            status: 'invalidated',
            recoverySchema: null,
            recoverySidechainConsensusDigest: null,
            recoveryAdmissionDigest: null,
            recoverySidechainTipHash: null,
            recoverySidechainSourceCount: null,
            invalidationReason:
              'prepared candidate predates durable package-recovery provenance binding',
          }),
        );
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        reopened.close();
      }
    });
  });

  it('invalidates ambiguous prepared rows after a crash before the recovery migration marker', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.close();

      const seed = new Database(dbPath);
      seed.prepare(`
        DELETE FROM state_tracker_migrations WHERE migration_id = ?
      `).run('authenticated-v2-recovery-provenance-v1');
      expect(seed.prepare(`
        SELECT COUNT(*) AS count
        FROM pragma_table_info('authenticated_settlement_candidates')
        WHERE name LIKE 'recovery_%'
      `).get()).toEqual({ count: 5 });
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            status: 'invalidated',
            invalidationReason:
              'prepared candidate predates durable package-recovery provenance binding',
          }),
        );
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        reopened.close();
      }

      const verified = new Database(dbPath, { readonly: true });
      try {
        expect(verified.prepare(`
          SELECT migration_id
          FROM state_tracker_migrations
          WHERE migration_id = ?
        `).get('authenticated-v2-recovery-provenance-v1')).toEqual({
          migration_id: 'authenticated-v2-recovery-provenance-v1',
        });
      } finally {
        verified.close();
      }
    });
  });

  it('invalidates a prepared row with partial durable recovery provenance', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.close();

      const seed = new Database(dbPath);
      seed.prepare(`
        UPDATE authenticated_settlement_candidates
        SET recovery_schema = 'e2s.authenticated-v2-package-recovery.v2'
        WHERE candidate_id = ?
      `).run(candidate.candidateId);
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            status: 'invalidated',
            invalidationReason:
              'prepared candidate has incomplete package-recovery provenance binding',
          }),
        );
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        reopened.close();
      }
    });
  });

  it('invalidates a legacy checked candidate missing canonical finality proof identity', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.markAuthenticatedSettlementCandidateCheckPassed(
        authenticatedCheckAdmission(candidate.candidateId),
      );
      initial.close();

      const seed = new Database(dbPath);
      seed.prepare(`
        UPDATE authenticated_settlement_candidates
        SET check_finality_statement_digest = NULL,
            check_finality_program_id = NULL,
            check_finality_proof_system_id = NULL,
            check_finality_verifier_profile_id = NULL,
            check_finality_proof_payload_digest = NULL,
            check_finality_proof_digest = NULL
        WHERE candidate_id = ?
      `).run(candidate.candidateId);
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            creationHeight: candidate.creationHeight,
            status: 'invalidated',
            invalidationReason:
              'checked candidate predates canonical finality proof identity binding',
          }),
        );
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toHaveLength(0);
      } finally {
        reopened.close();
      }
    });
  });

  it.each([
    ['missing stable Ergo view', 'check_stable_ergo_view_digest', null],
    ['malformed stable Ergo view', 'check_stable_ergo_view_digest', 'zz'.repeat(32)],
    ['missing stable sidechain view', 'check_stable_sidechain_view_digest', null],
    ['malformed stable sidechain view', 'check_stable_sidechain_view_digest', 'zz'.repeat(32)],
    ['missing admission', 'check_admission_digest', null],
    ['malformed admission', 'check_admission_digest', 'zz'.repeat(32)],
  ] as const)(
    'invalidates a legacy checked candidate with a %s binding',
    (_case, column, digest) => {
      withTrackerDbPath((dbPath) => {
        const candidate = authenticatedCandidate();
        const initial = new StateTracker(dbPath);
        insertCandidatePegOut(initial, candidate);
        initial.recordAuthenticatedSettlementCandidate(candidate);
        initial.markAuthenticatedSettlementCandidateCheckPassed(
          authenticatedCheckAdmission(candidate.candidateId),
        );
        initial.close();

        const seed = new Database(dbPath);
        seed.prepare(`
          UPDATE authenticated_settlement_candidates
          SET ${column} = ?
          WHERE candidate_id = ?
        `).run(digest, candidate.candidateId);
        seed.close();

        const reopened = new StateTracker(dbPath);
        try {
          expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
            expect.objectContaining({
              status: 'invalidated',
              invalidationReason: 'checked candidate predates stable-view admission binding',
            }),
          );
          expect(reopened.getActiveAuthenticatedSettlementCandidates()).toHaveLength(0);
        } finally {
          reopened.close();
        }
      });
    },
  );

  it.each([
    ['missing', null],
    ['empty', ''],
    ['wrong-length', 'ab'],
    ['non-hex', 'zz'.repeat(32)],
    ['non-canonical uppercase', 'AB'.repeat(32)],
  ])('invalidates a checked candidate with a %s signed transaction digest', (_case, digest) => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.markAuthenticatedSettlementCandidateCheckPassed(
        authenticatedCheckAdmission(candidate.candidateId),
      );
      initial.close();

      const seed = new Database(dbPath);
      seed.prepare(`
        UPDATE authenticated_settlement_candidates
        SET check_signed_transaction_digest = ?
        WHERE candidate_id = ?
      `).run(digest, candidate.candidateId);
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            creationHeight: candidate.creationHeight,
            status: 'invalidated',
            invalidationReason:
              'checked candidate predates exact signed transaction digest binding',
          }),
        );
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toHaveLength(0);
      } finally {
        reopened.close();
      }
    });
  });

  it('invalidates legacy check identity state and revokes its active reservation', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const reservationDigest = 'c1'.repeat(32);
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.markAuthenticatedSettlementCandidateCheckPassed(
        authenticatedCheckAdmission(candidate.candidateId),
      );
      initial.close();

      const seed = new Database(dbPath);
      seed.exec(`
        DROP TRIGGER authenticated_execution_reservation_candidate_drift;
        DROP TRIGGER authenticated_execution_reservation_candidate_delete;
        DROP TRIGGER authenticated_execution_reservation_peg_out_drift;
        DROP TRIGGER authenticated_execution_reservation_peg_out_delete;
      `);
      seed.prepare(`
        INSERT INTO authenticated_settlement_execution_reservations (
          schema,
          reservation_digest,
          candidate_id,
          candidate_authority_digest,
          burn_id,
          burn_tx_hash,
          amount_nanoerg,
          recipient_ergo_tree,
          dup_input_box_id,
          vault_box_id,
          expected_tx_id,
          unsigned_tx_digest,
          unsigned_package_digest,
          signed_transaction_digest,
          check_response_digest,
          signer_context_digest,
          checker_identity_digest,
          revalidation_digest,
          stable_ergo_view_digest,
          stable_sidechain_view_digest,
          finality_proof_digest,
          check_admission_digest,
          authorization_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'e2s.authenticated-settlement-execution-reservation.v1',
        reservationDigest,
        candidate.candidateId,
        'c2'.repeat(32),
        candidate.burnId,
        candidate.burnTxHash,
        '1000000',
        `0008cd02${'c3'.repeat(32)}`,
        candidate.dupInputBoxId,
        candidate.vaultBoxId,
        'a1'.repeat(32),
        candidate.unsignedTxDigest,
        'a0'.repeat(32),
        'af'.repeat(32),
        'a2'.repeat(32),
        'b3'.repeat(32),
        'b4'.repeat(32),
        'a3'.repeat(32),
        'ac'.repeat(32),
        'ad'.repeat(32),
        'ab'.repeat(32),
        'ae'.repeat(32),
        'c4'.repeat(32),
      );
      seed.exec(`
        ALTER TABLE authenticated_settlement_candidates DROP COLUMN check_signer_context_digest;
        ALTER TABLE authenticated_settlement_candidates DROP COLUMN check_checker_identity_digest;
        ALTER TABLE authenticated_settlement_execution_reservations DROP COLUMN signer_context_digest;
        ALTER TABLE authenticated_settlement_execution_reservations DROP COLUMN checker_identity_digest;
      `);
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            status: 'invalidated',
            checkSignerContextDigest: null,
            checkCheckerIdentityDigest: null,
            invalidationReason:
              'checked candidate predates signer and checker identity binding',
          }),
        );
        expect(reopened.getAuthenticatedSettlementExecutionReservation({
          reservationDigestHex: reservationDigest,
        })).toEqual(expect.objectContaining({
          schema: 'e2s.authenticated-settlement-execution-reservation.v1',
          status: 'revoked',
          signerContextDigestHex: null,
          checkerIdentityDigestHex: null,
          revocationReason:
            'reservation predates signer and checker identity binding',
        }));
      } finally {
        reopened.close();
      }
    });
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['wrong-length', 'ab'],
    ['non-hex', 'zz'.repeat(32)],
    ['non-canonical uppercase', 'AB'.repeat(32)],
  ])('invalidates a checked candidate with a %s unsigned package digest', (_case, digest) => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.markAuthenticatedSettlementCandidateCheckPassed(
        authenticatedCheckAdmission(candidate.candidateId),
      );
      initial.close();

      const seed = new Database(dbPath);
      seed.prepare(`
        UPDATE authenticated_settlement_candidates
        SET check_unsigned_package_digest = ?
        WHERE candidate_id = ?
      `).run(digest, candidate.candidateId);
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            creationHeight: candidate.creationHeight,
            status: 'invalidated',
            invalidationReason:
              'checked candidate lacks a canonical unsigned package binding',
          }),
        );
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toHaveLength(0);
      } finally {
        reopened.close();
      }
    });
  });

  it('invalidates a pre-versioned prepared candidate before it can block replacement work', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.close();

      const seed = new Database(dbPath);
      seed.prepare(`
        UPDATE authenticated_settlement_candidates
        SET candidate_schema_version = NULL
        WHERE candidate_id = ?
      `).run(candidate.candidateId);
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            schemaVersion: 0,
            status: 'invalidated',
            invalidationReason:
              'candidate predates explicit candidate schema version binding',
          }),
        );
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toHaveLength(0);
      } finally {
        reopened.close();
      }
    });
  });

  it('invalidates a version-1 prepared candidate even when every identity column is present', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const initial = new StateTracker(dbPath);
      insertCandidatePegOut(initial, candidate);
      initial.recordAuthenticatedSettlementCandidate(candidate);
      initial.close();

      const seed = new Database(dbPath);
      seed.prepare(`
        UPDATE authenticated_settlement_candidates
        SET candidate_schema_version = 1
        WHERE candidate_id = ?
      `).run(candidate.candidateId);
      seed.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            schemaVersion: 1,
            status: 'invalidated',
            invalidationReason:
              'candidate predates explicit candidate schema version binding',
          }),
        );
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toHaveLength(0);
      } finally {
        reopened.close();
      }
    });
  });

  it('deduplicates prefixed and unprefixed forms of the same persisted burn hash', () => {
    withTrackerDb((tracker) => {
      const candidate = authenticatedCandidate();
      tracker.insertPegOut(
        `0x${candidate.burnTxHash}`,
        `02${'97'.repeat(32)}`,
        1_000_000n,
        Number(candidate.sidechainHeight),
        {
          sidechainId: candidate.sidechainId,
          sidechainBlockHash: candidate.sidechainBlockHash,
          sidechainLogIndex: candidate.sidechainLogIndex,
        },
      );
      tracker.insertPegOut(
        candidate.burnTxHash,
        `02${'97'.repeat(32)}`,
        1_000_000n,
        Number(candidate.sidechainHeight),
        {
          sidechainId: candidate.sidechainId,
          sidechainBlockHash: candidate.sidechainBlockHash,
          sidechainLogIndex: candidate.sidechainLogIndex,
        },
      );

      expect(tracker.getPendingPegOuts()).toHaveLength(1);
      expect(tracker.getPegOutByTxHash(candidate.burnTxHash)).toEqual(
        expect.objectContaining({
          sidechain_burn_tx_hash: candidate.burnTxHash,
          amount_nanoerg: '1000000',
        }),
      );
      expect(tracker.recordAuthenticatedSettlementCandidate(candidate).status).toBe('prepared');
    });
  });

  it('persists an exact restart-safe candidate and records one matching check result', () => {
    withTrackerDbPath((dbPath) => {
      const candidate = authenticatedCandidate();
      const first = new StateTracker(dbPath);
      insertCandidatePegOut(first, candidate);
      const recorded = first.recordAuthenticatedSettlementCandidate(candidate);
      expect(recorded).toEqual(expect.objectContaining({
        ...candidate,
        status: 'prepared',
        checkExpectedTxId: null,
        checkUnsignedPackageDigest: null,
        checkSignedTransactionDigest: null,
        checkResponseDigest: null,
        checkSignerContextDigest: null,
        checkCheckerIdentityDigest: null,
        checkRevalidationDigest: null,
        checkNativeVerificationRequestDigest: null,
        checkTrustAnchorDigest: null,
        checkFinalityHorizonHash: null,
        checkFinalityHorizonHeight: null,
        checkFinalityStatementDigest: null,
        checkFinalityProgramId: null,
        checkFinalityProofSystemId: null,
        checkFinalityVerifierProfileId: null,
        checkFinalityProofPayloadDigest: null,
        checkFinalityProofDigest: null,
        invalidationReason: null,
      }));
      expect(first.recordAuthenticatedSettlementCandidate(candidate).candidateId).toBe(
        candidate.candidateId,
      );
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toHaveLength(1);
        const admission = authenticatedCheckAdmission(candidate.candidateId);
        expect(reopened.markAuthenticatedSettlementCandidateCheckPassed(admission)).toBe(true);
        expect(reopened.markAuthenticatedSettlementCandidateCheckPassed(admission)).toBe(true);
        for (const conflictingField of [
          { expectedTxId: 'a7'.repeat(32) },
          { unsignedPackageDigestHex: 'a7'.repeat(32) },
          { signedTransactionDigestHex: 'a7'.repeat(32) },
          { checkResponseDigestHex: 'a7'.repeat(32) },
          { signerContextDigestHex: 'a7'.repeat(32) },
          { checkerIdentityDigestHex: 'a7'.repeat(32) },
          { revalidationDigestHex: 'a7'.repeat(32) },
          { nativeVerificationRequestDigestHex: 'a7'.repeat(32) },
          { trustAnchorDigestHex: 'a7'.repeat(32) },
          { finalityHorizonHashHex: 'a7'.repeat(32) },
          { finalityHorizonHeight: 1_301n },
          { finalityStatementDigestHex: 'a9'.repeat(32) },
          { finalityProgramIdHex: 'aa'.repeat(32) },
          { finalityVerifierProfileIdHex: 'ac'.repeat(32) },
          { finalityProofPayloadDigestHex: 'ad'.repeat(32) },
          { finalityProofDigestHex: 'ae'.repeat(32) },
          { stableErgoViewDigestHex: 'b0'.repeat(32) },
          { stableSidechainViewDigestHex: 'b1'.repeat(32) },
          { admissionDigestHex: 'b2'.repeat(32) },
        ]) {
          expect(() => reopened.markAuthenticatedSettlementCandidateCheckPassed(
            authenticatedCheckAdmission(candidate.candidateId, conflictingField),
          )).toThrow(/check result conflicts/);
        }
        expect(() => reopened.markAuthenticatedSettlementCandidateCheckPassed(
          authenticatedCheckAdmission(candidate.candidateId, {
            finalityProofSystemId: 2,
          }),
        )).toThrow(/proof system is unsupported/i);
        expect(reopened.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
          expect.objectContaining({
            status: 'check_passed',
            checkExpectedTxId: 'a1'.repeat(32),
            checkUnsignedPackageDigest: 'a0'.repeat(32),
            checkSignedTransactionDigest: 'af'.repeat(32),
            checkResponseDigest: 'a2'.repeat(32),
            checkSignerContextDigest: 'b3'.repeat(32),
            checkCheckerIdentityDigest: 'b4'.repeat(32),
            checkRevalidationDigest: 'a3'.repeat(32),
            checkNativeVerificationRequestDigest: 'a4'.repeat(32),
            checkTrustAnchorDigest: 'a5'.repeat(32),
            checkFinalityHorizonHash: 'a6'.repeat(32),
            checkFinalityHorizonHeight: 1_300n,
            checkFinalityStatementDigest: 'a7'.repeat(32),
            checkFinalityProgramId: 'a8'.repeat(32),
            checkFinalityProofSystemId: 1,
            checkFinalityVerifierProfileId: 'a9'.repeat(32),
            checkFinalityProofPayloadDigest: 'aa'.repeat(32),
            checkFinalityProofDigest: 'ab'.repeat(32),
            checkStableErgoViewDigest: 'ac'.repeat(32),
            checkStableSidechainViewDigest: 'ad'.repeat(32),
            checkAdmissionDigest: 'ae'.repeat(32),
          }),
        );
      } finally {
        reopened.close();
      }
    });
  });

  it('atomically makes burn reversion terminal and invalidates its checked candidate', () => {
    withTrackerDb((tracker) => {
      const candidate = authenticatedCandidate();
      insertCandidatePegOut(tracker, candidate);
      tracker.recordAuthenticatedSettlementCandidate(candidate);
      tracker.markAuthenticatedSettlementCandidateCheckPassed(
        authenticatedCheckAdmission(candidate.candidateId),
      );

      expect(tracker.markPegOutBurnRevertedAndInvalidateCandidates(
        `0x${candidate.burnTxHash}`,
        'canonical burn receipt disappeared',
      )).toEqual({
        pegOutTransitioned: true,
        candidatesInvalidated: 1,
      });
      expect(tracker.getPegOutByTxHash(candidate.burnTxHash)).toEqual(
        expect.objectContaining({ status: 'burn_reverted' }),
      );
      expect(tracker.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
        expect.objectContaining({
          status: 'invalidated',
          checkExpectedTxId: 'a1'.repeat(32),
          checkUnsignedPackageDigest: 'a0'.repeat(32),
          checkSignedTransactionDigest: 'af'.repeat(32),
          checkResponseDigest: 'a2'.repeat(32),
          checkSignerContextDigest: 'b3'.repeat(32),
          checkCheckerIdentityDigest: 'b4'.repeat(32),
          checkRevalidationDigest: 'a3'.repeat(32),
          checkNativeVerificationRequestDigest: 'a4'.repeat(32),
          checkTrustAnchorDigest: 'a5'.repeat(32),
          checkFinalityHorizonHash: 'a6'.repeat(32),
          checkFinalityHorizonHeight: 1_300n,
          checkFinalityStatementDigest: 'a7'.repeat(32),
          checkFinalityProgramId: 'a8'.repeat(32),
          checkFinalityProofSystemId: 1,
          checkFinalityVerifierProfileId: 'a9'.repeat(32),
          checkFinalityProofPayloadDigest: 'aa'.repeat(32),
          checkFinalityProofDigest: 'ab'.repeat(32),
          invalidationReason: 'canonical burn receipt disappeared',
        }),
      );
      expect(() => tracker.updatePegOutStatus(candidate.burnTxHash, 'detected')).toThrow(
        /terminal burn_reverted/,
      );
      expect(() => tracker.resetPegOutToDetected(candidate.burnTxHash)).toThrow(
        /terminal burn_reverted/,
      );
      expect(() => tracker.recordAuthenticatedSettlementCandidate(candidate)).toThrow(
        /burn_reverted|invalidated/,
      );
      expect(tracker.markPegOutBurnRevertedAndInvalidateCandidates(
        candidate.burnTxHash,
        'canonical burn receipt disappeared',
      )).toEqual({
        pegOutTransitioned: false,
        candidatesInvalidated: 0,
      });
    });
  });

  it('serializes active candidates across shared DUP and vault inputs, then frees them on invalidation', () => {
    withTrackerDb((tracker) => {
      const first = authenticatedCandidate();
      const second = authenticatedCandidate({
        candidateId: 'b1'.repeat(32),
        burnTxHash: 'b2'.repeat(32),
        sidechainHeight: first.sidechainHeight + 1n,
        sidechainBlockHash: 'b3'.repeat(32),
      });
      insertCandidatePegOut(tracker, first);
      insertCandidatePegOut(tracker, second);
      tracker.recordAuthenticatedSettlementCandidate(first);
      expect(() => tracker.recordAuthenticatedSettlementCandidate(second)).toThrow(
        /conflicts with active candidate/,
      );

      expect(tracker.invalidateAuthenticatedSettlementCandidate(
        first.candidateId,
        'selected singleton input became stale',
      )).toBe(true);
      expect(tracker.recordAuthenticatedSettlementCandidate(second)).toEqual(
        expect.objectContaining({ candidateId: second.candidateId, status: 'prepared' }),
      );
      expect(tracker.invalidateActiveAuthenticatedSettlementCandidates(
        'sidechain rollback below observed high-water height',
      )).toBe(1);
      expect(tracker.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
    });
  });

  it('rejects candidates whose canonical burn coordinates differ from the persisted event', () => {
    withTrackerDb((tracker) => {
      const candidate = authenticatedCandidate();
      insertCandidatePegOut(tracker, candidate);
      expect(() => tracker.recordAuthenticatedSettlementCandidate(authenticatedCandidate({
        candidateId: candidate.candidateId,
        burnTxHash: candidate.burnTxHash,
        sidechainBlockHash: 'c1'.repeat(32),
      }))).toThrow(/does not match persisted burn coordinates/);
      expect(() => tracker.recordAuthenticatedSettlementCandidate({
        ...candidate,
        sidechainLogIndex: candidate.sidechainLogIndex + 1,
      })).toThrow(/burnId does not match its sidechain event identity/);
      expect(() => tracker.recordAuthenticatedSettlementCandidate({
        ...candidate,
        schemaVersion: AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION - 1,
      })).toThrow(
        new RegExp(`schema version must be ${AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION}`),
      );
    });
  });
});

describe('StateTracker authenticated settlement submission journal', () => {
  it('persists the one allowed transport attempt before submission and restores it after restart', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const first = new StateTracker(dbPath);
      const reserved = first.reserveAuthenticatedSettlementTransportAttempt(admission);
      expect(reserved).toEqual(expect.objectContaining({
        executionReservationDigestHex:
          authenticatedTransportAuthority.executionReservationDigestHex,
        candidateId: authenticatedTransportAuthority.candidateId,
        expectedTxId: authenticatedTransportAuthority.expectedTxId,
        status: 'pending',
        submissionAttempted: true,
        submissionDisposition: null,
        submittedTxId: null,
        responseDigestHex: null,
        ergoObservation: null,
      }));
      expect(Object.keys(reserved)).not.toContain('signedTransactionBytes');
      expect(first.getRecoverableAuthenticatedSettlementSubmissionAttempts())
        .toEqual([reserved]);
      expect(() =>
        first.reserveAuthenticatedSettlementTransportAttempt(admission)
      ).toThrow(/reconcile it without resubmission/);
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        })).toEqual(reserved);
        expect(reopened.getRecoverableAuthenticatedSettlementSubmissionAttempts())
          .toEqual([reserved]);
        expect(() =>
          reopened.reserveAuthenticatedSettlementTransportAttempt(admission)
        ).toThrow(/reconcile it without resubmission/);
      } finally {
        reopened.close();
      }
    });
  });

  it.each([
    ['accepted', 'submitted', authenticatedTransportAuthority.expectedTxId, 'a1'.repeat(32)],
    ['rejected', 'rejected', null, 'a2'.repeat(32)],
    ['ambiguous', 'pending', null, null],
  ] as const)(
    'finalizes a %s response exactly and never creates a second attempt',
    (disposition, status, submittedTxId, responseDigestHex) => {
      withTrackerDbPath((dbPath) => {
        const admission = seedAuthenticatedTransportAuthority(dbPath);
        const tracker = new StateTracker(dbPath);
        try {
          const reserved =
            tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
          const finalized =
            tracker.finalizeAuthenticatedSettlementSubmissionAttempt({
              durableAttemptDigestHex: reserved.durableAttemptDigestHex,
              disposition,
              submittedTxId,
              responseDigestHex,
            });
          expect(finalized).toEqual(expect.objectContaining({
            status,
            submissionDisposition: disposition,
            submittedTxId,
            responseDigestHex,
          }));
          expect(tracker.finalizeAuthenticatedSettlementSubmissionAttempt({
            durableAttemptDigestHex: reserved.durableAttemptDigestHex,
            disposition,
            submittedTxId,
            responseDigestHex,
          })).toEqual(finalized);
          expect(() => tracker.finalizeAuthenticatedSettlementSubmissionAttempt({
            durableAttemptDigestHex: reserved.durableAttemptDigestHex,
            disposition: disposition === 'accepted' ? 'ambiguous' : 'accepted',
            submittedTxId:
              disposition === 'accepted'
                ? null
                : authenticatedTransportAuthority.expectedTxId,
            responseDigestHex: 'a3'.repeat(32),
          })).toThrow(/conflicts with the durable journal/);
          expect(() =>
            tracker.reserveAuthenticatedSettlementTransportAttempt(admission)
          ).toThrow(/without resubmission/);
          expect(tracker.getRecoverableAuthenticatedSettlementSubmissionAttempts())
            .toHaveLength(status === 'pending' || status === 'submitted' ? 1 : 0);
        } finally {
          tracker.close();
        }
      });
    },
  );

  it('advances dual-source observations to confirmation and quarantines a later disappearance', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      try {
        const reserved =
          tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
        tracker.finalizeAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          disposition: 'accepted',
          submittedTxId: authenticatedTransportAuthority.expectedTxId,
          responseDigestHex: 'a4'.repeat(32),
        });
        const preFinal = stablePreFinalObservation(
          authenticatedTransportAuthority.expectedTxId,
        );
        expect(tracker.recordAuthenticatedSettlementSubmissionObservation({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          observation: preFinal,
          consensus: matchingObservationConsensus(preFinal),
        })).toEqual(expect.objectContaining({
          applied: true,
          status: 'submitted',
          attempt: expect.objectContaining({ status: 'submitted' }),
        }));
        const final = stableFinalObservation(
          authenticatedTransportAuthority.expectedTxId,
          {
            inclusionHeight: 101,
            inclusionHeaderIdHex: 'e2'.repeat(32),
            observedTipHeight: 110,
            observedTipHeaderIdHex: 'e4'.repeat(32),
            confirmations: 10,
          },
        );
        expect(tracker.recordAuthenticatedSettlementSubmissionObservation({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          observation: final,
          consensus: matchingObservationConsensus(final),
        })).toEqual(expect.objectContaining({
          applied: true,
          status: 'confirmed',
          attempt: expect.objectContaining({
            status: 'confirmed',
            submittedTxId: authenticatedTransportAuthority.expectedTxId,
          }),
        }));
        expect(tracker.getRecoverableAuthenticatedSettlementSubmissionAttempts())
          .toEqual([]);
        expect(tracker.getObservableAuthenticatedSettlementSubmissionAttempts())
          .toEqual([
            expect.objectContaining({
              durableAttemptDigestHex: reserved.durableAttemptDigestHex,
              status: 'confirmed',
            }),
          ]);

        const absent = {
          ...stableAbsentObservation(authenticatedTransportAuthority.expectedTxId),
          record: createAggregateSettlementErgoObservationRecord({
            policyVersion: 1,
            requiredConfirmations: 10,
            status: 'absent',
            transactionIdHex: authenticatedTransportAuthority.expectedTxId,
            transactionDigestHex: null,
            inclusionHeight: null,
            inclusionHeaderIdHex: null,
            observedTipHeight: 111,
            observedTipHeaderIdHex: 'e5'.repeat(32),
            confirmations: 0,
          }),
        };
        expect(tracker.recordAuthenticatedSettlementSubmissionObservation({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          observation: absent,
          consensus: matchingObservationConsensus(absent),
        })).toEqual(expect.objectContaining({
          status: 'quarantined',
          attempt: expect.objectContaining({
            status: 'quarantined',
            quarantineReason: 'confirmed_transaction_disappeared',
          }),
        }));
        const laterFinal = stableFinalObservation(
          authenticatedTransportAuthority.expectedTxId,
          {
            inclusionHeight: 101,
            inclusionHeaderIdHex: 'e2'.repeat(32),
            observedTipHeight: 112,
            observedTipHeaderIdHex: 'e6'.repeat(32),
            confirmations: 12,
          },
        );
        expect(() =>
          tracker.recordAuthenticatedSettlementSubmissionObservation({
            durableAttemptDigestHex: reserved.durableAttemptDigestHex,
            observation: laterFinal,
            consensus: matchingObservationConsensus(laterFinal),
          })
        ).toThrow(/quarantined.*terminal/i);
        expect(tracker.getAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        })).toEqual(expect.objectContaining({
          status: 'quarantined',
          quarantineReason: 'confirmed_transaction_disappeared',
        }));
        expect(tracker.getObservableAuthenticatedSettlementSubmissionAttempts())
          .toEqual([]);
      } finally {
        tracker.close();
      }
    });
  });

  it('atomically quarantines a confirmed transaction re-included under another block', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      try {
        const reserved =
          tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
        const first = stableFinalObservation(
          authenticatedTransportAuthority.expectedTxId,
        );
        expect(tracker.recordAuthenticatedSettlementSubmissionObservation({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          observation: first,
          consensus: matchingObservationConsensus(first),
        }).status).toBe('confirmed');

        const reIncluded = stableFinalObservation(
          authenticatedTransportAuthority.expectedTxId,
          {
            inclusionHeight: 102,
            inclusionHeaderIdHex: 'e7'.repeat(32),
            observedTipHeight: 112,
            observedTipHeaderIdHex: 'e8'.repeat(32),
            confirmations: 11,
          },
        );
        expect(tracker.recordAuthenticatedSettlementSubmissionObservation({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          observation: reIncluded,
          consensus: matchingObservationConsensus(reIncluded),
        })).toEqual(expect.objectContaining({
          status: 'quarantined',
          attempt: expect.objectContaining({
            status: 'quarantined',
            quarantineReason: 'confirmed_transaction_reorged',
            ergoObservation: expect.objectContaining({
              inclusionHeight: 102,
              inclusionHeaderIdHex: 'e7'.repeat(32),
            }),
          }),
        }));
      } finally {
        tracker.close();
      }
    });
  });

  it.each([
    [
      'same-height fork',
      {
        inclusionHeight: 100,
        inclusionHeaderIdHex: 'e7'.repeat(32),
        observedTipHeight: 109,
        observedTipHeaderIdHex: 'e8'.repeat(32),
        confirmations: 10,
      },
    ],
    [
      'lower temporary tip',
      {
        inclusionHeight: 99,
        inclusionHeaderIdHex: 'e9'.repeat(32),
        observedTipHeight: 108,
        observedTipHeaderIdHex: 'ea'.repeat(32),
        confirmations: 10,
      },
    ],
  ] as const)(
    'quarantines confirmed re-inclusion before monotonic-tip rejection on a %s',
    (_case, options) => {
      withTrackerDbPath((dbPath) => {
        const admission = seedAuthenticatedTransportAuthority(dbPath);
        const tracker = new StateTracker(dbPath);
        try {
          const reserved =
            tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
          const first = stableFinalObservation(
            authenticatedTransportAuthority.expectedTxId,
          );
          tracker.recordAuthenticatedSettlementSubmissionObservation({
            durableAttemptDigestHex: reserved.durableAttemptDigestHex,
            observation: first,
            consensus: matchingObservationConsensus(first),
          });
          const reIncluded = stableFinalObservation(
            authenticatedTransportAuthority.expectedTxId,
            options,
          );
          expect(tracker.recordAuthenticatedSettlementSubmissionObservation({
            durableAttemptDigestHex: reserved.durableAttemptDigestHex,
            observation: reIncluded,
            consensus: matchingObservationConsensus(reIncluded),
          })).toEqual(expect.objectContaining({
            status: 'quarantined',
            attempt: expect.objectContaining({
              status: 'quarantined',
              quarantineReason: 'confirmed_transaction_reorged',
            }),
          }));
        } finally {
          tracker.close();
        }
      });
    },
  );

  it('quarantines confirmed disappearance before same-height fork rejection', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      try {
        const reserved =
          tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
        const first = stableFinalObservation(
          authenticatedTransportAuthority.expectedTxId,
        );
        tracker.recordAuthenticatedSettlementSubmissionObservation({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          observation: first,
          consensus: matchingObservationConsensus(first),
        });
        const absent = {
          record: createAggregateSettlementErgoObservationRecord({
            policyVersion: 1,
            requiredConfirmations: 10,
            status: 'absent',
            transactionIdHex: authenticatedTransportAuthority.expectedTxId,
            transactionDigestHex: null,
            inclusionHeight: null,
            inclusionHeaderIdHex: null,
            observedTipHeight: 109,
            observedTipHeaderIdHex: 'eb'.repeat(32),
            confirmations: 0,
          }),
          transaction: null,
        };
        expect(tracker.recordAuthenticatedSettlementSubmissionObservation({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          observation: absent,
          consensus: matchingObservationConsensus(absent),
        })).toEqual(expect.objectContaining({
          status: 'quarantined',
          attempt: expect.objectContaining({
            status: 'quarantined',
            quarantineReason: 'confirmed_transaction_disappeared',
          }),
        }));
      } finally {
        tracker.close();
      }
    });
  });

  it('quarantines an existing attempt atomically when its execution authority drifts', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      const reserved =
        tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
      const drift = new Database(dbPath);
      try {
        drift.prepare(`
          UPDATE authenticated_settlement_candidates
          SET status = 'invalidated',
              invalidation_reason = 'transport authority drift test'
          WHERE candidate_id = ?
        `).run(authenticatedTransportAuthority.candidateId);
      } finally {
        drift.close();
      }
      try {
        expect(tracker.getAuthenticatedSettlementExecutionReservation({
          reservationDigestHex:
            authenticatedTransportAuthority.executionReservationDigestHex,
        })).toEqual(expect.objectContaining({ status: 'revoked' }));
        expect(tracker.getAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        })).toEqual(expect.objectContaining({
          status: 'quarantined',
          quarantineReason: 'execution_reservation_revoked',
        }));
        expect(tracker.getRecoverableAuthenticatedSettlementSubmissionAttempts())
          .toEqual([]);
      } finally {
        tracker.close();
      }
    });
  });

  it('rejects malformed lifecycle rows at both the SQLite and mapper boundaries', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      const reserved =
        tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
      tracker.close();
      const probe = new Database(dbPath);
      try {
        expect(() => probe.prepare(`
          UPDATE authenticated_settlement_submission_attempts
          SET status = 'submitted'
          WHERE durable_attempt_digest = ?
        `).run(reserved.durableAttemptDigestHex)).toThrow(/constraint/i);
        probe.prepare(`
          UPDATE authenticated_settlement_submission_attempts
          SET schema = 'unknown.transport-attempt'
          WHERE durable_attempt_digest = ?
        `).run(reserved.durableAttemptDigestHex);
      } finally {
        probe.close();
      }
      const reopened = new StateTracker(dbPath);
      try {
        expect(() => reopened.getAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        })).toThrow(/invalid lifecycle state/);
      } finally {
        reopened.close();
      }
    });
  });

  it('fails closed on restart when any durable transport identity field changes', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
      tracker.close();

      const mutations = [
        'execution_reservation_digest',
        'transport_reservation_digest',
        'durable_attempt_digest',
        'candidate_id',
        'expected_tx_id',
        'unsigned_tx_digest',
        'unsigned_package_digest',
        'payout_digest',
        'tracker_box_id',
        'dup_input_box_id',
        'signed_transaction_digest',
        'pre_submit_revalidation_digest',
        'broadcast_authorization_digest',
      ] as const;
      for (const [index, column] of mutations.entries()) {
        const mutatedPath = `${dbPath}.${index}.sqlite`;
        copyFileSync(dbPath, mutatedPath);
        const probe = new Database(mutatedPath);
        try {
          probe.prepare(`
            UPDATE authenticated_settlement_submission_attempts
            SET ${column} = ?
          `).run((0xa0 + index).toString(16).repeat(32));
        } finally {
          probe.close();
        }
        const reopened = new StateTracker(mutatedPath);
        try {
          const recover = () =>
            reopened.getRecoverableAuthenticatedSettlementSubmissionAttempts();
          expect(recover).toThrow(/invalid durable identity/);
        } finally {
          reopened.close();
        }
      }
    });
  });

  it('rejects a recomputed durable identity when its current reservation authority is missing', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
      tracker.close();

      const executionReservationDigestHex = 'b8'.repeat(32);
      const recomputed = deriveAuthenticatedSettlementTransportAttemptIdentity({
        ...authenticatedTransportAuthority,
        executionReservationDigestHex,
      });
      const probe = new Database(dbPath);
      try {
        probe.prepare(`
          UPDATE authenticated_settlement_submission_attempts
          SET execution_reservation_digest = ?,
              transport_reservation_digest = ?,
              durable_attempt_digest = ?
        `).run(
          executionReservationDigestHex,
          recomputed.transportReservationDigestHex,
          recomputed.durableAttemptDigestHex,
        );
      } finally {
        probe.close();
      }

      const reopened = new StateTracker(dbPath);
      try {
        expect(() =>
          reopened.getRecoverableAuthenticatedSettlementSubmissionAttempts()
        ).toThrow(/active execution reservation/);
      } finally {
        reopened.close();
      }
    });
  });

  it('rejects a confirmed row whose persisted observation authority is incomplete', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      const reserved =
        tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
      const final = stableFinalObservation(
        authenticatedTransportAuthority.expectedTxId,
      );
      tracker.recordAuthenticatedSettlementSubmissionObservation({
        durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        observation: final,
        consensus: matchingObservationConsensus(final),
      });
      tracker.close();

      const probe = new Database(dbPath);
      try {
        probe.pragma('ignore_check_constraints = ON');
        probe.prepare(`
          UPDATE authenticated_settlement_submission_attempts
          SET ergo_observation_source_count = 0
          WHERE durable_attempt_digest = ?
        `).run(reserved.durableAttemptDigestHex);
      } finally {
        probe.close();
      }
      const reopened = new StateTracker(dbPath);
      try {
        expect(() => reopened.getAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        })).toThrow(/invalid observation authority/);
      } finally {
        reopened.close();
      }
    });
  });

  it('rejects confirmed lifecycle state without an authoritative observation', () => {
    withTrackerDbPath((dbPath) => {
      const admission = seedAuthenticatedTransportAuthority(dbPath);
      const tracker = new StateTracker(dbPath);
      const reserved =
        tracker.reserveAuthenticatedSettlementTransportAttempt(admission);
      tracker.close();

      const probe = new Database(dbPath);
      const synthesizeConfirmation = () => probe.prepare(`
        UPDATE authenticated_settlement_submission_attempts
        SET status = 'confirmed',
            submission_disposition = 'accepted',
            submitted_tx_id = expected_tx_id,
            confirmed_at = datetime('now')
        WHERE durable_attempt_digest = ?
      `).run(reserved.durableAttemptDigestHex);
      try {
        expect(synthesizeConfirmation).toThrow(/constraint/i);
        probe.pragma('ignore_check_constraints = ON');
        synthesizeConfirmation();
      } finally {
        probe.close();
      }

      const reopened = new StateTracker(dbPath);
      try {
        expect(() => reopened.getAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        })).toThrow(/invalid lifecycle state/);
      } finally {
        reopened.close();
      }
    });
  });
});

describe('StateTracker SPV tracker history', () => {
  it('persists SPV tracker entries idempotently for rebuild-on-demand proofs', () => {
    withTrackerDb((tracker) => {
      const entry: SpvTrackerHistoryEntry = {
        keyHex: '11'.repeat(32),
        valueHex: '22'.repeat(36),
        sidechainHeight: 1234n,
        sidechainHeaderHash: '33'.repeat(32),
        bridgeEventRoot: '44'.repeat(32),
        ergoAnchorHeight: 330000,
      };

      tracker.insertSpvTrackerEntry(entry);
      tracker.insertSpvTrackerEntry(entry);

      expect(tracker.hasSpvTrackerKey(entry.keyHex)).toBe(true);
      expect(tracker.hasSpvTrackerKey('55'.repeat(32))).toBe(false);
      expect(tracker.getSpvTrackerHistory()).toEqual([
        { key: entry.keyHex, value: entry.valueHex },
      ]);
      expect(tracker.getSpvTrackerIdentityByHeight(1234n, 'aa'.repeat(32))).toEqual({
        sidechainIdHex: 'aa'.repeat(32),
        sidechainHeight: 1234n,
        sidechainHeaderHashHex: entry.sidechainHeaderHash,
        bridgeEventRootHex: entry.bridgeEventRoot,
        ergoAnchorHeight: entry.ergoAnchorHeight,
      });
      expect(tracker.getSpvTrackerIdentityByHeight(9999n, 'aa'.repeat(32))).toBeNull();
    });
  });

  it('keeps aggregate-submitted peg-outs in the pending reconciliation set', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = '55'.repeat(32);
      tracker.insertPegOut(burnTxHash, '02' + '44'.repeat(32), 1_000_000n, 1234);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: '66'.repeat(32),
        pendingAvlKey: burnTxHash,
      });

      const pending = tracker.getPendingPegOuts() as any[];
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('aggregate_submitted');
      expect(pending[0].phase1_box_id).toBe('66'.repeat(32));
      expect(pending[0].pending_avl_key).toBe(burnTxHash);
    });
  });

  it('keeps batch-submitted peg-outs in the pending reconciliation set', () => {
    withTrackerDb((tracker) => {
      const burnTxA = 'a1'.repeat(32);
      const burnTxB = 'b2'.repeat(32);
      const batchTxId = 'cc'.repeat(32);

      tracker.insertPegOut(burnTxA, '02' + '44'.repeat(32), 500_000n, 2001);
      tracker.insertPegOut(burnTxB, '02' + '55'.repeat(32), 700_000n, 2002);
      tracker.updatePegOutStatus(burnTxA, 'batch_submitted', {
        phase1BoxId: batchTxId,
        pendingAvlKey: burnTxA,
      });
      tracker.updatePegOutStatus(burnTxB, 'batch_submitted', {
        phase1BoxId: batchTxId,
        pendingAvlKey: burnTxB,
      });

      const pending = tracker.getPendingPegOuts() as any[];
      const batchRows = pending.filter((r: any) => r.status === 'batch_submitted');
      expect(batchRows).toHaveLength(2);
      expect(batchRows.every((r: any) => r.phase1_box_id === batchTxId)).toBe(true);
      expect(batchRows.map((r: any) => r.sidechain_burn_tx_hash).sort()).toEqual(
        [burnTxA, burnTxB].sort(),
      );
    });
  });

  it('returns submitted settlement tx ids only for matching submitted statuses', () => {
    withTrackerDb((tracker) => {
      const aggregateBurn = 'a1'.repeat(32);
      const fallbackBurn = 'b2'.repeat(32);
      const batchBurn = 'c3'.repeat(32);
      const detectedBurn = 'd4'.repeat(32);
      const aggregateTx = '11'.repeat(32);
      const fallbackTx = '22'.repeat(32);
      const batchTx = '33'.repeat(32);

      tracker.insertPegOut(aggregateBurn, '02' + '44'.repeat(32), 500_000n, 2001);
      tracker.insertPegOut(fallbackBurn, '02' + '55'.repeat(32), 600_000n, 2002);
      tracker.insertPegOut(batchBurn, '02' + '66'.repeat(32), 700_000n, 2003);
      tracker.insertPegOut(detectedBurn, '02' + '77'.repeat(32), 800_000n, 2004);
      tracker.updatePegOutStatus(aggregateBurn, 'aggregate_submitted', {
        phase1BoxId: aggregateTx,
      });
      tracker.updatePegOutStatus(fallbackBurn, 'aggregate_submitted', {
        phase2TxId: fallbackTx,
      });
      tracker.updatePegOutStatus(batchBurn, 'batch_submitted', {
        phase1BoxId: batchTx,
      });

      expect(tracker.getSubmittedSettlementTxId(aggregateBurn, 'aggregate_submitted')).toBe(aggregateTx);
      expect(tracker.getSubmittedSettlementTxId(fallbackBurn, 'aggregate_submitted')).toBe(fallbackTx);
      expect(tracker.getSubmittedSettlementTxId(batchBurn, 'batch_submitted')).toBe(batchTx);
      expect(tracker.getSubmittedSettlementTxId(aggregateBurn, 'batch_submitted')).toBeNull();
      expect(tracker.getSubmittedSettlementTxId(batchBurn, 'aggregate_submitted')).toBeNull();
      expect(tracker.getSubmittedSettlementTxId(detectedBurn, 'aggregate_submitted')).toBeNull();
      expect(tracker.getSubmittedSettlementTxId('ee'.repeat(32), 'aggregate_submitted')).toBeNull();
    });
  });

  it('journals recoverable aggregate settlement attempts with exact burn order', () => {
    withTrackerDb((tracker) => {
      const txId = '44'.repeat(32);
      const burnA = 'a1'.repeat(32);
      const burnB = 'b2'.repeat(32);

      tracker.insertPegOut(burnA, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.insertPegOut(burnB, '02' + '22'.repeat(32), 2_000_000n, 201);
      tracker.recordAggregateSettlementAttempt('batch', [burnB, burnA], txId);
      tracker.recordAggregateSettlementAttempt('batch', [burnB, burnA], txId);

      expect(tracker.getRecoverableAggregateSettlementAttempts()).toMatchObject([
        {
          mode: 'batch',
          expectedTxId: txId,
          submittedTxId: null,
          burnTxHashes: [burnB, burnA],
          status: 'pending',
          lifecycleVersion: 0,
          recoveryBindingStatus: 'policy_v1',
          recoveryPolicyVersion: 1,
          recoveryRequiredConfirmations: 10,
          ergoObservation: null,
        },
      ]);
    });
  });

  it('moves aggregate settlement attempts through submitted and terminal states', () => {
    withTrackerDb((tracker) => {
      const txId = '45'.repeat(32);
      const burnTxHash = 'c3'.repeat(32);

      tracker.insertPegOut(burnTxHash, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      expect(tracker.getRecoverableAggregateSettlementAttempts()).toMatchObject([
        {
          mode: 'single',
          expectedTxId: txId,
          submittedTxId: txId,
          burnTxHashes: [burnTxHash],
          status: 'submitted',
        },
      ]);

      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single',
        burnTxHash,
        stableFinalObservation(txId),
        spvTrackerSuccessorDigest(),
      )).toBe(true);
      expect(tracker.getRecoverableAggregateSettlementAttempts()).toEqual([]);
    });
  });

  it('accepts only monotonic same-inclusion observations when replaying a confirmed settlement', () => {
    withTrackerDb((tracker) => {
      const txId = '45'.repeat(32);
      const burnTxHash = 'c4'.repeat(32);
      tracker.insertPegOut(burnTxHash, `02${'12'.repeat(32)}`, 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      const initial = stableFinalObservation(txId);
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single',
        burnTxHash,
        initial,
        spvTrackerSuccessorDigest(),
      )).toBe(true);
      const confirmedAttempt = tracker.getAggregateSettlementAttempt(txId)!;

      const replacedInclusion = stableFinalObservation(txId, {
        inclusionHeaderIdHex: 'e4'.repeat(32),
      });
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        confirmedAttempt.lifecycleVersion,
        'single',
        burnTxHash,
        replacedInclusion,
        spvTrackerSuccessorDigest(),
      )).toBe(false);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        lifecycleVersion: confirmedAttempt.lifecycleVersion,
        ergoObservation: {
          inclusionHeight: 100,
          inclusionHeaderIdHex: 'e2'.repeat(32),
          observedTipHeight: 109,
        },
      });

      const replacedTransaction = stableFinalObservation(txId, {
        transactionDigestHex: 'e6'.repeat(32),
      });
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        confirmedAttempt.lifecycleVersion,
        'single',
        burnTxHash,
        replacedTransaction,
        spvTrackerSuccessorDigest(),
      )).toBe(false);

      const movedInclusion = stableFinalObservation(txId, {
        inclusionHeight: 101,
        observedTipHeight: 110,
        confirmations: 10,
      });
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        confirmedAttempt.lifecycleVersion,
        'single',
        burnTxHash,
        movedInclusion,
        spvTrackerSuccessorDigest(),
      )).toBe(false);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        lifecycleVersion: confirmedAttempt.lifecycleVersion,
        ergoObservation: {
          transactionDigestHex: 'e1'.repeat(32),
          inclusionHeight: 100,
          inclusionHeaderIdHex: 'e2'.repeat(32),
          observedTipHeight: 109,
        },
      });

      const advancedTip = stableFinalObservation(txId, {
        observedTipHeight: 110,
        observedTipHeaderIdHex: 'e5'.repeat(32),
        confirmations: 11,
      });
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        confirmedAttempt.lifecycleVersion,
        'single',
        burnTxHash,
        advancedTip,
        spvTrackerSuccessorDigest(),
      )).toBe(true);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        lifecycleVersion: confirmedAttempt.lifecycleVersion + 1,
        ergoObservation: {
          inclusionHeight: 100,
          inclusionHeaderIdHex: 'e2'.repeat(32),
          observedTipHeight: 110,
          observedTipHeaderIdHex: 'e5'.repeat(32),
          confirmations: 11,
        },
      });
    });
  });

  it('records confirmed aggregate settlement reorg quarantine without rolling back local effects', () => {
    withTrackerDb((tracker) => {
      const txId = '4d'.repeat(32);
      const burnTxHash = 'd4'.repeat(32);
      tracker.insertPegOut(burnTxHash, `02${'14'.repeat(32)}`, 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single',
        burnTxHash,
        stableFinalObservation(txId),
        spvTrackerSuccessorDigest(),
      )).toBe(true);
      const confirmed = tracker.getAggregateSettlementAttempt(txId)!;
      const absent = stableAbsentObservation(txId);
      expect(tracker.recordConfirmedAggregateSettlementReorgObservation({
        expectedTxId: txId,
        expectedLifecycleVersion: confirmed.lifecycleVersion,
        observation: absent,
        consensus: matchingObservationConsensus(absent),
      })).toBe(true);

      expect(tracker.getPegOutByTxHash(burnTxHash)).toMatchObject({
        status: 'phase2_unlocked',
        phase2_unlock_tx_id: txId,
      });
      expect(tracker.getAllAvlKeys()).toEqual([burnTxHash]);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'confirmed',
        lifecycleVersion: confirmed.lifecycleVersion + 1,
        recoveryQuarantine: {
          reason: 'confirmed_reorg_observed',
          observation: expect.objectContaining({
            status: 'absent',
            transactionIdHex: txId,
          }),
          sourceCount: 2,
          consensusDigestHex: 'f3'.repeat(32),
        },
      });
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single',
        burnTxHash,
        stableFinalObservation(txId, {
          observedTipHeight: 110,
          observedTipHeaderIdHex: 'e5'.repeat(32),
          confirmations: 11,
        }),
        spvTrackerSuccessorDigest(),
      )).toBe(false);
    });
  });

  it('does not quarantine a confirmed settlement from stale lifecycle or single-source evidence', () => {
    withTrackerDb((tracker) => {
      const txId = '4e'.repeat(32);
      const burnTxHash = 'd5'.repeat(32);
      tracker.insertPegOut(burnTxHash, `02${'15'.repeat(32)}`, 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single',
        burnTxHash,
        stableFinalObservation(txId),
        spvTrackerSuccessorDigest(),
      )).toBe(true);
      const confirmed = tracker.getAggregateSettlementAttempt(txId)!;
      const absent = stableAbsentObservation(txId);

      expect(tracker.recordConfirmedAggregateSettlementReorgObservation({
        expectedTxId: txId,
        expectedLifecycleVersion: confirmed.lifecycleVersion - 1,
        observation: absent,
        consensus: matchingObservationConsensus(absent),
      })).toBe(false);
      expect(() => tracker.recordConfirmedAggregateSettlementReorgObservation({
        expectedTxId: txId,
        expectedLifecycleVersion: confirmed.lifecycleVersion,
        observation: absent,
        consensus: {
          ...matchingObservationConsensus(absent),
          sourceCount: 1,
        },
      })).toThrow(/requires matching absence consensus/);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'confirmed',
        lifecycleVersion: confirmed.lifecycleVersion,
        recoveryQuarantine: null,
      });
      expect(tracker.getPegOutByTxHash(burnTxHash)?.status).toBe('phase2_unlocked');
    });
  });

  it('binds confirmed same-transaction ingest replay to the exact persisted tracker entry', () => {
    withTrackerDb((tracker) => {
      const txId = '46'.repeat(32);
      const burnTxHash = 'c5'.repeat(32);
      const trackerEntry = {
        keyHex: 'a1'.repeat(32),
        valueHex: 'a2'.repeat(36),
        sidechainHeight: 1234n,
        sidechainHeaderHash: 'a3'.repeat(32),
        bridgeEventRoot: 'a4'.repeat(32),
        ergoAnchorHeight: 330_000,
      };
      tracker.insertPegOut(burnTxHash, `02${'13'.repeat(32)}`, 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single-with-ingest', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      const observation = stableFinalObservation(txId);
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single-with-ingest',
        burnTxHash,
        observation,
        spvTrackerSuccessorDigest([trackerEntry]),
        trackerEntry,
      )).toBe(true);
      const confirmedLifecycleVersion = tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion;
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        confirmedLifecycleVersion,
        'single-with-ingest',
        burnTxHash,
        observation,
        spvTrackerSuccessorDigest([trackerEntry]),
        { ...trackerEntry, valueHex: 'b2'.repeat(36) },
      )).toBe(false);
      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        confirmedLifecycleVersion,
        'single-with-ingest',
        burnTxHash,
        observation,
        spvTrackerSuccessorDigest([trackerEntry]),
      )).toBe(false);
      expect(tracker.getSpvTrackerHistory()).toEqual([{
        key: trackerEntry.keyHex,
        value: trackerEntry.valueHex,
      }]);
    });
  });

  it('rolls back initial confirmation when the tracker key conflicts with persisted history', () => {
    withTrackerDb((tracker) => {
      const txId = '47'.repeat(32);
      const burnTxHash = 'c6'.repeat(32);
      const trackerEntry = {
        keyHex: 'b1'.repeat(32),
        valueHex: 'b2'.repeat(36),
        sidechainHeight: 1235n,
        sidechainHeaderHash: 'b3'.repeat(32),
        bridgeEventRoot: 'b4'.repeat(32),
        ergoAnchorHeight: 330_001,
      };
      const conflictingEntry = {
        ...trackerEntry,
        bridgeEventRoot: 'c4'.repeat(32),
      };
      tracker.insertSpvTrackerEntry(conflictingEntry);
      tracker.insertPegOut(burnTxHash, `02${'14'.repeat(32)}`, 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single-with-ingest', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      expect(() => tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single-with-ingest',
        burnTxHash,
        stableFinalObservation(txId),
        spvTrackerSuccessorDigest([trackerEntry]),
        trackerEntry,
      )).toThrow(/conflicts with persisted history/);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        ergoObservation: null,
      });
      expect(tracker.getPegOutByTxHash(burnTxHash)).toMatchObject({
        status: 'aggregate_submitted',
      });
      expect(tracker.getAllAvlKeys()).toEqual([]);
      expect(tracker.getSpvTrackerHistory()).toEqual([{
        key: conflictingEntry.keyHex,
        value: conflictingEntry.valueHex,
      }]);
    });
  });

  it('rejects confirmation against a lifecycle version observed before concurrent recovery', () => {
    withTrackerDb((tracker) => {
      const txId = '4a'.repeat(32);
      const burnTxHash = 'c7'.repeat(32);
      tracker.insertPegOut(burnTxHash, `02${'15'.repeat(32)}`, 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      const current = tracker.getAggregateSettlementAttempt(txId)!;

      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        current.lifecycleVersion - 1,
        'single',
        burnTxHash,
        stableFinalObservation(txId),
        spvTrackerSuccessorDigest(),
      )).toBe(false);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        lifecycleVersion: current.lifecycleVersion,
        ergoObservation: null,
      });
      expect(tracker.getPegOutByTxHash(burnTxHash)).toMatchObject({
        status: 'aggregate_submitted',
      });
      expect(tracker.getAllAvlKeys()).toEqual([]);
    });
  });

  it('rejects confirmation when tracker history changed after successor R5 was observed', () => {
    withTrackerDb((tracker) => {
      const txId = '4b'.repeat(32);
      const burnTxHash = 'c8'.repeat(32);
      const observedTrackerDigest = spvTrackerSuccessorDigest();
      const concurrentEntry = {
        keyHex: 'd1'.repeat(32),
        valueHex: 'd2'.repeat(36),
        sidechainHeight: 1236n,
        sidechainHeaderHash: 'd3'.repeat(32),
        bridgeEventRoot: 'd4'.repeat(32),
        ergoAnchorHeight: 330_002,
      };
      tracker.insertPegOut(burnTxHash, `02${'16'.repeat(32)}`, 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      tracker.insertSpvTrackerEntry(concurrentEntry);

      expect(tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single',
        burnTxHash,
        stableFinalObservation(txId),
        observedTrackerDigest,
      )).toBe(false);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        ergoObservation: null,
      });
      expect(tracker.getPegOutByTxHash(burnTxHash)).toMatchObject({
        status: 'aggregate_submitted',
      });
      expect(tracker.getAllAvlKeys()).toEqual([]);
      expect(tracker.getSpvTrackerHistory()).toEqual([{
        key: concurrentEntry.keyHex,
        value: concurrentEntry.valueHex,
      }]);
    });
  });

  it('keeps abandoned aggregate settlement attempts out of recovery', () => {
    withTrackerDb((tracker) => {
      const txId = '46'.repeat(32);
      const burnTxHash = 'd4'.repeat(32);

      tracker.insertPegOut(burnTxHash, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.recordAggregateSettlementAttempt('single-with-ingest', [burnTxHash], txId);
      expect(tracker.markAggregateSettlementAttemptAbandoned(txId)).toBe(true);

      expect(tracker.getRecoverableAggregateSettlementAttempts()).toEqual([]);
    });
  });

  it('keeps generic abandoned transitions pending-only while operator recovery can abandon submitted attempts', () => {
    withTrackerDb((tracker) => {
      const txId = '48'.repeat(32);
      const burnTxHash = 'e5'.repeat(32);

      tracker.insertPegOut(burnTxHash, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        expectedTxId: txId,
        submittedTxId: txId,
        status: 'submitted',
      });
      expect(tracker.markAggregateSettlementAttemptAbandoned(txId)).toBe(false);
      const attempt = tracker.getAggregateSettlementAttempt(txId)!;
      const absence = stableAbsentObservation(txId);
      expect(tracker.abandonSubmittedAggregateSettlementAttempt(
        txId,
        attempt.lifecycleVersion,
        'aggregate_submitted',
        [burnTxHash],
        absence,
        matchingObservationConsensus(absence),
      )).toEqual({
        resetBurns: 0,
        skippedBurns: 1,
      });
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        expectedTxId: txId,
        submittedTxId: null,
        status: 'abandoned',
      });
      expect(tracker.getRecoverableAggregateSettlementAttempts()).toEqual([]);
    });
  });

  it('operator abandonment resets submitted peg-outs only when the stored settlement tx id matches', () => {
    withTrackerDb((tracker) => {
      const txId = '49'.repeat(32);
      const otherTxId = '4a'.repeat(32);
      const burnTxHash = 'f6'.repeat(32);

      tracker.insertPegOut(burnTxHash, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: otherTxId,
        pendingAvlKey: burnTxHash,
      });
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      const attempt = tracker.getAggregateSettlementAttempt(txId)!;
      const absence = stableAbsentObservation(txId);

      expect(() => tracker.abandonSubmittedAggregateSettlementAttempt(
        txId,
        attempt.lifecycleVersion,
        'aggregate_submitted',
        [burnTxHash],
        absence,
        matchingObservationConsensus(absence),
      )).toThrow(/does not match submitted tx/);

      const row = tracker.getPegOutByTxHash(burnTxHash) as any;
      expect(row.status).toBe('aggregate_submitted');
      expect(row.phase1_box_id).toBe(otherTxId);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({ status: 'submitted' });
    });
  });

  it('operator abandonment refuses if a submitted burn is already in AVL history', () => {
    withTrackerDb((tracker) => {
      const txId = '4b'.repeat(32);
      const burnTxHash = 'a6'.repeat(32);

      tracker.insertPegOut(burnTxHash, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnTxHash,
      });
      tracker.insertAvlKey(burnTxHash);
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      const attempt = tracker.getAggregateSettlementAttempt(txId)!;
      const absence = stableAbsentObservation(txId);

      expect(() => tracker.abandonSubmittedAggregateSettlementAttempt(
        txId,
        attempt.lifecycleVersion,
        'aggregate_submitted',
        [burnTxHash],
        absence,
        matchingObservationConsensus(absence),
      )).toThrow(/already exists in AVL history/);

      expect(tracker.getPegOutByTxHash(burnTxHash)).toMatchObject({ status: 'aggregate_submitted' });
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({ status: 'submitted' });
    });
  });

  it('operator abandonment is atomic across batch burns', () => {
    withTrackerDb((tracker) => {
      const txId = '4c'.repeat(32);
      const burnA = 'b6'.repeat(32);
      const burnB = 'b7'.repeat(32);

      tracker.insertPegOut(burnA, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.insertPegOut(burnB, '02' + '22'.repeat(32), 2_000_000n, 201);
      tracker.updatePegOutStatus(burnA, 'batch_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnA,
      });
      tracker.updatePegOutStatus(burnB, 'phase1_created', {
        phase1BoxId: txId,
        pendingAvlKey: burnB,
      });
      tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      const attempt = tracker.getAggregateSettlementAttempt(txId)!;
      const absence = stableAbsentObservation(txId);

      expect(() => tracker.abandonSubmittedAggregateSettlementAttempt(
        txId,
        attempt.lifecycleVersion,
        'batch_submitted',
        [burnA, burnB],
        absence,
        matchingObservationConsensus(absence),
      )).toThrow(/cannot abandon/);

      expect(tracker.getPegOutByTxHash(burnA)).toMatchObject({ status: 'batch_submitted' });
      expect(tracker.getPegOutByTxHash(burnB)).toMatchObject({ status: 'phase1_created' });
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({ status: 'submitted' });
    });
  });

  it('rejects mismatched aggregate settlement attempt replay', () => {
    withTrackerDb((tracker) => {
      const txId = '47'.repeat(32);
      const burnA = 'a1'.repeat(32);
      const burnB = 'b2'.repeat(32);

      tracker.insertPegOut(burnA, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.insertPegOut(burnB, '02' + '22'.repeat(32), 2_000_000n, 201);
      tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], txId);

      expect(() => tracker.recordAggregateSettlementAttempt('batch', [burnB, burnA], txId))
        .toThrow(/does not match existing journal row/);
      expect(() => tracker.recordAggregateSettlementAttempt('single', [burnA], txId))
        .toThrow(/does not match existing journal row/);
    });
  });

  it('atomically abandons a pending aggregate attempt when a burn reverts after signing', () => {
    withTrackerDb((tracker) => {
      const candidate = authenticatedCandidate();
      const txId = '47'.repeat(32);
      insertCandidatePegOut(tracker, candidate);
      tracker.recordAuthenticatedSettlementCandidate(candidate);
      tracker.markAuthenticatedSettlementCandidateCheckPassed(
        authenticatedCheckAdmission(candidate.candidateId),
      );
      const admission = tracker.recordAggregateSettlementAttempt(
        'single',
        [candidate.burnTxHash],
        txId,
      );

      expect(tracker.invalidatePendingAggregateSettlementAfterBurnObservation(
        admission,
        [{ burnId: candidate.burnId }],
        'burn reverted after aggregate transaction signing',
      )).toEqual({
        attemptAbandoned: true,
        pegOutsTransitioned: 1,
        candidatesInvalidated: 1,
      });
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'abandoned',
        submittedTxId: null,
        lifecycleVersion: 1,
      });
      expect(tracker.getPegOutByTxHash(candidate.burnTxHash)).toMatchObject({
        status: 'burn_reverted',
      });
      expect(tracker.getAuthenticatedSettlementCandidate(candidate.candidateId)).toMatchObject({
        status: 'invalidated',
        invalidationReason: 'burn reverted after aggregate transaction signing',
      });
      expect(tracker.getRecoverableAggregateSettlementAttempts()).toEqual([]);
    });
  });

  it('abandons a pending aggregate attempt without relabeling burns when freshness is unknown', () => {
    withTrackerDb((tracker) => {
      const txId = '48'.repeat(32);
      const burnTxHash = 'd5'.repeat(32);
      tracker.insertPegOut(burnTxHash, '02' + '22'.repeat(32), 1_000_000n, 201);
      const admission = tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);

      expect(tracker.invalidatePendingAggregateSettlementAfterBurnObservation(
        admission,
        [],
        'burn freshness became unknown after aggregate transaction signing',
      )).toEqual({
        attemptAbandoned: true,
        pegOutsTransitioned: 0,
        candidatesInvalidated: 0,
      });
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'abandoned',
        submittedTxId: null,
        lifecycleVersion: 1,
      });
      expect(tracker.getPegOutByTxHash(burnTxHash)).toMatchObject({ status: 'detected' });
    });
  });

  it('serializes burn invalidation before a competing transport reservation', () => {
    withTrackerDb((tracker) => {
      const txId = '53'.repeat(32);
      const burnTxHash = 'db'.repeat(32);
      tracker.insertPegOut(burnTxHash, `02${'51'.repeat(32)}`, 1_000_000n, 201);
      const first = tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      const competing = tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);

      expect(tracker.invalidatePendingAggregateSettlementAfterBurnObservation(
        first,
        [burnTxHash],
        'burn reverted before transport reservation',
      )).toMatchObject({ attemptAbandoned: true, pegOutsTransitioned: 1 });
      expect(() => tracker.startPendingAggregateSettlementSubmission(competing))
        .toThrow(/changed before transport reservation/);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'abandoned',
        transportReservationDigest: null,
      });
    });
  });

  it('projects exact outstanding peg-out identities for the backing alarm', () => {
    withTrackerDb((tracker) => {
      const detectedTxHash = '91'.repeat(32);
      const confirmedTxHash = '92'.repeat(32);
      const settledTxHash = '93'.repeat(32);
      const submittedTxHash = '94'.repeat(32);

      for (const [index, burnTxHash] of [
        detectedTxHash,
        confirmedTxHash,
        settledTxHash,
        submittedTxHash,
      ].entries()) {
        tracker.insertPegOut(
          burnTxHash,
          `02${'94'.repeat(32)}`,
          BigInt(index + 1) * 1_000_000n,
          1_300 + index,
          {
            sidechainId: authenticatedSidechainId,
            sidechainBlockHash: `${95 + index}`.repeat(32),
            sidechainLogIndex: index + 4,
          },
        );
      }
      tracker.updatePegOutStatus(confirmedTxHash, 'confirmed');
      tracker.updatePegOutStatus(settledTxHash, 'phase2_unlocked', {
        phase2TxId: '98'.repeat(32),
      });
      tracker.updatePegOutStatus(submittedTxHash, 'aggregate_submitted', {
        phase1BoxId: '99'.repeat(32),
      });

      expect(tracker.getOutstandingPegOutLiabilityObservations()).toEqual([
        expect.objectContaining({
          sidechainTransactionHashHex: detectedTxHash,
          amountNanoErg: 1_000_000n,
          ergoRecipientAddress: `02${'94'.repeat(32)}`,
          phase2UnlockTransactionIdHex: null,
          status: 'detected',
        }),
        expect.objectContaining({
          sidechainTransactionHashHex: confirmedTxHash,
          amountNanoErg: 2_000_000n,
          ergoRecipientAddress: `02${'94'.repeat(32)}`,
          phase2UnlockTransactionIdHex: null,
          status: 'confirmed',
        }),
        expect.objectContaining({
          sidechainTransactionHashHex: settledTxHash,
          amountNanoErg: 3_000_000n,
          ergoRecipientAddress: `02${'94'.repeat(32)}`,
          phase2UnlockTransactionIdHex: '98'.repeat(32),
          status: 'phase2_unlocked',
        }),
        expect.objectContaining({
          sidechainTransactionHashHex: submittedTxHash,
          amountNanoErg: 4_000_000n,
          inFlightSettlementTransactionIdHex: '99'.repeat(32),
          phase2UnlockTransactionIdHex: null,
          status: 'aggregate_submitted',
        }),
      ]);
    });
  });

  it('rejects missing or conflicting submitted settlement identities in backing observations', () => {
    withTrackerDb((tracker) => {
      const missingTxHash = '9a'.repeat(32);
      tracker.insertPegOut(
        missingTxHash,
        `02${'9b'.repeat(32)}`,
        1_000_000n,
        1_400,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: '9c'.repeat(32),
          sidechainLogIndex: 8,
        },
      );
      tracker.updatePegOutStatus(missingTxHash, 'aggregate_submitted');
      expect(() => tracker.getOutstandingPegOutLiabilityObservations()).toThrow(
        /status and settlement transaction ID must agree/i,
      );
    });

    withTrackerDb((tracker) => {
      const conflictingTxHash = '9d'.repeat(32);
      tracker.insertPegOut(
        conflictingTxHash,
        `02${'9e'.repeat(32)}`,
        1_000_000n,
        1_400,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: '9f'.repeat(32),
          sidechainLogIndex: 9,
        },
      );
      tracker.updatePegOutStatus(conflictingTxHash, 'batch_submitted', {
        phase1BoxId: 'a1'.repeat(32),
        phase2TxId: 'a2'.repeat(32),
      });
      expect(() => tracker.getOutstandingPegOutLiabilityObservations()).toThrow(
        /conflicting settlement transaction IDs/i,
      );
    });
  });

  it('rejects a legacy hash-only row as a backing-liability observation', () => {
    withTrackerDb((tracker) => {
      tracker.insertPegOut(
        '99'.repeat(32),
        `02${'9a'.repeat(32)}`,
        1_000_000n,
        1_400,
      );

      expect(() => tracker.getOutstandingPegOutLiabilityObservations()).toThrow(
        /canonical sidechain ID/i,
      );
    });
  });

  it('reconstructs a missing historical liability while retaining the scan cursor', () => {
    withTrackerDb((tracker) => {
      tracker.updateSyncState({ ergoHeight: 500, sidechainHeight: 2_000 });
      const sidechainTransactionHashHex = '9b'.repeat(32);
      const sidechainLogIndex = 6;
      const burnIdHex = deriveTrustlessBurnIdHex({
        sidechainIdHex: authenticatedSidechainId,
        sidechainTxHashHex: sidechainTransactionHashHex,
        eventIndex: sidechainLogIndex,
      });
      expect(tracker.getPegOutByBurnId(burnIdHex)).toBeUndefined();

      const result = reconcileCompletePegOutBackingInventory({
        entries: [Object.freeze({
          burnIdHex,
          sidechainIdHex: authenticatedSidechainId,
          sidechainTransactionHashHex,
          sidechainBlockHashHex: '9c'.repeat(32),
          sidechainLogIndex,
          sidechainBurnHeight: 1_200,
          amountNanoErg: 4_000_000n,
          ergoRecipientAddress: `02${'9d'.repeat(32)}`,
          user: '0x0000000000000000000000000000000000000001',
        })],
        persistence: createPegOutBackingInventoryPersistence(tracker),
        scanFromHeight: 0,
        pinnedHeight: 2_000,
        pinnedBlockHashHex: '9e'.repeat(32),
      });

      expect(result).toMatchObject({
        scanFromHeight: 0,
        pinnedHeight: 2_000,
        pinnedBlockHashHex: '9e'.repeat(32),
        observedCount: 1,
        insertedBurnIds: [burnIdHex],
      });
      expect(result.entries).toHaveLength(1);
      expect(tracker.getSyncState().latestSidechainHeight).toBe(2_000);
      expect(tracker.getPegOutByBurnId(burnIdHex)).toMatchObject({
        sidechain_burn_tx_hash: sidechainTransactionHashHex,
        amount_nanoerg: '4000000',
        sidechain_burn_height: 1_200,
        sidechain_block_hash: '9c'.repeat(32),
        sidechain_log_index: sidechainLogIndex,
        status: 'detected',
      });
    });
  });

  it('observes an exact canonical re-inclusion without rewriting burn_reverted history', () => {
    withTrackerDb((tracker) => {
      const sidechainTransactionHashHex = 'a0'.repeat(32);
      const sidechainLogIndex = 8;
      const burnIdHex = deriveTrustlessBurnIdHex({
        sidechainIdHex: authenticatedSidechainId,
        sidechainTxHashHex: sidechainTransactionHashHex,
        eventIndex: sidechainLogIndex,
      });
      tracker.insertPegOut(
        sidechainTransactionHashHex,
        `02${'a1'.repeat(32)}`,
        5_000_000n,
        1_100,
        {
          user: '0x0000000000000000000000000000000000000002',
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: 'a2'.repeat(32),
          sidechainLogIndex,
        },
      );
      tracker.updatePegOutStatus({ burnId: burnIdHex }, 'burn_reverted');

      const replacement = Object.freeze({
        burnIdHex,
        sidechainIdHex: authenticatedSidechainId,
        sidechainTransactionHashHex,
        sidechainBlockHashHex: 'a3'.repeat(32),
        sidechainLogIndex,
        sidechainBurnHeight: 1_250,
        amountNanoErg: 5_000_000n,
        ergoRecipientAddress: `02${'a1'.repeat(32)}`,
        user: '0x0000000000000000000000000000000000000002',
      });
      const result = reconcileCompletePegOutBackingInventory({
        entries: [replacement],
        persistence: createPegOutBackingInventoryPersistence(tracker),
        scanFromHeight: 0,
        pinnedHeight: 1_300,
        pinnedBlockHashHex: 'a4'.repeat(32),
      });

      expect(result.entries).toEqual([replacement]);
      expect(tracker.getPegOutByBurnId(burnIdHex)).toMatchObject({
        status: 'burn_reverted',
        sidechain_burn_height: 1_100,
        sidechain_block_hash: 'a2'.repeat(32),
      });

      expect(() => reconcileCompletePegOutBackingInventory({
        entries: [{ ...replacement, amountNanoErg: 5_000_001n }],
        persistence: createPegOutBackingInventoryPersistence(tracker),
        scanFromHeight: 0,
        pinnedHeight: 1_300,
        pinnedBlockHashHex: 'a4'.repeat(32),
      })).toThrow(/replacement conflicts/i);
    });
  });

  it('rejects a transport reservation after the exact funds-release state opens', () => {
    withTrackerDb((tracker) => {
      const fundsReleaseAuthorization =
        establishTestFundsReleaseContinuity(tracker);
      const txId = '52'.repeat(32);
      const burnTxHash = 'da'.repeat(32);
      tracker.insertPegOut(
        burnTxHash,
        `02${'50'.repeat(32)}`,
        1_000_000n,
        200,
      );
      const admission = tracker.recordAggregateSettlementAttempt(
        'single',
        [burnTxHash],
        txId,
        fundsReleaseAuthorization.stateDigestHex,
        fundsReleaseAuthorization.executionAuthorityEpochHex,
      );
      tracker.recordPegInSolvencyDeficitIncident({
        ergoHeight: 100,
        totalSupplyNanoErg: 2_000_000n,
        totalLockedNanoErg: 1_000_000n,
      });

      expect(() => tracker.startPendingAggregateSettlementSubmission(
        admission,
        fundsReleaseAuthorization.stateDigestHex,
        fundsReleaseAuthorization.executionAuthorityEpochHex,
      )).toThrow(/local funds-release hold is open/);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'pending',
        transportReservationDigest: null,
      });
    });
  });

  it('serializes a transport reservation before competing invalidation and duplicate submit', () => {
    withTrackerDb((tracker) => {
      const txId = '54'.repeat(32);
      const burnTxHash = 'dc'.repeat(32);
      tracker.insertPegOut(burnTxHash, `02${'52'.repeat(32)}`, 1_000_000n, 202);
      const first = tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      const competing = tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      const reservation = tracker.startPendingAggregateSettlementSubmission(first);

      expect(() => tracker.invalidatePendingAggregateSettlementAfterBurnObservation(
        competing,
        [burnTxHash],
        'stale competing burn observation',
      )).toThrow(/changed before burn invalidation/);
      expect(() => tracker.startPendingAggregateSettlementSubmission(competing))
        .toThrow(/changed before transport reservation/);
      expect(tracker.markAggregateSettlementAttemptAbandoned(txId)).toBe(false);
      expect(tracker.markAggregateSettlementAttemptSubmitted(reservation, txId)).toBe(true);
      expect(tracker.markAggregateSettlementAttemptSubmitted(reservation, txId)).toBe(false);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        submittedTxId: txId,
        lifecycleVersion: 2,
        transportReservationDigest: reservation.reservationDigest,
      });
    });
  });

  it('rejects a stale burn invalidation admission after journal reactivation', () => {
    withTrackerDb((tracker) => {
      const txId = '55'.repeat(32);
      const burnTxHash = 'dd'.repeat(32);
      tracker.insertPegOut(burnTxHash, `02${'53'.repeat(32)}`, 1_000_000n, 203);
      const stale = tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);
      expect(tracker.markAggregateSettlementAttemptAbandoned(txId)).toBe(true);
      const current = tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId);

      expect(current.lifecycleVersion).toBeGreaterThan(stale.lifecycleVersion);
      expect(() => tracker.invalidatePendingAggregateSettlementAfterBurnObservation(
        stale,
        [burnTxHash],
        'stale lifecycle observation',
      )).toThrow(/changed before burn invalidation/);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'pending',
        lifecycleVersion: current.lifecycleVersion,
      });
    });
  });

  it('rolls back burn and candidate mutations when final journal invalidation fails', () => {
    withTrackerDbPath((dbPath) => {
      const tracker = new StateTracker(dbPath);
      const candidate = authenticatedCandidate();
      const txId = '56'.repeat(32);
      try {
        insertCandidatePegOut(tracker, candidate);
        tracker.recordAuthenticatedSettlementCandidate(candidate);
        tracker.markAuthenticatedSettlementCandidateCheckPassed(
          authenticatedCheckAdmission(candidate.candidateId),
        );
        const admission = tracker.recordAggregateSettlementAttempt(
          'single',
          [candidate.burnTxHash],
          txId,
        );
        const db = new Database(dbPath);
        try {
          db.exec(`
            CREATE TRIGGER reject_aggregate_invalidation
            BEFORE UPDATE OF status ON aggregate_settlement_attempts
            WHEN NEW.status = 'abandoned'
            BEGIN
              SELECT RAISE(ABORT, 'forced journal invalidation failure');
            END;
          `);
        } finally {
          db.close();
        }

        expect(() => tracker.invalidatePendingAggregateSettlementAfterBurnObservation(
          admission,
          [{ burnId: candidate.burnId }],
          'burn reverted after signing',
        )).toThrow(/forced journal invalidation failure/);
        expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({ status: 'pending' });
        expect(tracker.getPegOutByTxHash(candidate.burnTxHash)).not.toMatchObject({
          status: 'burn_reverted',
        });
        expect(tracker.getAuthenticatedSettlementCandidate(candidate.candidateId)).toMatchObject({
          status: 'check_passed',
          invalidationReason: null,
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('rejects abandonment with only a valid-looking subset of the journaled batch', () => {
    withTrackerDb((tracker) => {
      const txId = '4d'.repeat(32);
      const burns = ['b8'.repeat(32), 'b9'.repeat(32), 'ba'.repeat(32)];
      for (const [index, burn] of burns.entries()) {
        tracker.insertPegOut(burn, `02${String(index + 1).padStart(2, '0').repeat(32)}`, 1_000_000n, 200 + index);
        tracker.updatePegOutStatus(burn, 'batch_submitted', {
          phase1BoxId: txId,
          pendingAvlKey: burn,
        });
      }
      tracker.recordAggregateSettlementAttempt('batch', burns, txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      const attempt = tracker.getAggregateSettlementAttempt(txId)!;
      const absence = stableAbsentObservation(txId);

      expect(() => tracker.abandonSubmittedAggregateSettlementAttempt(
        txId,
        attempt.lifecycleVersion,
        'batch_submitted',
        burns.slice(0, 2),
        absence,
        matchingObservationConsensus(absence),
      )).toThrow(/journal identity mismatch/);

      for (const burn of burns) {
        expect(tracker.getPegOutByTxHash(burn)).toMatchObject({ status: 'batch_submitted' });
      }
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        lifecycleVersion: attempt.lifecycleVersion,
      });
    });
  });

  it('rejects legacy aggregate journaling when a transaction has multiple persisted burn events', () => {
    withTrackerDb((tracker) => {
      const txId = '4d'.repeat(32);
      const burnTxHash = 'c4'.repeat(32);
      tracker.insertPegOut(
        burnTxHash,
        `02${'11'.repeat(32)}`,
        1_000_000n,
        200,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: 'c5'.repeat(32),
          sidechainLogIndex: 2,
        },
      );
      tracker.insertPegOut(
        burnTxHash,
        `02${'22'.repeat(32)}`,
        2_000_000n,
        200,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: 'c5'.repeat(32),
          sidechainLogIndex: 6,
        },
      );

      expect(() => tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId))
        .toThrow(/exactly one persisted burn event.*found 2/i);
      expect(tracker.getAggregateSettlementAttempt(txId)).toBeNull();
    });
  });

  it('requires persisted, unique transaction hashes before creating a legacy aggregate journal', () => {
    withTrackerDb((tracker) => {
      const txId = '4e'.repeat(32);
      const burnTxHash = 'c6'.repeat(32);

      expect(() => tracker.recordAggregateSettlementAttempt('single', [burnTxHash], txId))
        .toThrow(/exactly one persisted burn event.*found 0/i);

      tracker.insertPegOut(burnTxHash, `02${'33'.repeat(32)}`, 1_000_000n, 200);
      expect(() => tracker.recordAggregateSettlementAttempt(
        'batch',
        [burnTxHash, burnTxHash],
        txId,
      )).toThrow(/unique transaction hashes/i);
      expect(tracker.getAggregateSettlementAttempt(txId)).toBeNull();
    });
  });

  it('rejects a second active legacy aggregate journal that overlaps a burn', () => {
    withTrackerDb((tracker) => {
      const firstTxId = '4f'.repeat(32);
      const secondTxId = '50'.repeat(32);
      const burnA = 'c7'.repeat(32);
      const burnB = 'c8'.repeat(32);
      const burnC = 'c9'.repeat(32);
      tracker.insertPegOut(burnA, `02${'41'.repeat(32)}`, 1_000_000n, 200);
      tracker.insertPegOut(burnB, `02${'42'.repeat(32)}`, 2_000_000n, 201);
      tracker.insertPegOut(burnC, `02${'43'.repeat(32)}`, 3_000_000n, 202);
      tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], firstTxId);
      expect(markPendingAggregateSettlementSubmitted(tracker, firstTxId)).toBe(true);

      expect(() => tracker.recordAggregateSettlementAttempt(
        'batch',
        [burnB, burnC],
        secondTxId,
      )).toThrow(/active legacy aggregate journal.*already claims burn/i);
      expect(tracker.getAggregateSettlementAttempt(secondTxId)).toBeNull();
    });
  });

  it('rejects abandoned journal reactivation when another active journal claimed the burn', () => {
    withTrackerDb((tracker) => {
      const abandonedTxId = '51'.repeat(32);
      const activeTxId = '52'.repeat(32);
      const burnTxHash = 'ca'.repeat(32);
      tracker.insertPegOut(burnTxHash, `02${'44'.repeat(32)}`, 1_000_000n, 200);
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], abandonedTxId);
      expect(tracker.markAggregateSettlementAttemptAbandoned(abandonedTxId)).toBe(true);
      tracker.recordAggregateSettlementAttempt('single', [burnTxHash], activeTxId);

      expect(() => tracker.recordAggregateSettlementAttempt(
        'single',
        [burnTxHash],
        abandonedTxId,
      )).toThrow(/active legacy aggregate journal.*already claims burn/i);
      expect(tracker.getAggregateSettlementAttempt(abandonedTxId)).toMatchObject({
        status: 'abandoned',
      });
    });
  });

  it('confirms submitted batch settlements atomically against the exact journal order', () => {
    withTrackerDb((tracker) => {
      const txId = '48'.repeat(32);
      const burnA = 'a2'.repeat(32);
      const burnB = 'b3'.repeat(32);

      tracker.insertPegOut(burnA, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.insertPegOut(burnB, '02' + '22'.repeat(32), 2_000_000n, 201);
      tracker.updatePegOutStatus(burnA, 'batch_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnA,
      });
      tracker.updatePegOutStatus(burnB, 'batch_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnB,
      });
      tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      const observation = stableFinalObservation(txId);
      expect(tracker.confirmSubmittedBatchSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        [burnA, burnB],
        observation,
        spvTrackerSuccessorDigest(),
      )).toBe(true);

      expect(tracker.getPegOutByTxHash(burnA)).toMatchObject({
        status: 'phase2_unlocked',
        phase2_unlock_tx_id: txId,
      });
      expect(tracker.getPegOutByTxHash(burnB)).toMatchObject({
        status: 'phase2_unlocked',
        phase2_unlock_tx_id: txId,
      });
      expect(tracker.getAllAvlKeys()).toEqual([burnA, burnB]);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({ status: 'confirmed' });

      expect(tracker.confirmSubmittedBatchSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        [burnA, burnB],
        observation,
        spvTrackerSuccessorDigest(),
      )).toBe(true);
      expect(tracker.getAllAvlKeys()).toEqual([burnA, burnB]);
    });
  });

  it('rejects subset, reordered, or partial-status batch confirmation without mutation', () => {
    withTrackerDb((tracker) => {
      const txId = '49'.repeat(32);
      const burnA = 'a3'.repeat(32);
      const burnB = 'b4'.repeat(32);

      tracker.insertPegOut(burnA, '02' + '11'.repeat(32), 1_000_000n, 200);
      tracker.insertPegOut(burnB, '02' + '22'.repeat(32), 2_000_000n, 201);
      tracker.updatePegOutStatus(burnA, 'batch_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burnA,
      });
      tracker.updatePegOutStatus(burnB, 'phase1_created', {
        phase1BoxId: txId,
        pendingAvlKey: burnB,
      });
      tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      const observation = stableFinalObservation(txId);
      const lifecycleVersion = tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion;
      expect(() => tracker.confirmSubmittedBatchSettlementAttempt(
        txId,
        lifecycleVersion,
        [burnA],
        observation,
        spvTrackerSuccessorDigest(),
      )).toThrow(/requires at least 2/);
      expect(tracker.confirmSubmittedBatchSettlementAttempt(
        txId,
        lifecycleVersion,
        [burnB, burnA],
        observation,
        spvTrackerSuccessorDigest(),
      )).toBe(false);
      expect(tracker.confirmSubmittedBatchSettlementAttempt(
        txId,
        lifecycleVersion,
        [burnA, burnB],
        observation,
        spvTrackerSuccessorDigest(),
      )).toBe(false);

      expect(tracker.getPegOutByTxHash(burnA)).toMatchObject({ status: 'batch_submitted' });
      expect(tracker.getPegOutByTxHash(burnB)).toMatchObject({ status: 'phase1_created' });
      expect(tracker.getAllAvlKeys()).toEqual([]);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({ status: 'submitted' });
    });
  });

  it('rolls back every batch mutation when tracker metadata conflicts', () => {
    withTrackerDb((tracker) => {
      const txId = '4c'.repeat(32);
      const burnA = 'a4'.repeat(32);
      const burnB = 'b5'.repeat(32);
      const trackerEntry = {
        keyHex: 'e1'.repeat(32),
        valueHex: 'e2'.repeat(36),
        sidechainHeight: 1237n,
        sidechainHeaderHash: 'e3'.repeat(32),
        bridgeEventRoot: 'e4'.repeat(32),
        ergoAnchorHeight: 330_003,
      };
      tracker.insertSpvTrackerEntry({
        ...trackerEntry,
        bridgeEventRoot: 'f4'.repeat(32),
      });
      for (const [burn, recipient] of [[burnA, '17'], [burnB, '18']] as const) {
        tracker.insertPegOut(burn, `02${recipient.repeat(32)}`, 1_000_000n, 200);
        tracker.updatePegOutStatus(burn, 'batch_submitted', {
          phase1BoxId: txId,
          pendingAvlKey: burn,
        });
      }
      tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      expect(() => tracker.confirmSubmittedBatchSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        [burnA, burnB],
        stableFinalObservation(txId),
        spvTrackerSuccessorDigest([trackerEntry]),
        trackerEntry,
      )).toThrow(/conflicts with persisted history/);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        ergoObservation: null,
      });
      expect(tracker.getPegOutByTxHash(burnA)).toMatchObject({ status: 'batch_submitted' });
      expect(tracker.getPegOutByTxHash(burnB)).toMatchObject({ status: 'batch_submitted' });
      expect(tracker.getAllAvlKeys()).toEqual([]);
      expect(tracker.getSpvTrackerHistory()).toEqual([{
        key: trackerEntry.keyHex,
        value: trackerEntry.valueHex,
      }]);
    });
  });

  it('rejects batch confirmation against a stale lifecycle version', () => {
    withTrackerDb((tracker) => {
      const txId = '4d'.repeat(32);
      const burnA = 'a5'.repeat(32);
      const burnB = 'b6'.repeat(32);
      for (const [burn, recipient] of [[burnA, '19'], [burnB, '1a']] as const) {
        tracker.insertPegOut(burn, `02${recipient.repeat(32)}`, 1_000_000n, 200);
        tracker.updatePegOutStatus(burn, 'batch_submitted', {
          phase1BoxId: txId,
          pendingAvlKey: burn,
        });
      }
      tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      const current = tracker.getAggregateSettlementAttempt(txId)!;

      expect(tracker.confirmSubmittedBatchSettlementAttempt(
        txId,
        current.lifecycleVersion - 1,
        [burnA, burnB],
        stableFinalObservation(txId),
        spvTrackerSuccessorDigest(),
      )).toBe(false);
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        lifecycleVersion: current.lifecycleVersion,
        ergoObservation: null,
      });
      expect(tracker.getPegOutByTxHash(burnA)).toMatchObject({ status: 'batch_submitted' });
      expect(tracker.getPegOutByTxHash(burnB)).toMatchObject({ status: 'batch_submitted' });
      expect(tracker.getAllAvlKeys()).toEqual([]);
    });
  });

  it('atomically restores and rolls back every burn around a pre-finality Ergo observation', () => {
    withTrackerDb((tracker) => {
      const txId = '53'.repeat(32);
      const burnA = 'd1'.repeat(32);
      const burnB = 'd2'.repeat(32);
      for (const [burn, recipient] of [[burnA, '11'], [burnB, '22']] as const) {
        tracker.insertPegOut(burn, `02${recipient.repeat(32)}`, 1_000_000n, 200);
      }
      tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], txId);
      const pending = tracker.getAggregateSettlementAttempt(txId)!;
      const preFinal = stablePreFinalObservation(txId);

      expect(tracker.applyAggregateSettlementRecoveryObservation({
        expectedTxId: txId,
        expectedLifecycleVersion: pending.lifecycleVersion,
        expectedStatus: 'pending',
        expectedSubmittedTxId: null,
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        observation: preFinal,
        consensus: null,
      })).toMatchObject({
        applied: true,
        restoredBurns: 2,
        rolledBackPreFinality: false,
      });
      expect(tracker.getPegOutByTxHash(burnA)).toMatchObject({ status: 'batch_submitted' });
      expect(tracker.getPegOutByTxHash(burnB)).toMatchObject({ status: 'batch_submitted' });
      const submitted = tracker.getAggregateSettlementAttempt(txId)!;
      expect(submitted).toMatchObject({
        status: 'submitted',
        submittedTxId: txId,
        lifecycleVersion: pending.lifecycleVersion + 1,
        ergoObservation: { status: 'confirmed_pre_finality', confirmations: 9 },
        ergoObservationSourceCount: 1,
      });

      const absence = stableAbsentObservation(txId);
      expect(tracker.applyAggregateSettlementRecoveryObservation({
        expectedTxId: txId,
        expectedLifecycleVersion: submitted.lifecycleVersion,
        expectedStatus: 'submitted',
        expectedSubmittedTxId: txId,
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        observation: absence,
        consensus: matchingObservationConsensus(absence),
      })).toMatchObject({
        applied: true,
        rolledBackBurns: 2,
        rolledBackPreFinality: true,
      });
      expect(tracker.getPegOutByTxHash(burnA)).toMatchObject({ status: 'detected' });
      expect(tracker.getPegOutByTxHash(burnB)).toMatchObject({ status: 'detected' });
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'pending',
        submittedTxId: null,
        ergoObservation: { status: 'absent' },
        ergoObservationSourceCount: 2,
        ergoObservationConsensusDigest: 'f3'.repeat(32),
      });
    });
  });

  it('rejects stale recovery lifecycle authority without mutating the journal or burns', () => {
    withTrackerDb((tracker) => {
      const txId = '54'.repeat(32);
      const burn = 'd3'.repeat(32);
      tracker.insertPegOut(burn, `02${'33'.repeat(32)}`, 1_000_000n, 200);
      tracker.recordAggregateSettlementAttempt('single', [burn], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);
      const attempt = tracker.getAggregateSettlementAttempt(txId)!;

      expect(tracker.applyAggregateSettlementRecoveryObservation({
        expectedTxId: txId,
        expectedLifecycleVersion: attempt.lifecycleVersion - 1,
        expectedStatus: 'submitted',
        expectedSubmittedTxId: txId,
        mode: 'single',
        burnTxHashes: [burn],
        observation: stablePreFinalObservation(txId),
        consensus: null,
      })).toMatchObject({ applied: false, restoredBurns: 0 });
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        lifecycleVersion: attempt.lifecycleVersion,
        ergoObservation: null,
      });
      expect(tracker.getPegOutByTxHash(burn)).toMatchObject({ status: 'detected' });
    });
  });

  it('rolls back journal and prior burn updates when a later recovery write fails', () => {
    withTrackerDbPath((dbPath) => {
      const tracker = new StateTracker(dbPath);
      const txId = '55'.repeat(32);
      const burnA = 'd4'.repeat(32);
      const burnB = 'd5'.repeat(32);
      try {
        tracker.insertPegOut(burnA, `02${'44'.repeat(32)}`, 1_000_000n, 200);
        tracker.insertPegOut(burnB, `02${'55'.repeat(32)}`, 1_000_000n, 201);
        tracker.recordAggregateSettlementAttempt('batch', [burnA, burnB], txId);
        const attempt = tracker.getAggregateSettlementAttempt(txId)!;
        const raw = new Database(dbPath);
        try {
          raw.exec(`
            CREATE TRIGGER fail_second_recovery_burn
            BEFORE UPDATE ON peg_out_events
            WHEN OLD.sidechain_burn_tx_hash = '${burnB}' AND NEW.status = 'batch_submitted'
            BEGIN
              SELECT RAISE(ABORT, 'forced recovery failure');
            END;
          `);
        } finally {
          raw.close();
        }

        expect(() => tracker.applyAggregateSettlementRecoveryObservation({
          expectedTxId: txId,
          expectedLifecycleVersion: attempt.lifecycleVersion,
          expectedStatus: 'pending',
          expectedSubmittedTxId: null,
          mode: 'batch',
          burnTxHashes: [burnA, burnB],
          observation: stablePreFinalObservation(txId),
          consensus: null,
        })).toThrow(/forced recovery failure/);
        expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
          status: 'pending',
          lifecycleVersion: attempt.lifecycleVersion,
          ergoObservation: null,
        });
        expect(tracker.getPegOutByTxHash(burnA)).toMatchObject({ status: 'detected' });
        expect(tracker.getPegOutByTxHash(burnB)).toMatchObject({ status: 'detected' });
      } finally {
        tracker.close();
      }
    });
  });

  it('rolls back DUP insertion when single confirmation cannot persist tracker state', () => {
    withTrackerDb((tracker) => {
      const txId = '56'.repeat(32);
      const burn = 'd6'.repeat(32);
      tracker.insertPegOut(burn, `02${'66'.repeat(32)}`, 1_000_000n, 200);
      tracker.updatePegOutStatus(burn, 'aggregate_submitted', {
        phase1BoxId: txId,
        pendingAvlKey: burn,
      });
      tracker.recordAggregateSettlementAttempt('single-with-ingest', [burn], txId);
      markPendingAggregateSettlementSubmitted(tracker, txId);

      expect(() => tracker.confirmSubmittedSingleSettlementAttempt(
        txId,
        tracker.getAggregateSettlementAttempt(txId)!.lifecycleVersion,
        'single-with-ingest',
        burn,
        stableFinalObservation(txId),
        spvTrackerSuccessorDigest(),
        {
          keyHex: 'a1'.repeat(32),
          valueHex: '00',
          sidechainHeight: null as any,
          sidechainHeaderHash: 'a2'.repeat(32),
          bridgeEventRoot: 'a3'.repeat(32),
          ergoAnchorHeight: 1,
        },
      )).toThrow();
      expect(tracker.getAllAvlKeys()).toEqual([]);
      expect(tracker.getPegOutByTxHash(burn)).toMatchObject({ status: 'aggregate_submitted' });
      expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
        status: 'submitted',
        ergoObservation: null,
      });
    });
  });

  it('migrates historical aggregate attempts as legacy-unbound without inventing authority', () => {
    withTrackerDbPath((dbPath) => {
      const txId = '57'.repeat(32);
      const burn = 'd7'.repeat(32);
      const seed = new Database(dbPath);
      try {
        seed.exec(`
          CREATE TABLE aggregate_settlement_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,
            expected_tx_id TEXT UNIQUE NOT NULL,
            submitted_tx_id TEXT,
            burn_tx_hashes_json TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          );
          INSERT INTO aggregate_settlement_attempts (
            mode, expected_tx_id, submitted_tx_id, burn_tx_hashes_json, status
          ) VALUES ('single', '${txId}', '${txId}', '["${burn}"]', 'submitted');
        `);
      } finally {
        seed.close();
      }
      const tracker = new StateTracker(dbPath);
      try {
        expect(tracker.getAggregateSettlementAttempt(txId)).toMatchObject({
          status: 'submitted',
          lifecycleVersion: 0,
          recoveryBindingStatus: 'legacy_unbound',
          recoveryPolicyVersion: null,
          recoveryRequiredConfirmations: null,
          ergoObservation: null,
          ergoObservationSourceCount: 0,
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('tracks pending DUP heartbeats separately from committed AVL history', () => {
    withTrackerDb((tracker) => {
      const txId = 'aa'.repeat(32);
      const keyHex = '00'.repeat(28) + '00000001';

      tracker.recordPendingDupHeartbeat(txId, keyHex);

      expect(tracker.hasAvlKey(keyHex)).toBe(false);
      expect(tracker.getPendingDupHeartbeats()).toEqual([{ txId, keyHex }]);

      tracker.insertAvlKey(keyHex);
      tracker.clearPendingDupHeartbeat(txId);

      expect(tracker.hasAvlKey(keyHex)).toBe(true);
      expect(tracker.getPendingDupHeartbeats()).toEqual([]);
    });
  });

  it('journals an exact SCS operational attempt before submission finalization', () => {
    withTrackerDb((tracker) => {
      const expectedTxId = '71'.repeat(32);
      const sourceBoxId = '72'.repeat(32);
      const feeBoxId = '73'.repeat(32);
      const reserved = tracker.reserveErgoOperationalTransactionAttempt({
        operationProfile: SCS_ORACLE_UPDATE_OPERATION_PROFILE,
        expectedTxId,
        sourceBoxId,
        inputBoxIds: [sourceBoxId, feeBoxId],
        attemptedAtHeight: 1_000,
        targetSidechainHeight: 2_000,
        targetSidechainBlockHashHex: '70'.repeat(32),
        heartbeatKeyHex: null,
        bindingDigestHex: '74'.repeat(32),
        signedTransactionDigestHex: '75'.repeat(32),
        checkResponseDigestHex: '76'.repeat(32),
        revalidationDigestHex: '77'.repeat(32),
        authorizationDigestHex: '78'.repeat(32),
      });

      expect(reserved).toMatchObject({
        status: 'pending',
        expectedTxId,
        sourceBoxId,
        inputBoxIds: [sourceBoxId, feeBoxId],
        targetSidechainHeight: 2_000,
        targetSidechainBlockHashHex: '70'.repeat(32),
        submissionDisposition: null,
      });
      expect(tracker.getActiveErgoOperationalTransactionAttempts(
        SCS_ORACLE_UPDATE_OPERATION_PROFILE,
      )).toHaveLength(1);

      const finalized = tracker.finalizeErgoOperationalTransactionAttempt({
        expectedTxId,
        durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        disposition: 'accepted',
        submittedTxId: expectedTxId,
        responseDigestHex: '79'.repeat(32),
      });
      expect(finalized.attempt).toMatchObject({
        status: 'accepted',
        submittedTxId: expectedTxId,
        submissionDisposition: 'accepted',
      });
      expect(finalized.journalDigestHex).toMatch(/^[0-9a-f]{64}$/);

      const confirmed = tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 1_002,
        confirmationHeaderId: '7a'.repeat(32),
      });
      expect(confirmed).toMatchObject({
        status: 'confirmed',
        confirmationHeight: 1_002,
        confirmationHeaderId: '7a'.repeat(32),
      });
      expect(tracker.getActiveErgoOperationalTransactionAttempts(
        SCS_ORACLE_UPDATE_OPERATION_PROFILE,
      )).toEqual([]);
      expect(tracker.getConfirmedErgoOperationalTransactionAttempts(
        SCS_ORACLE_UPDATE_OPERATION_PROFILE,
      )).toEqual([confirmed]);
    });
  });

  it('confirms a pending operational attempt after a crash before submission finalization', () => {
    withTrackerDb((tracker) => {
      const expectedTxId = '7b'.repeat(32);
      const sourceBoxId = '7c'.repeat(32);
      tracker.reserveErgoOperationalTransactionAttempt({
        operationProfile: SCS_ORACLE_UPDATE_OPERATION_PROFILE,
        expectedTxId,
        sourceBoxId,
        inputBoxIds: [sourceBoxId, '7d'.repeat(32)],
        attemptedAtHeight: 1_100,
        targetSidechainHeight: 2_100,
        targetSidechainBlockHashHex: '7a'.repeat(32),
        heartbeatKeyHex: null,
        bindingDigestHex: '7e'.repeat(32),
        signedTransactionDigestHex: '7f'.repeat(32),
        checkResponseDigestHex: '80'.repeat(32),
        revalidationDigestHex: '81'.repeat(32),
        authorizationDigestHex: '82'.repeat(32),
      });

      const confirmed = tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 1_102,
        confirmationHeaderId: '83'.repeat(32),
      });

      expect(confirmed).toMatchObject({
        status: 'confirmed',
        submissionDisposition: null,
        submittedTxId: null,
        confirmationHeight: 1_102,
        confirmationHeaderId: '83'.repeat(32),
      });
      expect(tracker.getActiveErgoOperationalTransactionAttempts(
        SCS_ORACLE_UPDATE_OPERATION_PROFILE,
      )).toEqual([]);
    });
  });

  it('retains an ambiguous DUP attempt and releases it only after explicit abandonment', () => {
    withTrackerDb((tracker) => {
      const firstTxId = '81'.repeat(32);
      const sourceBoxId = '82'.repeat(32);
      const first = tracker.reserveErgoOperationalTransactionAttempt({
        operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
        expectedTxId: firstTxId,
        sourceBoxId,
        inputBoxIds: [sourceBoxId, '83'.repeat(32)],
        attemptedAtHeight: 3_000,
        targetSidechainHeight: null,
        targetSidechainBlockHashHex: null,
        heartbeatKeyHex: '84'.repeat(32),
        bindingDigestHex: '85'.repeat(32),
        signedTransactionDigestHex: '86'.repeat(32),
        checkResponseDigestHex: '87'.repeat(32),
        revalidationDigestHex: '88'.repeat(32),
        authorizationDigestHex: '89'.repeat(32),
      });
      tracker.finalizeErgoOperationalTransactionAttempt({
        expectedTxId: firstTxId,
        durableAttemptDigestHex: first.durableAttemptDigestHex,
        disposition: 'ambiguous',
        submittedTxId: null,
        responseDigestHex: null,
      });

      expect(() => tracker.reserveErgoOperationalTransactionAttempt({
        operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
        expectedTxId: '8a'.repeat(32),
        sourceBoxId: '8b'.repeat(32),
        inputBoxIds: ['8b'.repeat(32), '8c'.repeat(32)],
        attemptedAtHeight: 3_001,
        targetSidechainHeight: null,
        targetSidechainBlockHashHex: null,
        heartbeatKeyHex: '8d'.repeat(32),
        bindingDigestHex: '8e'.repeat(32),
        signedTransactionDigestHex: '8f'.repeat(32),
        checkResponseDigestHex: '90'.repeat(32),
        revalidationDigestHex: '91'.repeat(32),
        authorizationDigestHex: '92'.repeat(32),
      })).toThrow();

      const abandoned = tracker.abandonErgoOperationalTransactionAttempt(
        firstTxId,
        'exact transaction absent and source singleton is unspent',
      );
      expect(abandoned).toMatchObject({
        status: 'abandoned',
        abandonmentReason: 'exact transaction absent and source singleton is unspent',
      });

      const replacement = tracker.reserveErgoOperationalTransactionAttempt({
        operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
        expectedTxId: '8a'.repeat(32),
        sourceBoxId: '8b'.repeat(32),
        inputBoxIds: ['8b'.repeat(32), '8c'.repeat(32)],
        attemptedAtHeight: 3_001,
        targetSidechainHeight: null,
        targetSidechainBlockHashHex: null,
        heartbeatKeyHex: '8d'.repeat(32),
        bindingDigestHex: '8e'.repeat(32),
        signedTransactionDigestHex: '8f'.repeat(32),
        checkResponseDigestHex: '90'.repeat(32),
        revalidationDigestHex: '91'.repeat(32),
        authorizationDigestHex: '92'.repeat(32),
      });
      expect(replacement.status).toBe('pending');
    });
  });

  it('persists operational attempts across database restart without restoring submission authority', () => {
    withTrackerDbPath((dbPath) => {
      const expectedTxId = 'a1'.repeat(32);
      const sourceBoxId = 'a2'.repeat(32);
      const writable = new StateTracker(dbPath);
      const reserved = writable.reserveErgoOperationalTransactionAttempt({
        operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
        expectedTxId,
        sourceBoxId,
        inputBoxIds: [sourceBoxId, 'a3'.repeat(32)],
        attemptedAtHeight: 4_000,
        targetSidechainHeight: null,
        targetSidechainBlockHashHex: null,
        heartbeatKeyHex: 'a4'.repeat(32),
        bindingDigestHex: 'a5'.repeat(32),
        signedTransactionDigestHex: 'a6'.repeat(32),
        checkResponseDigestHex: 'a7'.repeat(32),
        revalidationDigestHex: 'a8'.repeat(32),
        authorizationDigestHex: 'a9'.repeat(32),
      });
      writable.finalizeErgoOperationalTransactionAttempt({
        expectedTxId,
        durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        disposition: 'ambiguous',
        submittedTxId: null,
        responseDigestHex: null,
      });
      writable.close();

      const restored = new StateTracker(dbPath);
      try {
        expect(restored.getActiveErgoOperationalTransactionAttempts(
          DUP_HEARTBEAT_OPERATION_PROFILE,
        )).toEqual([
          expect.objectContaining({
            expectedTxId,
            sourceBoxId,
            status: 'ambiguous',
            heartbeatKeyHex: 'a4'.repeat(32),
          }),
        ]);
      } finally {
        restored.close();
      }
    });
  });

  it('returns same-height peg-outs in deterministic insertion order', () => {
    withTrackerDb((tracker) => {
      const sameHeight = 5000;
      const txA = 'a1'.repeat(32);
      const txB = 'b2'.repeat(32);
      const txC = 'c3'.repeat(32);

      // Insert in A, B, C order -- all at the same sidechain_burn_height
      tracker.insertPegOut(txA, '02' + '11'.repeat(32), 100_000n, sameHeight);
      tracker.insertPegOut(txB, '02' + '22'.repeat(32), 200_000n, sameHeight);
      tracker.insertPegOut(txC, '02' + '33'.repeat(32), 300_000n, sameHeight);

      const pending = tracker.getPendingPegOuts() as any[];
      expect(pending).toHaveLength(3);
      expect(pending.map((r: any) => r.sidechain_burn_tx_hash)).toEqual([txA, txB, txC]);
    });
  });

  it('repairs detected peg-out metadata without changing non-detected rows', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'd4'.repeat(32);
      tracker.insertPegOut(burnTxHash, '02' + '11'.repeat(32), 50_000_000n, 192);
      tracker.setPersistedAnchorHeight(burnTxHash, 48000);

      expect(tracker.repairDetectedPegOut(
        burnTxHash,
        '02' + '22'.repeat(32),
        45_000_000n,
        42,
      )).toBe(true);

      const repaired = tracker.getPegOutByTxHash(burnTxHash) as any;
      expect(repaired.ergo_recipient_address).toBe('02' + '22'.repeat(32));
      expect(BigInt(repaired.amount_nanoerg)).toBe(45_000_000n);
      expect(repaired.sidechain_burn_height).toBe(42);
      expect(repaired.ergo_anchor_height).toBeNull();

      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: 'aa'.repeat(32),
      });
      expect(tracker.repairDetectedPegOut(
        burnTxHash,
        '02' + '33'.repeat(32),
        1n,
        1,
      )).toBe(false);

      const protectedRow = tracker.getPegOutByTxHash(burnTxHash) as any;
      expect(protectedRow.status).toBe('aggregate_submitted');
      expect(protectedRow.ergo_recipient_address).toBe('02' + '22'.repeat(32));
      expect(BigInt(protectedRow.amount_nanoerg)).toBe(45_000_000n);
      expect(protectedRow.sidechain_burn_height).toBe(42);
    });
  });

  it('persists canonical sidechain burn coordinates for receipt verification', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'e5'.repeat(32);
      const sidechainBlockHash = 'f6'.repeat(32);

      tracker.insertPegOut(
        burnTxHash,
        '02' + '11'.repeat(32),
        50_000_000n,
        192,
        {
          user: '0x' + '22'.repeat(20),
          sidechainBlockHash,
          sidechainLogIndex: 7,
        },
      );

      const row = tracker.getPegOutByTxHash(burnTxHash) as any;
      expect(row.user).toBe('0x' + '22'.repeat(20));
      expect(row.sidechain_block_hash).toBe(sidechainBlockHash);
      expect(row.sidechain_log_index).toBe(7);
    });
  });

  it('repairs canonical sidechain burn coordinates only while a peg-out is detected', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'f7'.repeat(32);
      tracker.insertPegOut(burnTxHash, '02' + '11'.repeat(32), 50_000_000n, 192, {
        user: '0x' + '22'.repeat(20),
        sidechainBlockHash: '33'.repeat(32),
      });

      expect(tracker.repairDetectedPegOut(
        burnTxHash,
        '02' + '44'.repeat(32),
        45_000_000n,
        42,
        {
          user: '0x' + '55'.repeat(20),
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: '66'.repeat(32),
          sidechainLogIndex: 8,
        },
      )).toBe(true);

      const repaired = tracker.getPegOutByTxHash(burnTxHash) as any;
      expect(repaired.user).toBe('0x' + '55'.repeat(20));
      expect(repaired.sidechain_block_hash).toBe('66'.repeat(32));
      expect(repaired.sidechain_log_index).toBe(8);
      expect(repaired.burn_id).toBe(deriveTrustlessBurnIdHex({
        sidechainIdHex: authenticatedSidechainId,
        sidechainTxHashHex: burnTxHash,
        eventIndex: 8,
      }));

      tracker.updatePegOutStatus(burnTxHash, 'aggregate_submitted', {
        phase1BoxId: 'aa'.repeat(32),
      });

      expect(tracker.repairDetectedPegOut(
        burnTxHash,
        '02' + '77'.repeat(32),
        1n,
        1,
        {
          user: '0x' + '88'.repeat(20),
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: '99'.repeat(32),
          sidechainLogIndex: 8,
        },
      )).toBe(false);

      const protectedRow = tracker.getPegOutByTxHash(burnTxHash) as any;
      expect(protectedRow.user).toBe('0x' + '55'.repeat(20));
      expect(protectedRow.sidechain_block_hash).toBe('66'.repeat(32));
      expect(protectedRow.sidechain_log_index).toBe(8);
    });
  });

  it('restores SQLite backup with DUP and SPV histories still reconstructible', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-state-restore-test-'));
    const sourcePath = join(dir, 'source.sqlite');
    const restoredPath = join(dir, 'restored.sqlite');
    const burnTxHash = '11'.repeat(32);
    const dupKeys = ['a1'.repeat(32), 'b2'.repeat(32)];
    const spvEntry: SpvTrackerHistoryEntry = {
      keyHex: 'c3'.repeat(32),
      valueHex: 'd4'.repeat(36),
      sidechainHeight: 9876n,
      sidechainHeaderHash: 'e5'.repeat(32),
      bridgeEventRoot: 'f6'.repeat(32),
      ergoAnchorHeight: 54321,
    };
    let expectedDupDigest = '';
    let expectedSpvDigest = '';

    try {
      const source = new StateTracker(sourcePath);
      source.insertPegOut(burnTxHash, '02' + '33'.repeat(32), 123_000_000n, 77, {
        user: '0x' + '77'.repeat(20),
        sidechainBlockHash: '88'.repeat(32),
        sidechainLogIndex: 4,
      });
      source.setPersistedAnchorHeight(burnTxHash, spvEntry.ergoAnchorHeight);
      source.updatePegOutStatus(burnTxHash, 'batch_submitted', {
        phase1BoxId: '44'.repeat(32),
        pendingAvlKey: burnTxHash,
      });
      for (const key of dupKeys) source.insertAvlKey(key);
      source.insertSpvTrackerEntry(spvEntry);
      source.recordPendingDupHeartbeat('55'.repeat(32), '66'.repeat(32));

      expectedDupDigest = getDupTreeDigest(source.getAllAvlKeys());
      expectedSpvDigest = getSpvTrackerDigest(source.getSpvTrackerHistory());
      source.close();

      copyFileSync(sourcePath, restoredPath);

      const restored = new StateTracker(restoredPath);
      try {
        const pegOut = restored.getPegOutByTxHash(burnTxHash) as any;

        expect(pegOut.status).toBe('batch_submitted');
        expect(pegOut.phase1_box_id).toBe('44'.repeat(32));
        expect(pegOut.pending_avl_key).toBe(burnTxHash);
        expect(pegOut.user).toBe('0x' + '77'.repeat(20));
        expect(pegOut.sidechain_block_hash).toBe('88'.repeat(32));
        expect(pegOut.sidechain_log_index).toBe(4);
        expect(restored.getPersistedAnchorHeight(burnTxHash)).toBe(spvEntry.ergoAnchorHeight);
        expect(restored.getAllAvlKeys()).toEqual(dupKeys);
        expect(getDupTreeDigest(restored.getAllAvlKeys())).toBe(expectedDupDigest);
        expect(restored.getSpvTrackerHistory()).toEqual([
          { key: spvEntry.keyHex, value: spvEntry.valueHex },
        ]);
        expect(getSpvTrackerDigest(restored.getSpvTrackerHistory())).toBe(expectedSpvDigest);
        expect(restored.getPendingDupHeartbeats()).toEqual([
          { txId: '55'.repeat(32), keyHex: '66'.repeat(32) },
        ]);
      } finally {
        restored.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('StateTracker read-only mode', () => {
  it('opens an existing database read-only and supports evidence reads', () => {
    withTrackerDbPath((dbPath) => {
      const burnTxHash = 'aa'.repeat(32);
      const dupKey = 'bb'.repeat(32);
      const spvEntry: SpvTrackerHistoryEntry = {
        keyHex: 'cc'.repeat(32),
        valueHex: 'dd'.repeat(36),
        sidechainHeight: 4321n,
        sidechainHeaderHash: 'ee'.repeat(32),
        bridgeEventRoot: 'ff'.repeat(32),
        ergoAnchorHeight: 654321,
      };

      const writable = new StateTracker(dbPath);
      writable.insertPegOut(burnTxHash, '02' + '11'.repeat(32), 2_500_000n, 4321);
      writable.setPersistedAnchorHeight(burnTxHash, spvEntry.ergoAnchorHeight);
      writable.updateSyncState({ ergoHeight: 100, sidechainHeight: 200 });
      writable.insertAvlKey(dupKey);
      writable.insertSpvTrackerEntry(spvEntry);
      writable.recordPendingDupHeartbeat('22'.repeat(32), dupKey);
      writable.close();

      const readOnly = new StateTracker(dbPath, { readOnly: true });
      try {
        const pegOut = readOnly.getPegOutByTxHash(burnTxHash) as any;
        expect(pegOut.sidechain_burn_tx_hash).toBe(burnTxHash);
        expect(readOnly.getPersistedAnchorHeight(burnTxHash)).toBe(spvEntry.ergoAnchorHeight);
        expect(readOnly.getSyncState()).toEqual({
          latestErgoHeight: 100,
          latestSidechainHeight: 200,
          stateBoxId: null,
          preventionBoxId: null,
        });
        expect(readOnly.getAllAvlKeys()).toEqual([dupKey]);
        expect(readOnly.getSpvTrackerHistory()).toEqual([
          { key: spvEntry.keyHex, value: spvEntry.valueHex },
        ]);
        expect(readOnly.getPendingDupHeartbeats()).toEqual([
          { txId: '22'.repeat(32), keyHex: dupKey },
        ]);
      } finally {
        readOnly.close();
      }
    });
  });

  it('rejects all StateTracker mutations in read-only mode', () => {
    withTrackerDbPath((dbPath) => {
      const burnTxHash = '11'.repeat(32);
      const writable = new StateTracker(dbPath);
      writable.insertPegOut(burnTxHash, '02' + '33'.repeat(32), 1_000_000n, 100);
      writable.close();

      const readOnly = new StateTracker(dbPath, { readOnly: true });
      try {
        expect(() => readOnly.insertPegIn('44'.repeat(32), '0x' + '55'.repeat(20), 1n, 1)).toThrow(readOnlyError);
        expect(() => readOnly.advancePegInReconciliationCursor(1)).toThrow(readOnlyError);
        expect(() => readOnly.insertPegOut('66'.repeat(32), '02' + '77'.repeat(32), 2n, 2)).toThrow(readOnlyError);
        expect(() => readOnly.repairDetectedPegOut(burnTxHash, '02' + '88'.repeat(32), 3n, 3)).toThrow(readOnlyError);
        expect(() => readOnly.updatePegOutStatus(burnTxHash, 'confirmed')).toThrow(readOnlyError);
        expect(() => readOnly.insertAvlKey('99'.repeat(32))).toThrow(readOnlyError);
        expect(() => readOnly.insertSpvTrackerEntry({
          keyHex: 'aa'.repeat(32),
          valueHex: 'bb'.repeat(36),
          sidechainHeight: 1n,
          sidechainHeaderHash: 'cc'.repeat(32),
          bridgeEventRoot: 'dd'.repeat(32),
          ergoAnchorHeight: 1,
        })).toThrow(readOnlyError);
        expect(() => readOnly.insertAuthenticatedSpvTrackerEntry(authenticatedEntry())).toThrow(readOnlyError);
        expect(() => readOnly.updateSyncState({ ergoHeight: 1 })).toThrow(readOnlyError);
        expect(() => readOnly.setPersistedAnchorHeight(burnTxHash, 1)).toThrow(readOnlyError);
        expect(() => readOnly.clearPersistedAnchorHeight(burnTxHash)).toThrow(readOnlyError);
        expect(() => readOnly.resetPegOutToDetected(burnTxHash)).toThrow(readOnlyError);
        expect(() => readOnly.removeAvlKey('99'.repeat(32))).toThrow(readOnlyError);
        expect(() => readOnly.clearPhase1Artifacts(burnTxHash)).toThrow(readOnlyError);
        expect(() => readOnly.recordPendingDupHeartbeat('ee'.repeat(32), 'ff'.repeat(32))).toThrow(readOnlyError);
        expect(() => readOnly.clearPendingDupHeartbeat('ee'.repeat(32))).toThrow(readOnlyError);
        expect(() => readOnly.reserveErgoOperationalTransactionAttempt({
          operationProfile: SCS_ORACLE_UPDATE_OPERATION_PROFILE,
          expectedTxId: '10'.repeat(32),
          sourceBoxId: '11'.repeat(32),
          inputBoxIds: ['11'.repeat(32), '12'.repeat(32)],
          attemptedAtHeight: 1,
          targetSidechainHeight: 2,
          targetSidechainBlockHashHex: '18'.repeat(32),
          heartbeatKeyHex: null,
          bindingDigestHex: '13'.repeat(32),
          signedTransactionDigestHex: '14'.repeat(32),
          checkResponseDigestHex: '15'.repeat(32),
          revalidationDigestHex: '16'.repeat(32),
          authorizationDigestHex: '17'.repeat(32),
        })).toThrow(readOnlyError);
        expect(() => readOnly.recordAggregateSettlementAttempt('single', [burnTxHash], '12'.repeat(32))).toThrow(readOnlyError);
        expect(() => readOnly.markAggregateSettlementAttemptSubmitted({
          expectedTxId: '12'.repeat(32),
          lifecycleVersion: 1,
          mode: 'single',
          burnTxHashes: [burnTxHash],
          reservationDigest: '13'.repeat(32),
        }, '12'.repeat(32))).toThrow(readOnlyError);
        expect(() => readOnly.markAggregateSettlementAttemptAbandoned('12'.repeat(32))).toThrow(readOnlyError);
        const absence = stableAbsentObservation('12'.repeat(32));
        expect(() => readOnly.abandonSubmittedAggregateSettlementAttempt(
          '12'.repeat(32),
          0,
          'aggregate_submitted',
          [burnTxHash],
          absence,
          matchingObservationConsensus(absence),
        )).toThrow(readOnlyError);
        expect(() => readOnly.recordAuthenticatedSettlementCandidate(authenticatedCandidate())).toThrow(readOnlyError);
        expect(() => readOnly.markAuthenticatedSettlementCandidateCheckPassed(
          authenticatedCheckAdmission('90'.repeat(32)),
        )).toThrow(readOnlyError);
        expect(() => readOnly.invalidateAuthenticatedSettlementCandidate(
          '90'.repeat(32),
          'stale input',
        )).toThrow(readOnlyError);
        expect(() => readOnly.invalidateActiveAuthenticatedSettlementCandidates('chain rollback')).toThrow(readOnlyError);
        expect(() => readOnly.markPegOutBurnRevertedAndInvalidateCandidates(
          burnTxHash,
          'burn reorg',
        )).toThrow(readOnlyError);
      } finally {
        readOnly.close();
      }
    });
  });

  it('does not create a missing database in read-only mode', () => {
    withTrackerDbPath((dbPath) => {
      let openedTracker: StateTracker | undefined;
      try {
        expect(() => {
          openedTracker = new StateTracker(dbPath, { readOnly: true });
        }).toThrow();
      } finally {
        openedTracker?.close();
      }
      expect(existsSync(dbPath)).toBe(false);
    });
  });
});

describe('StateTracker anchor height persistence', () => {
  it('persists and retrieves anchor height for a peg-out', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'aa'.repeat(32);
      tracker.insertPegOut(burnTxHash, '02' + '44'.repeat(32), 1_000_000n, 100);

      // Initially null
      expect(tracker.getPersistedAnchorHeight(burnTxHash)).toBeNull();

      // Set anchor
      tracker.setPersistedAnchorHeight(burnTxHash, 50000);
      expect(tracker.getPersistedAnchorHeight(burnTxHash)).toBe(50000);

      // Overwrite with a new value
      tracker.setPersistedAnchorHeight(burnTxHash, 50001);
      expect(tracker.getPersistedAnchorHeight(burnTxHash)).toBe(50001);
    });
  });

  it('clears persisted anchor height', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'bb'.repeat(32);
      tracker.insertPegOut(burnTxHash, '02' + '55'.repeat(32), 2_000_000n, 200);

      tracker.setPersistedAnchorHeight(burnTxHash, 60000);
      expect(tracker.getPersistedAnchorHeight(burnTxHash)).toBe(60000);

      tracker.clearPersistedAnchorHeight(burnTxHash);
      expect(tracker.getPersistedAnchorHeight(burnTxHash)).toBeNull();
    });
  });

  it('resetPegOutToDetected also clears persisted anchor height', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'cc'.repeat(32);
      tracker.insertPegOut(burnTxHash, '02' + '66'.repeat(32), 3_000_000n, 300);

      tracker.setPersistedAnchorHeight(burnTxHash, 70000);
      tracker.updatePegOutStatus(burnTxHash, 'phase1_created', {
        phase1BoxId: 'dd'.repeat(32),
        pendingAvlKey: 'ee'.repeat(32),
      });

      // Reorg reset should clear anchor too
      tracker.resetPegOutToDetected(burnTxHash);
      expect(tracker.getPersistedAnchorHeight(burnTxHash)).toBeNull();

      const po = tracker.getPegOutByTxHash(burnTxHash) as any;
      expect(po.status).toBe('detected');
      expect(po.phase1_box_id).toBeNull();
      expect(po.ergo_anchor_height).toBeNull();
    });
  });

  it('returns null for non-existent peg-out', () => {
    withTrackerDb((tracker) => {
      expect(tracker.getPersistedAnchorHeight('ff'.repeat(32))).toBeNull();
    });
  });

  it('fails loudly when mutating a missing peg-out row', () => {
    withTrackerDb((tracker) => {
      const missingBurnTxHash = '99'.repeat(32);

      expect(() => tracker.updatePegOutStatus(missingBurnTxHash, 'confirmed')).toThrow(
        /does not exist/,
      );
      expect(() => tracker.setPersistedAnchorHeight(missingBurnTxHash, 80000)).toThrow(
        /does not exist/,
      );
      expect(() => tracker.clearPersistedAnchorHeight(missingBurnTxHash)).toThrow(
        /does not exist/,
      );
      expect(() => tracker.resetPegOutToDetected(missingBurnTxHash)).toThrow(
        /does not exist/,
      );
      expect(() => tracker.clearPhase1Artifacts(missingBurnTxHash)).toThrow(
        /does not exist/,
      );
    });
  });

  it('persists one unresolved local-devnet genesis issuance per profile', () => {
    withTrackerDb((tracker) => {
      const expectedTxId = '6a'.repeat(32);
      const sourceBoxId = '6b'.repeat(32);
      const planDigestHex = '6c'.repeat(32);
      const reserved = tracker.reserveErgoOperationalTransactionAttempt({
        operationProfile:
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
        expectedTxId,
        sourceBoxId,
        inputBoxIds: [sourceBoxId],
        attemptedAtHeight: 720,
        targetSidechainHeight: null,
        targetSidechainBlockHashHex: null,
        heartbeatKeyHex: null,
        reconciliationIdentityDigestHex: planDigestHex,
        bindingDigestHex: '6d'.repeat(32),
        signedTransactionDigestHex: '6e'.repeat(32),
        checkResponseDigestHex: '6f'.repeat(32),
        revalidationDigestHex: '70'.repeat(32),
        authorizationDigestHex: '71'.repeat(32),
      });

      expect(reserved).toMatchObject({
        operationProfile:
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
        status: 'pending',
        reconciliationIdentityDigestHex: planDigestHex,
      });
      expect(tracker.getErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([reserved]);
      expect(() => tracker.reserveErgoOperationalTransactionAttempt({
        operationProfile:
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
        expectedTxId: '72'.repeat(32),
        sourceBoxId: '73'.repeat(32),
        inputBoxIds: ['73'.repeat(32)],
        attemptedAtHeight: 721,
        targetSidechainHeight: null,
        targetSidechainBlockHashHex: null,
        heartbeatKeyHex: null,
        reconciliationIdentityDigestHex: planDigestHex,
        bindingDigestHex: '74'.repeat(32),
        signedTransactionDigestHex: '75'.repeat(32),
        checkResponseDigestHex: '76'.repeat(32),
        revalidationDigestHex: '77'.repeat(32),
        authorizationDigestHex: '78'.repeat(32),
      })).toThrow(/unresolved local devnet operational attempt/);

      tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 722,
        confirmationHeaderId: '79'.repeat(32),
      });
      expect(tracker.getConfirmedErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toHaveLength(1);
      expect(tracker.getErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([
        expect.objectContaining({ expectedTxId, status: 'confirmed' }),
      ]);
    });
  });

  it('rejects creation of an unclassified failed peg-out state', () => {
    withTrackerDb((tracker) => {
      const burnTxHash = 'ab'.repeat(32);
      tracker.insertPegOut(
        burnTxHash,
        `02${'ac'.repeat(32)}`,
        1_000_000n,
        900,
        {
          sidechainId: authenticatedSidechainId,
          sidechainBlockHash: 'ae'.repeat(32),
          sidechainLogIndex: 10,
        },
      );

      expect(() => tracker.updatePegOutStatus(burnTxHash, 'failed')).toThrow(
        /legacy_failed_unclassified_v1.*versioned reconstruction path/i,
      );
      expect(tracker.getPegOutByTxHash(burnTxHash)).toEqual(
        expect.objectContaining({ status: 'detected' }),
      );

      const rawDb = (tracker as unknown as { db: Database.Database }).db;
      rawDb.prepare(`
        UPDATE peg_out_events
        SET status = 'failed', phase2_unlock_tx_id = ?
        WHERE lower(sidechain_burn_tx_hash) = ?
      `).run('ad'.repeat(32), burnTxHash);
      expect(() => tracker.updatePegOutStatus(burnTxHash, 'confirmed')).toThrow(
        /legacy_failed_unclassified_v1.*external settlement reconstruction/i,
      );
      expect(() => tracker.resetPegOutToDetected(burnTxHash)).toThrow(
        /legacy_failed_unclassified_v1.*external settlement reconstruction/i,
      );
      expect(tracker.getOutstandingPegOutLiabilityObservations()).toEqual([
        expect.objectContaining({
          sidechainTransactionHashHex: burnTxHash,
          inFlightSettlementTransactionIdHex: null,
          phase2UnlockTransactionIdHex: 'ad'.repeat(32),
          status: 'failed',
        }),
      ]);
    });
  });
});
