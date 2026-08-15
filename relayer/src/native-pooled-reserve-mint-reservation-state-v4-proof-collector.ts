import {
  NativeCheckpointCollectionDriftError,
  collectNativeFinalityMaterial,
  type CollectNativeCheckpointRequestInput,
} from './native-checkpoint-proof-collector.js';
import {
  assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerificationFromVerifierProvenance,
  assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerifierProvenance,
  deriveNativeFinalizedPooledReserveMintReservationStateV4RequestDigestHex,
  normalizeNativeFinalizedPooledReserveMintReservationStateV4Request,
  type AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verification,
  type AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier,
  type NativeFinalizedPooledReserveMintReservationStateV4Request,
} from './native-finalized-pooled-reserve-mint-reservation-state-v4.js';
import {
  requestPooledReserveMintReservationStateReadProofV4,
} from './substrate-finality-provider.js';
import {
  assertValidityApplicationPooledReserveMintReservationV4Request,
  type ValidityApplicationPooledReserveMintReservationV4Request,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

export const COLLECTED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA =
  'e2s.collected-pooled-reserve-mint-reservation-state-request.v4' as const;
export const AUTHENTICATED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_SCHEMA =
  'e2s.authenticated-pooled-reserve-mint-reservation-state.v4' as const;

const STATEMENT_SCHEMA =
  'e2s.pooled-reserve-mint-reservation-state-statement.v4' as const;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS = 3;
const MAX_RUNTIME_CODE_BYTES = 4 * 1024 * 1024;
const AUTHENTICATED_RESERVATION_STATE_RESULTS_V4 = new WeakSet<object>();

export interface CollectAuthenticatedPooledReserveMintReservationStateV4Input
  extends CollectNativeCheckpointRequestInput {
  readonly reservationRequest:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>;
  readonly expectedRuntimeCodeSha256Hex: string;
  readonly expectedRuntimeCodeBytes: number;
  readonly trustedAnchorDigestHex: string;
  readonly verifier:
    AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier;
  readonly maxAttempts?: number;
}

export interface CollectedPooledReserveMintReservationStateV4Request {
  readonly schema:
    typeof COLLECTED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA;
  readonly request:
    Readonly<NativeFinalizedPooledReserveMintReservationStateV4Request>;
  readonly source: {
    readonly admissionCandidateDigestHex: string;
    readonly reservationStatementIdHex: string;
    readonly reservationKeyHex: string;
    readonly sameProcessReservationRequestVerified: true;
  };
  readonly acquisition: {
    readonly finalizedHeadHashHex: string;
    readonly finalizedHeadNumber: string;
    readonly targetHashHex: string;
    readonly targetNumber: string;
    readonly linkedProofCount: number;
    readonly ancestryHeaderCount: number;
    readonly finalityHorizonHashHex: string;
    readonly finalityHorizonNumber: string;
    readonly reservationStateProofNodeCount: number;
    readonly reservationStateProofBytes: number;
    readonly codecExecutableSha256Hex: string;
    readonly codecExecutableInvocationSha256Hex: {
      readonly encodeHeaders: string;
      readonly inspectWarpProof: string;
      readonly inspectFinalityProof: string;
    };
    readonly rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getReadProof',
    ];
  };
  readonly boundary: {
    readonly readOnlyRpc: true;
    readonly candidatePackageOnly: true;
    readonly sidechainFinalityVerified: false;
    readonly runtimeCodeStateProofVerified: false;
    readonly reservationStateProofVerified: false;
    readonly localPersistenceConsulted: false;
    readonly mintAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly gate5Closed: false;
    readonly productionReadinessVerified: false;
  };
}

export interface AuthenticatedPooledReserveMintReservationStateV4 {
  readonly schema:
    typeof AUTHENTICATED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_SCHEMA;
  readonly attemptCount: number;
  readonly collection: CollectedPooledReserveMintReservationStateV4Request;
  readonly verification:
    AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verification;
  readonly nativeExecutablePins: {
    readonly codecSha256Hex: string;
    readonly codecInvocationSha256Hex: {
      readonly encodeHeaders: string;
      readonly inspectWarpProof: string;
      readonly inspectFinalityProof: string;
    };
    readonly verifierSha256Hex: string;
    readonly verifierInvocationSha256Hex: string;
    readonly verifierExecutionPolicySha256: string;
  };
  readonly boundary: {
    readonly readOnlyRpc: true;
    readonly sameProcessReservationRequestVerified: true;
    readonly sidechainFinalityVerified: true;
    readonly runtimeCodeStateProofVerified: true;
    readonly reservationStateProofVerified: true;
    readonly localPersistenceConsulted: false;
    readonly localJournalAuthoritative: false;
    readonly mintAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessVerified: false;
  };
}

/**
 * Collect and authenticate the exact V4 reservation state under one finalized
 * native state root. The returned lifecycle classification grants no funds
 * authority and is not persisted by this boundary.
 */
export async function collectAuthenticatedPooledReserveMintReservationStateV4(
  input: CollectAuthenticatedPooledReserveMintReservationStateV4Input,
): Promise<AuthenticatedPooledReserveMintReservationStateV4> {
  assertValidityApplicationPooledReserveMintReservationV4Request(
    input?.reservationRequest,
  );
  assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerifierProvenance(
    input?.verifier,
  );
  const sourceSnapshot = snapshotReservationRequest(input.reservationRequest);
  const expectedRuntimeCodeSha256Hex = nonzeroSha256Hex(
    input?.expectedRuntimeCodeSha256Hex,
    'expected pooled-reserve runtime code SHA-256',
  );
  const expectedRuntimeCodeBytes = boundedPositiveInteger(
    input?.expectedRuntimeCodeBytes,
    1,
    MAX_RUNTIME_CODE_BYTES,
    'expected pooled-reserve runtime code bytes',
  );
  const maxAttempts = boundedPositiveInteger(
    input?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    1,
    MAX_ATTEMPTS,
    'pooled-reserve reservation-state collection attempts',
  );
  const verifierSha256Hex = nonzeroSha256Hex(
    input.verifier.executableSha256Hex,
    'pooled-reserve reservation-state verifier executable SHA-256',
  );
  const verifierInvocationSha256Hex = nonzeroSha256Hex(
    input.verifier.deriveExecutableInvocationSha256Hex(
      input.trustedAnchorDigestHex,
    ),
    'pooled-reserve reservation-state verifier invocation SHA-256',
  );
  const verifierExecutionPolicySha256 = nonzeroSha256Hex(
    `0x${input.verifier.executionPolicySha256}`,
    'pooled-reserve reservation-state verifier policy SHA-256',
  ).slice(2);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const material = await collectNativeFinalityMaterial(input);
      const stateProof =
        await requestPooledReserveMintReservationStateReadProofV4(
          material.rpc,
          {
            nativeBlockHashHex: material.targetHash,
            reservationKeyHex: sourceSnapshot.reservationKeyHex,
          },
        );
      for (const [nodeIndex, node] of stateProof.proofNodesHex.entries()) {
        material.accountMaterial(
          `0x${node}`,
          `pooled-reserve reservation-state proof node ${nodeIndex}`,
        );
      }
      material.checkDeadline();
      assertUnchangedReservationRequest(input.reservationRequest, sourceSnapshot);

      const keys = stateProof.reservationStorageKeys;
      const request =
        normalizeNativeFinalizedPooledReserveMintReservationStateV4Request({
          schema:
            'e2s.native-finalized-pooled-reserve-mint-reservation-state-request.v4',
          trustAnchor: material.trustAnchor,
          targetNativeBlockHashHex: material.targetHash,
          targetHeaderScaleHex: material.targetHeaderScaleHex,
          linkedGrandpaProofs: material.linkedGrandpaProofs,
          checkpointTailHeadersScaleHex:
            material.checkpointTailHeadersScaleHex,
          finalityProofScaleHex: material.finalityProofScaleHex,
          statement: {
            schema: STATEMENT_SCHEMA,
            statementHex: sourceSnapshot.statementHex,
            statementIdHex: sourceSnapshot.statementIdHex,
            reservationKeyHex: sourceSnapshot.reservationKeyHex,
            bridgeRuntimeCodeSha256Hex: expectedRuntimeCodeSha256Hex,
            bridgeRuntimeCodeBytes: String(expectedRuntimeCodeBytes),
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
          reservationStateProofNodesHex:
            stateProof.proofNodesHex.map(node => `0x${node}`),
        });
      const collection = deepFreeze({
        schema:
          COLLECTED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA,
        request,
        source: {
          admissionCandidateDigestHex:
            sourceSnapshot.admissionCandidateDigestHex,
          reservationStatementIdHex: sourceSnapshot.statementIdHex,
          reservationKeyHex: sourceSnapshot.reservationKeyHex,
          sameProcessReservationRequestVerified: true as const,
        },
        acquisition: {
          ...material.acquisition,
          reservationStateProofNodeCount: stateProof.proofNodesHex.length,
          reservationStateProofBytes: stateProof.proofBytes,
          rpcMethods: [
            'chain_getBlockHash',
            'chain_getFinalizedHead',
            'chain_getHeader',
            'bridge_grandpaWarpProof',
            'grandpa_proveFinality',
            'state_getReadProof',
          ] as const,
        },
        boundary: {
          readOnlyRpc: true as const,
          candidatePackageOnly: true as const,
          sidechainFinalityVerified: false as const,
          runtimeCodeStateProofVerified: false as const,
          reservationStateProofVerified: false as const,
          localPersistenceConsulted: false as const,
          mintAuthorized: false as const,
          signingAuthorized: false as const,
          submissionAuthorized: false as const,
          broadcastAuthorized: false as const,
          gate5Closed: false as const,
          productionReadinessVerified: false as const,
        },
      });
      const verification = await input.verifier.verify({
        trustedAnchorDigestHex: input.trustedAnchorDigestHex,
        request,
      });
      assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerificationFromVerifierProvenance({
        verifier: input.verifier,
        verification,
        expectedRequestDigestHex:
          deriveNativeFinalizedPooledReserveMintReservationStateV4RequestDigestHex(
            request,
          ),
      });
      assertUnchangedReservationRequest(input.reservationRequest, sourceSnapshot);

      const result = deepFreeze({
        schema: AUTHENTICATED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_SCHEMA,
        attemptCount: attempt,
        collection,
        verification,
        nativeExecutablePins: {
          codecSha256Hex: material.acquisition.codecExecutableSha256Hex,
          codecInvocationSha256Hex:
            material.acquisition.codecExecutableInvocationSha256Hex,
          verifierSha256Hex,
          verifierInvocationSha256Hex,
          verifierExecutionPolicySha256,
        },
        boundary: {
          readOnlyRpc: true as const,
          sameProcessReservationRequestVerified: true as const,
          sidechainFinalityVerified: true as const,
          runtimeCodeStateProofVerified: true as const,
          reservationStateProofVerified: true as const,
          localPersistenceConsulted: false as const,
          localJournalAuthoritative: false as const,
          mintAuthorized: false as const,
          signingAuthorized: false as const,
          submissionAuthorized: false as const,
          broadcastAuthorized: false as const,
          gate5Closed: false as const,
          trustlessStatusEstablished: false as const,
          productionReadinessVerified: false as const,
        },
      });
      AUTHENTICATED_RESERVATION_STATE_RESULTS_V4.add(result);
      return result;
    } catch (error) {
      if (
        !(error instanceof NativeCheckpointCollectionDriftError)
        || attempt === maxAttempts
      ) {
        throw error;
      }
    }
  }
  throw new Error(
    'pooled-reserve reservation-state collection exhausted its bounded attempts',
  );
}

export function assertAuthenticatedPooledReserveMintReservationStateV4Provenance(
  result: unknown,
): asserts result is AuthenticatedPooledReserveMintReservationStateV4 {
  if (
    typeof result !== 'object'
    || result === null
    || !AUTHENTICATED_RESERVATION_STATE_RESULTS_V4.has(result)
  ) {
    throw new Error(
      'authenticated pooled-reserve reservation-state V4 provenance is missing',
    );
  }
}

interface ReservationRequestSnapshot {
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly reservationKeyHex: string;
  readonly admissionCandidateDigestHex: string;
}

function snapshotReservationRequest(
  request: Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
): ReservationRequestSnapshot {
  return Object.freeze({
    statementHex: request.statementHex,
    statementIdHex: request.statementIdHex,
    reservationKeyHex: request.reservationKeyHex,
    admissionCandidateDigestHex: request.provenance.admissionCandidateDigestHex,
  });
}

function assertUnchangedReservationRequest(
  request: Readonly<ValidityApplicationPooledReserveMintReservationV4Request>,
  expected: ReservationRequestSnapshot,
): void {
  assertValidityApplicationPooledReserveMintReservationV4Request(request);
  const current = snapshotReservationRequest(request);
  if (
    current.statementHex !== expected.statementHex
    || current.statementIdHex !== expected.statementIdHex
    || current.reservationKeyHex !== expected.reservationKeyHex
    || current.admissionCandidateDigestHex
      !== expected.admissionCandidateDigestHex
  ) {
    throw new Error(
      'pooled-reserve mint-reservation request changed during collection',
    );
  }
}

function nonzeroSha256Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 32 lowercase 0x-prefixed bytes`);
  }
  if (/^0x0+$/.test(value)) {
    throw new Error(`${label} must not be zero`);
  }
  return value;
}

function boundedPositiveInteger(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < min
    || value > max
  ) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
