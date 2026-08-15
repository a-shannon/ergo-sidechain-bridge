import { describe, expect, it, vi } from 'vitest';

vi.mock(
  './relayer-core/authenticated-settlement-execution-lifecycle.js',
  () => ({
    assertAuthenticatedSettlementTransportReservationRequestProvenance:
      vi.fn(),
  }),
);

import {
  AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
} from './authenticated-settlement-candidate-schema.js';
import {
  AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA,
  deriveAuthenticatedSettlementCandidateAuthorityDigest,
} from './authenticated-settlement-execution-reservation.js';
import {
  deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-payout-binding.js';
import type {
  AuthenticatedSettlementTransportReservationRequest,
} from './relayer-core/authenticated-settlement-execution-lifecycle.js';
import {
  AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION,
  AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA,
  assertAuthenticatedSettlementTransportAttemptAdmissionProvenance,
  authorizeAuthenticatedSettlementTransportAttempt,
  deriveAuthenticatedSettlementTransportAttemptIdentity,
  type AuthenticatedSettlementTransportAttemptAdmissionInput,
} from './authenticated-settlement-transport-attempt.js';
import type {
  AuthenticatedSettlementCandidate,
  AuthenticatedSettlementExecutionReservation,
  PegOutEvent,
} from './state-tracker.js';

const candidate: AuthenticatedSettlementCandidate = {
  schemaVersion: AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
  candidateId: '02'.repeat(32),
  burnId: '03'.repeat(32),
  burnTxHash: '04'.repeat(32),
  sidechainId: '05'.repeat(32),
  sidechainHeight: 100n,
  sidechainBlockHash: '06'.repeat(32),
  sidechainLogIndex: 7,
  trackerKey: '07'.repeat(32),
  trackerValue: '08'.repeat(66),
  trackerBoxId: '09'.repeat(32),
  anchorHeaderId: '0a'.repeat(32),
  anchorHeaderHeight: 90,
  dupInputBoxId: '0b'.repeat(32),
  dupInputDigest: '0c'.repeat(33),
  vaultBoxId: '0d'.repeat(32),
  unsignedTxDigest: '0e'.repeat(32),
  creationHeight: 90,
  observedSidechainTip: 110n,
  observedErgoTip: 120,
  status: 'check_passed',
  recoverySchema: null,
  recoverySidechainConsensusDigest: null,
  recoveryAdmissionDigest: null,
  recoverySidechainTipHash: null,
  recoverySidechainSourceCount: null,
  checkExpectedTxId: '0f'.repeat(32),
  checkUnsignedPackageDigest: '10'.repeat(32),
  checkSignedTransactionDigest: '11'.repeat(32),
  checkResponseDigest: '12'.repeat(32),
  checkSignerContextDigest: '13'.repeat(32),
  checkCheckerIdentityDigest: '14'.repeat(32),
  checkRevalidationDigest: '15'.repeat(32),
  checkNativeVerificationRequestDigest: '16'.repeat(32),
  checkTrustAnchorDigest: '17'.repeat(32),
  checkFinalityHorizonHash: '18'.repeat(32),
  checkFinalityHorizonHeight: 100n,
  checkFinalityStatementDigest: '19'.repeat(32),
  checkFinalityProgramId: '1a'.repeat(32),
  checkFinalityProofSystemId: 1,
  checkFinalityVerifierProfileId: '1b'.repeat(32),
  checkFinalityProofPayloadDigest: '1c'.repeat(32),
  checkFinalityProofDigest: '1d'.repeat(32),
  checkStableErgoViewDigest: '1e'.repeat(32),
  checkStableSidechainViewDigest: '1f'.repeat(32),
  checkAdmissionDigest: '20'.repeat(32),
  invalidationReason: null,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const recipientErgoTreeHex = `0008cd02${'21'.repeat(32)}`;
const payoutDigestHex =
  deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest({
    candidateId: candidate.candidateId,
    burnId: candidate.burnId,
    sidechainId: candidate.sidechainId,
    burnTxHash: candidate.burnTxHash,
    sidechainHeight: candidate.sidechainHeight,
    executionBlockHash: candidate.sidechainBlockHash,
    eventIndex: candidate.sidechainLogIndex,
    amountNanoErg: 1_000_000n,
    recipientErgoTreeHex,
    vaultBoxId: candidate.vaultBoxId,
  });

const reservation: AuthenticatedSettlementExecutionReservation = {
  schema: AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA,
  reservationDigestHex: '01'.repeat(32),
  candidateId: candidate.candidateId,
  candidateAuthorityDigestHex:
    deriveAuthenticatedSettlementCandidateAuthorityDigest(candidate),
  burnId: candidate.burnId,
  burnTxHash: candidate.burnTxHash,
  amountNanoErg: 1_000_000n,
  recipientErgoTreeHex,
  duplicatePreventionBoxId: candidate.dupInputBoxId,
  vaultBoxId: candidate.vaultBoxId,
  expectedTxId: candidate.checkExpectedTxId!,
  unsignedTxDigestHex: candidate.unsignedTxDigest,
  unsignedPackageDigestHex: candidate.checkUnsignedPackageDigest!,
  signedTransactionDigestHex: candidate.checkSignedTransactionDigest!,
  checkResponseDigestHex: candidate.checkResponseDigest!,
  signerContextDigestHex: candidate.checkSignerContextDigest,
  checkerIdentityDigestHex: candidate.checkCheckerIdentityDigest,
  revalidationDigestHex: candidate.checkRevalidationDigest!,
  stableErgoViewDigestHex: candidate.checkStableErgoViewDigest!,
  stableSidechainViewDigestHex: candidate.checkStableSidechainViewDigest!,
  finalityProofDigestHex: candidate.checkFinalityProofDigest!,
  checkAdmissionDigestHex: candidate.checkAdmissionDigest!,
  authorizationDigestHex: '22'.repeat(32),
  status: 'active',
  revocationReason: null,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const pegOut: PegOutEvent = {
  id: 1,
  sidechainBurnTxHash: candidate.burnTxHash,
  sidechainId: candidate.sidechainId,
  burnId: candidate.burnId,
  ergoRecipientAddress: recipientErgoTreeHex,
  amountNanoErg: reservation.amountNanoErg,
  sidechainBurnHeight: Number(candidate.sidechainHeight),
  user: '0x' + '23'.repeat(20),
  sidechainBlockHash: candidate.sidechainBlockHash,
  sidechainLogIndex: candidate.sidechainLogIndex,
  status: 'confirmed',
  phase1BoxId: null,
  phase2UnlockTxId: null,
  avlProofHex: null,
  ergoAnchorHeight: null,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const signedArtifact = Object.freeze({ opaqueHandle: 'signed-handle' });
const input: AuthenticatedSettlementTransportAttemptAdmissionInput = {
  executionReservationDigestHex: reservation.reservationDigestHex,
  candidateId: candidate.candidateId,
  expectedTxId: reservation.expectedTxId,
  unsignedTxDigestHex: reservation.unsignedTxDigestHex,
  unsignedPackageDigestHex: reservation.unsignedPackageDigestHex,
  payoutDigestHex,
  trackerBoxId: candidate.trackerBoxId,
  duplicatePreventionBoxId: reservation.duplicatePreventionBoxId,
  signedTransactionDigestHex: reservation.signedTransactionDigestHex,
  preSubmitRevalidationDigestHex: '24'.repeat(32),
  broadcastAuthorizationDigestHex: '25'.repeat(32),
};
const request = {
  authorization: {
    candidate,
    ...input,
    reservationDigestHex: input.executionReservationDigestHex,
    revalidation: { signedArtifact },
    signedArtifact,
  },
  signedArtifact,
} as unknown as AuthenticatedSettlementTransportReservationRequest<
  AuthenticatedSettlementCandidate,
  unknown,
  typeof signedArtifact
>;
const state = {
  getAuthenticatedSettlementCandidate: (candidateId: string) =>
    candidateId === candidate.candidateId ? candidate : null,
  getAuthenticatedSettlementExecutionReservation: (
    lookup: { reservationDigestHex: string } | { candidateId: string },
  ) =>
    'reservationDigestHex' in lookup
    && lookup.reservationDigestHex === reservation.reservationDigestHex
      ? reservation
      : null,
  getPegOutByBurnId: (burnId: string) =>
    burnId === candidate.burnId ? pegOut : undefined,
};

describe('authenticated settlement transport attempt identity', () => {
  it('derives one deterministic durable identity without signed transaction bytes', () => {
    const admission = authorizeAuthenticatedSettlementTransportAttempt({
      state,
      request,
    });
    expect(admission).toEqual({
      schema: AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA,
      lifecycleVersion:
        AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION,
      ...input,
      transportReservationDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      durableAttemptDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(Object.keys(admission)).not.toContain('signedTransactionBytes');
    expect(deriveAuthenticatedSettlementTransportAttemptIdentity(input)).toEqual({
      transportReservationDigestHex: admission.transportReservationDigestHex,
      durableAttemptDigestHex: admission.durableAttemptDigestHex,
    });
    expect(() =>
      assertAuthenticatedSettlementTransportAttemptAdmissionProvenance(admission)
    ).not.toThrow();
  });

  it.each(Object.keys(input) as Array<keyof typeof input>)(
    'changes both identities when %s changes',
    field => {
      const baseline = deriveAuthenticatedSettlementTransportAttemptIdentity(input);
      const changed = deriveAuthenticatedSettlementTransportAttemptIdentity({
        ...input,
        [field]: field === 'candidateId' ? '26'.repeat(32) : '27'.repeat(32),
      });
      expect(changed.transportReservationDigestHex).not.toBe(
        baseline.transportReservationDigestHex,
      );
      expect(changed.durableAttemptDigestHex).not.toBe(
        baseline.durableAttemptDigestHex,
      );
    },
  );

  it('rejects raw fields, drifted authority, cloned admissions, and malformed IDs', () => {
    expect(() =>
      authorizeAuthenticatedSettlementTransportAttempt(input as never)
    ).toThrow();
    expect(() =>
      authorizeAuthenticatedSettlementTransportAttempt({
        state: {
          ...state,
          getAuthenticatedSettlementExecutionReservation: () => ({
            ...reservation,
            signedTransactionDigestHex: '28'.repeat(32),
          }),
        },
        request,
      })
    ).toThrow(/authority has drifted/);
    const admission = authorizeAuthenticatedSettlementTransportAttempt({
      state,
      request,
    });
    expect(() =>
      assertAuthenticatedSettlementTransportAttemptAdmissionProvenance(
        structuredClone(admission),
      )
    ).toThrow(/provenance is missing/);
    expect(() =>
      deriveAuthenticatedSettlementTransportAttemptIdentity({
        ...input,
        expectedTxId: 'not-hex',
      })
    ).toThrow(/expected transaction ID must be 32 bytes/);
  });
});
