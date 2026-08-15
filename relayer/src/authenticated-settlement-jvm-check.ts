import { createHash } from 'crypto';

import type {
  PreparedAuthenticatedSettlementUnsignedTx,
} from './aggregate-settlement-service.js';
import {
  assertRevalidatedAuthenticatedSettlementCandidateProvenance,
  type RevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-candidate-revalidation.js';
export {
  assertRevalidatedAuthenticatedSettlementCandidateProvenance,
  recollectAndRevalidateAuthenticatedSettlementCandidate,
  revalidateAuthenticatedSettlementCandidate,
  revalidateAuthenticatedSettlementCandidateForTesting,
} from './authenticated-settlement-candidate-revalidation.js';
export type {
  RecollectAndRevalidateAuthenticatedSettlementCandidateInput,
  RevalidateAuthenticatedSettlementCandidateInput,
  RevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-candidate-revalidation.js';
import type {
  LocalWasmOpaqueCheckResult,
  LocalWasmSignedCheckCandidate,
  SignedCheckNodeIdentity,
  SignedCheckResult,
  SignedCheckSignerContext,
} from './fleet-signer.js';
import {
  ERGO_NODE_CHECKER_PROFILE,
  ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
  LOCAL_WASM_CHECK_SIGNER_PROFILE,
} from './ergo-check-profiles.js';
import {
  assertPackageBoundAuthenticatedSettlementProvenance,
  type PackageBoundAuthenticatedSettlement,
} from './authenticated-v2-settlement-package-binding.js';

const AUTHENTICATED_SETTLEMENT_JVM_CHECK_ACCEPTANCES = new WeakSet<object>();
const OPAQUE_SPLIT_AUTHENTICATED_SETTLEMENT_JVM_CHECK_ACCEPTANCES =
  new WeakSet<object>();
const AUTHENTICATED_SETTLEMENT_SIGNED_CHECK_CANDIDATES = new WeakSet<object>();

export interface AuthenticatedSettlementJvmCheckAcceptance {
  candidateId: string;
  expectedTxId: string;
  unsignedPackageDigestHex: string;
  signedTransactionDigestHex: string;
  checkResponseDigestHex: string;
  signerContextDigestHex: string;
  checkerIdentityDigestHex: string;
  revalidationDigestHex: string;
  nativeVerificationRequestDigestHex: string;
  trustAnchorDigestHex: string;
  finalityHorizonHashHex: string;
  finalityHorizonHeight: bigint;
  finalityStatementDigestHex: string;
  finalityProgramIdHex: string;
  finalityProofSystemId: number;
  finalityVerifierProfileIdHex: string;
  finalityProofPayloadDigestHex: string;
  finalityProofDigestHex: string;
}

export interface AuthenticatedSettlementSignedCheckCandidate {
  candidateId: string;
  expectedTxId: string;
  unsignedTxDigestHex: string;
  unsignedPackageDigestHex: string;
  signedTransactionDigestHex: string;
  signerContextDigestHex: string;
  nodeOrigin: string;
  signed: LocalWasmSignedCheckCandidate;
}

type CheckTransaction = (
  eip12Tx: PreparedAuthenticatedSettlementUnsignedTx['eip12Tx'],
  label: string,
  expectedTxId: string,
) => Promise<SignedCheckResult | null>;
type SignTransactionForCheck = (
  eip12Tx: PreparedAuthenticatedSettlementUnsignedTx['eip12Tx'],
  label: string,
  expectedTxId: string,
  nodeOrigin: string,
) => Promise<LocalWasmSignedCheckCandidate | null>;
type CheckSignedTransaction = (
  candidate: LocalWasmSignedCheckCandidate,
  label: string,
  nodeOrigin: string,
) => Promise<LocalWasmOpaqueCheckResult | null>;
type AssertLocalWasmSignedCheckCandidateProvenance = (
  candidate: unknown,
) => asserts candidate is LocalWasmSignedCheckCandidate;

export async function signPackageBoundRevalidatedAuthenticatedSettlementCandidate(
  packageBinding: PackageBoundAuthenticatedSettlement,
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  label: string,
  nodeOrigin: string,
): Promise<AuthenticatedSettlementSignedCheckCandidate> {
  const {
    assertLocalWasmSignedCheckCandidateProvenance,
    signTransactionForCheck,
  } = await import('./fleet-signer.js');
  return signPackageBoundCandidate(
    packageBinding,
    candidate,
    label,
    nodeOrigin,
    signTransactionForCheck,
    assertLocalWasmSignedCheckCandidateProvenance,
  );
}

async function signPackageBoundCandidate(
  packageBinding: PackageBoundAuthenticatedSettlement,
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  label: string,
  nodeOrigin: string,
  signTransaction: SignTransactionForCheck,
  assertSignedProvenance: AssertLocalWasmSignedCheckCandidateProvenance,
): Promise<AuthenticatedSettlementSignedCheckCandidate> {
  assertPackageBindingMatchesRevalidatedCandidate(packageBinding, candidate);
  const signed = await signTransaction(
    candidate.prepared.eip12Tx,
    label,
    candidate.expectedTxId,
    nodeOrigin,
  );
  if (!signed) throw new Error(`${label}: local signing for JVM check failed`);
  assertSignedProvenance(signed);
  const signedTxId = normalizeFixedHex(
    signed.txId,
    32,
    'signed check transaction ID',
  );
  if (signedTxId !== candidate.expectedTxId) {
    throw new Error(
      'signed JVM check candidate ID does not match the revalidated unsigned transaction',
    );
  }
  const result = Object.freeze({
    candidateId: candidate.candidateId,
    expectedTxId: candidate.expectedTxId,
    unsignedTxDigestHex: candidate.unsignedTxDigest,
    unsignedPackageDigestHex: normalizeFixedHex(
      packageBinding.packageDigestHex,
      32,
      'unsigned settlement package digest',
    ),
    signedTransactionDigestHex: signed.signedTransactionDigestHex,
    signerContextDigestHex: sha256Hex(
      normalizeSignerContext(signed.signerContext),
    ),
    nodeOrigin: signed.nodeOrigin,
    signed,
  });
  AUTHENTICATED_SETTLEMENT_SIGNED_CHECK_CANDIDATES.add(result);
  return result;
}

export function assertAuthenticatedSettlementSignedCheckCandidateProvenance(
  candidate: unknown,
): asserts candidate is AuthenticatedSettlementSignedCheckCandidate {
  if (
    typeof candidate !== 'object'
    || candidate === null
    || !AUTHENTICATED_SETTLEMENT_SIGNED_CHECK_CANDIDATES.has(candidate)
  ) {
    throw new Error('authenticated settlement signed check candidate provenance is missing');
  }
  const signed = candidate as AuthenticatedSettlementSignedCheckCandidate;
  if (
    normalizeFixedHex(signed.candidateId, 32, 'signed candidate ID')
      !== signed.candidateId
    || normalizeFixedHex(signed.expectedTxId, 32, 'signed expected transaction ID')
      !== signed.expectedTxId
    || normalizeFixedHex(
      signed.unsignedTxDigestHex,
      32,
      'signed unsigned transaction digest',
    ) !== signed.unsignedTxDigestHex
    || normalizeFixedHex(
      signed.unsignedPackageDigestHex,
      32,
      'signed unsigned package digest',
    ) !== signed.unsignedPackageDigestHex
    || signed.signed.signedTransactionDigestHex
      !== signed.signedTransactionDigestHex
    || sha256Hex(normalizeSignerContext(signed.signed.signerContext))
      !== signed.signerContextDigestHex
    || signed.signed.txId !== signed.expectedTxId
    || signed.signed.nodeOrigin !== signed.nodeOrigin
  ) {
    throw new Error('authenticated settlement signed check candidate binding is invalid');
  }
}

export async function checkPackageBoundSignedAuthenticatedSettlementCandidate(
  packageBinding: PackageBoundAuthenticatedSettlement,
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  signed: AuthenticatedSettlementSignedCheckCandidate,
  label: string,
): Promise<AuthenticatedSettlementJvmCheckAcceptance> {
  const { checkSignedTransaction } = await import('./fleet-signer.js');
  return checkPackageBoundSignedCandidate(
    packageBinding,
    candidate,
    signed,
    label,
    checkSignedTransaction,
  );
}

async function checkPackageBoundSignedCandidate(
  packageBinding: PackageBoundAuthenticatedSettlement,
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  signed: AuthenticatedSettlementSignedCheckCandidate,
  label: string,
  checkTransaction: CheckSignedTransaction,
): Promise<AuthenticatedSettlementJvmCheckAcceptance> {
  assertPackageBindingMatchesRevalidatedCandidate(packageBinding, candidate);
  assertAuthenticatedSettlementSignedCheckCandidateProvenance(signed);
  if (
    signed.candidateId !== candidate.candidateId
    || signed.expectedTxId !== candidate.expectedTxId
    || signed.unsignedTxDigestHex !== candidate.unsignedTxDigest
    || signed.unsignedPackageDigestHex !== packageBinding.packageDigestHex
  ) {
    throw new Error(
      'signed JVM check candidate does not match the package-bound revalidation',
    );
  }
  const checked = await checkTransaction(
    signed.signed,
    label,
    signed.nodeOrigin,
  );
  if (!checked) throw new Error(`${label}: JVM /transactions/check failed`);
  if (
    normalizeFixedHex(checked.txId, 32, 'checked transaction ID')
      !== signed.expectedTxId
    || normalizeFixedHex(
      checked.signedTransactionDigestHex,
      32,
      'checked signed transaction digest',
    ) !== signed.signedTransactionDigestHex
    || sha256Hex(normalizeSignerContext(checked.signerContext))
      !== signed.signerContextDigestHex
    || normalizeCheckerIdentity(checked.checkerIdentity).nodeOrigin
      !== signed.nodeOrigin
  ) {
    throw new Error(
      'JVM checker did not consume the exact signed settlement candidate',
    );
  }
  const acceptance = buildOpaqueJvmCheckAcceptance(
    candidate,
    checked,
    signed.unsignedPackageDigestHex,
  );
  OPAQUE_SPLIT_AUTHENTICATED_SETTLEMENT_JVM_CHECK_ACCEPTANCES.add(acceptance);
  return acceptance;
}

/**
 * Compatibility-only combined check evidence.
 *
 * The result retains generic JVM-check provenance for existing diagnostics,
 * but cannot pass authenticated execution check admission. Funds-facing
 * lifecycle composition must use the opaque split signer/checker path.
 */
export async function checkPackageBoundRevalidatedAuthenticatedSettlementCandidate(
  packageBinding: PackageBoundAuthenticatedSettlement,
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  label: string,
): Promise<AuthenticatedSettlementJvmCheckAcceptance> {
  const { signAndCheck } = await import('./fleet-signer.js');
  return checkPackageBoundCandidate(
    packageBinding,
    candidate,
    label,
    signAndCheck,
  );
}

export async function checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
  packageBinding: PackageBoundAuthenticatedSettlement,
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  label: string,
  checkTransaction: CheckTransaction,
): Promise<AuthenticatedSettlementJvmCheckAcceptance> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('injected authenticated settlement JVM checker is test-only');
  }
  return checkPackageBoundCandidate(
    packageBinding,
    candidate,
    label,
    checkTransaction,
  );
}

async function checkPackageBoundCandidate(
  packageBinding: PackageBoundAuthenticatedSettlement,
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  label: string,
  checkTransaction: CheckTransaction,
): Promise<AuthenticatedSettlementJvmCheckAcceptance> {
  assertPackageBindingMatchesRevalidatedCandidate(packageBinding, candidate);
  return executeJvmCheck(
    candidate,
    label,
    checkTransaction,
    packageBinding.packageDigestHex,
  );
}

function assertPackageBindingMatchesRevalidatedCandidate(
  packageBinding: PackageBoundAuthenticatedSettlement,
  candidate: RevalidatedAuthenticatedSettlementCandidate,
): void {
  assertPackageBoundAuthenticatedSettlementProvenance(packageBinding);
  assertRevalidatedAuthenticatedSettlementCandidateProvenance(candidate);
  if (packageBinding.prepared !== candidate.prepared) {
    throw new Error('package-bound settlement does not reference the revalidated prepared candidate');
  }
  if (packageBinding.expectedTxId !== candidate.expectedTxId) {
    throw new Error('package-bound transaction ID does not match the revalidated candidate');
  }
}

export function assertAuthenticatedSettlementJvmCheckAcceptanceProvenance(
  acceptance: unknown,
): asserts acceptance is AuthenticatedSettlementJvmCheckAcceptance {
  if (
    typeof acceptance !== 'object'
    || acceptance === null
    || !AUTHENTICATED_SETTLEMENT_JVM_CHECK_ACCEPTANCES.has(acceptance)
  ) {
    throw new Error('authenticated settlement JVM check acceptance provenance is missing');
  }
}

export function assertOpaqueSplitAuthenticatedSettlementJvmCheckAcceptanceProvenance(
  acceptance: unknown,
): asserts acceptance is AuthenticatedSettlementJvmCheckAcceptance {
  assertAuthenticatedSettlementJvmCheckAcceptanceProvenance(acceptance);
  if (
    !OPAQUE_SPLIT_AUTHENTICATED_SETTLEMENT_JVM_CHECK_ACCEPTANCES.has(
      acceptance as object,
    )
  ) {
    throw new Error(
      'authenticated settlement acceptance did not use the opaque split check path',
    );
  }
}

async function executeJvmCheck(
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  label: string,
  checkTransaction: CheckTransaction,
  unsignedPackageDigestHex: string,
): Promise<AuthenticatedSettlementJvmCheckAcceptance> {
  assertRevalidatedAuthenticatedSettlementCandidateProvenance(candidate);
  const normalizedUnsignedPackageDigestHex = normalizeFixedHex(
    unsignedPackageDigestHex,
    32,
    'unsigned settlement package digest',
  );
  const result = await checkTransaction(
    candidate.prepared.eip12Tx,
    label,
    candidate.expectedTxId,
  );
  if (!result) throw new Error(`${label}: signed JVM /transactions/check failed`);
  const checkedTxId = normalizeFixedHex(result.txId, 32, 'checked transaction ID');
  if (checkedTxId !== candidate.expectedTxId) {
    throw new Error('signed JVM check transaction ID does not match the revalidated unsigned transaction');
  }

  return buildJvmCheckAcceptance(
    candidate,
    result,
    normalizedUnsignedPackageDigestHex,
  );
}

function buildJvmCheckAcceptance(
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  result: SignedCheckResult,
  unsignedPackageDigestHex: string,
): AuthenticatedSettlementJvmCheckAcceptance {
  assertRevalidatedAuthenticatedSettlementCandidateProvenance(candidate);
  const normalizedUnsignedPackageDigestHex = normalizeFixedHex(
    unsignedPackageDigestHex,
    32,
    'unsigned settlement package digest',
  );
  const acceptance = Object.freeze({
    candidateId: candidate.candidateId,
    expectedTxId: candidate.expectedTxId,
    unsignedPackageDigestHex: normalizedUnsignedPackageDigestHex,
    signedTransactionDigestHex: normalizeFixedHex(
      result.signedTransactionDigestHex,
      32,
      'signed transaction digest',
    ),
    checkResponseDigestHex: sha256Hex(result.checkResult),
    signerContextDigestHex: sha256Hex(normalizeSignerContext(result.signerContext)),
    checkerIdentityDigestHex: sha256Hex(normalizeCheckerIdentity(result.checkerIdentity)),
    revalidationDigestHex: candidate.revalidationDigestHex,
    nativeVerificationRequestDigestHex:
      candidate.nativeVerificationRequestDigestHex,
    trustAnchorDigestHex: candidate.trustAnchorDigestHex,
    finalityHorizonHashHex: candidate.finalityHorizonHashHex,
    finalityHorizonHeight: candidate.finalityHorizonHeight,
    finalityStatementDigestHex: candidate.finalityStatementDigestHex,
    finalityProgramIdHex: candidate.finalityProgramIdHex,
    finalityProofSystemId: candidate.finalityProofSystemId,
    finalityVerifierProfileIdHex: candidate.finalityVerifierProfileIdHex,
    finalityProofPayloadDigestHex: candidate.finalityProofPayloadDigestHex,
    finalityProofDigestHex: candidate.finalityProofDigestHex,
  });
  AUTHENTICATED_SETTLEMENT_JVM_CHECK_ACCEPTANCES.add(acceptance);
  return acceptance;
}

function buildOpaqueJvmCheckAcceptance(
  candidate: RevalidatedAuthenticatedSettlementCandidate,
  result: LocalWasmOpaqueCheckResult,
  unsignedPackageDigestHex: string,
): AuthenticatedSettlementJvmCheckAcceptance {
  assertRevalidatedAuthenticatedSettlementCandidateProvenance(candidate);
  const normalizedUnsignedPackageDigestHex = normalizeFixedHex(
    unsignedPackageDigestHex,
    32,
    'unsigned settlement package digest',
  );
  const acceptance = Object.freeze({
    candidateId: candidate.candidateId,
    expectedTxId: candidate.expectedTxId,
    unsignedPackageDigestHex: normalizedUnsignedPackageDigestHex,
    signedTransactionDigestHex: normalizeFixedHex(
      result.signedTransactionDigestHex,
      32,
      'signed transaction digest',
    ),
    checkResponseDigestHex: sha256Hex(result.checkResult),
    signerContextDigestHex: sha256Hex(
      normalizeSignerContext(result.signerContext),
    ),
    checkerIdentityDigestHex: sha256Hex(
      normalizeCheckerIdentity(result.checkerIdentity),
    ),
    revalidationDigestHex: candidate.revalidationDigestHex,
    nativeVerificationRequestDigestHex:
      candidate.nativeVerificationRequestDigestHex,
    trustAnchorDigestHex: candidate.trustAnchorDigestHex,
    finalityHorizonHashHex: candidate.finalityHorizonHashHex,
    finalityHorizonHeight: candidate.finalityHorizonHeight,
    finalityStatementDigestHex: candidate.finalityStatementDigestHex,
    finalityProgramIdHex: candidate.finalityProgramIdHex,
    finalityProofSystemId: candidate.finalityProofSystemId,
    finalityVerifierProfileIdHex: candidate.finalityVerifierProfileIdHex,
    finalityProofPayloadDigestHex: candidate.finalityProofPayloadDigestHex,
    finalityProofDigestHex: candidate.finalityProofDigestHex,
  });
  AUTHENTICATED_SETTLEMENT_JVM_CHECK_ACCEPTANCES.add(acceptance);
  return acceptance;
}

function normalizeSignerContext(
  value: SignedCheckSignerContext,
): SignedCheckSignerContext {
  if (value?.profile !== LOCAL_WASM_CHECK_SIGNER_PROFILE) {
    throw new Error('authenticated settlement signer profile is unsupported');
  }
  if (
    !Number.isSafeInteger(value.networkPrefix)
    || value.networkPrefix < 0
    || value.networkPrefix > 255
  ) {
    throw new Error('authenticated settlement signer network prefix must be an unsigned byte');
  }
  if (!Number.isSafeInteger(value.stateContextTipHeight) || value.stateContextTipHeight <= 0) {
    throw new Error('authenticated settlement signer context tip height must be positive');
  }
  const pubKeyHex = normalizeFixedHex(
    value.pubKeyHex,
    33,
    'authenticated settlement signer public key',
  );
  const ergoTreeHex = normalizeFixedHex(
    value.ergoTreeHex,
    36,
    'authenticated settlement signer ErgoTree',
  );
  if (ergoTreeHex !== `0008cd${pubKeyHex}`) {
    throw new Error('authenticated settlement signer public key and ErgoTree do not match');
  }
  return {
    profile: LOCAL_WASM_CHECK_SIGNER_PROFILE,
    pubKeyHex,
    ergoTreeHex,
    networkPrefix: value.networkPrefix,
    stateContextTipHeight: value.stateContextTipHeight,
    stateContextTipIdHex: normalizeFixedHex(
      value.stateContextTipIdHex,
      32,
      'authenticated settlement signer context tip ID',
    ),
  };
}

function normalizeCheckerIdentity(
  value: SignedCheckNodeIdentity,
): SignedCheckNodeIdentity {
  if (
    value?.profile !== ERGO_NODE_CHECKER_PROFILE
    || value.sourceAdapterProfile !== ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE
    || value.path !== '/transactions/check'
    || value.method !== 'POST'
    || value.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error('authenticated settlement checker identity is unsupported');
  }
  let parsed: URL;
  try {
    parsed = new URL(value.nodeOrigin);
  } catch {
    throw new Error('authenticated settlement checker origin is invalid');
  }
  const canonicalOrigin = parsed.origin.toLowerCase();
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || canonicalOrigin !== value.nodeOrigin
  ) {
    throw new Error('authenticated settlement checker origin is not canonical');
  }
  return {
    profile: ERGO_NODE_CHECKER_PROFILE,
    sourceAdapterProfile: ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
    nodeOrigin: canonicalOrigin,
    path: '/transactions/check',
    method: 'POST',
    transportPolicy: 'no-redirect-no-proxy',
  };
}

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JVM check binding cannot contain non-finite numbers');
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
  throw new Error(`JVM check binding cannot serialize ${typeof value}`);
}

function normalizeFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes`);
  }
  return clean.toLowerCase();
}
