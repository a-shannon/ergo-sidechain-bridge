import { createHash } from 'crypto';

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
  assertOpaqueSplitAuthenticatedSettlementJvmCheckAcceptanceProvenance,
  assertRevalidatedAuthenticatedSettlementCandidateProvenance,
  type AuthenticatedSettlementJvmCheckAcceptance,
  type RevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-jvm-check.js';

const AUTHENTICATED_SETTLEMENT_CHECK_ADMISSIONS = new WeakSet<object>();

export interface AuthenticatedSettlementCheckAdmission
  extends AuthenticatedSettlementJvmCheckAcceptance {
  stableErgoViewDigestHex: string;
  stableSidechainViewDigestHex: string;
  admissionDigestHex: string;
}

export function authorizeAuthenticatedSettlementCheckAdmission(input: {
  acceptance: AuthenticatedSettlementJvmCheckAcceptance;
  revalidated: RevalidatedAuthenticatedSettlementCandidate;
  stableErgoView: AuthenticatedSettlementStableErgoView;
  stableSidechainView: AuthenticatedSettlementStableSidechainView;
}): AuthenticatedSettlementCheckAdmission {
  assertOpaqueSplitAuthenticatedSettlementJvmCheckAcceptanceProvenance(
    input.acceptance,
  );
  assertRevalidatedAuthenticatedSettlementCandidateProvenance(input.revalidated);
  assertAuthenticatedSettlementStableErgoViewProvenance(input.stableErgoView);
  assertAuthenticatedSettlementStableSidechainViewProvenance(input.stableSidechainView);
  assertAuthenticatedSettlementStableSidechainViewMatchesRevalidation(
    input.stableSidechainView,
    input.revalidated,
  );

  const candidateId = exactHexGroup('candidate ID', [
    input.acceptance.candidateId,
    input.revalidated.candidateId,
    input.stableErgoView.candidateId,
    input.stableSidechainView.candidateId,
  ]);
  const expectedTxId = exactHexGroup('expected transaction ID', [
    input.acceptance.expectedTxId,
    input.revalidated.expectedTxId,
  ]);
  exactHexGroup('unsigned transaction digest', [
    input.revalidated.unsignedTxDigest,
    input.stableErgoView.unsignedTxDigestHex,
  ]);
  const binding = {
    candidateId,
    expectedTxId,
    unsignedPackageDigestHex: fixedHex(
      input.acceptance.unsignedPackageDigestHex,
      'unsigned package digest',
    ),
    signedTransactionDigestHex: fixedHex(
      input.acceptance.signedTransactionDigestHex,
      'signed transaction digest',
    ),
    checkResponseDigestHex: fixedHex(
      input.acceptance.checkResponseDigestHex,
      'JVM check response digest',
    ),
    signerContextDigestHex: fixedHex(
      input.acceptance.signerContextDigestHex,
      'signer context digest',
    ),
    checkerIdentityDigestHex: fixedHex(
      input.acceptance.checkerIdentityDigestHex,
      'checker identity digest',
    ),
    revalidationDigestHex: exactHexGroup('revalidation digest', [
      input.acceptance.revalidationDigestHex,
      input.revalidated.revalidationDigestHex,
    ]),
    nativeVerificationRequestDigestHex: exactHexGroup(
      'native verification request digest',
      [
        input.acceptance.nativeVerificationRequestDigestHex,
        input.revalidated.nativeVerificationRequestDigestHex,
      ],
    ),
    trustAnchorDigestHex: exactHexGroup('trust anchor digest', [
      input.acceptance.trustAnchorDigestHex,
      input.revalidated.trustAnchorDigestHex,
    ]),
    finalityHorizonHashHex: exactHexGroup('finality horizon hash', [
      input.acceptance.finalityHorizonHashHex,
      input.revalidated.finalityHorizonHashHex,
    ]),
    finalityHorizonHeight: exactBigIntGroup('finality horizon height', [
      input.acceptance.finalityHorizonHeight,
      input.revalidated.finalityHorizonHeight,
    ]),
    finalityStatementDigestHex: exactHexGroup('finality statement digest', [
      input.acceptance.finalityStatementDigestHex,
      input.revalidated.finalityStatementDigestHex,
    ]),
    finalityProgramIdHex: exactHexGroup('finality program ID', [
      input.acceptance.finalityProgramIdHex,
      input.revalidated.finalityProgramIdHex,
    ]),
    finalityProofSystemId: exactIntegerGroup('finality proof system ID', [
      input.acceptance.finalityProofSystemId,
      input.revalidated.finalityProofSystemId,
    ]),
    finalityVerifierProfileIdHex: exactHexGroup('finality verifier profile ID', [
      input.acceptance.finalityVerifierProfileIdHex,
      input.revalidated.finalityVerifierProfileIdHex,
    ]),
    finalityProofPayloadDigestHex: exactHexGroup('finality proof payload digest', [
      input.acceptance.finalityProofPayloadDigestHex,
      input.revalidated.finalityProofPayloadDigestHex,
    ]),
    finalityProofDigestHex: exactHexGroup('aggregate finality proof digest', [
      input.acceptance.finalityProofDigestHex,
      input.revalidated.finalityProofDigestHex,
    ]),
    stableErgoViewDigestHex: fixedHex(
      input.stableErgoView.viewDigestHex,
      'stable Ergo view digest',
    ),
    stableSidechainViewDigestHex: fixedHex(
      input.stableSidechainView.viewDigestHex,
      'stable sidechain view digest',
    ),
  };
  const admission = Object.freeze({
    ...binding,
    admissionDigestHex: sha256Canonical(binding),
  });
  AUTHENTICATED_SETTLEMENT_CHECK_ADMISSIONS.add(admission);
  return admission;
}

export function assertAuthenticatedSettlementCheckAdmissionProvenance(
  admission: unknown,
): asserts admission is AuthenticatedSettlementCheckAdmission {
  if (
    typeof admission !== 'object'
    || admission === null
    || !AUTHENTICATED_SETTLEMENT_CHECK_ADMISSIONS.has(admission)
  ) {
    throw new Error('authenticated settlement check admission provenance is missing');
  }
}

function exactHexGroup(label: string, values: string[]): string {
  const normalized = values.map(value => fixedHex(value, label));
  if (new Set(normalized).size !== 1) {
    throw new Error(`${label} does not match across check admission`);
  }
  return normalized[0];
}

function exactBigIntGroup(label: string, values: bigint[]): bigint {
  const normalized = values.map(BigInt);
  if (normalized.some(value => value < 0n) || new Set(normalized.map(String)).size !== 1) {
    throw new Error(`${label} does not match across check admission`);
  }
  return normalized[0];
}

function exactIntegerGroup(label: string, values: number[]): number {
  if (
    values.some(value => !Number.isSafeInteger(value) || value < 0)
    || new Set(values).size !== 1
  ) {
    throw new Error(`${label} does not match across check admission`);
  }
  return values[0];
}

function fixedHex(value: string, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean.toLowerCase();
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('check admission cannot contain non-finite numbers');
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
  throw new Error(`check admission cannot serialize ${typeof value}`);
}
