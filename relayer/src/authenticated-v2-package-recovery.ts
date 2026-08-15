import { createHash } from 'crypto';

import type { PreparedAuthenticatedSettlementUnsignedTx } from './aggregate-settlement-service.js';
import {
  runAuthenticatedV2PackageRecovery,
} from './apps/bridge-daemon/authenticated-v2-package-recovery.js';
import {
  authorizeNativeVerifiedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-candidate.js';
import {
  assertMatchingAuthenticatedSettlementSidechainViewConsensusProvenance,
  observeMatchingAuthenticatedSettlementStableSidechainViews,
  type AuthenticatedSettlementSidechainObservationSourcePair,
  type MatchingAuthenticatedSettlementSidechainViewConsensus,
} from './authenticated-settlement-sidechain-view.js';
import {
  assertAuthenticatedV2CacheRecoveryReportProvenance,
  type AuthenticatedV2CacheRecoveryReport,
} from './authenticated-v2-cache-recovery.js';
import {
  bindAuthenticatedV2UnsignedSettlementPackage,
} from './authenticated-v2-settlement-package-binding.js';
import {
  validateAuthenticatedV2UnsignedSettlementPackage,
} from './authenticated-v2-unsigned-settlement-package.js';
import type { NativeCheckpointSettlementAdmission } from './native-checkpoint-settlement-admission.js';
import {
  AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
  assertAuthenticatedV2PreparedCandidateRecoveryAdmissionProvenance,
  type AuthenticatedV2PreparedCandidateRecoveryAdmission as CoreRecoveryAdmission,
  type AuthenticatedV2PreparedCandidateRecoveryResult as CoreRecoveryResult,
} from './relayer-core/authenticated-v2-prepared-candidate-recovery.js';
import type { ParsedPegOut } from './sidechain-client.js';
import type { AuthenticatedSpvTrackerIdentity } from './spv-tracker-authenticated.js';
import type {
  AuthenticatedSettlementCandidate,
  AuthenticatedSettlementCandidateInput,
  StateTracker,
} from './state-tracker.js';

export {
  AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
  assertAuthenticatedV2PreparedCandidateRecoveryAdmissionProvenance,
};

export type AuthenticatedV2PreparedCandidateRecoveryAdmission =
  CoreRecoveryAdmission<
    AuthenticatedSettlementCandidateInput,
    ParsedPegOut,
    AuthenticatedV2CacheRecoveryReport,
    MatchingAuthenticatedSettlementSidechainViewConsensus
  >;

export interface RecoverAuthenticatedV2PreparedCandidateInput {
  readonly state: Pick<StateTracker, 'recordRecoveredAuthenticatedSettlementCandidate'>;
  readonly cacheRecovery: AuthenticatedV2CacheRecoveryReport;
  readonly packageValue: unknown;
  readonly expectedPackageDigestHex: string;
  readonly nativeAdmission: NativeCheckpointSettlementAdmission;
  readonly prepared: PreparedAuthenticatedSettlementUnsignedTx;
  readonly pegOut: ParsedPegOut;
  readonly trackerIdentity: AuthenticatedSpvTrackerIdentity;
  readonly observedSidechainTip: number | bigint;
  readonly sidechainSources: AuthenticatedSettlementSidechainObservationSourcePair;
  readonly bridgeAddress: string;
  readonly requiredSidechainConfirmations: number;
}

export type AuthenticatedV2PreparedCandidateRecoveryResult =
  CoreRecoveryResult<AuthenticatedSettlementCandidate>;

export async function recoverAuthenticatedV2PreparedCandidate(
  input: RecoverAuthenticatedV2PreparedCandidateInput,
): Promise<AuthenticatedV2PreparedCandidateRecoveryResult> {
  return runAuthenticatedV2PackageRecovery(input, {
    state: input.state,
    reconstruct: async current => {
      assertAuthenticatedV2CacheRecoveryReportProvenance(current.cacheRecovery);
      const expectedPackageDigestHex = fixedHex(
        current.expectedPackageDigestHex,
        'expected unsigned settlement package digest',
      );
      const pkg = await validateAuthenticatedV2UnsignedSettlementPackage(
        current.packageValue,
      );
      if (pkg.packageDigestHex !== expectedPackageDigestHex) {
        throw new Error(
          'unsigned settlement recovery package does not match the explicitly expected digest',
        );
      }

      const packageBinding = await bindAuthenticatedV2UnsignedSettlementPackage({
        packageValue: pkg,
        expectedPackageDigestHex,
        expectedTxId: pkg.transaction.unsignedTransactionIdHex,
        prepared: current.prepared,
      });
      const candidate = authorizeNativeVerifiedAuthenticatedSettlementCandidate({
        nativeAdmission: current.nativeAdmission,
        prepared: current.prepared,
        pegOut: current.pegOut,
        trackerIdentity: current.trackerIdentity,
        observedSidechainTip: current.observedSidechainTip,
        observedErgoTip: current.cacheRecovery.observedTip.height,
      });

      assertPackageMatchesCandidate(pkg, candidate);
      assertCacheRecoveryMatchesCandidate(current.cacheRecovery, candidate);
      const cacheRecoveryDigestHex = sha256Canonical({
        schema: current.cacheRecovery.schema,
        observedTip: current.cacheRecovery.observedTip,
        reconstructionDigests: current.cacheRecovery.reconstructionDigests,
        currentInputs: current.cacheRecovery.currentInputs,
      });
      return Object.freeze({
        candidate,
        pegOut: Object.freeze({
          ...current.pegOut,
          amount: BigInt(current.pegOut.amount),
        }),
        cacheRecovery: current.cacheRecovery,
        packageDigestHex: packageBinding.packageDigestHex,
        expectedTxId: packageBinding.expectedTxId,
        cacheRecoveryDigestHex,
      });
    },
    observe: async draft => {
      const matchingSidechainViews =
        await observeMatchingAuthenticatedSettlementStableSidechainViews({
          sources: input.sidechainSources,
          bridgeAddress: input.bridgeAddress,
          sidechainIdHex: draft.candidate.sidechainId,
          requiredConfirmations: input.requiredSidechainConfirmations,
          candidate: draft.candidate,
          pegOut: draft.pegOut,
        });
      assertMatchingAuthenticatedSettlementSidechainViewConsensusProvenance(
        matchingSidechainViews.consensus,
      );
      return matchingSidechainViews.consensus;
    },
  });
}

function assertPackageMatchesCandidate(
  pkg: Awaited<ReturnType<typeof validateAuthenticatedV2UnsignedSettlementPackage>>,
  candidate: AuthenticatedSettlementCandidateInput,
): void {
  const bindings = [
    ['burn ID', candidate.burnId, pkg.targetBurn.burnIdHex],
    ['sidechain transaction hash', candidate.burnTxHash, pkg.targetBurn.sidechainTxHashHex],
    ['sidechain ID', candidate.sidechainId, pkg.targetBurn.sidechainIdHex],
    ['execution block hash', candidate.sidechainBlockHash, pkg.targetBurn.executionBlockHashHex],
    ['tracker input box ID', candidate.trackerBoxId, pkg.canonicalInputBytes.trackerDataInput.boxIdHex],
    ['DUP input box ID', candidate.dupInputBoxId, pkg.canonicalInputBytes.duplicatePreventionInput.boxIdHex],
    ['vault input box ID', candidate.vaultBoxId, pkg.canonicalInputBytes.vaultInput.boxIdHex],
    ['unsigned transaction digest', candidate.unsignedTxDigest, pkg.transaction.eip12Sha256Hex],
  ] as const;
  for (const [label, actual, expected] of bindings) {
    if (actual !== expected) {
      throw new Error(
        `authenticated settlement recovery package ${label} differs from the fresh candidate`,
      );
    }
  }
  if (
    candidate.sidechainHeight !== BigInt(pkg.targetBurn.sidechainHeight)
    || candidate.sidechainLogIndex !== pkg.targetBurn.eventIndex
    || candidate.creationHeight !== pkg.creationHeight
  ) {
    throw new Error(
      'authenticated settlement recovery package coordinates differ from the fresh candidate',
    );
  }
}

function assertCacheRecoveryMatchesCandidate(
  cacheRecovery: AuthenticatedV2CacheRecoveryReport,
  candidate: AuthenticatedSettlementCandidateInput,
): void {
  if (candidate.observedErgoTip !== cacheRecovery.observedTip.height) {
    throw new Error(
      'authenticated settlement recovery candidate does not use the recovered Ergo tip',
    );
  }
  if (candidate.trackerBoxId !== cacheRecovery.currentInputs.trackerBoxIdHex) {
    throw new Error(
      'authenticated settlement recovery candidate does not use the recovered tracker tip',
    );
  }
  if (
    candidate.dupInputBoxId
      !== cacheRecovery.currentInputs.duplicatePreventionBoxIdHex
  ) {
    throw new Error(
      'authenticated settlement recovery candidate does not use the recovered DUP tip',
    );
  }
  if (!cacheRecovery.currentInputs.vaultBoxIdsHex.includes(candidate.vaultBoxId)) {
    throw new Error(
      'authenticated settlement recovery candidate does not use a recovered current vault',
    );
  }
}

function fixedHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  const clean = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('recovery binding cannot contain non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )).join(',')}}`;
  }
  throw new Error(`recovery binding cannot serialize ${typeof value}`);
}
