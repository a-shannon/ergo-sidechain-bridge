import { createHash } from 'crypto';

import {
  assertAuthenticatedSettlementCheckAdmissionProvenance,
  type AuthenticatedSettlementCheckAdmission,
} from './authenticated-settlement-check-admission.js';
import {
  assertAuthenticatedSettlementStableErgoViewProvenance,
  type AuthenticatedSettlementStableErgoView,
} from './authenticated-settlement-ergo-anchor.js';
import {
  assertAuthenticatedSettlementStableSidechainViewMatchesRevalidation,
  assertAuthenticatedSettlementStableSidechainViewProvenance,
  type AuthenticatedSettlementStableSidechainView,
} from './authenticated-settlement-sidechain-view.js';
import {
  assertAuthenticatedSettlementJvmCheckAcceptanceProvenance,
  assertRevalidatedAuthenticatedSettlementCandidateProvenance,
  type AuthenticatedSettlementJvmCheckAcceptance,
  type RevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-jvm-check.js';
import {
  assertPackageBoundAuthenticatedSettlementProvenance,
  type PackageBoundAuthenticatedSettlement,
} from './authenticated-v2-settlement-package-binding.js';
import type {
  AuthenticatedSettlementCandidate,
  StateTracker,
} from './state-tracker.js';

const AUTHENTICATED_SETTLEMENT_EXECUTION_AUTHORIZATIONS = new WeakSet<object>();

export interface AuthenticatedSettlementExecutionAuthorization {
  candidateId: string;
  candidateAuthorityDigestHex: string;
  burnId: string;
  burnTxHash: string;
  amountNanoErg: bigint;
  recipientErgoTreeHex: string;
  duplicatePreventionBoxId: string;
  vaultBoxId: string;
  expectedTxId: string;
  unsignedTxDigestHex: string;
  unsignedPackageDigestHex: string;
  signedTransactionDigestHex: string;
  checkResponseDigestHex: string;
  signerContextDigestHex: string;
  checkerIdentityDigestHex: string;
  revalidationDigestHex: string;
  stableErgoViewDigestHex: string;
  stableSidechainViewDigestHex: string;
  finalityProofDigestHex: string;
  checkAdmissionDigestHex: string;
  authorizationDigestHex: string;
}

type CandidateState = Pick<StateTracker, 'getAuthenticatedSettlementCandidate'>;

export function authorizeAuthenticatedSettlementExecution(input: {
  state: CandidateState;
  candidateId: string;
  revalidated: RevalidatedAuthenticatedSettlementCandidate;
  packageBinding: PackageBoundAuthenticatedSettlement;
  acceptance: AuthenticatedSettlementJvmCheckAcceptance;
  checkAdmission: AuthenticatedSettlementCheckAdmission;
  stableErgoView: AuthenticatedSettlementStableErgoView;
  stableSidechainView: AuthenticatedSettlementStableSidechainView;
}): AuthenticatedSettlementExecutionAuthorization {
  assertRevalidatedAuthenticatedSettlementCandidateProvenance(input.revalidated);
  assertPackageBoundAuthenticatedSettlementProvenance(input.packageBinding);
  assertAuthenticatedSettlementJvmCheckAcceptanceProvenance(input.acceptance);
  assertAuthenticatedSettlementCheckAdmissionProvenance(input.checkAdmission);
  assertAuthenticatedSettlementStableErgoViewProvenance(input.stableErgoView);
  assertAuthenticatedSettlementStableSidechainViewProvenance(input.stableSidechainView);
  assertAuthenticatedSettlementStableSidechainViewMatchesRevalidation(
    input.stableSidechainView,
    input.revalidated,
  );

  const candidateId = fixedHex(input.candidateId, 'authenticated settlement candidate ID');
  const candidate = input.state.getAuthenticatedSettlementCandidate(candidateId);
  if (!candidate) throw new Error('authenticated settlement candidate is unavailable at authorization');
  if (candidate.status !== 'check_passed') {
    throw new Error('authenticated settlement candidate is not currently check-passed');
  }
  if (candidate.invalidationReason !== null) {
    throw new Error('authenticated settlement candidate carries an invalidation reason');
  }

  const expectedTxId = exactHexGroup('checked transaction ID', [
    candidate.checkExpectedTxId,
    input.revalidated.expectedTxId,
    input.packageBinding.expectedTxId,
    input.acceptance.expectedTxId,
    input.checkAdmission.expectedTxId,
  ]);
  exactHexGroup('candidate ID', [
    candidate.candidateId,
    input.revalidated.candidateId,
    input.acceptance.candidateId,
    input.checkAdmission.candidateId,
    input.stableErgoView.candidateId,
    candidateId,
  ]);
  const unsignedPackageDigestHex = exactHexGroup('unsigned package digest', [
    candidate.checkUnsignedPackageDigest,
    input.packageBinding.packageDigestHex,
    input.acceptance.unsignedPackageDigestHex,
    input.checkAdmission.unsignedPackageDigestHex,
  ]);
  const signedTransactionDigestHex = exactHexGroup('signed transaction digest', [
    candidate.checkSignedTransactionDigest,
    input.acceptance.signedTransactionDigestHex,
    input.checkAdmission.signedTransactionDigestHex,
  ]);
  const checkResponseDigestHex = exactHexGroup('JVM check response digest', [
    candidate.checkResponseDigest,
    input.acceptance.checkResponseDigestHex,
    input.checkAdmission.checkResponseDigestHex,
  ]);
  const signerContextDigestHex = exactHexGroup('signer context digest', [
    candidate.checkSignerContextDigest,
    input.acceptance.signerContextDigestHex,
    input.checkAdmission.signerContextDigestHex,
  ]);
  const checkerIdentityDigestHex = exactHexGroup('checker identity digest', [
    candidate.checkCheckerIdentityDigest,
    input.acceptance.checkerIdentityDigestHex,
    input.checkAdmission.checkerIdentityDigestHex,
  ]);
  const revalidationDigestHex = exactHexGroup('candidate revalidation digest', [
    candidate.checkRevalidationDigest,
    input.revalidated.revalidationDigestHex,
    input.acceptance.revalidationDigestHex,
    input.checkAdmission.revalidationDigestHex,
  ]);
  const unsignedTxDigestHex = exactHexGroup('unsigned transaction digest', [
    candidate.unsignedTxDigest,
    input.revalidated.unsignedTxDigest,
    input.stableErgoView.unsignedTxDigestHex,
  ]);
  exactHexGroup('native verification request digest', [
    candidate.checkNativeVerificationRequestDigest,
    input.revalidated.nativeVerificationRequestDigestHex,
    input.acceptance.nativeVerificationRequestDigestHex,
    input.checkAdmission.nativeVerificationRequestDigestHex,
  ]);
  exactHexGroup('native trust anchor digest', [
    candidate.checkTrustAnchorDigest,
    input.revalidated.trustAnchorDigestHex,
    input.acceptance.trustAnchorDigestHex,
    input.checkAdmission.trustAnchorDigestHex,
  ]);
  exactHexGroup('finality horizon hash', [
    candidate.checkFinalityHorizonHash,
    input.revalidated.finalityHorizonHashHex,
    input.acceptance.finalityHorizonHashHex,
    input.checkAdmission.finalityHorizonHashHex,
  ]);
  exactBigIntGroup('finality horizon height', [
    candidate.checkFinalityHorizonHeight,
    input.revalidated.finalityHorizonHeight,
    input.acceptance.finalityHorizonHeight,
    input.checkAdmission.finalityHorizonHeight,
  ]);
  exactHexGroup('finality statement digest', [
    candidate.checkFinalityStatementDigest,
    input.revalidated.finalityStatementDigestHex,
    input.acceptance.finalityStatementDigestHex,
    input.checkAdmission.finalityStatementDigestHex,
  ]);
  exactHexGroup('finality program ID', [
    candidate.checkFinalityProgramId,
    input.revalidated.finalityProgramIdHex,
    input.acceptance.finalityProgramIdHex,
    input.checkAdmission.finalityProgramIdHex,
  ]);
  exactIntegerGroup('finality proof system ID', [
    candidate.checkFinalityProofSystemId,
    input.revalidated.finalityProofSystemId,
    input.acceptance.finalityProofSystemId,
    input.checkAdmission.finalityProofSystemId,
  ]);
  exactHexGroup('finality verifier profile ID', [
    candidate.checkFinalityVerifierProfileId,
    input.revalidated.finalityVerifierProfileIdHex,
    input.acceptance.finalityVerifierProfileIdHex,
    input.checkAdmission.finalityVerifierProfileIdHex,
  ]);
  exactHexGroup('finality proof payload digest', [
    candidate.checkFinalityProofPayloadDigest,
    input.revalidated.finalityProofPayloadDigestHex,
    input.acceptance.finalityProofPayloadDigestHex,
    input.checkAdmission.finalityProofPayloadDigestHex,
  ]);
  const finalityProofDigestHex = exactHexGroup('aggregate finality proof digest', [
    candidate.checkFinalityProofDigest,
    input.revalidated.finalityProofDigestHex,
    input.acceptance.finalityProofDigestHex,
    input.checkAdmission.finalityProofDigestHex,
  ]);

  if (input.packageBinding.prepared !== input.revalidated.prepared) {
    throw new Error('unsigned package and revalidation do not share the exact prepared transaction');
  }
  if (
    fixedHex(input.stableErgoView.anchorHeaderIdHex, 'stable Ergo anchor header ID')
      !== fixedHex(candidate.anchorHeaderId, 'candidate anchor header ID')
    || input.stableErgoView.anchorHeaderHeight !== candidate.anchorHeaderHeight
    || fixedHex(input.stableErgoView.trackerBoxIdHex, 'stable tracker box ID')
      !== fixedHex(candidate.trackerBoxId, 'candidate tracker box ID')
    || fixedHex(input.stableErgoView.duplicatePreventionBoxIdHex, 'stable DUP box ID')
      !== fixedHex(candidate.dupInputBoxId, 'candidate DUP box ID')
    || fixedHex(input.stableErgoView.vaultBoxIdHex, 'stable vault box ID')
      !== fixedHex(candidate.vaultBoxId, 'candidate vault box ID')
  ) {
    throw new Error('stable Ergo view does not match the current candidate inputs and anchor');
  }
  if (
    fixedHex(input.stableSidechainView.candidateId, 'stable sidechain candidate ID')
      !== candidateId
    || fixedHex(input.stableSidechainView.burnIdHex, 'stable sidechain burn ID')
      !== fixedHex(candidate.burnId, 'candidate burn ID')
    || fixedHex(input.stableSidechainView.sidechainIdHex, 'stable sidechain ID')
      !== fixedHex(candidate.sidechainId, 'candidate sidechain ID')
    || fixedHex(input.stableSidechainView.sidechainTxHashHex, 'stable sidechain transaction hash')
      !== fixedHex(candidate.burnTxHash, 'candidate burn transaction hash')
    || input.stableSidechainView.sidechainHeight !== candidate.sidechainHeight
    || fixedHex(input.stableSidechainView.executionBlockHashHex, 'stable execution block hash')
      !== fixedHex(candidate.sidechainBlockHash, 'candidate execution block hash')
    || input.stableSidechainView.eventIndex !== candidate.sidechainLogIndex
  ) {
    throw new Error('stable sidechain view does not match the current candidate burn');
  }
  const binding = {
    candidateId,
    candidateAuthorityDigestHex:
      deriveAuthenticatedSettlementCandidateAuthorityDigest(candidate),
    burnId: exactHexGroup('burn ID', [
      candidate.burnId,
      input.stableSidechainView.burnIdHex,
    ]),
    burnTxHash: exactHexGroup('burn transaction hash', [
      candidate.burnTxHash,
      input.stableSidechainView.sidechainTxHashHex,
    ]),
    amountNanoErg: exactBigIntGroup('settlement amount', [
      input.revalidated.amountNanoErg,
      input.stableSidechainView.amountNanoErg,
    ]),
    recipientErgoTreeHex: exactSizedHexGroup('settlement recipient ErgoTree', 36, [
      input.revalidated.recipientErgoTreeHex,
      input.stableSidechainView.recipientErgoTreeHex,
    ]),
    duplicatePreventionBoxId: exactHexGroup('DUP input box ID', [
      candidate.dupInputBoxId,
      input.stableErgoView.duplicatePreventionBoxIdHex,
    ]),
    vaultBoxId: exactHexGroup('settlement vault box ID', [
      candidate.vaultBoxId,
      input.stableErgoView.vaultBoxIdHex,
    ]),
    expectedTxId,
    unsignedTxDigestHex,
    unsignedPackageDigestHex,
    signedTransactionDigestHex,
    checkResponseDigestHex,
    signerContextDigestHex,
    checkerIdentityDigestHex,
    revalidationDigestHex,
    stableErgoViewDigestHex: exactHexGroup('stable Ergo view digest', [
      candidate.checkStableErgoViewDigest,
      input.checkAdmission.stableErgoViewDigestHex,
      input.stableErgoView.viewDigestHex,
    ]),
    stableSidechainViewDigestHex: exactHexGroup('stable sidechain view digest', [
      candidate.checkStableSidechainViewDigest,
      input.checkAdmission.stableSidechainViewDigestHex,
      input.stableSidechainView.viewDigestHex,
    ]),
    finalityProofDigestHex,
    checkAdmissionDigestHex: exactHexGroup('check admission digest', [
      candidate.checkAdmissionDigest,
      input.checkAdmission.admissionDigestHex,
    ]),
  };
  const authorization = Object.freeze({
    ...binding,
    authorizationDigestHex: sha256Canonical(binding),
  });
  AUTHENTICATED_SETTLEMENT_EXECUTION_AUTHORIZATIONS.add(authorization);
  return authorization;
}

export function assertAuthenticatedSettlementExecutionAuthorizationProvenance(
  authorization: unknown,
): asserts authorization is AuthenticatedSettlementExecutionAuthorization {
  if (
    typeof authorization !== 'object'
    || authorization === null
    || !AUTHENTICATED_SETTLEMENT_EXECUTION_AUTHORIZATIONS.has(authorization)
  ) {
    throw new Error('authenticated settlement execution authorization provenance is missing');
  }
}

export function deriveAuthenticatedSettlementCandidateAuthorityDigest(
  candidate: AuthenticatedSettlementCandidate,
): string {
  return sha256Canonical({
    schemaVersion: candidate.schemaVersion,
    candidateId: candidate.candidateId,
    burnId: candidate.burnId,
    burnTxHash: candidate.burnTxHash,
    sidechainId: candidate.sidechainId,
    sidechainHeight: candidate.sidechainHeight,
    sidechainBlockHash: candidate.sidechainBlockHash,
    sidechainLogIndex: candidate.sidechainLogIndex,
    trackerKey: candidate.trackerKey,
    trackerValue: candidate.trackerValue,
    trackerBoxId: candidate.trackerBoxId,
    anchorHeaderId: candidate.anchorHeaderId,
    anchorHeaderHeight: candidate.anchorHeaderHeight,
    duplicatePreventionBoxId: candidate.dupInputBoxId,
    duplicatePreventionDigest: candidate.dupInputDigest,
    vaultBoxId: candidate.vaultBoxId,
    unsignedTxDigest: candidate.unsignedTxDigest,
    creationHeight: candidate.creationHeight,
    observedSidechainTip: candidate.observedSidechainTip,
    observedErgoTip: candidate.observedErgoTip,
    status: candidate.status,
    recoverySchema: candidate.recoverySchema,
    recoverySidechainConsensusDigest: candidate.recoverySidechainConsensusDigest,
    recoveryAdmissionDigest: candidate.recoveryAdmissionDigest,
    recoverySidechainTipHash: candidate.recoverySidechainTipHash,
    recoverySidechainSourceCount: candidate.recoverySidechainSourceCount,
    checkExpectedTxId: candidate.checkExpectedTxId,
    checkUnsignedPackageDigest: candidate.checkUnsignedPackageDigest,
    checkSignedTransactionDigest: candidate.checkSignedTransactionDigest,
    checkResponseDigest: candidate.checkResponseDigest,
    checkSignerContextDigest: candidate.checkSignerContextDigest,
    checkCheckerIdentityDigest: candidate.checkCheckerIdentityDigest,
    checkRevalidationDigest: candidate.checkRevalidationDigest,
    checkNativeVerificationRequestDigest: candidate.checkNativeVerificationRequestDigest,
    checkTrustAnchorDigest: candidate.checkTrustAnchorDigest,
    checkFinalityHorizonHash: candidate.checkFinalityHorizonHash,
    checkFinalityHorizonHeight: candidate.checkFinalityHorizonHeight,
    checkFinalityStatementDigest: candidate.checkFinalityStatementDigest,
    checkFinalityProgramId: candidate.checkFinalityProgramId,
    checkFinalityProofSystemId: candidate.checkFinalityProofSystemId,
    checkFinalityVerifierProfileId: candidate.checkFinalityVerifierProfileId,
    checkFinalityProofPayloadDigest: candidate.checkFinalityProofPayloadDigest,
    checkFinalityProofDigest: candidate.checkFinalityProofDigest,
    checkStableErgoViewDigest: candidate.checkStableErgoViewDigest,
    checkStableSidechainViewDigest: candidate.checkStableSidechainViewDigest,
    checkAdmissionDigest: candidate.checkAdmissionDigest,
    invalidationReason: candidate.invalidationReason,
  });
}

function exactHexGroup(label: string, values: Array<string | null>): string {
  const normalized = values.map(value => fixedHex(value, label));
  if (new Set(normalized).size !== 1) {
    throw new Error(`${label} does not match across the current authorization chain`);
  }
  return normalized[0];
}

function exactSizedHexGroup(
  label: string,
  expectedBytes: number,
  values: Array<string | null>,
): string {
  const normalized = values.map(value => sizedHex(value, expectedBytes, label));
  if (new Set(normalized).size !== 1) {
    throw new Error(`${label} does not match across the current authorization chain`);
  }
  return normalized[0];
}

function exactBigIntGroup(label: string, values: Array<bigint | null>): bigint {
  if (values.some(value => value === null)) throw new Error(`${label} is missing`);
  const normalized = values.map(value => BigInt(value!));
  if (normalized.some(value => value < 0n) || new Set(normalized.map(String)).size !== 1) {
    throw new Error(`${label} does not match across the current authorization chain`);
  }
  return normalized[0];
}

function exactIntegerGroup(label: string, values: Array<number | null>): number {
  if (values.some(value => value === null)) throw new Error(`${label} is missing`);
  const normalized = values.map(value => value!);
  if (
    normalized.some(value => !Number.isSafeInteger(value) || value < 0)
    || new Set(normalized).size !== 1
  ) {
    throw new Error(`${label} does not match across the current authorization chain`);
  }
  return normalized[0];
}

function fixedHex(value: string | null, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean.toLowerCase();
}

function sizedHex(value: string | null, expectedBytes: number, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean) || clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('authorization cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`authorization cannot serialize ${typeof value}`);
}
