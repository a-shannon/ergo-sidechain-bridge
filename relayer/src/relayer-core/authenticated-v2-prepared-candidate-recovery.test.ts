import { describe, expect, it } from 'vitest';

import {
  AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
  assertAuthenticatedV2PreparedCandidateRecoveryAdmissionProvenance,
  recoverAuthenticatedV2PreparedCandidateLifecycle,
  type AuthenticatedV2PreparedCandidateRecoveryAdmission,
  type AuthenticatedV2PreparedCandidateRecoveryDraft,
  type AuthenticatedV2PreparedCandidateRecoveryPorts,
  type AuthenticatedV2RecoverySidechainConsensusView,
  type RecoveredAuthenticatedV2PreparedCandidateView,
} from './authenticated-v2-prepared-candidate-recovery.js';

const PACKAGE_DIGEST = '11'.repeat(32);
const EXPECTED_TX_ID = '12'.repeat(32);
const CACHE_DIGEST = '13'.repeat(32);
const CONSENSUS_DIGEST = '14'.repeat(32);
const TIP_HASH = '15'.repeat(32);
const ADMISSION_DIGEST = '16'.repeat(32);

function draft(): AuthenticatedV2PreparedCandidateRecoveryDraft {
  return {
    candidate: {
      schemaVersion: 2,
      candidateId: '21'.repeat(32),
      burnId: '22'.repeat(32),
      burnTxHash: '23'.repeat(32),
      sidechainId: '24'.repeat(32),
      sidechainHeight: 25n,
      sidechainBlockHash: '25'.repeat(32),
      sidechainLogIndex: 3,
      trackerKey: '26'.repeat(32),
      trackerValue: '27'.repeat(32),
      trackerBoxId: '28'.repeat(32),
      anchorHeaderId: '29'.repeat(32),
      anchorHeaderHeight: 90,
      dupInputBoxId: '2a'.repeat(32),
      dupInputDigest: '2b'.repeat(33),
      vaultBoxId: '2c'.repeat(32),
      unsignedTxDigest: '2d'.repeat(32),
      creationHeight: 100,
      observedSidechainTip: 35n,
      observedErgoTip: 100,
    },
    pegOut: {
      user: `0x${'31'.repeat(20)}`,
      amount: 10_000_000n,
      ergoRecipientAddress: `0008cd02${'32'.repeat(32)}`,
      sidechainTxHash: '23'.repeat(32),
      sidechainBlockNumber: 25,
      sidechainBlockHash: '25'.repeat(32),
      sidechainLogIndex: 3,
    },
    cacheRecovery: {
      schema: 'e2s.authenticated-v2-cache-recovery.v1',
      observedTip: {
        idHex: '33'.repeat(32),
        parentIdHex: '34'.repeat(32),
        height: 100,
        extensionRootHex: '35'.repeat(32),
      },
      reconstructionDigests: {
        tracker: '36'.repeat(32),
        duplicatePrevention: '37'.repeat(32),
        vault: '38'.repeat(32),
      },
      currentInputs: {
        trackerBoxIdHex: '28'.repeat(32),
        duplicatePreventionBoxIdHex: '2a'.repeat(32),
        vaultBoxIdsHex: ['2c'.repeat(32)],
      },
    },
    packageDigestHex: PACKAGE_DIGEST,
    expectedTxId: EXPECTED_TX_ID,
    cacheRecoveryDigestHex: CACHE_DIGEST,
  };
}

function consensus(overrides: {
  observedTipHeight?: bigint;
  sourceCount?: number;
  view?: Partial<AuthenticatedV2RecoverySidechainConsensusView['view']>;
} = {}) {
  const value = draft();
  return {
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
      observedTipHeight: overrides.observedTipHeight ?? 35n,
      observedTipHashHex: TIP_HASH,
      confirmations: 11n,
      requiredConfirmations: 10n,
      ...overrides.view,
    },
    sourceCount: overrides.sourceCount ?? 2,
    consensusDigestHex: CONSENSUS_DIGEST,
  };
}

function recovered(
  admission: AuthenticatedV2PreparedCandidateRecoveryAdmission,
  overrides: Partial<RecoveredAuthenticatedV2PreparedCandidateView> = {},
): RecoveredAuthenticatedV2PreparedCandidateView {
  return {
    ...admission.candidate,
    status: 'prepared',
    recoverySchema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
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
    ...overrides,
  };
}

function ports(
  events: string[],
  overrides: Partial<
    AuthenticatedV2PreparedCandidateRecoveryPorts<
      { packageId: string },
      AuthenticatedV2PreparedCandidateRecoveryDraft,
      ReturnType<typeof consensus>,
      RecoveredAuthenticatedV2PreparedCandidateView
    >
  > = {},
): AuthenticatedV2PreparedCandidateRecoveryPorts<
  { packageId: string },
  AuthenticatedV2PreparedCandidateRecoveryDraft,
  ReturnType<typeof consensus>,
  RecoveredAuthenticatedV2PreparedCandidateView
> {
  return {
    reconstruction: {
      reconstruct: async input => {
        events.push(`reconstruct:${input.packageId}`);
        return draft();
      },
    },
    sourceObservation: {
      observe: async value => {
        events.push(`observe:${value.candidate.candidateId}`);
        return consensus();
      },
    },
    binding: {
      digest: binding => {
        events.push(`bind:${binding.candidateId}`);
        expect(binding).toEqual({
          schema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
          candidateId: draft().candidate.candidateId,
          burnId: draft().candidate.burnId,
          packageDigestHex: PACKAGE_DIGEST,
          expectedTxId: EXPECTED_TX_ID,
          cacheRecoveryDigestHex: CACHE_DIGEST,
          sidechainConsensusDigestHex: CONSENSUS_DIGEST,
          sidechainTipHashHex: TIP_HASH,
        });
        return ADMISSION_DIGEST;
      },
    },
    journal: {
      record: admission => {
        events.push(`record:${admission.candidate.candidateId}`);
        return recovered(admission);
      },
    },
    ...overrides,
  };
}

describe('authenticated V2 prepared-candidate recovery core', () => {
  it('orders reconstruction, source observation, binding, and prepared-only persistence', async () => {
    const events: string[] = [];
    let captured:
      | AuthenticatedV2PreparedCandidateRecoveryAdmission
      | undefined;
    const base = ports(events);

    const result = await recoverAuthenticatedV2PreparedCandidateLifecycle(
      { packageId: 'package-a' },
      {
        ...base,
        journal: {
          record: admission => {
            captured = admission;
            events.push(`record:${admission.candidate.candidateId}`);
            return recovered(admission);
          },
        },
      },
    );

    expect(events).toEqual([
      'reconstruct:package-a',
      `observe:${draft().candidate.candidateId}`,
      `bind:${draft().candidate.candidateId}`,
      `record:${draft().candidate.candidateId}`,
    ]);
    expect(result).toMatchObject({
      schema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
      packageDigestHex: PACKAGE_DIGEST,
      expectedTxId: EXPECTED_TX_ID,
      cacheRecoveryDigestHex: CACHE_DIGEST,
      sidechainConsensusDigestHex: CONSENSUS_DIGEST,
      sidechainTipHashHex: TIP_HASH,
      recoveryAdmissionDigestHex: ADMISSION_DIGEST,
      candidate: { status: 'prepared' },
      boundary: {
        externalPackageIsAuthorityByItself: false,
        freshChainRecoveryRequired: true,
        ergoCacheSnapshotRevalidatedAtomically: true,
        sidechainBurnViewReobserved: true,
        matchingSidechainSourcesReobserved: true,
        distinctOriginsDetectDisagreementButDoNotProveConsensus: true,
        nativeAdmissionRecollectedInsideRecovery: false,
        restoredCandidateStatus: 'prepared',
        checkPassedRestored: false,
        signerSubmitterOrBroadcastAuthorityRestored: false,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(() =>
      assertAuthenticatedV2PreparedCandidateRecoveryAdmissionProvenance(
        captured,
      )).not.toThrow();
    expect(() =>
      assertAuthenticatedV2PreparedCandidateRecoveryAdmissionProvenance(
        structuredClone(captured),
      )).toThrow(/provenance is missing/);
  });

  it('stops before source observation when package reconstruction rejects', async () => {
    const events: string[] = [];
    const base = ports(events);

    await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
      { packageId: 'drifted' },
      {
        ...base,
        reconstruction: {
          reconstruct: async () => {
            events.push('reconstruct');
            throw new Error('unsigned package digest drift');
          },
        },
      },
    )).rejects.toThrow(/package digest drift/);
    expect(events).toEqual(['reconstruct']);
  });

  it.each([
    'sidechain RPC sources disagree',
    'burn is not confirmed in the canonical block hash',
  ])('stops before binding and persistence when observation rejects: %s', async error => {
    const events: string[] = [];
    const base = ports(events);

    await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
      { packageId: 'package-a' },
      {
        ...base,
        sourceObservation: {
          observe: async () => {
            events.push('observe');
            throw new Error(error);
          },
        },
      },
    )).rejects.toThrow(error);
    expect(events).toEqual(['reconstruct:package-a', 'observe']);
  });

  it('rejects out-of-order tip observations before binding or persistence', async () => {
    const events: string[] = [];
    const base = ports(events);

    await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
      { packageId: 'package-a' },
      {
        ...base,
        sourceObservation: {
          observe: async () => {
            events.push('observe');
            return consensus({ observedTipHeight: 36n });
          },
        },
      },
    )).rejects.toThrow(/candidate tip does not match.*freshly observed/i);
    expect(events).toEqual(['reconstruct:package-a', 'observe']);
  });

  it.each([
    ['candidate ID', { candidateId: 'ff'.repeat(32) }],
    ['burn ID', { burnIdHex: 'ff'.repeat(32) }],
    ['sidechain ID', { sidechainIdHex: 'ff'.repeat(32) }],
    ['transaction hash', { sidechainTxHashHex: 'ff'.repeat(32) }],
    ['sidechain height', { sidechainHeight: 26n }],
    ['execution block hash', { executionBlockHashHex: 'ff'.repeat(32) }],
    ['event index', { eventIndex: 4 }],
    ['amount', { amountNanoErg: 10_000_001n }],
    ['recipient', { recipientErgoTreeHex: `0008cd02${'ff'.repeat(32)}` }],
  ] as const)(
    'rejects a source observation bound to another %s before binding or persistence',
    async (_label, view) => {
      const events: string[] = [];
      const base = ports(events);

      await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
        { packageId: 'package-a' },
        {
          ...base,
          sourceObservation: {
            observe: async () => {
              events.push('observe');
              return consensus({ view });
            },
          },
        },
      )).rejects.toThrow(/does not match the candidate and payout/i);
      expect(events).toEqual(['reconstruct:package-a', 'observe']);
    },
  );

  it('rejects a single-source observation before binding or persistence', async () => {
    const events: string[] = [];
    const base = ports(events);

    await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
      { packageId: 'package-a' },
      {
        ...base,
        sourceObservation: {
          observe: async () => {
            events.push('observe');
            return consensus({ sourceCount: 1 });
          },
        },
      },
    )).rejects.toThrow(/at least two matching sidechain sources/);
    expect(events).toEqual(['reconstruct:package-a', 'observe']);
  });

  it.each([
    ['packageDigestHex', 'unsigned package digest'],
    ['expectedTxId', 'expected transaction ID'],
    ['cacheRecoveryDigestHex', 'cache recovery digest'],
  ] as const)(
    'rejects a non-canonical %s before binding or persistence',
    async (field, label) => {
      const events: string[] = [];
      const base = ports(events);

      await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
        { packageId: 'package-a' },
        {
          ...base,
          reconstruction: {
            reconstruct: async () => {
              events.push('reconstruct');
              return {
                ...draft(),
                [field]: 'FF'.repeat(32),
              };
            },
          },
        },
      )).rejects.toThrow(new RegExp(`${label} must be 32-byte lowercase hex`, 'i'));
      expect(events).toEqual(['reconstruct']);
    },
  );

  it('rejects a malformed admission digest before journal access', async () => {
    const events: string[] = [];
    const base = ports(events);

    await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
      { packageId: 'package-a' },
      {
        ...base,
        binding: {
          digest: () => {
            events.push('bind');
            return 'not-a-digest';
          },
        },
      },
    )).rejects.toThrow(/recovery admission digest must be 32-byte lowercase hex/);
    expect(events).toEqual([
      'reconstruct:package-a',
      `observe:${draft().candidate.candidateId}`,
      'bind',
    ]);
  });

  const authorityFields = [
    'checkExpectedTxId',
    'checkUnsignedPackageDigest',
    'checkSignedTransactionDigest',
    'checkResponseDigest',
    'checkSignerContextDigest',
    'checkCheckerIdentityDigest',
    'checkRevalidationDigest',
    'checkNativeVerificationRequestDigest',
    'checkTrustAnchorDigest',
    'checkFinalityHorizonHash',
    'checkFinalityHorizonHeight',
    'checkFinalityStatementDigest',
    'checkFinalityProgramId',
    'checkFinalityProofSystemId',
    'checkFinalityVerifierProfileId',
    'checkFinalityProofPayloadDigest',
    'checkFinalityProofDigest',
    'checkStableErgoViewDigest',
    'checkStableSidechainViewDigest',
    'checkAdmissionDigest',
  ] as const;

  it.each(authorityFields)(
    'rejects journal output that restores %s authority',
    async field => {
      const events: string[] = [];
      const base = ports(events);

      await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
        { packageId: 'package-a' },
        {
          ...base,
          journal: {
            record: admission => {
              const value = field === 'checkFinalityHorizonHeight'
                ? 1n
                : field === 'checkFinalityProofSystemId'
                  ? 1
                  : 'restored';
              return recovered(admission, { [field]: value });
            },
          },
        },
      )).rejects.toThrow(/only an unchecked prepared candidate/);
    },
  );

  it.each([
    { status: 'submitted' },
    { recoverySchema: 'e2s.other-recovery.v1' },
    { recoverySidechainConsensusDigest: 'ff'.repeat(32) },
    { recoveryAdmissionDigest: 'ff'.repeat(32) },
    { recoverySidechainTipHash: 'ff'.repeat(32) },
    { recoverySidechainSourceCount: 3 },
  ])('rejects inconsistent recovered lifecycle metadata: %o', async override => {
    const events: string[] = [];
    const base = ports(events);

    await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
      { packageId: 'package-a' },
      {
        ...base,
        journal: {
          record: admission => recovered(admission, override),
        },
      },
    )).rejects.toThrow(/only an unchecked prepared candidate/);
  });
});
