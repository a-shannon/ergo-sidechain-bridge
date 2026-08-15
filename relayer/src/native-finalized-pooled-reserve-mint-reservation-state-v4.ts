import blakejs from 'blakejs';
import { TextDecoder } from 'node:util';

import {
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
  NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
  deriveNativeGrandpaAuthoritySetHashHex,
  deriveNativeGrandpaTrustAnchorDigestHex,
  normalizeNativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointRequest,
} from './native-finalized-bridge-checkpoint.js';
import {
  deriveExecutableInvocationSha256Hex,
  normalizeExecutableSha256Hex,
} from './native-executable-pin.js';
import {
  assertNativePegInVerifierExecutionAuthorityProvenance,
  assertNativePegInVerifierExecutionAuthorityResultProvenance,
  type NativePegInVerifierExecutionAuthority,
} from './native-peg-in-verifier-execution-authority.js';
import { decodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
  MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_V4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import { parseStrictJson } from './strict-json.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

export const NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA =
  'e2s.native-finalized-pooled-reserve-mint-reservation-state-request.v4' as const;
export const POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATEMENT_SCHEMA =
  'e2s.pooled-reserve-mint-reservation-state-statement.v4' as const;
export const NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_VERIFICATION_SCHEMA =
  'e2s.native-finalized-pooled-reserve-mint-reservation-state-verification.v4' as const;
export const NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATUS =
  'VERIFIED_RELATIVE_TO_SUPPLIED_TRUST_ROOT_DIGEST' as const;

const MAX_RUNTIME_CODE_BYTES = 4 * 1024 * 1024;
const MAX_STATE_PROOF_BYTES = 8 * 1024 * 1024;
const MAX_STATE_PROOF_NODES = 512;
const MAX_STATE_PROOF_NODE_BYTES = 4 * 1024 * 1024;
const MAX_LIFECYCLE_RECORD_BYTES = 4 * 1024;
export const POOLED_RESERVE_MINT_RESERVATION_PENDING_LIFECYCLE_RECORD_V4_BYTES =
  918;
export const POOLED_RESERVE_MINT_RESERVATION_CONSUMED_LIFECYCLE_RECORD_V4_BYTES =
  173;
export const POOLED_RESERVE_MINT_RESERVATION_INVALIDATED_LIFECYCLE_RECORD_V4_BYTES =
  138;
const MAX_FINALITY_PROOF_BYTES = 4 * 1024 * 1024;
const FINALITY_SENTINEL_PROOF_NODE_HEX = '0x00';
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const AUTHORITY_VERIFIERS = new WeakSet<object>();
const AUTHORITY_VERIFICATIONS = new WeakMap<object, {
  readonly authority: NativePegInVerifierExecutionAuthority;
  readonly verifier:
    AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier;
  readonly requestDigestHex: string;
  readonly executionPolicySha256: string;
}>();
declare const AUTHORITY_VERIFICATION_BRAND: unique symbol;

export interface PooledReserveMintReservationStateStatementRequestV4 {
  readonly schema:
    typeof POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATEMENT_SCHEMA;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly reservationKeyHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: string;
  readonly currentProfileStorageKeyHex: string;
  readonly enforcementStorageKeyHex: string;
  readonly pendingKeysStorageKeyHex: string;
  readonly pendingReservationStorageKeyHex: string;
  readonly consumedReservationStorageKeyHex: string;
  readonly invalidatedReservationStorageKeyHex: string;
}

export interface NativeFinalizedPooledReserveMintReservationStateV4Request {
  readonly schema:
    typeof NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA;
  readonly trustAnchor: NativeFinalizedBridgeCheckpointRequest['trustAnchor'];
  readonly targetNativeBlockHashHex: string;
  readonly targetHeaderScaleHex: string;
  readonly linkedGrandpaProofs:
    NativeFinalizedBridgeCheckpointRequest['linkedGrandpaProofs'];
  readonly checkpointTailHeadersScaleHex: readonly string[];
  readonly finalityProofScaleHex: string;
  readonly statement: PooledReserveMintReservationStateStatementRequestV4;
  readonly reservationStateProofNodesHex: readonly string[];
}

export type PooledReserveMintReservationLifecycleStatusV4 =
  | 'absent'
  | 'pending'
  | 'consumed'
  | 'invalidated';

export interface NativeFinalizedPooledReserveMintReservationStateV4VerificationPayload {
  readonly schema:
    typeof NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_VERIFICATION_SCHEMA;
  readonly status:
    typeof NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly target: {
    readonly nativeBlockHashHex: string;
    readonly nativeHeight: string;
    readonly stateRootHex: string;
  };
  readonly authority: {
    readonly finalitySigningSetId: string;
    readonly finalitySigningAuthorityListScaleHex: string;
    readonly finalitySigningAuthoritySetHashHex: string;
    readonly transitionCount: number;
    readonly linkedAncestryVerified: true;
  };
  readonly finality: {
    readonly horizonHashHex: string;
    readonly horizonHeight: string;
    readonly canonicalJustificationScaleHex: string;
    readonly verified: true;
  };
  readonly reservationState: {
    readonly status: PooledReserveMintReservationLifecycleStatusV4;
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
    readonly profileIdHex: string;
    readonly profileScaleHex: string;
    readonly pendingKeyCount: number;
    readonly pendingIndexContainsTarget: boolean;
    readonly lifecycleRecordScaleHex: string | null;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: string;
    readonly runtimeCodeStateProofVerified: true;
    readonly proofNodeCount: number;
    readonly proofBytes: number;
    readonly sevenKeyStateProofVerified: true;
    readonly nonAuthorizing: true;
  };
  readonly boundary: {
    readonly mintAuthorized: false;
    readonly signingEnabled: false;
    readonly submissionEnabled: false;
    readonly broadcastEnabled: false;
    readonly runtimeMutationEnabled: false;
    readonly independentRuntimeBuildProvenanceVerified: false;
    readonly gate5Closed: false;
    readonly trustlessOperationVerified: false;
    readonly productionReadinessClaimed: false;
  };
}

export type AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verification =
  NativeFinalizedPooledReserveMintReservationStateV4VerificationPayload & {
    readonly [AUTHORITY_VERIFICATION_BRAND]: true;
  };

export interface AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier {
  readonly executableSha256Hex: string;
  readonly executionPolicySha256: string;
  readonly executionBoundary: {
    readonly mode:
      'source-refreshed-authority-contained-non-authorizing-proof-only';
    readonly sourceOwnedAttestorLockReloadedPerLaunch: true;
    readonly executionPolicyValidatedPerLaunch: true;
    readonly containedProcessRequired: true;
    readonly runtimeCodeStateProofRequired: true;
    readonly independentRuntimeBuildProvenanceVerified: false;
    readonly mintAuthorityGranted: false;
    readonly settlementAuthorityGranted: false;
    readonly gate5Closed: false;
  };
  deriveExecutableInvocationSha256Hex(trustedAnchorDigestHex: string): string;
  verify(input: {
    readonly trustedAnchorDigestHex: string;
    readonly request:
      NativeFinalizedPooledReserveMintReservationStateV4Request;
  }): Promise<
    AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verification
  >;
}

export function createAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier(
  authority: NativePegInVerifierExecutionAuthority,
): AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier {
  assertNativePegInVerifierExecutionAuthorityProvenance(authority);
  const declaration = authority.declaration;
  if (
    declaration.operation
    !== 'verify-pooled-reserve-mint-reservation-state-v4'
  ) {
    throw new Error(
      'pooled-reserve reservation-state V4 verifier authority does not authorize the exact operation',
    );
  }
  const executableSha256Hex = normalizeExecutableSha256Hex(
    declaration.verifierExecutableSha256Hex,
    'authority-bound pooled-reserve reservation-state verifier executable digest',
  );
  const executionPolicySha256 = sha256HexNoPrefix(
    declaration.executionPolicySha256,
    'authority-bound pooled-reserve reservation-state execution policy digest',
  );
  const executionBoundary = Object.freeze({
    mode:
      'source-refreshed-authority-contained-non-authorizing-proof-only' as const,
    sourceOwnedAttestorLockReloadedPerLaunch: true as const,
    executionPolicyValidatedPerLaunch: true as const,
    containedProcessRequired: true as const,
    runtimeCodeStateProofRequired: true as const,
    independentRuntimeBuildProvenanceVerified: false as const,
    mintAuthorityGranted: false as const,
    settlementAuthorityGranted: false as const,
    gate5Closed: false as const,
  });

  const verifier:
  AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier =
    Object.freeze({
      executableSha256Hex,
      executionPolicySha256,
      executionBoundary,
      deriveExecutableInvocationSha256Hex(
        trustedAnchorDigestHex: string,
      ): string {
        return deriveExecutableInvocationSha256Hex(
          executableSha256Hex,
          [
            '--verify-pooled-reserve-mint-reservation-state-v4',
            '--trusted-anchor-digest',
            fixedHex(
              trustedAnchorDigestHex,
              32,
              'trusted anchor digest',
            ),
          ],
        );
      },
      async verify(input: {
        readonly trustedAnchorDigestHex: string;
        readonly request:
          NativeFinalizedPooledReserveMintReservationStateV4Request;
      }): Promise<
        AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verification
      > {
        const request =
          normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(
            input?.request,
          );
        const trustedAnchorDigestHex = fixedHex(
          input?.trustedAnchorDigestHex,
          32,
          'independently supplied pooled-reserve reservation-state trust anchor digest',
        );
        if (
          deriveNativeGrandpaTrustAnchorDigestHex(
            commonFinalityRequest(request),
          ) !== trustedAnchorDigestHex
        ) {
          throw new Error(
            'pooled-reserve reservation-state request trust anchor does not match the independently supplied digest',
          );
        }
        const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
        if (requestBytes.length > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
          throw new Error(
            `pooled-reserve reservation-state verifier request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
          );
        }
        const result = await authority.execute({
          operation: 'verify-pooled-reserve-mint-reservation-state-v4',
          trustedAnchorDigestHex,
          requestBytes,
        });
        assertNativePegInVerifierExecutionAuthorityResultProvenance({
          authority,
          result,
        });
        if (
          result.operation
          !== 'verify-pooled-reserve-mint-reservation-state-v4'
        ) {
          throw new Error(
            'authority-bound pooled-reserve reservation-state verifier result operation does not match',
          );
        }
        assertAuthorityResultBinding(authority, result);
        const verification =
          validateNativeFinalizedPooledReserveMintReservationStateV4PayloadBindings({
            requestBytes,
            trustedAnchorDigestHex,
            verification: parseSingleJsonObject(result.stdout),
          }) as
            AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verification;
        AUTHORITY_VERIFICATIONS.set(verification, {
          authority,
          verifier,
          requestDigestHex: verification.requestDigestHex,
          executionPolicySha256,
        });
        return verification;
      },
    });
  AUTHORITY_VERIFIERS.add(verifier);
  return verifier;
}

export function assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerifierProvenance(
  verifier: unknown,
): asserts verifier is
AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier {
  if (
    !verifier
    || typeof verifier !== 'object'
    || !AUTHORITY_VERIFIERS.has(verifier)
  ) {
    throw new Error(
      'authority-bound pooled-reserve reservation-state V4 verifier provenance is missing',
    );
  }
}

export function assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerificationFromVerifierProvenance(
  input: {
    readonly verifier:
      AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier;
    readonly verification: unknown;
    readonly expectedRequestDigestHex: string;
  },
): asserts input is {
  readonly verifier:
    AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier;
  readonly verification:
    AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verification;
  readonly expectedRequestDigestHex: string;
} {
  assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerifierProvenance(
    input.verifier,
  );
  if (!input.verification || typeof input.verification !== 'object') {
    throw new Error(
      'authority-bound pooled-reserve reservation-state V4 verification provenance is missing',
    );
  }
  const expectedRequestDigestHex = fixedHex(
    input.expectedRequestDigestHex,
    32,
    'expected pooled-reserve reservation-state request digest',
  );
  const provenance = AUTHORITY_VERIFICATIONS.get(input.verification);
  if (
    provenance?.verifier !== input.verifier
    || provenance.requestDigestHex !== expectedRequestDigestHex
    || provenance.executionPolicySha256
      !== input.verifier.executionPolicySha256
  ) {
    throw new Error(
      'authority-bound pooled-reserve reservation-state V4 verification provenance is missing',
    );
  }
}

export function normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(
  value: unknown,
): Readonly<NativeFinalizedPooledReserveMintReservationStateV4Request> {
  const record = exactRecord(value, [
    'checkpointTailHeadersScaleHex',
    'finalityProofScaleHex',
    'linkedGrandpaProofs',
    'reservationStateProofNodesHex',
    'schema',
    'statement',
    'targetHeaderScaleHex',
    'targetNativeBlockHashHex',
    'trustAnchor',
  ], 'native finalized pooled-reserve reservation-state V4 request');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA,
    'pooled-reserve reservation-state request schema',
  );
  const common = normalizeNativeFinalizedBridgeCheckpointRequest({
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: record.trustAnchor,
    targetNativeBlockHashHex: record.targetNativeBlockHashHex,
    targetHeaderScaleHex: record.targetHeaderScaleHex,
    linkedGrandpaProofs: record.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: record.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: record.finalityProofScaleHex,
    runtimeStateProofNodesHex: [FINALITY_SENTINEL_PROOF_NODE_HEX],
  });
  const reservationStateProofNodesHex =
    normalizeReservationStateProofNodesV4(
      record.reservationStateProofNodesHex,
    );
  const statementRecord = exactRecord(record.statement, [
    'bridgeRuntimeCodeBytes',
    'bridgeRuntimeCodeSha256Hex',
    'consumedReservationStorageKeyHex',
    'currentProfileStorageKeyHex',
    'enforcementStorageKeyHex',
    'invalidatedReservationStorageKeyHex',
    'pendingKeysStorageKeyHex',
    'pendingReservationStorageKeyHex',
    'reservationKeyHex',
    'schema',
    'statementHex',
    'statementIdHex',
  ], 'pooled-reserve reservation-state V4 statement');
  requireLiteral(
    statementRecord.schema,
    POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATEMENT_SCHEMA,
    'pooled-reserve reservation-state statement schema',
  );
  const statementHex = fixedHex(
    statementRecord.statementHex,
    VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES,
    'pooled-reserve reservation statement',
  );
  const decodedStatement =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statementHex,
    );
  const statementIdHex = fixedHex(
    statementRecord.statementIdHex,
    32,
    'pooled-reserve reservation statement ID',
    true,
  );
  if (
    deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
      decodedStatement,
    ) !== statementIdHex
  ) {
    throw new Error(
      'pooled-reserve reservation-state statement ID is inconsistent',
    );
  }
  const reservationKeyHex = fixedHex(
    statementRecord.reservationKeyHex,
    32,
    'pooled-reserve reservation key',
    true,
  );
  if (decodedStatement.mintIdentityHex !== reservationKeyHex) {
    throw new Error(
      'pooled-reserve reservation-state key differs from the V4 mint identity',
    );
  }
  const expectedKeys =
    derivePooledReserveMintReservationRuntimeStorageKeysV4(
      reservationKeyHex,
    );
  const statement: PooledReserveMintReservationStateStatementRequestV4 = {
    schema: POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATEMENT_SCHEMA,
    statementHex,
    statementIdHex,
    reservationKeyHex,
    bridgeRuntimeCodeSha256Hex: fixedHex(
      statementRecord.bridgeRuntimeCodeSha256Hex,
      32,
      'pooled-reserve runtime code SHA-256',
      true,
    ),
    bridgeRuntimeCodeBytes: decimalUint64(
      statementRecord.bridgeRuntimeCodeBytes,
      'pooled-reserve runtime code bytes',
      true,
      BigInt(MAX_RUNTIME_CODE_BYTES),
    ),
    currentProfileStorageKeyHex: exactStorageKey(
      statementRecord.currentProfileStorageKeyHex,
      expectedKeys.currentProfileStorageKeyHex,
      'current reservation profile storage key',
    ),
    enforcementStorageKeyHex: exactStorageKey(
      statementRecord.enforcementStorageKeyHex,
      expectedKeys.enforcementStorageKeyHex,
      'reservation enforcement storage key',
    ),
    pendingKeysStorageKeyHex: exactStorageKey(
      statementRecord.pendingKeysStorageKeyHex,
      expectedKeys.pendingKeysStorageKeyHex,
      'pending reservation index storage key',
    ),
    pendingReservationStorageKeyHex: exactStorageKey(
      statementRecord.pendingReservationStorageKeyHex,
      expectedKeys.pendingReservationStorageKeyHex,
      'pending reservation storage key',
    ),
    consumedReservationStorageKeyHex: exactStorageKey(
      statementRecord.consumedReservationStorageKeyHex,
      expectedKeys.consumedReservationStorageKeyHex,
      'consumed reservation storage key',
    ),
    invalidatedReservationStorageKeyHex: exactStorageKey(
      statementRecord.invalidatedReservationStorageKeyHex,
      expectedKeys.invalidatedReservationStorageKeyHex,
      'invalidated reservation storage key',
    ),
  };
  const request = deepFreeze({
    schema:
      NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA,
    trustAnchor: common.trustAnchor,
    targetNativeBlockHashHex: common.targetNativeBlockHashHex,
    targetHeaderScaleHex: common.targetHeaderScaleHex,
    linkedGrandpaProofs: common.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: common.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: common.finalityProofScaleHex,
    statement,
    reservationStateProofNodesHex,
  });
  if (
    Buffer.byteLength(JSON.stringify(request), 'utf8')
    > MAX_NATIVE_VERIFIER_REQUEST_BYTES
  ) {
    throw new Error(
      `pooled-reserve reservation-state request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return request;
}

export function deriveNativeFinalizedPooledReserveMintReservationStateV4RequestDigestHex(
  value: unknown,
): string {
  const request =
    normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(value);
  return blake2b256Hex(Buffer.from(JSON.stringify(request), 'utf8'));
}

export function validateNativeFinalizedPooledReserveMintReservationStateV4PayloadBindings(
  input: {
    readonly requestBytes: Uint8Array;
    readonly trustedAnchorDigestHex: unknown;
    readonly verification: unknown;
  },
): NativeFinalizedPooledReserveMintReservationStateV4VerificationPayload {
  let requestText: string;
  try {
    requestText = new TextDecoder('utf-8', { fatal: true }).decode(
      input.requestBytes,
    );
  } catch (error) {
    throw new Error(
      'pooled-reserve reservation-state verifier request bytes are not valid UTF-8 JSON',
      { cause: error },
    );
  }
  const request =
    normalizeNativeFinalizedPooledReserveMintReservationStateV4Request(
      parseStrictJson(
        requestText,
        'pooled-reserve reservation-state V4 verifier request',
      ),
    );
  const independentlyTrustedAnchorDigestHex = fixedHex(
    input.trustedAnchorDigestHex,
    32,
    'independently supplied pooled-reserve reservation-state trust anchor digest',
  );
  const commonRequest = commonFinalityRequest(request);
  if (
    deriveNativeGrandpaTrustAnchorDigestHex(commonRequest)
    !== independentlyTrustedAnchorDigestHex
  ) {
    throw new Error(
      'pooled-reserve reservation-state request does not match the independently supplied trust anchor',
    );
  }

  const result = exactRecord(input.verification, [
    'authority',
    'boundary',
    'finality',
    'requestDigestHex',
    'reservationState',
    'schema',
    'status',
    'target',
    'trustAnchorDigestHex',
  ], 'native finalized pooled-reserve reservation-state V4 verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_VERIFICATION_SCHEMA,
    'pooled-reserve reservation-state verification schema',
  );
  requireLiteral(
    result.status,
    NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATUS,
    'pooled-reserve reservation-state verification status',
  );
  const requestDigestHex = fixedHex(
    result.requestDigestHex,
    32,
    'pooled-reserve reservation-state request digest',
  );
  if (requestDigestHex !== blake2b256Hex(Buffer.from(input.requestBytes))) {
    throw new Error(
      'pooled-reserve reservation-state request digest does not match the exact request bytes',
    );
  }
  const trustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'pooled-reserve reservation-state trust anchor digest',
  );
  if (trustAnchorDigestHex !== independentlyTrustedAnchorDigestHex) {
    throw new Error(
      'pooled-reserve reservation-state verification does not match the independently supplied trust anchor',
    );
  }

  const targetRecord = exactRecord(result.target, [
    'nativeBlockHashHex',
    'nativeHeight',
    'stateRootHex',
  ], 'pooled-reserve reservation-state verification target');
  const target = {
    nativeBlockHashHex: fixedHex(
      targetRecord.nativeBlockHashHex,
      32,
      'reservation-state target block hash',
    ),
    nativeHeight: decimalUint64(
      targetRecord.nativeHeight,
      'reservation-state target height',
    ),
    stateRootHex: fixedHex(
      targetRecord.stateRootHex,
      32,
      'reservation-state target state root',
    ),
  };
  if (target.nativeBlockHashHex !== request.targetNativeBlockHashHex) {
    throw new Error(
      'pooled-reserve reservation-state target hash does not match the request',
    );
  }

  const authorityRecord = exactRecord(result.authority, [
    'finalitySigningAuthorityListScaleHex',
    'finalitySigningAuthoritySetHashHex',
    'finalitySigningSetId',
    'linkedAncestryVerified',
    'transitionCount',
  ], 'pooled-reserve reservation-state verification authority');
  const authority = {
    finalitySigningSetId: decimalUint64(
      authorityRecord.finalitySigningSetId,
      'reservation-state finality signing set ID',
    ),
    finalitySigningAuthorityListScaleHex: boundedByteHex(
      authorityRecord.finalitySigningAuthorityListScaleHex,
      4 * 1024,
      'reservation-state finality signing authority list',
    ),
    finalitySigningAuthoritySetHashHex: fixedHex(
      authorityRecord.finalitySigningAuthoritySetHashHex,
      32,
      'reservation-state finality signing authority-set hash',
    ),
    transitionCount: boundedInteger(
      authorityRecord.transitionCount,
      0,
      Number.MAX_SAFE_INTEGER,
      'reservation-state authority transition count',
    ),
    linkedAncestryVerified: literalTrue(
      authorityRecord.linkedAncestryVerified,
      'reservation-state linked ancestry boundary',
    ),
  };
  if (
    BigInt(authority.finalitySigningSetId)
    !== BigInt(request.trustAnchor.grandpaSetId)
      + BigInt(authority.transitionCount)
  ) {
    throw new Error(
      'pooled-reserve reservation-state finality set ID is not linked to the trust anchor',
    );
  }
  if (
    authority.finalitySigningAuthoritySetHashHex
    !== deriveNativeGrandpaAuthoritySetHashHex(
      authority.finalitySigningAuthorityListScaleHex,
    )
  ) {
    throw new Error(
      'pooled-reserve reservation-state authority-set hash is inconsistent',
    );
  }

  const finalityRecord = exactRecord(result.finality, [
    'canonicalJustificationScaleHex',
    'horizonHashHex',
    'horizonHeight',
    'verified',
  ], 'pooled-reserve reservation-state verification finality');
  const finality = {
    horizonHashHex: fixedHex(
      finalityRecord.horizonHashHex,
      32,
      'reservation-state finality horizon hash',
    ),
    horizonHeight: decimalUint64(
      finalityRecord.horizonHeight,
      'reservation-state finality horizon height',
    ),
    canonicalJustificationScaleHex: boundedByteHex(
      finalityRecord.canonicalJustificationScaleHex,
      MAX_FINALITY_PROOF_BYTES,
      'reservation-state canonical GRANDPA justification',
    ),
    verified: literalTrue(
      finalityRecord.verified,
      'reservation-state finality verified boundary',
    ),
  };
  if (BigInt(finality.horizonHeight) < BigInt(target.nativeHeight)) {
    throw new Error(
      'pooled-reserve reservation-state finality horizon precedes the target',
    );
  }

  const stateRecord = exactRecord(result.reservationState, [
    'bridgeRuntimeCodeBytes',
    'bridgeRuntimeCodeSha256Hex',
    'lifecycleRecordScaleHex',
    'nonAuthorizing',
    'pendingIndexContainsTarget',
    'pendingKeyCount',
    'profileIdHex',
    'profileScaleHex',
    'proofBytes',
    'proofNodeCount',
    'reservationKeyHex',
    'runtimeCodeStateProofVerified',
    'sevenKeyStateProofVerified',
    'statementIdHex',
    'status',
  ], 'pooled-reserve reservation-state verification state');
  const lifecycleStatus = lifecycleStatusV4(stateRecord.status);
  const statementIdHex = fixedHex(
    stateRecord.statementIdHex,
    32,
    'authenticated reservation statement ID',
    true,
  );
  if (statementIdHex !== request.statement.statementIdHex) {
    throw new Error(
      'authenticated reservation statement ID differs from the request',
    );
  }
  const reservationKeyHex = fixedHex(
    stateRecord.reservationKeyHex,
    32,
    'authenticated reservation key',
    true,
  );
  if (reservationKeyHex !== request.statement.reservationKeyHex) {
    throw new Error(
      'authenticated reservation key differs from the request',
    );
  }
  const profileScaleHex = fixedHex(
    stateRecord.profileScaleHex,
    POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
    'authenticated pooled-reserve reservation profile',
  );
  const profile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      profileScaleHex,
    );
  validateRuntimeProfileBindings({
    profile,
    profileScaleHex,
    profileIdHex: stateRecord.profileIdHex,
    request,
    targetHeight: target.nativeHeight,
  });
  const profileIdHex =
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(
      profileScaleHex,
    );
  const pendingKeyCount = boundedInteger(
    stateRecord.pendingKeyCount,
    0,
    MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_V4,
    'authenticated pending reservation count',
  );
  const pendingIndexContainsTarget = booleanValue(
    stateRecord.pendingIndexContainsTarget,
    'authenticated pending-index target membership',
  );
  if (
    (lifecycleStatus === 'pending') !== pendingIndexContainsTarget
  ) {
    throw new Error(
      'authenticated reservation lifecycle and pending-index membership disagree',
    );
  }
  const lifecycleRecordScaleHex = validateLifecycleRecord({
    status: lifecycleStatus,
    value: stateRecord.lifecycleRecordScaleHex,
    request,
    profile,
    profileIdHex,
    targetHeight: target.nativeHeight,
  });
  const bridgeRuntimeCodeSha256Hex = fixedHex(
    stateRecord.bridgeRuntimeCodeSha256Hex,
    32,
    'authenticated bridge runtime code SHA-256',
    true,
  );
  if (
    bridgeRuntimeCodeSha256Hex
    !== request.statement.bridgeRuntimeCodeSha256Hex
  ) {
    throw new Error(
      'authenticated bridge runtime code digest differs from the request',
    );
  }
  const bridgeRuntimeCodeBytes = decimalUint64(
    stateRecord.bridgeRuntimeCodeBytes,
    'authenticated bridge runtime code bytes',
    true,
    BigInt(MAX_RUNTIME_CODE_BYTES),
  );
  if (bridgeRuntimeCodeBytes !== request.statement.bridgeRuntimeCodeBytes) {
    throw new Error(
      'authenticated bridge runtime code length differs from the request',
    );
  }
  const proofNodeCount = boundedInteger(
    stateRecord.proofNodeCount,
    1,
    MAX_STATE_PROOF_NODES,
    'reservation-state proof node count',
  );
  if (proofNodeCount !== request.reservationStateProofNodesHex.length) {
    throw new Error(
      'reservation-state proof node count does not match the request',
    );
  }
  const expectedProofBytes = request.reservationStateProofNodesHex.reduce(
    (sum, node) => sum + (node.length - 2) / 2,
    0,
  );
  const proofBytes = boundedInteger(
    stateRecord.proofBytes,
    1,
    MAX_STATE_PROOF_BYTES,
    'reservation-state proof bytes',
  );
  if (proofBytes !== expectedProofBytes) {
    throw new Error(
      'reservation-state proof byte count does not match the request',
    );
  }
  const runtimeCodeStateProofVerified = literalTrue(
    stateRecord.runtimeCodeStateProofVerified,
    'runtime-code state proof boundary',
  );
  const sevenKeyStateProofVerified = literalTrue(
    stateRecord.sevenKeyStateProofVerified,
    'seven-key state proof boundary',
  );
  const nonAuthorizing = literalTrue(
    stateRecord.nonAuthorizing,
    'reservation-state non-authorizing boundary',
  );

  const boundaryRecord = exactRecord(result.boundary, [
    'broadcastEnabled',
    'gate5Closed',
    'independentRuntimeBuildProvenanceVerified',
    'mintAuthorized',
    'productionReadinessClaimed',
    'runtimeMutationEnabled',
    'signingEnabled',
    'submissionEnabled',
    'trustlessOperationVerified',
  ], 'pooled-reserve reservation-state verification boundary');
  const boundary = {
    mintAuthorized: literalFalse(
      boundaryRecord.mintAuthorized,
      'reservation-state mint authorization boundary',
    ),
    signingEnabled: literalFalse(
      boundaryRecord.signingEnabled,
      'reservation-state signing boundary',
    ),
    submissionEnabled: literalFalse(
      boundaryRecord.submissionEnabled,
      'reservation-state submission boundary',
    ),
    broadcastEnabled: literalFalse(
      boundaryRecord.broadcastEnabled,
      'reservation-state broadcast boundary',
    ),
    runtimeMutationEnabled: literalFalse(
      boundaryRecord.runtimeMutationEnabled,
      'reservation-state runtime mutation boundary',
    ),
    independentRuntimeBuildProvenanceVerified: literalFalse(
      boundaryRecord.independentRuntimeBuildProvenanceVerified,
      'reservation-state independent runtime-build provenance boundary',
    ),
    gate5Closed: literalFalse(
      boundaryRecord.gate5Closed,
      'reservation-state Gate 5 boundary',
    ),
    trustlessOperationVerified: literalFalse(
      boundaryRecord.trustlessOperationVerified,
      'reservation-state trustless operation boundary',
    ),
    productionReadinessClaimed: literalFalse(
      boundaryRecord.productionReadinessClaimed,
      'reservation-state production-readiness boundary',
    ),
  };

  return deepFreeze({
    schema:
      NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_VERIFICATION_SCHEMA,
    status:
      NATIVE_FINALIZED_POOLED_RESERVE_MINT_RESERVATION_STATE_V4_STATUS,
    requestDigestHex,
    trustAnchorDigestHex,
    target,
    authority,
    finality,
    reservationState: {
      status: lifecycleStatus,
      statementIdHex,
      reservationKeyHex,
      profileIdHex,
      profileScaleHex,
      pendingKeyCount,
      pendingIndexContainsTarget,
      lifecycleRecordScaleHex,
      bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes,
      runtimeCodeStateProofVerified,
      proofNodeCount,
      proofBytes,
      sevenKeyStateProofVerified,
      nonAuthorizing,
    },
    boundary,
  });
}

function commonFinalityRequest(
  request: Readonly<
    NativeFinalizedPooledReserveMintReservationStateV4Request
  >,
): NativeFinalizedBridgeCheckpointRequest {
  return {
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: request.trustAnchor,
    targetNativeBlockHashHex: request.targetNativeBlockHashHex,
    targetHeaderScaleHex: request.targetHeaderScaleHex,
    linkedGrandpaProofs: request.linkedGrandpaProofs.map(proof => ({
      ancestryHeadersScaleHex: [...proof.ancestryHeadersScaleHex],
      proofScaleHex: proof.proofScaleHex,
    })),
    checkpointTailHeadersScaleHex: [
      ...request.checkpointTailHeadersScaleHex,
    ],
    finalityProofScaleHex: request.finalityProofScaleHex,
    runtimeStateProofNodesHex: [FINALITY_SENTINEL_PROOF_NODE_HEX],
  };
}

function normalizeReservationStateProofNodesV4(
  value: unknown,
): readonly string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > MAX_STATE_PROOF_NODES
  ) {
    throw new Error(
      `pooled-reserve reservation-state proof must contain between 1 and ${MAX_STATE_PROOF_NODES} nodes`,
    );
  }
  let proofBytes = 0;
  const nodes = value.map((node, index) => {
    const normalized = lowerByteHex(
      node,
      `pooled-reserve reservation-state proof node ${index}`,
    );
    const nodeBytes = (normalized.length - 2) / 2;
    if (nodeBytes > MAX_STATE_PROOF_NODE_BYTES) {
      throw new Error(
        `pooled-reserve reservation-state proof node ${index} exceeds ${MAX_STATE_PROOF_NODE_BYTES} bytes`,
      );
    }
    proofBytes += nodeBytes;
    if (proofBytes > MAX_STATE_PROOF_BYTES) {
      throw new Error(
        `pooled-reserve reservation-state proof exceeds ${MAX_STATE_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(nodes).size !== nodes.length) {
    throw new Error(
      'pooled-reserve reservation-state proof contains duplicate nodes',
    );
  }
  return Object.freeze(nodes);
}

function validateRuntimeProfileBindings(input: {
  readonly profile: PooledReserveMintReservationRuntimeProfileV4;
  readonly profileScaleHex: string;
  readonly profileIdHex: unknown;
  readonly request: Readonly<
    NativeFinalizedPooledReserveMintReservationStateV4Request
  >;
  readonly targetHeight: string;
}): void {
  const decodedStatement =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      input.request.statement.statementHex,
    );
  const sourceIntent = decodePegInSourceIntentV2Hex(
    decodedStatement.sourceIntentHex,
  );
  const expectedProfileIdHex =
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(
      input.profileScaleHex,
    );
  if (
    fixedHex(
      input.profileIdHex,
      32,
      'authenticated pooled-reserve reservation profile ID',
      true,
    ) !== expectedProfileIdHex
  ) {
    throw new Error(
      'authenticated pooled-reserve reservation profile ID is inconsistent',
    );
  }
  if (
    input.profile.lineageProfileIdHex
      !== decodedStatement.lineageProfileIdHex
    || input.profile.sourceNetworkIdHex !== sourceIntent.sourceNetworkIdHex
    || input.profile.sidechainIdHex !== sourceIntent.sidechainIdHex
    || input.profile.sidechainIdHex
      !== input.request.trustAnchor.sidechainIdHex
    || input.profile.bridgeAddressHex !== sourceIntent.bridgeAddressHex
    || input.profile.tokenAddressHex !== sourceIntent.tokenAddressHex
    || input.profile.settlementProfileIdHex
      !== sourceIntent.settlementProfileIdHex
    || input.profile.ergoDepositFinalityPolicyIdHex
      !== decodedStatement.ergoDepositFinalityPolicyIdHex
    || BigInt(input.profile.activationHeight) > BigInt(input.targetHeight)
  ) {
    throw new Error(
      'authenticated pooled-reserve reservation profile differs from the statement or target',
    );
  }
}

export function normalizePooledReserveMintReservationLifecycleRecordScaleHexV4(
  status: PooledReserveMintReservationLifecycleStatusV4,
  value: unknown,
): string | null {
  if (status === 'absent') {
    if (value !== null) {
      throw new Error(
        'absent pooled-reserve reservation state must not contain a lifecycle record',
      );
    }
    return null;
  }
  const lifecycleRecordScaleHex = boundedByteHex(
    value,
    MAX_LIFECYCLE_RECORD_BYTES,
    `${status} pooled-reserve reservation lifecycle record`,
  );
  const bytes = Buffer.from(lifecycleRecordScaleHex.slice(2), 'hex');
  if (status === 'pending') {
    decodePendingLifecycleRecordBytesV4(bytes);
  } else {
    const expectedBytes = status === 'consumed'
      ? POOLED_RESERVE_MINT_RESERVATION_CONSUMED_LIFECYCLE_RECORD_V4_BYTES
      : POOLED_RESERVE_MINT_RESERVATION_INVALIDATED_LIFECYCLE_RECORD_V4_BYTES;
    if (bytes.length !== expectedBytes || bytes[0] !== 4) {
      throw new Error(`${status} reservation lifecycle record is malformed`);
    }
  }
  return lifecycleRecordScaleHex;
}

export function decodePooledReserveMintReservationPendingExpiryHeightV4(
  value: unknown,
): string {
  const lifecycleRecordScaleHex = boundedByteHex(
    value,
    MAX_LIFECYCLE_RECORD_BYTES,
    'pending pooled-reserve reservation lifecycle record',
  );
  return decodePendingLifecycleRecordBytesV4(
    Buffer.from(lifecycleRecordScaleHex.slice(2), 'hex'),
  ).expiresAt.toString();
}

interface DecodedPendingLifecycleRecordV4 {
  readonly statementStart: number;
  readonly statementEnd: number;
  readonly issuedAt: bigint;
  readonly reservedAt: bigint;
  readonly expiresAt: bigint;
}

function decodePendingLifecycleRecordBytesV4(
  bytes: Buffer,
): DecodedPendingLifecycleRecordV4 {
  if (bytes.length < 35 || bytes[0] !== 4) {
    throw new Error('pending reservation lifecycle record is malformed');
  }
  const statementLength = decodeCompactLength(bytes, 33);
  if (
    statementLength.value
      !== VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES
  ) {
    throw new Error(
      'pending reservation statement length is not the exact V4 length',
    );
  }
  const statementStart = 33 + statementLength.bytesRead;
  const statementEnd = statementStart + statementLength.value;
  const expectedLength = statementEnd + 8 * 32 + 3 * 8;
  if (
    bytes.length !== expectedLength
    || bytes.length
      !== POOLED_RESERVE_MINT_RESERVATION_PENDING_LIFECYCLE_RECORD_V4_BYTES
  ) {
    throw new Error('pending reservation lifecycle record is malformed');
  }
  const issuedAtOffset = statementEnd + 5 * 32;
  const reservedAtOffset = issuedAtOffset + 8 + 3 * 32;
  const expiresAtOffset = reservedAtOffset + 8;
  return {
    statementStart,
    statementEnd,
    issuedAt: bytes.readBigUInt64LE(issuedAtOffset),
    reservedAt: bytes.readBigUInt64LE(reservedAtOffset),
    expiresAt: bytes.readBigUInt64LE(expiresAtOffset),
  };
}

function validateLifecycleRecord(input: {
  readonly status: PooledReserveMintReservationLifecycleStatusV4;
  readonly value: unknown;
  readonly request: Readonly<
    NativeFinalizedPooledReserveMintReservationStateV4Request
  >;
  readonly profile: PooledReserveMintReservationRuntimeProfileV4;
  readonly profileIdHex: string;
  readonly targetHeight: string;
}): string | null {
  const lifecycleRecordScaleHex =
    normalizePooledReserveMintReservationLifecycleRecordScaleHexV4(
      input.status,
      input.value,
    );
  if (input.status === 'absent') {
    return lifecycleRecordScaleHex;
  }
  if (lifecycleRecordScaleHex === null) {
    throw new Error(
      'non-absent pooled-reserve reservation state is missing its lifecycle record',
    );
  }
  const bytes = Buffer.from(lifecycleRecordScaleHex.slice(2), 'hex');
  if (input.status === 'pending') {
    validatePendingLifecycleRecord(bytes, input);
  } else if (input.status === 'consumed') {
    validateConsumedLifecycleRecord(bytes, input);
  } else {
    validateInvalidatedLifecycleRecord(bytes, input);
  }
  return lifecycleRecordScaleHex;
}

function validatePendingLifecycleRecord(
  bytes: Buffer,
  input: {
    readonly request: Readonly<
      NativeFinalizedPooledReserveMintReservationStateV4Request
    >;
    readonly profile: PooledReserveMintReservationRuntimeProfileV4;
    readonly profileIdHex: string;
    readonly targetHeight: string;
  },
): void {
  const decoded = decodePendingLifecycleRecordBytesV4(bytes);
  requireEqualHex(
    sliceHex(bytes, 1, 33),
    input.profileIdHex,
    'pending reservation profile ID',
  );
  const statementBytes = bytes.subarray(
    decoded.statementStart,
    decoded.statementEnd,
  );
  if (
    `0x${statementBytes.toString('hex')}`
    !== input.request.statement.statementHex
  ) {
    throw new Error(
      'pending reservation lifecycle record contains a different statement',
    );
  }
  let offset = decoded.statementEnd;
  requireEqualHex(
    sliceHex(bytes, offset, offset + 32),
    input.request.statement.statementIdHex,
    'pending reservation statement ID',
  );
  offset += 32;
  requireEqualHex(
    sliceHex(bytes, offset, offset + 32),
    input.request.statement.reservationKeyHex,
    'pending reservation key',
  );
  offset += 32;
  requireEqualHex(
    sliceHex(bytes, offset, offset + 32),
    blake2b256Hex(statementBytes),
    'pending reservation statement digest',
  );
  offset += 32;
  requireEqualHex(
    sliceHex(bytes, offset, offset + 32),
    input.profile.sourceProofSystemIdHex,
    'pending reservation source-proof system ID',
  );
  offset += 32;
  requireEqualHex(
    sliceHex(bytes, offset, offset + 32),
    input.profile.sourceProofProfileIdHex,
    'pending reservation source-proof profile ID',
  );
  offset += 32;
  const issuedAt = decoded.issuedAt;
  offset += 8;
  for (const label of [
    'source-proof request digest',
    'source-proof result ID',
    'source-proof digest',
  ]) {
    const value = sliceHex(bytes, offset, offset + 32);
    if (/^0x0+$/.test(value)) {
      throw new Error(`pending reservation ${label} must not be zero`);
    }
    offset += 32;
  }
  const reservedAt = decoded.reservedAt;
  offset += 8;
  const expiresAt = decoded.expiresAt;
  if (
    issuedAt < BigInt(input.profile.activationHeight)
    || issuedAt > reservedAt
    || reservedAt > BigInt(input.targetHeight)
    || expiresAt <= reservedAt
    || expiresAt
      > reservedAt + BigInt(input.profile.maxPendingBlocks)
  ) {
    throw new Error(
      'pending reservation lifecycle heights violate the V4 profile',
    );
  }
}

function validateConsumedLifecycleRecord(
  bytes: Buffer,
  input: {
    readonly request: Readonly<
      NativeFinalizedPooledReserveMintReservationStateV4Request
    >;
    readonly profileIdHex: string;
    readonly targetHeight: string;
  },
): void {
  requireLifecycleIdentity(bytes, input);
  const consumedAt = bytes.readBigUInt64LE(97);
  const executionBlockHashHex = sliceHex(bytes, 105, 137);
  const transactionHashHex = sliceHex(bytes, 137, 169);
  if (
    consumedAt > BigInt(input.targetHeight)
    || /^0x0+$/.test(executionBlockHashHex)
    || /^0x0+$/.test(transactionHashHex)
  ) {
    throw new Error(
      'consumed reservation lifecycle record violates the V4 bindings',
    );
  }
}

function validateInvalidatedLifecycleRecord(
  bytes: Buffer,
  input: {
    readonly request: Readonly<
      NativeFinalizedPooledReserveMintReservationStateV4Request
    >;
    readonly profileIdHex: string;
    readonly targetHeight: string;
  },
): void {
  requireLifecycleIdentity(bytes, input);
  const invalidatedAt = bytes.readBigUInt64LE(97);
  if (
    invalidatedAt > BigInt(input.targetHeight)
    || bytes[105] === 0
    || /^0x0+$/.test(sliceHex(bytes, 106, 138))
  ) {
    throw new Error(
      'invalidated reservation lifecycle record violates the V4 bindings',
    );
  }
}

function requireLifecycleIdentity(
  bytes: Buffer,
  input: {
    readonly request: Readonly<
      NativeFinalizedPooledReserveMintReservationStateV4Request
    >;
    readonly profileIdHex: string;
  },
): void {
  requireEqualHex(
    sliceHex(bytes, 1, 33),
    input.profileIdHex,
    'terminal reservation profile ID',
  );
  requireEqualHex(
    sliceHex(bytes, 33, 65),
    input.request.statement.statementIdHex,
    'terminal reservation statement ID',
  );
  requireEqualHex(
    sliceHex(bytes, 65, 97),
    input.request.statement.reservationKeyHex,
    'terminal reservation key',
  );
}

function decodeCompactLength(
  bytes: Buffer,
  offset: number,
): { readonly value: number; readonly bytesRead: number } {
  if (offset >= bytes.length) {
    throw new Error('pending reservation statement length is truncated');
  }
  const mode = bytes[offset] & 0b11;
  if (mode === 0) {
    return { value: bytes[offset] >>> 2, bytesRead: 1 };
  }
  if (mode === 1) {
    if (offset + 2 > bytes.length) {
      throw new Error('pending reservation statement length is truncated');
    }
    const value = bytes.readUInt16LE(offset) >>> 2;
    if (value < 64) {
      throw new Error(
        'pending reservation statement length is not canonical SCALE',
      );
    }
    return { value, bytesRead: 2 };
  }
  if (mode === 2) {
    if (offset + 4 > bytes.length) {
      throw new Error('pending reservation statement length is truncated');
    }
    const value = bytes.readUInt32LE(offset) >>> 2;
    if (value < 1 << 14) {
      throw new Error(
        'pending reservation statement length is not canonical SCALE',
      );
    }
    return { value, bytesRead: 4 };
  }
  throw new Error(
    'pending reservation statement length uses unsupported SCALE big-integer mode',
  );
}

function assertAuthorityResultBinding(
  authority: NativePegInVerifierExecutionAuthority,
  result: {
    readonly profileId: string;
    readonly attestationId: string;
    readonly policyId: string;
    readonly executionPolicySha256: string;
    readonly policyEpoch: number;
    readonly boundary: {
      readonly sourceOwnedAttestorLockReloaded: true;
      readonly sourceOwnedAttestorLockRevalidatedAfterExecution: true;
      readonly reviewedTrustRootsRequired: true;
      readonly exactPegInPolicyValidatedAfterReload: true;
      readonly exactPegInPolicyRevalidatedAfterExecution: true;
      readonly brokerAuthorityModeRequested: true;
      readonly directProcessAllowed: false;
      readonly pegInConformanceAttested: false;
      readonly runtimeCodeIdentityVerified: false;
      readonly mintAuthorityGranted: false;
      readonly settlementAuthorityGranted: false;
      readonly gate5Closed: false;
      readonly productionReady: false;
    };
  },
): void {
  const declaration = authority.declaration;
  const boundary = result.boundary;
  if (
    result.profileId !== declaration.profileId
    || result.attestationId !== declaration.attestationId
    || result.policyId !== declaration.policyId
    || result.executionPolicySha256 !== declaration.executionPolicySha256
    || result.policyEpoch !== declaration.policyEpoch
    || boundary.sourceOwnedAttestorLockReloaded !== true
    || boundary.sourceOwnedAttestorLockRevalidatedAfterExecution !== true
    || boundary.reviewedTrustRootsRequired !== true
    || boundary.exactPegInPolicyValidatedAfterReload !== true
    || boundary.exactPegInPolicyRevalidatedAfterExecution !== true
    || boundary.brokerAuthorityModeRequested !== true
    || boundary.directProcessAllowed !== false
    || boundary.pegInConformanceAttested !== false
    || boundary.runtimeCodeIdentityVerified !== false
    || boundary.mintAuthorityGranted !== false
    || boundary.settlementAuthorityGranted !== false
    || boundary.gate5Closed !== false
    || boundary.productionReady !== false
  ) {
    throw new Error(
      'authority-bound pooled-reserve reservation-state result weakens or changes its execution declaration',
    );
  }
}

function parseSingleJsonObject(stdout: Buffer): unknown {
  if (stdout.length === 0) {
    throw new Error(
      'pooled-reserve reservation-state verifier produced empty stdout',
    );
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  } catch (error) {
    throw new Error(
      'pooled-reserve reservation-state verifier stdout is not valid UTF-8',
      { cause: error },
    );
  }
  return parseStrictJson(
    text,
    'pooled-reserve reservation-state verifier stdout',
  );
}

function lifecycleStatusV4(
  value: unknown,
): PooledReserveMintReservationLifecycleStatusV4 {
  if (
    value !== 'absent'
    && value !== 'pending'
    && value !== 'consumed'
    && value !== 'invalidated'
  ) {
    throw new Error(
      'pooled-reserve reservation lifecycle status is unsupported',
    );
  }
  return value;
}

function exactStorageKey(
  value: unknown,
  expected: string,
  label: string,
): string {
  const normalized = lowerByteHex(value, label);
  if (normalized !== expected) {
    throw new Error(`${label} is not the deterministic V4 key`);
  }
  return normalized;
}

function requireEqualHex(
  actual: string,
  expected: string,
  label: string,
): void {
  if (actual !== expected) throw new Error(`${label} is inconsistent`);
}

function sliceHex(bytes: Buffer, start: number, end: number): string {
  return `0x${bytes.subarray(start, end).toString('hex')}`;
}

function blake2b256Hex(value: Uint8Array): string {
  return `0x${Buffer.from(
    blakejs.blake2b(value, undefined, 32),
  ).toString('hex')}`;
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has an unexpected field`);
  }
  return record;
}

function requireLiteral<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    throw new Error(`${label} must be exactly ${expected}`);
  }
  return expected;
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonzero = false,
): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  if (nonzero && /^0x0+$/.test(value)) {
    throw new Error(`${label} must not be zero`);
  }
  return value;
}

function lowerByteHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase bytes`);
  }
  return value;
}

function boundedByteHex(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  const normalized = lowerByteHex(value, label);
  if ((normalized.length - 2) / 2 > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }
  return normalized;
}

function decimalUint64(
  value: unknown,
  label: string,
  positive = false,
  maximum = UINT64_MAX,
): string {
  if (
    typeof value !== 'string'
    || !/^(?:0|[1-9][0-9]*)$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical decimal uint64 string`);
  }
  const parsed = BigInt(value);
  if (parsed > maximum || (positive && parsed === 0n)) {
    throw new Error(`${label} is outside the accepted range`);
  }
  return value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value)
    || Number(value) < minimum
    || Number(value) > maximum
  ) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return Number(value);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function literalTrue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must remain true`);
  return true;
}

function literalFalse(value: unknown, label: string): false {
  if (value !== false) throw new Error(`${label} must remain false`);
  return false;
}

function sha256HexNoPrefix(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (
    value
    && typeof value === 'object'
    && !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
