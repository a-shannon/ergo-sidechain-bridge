import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { describe, expect, it, vi } from 'vitest';

const authorityMocks = vi.hoisted(() => ({
  assertAuthority: vi.fn(),
  assertResult: vi.fn(),
}));

vi.mock('./native-peg-in-verifier-execution-authority.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-peg-in-verifier-execution-authority.js')
  >();
  return {
    ...actual,
    assertNativePegInVerifierExecutionAuthorityProvenance:
      authorityMocks.assertAuthority,
    assertNativePegInVerifierExecutionAuthorityResultProvenance:
      authorityMocks.assertResult,
  };
});

import {
  NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
  deriveNativeGrandpaAuthoritySetHashHex,
  deriveNativeGrandpaTrustAnchorDigestHex,
  type NativeFinalizedBridgeCheckpointRequest,
} from './native-finalized-bridge-checkpoint.js';
import {
  NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA,
  NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATUS,
  NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_VERIFICATION_SCHEMA,
  POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATEMENT_SCHEMA,
  assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerificationFromVerifierProvenance,
  createAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier,
  deriveNativeFinalizedPooledReserveMintReservationStateV4RequestDigestHex,
  normalizeNativeFinalizedPooledReserveMintReservationStateV4Request,
  validateNativeFinalizedPooledReserveMintReservationStateV4PayloadBindings,
} from './native-finalized-pooled-reserve-mint-reservation-state-v4.js';
import type {
  NativePegInVerifierExecutionAuthority,
} from './native-peg-in-verifier-execution-authority.js';
import { decodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_ID_DOMAIN,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import type {
  ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const vector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json',
    import.meta.url,
  ),
  'utf8',
)) as {
  readonly statement:
    ValidityApplicationPooledReserveMintReservationStatementV4;
  readonly expected: {
    readonly statementHex: string;
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
  };
};

const sourceIntent = decodePegInSourceIntentV2Hex(
  vector.statement.sourceIntentHex,
);
const hash = (byte: string): string => `0x${byte.repeat(64)}`;
const trustAnchor = {
  sidechainIdHex: sourceIntent.sidechainIdHex,
  checkpointHashHex: hash('a'),
  checkpointNumber: '10',
  grandpaSetId: '7',
  authorityListScaleHex: `0x04${'21'.repeat(32)}0100000000000000`,
} as const;
const runtimeCodeSha256Hex = hash('9');
const runtimeCodeBytes = '1234';
const bridgeContractRuntimeCodeSha256Hex = hash('b');
const bridgeContractRuntimeCodeBytes = 4096;
const tokenContractRuntimeCodeSha256Hex = hash('c');
const tokenContractRuntimeCodeBytes = 2048;
const profileScaleHex = buildRuntimeProfileScaleHex();
const profileIdHex =
  derivePooledReserveMintReservationRuntimeProfileV4IdHex(
    profileScaleHex,
  );

describe('native finalized pooled-reserve reservation-state V4', () => {
  it('normalizes the exact direct-finality request and rejects key substitution', () => {
    const request = buildRequest();

    expect(request.statement.bridgeRuntimeCodeBytes).toBe(runtimeCodeBytes);
    expect(request.statement).not.toHaveProperty('runtimeCodeStorageKeyHex');
    expect(request.reservationStateProofNodesHex).toEqual([
      '0x0102',
      '0x0304',
    ]);
    expect(Object.isFrozen(request)).toBe(true);

    const wrongKey = structuredClone(request) as unknown as {
      statement: { pendingReservationStorageKeyHex: string };
    };
    wrongKey.statement.pendingReservationStorageKeyHex = hash('f');
    expect(() =>
      normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(
        wrongKey,
      ),
    ).toThrow(/deterministic V4 key/i);

    const numericRuntimeLength = structuredClone(request) as unknown as {
      statement: { bridgeRuntimeCodeBytes: number };
    };
    numericRuntimeLength.statement.bridgeRuntimeCodeBytes = 1234;
    expect(() =>
      normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(
        numericRuntimeLength,
      ),
    ).toThrow(/canonical decimal/i);

    const runtimeSizedProof = structuredClone(request) as unknown as {
      reservationStateProofNodesHex: string[];
    };
    runtimeSizedProof.reservationStateProofNodesHex = [
      `0x${'ab'.repeat(300 * 1024)}`,
    ];
    expect(
      normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(
        runtimeSizedProof,
      ).reservationStateProofNodesHex[0],
    ).toHaveLength(2 + 2 * 300 * 1024);

    const duplicateProof = structuredClone(request) as unknown as {
      reservationStateProofNodesHex: string[];
    };
    duplicateProof.reservationStateProofNodesHex = ['0x0102', '0x0102'];
    expect(() =>
      normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(
        duplicateProof,
      ),
    ).toThrow(/duplicate nodes/i);
  });

  it('validates the authenticated pending record and all non-authority boundaries', () => {
    const request = buildRequest();
    const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
    const trustedAnchorDigestHex =
      deriveNativeGrandpaTrustAnchorDigestHex(commonRequest(request));
    const verification = buildVerification(requestBytes);

    const result =
      validateNativeFinalizedPooledReserveMintReservationStateV4PayloadBindings({
        requestBytes,
        trustedAnchorDigestHex,
        verification,
      });

    expect(result.reservationState).toMatchObject({
      status: 'pending',
      statementIdHex: vector.expected.statementIdHex,
      reservationKeyHex: vector.expected.reservationKeyHex,
      profileIdHex,
      pendingKeyCount: 1,
      pendingIndexContainsTarget: true,
      bridgeRuntimeCodeSha256Hex: runtimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: runtimeCodeBytes,
      runtimeCodeStateProofVerified: true,
      sevenKeyStateProofVerified: true,
      nonAuthorizing: true,
    });
    expect(result.boundary).toEqual({
      mintAuthorized: false,
      signingEnabled: false,
      submissionEnabled: false,
      broadcastEnabled: false,
      runtimeMutationEnabled: false,
      independentRuntimeBuildProvenanceVerified: false,
      gate5Closed: false,
      trustlessOperationVerified: false,
      productionReadinessClaimed: false,
    });
    expect(Object.isFrozen(result.reservationState)).toBe(true);
  });

  it('rejects runtime substitution, lifecycle/index disagreement, and claim widening', () => {
    const request = buildRequest();
    const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
    const trustedAnchorDigestHex =
      deriveNativeGrandpaTrustAnchorDigestHex(commonRequest(request));

    const runtimeSubstitution = buildVerification(requestBytes);
    runtimeSubstitution.reservationState.bridgeRuntimeCodeSha256Hex = hash('8');
    expect(() =>
      validateNativeFinalizedPooledReserveMintReservationStateV4PayloadBindings({
        requestBytes,
        trustedAnchorDigestHex,
        verification: runtimeSubstitution,
      }),
    ).toThrow(/runtime code digest differs/i);

    const indexDisagreement = buildVerification(requestBytes);
    indexDisagreement.reservationState.pendingIndexContainsTarget = false;
    expect(() =>
      validateNativeFinalizedPooledReserveMintReservationStateV4PayloadBindings({
        requestBytes,
        trustedAnchorDigestHex,
        verification: indexDisagreement,
      }),
    ).toThrow(/lifecycle and pending-index membership disagree/i);

    const widenedBoundary = buildVerification(requestBytes);
    widenedBoundary.boundary.gate5Closed = true;
    expect(() =>
      validateNativeFinalizedPooledReserveMintReservationStateV4PayloadBindings({
        requestBytes,
        trustedAnchorDigestHex,
        verification: widenedBoundary,
      }),
    ).toThrow(/Gate 5 boundary/i);
  });

  it.each([
    {
      label: 'zero bridge-code digest',
      mutate: (bytes: Buffer) => bytes.fill(0, 137, 169),
      expected: /bridge runtime code digest must not be zero/i,
    },
    {
      label: 'zero bridge-code length',
      mutate: (bytes: Buffer) => bytes.writeUInt32LE(0, 169),
      expected: /bridge runtime code bytes must be a positive uint32/i,
    },
    {
      label: 'zero token-code digest',
      mutate: (bytes: Buffer) => bytes.fill(0, 173, 205),
      expected: /token runtime code digest must not be zero/i,
    },
    {
      label: 'zero token-code length',
      mutate: (bytes: Buffer) => bytes.writeUInt32LE(0, 205),
      expected: /token runtime code bytes must be a positive uint32/i,
    },
    {
      label: 'one-byte offset shift after the bridge-code digest',
      mutate: (bytes: Buffer) => {
        bytes.copyWithin(170, 169, bytes.length - 1);
        bytes[169] = 0;
      },
      expected: /profile differs from the statement or target/i,
    },
  ])('rejects $label in the finalized V4 profile', ({
    mutate,
    expected,
  }) => {
    const request = buildRequest();
    const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
    const trustedAnchorDigestHex =
      deriveNativeGrandpaTrustAnchorDigestHex(commonRequest(request));
    const verification = buildVerification(requestBytes);
    const profileBytes = hexBytes(
      verification.reservationState.profileScaleHex,
    );
    mutate(profileBytes);
    verification.reservationState.profileScaleHex =
      `0x${profileBytes.toString('hex')}`;
    verification.reservationState.profileIdHex = blake2b256Hex(Buffer.concat([
      Buffer.from(
        POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_ID_DOMAIN,
        'ascii',
      ),
      profileBytes,
    ]));

    expect(() =>
      validateNativeFinalizedPooledReserveMintReservationStateV4PayloadBindings({
        requestBytes,
        trustedAnchorDigestHex,
        verification,
      }),
    ).toThrow(expected);
  });

  it('binds successful verification to the contained authority and exact operation', async () => {
    const request = buildRequest();
    const trustedAnchorDigestHex =
      deriveNativeGrandpaTrustAnchorDigestHex(commonRequest(request));
    const execute = vi.fn(async (input: {
      operation: string;
      trustedAnchorDigestHex: string;
      requestBytes: Buffer;
    }) => authorityResult(
      input.operation,
      buildVerification(input.requestBytes),
    ));
    const authority = {
      declaration: authorityDeclaration(),
      execute,
    } as unknown as NativePegInVerifierExecutionAuthority;
    const verifier =
      createAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier(
        authority,
      );

    const result = await verifier.verify({
      trustedAnchorDigestHex,
      request,
    });
    const requestDigestHex =
      deriveNativeFinalizedPooledReserveMintReservationStateV4RequestDigestHex(
        request,
      );

    expect(authorityMocks.assertAuthority).toHaveBeenCalledWith(authority);
    expect(authorityMocks.assertResult).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'verify-pooled-reserve-mint-reservation-state-v4',
      trustedAnchorDigestHex,
    }));
    expect(result.requestDigestHex).toBe(requestDigestHex);
    expect(() =>
      assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerificationFromVerifierProvenance({
        verifier,
        verification: result,
        expectedRequestDigestHex: requestDigestHex,
      }),
    ).not.toThrow();
    expect(() =>
      assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerificationFromVerifierProvenance({
        verifier,
        verification: structuredClone(result),
        expectedRequestDigestHex: requestDigestHex,
      }),
    ).toThrow(/provenance is missing/i);
  });
});

function buildRequest() {
  const keys =
    derivePooledReserveMintReservationRuntimeStorageKeysV4(
      vector.expected.reservationKeyHex,
    );
  return normalizeNativeFinalizedPooledReserveMintReservationStateV4Request({
    schema:
      NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA,
    trustAnchor,
    targetNativeBlockHashHex: hash('c'),
    targetHeaderScaleHex: '0x0102',
    linkedGrandpaProofs: [],
    checkpointTailHeadersScaleHex: [],
    finalityProofScaleHex: '0x0506',
    statement: {
      schema: POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATEMENT_SCHEMA,
      statementHex: vector.expected.statementHex,
      statementIdHex: vector.expected.statementIdHex,
      reservationKeyHex: vector.expected.reservationKeyHex,
      bridgeRuntimeCodeSha256Hex: runtimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: runtimeCodeBytes,
      currentProfileStorageKeyHex: keys.currentProfileStorageKeyHex,
      enforcementStorageKeyHex: keys.enforcementStorageKeyHex,
      pendingKeysStorageKeyHex: keys.pendingKeysStorageKeyHex,
      pendingReservationStorageKeyHex:
        keys.pendingReservationStorageKeyHex,
      consumedReservationStorageKeyHex:
        keys.consumedReservationStorageKeyHex,
      invalidatedReservationStorageKeyHex:
        keys.invalidatedReservationStorageKeyHex,
    },
    reservationStateProofNodesHex: ['0x0102', '0x0304'],
  });
}

function buildVerification(requestBytes: Buffer) {
  const request =
    normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(
      JSON.parse(requestBytes.toString('utf8')),
    );
  const trustAnchorDigestHex =
    deriveNativeGrandpaTrustAnchorDigestHex(commonRequest(request));
  return {
    schema:
      NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_VERIFICATION_SCHEMA,
    status:
      NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATUS,
    requestDigestHex: blake2b256Hex(requestBytes),
    trustAnchorDigestHex,
    target: {
      nativeBlockHashHex: request.targetNativeBlockHashHex,
      nativeHeight: '11',
      stateRootHex: hash('e'),
    },
    authority: {
      finalitySigningSetId: trustAnchor.grandpaSetId,
      finalitySigningAuthorityListScaleHex:
        trustAnchor.authorityListScaleHex,
      finalitySigningAuthoritySetHashHex:
        deriveNativeGrandpaAuthoritySetHashHex(
          trustAnchor.authorityListScaleHex,
        ),
      transitionCount: 0,
      linkedAncestryVerified: true,
    },
    finality: {
      horizonHashHex: hash('d'),
      horizonHeight: '13',
      canonicalJustificationScaleHex: '0x0708',
      verified: true,
    },
    reservationState: {
      status: 'pending',
      statementIdHex: vector.expected.statementIdHex,
      reservationKeyHex: vector.expected.reservationKeyHex,
      profileIdHex,
      profileScaleHex,
      pendingKeyCount: 1,
      pendingIndexContainsTarget: true,
      lifecycleRecordScaleHex: buildPendingLifecycleRecordHex(),
      bridgeRuntimeCodeSha256Hex: runtimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: runtimeCodeBytes,
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
  };
}

function buildRuntimeProfileScaleHex(): string {
  return encodePooledReserveMintReservationRuntimeProfileV4ScaleHex({
    formatVersion: 4,
    lineageProfileIdHex: vector.statement.lineageProfileIdHex,
    sourceNetworkIdHex: sourceIntent.sourceNetworkIdHex,
    sidechainIdHex: sourceIntent.sidechainIdHex,
    bridgeAddressHex: sourceIntent.bridgeAddressHex,
    tokenAddressHex: sourceIntent.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: bridgeContractRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes: bridgeContractRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex: tokenContractRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes: tokenContractRuntimeCodeBytes,
    settlementProfileIdHex: sourceIntent.settlementProfileIdHex,
    ergoDepositFinalityPolicyIdHex:
      vector.statement.ergoDepositFinalityPolicyIdHex,
    sourceProofSystemIdHex: hash('7'),
    sourceProofProfileIdHex: hash('8'),
    activationHeight: '1',
    maxPendingBlocks: 20,
  });
}

function buildPendingLifecycleRecordHex(): string {
  const issued = Buffer.alloc(8);
  issued.writeBigUInt64LE(2n);
  const reserved = Buffer.alloc(8);
  reserved.writeBigUInt64LE(3n);
  const expires = Buffer.alloc(8);
  expires.writeBigUInt64LE(10n);
  const statementBytes = hexBytes(vector.expected.statementHex);
  return `0x${Buffer.concat([
    Buffer.from([4]),
    hexBytes(profileIdHex),
    Buffer.from([0x6d, 0x09]),
    statementBytes,
    hexBytes(vector.expected.statementIdHex),
    hexBytes(vector.expected.reservationKeyHex),
    hexBytes(blake2b256Hex(statementBytes)),
    Buffer.alloc(32, 0x77),
    Buffer.alloc(32, 0x88),
    issued,
    Buffer.alloc(32, 0x91),
    Buffer.alloc(32, 0x92),
    Buffer.alloc(32, 0x93),
    reserved,
    expires,
  ]).toString('hex')}`;
}

function commonRequest(
  request: ReturnType<typeof buildRequest>,
): NativeFinalizedBridgeCheckpointRequest {
  return {
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: request.trustAnchor,
    targetNativeBlockHashHex: request.targetNativeBlockHashHex,
    targetHeaderScaleHex: request.targetHeaderScaleHex,
    linkedGrandpaProofs: request.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: [
      ...request.checkpointTailHeadersScaleHex,
    ],
    finalityProofScaleHex: request.finalityProofScaleHex,
    runtimeStateProofNodesHex: [
      ...request.reservationStateProofNodesHex,
    ],
  };
}

function authorityDeclaration() {
  return {
    operation:
      'verify-pooled-reserve-mint-reservation-state-v4' as const,
    profileId: 'peg-in-profile',
    attestationId: 'peg-in-attestation',
    policyId: 'peg-in-policy',
    executionPolicySha256: 'ab'.repeat(32),
    policyEpoch: 7,
    launcherPath: 'launcher.exe',
    verifierExecutablePath: 'verifier.exe',
    codecExecutablePath: 'codec.exe',
    verifierExecutableSha256Hex: hash('4'),
  };
}

function authorityResult(operation: string, verification: unknown) {
  const declaration = authorityDeclaration();
  return {
    stdout: Buffer.from(JSON.stringify(verification), 'utf8'),
    profileId: declaration.profileId,
    attestationId: declaration.attestationId,
    policyId: declaration.policyId,
    executionPolicySha256: declaration.executionPolicySha256,
    policyEpoch: declaration.policyEpoch,
    operation,
    boundary: {
      sourceOwnedAttestorLockReloaded: true as const,
      sourceOwnedAttestorLockRevalidatedAfterExecution: true as const,
      reviewedTrustRootsRequired: true as const,
      exactPegInPolicyValidatedAfterReload: true as const,
      exactPegInPolicyRevalidatedAfterExecution: true as const,
      brokerAuthorityModeRequested: true as const,
      directProcessAllowed: false as const,
      pegInConformanceAttested: false as const,
      runtimeCodeIdentityVerified: false as const,
      mintAuthorityGranted: false as const,
      settlementAuthorityGranted: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
}

function blake2b256Hex(value: Uint8Array): string {
  return `0x${Buffer.from(
    blakejs.blake2b(value, undefined, 32),
  ).toString('hex')}`;
}

function hexBytes(value: string): Buffer {
  return Buffer.from(value.slice(2), 'hex');
}
