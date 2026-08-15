import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collectFinality: vi.fn(),
  requestStateProof: vi.fn(),
  assertReservationRequest: vi.fn(),
  assertVerifier: vi.fn(),
  assertVerification: vi.fn(),
}));

vi.mock('./native-checkpoint-proof-collector.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-checkpoint-proof-collector.js')
  >();
  return {
    ...actual,
    collectNativeFinalityMaterial: mocks.collectFinality,
  };
});

vi.mock('./substrate-finality-provider.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./substrate-finality-provider.js')
  >();
  return {
    ...actual,
    requestPooledReserveMintReservationStateReadProofV4:
      mocks.requestStateProof,
  };
});

vi.mock(
  './validity-application-pooled-reserve-mint-reservation-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-mint-reservation-v4.js'
      )
    >();
    return {
      ...actual,
      assertValidityApplicationPooledReserveMintReservationV4Request:
        mocks.assertReservationRequest,
    };
  },
);

vi.mock(
  './native-finalized-pooled-reserve-mint-reservation-state-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './native-finalized-pooled-reserve-mint-reservation-state-v4.js'
      )
    >();
    return {
      ...actual,
      assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerifierProvenance:
        mocks.assertVerifier,
      assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerificationFromVerifierProvenance:
        mocks.assertVerification,
    };
  },
);

import {
  AUTHENTICATED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_SCHEMA,
  assertAuthenticatedPooledReserveMintReservationStateV4Provenance,
  collectAuthenticatedPooledReserveMintReservationStateV4,
} from './native-pooled-reserve-mint-reservation-state-v4-proof-collector.js';
import type {
  AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier,
} from './native-finalized-pooled-reserve-mint-reservation-state-v4.js';
import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';
import type {
  ValidityApplicationPooledReserveMintReservationV4Request,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const vector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json',
    import.meta.url,
  ),
  'utf8',
)) as {
  readonly expected: {
    readonly statementHex: string;
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
  };
};

const hash = (byte: string): string => `0x${byte.repeat(64)}`;
const keys = derivePooledReserveMintReservationRuntimeStorageKeysV4(
  vector.expected.reservationKeyHex,
);
const reservationRequest = Object.freeze({
  statementHex: vector.expected.statementHex,
  statementIdHex: vector.expected.statementIdHex,
  reservationKeyHex: vector.expected.reservationKeyHex,
  provenance: Object.freeze({
    admissionCandidateDigestHex: hash('5'),
  }),
}) as unknown as
Readonly<ValidityApplicationPooledReserveMintReservationV4Request>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.collectFinality.mockResolvedValue(finalityMaterial());
  mocks.requestStateProof.mockResolvedValue({
    atNativeBlockHashHex: hash('c').slice(2),
    storageKeysHex: [
      keys.runtimeCodeStorageKeyHex,
      keys.currentProfileStorageKeyHex,
      keys.enforcementStorageKeyHex,
      keys.pendingKeysStorageKeyHex,
      keys.pendingReservationStorageKeyHex,
      keys.consumedReservationStorageKeyHex,
      keys.invalidatedReservationStorageKeyHex,
    ],
    reservationStorageKeys: keys,
    proofNodesHex: ['0102', '0304'],
    proofBytes: 4,
  });
});

describe('authenticated pooled-reserve reservation-state V4 collection', () => {
  it('collects one exact seven-key proof and returns no funds authority', async () => {
    const verify = vi.fn(async () => verificationResult());
    const verifier = fakeVerifier(verify);

    const result =
      await collectAuthenticatedPooledReserveMintReservationStateV4({
        rpc: {} as never,
        codec: {} as never,
        trustAnchor: finalityMaterial().trustAnchor,
        targetNativeBlockHashHex: hash('c'),
        reservationRequest,
        expectedRuntimeCodeSha256Hex: hash('9'),
        expectedRuntimeCodeBytes: 1234,
        trustedAnchorDigestHex: hash('6'),
        verifier,
      });

    expect(mocks.assertReservationRequest)
      .toHaveBeenCalledWith(reservationRequest);
    expect(mocks.assertVerifier).toHaveBeenCalledWith(verifier);
    expect(mocks.requestStateProof).toHaveBeenCalledWith(
      finalityMaterial().rpc,
      {
        nativeBlockHashHex: hash('c'),
        reservationKeyHex: vector.expected.reservationKeyHex,
      },
    );
    expect(verify).toHaveBeenCalledOnce();
    const wireRequest = result.collection.request;
    expect(wireRequest.statement).toMatchObject({
      bridgeRuntimeCodeSha256Hex: hash('9'),
      bridgeRuntimeCodeBytes: '1234',
      currentProfileStorageKeyHex: keys.currentProfileStorageKeyHex,
      pendingReservationStorageKeyHex:
        keys.pendingReservationStorageKeyHex,
    });
    expect(wireRequest.statement).not.toHaveProperty(
      'runtimeCodeStorageKeyHex',
    );
    expect(wireRequest.reservationStateProofNodesHex).toEqual([
      '0x0102',
      '0x0304',
    ]);
    expect(mocks.assertVerification).toHaveBeenCalledWith({
      verifier,
      verification: result.verification,
      expectedRequestDigestHex: expect.stringMatching(/^0x[0-9a-f]{64}$/),
    });
    expect(result.schema).toBe(
      AUTHENTICATED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_SCHEMA,
    );
    expect(result.boundary).toEqual({
      readOnlyRpc: true,
      sameProcessReservationRequestVerified: true,
      sidechainFinalityVerified: true,
      runtimeCodeStateProofVerified: true,
      reservationStateProofVerified: true,
      localPersistenceConsulted: false,
      localJournalAuthoritative: false,
      mintAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessVerified: false,
    });
    expect(() =>
      assertAuthenticatedPooledReserveMintReservationStateV4Provenance(result)
    ).not.toThrow();
    expect(() =>
      assertAuthenticatedPooledReserveMintReservationStateV4Provenance({
        ...result,
      })
    ).toThrow(/provenance is missing/i);
    expect(() =>
      assertAuthenticatedPooledReserveMintReservationStateV4Provenance(
        structuredClone(result),
      )
    ).toThrow(/provenance is missing/i);
  });

  it('requires same-process reservation and verifier provenance before RPC', async () => {
    mocks.assertReservationRequest.mockImplementationOnce(() => {
      throw new Error('same-process reservation request is missing');
    });
    await expect(
      collectAuthenticatedPooledReserveMintReservationStateV4({
        rpc: {} as never,
        codec: {} as never,
        trustAnchor: finalityMaterial().trustAnchor,
        targetNativeBlockHashHex: hash('c'),
        reservationRequest,
        expectedRuntimeCodeSha256Hex: hash('9'),
        expectedRuntimeCodeBytes: 1234,
        trustedAnchorDigestHex: hash('6'),
        verifier: fakeVerifier(),
      }),
    ).rejects.toThrow(/same-process reservation request is missing/i);
    expect(mocks.collectFinality).not.toHaveBeenCalled();
    expect(mocks.requestStateProof).not.toHaveBeenCalled();

    mocks.assertVerifier.mockImplementationOnce(() => {
      throw new Error('authority verifier provenance is missing');
    });
    await expect(
      collectAuthenticatedPooledReserveMintReservationStateV4({
        rpc: {} as never,
        codec: {} as never,
        trustAnchor: finalityMaterial().trustAnchor,
        targetNativeBlockHashHex: hash('c'),
        reservationRequest,
        expectedRuntimeCodeSha256Hex: hash('9'),
        expectedRuntimeCodeBytes: 1234,
        trustedAnchorDigestHex: hash('6'),
        verifier: fakeVerifier(),
      }),
    ).rejects.toThrow(/authority verifier provenance is missing/i);
    expect(mocks.collectFinality).not.toHaveBeenCalled();
    expect(mocks.requestStateProof).not.toHaveBeenCalled();
  });
});

function finalityMaterial() {
  return {
    rpc: Object.freeze({}),
    codec: Object.freeze({}),
    trustAnchor: {
      sidechainIdHex: hash('2'),
      checkpointHashHex: hash('a'),
      checkpointNumber: '10',
      grandpaSetId: '7',
      authorityListScaleHex: '0x0102',
    },
    targetHash: hash('c'),
    targetParentHash: hash('a'),
    targetHeaderScaleHex: '0x0102',
    linkedGrandpaProofs: [],
    checkpointTailHeadersScaleHex: [],
    finalityProofScaleHex: '0x0304',
    acquisition: {
      finalizedHeadHashHex: hash('d'),
      finalizedHeadNumber: '13',
      targetHashHex: hash('c'),
      targetNumber: '11',
      linkedProofCount: 0,
      ancestryHeaderCount: 0,
      finalityHorizonHashHex: hash('d'),
      finalityHorizonNumber: '13',
      codecExecutableSha256Hex: hash('e'),
      codecExecutableInvocationSha256Hex: {
        encodeHeaders: hash('1'),
        inspectWarpProof: hash('2'),
        inspectFinalityProof: hash('3'),
      },
    },
    accountMaterial: vi.fn(),
    checkDeadline: vi.fn(),
  };
}

function fakeVerifier(
  verify = vi.fn(async () => verificationResult()),
): AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier {
  return {
    executableSha256Hex: hash('8'),
    executionPolicySha256: 'ab'.repeat(32),
    executionBoundary: {
      mode:
        'source-refreshed-authority-contained-non-authorizing-proof-only',
      sourceOwnedAttestorLockReloadedPerLaunch: true,
      executionPolicyValidatedPerLaunch: true,
      containedProcessRequired: true,
      runtimeCodeStateProofRequired: true,
      independentRuntimeBuildProvenanceVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
    },
    deriveExecutableInvocationSha256Hex: vi.fn(() => hash('7')),
    verify,
  };
}

function verificationResult() {
  return {
    schema:
      'e2s.native-finalized-pooled-reserve-mint-reservation-state-verification.v4',
    status: 'VERIFIED_RELATIVE_TO_SUPPLIED_TRUST_ROOT_DIGEST',
    requestDigestHex: hash('4'),
    trustAnchorDigestHex: hash('6'),
    target: {
      nativeBlockHashHex: hash('c'),
      nativeHeight: '11',
      stateRootHex: hash('e'),
    },
    authority: {
      finalitySigningSetId: '7',
      finalitySigningAuthorityListScaleHex: '0x0102',
      finalitySigningAuthoritySetHashHex: hash('1'),
      transitionCount: 0,
      linkedAncestryVerified: true,
    },
    finality: {
      horizonHashHex: hash('d'),
      horizonHeight: '13',
      canonicalJustificationScaleHex: '0x0304',
      verified: true,
    },
    reservationState: {
      status: 'absent',
      statementIdHex: vector.expected.statementIdHex,
      reservationKeyHex: vector.expected.reservationKeyHex,
      profileIdHex: hash('3'),
      profileScaleHex: '0x04',
      pendingKeyCount: 0,
      pendingIndexContainsTarget: false,
      lifecycleRecordScaleHex: null,
      bridgeRuntimeCodeSha256Hex: hash('9'),
      bridgeRuntimeCodeBytes: '1234',
      runtimeCodeStateProofVerified: true,
      proofNodeCount: 2,
      proofBytes: 4,
      sevenKeyStateProofVerified: true,
      nonAuthorizing: true,
    },
    boundary: {
      mintAuthorized: false,
      signingEnabled: false,
      submissionEnabled: false,
      broadcastEnabled: false,
      runtimeMutationEnabled: false,
      independentRuntimeBuildProvenanceVerified: false,
      gate5Closed: false,
      trustlessOperationVerified: false,
      productionReadinessClaimed: false,
    },
  } as never;
}
