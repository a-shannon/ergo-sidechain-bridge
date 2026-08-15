import { describe, expect, it } from 'vitest';

import type {
  AuthenticatedV2PreparedCandidateRecoveryAdmission,
  AuthenticatedV2PreparedCandidateRecoveryBinding,
  AuthenticatedV2PreparedCandidateRecoveryDraft,
  RecoveredAuthenticatedV2PreparedCandidateView,
} from '../relayer-core/authenticated-v2-prepared-candidate-recovery.js';
import {
  createAuthenticatedV2PackageRecoveryJournalAdapter,
} from './authenticated-v2-package-recovery-journal.js';
import {
  createAuthenticatedV2PackageRecoveryReconstructionAdapter,
  digestAuthenticatedV2PackageRecoveryBinding,
} from './authenticated-v2-package-recovery-reconstruction.js';
import {
  createAuthenticatedV2PackageRecoverySourceAdapter,
} from './authenticated-v2-package-recovery-source.js';

const DRAFT = Object.freeze({
  candidate: Object.freeze({
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
  }),
  pegOut: Object.freeze({
    user: `0x${'21'.repeat(20)}`,
    amount: 10_000_000n,
    ergoRecipientAddress: `0008cd02${'22'.repeat(32)}`,
    sidechainTxHash: '13'.repeat(32),
    sidechainBlockNumber: 15,
    sidechainBlockHash: '15'.repeat(32),
    sidechainLogIndex: 1,
  }),
  cacheRecovery: Object.freeze({
    schema: 'e2s.authenticated-v2-cache-recovery.v1',
    observedTip: Object.freeze({
      idHex: '23'.repeat(32),
      parentIdHex: '24'.repeat(32),
      height: 90,
      extensionRootHex: '25'.repeat(32),
    }),
    reconstructionDigests: Object.freeze({
      tracker: '26'.repeat(32),
      duplicatePrevention: '27'.repeat(32),
      vault: '28'.repeat(32),
    }),
    currentInputs: Object.freeze({
      trackerBoxIdHex: '18'.repeat(32),
      duplicatePreventionBoxIdHex: '1a'.repeat(32),
      vaultBoxIdsHex: Object.freeze(['1c'.repeat(32)]),
    }),
  }),
  packageDigestHex: '29'.repeat(32),
  expectedTxId: '2a'.repeat(32),
  cacheRecoveryDigestHex: '2b'.repeat(32),
}) satisfies AuthenticatedV2PreparedCandidateRecoveryDraft;

const BINDING: AuthenticatedV2PreparedCandidateRecoveryBinding = {
  schema: 'e2s.authenticated-v2-package-recovery.v2',
  candidateId: DRAFT.candidate.candidateId,
  burnId: DRAFT.candidate.burnId,
  packageDigestHex: DRAFT.packageDigestHex,
  expectedTxId: DRAFT.expectedTxId,
  cacheRecoveryDigestHex: DRAFT.cacheRecoveryDigestHex,
  sidechainConsensusDigestHex: '2c'.repeat(32),
  sidechainTipHashHex: '2d'.repeat(32),
};

describe('authenticated V2 package recovery adapters', () => {
  it('exposes only exact reconstruction and binding operations', async () => {
    const events: string[] = [];
    const adapter = createAuthenticatedV2PackageRecoveryReconstructionAdapter({
      reconstruct: async (input: { packageId: string }) => {
        events.push(`reconstruct:${input.packageId}`);
        return DRAFT;
      },
    });

    expect(Object.keys(adapter).sort()).toEqual(['binding', 'reconstruction']);
    expect(Object.keys(adapter.reconstruction)).toEqual(['reconstruct']);
    expect(Object.keys(adapter.binding)).toEqual(['digest']);
    await expect(adapter.reconstruction.reconstruct({ packageId: 'package-a' }))
      .resolves.toBe(DRAFT);
    const expectedDigest =
      'dac167d210cd0777e29396ca65ba64b8878043aed16599b1ff50b9daf9245437';
    expect(digestAuthenticatedV2PackageRecoveryBinding(BINDING))
      .toBe(expectedDigest);
    expect(adapter.binding.digest(BINDING)).toBe(expectedDigest);
    expect(events).toEqual(['reconstruct:package-a']);
  });

  it('exposes one exact source-observation operation', async () => {
    const adapter = createAuthenticatedV2PackageRecoverySourceAdapter({
      observe: async (value: typeof DRAFT) => ({
        view: {
          candidateId: value.candidate.candidateId,
          burnIdHex: value.candidate.burnId,
          sidechainIdHex: value.candidate.sidechainId,
          sidechainTxHashHex: value.candidate.burnTxHash,
          sidechainHeight: value.candidate.sidechainHeight,
          executionBlockHashHex: value.candidate.sidechainBlockHash,
          eventIndex: value.candidate.sidechainLogIndex,
          amountNanoErg: value.pegOut.amount,
          recipientErgoTreeHex: value.pegOut.ergoRecipientAddress,
          observedTipHeight: value.candidate.observedSidechainTip,
          observedTipHashHex: '31'.repeat(32),
          confirmations: 11n,
          requiredConfirmations: 10n,
        },
        sourceCount: 2,
        consensusDigestHex: '32'.repeat(32),
      }),
    });

    expect(Object.keys(adapter)).toEqual(['observe']);
    await expect(adapter.observe(DRAFT)).resolves.toEqual({
      view: {
        candidateId: DRAFT.candidate.candidateId,
        burnIdHex: DRAFT.candidate.burnId,
        sidechainIdHex: DRAFT.candidate.sidechainId,
        sidechainTxHashHex: DRAFT.candidate.burnTxHash,
        sidechainHeight: DRAFT.candidate.sidechainHeight,
        executionBlockHashHex: DRAFT.candidate.sidechainBlockHash,
        eventIndex: DRAFT.candidate.sidechainLogIndex,
        amountNanoErg: DRAFT.pegOut.amount,
        recipientErgoTreeHex: DRAFT.pegOut.ergoRecipientAddress,
        observedTipHeight: 25n,
        observedTipHashHex: '31'.repeat(32),
        confirmations: 11n,
        requiredConfirmations: 10n,
      },
      sourceCount: 2,
      consensusDigestHex: '32'.repeat(32),
    });
  });

  it('forwards only the branded admission to the exact journal mutation', () => {
    const admission = Object.freeze({
      candidate: DRAFT.candidate,
    }) as AuthenticatedV2PreparedCandidateRecoveryAdmission;
    const persisted = {
      ...DRAFT.candidate,
      status: 'prepared',
    } as RecoveredAuthenticatedV2PreparedCandidateView;
    let received: AuthenticatedV2PreparedCandidateRecoveryAdmission | undefined;
    const adapter = createAuthenticatedV2PackageRecoveryJournalAdapter({
      recordRecoveredAuthenticatedSettlementCandidate: value => {
        received = value;
        return persisted;
      },
    });

    expect(Object.keys(adapter)).toEqual(['record']);
    expect(adapter.record(admission)).toBe(persisted);
    expect(received).toBe(admission);
  });
});
