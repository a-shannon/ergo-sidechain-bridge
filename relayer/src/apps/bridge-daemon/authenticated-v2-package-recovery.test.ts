import { describe, expect, it } from 'vitest';

import type {
  AuthenticatedV2PreparedCandidateRecoveryAdmission,
  AuthenticatedV2PreparedCandidateRecoveryDraft,
  RecoveredAuthenticatedV2PreparedCandidateView,
} from '../../relayer-core/authenticated-v2-prepared-candidate-recovery.js';
import {
  digestAuthenticatedV2PackageRecoveryBinding,
} from '../../adapters/authenticated-v2-package-recovery-reconstruction.js';
import {
  runAuthenticatedV2PackageRecovery,
} from './authenticated-v2-package-recovery.js';

function draft(): AuthenticatedV2PreparedCandidateRecoveryDraft {
  return {
    candidate: {
      schemaVersion: 2,
      candidateId: '11'.repeat(32),
      burnId: '12'.repeat(32),
      burnTxHash: '13'.repeat(32),
      sidechainId: '14'.repeat(32),
      sidechainHeight: 15n,
      sidechainBlockHash: '15'.repeat(32),
      sidechainLogIndex: 1,
      trackerKey: '16'.repeat(32),
      trackerValue: '17'.repeat(32),
      trackerBoxId: '18'.repeat(32),
      anchorHeaderId: '19'.repeat(32),
      anchorHeaderHeight: 80,
      dupInputBoxId: '1a'.repeat(32),
      dupInputDigest: '1b'.repeat(33),
      vaultBoxId: '1c'.repeat(32),
      unsignedTxDigest: '1d'.repeat(32),
      creationHeight: 90,
      observedSidechainTip: 25n,
      observedErgoTip: 90,
    },
    pegOut: {
      user: `0x${'21'.repeat(20)}`,
      amount: 10_000_000n,
      ergoRecipientAddress: `0008cd02${'22'.repeat(32)}`,
      sidechainTxHash: '13'.repeat(32),
      sidechainBlockNumber: 15,
      sidechainBlockHash: '15'.repeat(32),
      sidechainLogIndex: 1,
    },
    cacheRecovery: {
      schema: 'e2s.authenticated-v2-cache-recovery.v1',
      observedTip: {
        idHex: '23'.repeat(32),
        parentIdHex: '24'.repeat(32),
        height: 90,
        extensionRootHex: '25'.repeat(32),
      },
      reconstructionDigests: {
        tracker: '26'.repeat(32),
        duplicatePrevention: '27'.repeat(32),
        vault: '28'.repeat(32),
      },
      currentInputs: {
        trackerBoxIdHex: '18'.repeat(32),
        duplicatePreventionBoxIdHex: '1a'.repeat(32),
        vaultBoxIdsHex: ['1c'.repeat(32)],
      },
    },
    packageDigestHex: '29'.repeat(32),
    expectedTxId: '2a'.repeat(32),
    cacheRecoveryDigestHex: '2b'.repeat(32),
  };
}

function recovered(
  admission: AuthenticatedV2PreparedCandidateRecoveryAdmission,
): RecoveredAuthenticatedV2PreparedCandidateView {
  return {
    ...admission.candidate,
    status: 'prepared',
    recoverySchema: admission.schema,
    recoverySidechainConsensusDigest: admission.sidechainConsensusDigestHex,
    recoveryAdmissionDigest: admission.recoveryAdmissionDigestHex,
    recoverySidechainTipHash: admission.sidechainTipHashHex,
    recoverySidechainSourceCount: admission.sidechainConsensus.sourceCount,
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
    checkStableErgoViewDigest: null,
    checkStableSidechainViewDigest: null,
    checkAdmissionDigest: null,
  };
}

describe('bridge-daemon authenticated V2 package recovery composition', () => {
  it('assembles the fixed ports in reconstruction-observation-journal order', async () => {
    const events: string[] = [];
    const value = draft();

    const result = await runAuthenticatedV2PackageRecovery(
      { packageId: 'package-a' },
      {
        state: {
          recordRecoveredAuthenticatedSettlementCandidate: admission => {
            events.push(`record:${admission.candidate.candidateId}`);
            return recovered(admission);
          },
        },
        reconstruct: async input => {
          events.push(`reconstruct:${input.packageId}`);
          return value;
        },
        observe: async observed => {
          events.push(`observe:${observed.candidate.candidateId}`);
          return {
            view: {
              candidateId: observed.candidate.candidateId,
              burnIdHex: observed.candidate.burnId,
              sidechainIdHex: observed.candidate.sidechainId,
              sidechainTxHashHex: observed.candidate.burnTxHash,
              sidechainHeight: observed.candidate.sidechainHeight,
              executionBlockHashHex: observed.candidate.sidechainBlockHash,
              eventIndex: observed.candidate.sidechainLogIndex,
              amountNanoErg: observed.pegOut.amount,
              recipientErgoTreeHex: observed.pegOut.ergoRecipientAddress,
              observedTipHeight: 25n,
              observedTipHashHex: '31'.repeat(32),
              confirmations: 11n,
              requiredConfirmations: 10n,
            },
            sourceCount: 2,
            consensusDigestHex: '32'.repeat(32),
          };
        },
      },
    );

    expect(events).toEqual([
      'reconstruct:package-a',
      `observe:${value.candidate.candidateId}`,
      `record:${value.candidate.candidateId}`,
    ]);
    const expectedRecoveryAdmissionDigest =
      digestAuthenticatedV2PackageRecoveryBinding({
        schema: 'e2s.authenticated-v2-package-recovery.v2',
        candidateId: value.candidate.candidateId,
        burnId: value.candidate.burnId,
        packageDigestHex: value.packageDigestHex,
        expectedTxId: value.expectedTxId,
        cacheRecoveryDigestHex: value.cacheRecoveryDigestHex,
        sidechainConsensusDigestHex: '32'.repeat(32),
        sidechainTipHashHex: '31'.repeat(32),
      });
    expect(result).toMatchObject({
      candidate: { status: 'prepared' },
      packageDigestHex: value.packageDigestHex,
      expectedTxId: value.expectedTxId,
      sidechainConsensusDigestHex: '32'.repeat(32),
      recoveryAdmissionDigestHex: expectedRecoveryAdmissionDigest,
    });
  });

  it('does not expose the journal when the source observation rejects', async () => {
    let journalCalls = 0;

    await expect(runAuthenticatedV2PackageRecovery(
      { packageId: 'package-a' },
      {
        state: {
          recordRecoveredAuthenticatedSettlementCandidate: admission => {
            journalCalls++;
            return recovered(admission);
          },
        },
        reconstruct: async () => draft(),
        observe: async () => {
          throw new Error('sidechain RPC sources disagree');
        },
      },
    )).rejects.toThrow(/sources disagree/);
    expect(journalCalls).toBe(0);
  });
});
