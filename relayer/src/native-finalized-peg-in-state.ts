import blakejs from 'blakejs';
import { TextDecoder } from 'node:util';

import {
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
  NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
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
import {
  PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
  decodePegInRuntimeProfileV1ScaleHex,
  decodePegInRuntimeRecordV1ScaleHex,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
  type PegInRuntimeProfileV1,
  type PegInRuntimeRecordV1,
} from './peg-in-runtime-state.js';

export const NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-state-request.v1' as const;
export const PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA =
  'e2s.peg-in-runtime-state-statement.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_STATE_VERIFICATION_SCHEMA =
  'e2s.native-finalized-peg-in-state-verification.v1' as const;

const MEMBER = 'membership' as const;
const NON_MEMBER = 'nonMembership' as const;
const MAX_RESULT_PROOF_BYTES = 256 * 1024;
const MAX_JUSTIFICATION_BYTES = 8 * 1024 * 1024;
const AUTHORITY_VERIFIERS = new WeakSet<object>();
const AUTHORITY_VERIFICATIONS = new WeakMap<object, {
  authority: object;
  verifier: object;
  requestDigestHex: string;
  executionPolicySha256: string;
}>();
declare const AUTHORITY_VERIFICATION_BRAND: unique symbol;

export type NativePegInRecordExpectation =
  | {
    outcome: typeof MEMBER;
    expectedRecordScaleHex: string;
  }
  | {
    outcome: typeof NON_MEMBER;
  };

export type NativePegInStateStatementV1 =
  | {
    schema: typeof PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA;
    ergoBoxIdHex: string;
    record: Extract<NativePegInRecordExpectation, { outcome: typeof MEMBER }>;
  }
  | {
    schema: typeof PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA;
    ergoBoxIdHex: string;
    expectedProfileScaleHex: string;
    record: Extract<NativePegInRecordExpectation, { outcome: typeof NON_MEMBER }>;
  };

export interface NativeFinalizedPegInStateRequest {
  schema: typeof NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA;
  trustAnchor: NativeFinalizedBridgeCheckpointRequest['trustAnchor'];
  targetNativeBlockHashHex: string;
  targetHeaderScaleHex: string;
  linkedGrandpaProofs: NativeFinalizedBridgeCheckpointRequest['linkedGrandpaProofs'];
  checkpointTailHeadersScaleHex: string[];
  finalityProofScaleHex: string;
  statement: NativePegInStateStatementV1;
  runtimeStateProofNodesHex: string[];
}

export interface NativeFinalizedPegInStateVerificationPayload {
  schema: typeof NATIVE_FINALIZED_PEG_IN_STATE_VERIFICATION_SCHEMA;
  status: 'NATIVE_PEG_IN_STATE_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT';
  requestDigestHex: string;
  trustAnchorDigestHex: string;
  target: {
    nativeBlockHashHex: string;
    nativeHeight: string;
    stateRootHex: string;
  };
  authority: {
    finalitySigningSetId: string;
    finalitySigningAuthorityListScaleHex: string;
    finalitySigningAuthoritySetHashHex: string;
    transitionCount: number;
    linkedAncestryVerified: true;
  };
  finality: {
    horizonHashHex: string;
    horizonHeight: string;
    canonicalJustificationScaleHex: string;
    verified: true;
  };
  runtimeState: {
    profileStorageKeyHex: string | null;
    profileStorageValueScaleHex: string | null;
    recordStorageKeyHex: string;
    recordStorageValueScaleHex: string | null;
    outcome: 'MEMBERSHIP' | 'NON_MEMBERSHIP';
    proofNodeCount: number;
    proofBytes: number;
    verified: true;
  };
  profile: null | {
    formatVersion: 1;
    sidechainIdHex: string;
    bridgeAddressHex: string;
    profileRevision: string;
    activationHeight: string;
  };
  record: null | {
    formatVersion: 1;
    sidechainIdHex: string;
    bridgeAddressHex: string;
    profileRevision: string;
    profileActivationHeight: string;
    ergoBoxIdHex: string;
    recipientHex: string;
    amountNanoErg: string;
    sidechainHeight: string;
    executionBlockHashHex: string;
    transactionHashHex: string;
    eventIndex: number;
  };
  boundary: {
    sidechainFinalityVerified: true;
    statementRuntimeStateVerified: true;
    historicalMintAbsenceVerified: false;
    runtimeCodeIdentityVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorized: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

export type AuthorityBoundNativeFinalizedPegInStateVerification =
  NativeFinalizedPegInStateVerificationPayload & {
    readonly [AUTHORITY_VERIFICATION_BRAND]: true;
  };

export interface AuthorityBoundNativeFinalizedPegInStateVerifier {
  readonly executableSha256Hex: string;
  readonly executionPolicySha256: string;
  readonly executionBoundary: {
    readonly mode: 'source-refreshed-authority-contained-proof-only';
    readonly sourceOwnedAttestorLockReloadedPerLaunch: true;
    readonly executionPolicyValidatedPerLaunch: true;
    readonly containedProcessRequired: true;
    readonly runtimeCodeIdentityVerified: false;
    readonly mintAuthorityGranted: false;
    readonly settlementAuthorityGranted: false;
    readonly gate5Closed: false;
  };
  deriveExecutableInvocationSha256Hex(trustedAnchorDigestHex: string): string;
  verify(input: {
    trustedAnchorDigestHex: string;
    request: NativeFinalizedPegInStateRequest;
  }): Promise<AuthorityBoundNativeFinalizedPegInStateVerification>;
}

export function createAuthorityBoundNativeFinalizedPegInStateVerifier(
  authority: NativePegInVerifierExecutionAuthority,
): AuthorityBoundNativeFinalizedPegInStateVerifier {
  assertNativePegInVerifierExecutionAuthorityProvenance(authority);
  const declaration = authority.declaration;
  if (declaration.operation !== 'verify-peg-in-state') {
    throw new Error(
      'native finalized peg-in-state verifier authority does not authorize the exact operation',
    );
  }
  const executableSha256Hex = normalizeExecutableSha256Hex(
    declaration.verifierExecutableSha256Hex,
    'authority-bound peg-in verifier executable digest',
  );
  const executionPolicySha256 = sha256HexNoPrefix(
    declaration.executionPolicySha256,
    'authority-bound peg-in execution policy digest',
  );
  const executionBoundary = Object.freeze({
    mode: 'source-refreshed-authority-contained-proof-only' as const,
    sourceOwnedAttestorLockReloadedPerLaunch: true as const,
    executionPolicyValidatedPerLaunch: true as const,
    containedProcessRequired: true as const,
    runtimeCodeIdentityVerified: false as const,
    mintAuthorityGranted: false as const,
    settlementAuthorityGranted: false as const,
    gate5Closed: false as const,
  });

  const verifier: AuthorityBoundNativeFinalizedPegInStateVerifier = Object.freeze({
    executableSha256Hex,
    executionPolicySha256,
    executionBoundary,
    deriveExecutableInvocationSha256Hex(trustedAnchorDigestHex: string): string {
      return deriveExecutableInvocationSha256Hex(executableSha256Hex, [
        '--verify-peg-in-state',
        '--trusted-anchor-digest',
        fixedHex(trustedAnchorDigestHex, 32, 'trusted anchor digest'),
      ]);
    },
    async verify(input: {
      trustedAnchorDigestHex: string;
      request: NativeFinalizedPegInStateRequest;
    }): Promise<AuthorityBoundNativeFinalizedPegInStateVerification> {
      const request = normalizeNativeFinalizedPegInStateRequest(input?.request);
      const trustedAnchorDigestHex = fixedHex(
        input?.trustedAnchorDigestHex,
        32,
        'independently supplied native peg-in trust anchor digest',
      );
      if (
        deriveNativeGrandpaTrustAnchorDigestHex(commonFinalityRequest(request))
        !== trustedAnchorDigestHex
      ) {
        throw new Error('native peg-in request trust anchor does not match the independently supplied digest');
      }
      const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
      if (requestBytes.length > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
        throw new Error(
          `native peg-in verifier request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
        );
      }
      const result = await authority.execute({
        operation: 'verify-peg-in-state',
        trustedAnchorDigestHex,
        requestBytes,
      });
      assertNativePegInVerifierExecutionAuthorityResultProvenance({ authority, result });
      if (result.operation !== 'verify-peg-in-state') {
        throw new Error('authority-bound peg-in verifier result operation does not match');
      }
      const verification = validateNativeFinalizedPegInStatePayloadBindings({
        requestBytes,
        trustedAnchorDigestHex,
        verification: parseSingleJsonObject(result.stdout),
      }) as AuthorityBoundNativeFinalizedPegInStateVerification;
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

export function assertAuthorityBoundNativeFinalizedPegInStateVerifierProvenance(
  verifier: unknown,
): asserts verifier is AuthorityBoundNativeFinalizedPegInStateVerifier {
  if (!verifier || typeof verifier !== 'object' || !AUTHORITY_VERIFIERS.has(verifier)) {
    throw new Error('authority-bound native peg-in verifier provenance is missing');
  }
}

export function assertAuthorityBoundNativeFinalizedPegInStateVerificationFromVerifierProvenance(
  input: {
    verifier: AuthorityBoundNativeFinalizedPegInStateVerifier;
    verification: unknown;
    expectedRequestDigestHex: string;
  },
): asserts input is {
  verifier: AuthorityBoundNativeFinalizedPegInStateVerifier;
  verification: AuthorityBoundNativeFinalizedPegInStateVerification;
  expectedRequestDigestHex: string;
} {
  assertAuthorityBoundNativeFinalizedPegInStateVerifierProvenance(input.verifier);
  if (!input.verification || typeof input.verification !== 'object') {
    throw new Error('authority-bound native peg-in verification provenance is missing');
  }
  const provenance = AUTHORITY_VERIFICATIONS.get(input.verification);
  const expectedRequestDigestHex = fixedHex(
    input.expectedRequestDigestHex,
    32,
    'expected native peg-in request digest',
  );
  if (
    provenance?.verifier !== input.verifier
    || provenance.requestDigestHex !== expectedRequestDigestHex
    || provenance.executionPolicySha256 !== input.verifier.executionPolicySha256
  ) {
    throw new Error('authority-bound native peg-in verification provenance is missing');
  }
}

export function assertAuthorityBoundNativeFinalizedPegInStateVerificationProvenance(input: {
  authority: NativePegInVerifierExecutionAuthority;
  verification: unknown;
  expectedRequestDigestHex: string;
}): asserts input is {
  authority: NativePegInVerifierExecutionAuthority;
  verification: AuthorityBoundNativeFinalizedPegInStateVerification;
  expectedRequestDigestHex: string;
} {
  assertNativePegInVerifierExecutionAuthorityProvenance(input.authority);
  if (!input.verification || typeof input.verification !== 'object') {
    throw new Error('authority-bound native peg-in verification provenance is missing');
  }
  const provenance = AUTHORITY_VERIFICATIONS.get(input.verification);
  const expectedRequestDigestHex = fixedHex(
    input.expectedRequestDigestHex,
    32,
    'expected native peg-in request digest',
  );
  if (
    provenance?.authority !== input.authority
    || provenance.requestDigestHex !== expectedRequestDigestHex
    || provenance.executionPolicySha256
      !== sha256HexNoPrefix(
        input.authority.declaration.executionPolicySha256,
        'authority-bound peg-in execution policy digest',
      )
  ) {
    throw new Error('authority-bound native peg-in verification provenance is missing');
  }
}

/**
 * Strictly normalize the separate peg-in proof request.
 *
 * This reuses only the shared finality-envelope parser. The returned wire schema remains distinct
 * and cannot be passed to the burn-only V2 verifier without being rejected.
 */
export function normalizeNativeFinalizedPegInStateRequest(
  value: unknown,
): NativeFinalizedPegInStateRequest {
  const record = exactRecord(value, [
    'checkpointTailHeadersScaleHex',
    'finalityProofScaleHex',
    'linkedGrandpaProofs',
    'runtimeStateProofNodesHex',
    'schema',
    'statement',
    'targetHeaderScaleHex',
    'targetNativeBlockHashHex',
    'trustAnchor',
  ], 'native finalized peg-in state request');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA,
    'native finalized peg-in state request schema',
  );

  const common = normalizeNativeFinalizedBridgeCheckpointRequest({
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: record.trustAnchor,
    targetNativeBlockHashHex: record.targetNativeBlockHashHex,
    targetHeaderScaleHex: record.targetHeaderScaleHex,
    linkedGrandpaProofs: record.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: record.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: record.finalityProofScaleHex,
    runtimeStateProofNodesHex: record.runtimeStateProofNodesHex,
  });
  const statement = normalizeNativePegInStateStatementV1(
    record.statement,
    common.trustAnchor.sidechainIdHex,
  );

  return {
    schema: NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA,
    trustAnchor: common.trustAnchor,
    targetNativeBlockHashHex: common.targetNativeBlockHashHex,
    targetHeaderScaleHex: common.targetHeaderScaleHex,
    linkedGrandpaProofs: common.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: common.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: common.finalityProofScaleHex,
    statement,
    runtimeStateProofNodesHex: common.runtimeStateProofNodesHex,
  };
}

export function deriveNativeFinalizedPegInStateRequestDigestHex(value: unknown): string {
  const request = normalizeNativeFinalizedPegInStateRequest(value);
  return blake2b256Hex(Buffer.from(JSON.stringify(request), 'utf8'));
}

export function normalizeNativePegInStateStatementV1(
  value: unknown,
  sidechainIdHex: string,
): NativePegInStateStatementV1 {
  const expectedSidechainIdHex = fixedHex(
    sidechainIdHex,
    32,
    'statement trust-anchor sidechain ID',
  );
  const statementRecord = objectRecord(value, 'native peg-in state statement');
  requireLiteral(
    statementRecord.schema,
    PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
    'native peg-in state statement schema',
  );
  const ergoBoxIdHex = fixedHex(statementRecord.ergoBoxIdHex, 32, 'statement Ergo box ID', true);

  const expectationRecord = objectRecord(statementRecord.record, 'record expectation');
  let statement: NativePegInStateStatementV1;
  if (expectationRecord.outcome === MEMBER) {
    exactKeys(statementRecord, ['ergoBoxIdHex', 'record', 'schema'], 'membership statement');
    exactKeys(expectationRecord, ['expectedRecordScaleHex', 'outcome'], 'membership expectation');
    const expectedRecordScaleHex = lowerByteHex(
      expectationRecord.expectedRecordScaleHex,
      'statement expected record SCALE value',
    );
    const expected = decodePegInRuntimeRecordV1ScaleHex(expectedRecordScaleHex);
    assertExpectedRecordIdentity(
      expected,
      expectedSidechainIdHex,
      ergoBoxIdHex,
    );
    statement = {
      schema: PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
      ergoBoxIdHex,
      record: { outcome: MEMBER, expectedRecordScaleHex },
    };
  } else if (expectationRecord.outcome === NON_MEMBER) {
    exactKeys(
      statementRecord,
      ['ergoBoxIdHex', 'expectedProfileScaleHex', 'record', 'schema'],
      'non-membership statement',
    );
    exactKeys(expectationRecord, ['outcome'], 'non-membership expectation');
    const expectedProfileScaleHex = lowerByteHex(
      statementRecord.expectedProfileScaleHex,
      'statement expected profile SCALE value',
    );
    const profile = decodePegInRuntimeProfileV1ScaleHex(expectedProfileScaleHex);
    if (
      fixedHex(profile.sidechainIdHex, 32, 'profile sidechain ID')
        !== expectedSidechainIdHex
    ) {
      throw new Error('native peg-in statement profile sidechain ID does not match the trust anchor');
    }
    statement = {
      schema: PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
      ergoBoxIdHex,
      expectedProfileScaleHex,
      record: { outcome: NON_MEMBER },
    };
  } else {
    throw new Error('native peg-in record expectation outcome is unsupported');
  }
  return statement;
}

/**
 * Validate exact native output bindings without granting process provenance or mint authority.
 * The caller must supply the exact verifier stdin bytes and an independently reviewed trust-anchor
 * digest. A later authority-bound broker must establish that the reviewed executable produced this
 * payload from those bytes.
 */
export function validateNativeFinalizedPegInStatePayloadBindings(input: {
  requestBytes: Uint8Array;
  trustedAnchorDigestHex: unknown;
  verification: unknown;
}): NativeFinalizedPegInStateVerificationPayload {
  let decodedRequest: unknown;
  try {
    decodedRequest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.requestBytes));
  } catch (error) {
    throw new Error('native peg-in verifier request bytes are not valid UTF-8 JSON', {
      cause: error,
    });
  }
  const request = normalizeNativeFinalizedPegInStateRequest(decodedRequest);
  const independentlyTrustedAnchorDigestHex = fixedHex(
    input.trustedAnchorDigestHex,
    32,
    'independently supplied native peg-in trust anchor digest',
  );
  const result = exactRecord(input.verification, [
    'authority',
    'boundary',
    'finality',
    'profile',
    'record',
    'requestDigestHex',
    'runtimeState',
    'schema',
    'status',
    'target',
    'trustAnchorDigestHex',
  ], 'native finalized peg-in state verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_PEG_IN_STATE_VERIFICATION_SCHEMA,
    'native finalized peg-in state verification schema',
  );
  requireLiteral(
    result.status,
    'NATIVE_PEG_IN_STATE_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
    'native finalized peg-in state verification status',
  );

  const requestDigestHex = fixedHex(
    result.requestDigestHex,
    32,
    'native peg-in verification request digest',
  );
  const exactRequestDigest = blake2b256Hex(Buffer.from(input.requestBytes));
  if (requestDigestHex !== exactRequestDigest) {
    throw new Error('native peg-in verification request digest does not match the exact request');
  }
  const trustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'native peg-in verification trust anchor digest',
  );
  const commonRequest = commonFinalityRequest(request);
  const derivedTrustAnchorDigestHex = deriveNativeGrandpaTrustAnchorDigestHex(commonRequest);
  if (derivedTrustAnchorDigestHex !== independentlyTrustedAnchorDigestHex) {
    throw new Error('native peg-in request does not match the independently supplied trust anchor');
  }
  if (trustAnchorDigestHex !== independentlyTrustedAnchorDigestHex) {
    throw new Error('native peg-in verification does not match the independently supplied trust anchor');
  }

  const targetRecord = exactRecord(result.target, [
    'nativeBlockHashHex',
    'nativeHeight',
    'stateRootHex',
  ], 'native peg-in verification target');
  const target = {
    nativeBlockHashHex: fixedHex(targetRecord.nativeBlockHashHex, 32, 'target native block hash'),
    nativeHeight: decimalUint64(targetRecord.nativeHeight, 'target native height'),
    stateRootHex: fixedHex(targetRecord.stateRootHex, 32, 'target state root'),
  };
  if (target.nativeBlockHashHex !== request.targetNativeBlockHashHex) {
    throw new Error('native peg-in verification target hash does not match the request');
  }

  const authorityRecord = exactRecord(result.authority, [
    'finalitySigningAuthorityListScaleHex',
    'finalitySigningAuthoritySetHashHex',
    'finalitySigningSetId',
    'linkedAncestryVerified',
    'transitionCount',
  ], 'native peg-in verification authority');
  const authority = {
    finalitySigningSetId: decimalUint64(
      authorityRecord.finalitySigningSetId,
      'finality signing set ID',
    ),
    finalitySigningAuthorityListScaleHex: lowerByteHex(
      authorityRecord.finalitySigningAuthorityListScaleHex,
      'finality signing authority list',
    ),
    finalitySigningAuthoritySetHashHex: fixedHex(
      authorityRecord.finalitySigningAuthoritySetHashHex,
      32,
      'finality signing authority-set hash',
    ),
    transitionCount: boundedInteger(authorityRecord.transitionCount, 'authority transition count'),
    linkedAncestryVerified: literalTrue(
      authorityRecord.linkedAncestryVerified,
      'linked ancestry verification',
    ),
  };
  if (
    BigInt(authority.finalitySigningSetId)
      !== BigInt(request.trustAnchor.grandpaSetId) + BigInt(authority.transitionCount)
  ) {
    throw new Error('native peg-in verification finality set ID is not linked to the trust anchor');
  }
  if (
    authority.finalitySigningAuthoritySetHashHex
      !== deriveAuthoritySetHashHex(authority.finalitySigningAuthorityListScaleHex)
  ) {
    throw new Error('native peg-in verification authority-set hash is inconsistent');
  }

  const finalityRecord = exactRecord(result.finality, [
    'canonicalJustificationScaleHex',
    'horizonHashHex',
    'horizonHeight',
    'verified',
  ], 'native peg-in verification finality');
  const finality = {
    horizonHashHex: fixedHex(finalityRecord.horizonHashHex, 32, 'finality horizon hash'),
    horizonHeight: decimalUint64(finalityRecord.horizonHeight, 'finality horizon height'),
    canonicalJustificationScaleHex: boundedByteHex(
      finalityRecord.canonicalJustificationScaleHex,
      MAX_JUSTIFICATION_BYTES,
      'canonical GRANDPA justification',
    ),
    verified: literalTrue(finalityRecord.verified, 'finality verified'),
  };
  if (BigInt(finality.horizonHeight) < BigInt(target.nativeHeight)) {
    throw new Error('native peg-in verification finality horizon precedes the target');
  }

  const runtimeRecord = exactRecord(result.runtimeState, [
    'outcome',
    'profileStorageKeyHex',
    'profileStorageValueScaleHex',
    'proofBytes',
    'proofNodeCount',
    'recordStorageKeyHex',
    'recordStorageValueScaleHex',
    'verified',
  ], 'native peg-in verification runtime state');
  const recordStorageKeyHex = lowerByteHex(
    runtimeRecord.recordStorageKeyHex,
    'processed peg-in storage key',
  );
  const expectedStorageKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: request.trustAnchor.sidechainIdHex,
    ergoBoxIdHex: request.statement.ergoBoxIdHex,
  });
  if (recordStorageKeyHex !== expectedStorageKey) {
    throw new Error('native peg-in verification record storage key is not the derived identity');
  }
  const proofNodeCount = boundedInteger(runtimeRecord.proofNodeCount, 'state proof node count');
  if (proofNodeCount !== request.runtimeStateProofNodesHex.length) {
    throw new Error('native peg-in verification proof-node count does not match the request');
  }
  const expectedProofBytes = request.runtimeStateProofNodesHex.reduce(
    (total, node) => total + (node.length - 2) / 2,
    0,
  );
  const proofBytes = boundedInteger(runtimeRecord.proofBytes, 'state proof byte count');
  if (proofBytes !== expectedProofBytes || proofBytes > MAX_RESULT_PROOF_BYTES) {
    throw new Error('native peg-in verification proof byte count does not match the request');
  }
  const verified = literalTrue(runtimeRecord.verified, 'runtime state verified');

  let profileStorageKeyHex: string | null;
  let profileStorageValueScaleHex: string | null;
  let profile: NativeFinalizedPegInStateVerificationPayload['profile'];
  let outcome: 'MEMBERSHIP' | 'NON_MEMBERSHIP';
  let recordStorageValueScaleHex: string | null;
  let normalizedRecord: NativeFinalizedPegInStateVerificationPayload['record'];
  if (request.statement.record.outcome === MEMBER) {
    requireLiteral(runtimeRecord.outcome, 'MEMBERSHIP', 'runtime record outcome');
    if (
      runtimeRecord.profileStorageKeyHex !== null
      || runtimeRecord.profileStorageValueScaleHex !== null
      || result.profile !== null
    ) {
      throw new Error('native peg-in membership result must not depend on a current profile');
    }
    profileStorageKeyHex = null;
    profileStorageValueScaleHex = null;
    profile = null;
    outcome = 'MEMBERSHIP';
    recordStorageValueScaleHex = lowerByteHex(
      runtimeRecord.recordStorageValueScaleHex,
      'processed peg-in storage value',
    );
    if (recordStorageValueScaleHex !== request.statement.record.expectedRecordScaleHex) {
      throw new Error('native peg-in verification record value differs from the statement');
    }
    const expectedRecord = decodePegInRuntimeRecordV1ScaleHex(recordStorageValueScaleHex);
    if (BigInt(expectedRecord.sidechainHeight) > BigInt(target.nativeHeight)) {
      throw new Error('native peg-in record height exceeds the target header');
    }
    normalizedRecord = normalizeRecordOutput(result.record, expectedRecord);
  } else {
    requireLiteral(runtimeRecord.outcome, 'NON_MEMBERSHIP', 'runtime record outcome');
    if (!('expectedProfileScaleHex' in request.statement)) {
      throw new Error('native peg-in non-membership statement requires a current profile');
    }
    profileStorageKeyHex = fixedHex(
      runtimeRecord.profileStorageKeyHex,
      32,
      'peg-in profile storage key',
    );
    if (profileStorageKeyHex !== PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX) {
      throw new Error('native peg-in verification profile storage key is not canonical');
    }
    profileStorageValueScaleHex = lowerByteHex(
      runtimeRecord.profileStorageValueScaleHex,
      'peg-in profile storage value',
    );
    if (profileStorageValueScaleHex !== request.statement.expectedProfileScaleHex) {
      throw new Error('native peg-in verification profile value differs from the statement');
    }
    const expectedProfile = decodePegInRuntimeProfileV1ScaleHex(
      request.statement.expectedProfileScaleHex,
    );
    if (BigInt(expectedProfile.activationHeight) >= BigInt(target.nativeHeight)) {
      throw new Error('native peg-in profile is not active before the target header');
    }
    profile = normalizeProfileOutput(result.profile, expectedProfile);
    if (runtimeRecord.recordStorageValueScaleHex !== null || result.record !== null) {
      throw new Error('native peg-in non-membership result must not contain a record value');
    }
    outcome = 'NON_MEMBERSHIP';
    recordStorageValueScaleHex = null;
    normalizedRecord = null;
  }

  const boundaryRecord = exactRecord(result.boundary, [
    'committedVaultTransitionVerified',
    'statementRuntimeStateVerified',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'mintAuthorized',
    'runtimeCodeIdentityVerified',
    'sidechainFinalityVerified',
    'transactionMutationEnabled',
  ], 'native peg-in verification boundary');
  const boundary = {
    sidechainFinalityVerified: literalTrue(
      boundaryRecord.sidechainFinalityVerified,
      'sidechain finality boundary',
    ),
    statementRuntimeStateVerified: literalTrue(
      boundaryRecord.statementRuntimeStateVerified,
      'statement-specific runtime state boundary',
    ),
    historicalMintAbsenceVerified: literalFalse(
      boundaryRecord.historicalMintAbsenceVerified,
      'historical mint absence boundary',
    ),
    runtimeCodeIdentityVerified: literalFalse(
      boundaryRecord.runtimeCodeIdentityVerified,
      'runtime code identity boundary',
    ),
    committedVaultTransitionVerified: literalFalse(
      boundaryRecord.committedVaultTransitionVerified,
      'committed-vault boundary',
    ),
    mintAuthorized: literalFalse(boundaryRecord.mintAuthorized, 'mint authorization boundary'),
    transactionMutationEnabled: literalFalse(
      boundaryRecord.transactionMutationEnabled,
      'transaction mutation boundary',
    ),
    gate5Closed: literalFalse(boundaryRecord.gate5Closed, 'Gate 5 boundary'),
  };

  return deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_STATE_VERIFICATION_SCHEMA,
    status: 'NATIVE_PEG_IN_STATE_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
    requestDigestHex,
    trustAnchorDigestHex,
    target,
    authority,
    finality,
    runtimeState: {
      profileStorageKeyHex,
      profileStorageValueScaleHex,
      recordStorageKeyHex,
      recordStorageValueScaleHex,
      outcome,
      proofNodeCount,
      proofBytes,
      verified,
    },
    profile,
    record: normalizedRecord,
    boundary,
  });
}

function commonFinalityRequest(
  request: NativeFinalizedPegInStateRequest,
): NativeFinalizedBridgeCheckpointRequest {
  return {
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: request.trustAnchor,
    targetNativeBlockHashHex: request.targetNativeBlockHashHex,
    targetHeaderScaleHex: request.targetHeaderScaleHex,
    linkedGrandpaProofs: request.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: request.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: request.finalityProofScaleHex,
    runtimeStateProofNodesHex: request.runtimeStateProofNodesHex,
  };
}

function parseSingleJsonObject(stdout: Buffer): unknown {
  if (stdout.length === 0) throw new Error('native peg-in verifier produced empty stdout');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  } catch {
    throw new Error('native peg-in verifier stdout is not valid UTF-8');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('native peg-in verifier stdout must contain exactly one JSON result');
  }
}

function sha256HexNoPrefix(value: unknown, label: string): string {
  if (typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)) return value;
  if (typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value)) return value.slice(2);
  throw new Error(`${label} must be a lowercase SHA-256 digest`);
}

function normalizeProfileOutput(
  value: unknown,
  expected: PegInRuntimeProfileV1,
): NativeFinalizedPegInStateVerificationPayload['profile'] {
  const record = exactRecord(value, [
    'activationHeight',
    'bridgeAddressHex',
    'formatVersion',
    'profileRevision',
    'sidechainIdHex',
  ], 'native peg-in profile output');
  requireLiteral(record.formatVersion, 1, 'profile output format version');
  const profile = {
    formatVersion: 1 as const,
    sidechainIdHex: fixedHex(record.sidechainIdHex, 32, 'profile output sidechain ID'),
    bridgeAddressHex: fixedHex(record.bridgeAddressHex, 20, 'profile output bridge address', true),
    profileRevision: decimalUint64(record.profileRevision, 'profile output revision', true),
    activationHeight: decimalUint64(record.activationHeight, 'profile output activation height'),
  };
  if (
    profile.sidechainIdHex !== fixedHex(expected.sidechainIdHex, 32, 'expected profile sidechain ID')
    || profile.bridgeAddressHex !== fixedHex(expected.bridgeAddress, 20, 'expected profile bridge address')
    || profile.profileRevision !== String(expected.profileRevision)
    || profile.activationHeight !== String(expected.activationHeight)
  ) {
    throw new Error('native peg-in profile output differs from authenticated profile bytes');
  }
  return profile;
}

function normalizeRecordOutput(
  value: unknown,
  expected: PegInRuntimeRecordV1,
): NonNullable<NativeFinalizedPegInStateVerificationPayload['record']> {
  const record = exactRecord(value, [
    'amountNanoErg',
    'bridgeAddressHex',
    'ergoBoxIdHex',
    'eventIndex',
    'executionBlockHashHex',
    'formatVersion',
    'profileActivationHeight',
    'profileRevision',
    'recipientHex',
    'sidechainHeight',
    'sidechainIdHex',
    'transactionHashHex',
  ], 'native peg-in record output');
  requireLiteral(record.formatVersion, 1, 'record output format version');
  const normalized = {
    formatVersion: 1 as const,
    sidechainIdHex: fixedHex(record.sidechainIdHex, 32, 'record output sidechain ID'),
    bridgeAddressHex: fixedHex(record.bridgeAddressHex, 20, 'record output bridge address', true),
    profileRevision: decimalUint64(record.profileRevision, 'record output profile revision', true),
    profileActivationHeight: decimalUint64(
      record.profileActivationHeight,
      'record output profile activation height',
    ),
    ergoBoxIdHex: fixedHex(record.ergoBoxIdHex, 32, 'record output Ergo box ID', true),
    recipientHex: fixedHex(record.recipientHex, 20, 'record output recipient', true),
    amountNanoErg: decimalUint64(record.amountNanoErg, 'record output amount', true),
    sidechainHeight: decimalUint64(record.sidechainHeight, 'record output sidechain height'),
    executionBlockHashHex: fixedHex(
      record.executionBlockHashHex,
      32,
      'record output execution block hash',
      true,
    ),
    transactionHashHex: fixedHex(
      record.transactionHashHex,
      32,
      'record output transaction hash',
      true,
    ),
    eventIndex: boundedInteger(record.eventIndex, 'record output event index', 0xffff_ffff),
  };
  const expectedComparable = {
    formatVersion: 1,
    sidechainIdHex: fixedHex(expected.sidechainIdHex, 32, 'expected record sidechain ID'),
    bridgeAddressHex: fixedHex(expected.bridgeAddress, 20, 'expected record bridge address'),
    profileRevision: String(expected.profileRevision),
    profileActivationHeight: String(expected.profileActivationHeight),
    ergoBoxIdHex: fixedHex(expected.ergoBoxIdHex, 32, 'expected record Ergo box ID'),
    recipientHex: fixedHex(expected.recipientAddress, 20, 'expected record recipient'),
    amountNanoErg: String(expected.amountNanoErg),
    sidechainHeight: String(expected.sidechainHeight),
    executionBlockHashHex: fixedHex(
      expected.executionBlockHashHex,
      32,
      'expected record execution block hash',
    ),
    transactionHashHex: fixedHex(expected.transactionHashHex, 32, 'expected record transaction hash'),
    eventIndex: expected.eventIndex,
  };
  if (JSON.stringify(normalized) !== JSON.stringify(expectedComparable)) {
    throw new Error('native peg-in record output differs from authenticated record bytes');
  }
  return normalized;
}

function assertExpectedRecordIdentity(
  record: PegInRuntimeRecordV1,
  expectedSidechainIdHex: string,
  ergoBoxIdHex: string,
): void {
  if (fixedHex(record.sidechainIdHex, 32, 'record sidechain ID') !== fixedHex(
    expectedSidechainIdHex,
    32,
    'trust-anchor sidechain ID',
  )) {
    throw new Error('native peg-in record sidechain ID does not match the trust-anchor domain');
  }
  if (fixedHex(record.ergoBoxIdHex, 32, 'record Ergo box ID') !== ergoBoxIdHex) {
    throw new Error('native peg-in record Ergo box ID does not match the statement key');
  }
  if (BigInt(record.sidechainHeight) <= BigInt(record.profileActivationHeight)) {
    throw new Error('native peg-in record does not follow its historical profile activation');
  }
}

function deriveAuthoritySetHashHex(authorityListScaleHex: string): string {
  return blake2b256Hex(Buffer.concat([
    Buffer.from('E2S_GRANDPA_AUTHORITY_SET_V1', 'ascii'),
    Buffer.from(authorityListScaleHex.slice(2), 'hex'),
  ]));
}

function blake2b256Hex(value: Buffer): string {
  return `0x${Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex')}`;
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = objectRecord(value, label);
  exactKeys(record, expectedKeys, label);
  return record;
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unexpected field`);
  }
}

function requireLiteral<T extends string | number>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must be exactly ${String(expected)}`);
  return expected;
}

function lowerByteHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase 0x-prefixed bytes`);
  }
  return value;
}

function boundedByteHex(value: unknown, maxBytes: number, label: string): string {
  const normalized = lowerByteHex(value, label);
  if ((normalized.length - 2) / 2 > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return normalized;
}

function fixedHex(value: unknown, bytes: number, label: string, nonzero = false): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  if (nonzero && /^0x0+$/.test(value)) throw new Error(`${label} must not be zero`);
  return value;
}

function decimalUint64(value: unknown, label: string, positive = false): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal uint64`);
  }
  const parsed = BigInt(value);
  if (parsed > (1n << 64n) - 1n || (positive && parsed === 0n)) {
    throw new Error(`${label} is outside the accepted uint64 range`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new Error(`${label} must be a bounded non-negative integer`);
  }
  return value as number;
}

function literalTrue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must remain true`);
  return true;
}

function literalFalse(value: unknown, label: string): false {
  if (value !== false) throw new Error(`${label} must remain false`);
  return false;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
