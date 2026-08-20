import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCommittedVaultForCandidate: vi.fn(),
}));

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1: 10,
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1:
      mocks.assertCommittedVaultForCandidate,
  }),
);

import {
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_IDENTITY_V4_HEX,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_ID_V4_HEX,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1-fixture.js';

const h32 = (byte: string): string => `0x${byte.repeat(32)}`;
const h20 = (byte: string): string => `0x${byte.repeat(20)}`;
const FAMILY_ID = h32('11');
const SIDECHAIN_ID = h32('23');
const BRIDGE_ADDRESS = '0x970951a12f975e6762482aca81e57d5a2a4e73f4';
const SERG_CONTRACT_ADDRESS = '0xc01ee7f10ea4af4673cfff62710e1d7792aba8f3';
const SOURCE_LOCK_ID = h32('12');
const TRANSITION_ID = h32('13');
const COMMITMENT = h32('14');
const SUCCESSOR_ID = h32('15');
const SUCCESSOR_DIGEST = `0x01${'16'.repeat(32)}`;
const INCLUSION_ID = h32('17');
const TARGET_ID = h32('18');
const SOURCE_INTENT_HEX = encodePegInSourceIntentV2Hex({
  formatVersion: 2,
  sourceNetworkIdHex: h32('21'),
  sidechainIdHex: SIDECHAIN_ID,
  bridgeAddressHex: BRIDGE_ADDRESS,
  tokenAddressHex: SERG_CONTRACT_ADDRESS,
  settlementProfileIdHex: h32('25'),
  admissionProfileIdHex: FAMILY_ID,
  sourceAssetIdHex: h32('00'),
  amountNanoErg: '10000000',
  recipientAddressHex: h20('26'),
});
const BATCH = Object.freeze({ role: 'batch' });
const TARGET = Object.freeze({ role: 'target' });
const CANDIDATE = Object.freeze({ candidateDigestHex: h32('31') });
const OBSERVATION = Object.freeze({
  confirmationHeight: 500,
  confirmationHeaderIdHex: INCLUSION_ID,
  finalityTargetHeight: 510,
  finalityTargetHeaderIdHex: TARGET_ID,
  requiredSuccessorDepth: 10,
  observationDigestHex: h32('32'),
});
const PACKET = Object.freeze({
  familyIdHex: FAMILY_ID,
  familyCompiler: Object.freeze({ bindingDigestHex: h32('33') }),
  sourceIntentHex: SOURCE_INTENT_HEX,
  depositCommitmentHex: COMMITMENT,
  reserve: Object.freeze({
    outputDigestHex: SUCCESSOR_DIGEST,
    outputLiabilityNanoErg: '10000000',
  }),
  transactions: Object.freeze({
    reserveTransition: Object.freeze({ txId: TRANSITION_ID }),
  }),
  boxes: Object.freeze({
    sourceLock: Object.freeze({ boxId: SOURCE_LOCK_ID }),
    reserveSuccessor: Object.freeze({ boxId: SUCCESSOR_ID }),
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertCommittedVaultForCandidate.mockImplementation(
    (observation, batch, candidate, target) => {
      if (
        observation !== OBSERVATION
        || batch !== BATCH
        || candidate !== CANDIDATE
        || target !== TARGET
      ) {
        throw new Error('committed-vault candidate provenance missing');
      }
      return PACKET;
    },
  );
});

describe('isolated devnet peg-in mint-reservation draft V1', () => {
  it('binds the exact committed reserve to one canonical non-authorizing V4 statement', () => {
    const draft = buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      batch: BATCH as never,
      target: TARGET as never,
      candidate: CANDIDATE as never,
      committedVaultObservation: OBSERVATION as never,
    });

    expect(draft).toMatchObject({
      status: 'canonical_statement_waiting_for_source_proof',
      reservationKeyHex: draft.statement.mintIdentityHex,
      statement: {
        lineageProfileIdHex: FAMILY_ID,
        sourceIntentHex: SOURCE_INTENT_HEX,
        sourceLockBoxIdHex: SOURCE_LOCK_ID,
        reserveTransitionTransactionIdHex: TRANSITION_ID,
        depositCommitmentHex: COMMITMENT,
        successorReserveBoxIdHex: SUCCESSOR_ID,
        successorReserveDigestHex: SUCCESSOR_DIGEST,
        successorReserveLiabilityNanoErg: '10000000',
        ergoDepositFinalityPolicyIdHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
        inclusionHeaderIdHex: INCLUSION_ID,
        inclusionHeight: 500,
        targetHeaderIdHex: TARGET_ID,
        targetHeight: 510,
        requiredSuccessorDepth: 10,
      },
      provenance: {
        candidateDigestHex: CANDIDATE.candidateDigestHex,
        committedVaultObservationDigestHex:
          OBSERVATION.observationDigestHex,
        familyCompilerBindingDigestHex:
          PACKET.familyCompiler.bindingDigestHex,
        exactSameProcessCandidateAndObservationBound: true,
      },
      boundary: {
        exactCommittedReserveBound: true,
        exactFinalityTargetBound: true,
        canonicalV4StatementConstructed: true,
        runtimeProfileBound: false,
        canonicalSourceProofEvidenceCollected: false,
        sourceProofRequestConstructed: false,
        sourceAttestationEstablished: false,
        runtimeReservationWritten: false,
        mintExecuted: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(draft.statementHex).toHaveLength(2 + 603 * 2);
    expect(draft.statementHex).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
    );
    expect(draft.statementIdHex).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_ID_V4_HEX,
    );
    expect(draft.reservationKeyHex).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_IDENTITY_V4_HEX,
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(draft)
    ).not.toThrow();
  });

  it('rejects copied evidence, cross-candidate reuse, and copied drafts', () => {
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        batch: BATCH as never,
        target: TARGET as never,
        candidate: CANDIDATE as never,
        committedVaultObservation: { ...OBSERVATION } as never,
      })
    ).toThrow(/provenance missing/);

    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        batch: BATCH as never,
        target: TARGET as never,
        candidate: { ...CANDIDATE } as never,
        committedVaultObservation: OBSERVATION as never,
      })
    ).toThrow(/provenance missing/);

    const draft = buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      batch: BATCH as never,
      target: TARGET as never,
      candidate: CANDIDATE as never,
      committedVaultObservation: OBSERVATION as never,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        ...draft,
      })
    ).toThrow(/same-process provenance/);
  });

  it('rejects a liability lower than the bound source amount', () => {
    mocks.assertCommittedVaultForCandidate.mockReturnValueOnce({
      ...PACKET,
      reserve: {
        ...PACKET.reserve,
        outputLiabilityNanoErg: '9999999',
      },
    });

    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        batch: BATCH as never,
        target: TARGET as never,
        candidate: CANDIDATE as never,
        committedVaultObservation: OBSERVATION as never,
      })
    ).toThrow(/liability cannot be lower/);
  });
});
