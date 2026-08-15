import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from 'node:crypto';
import {
  lstatSync,
  readFileSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Interface,
  type InterfaceAbi,
} from 'ethers';

import {
  canonicalE2sJson,
} from './independently-attested-native-verifier-profile.js';
import {
  derivePegInRuntimeSourceManifestSha256,
} from './peg-in-runtime-build-attestation.js';

export const PEG_IN_RUNTIME_INVARIANT_PROFILE_V1_SCHEMA =
  'e2s.peg-in-runtime-invariant-profile.v1' as const;
export const PEG_IN_RUNTIME_INVARIANT_REVIEW_PACKET_V1_SCHEMA =
  'e2s.peg-in-runtime-invariant-review-packet.v1' as const;
export const PEG_IN_RUNTIME_INVARIANT_REVIEW_REPORT_V1_SCHEMA =
  'e2s.peg-in-runtime-invariant-review-report.v1' as const;
export const PEG_IN_RUNTIME_INVARIANT_REVIEWER_LOCK_KIND =
  'bridge-peg-in-runtime-invariant-reviewer-lock' as const;
export const PEG_IN_RUNTIME_INVARIANT_REVIEWER_LOCK_SCHEMA_VERSION = 1;
export const PEG_IN_RUNTIME_INVARIANT_REVIEW_STATUS =
  'VALIDATED_NON_AUTHORIZING_RUNTIME_INVARIANT_REVIEW' as const;

const CANONICALIZATION = 'e2s-canonical-json-v1' as const;
const SIGNATURE_ALGORITHM = 'ed25519' as const;
const REVIEW_MESSAGE_DOMAIN = Buffer.from(
  'E2S_PEG_IN_RUNTIME_INVARIANT_REVIEW_V1\0',
  'utf8',
);
const REVIEW_PACKET_DOMAIN = Buffer.from(
  'E2S_PEG_IN_RUNTIME_INVARIANT_REVIEW_PACKET_V1\0',
  'utf8',
);
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CANONICAL_BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const CANONICAL_REVIEWER_LOCK_PATH = [
  'sources',
  'peg-in-runtime-invariant-reviewer-lock.json',
] as const;
const CONSENSUS_SOURCE_LOCK_PATH = [
  'sources',
  'consensus-source-lock.json',
] as const;
const FRONTIER_PATCH_PATH = [
  'sources',
  'frontier',
  '0001-bridge-runtime-commitment.patch',
] as const;
const ERGO_BRIDGE_SOURCE_PATH = ['solidity', 'ErgoBridge.sol'] as const;
const ERGO_BRIDGE_ABI_PATH = [
  'solidity',
  'compiled',
  'ErgoBridge.abi',
] as const;
const ERGO_BRIDGE_BYTECODE_PATH = [
  'solidity',
  'compiled',
  'ErgoBridge.bin',
] as const;
const SERG_SOURCE_PATH = ['solidity', 'SERG.sol'] as const;
const SERG_ABI_PATH = ['solidity', 'compiled', 'SERG.abi'] as const;
const SERG_BYTECODE_PATH = ['solidity', 'compiled', 'SERG.bin'] as const;

const PROCESSED_PEG_INS_STORAGE_PREFIX_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0e683c528c6fc8006645fa5989173f2e0';
const PEG_IN_RECORD_KEY_DOMAIN = 'E2S_PEG_IN_RECORD_KEY_V1';
const PEG_IN_EVENT_SIGNATURE = 'PegIn(address,uint256,bytes32)';
const BRIDGE_MINT_SIGNATURE = 'mintSERG(address,uint256,bytes32)';
const TOKEN_MINT_SIGNATURE = 'mint(address,uint256)';

const VALIDATION_REPORTS = new WeakSet<object>();
const REVIEWED_REPORTS = new WeakSet<object>();

export interface PegInRuntimeInvariantReviewerKeyV1 {
  readonly role: 'independent-runtime-invariant-reviewer';
  readonly organizationId: string;
  readonly keyIdHex: string;
  readonly publicKeySpkiDerHex: string;
}

export interface PegInRuntimeInvariantReviewerProfileV1 {
  readonly profileId: string;
  readonly status: 'active' | 'revoked';
  readonly validFrom: string;
  readonly validUntil: string;
  readonly reviewer: PegInRuntimeInvariantReviewerKeyV1;
  readonly forbiddenAuthorityKeyIds: readonly string[];
  readonly approvedRuntimeSourceBindings: readonly {
    readonly runtimeArtifactSha256Hex: string;
    readonly runtimeArtifactSizeBytes: string;
    readonly buildAttestationId: string;
    readonly buildAttestationSha256Hex: string;
    readonly sourceBindingDigestHex: string;
  }[];
}

export interface PegInRuntimeInvariantReviewerLockV1 {
  readonly schemaVersion:
    typeof PEG_IN_RUNTIME_INVARIANT_REVIEWER_LOCK_SCHEMA_VERSION;
  readonly kind: typeof PEG_IN_RUNTIME_INVARIANT_REVIEWER_LOCK_KIND;
  readonly canonicalization: typeof CANONICALIZATION;
  readonly signatureAlgorithm: typeof SIGNATURE_ALGORITHM;
  readonly profiles: readonly PegInRuntimeInvariantReviewerProfileV1[];
  readonly boundaries: {
    readonly runtimeProfilesCannotAddTrustRoots: true;
    readonly signaturesDoNotProveOrganizationalIndependence: true;
    readonly sourceReviewDoesNotVerifyDeployedCodeOrOwnership: true;
    readonly runtimeHistoryAndCommittedVaultRemainRequired: true;
  };
}

export interface PegInRuntimeInvariantSourceBindingV1 {
  readonly consensusSourceLockSha256Hex: string;
  readonly frontierCommitHex: string;
  readonly frontierPatchSha256Hex: string;
  readonly runtimeSourceManifestSha256Hex: string;
  readonly ergoBridgeSourceSha256Hex: string;
  readonly ergoBridgeAbiSha256Hex: string;
  readonly ergoBridgeBytecodeSha256Hex: string;
  readonly sergSourceSha256Hex: string;
  readonly sergAbiSha256Hex: string;
  readonly sergBytecodeSha256Hex: string;
}

export interface PegInRuntimeInvariantProfileV1 {
  readonly schema: typeof PEG_IN_RUNTIME_INVARIANT_PROFILE_V1_SCHEMA;
  readonly profileId: string;
  readonly reviewId: string;
  readonly reviewedAt: string;
  readonly canonicalization: typeof CANONICALIZATION;
  readonly signatureAlgorithm: typeof SIGNATURE_ALGORITHM;
  readonly runtime: {
    readonly artifactSha256Hex: string;
    readonly artifactSizeBytes: string;
    readonly buildAttestationId: string;
    readonly buildAttestationSha256Hex: string;
  };
  readonly source: PegInRuntimeInvariantSourceBindingV1;
  readonly nativeRecord: {
    readonly pallet: 'BridgeCommitment';
    readonly callback: 'OnBlockStored::on_block_stored';
    readonly storageMap: 'ProcessedPegIns';
    readonly storageHasher: 'Blake2_128Concat';
    readonly storagePrefixHex:
      typeof PROCESSED_PEG_INS_STORAGE_PREFIX_HEX;
    readonly replayKeyHash: 'Blake2b256';
    readonly replayKeyDomain: typeof PEG_IN_RECORD_KEY_DOMAIN;
    readonly replayKeyComponents:
      readonly ['domain', 'sidechainId', 'ergoBoxId'];
    readonly recordWrittenAfterSuccessfulEvmExecution: true;
    readonly allFallibleValidationBeforeNativeMutation: true;
    readonly priorRecordCausesCallbackErrorBeforeNativeMutation: true;
    readonly recordsMonotonicAndNeverDeleted: true;
    readonly nativeRecordIsNotTheEvmWriteBeforeMintGuard: true;
  };
  readonly evmMint: {
    readonly bridgeContract: 'ErgoBridge';
    readonly bridgeMintSignature: typeof BRIDGE_MINT_SIGNATURE;
    readonly bridgeMintSelectorHex: string;
    readonly replayMapping: 'processedPegIns(bytes32)';
    readonly replayWriteBeforeExternalTokenMint: true;
    readonly tokenContract: 'SERG';
    readonly tokenMintSignature: typeof TOKEN_MINT_SIGNATURE;
    readonly tokenMintSelectorHex: string;
    readonly eventSignature: typeof PEG_IN_EVENT_SIGNATURE;
    readonly eventTopicHex: string;
    readonly eventEmittedAfterTokenMint: true;
    readonly sameEvmTransaction: true;
    readonly failedTokenMintRollsBackReplayWriteAndEvent: true;
  };
  readonly mintEntrypoints: {
    readonly manifest: readonly [
      {
        readonly contract: 'ErgoBridge';
        readonly signature: typeof BRIDGE_MINT_SIGNATURE;
        readonly authorization: 'onlyOwner';
        readonly role: 'bridge-orchestrated-mint';
      },
      {
        readonly contract: 'SERG';
        readonly signature: typeof TOKEN_MINT_SIGNATURE;
        readonly authorization: 'onlyOwner';
        readonly role: 'token-mint';
      },
    ];
    readonly completeSourceInventoryReviewed: true;
    readonly alternateUnboundMintEntrypointCount: 0;
    readonly ownershipMutationEntrypoints: readonly [
      'ErgoBridge.renounceOwnership()',
      'ErgoBridge.transferOwnership(address)',
      'SERG.renounceOwnership()',
      'SERG.transferOwnership(address)',
    ];
    readonly proxyDelegateOrFallbackMintRouteCount: 0;
    readonly requiredDeployedBindings: {
      readonly bridgeSergTokenEqualsReviewedToken: true;
      readonly tokenOwnerEqualsReviewedBridge: true;
      readonly exactBridgeRuntimeCodeRequired: true;
      readonly exactTokenRuntimeCodeRequired: true;
      readonly independentlyObservedImmediatelyBeforeMintAdmission: true;
    };
  };
  readonly decision: {
    readonly status: 'PASS';
    readonly exactReviewedRepositoryFilesBound: true;
    readonly replayIdentityInvariantReviewed: true;
    readonly evmWriteBeforeMintInvariantReviewed: true;
    readonly failedMintRollbackInvariantReviewed: true;
    readonly completeMintEntrypointInventoryReviewed: true;
    readonly nativePostExecutionRecordSemanticsReviewed: true;
  };
  readonly reviewer: {
    readonly keyIdHex: string;
    readonly organizationId: string;
  };
  readonly boundaries: {
    readonly sourceSemanticsReviewOnly: true;
    readonly deployedBridgeCodeVerified: false;
    readonly deployedTokenCodeVerified: false;
    readonly deployedTokenOwnershipVerified: false;
    readonly completeHistoricalTokenOwnershipVerified: false;
    readonly wholeBlockCallbackRollbackVerified: false;
    readonly reproducibleSolidityBuildClosureVerified: false;
    readonly sidechainFinalityVerified: false;
    readonly runtimeCodeStateProofVerified: false;
    readonly runtimeUpgradeHistoryVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly admissionEligible: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

export interface PegInRuntimeInvariantReviewPacketV1 {
  readonly schema: typeof PEG_IN_RUNTIME_INVARIANT_REVIEW_PACKET_V1_SCHEMA;
  readonly statement: PegInRuntimeInvariantProfileV1;
  readonly statementDigestHex: string;
  readonly signature: {
    readonly keyIdHex: string;
    readonly signatureHex: string;
  };
}

export interface PegInRuntimeInvariantReviewReportV1 {
  readonly schema: typeof PEG_IN_RUNTIME_INVARIANT_REVIEW_REPORT_V1_SCHEMA;
  readonly status: typeof PEG_IN_RUNTIME_INVARIANT_REVIEW_STATUS;
  readonly profileId: string;
  readonly reviewId: string;
  readonly reviewPacketSha256Hex: string;
  readonly statementDigestHex: string;
  readonly reviewerPolicyDigestHex: string;
  readonly runtime: PegInRuntimeInvariantProfileV1['runtime'];
  readonly source: PegInRuntimeInvariantSourceBindingV1;
  readonly reviewer: PegInRuntimeInvariantProfileV1['reviewer'];
  readonly semanticBindings: {
    readonly nativeRecordIsPostExecutionEvidence: true;
    readonly evmReplayWritePrecedesExternalTokenMint: true;
    readonly failedMintRollsBackEvmReplayWriteAndEvent: true;
    readonly directTokenMintEntrypointEnumerated: true;
    readonly ownershipMutationEntrypointsEnumerated: true;
    readonly deployedTokenOwnershipRemainsExternalEvidence: true;
    readonly eventAloneDoesNotProveTokenMint: true;
    readonly wholeBlockCallbackRollbackRemainsExternalEvidence: true;
    readonly reproducibleSolidityBuildClosureRemainsExternalEvidence: true;
  };
  readonly boundary: {
    readonly relativeToSuppliedPolicy: true;
    readonly canonicalSourceOwnedReviewerRootsLoaded: boolean;
    readonly exactSourceBindingApprovedByPolicy: true;
    readonly currentRepositorySourceBytesVerifiedByThisValidator: false;
    readonly reviewerSignatureVerified: true;
    readonly organizationalIndependenceCryptographicallyProven: false;
    readonly deployedBridgeCodeVerified: false;
    readonly deployedTokenCodeVerified: false;
    readonly deployedTokenOwnershipVerified: false;
    readonly completeHistoricalTokenOwnershipVerified: false;
    readonly wholeBlockCallbackRollbackVerified: false;
    readonly reproducibleSolidityBuildClosureVerified: false;
    readonly sidechainFinalityVerified: false;
    readonly runtimeCodeStateProofVerified: false;
    readonly runtimeUpgradeHistoryVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly admissionEligible: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

declare const REVIEWED_PROFILE_BRAND: unique symbol;
export type ReviewedPegInRuntimeInvariantProfileV1 =
  PegInRuntimeInvariantReviewReportV1 & {
    readonly [REVIEWED_PROFILE_BRAND]: true;
  };

export function derivePegInRuntimeInvariantSourceBindingV1(
  bridgeRoot: string,
): PegInRuntimeInvariantSourceBindingV1 {
  const sourceLockBytes = readGuardedFile(
    bridgeRoot,
    CONSENSUS_SOURCE_LOCK_PATH,
    'consensus source lock',
  );
  const sourceLock = parseJsonRecord(
    sourceLockBytes,
    'consensus source lock',
  );
  const frontier = exactRecord(
    sourceLock.frontier,
    [
      'buildCommand',
      'buildEnvironment',
      'bridgeAtomicityFixtures',
      'cargoLockBlob',
      'commit',
      'files',
      'gitlinkPath',
      'grandpaAuthorityTransitionProofRpcImplemented',
      'grandpaFinalityProofRpcImplemented',
      'nativeFinalizedCheckpointVerificationImplemented',
      'nativeGrandpaAuthorityTransitionVerificationImplemented',
      'nativeGrandpaFinalityProofVerificationImplemented',
      'nativeHashLinkedGrandpaVerificationImplemented',
      'nativeRpcProofCodecImplemented',
      'nativeRuntimeCommitmentStateProofVerificationImplemented',
      'nodeManifestBlob',
      'patchPath',
      'patchSha256',
      'path',
      'ref',
      'repository',
      'role',
      'runtimeCommitmentProducerImplemented',
      'runtimeManifestBlob',
      'rustToolchain',
      'rustToolchainBlob',
      'submoduleName',
    ],
    'consensus source lock Frontier entry',
  );
  literal(
    frontier.patchPath,
    'sources/frontier/0001-bridge-runtime-commitment.patch',
    'Frontier patch path',
  );
  const declaredFrontierPatchSha256Hex = prefixedFixedHex(
    frontier.patchSha256,
    32,
    'Frontier patch SHA-256',
  );
  const observedFrontierPatchSha256Hex = prefixedSha256(readGuardedFile(
    bridgeRoot,
    FRONTIER_PATCH_PATH,
    'Frontier patch',
  ));
  if (
    observedFrontierPatchSha256Hex !== declaredFrontierPatchSha256Hex
  ) {
    throw new Error(
      'Frontier patch bytes do not match the consensus source lock',
    );
  }
  return deepFreeze({
    consensusSourceLockSha256Hex: prefixedSha256(sourceLockBytes),
    frontierCommitHex: fixedHex(
      frontier.commit,
      20,
      'Frontier commit',
      false,
    ),
    frontierPatchSha256Hex: observedFrontierPatchSha256Hex,
    runtimeSourceManifestSha256Hex: prefixedFixedHex(
      derivePegInRuntimeSourceManifestSha256(sourceLock),
      32,
      'runtime source manifest SHA-256',
    ),
    ergoBridgeSourceSha256Hex: prefixedSha256(readGuardedFile(
      bridgeRoot,
      ERGO_BRIDGE_SOURCE_PATH,
      'ErgoBridge source',
    )),
    ergoBridgeAbiSha256Hex: prefixedSha256(readGuardedFile(
      bridgeRoot,
      ERGO_BRIDGE_ABI_PATH,
      'ErgoBridge ABI',
    )),
    ergoBridgeBytecodeSha256Hex: prefixedSha256(readGuardedFile(
      bridgeRoot,
      ERGO_BRIDGE_BYTECODE_PATH,
      'ErgoBridge bytecode',
    )),
    sergSourceSha256Hex: prefixedSha256(readGuardedFile(
      bridgeRoot,
      SERG_SOURCE_PATH,
      'SERG source',
    )),
    sergAbiSha256Hex: prefixedSha256(readGuardedFile(
      bridgeRoot,
      SERG_ABI_PATH,
      'SERG ABI',
    )),
    sergBytecodeSha256Hex: prefixedSha256(readGuardedFile(
      bridgeRoot,
      SERG_BYTECODE_PATH,
      'SERG bytecode',
    )),
  });
}

export function derivePegInRuntimeInvariantAbiBindingsV1(
  bridgeRoot: string,
): Pick<
  PegInRuntimeInvariantProfileV1['evmMint'],
  'bridgeMintSelectorHex' | 'tokenMintSelectorHex' | 'eventTopicHex'
> {
  const bridgeAbi = parseAbi(
    readGuardedFile(bridgeRoot, ERGO_BRIDGE_ABI_PATH, 'ErgoBridge ABI'),
    'ErgoBridge ABI',
  );
  const tokenAbi = parseAbi(
    readGuardedFile(bridgeRoot, SERG_ABI_PATH, 'SERG ABI'),
    'SERG ABI',
  );
  const bridgeInterface = new Interface(bridgeAbi);
  const tokenInterface = new Interface(tokenAbi);
  const bridgeMint = bridgeInterface.getFunction(BRIDGE_MINT_SIGNATURE);
  const tokenMint = tokenInterface.getFunction(TOKEN_MINT_SIGNATURE);
  const pegIn = bridgeInterface.getEvent(PEG_IN_EVENT_SIGNATURE);
  if (!bridgeMint || !tokenMint || !pegIn) {
    throw new Error('reviewed ABI closure lacks the required peg-in mint surface');
  }
  return deepFreeze({
    bridgeMintSelectorHex: bridgeMint.selector.toLowerCase(),
    tokenMintSelectorHex: tokenMint.selector.toLowerCase(),
    eventTopicHex: pegIn.topicHash.toLowerCase(),
  });
}

export function canonicalPegInRuntimeInvariantReviewMessageV1(
  statement: PegInRuntimeInvariantProfileV1,
): Buffer {
  return Buffer.concat([
    REVIEW_MESSAGE_DOMAIN,
    Buffer.from(
      canonicalE2sJson(normalizeInvariantProfile(statement)),
      'utf8',
    ),
  ]);
}

export function derivePegInRuntimeInvariantReviewPacketSha256HexV1(
  packet: PegInRuntimeInvariantReviewPacketV1,
): string {
  return prefixedSha256(Buffer.concat([
    REVIEW_PACKET_DOMAIN,
    Buffer.from(canonicalE2sJson(normalizeReviewPacket(packet)), 'utf8'),
  ]));
}

export function derivePegInRuntimeInvariantReviewerPolicyDigestHexV1(
  value: unknown,
): string {
  return prefixedSha256(
    Buffer.from(canonicalE2sJson(normalizeReviewerLock(value)), 'utf8'),
  );
}

export function derivePegInRuntimeInvariantSourceBindingDigestHexV1(
  value: unknown,
): string {
  return prefixedSha256(
    Buffer.from(canonicalE2sJson(normalizeSourceBinding(value)), 'utf8'),
  );
}

export function assertPegInRuntimeInvariantSourceBindingMatchesRepositoryV1(
  bridgeRoot: string,
  source: PegInRuntimeInvariantSourceBindingV1,
): void {
  const expected = derivePegInRuntimeInvariantSourceBindingV1(bridgeRoot);
  if (canonicalE2sJson(source) !== canonicalE2sJson(expected)) {
    throw new Error(
      'runtime invariant review source binding does not match the exact repository bytes',
    );
  }
}

export function loadPegInRuntimeInvariantReviewerLockV1():
PegInRuntimeInvariantReviewerLockV1 {
  const bytes = readGuardedFile(
    CANONICAL_BRIDGE_ROOT,
    CANONICAL_REVIEWER_LOCK_PATH,
    'runtime invariant reviewer lock',
  );
  return normalizeReviewerLock(
    parseJsonRecord(bytes, 'runtime invariant reviewer lock'),
  );
}

export function validatePegInRuntimeInvariantReviewerLockV1(
  value: unknown,
): PegInRuntimeInvariantReviewerLockV1 {
  return normalizeReviewerLock(value);
}

export function validatePegInRuntimeInvariantReviewAgainstPolicyV1(input: {
  readonly reviewerLock: PegInRuntimeInvariantReviewerLockV1;
  readonly packet: PegInRuntimeInvariantReviewPacketV1;
  readonly evaluatedAt?: string;
}): PegInRuntimeInvariantReviewReportV1 {
  return validateReview({
    ...input,
    canonicalSourceOwnedReviewerRootsLoaded: false,
  });
}

export function verifyReviewedPegInRuntimeInvariantProfileV1(input: {
  readonly packet: PegInRuntimeInvariantReviewPacketV1;
}): ReviewedPegInRuntimeInvariantProfileV1 {
  const report = validateReview({
    reviewerLock: loadPegInRuntimeInvariantReviewerLockV1(),
    packet: input.packet,
    evaluatedAt: new Date().toISOString(),
    canonicalSourceOwnedReviewerRootsLoaded: true,
  }) as ReviewedPegInRuntimeInvariantProfileV1;
  REVIEWED_REPORTS.add(report);
  return report;
}

export function assertPegInRuntimeInvariantReviewValidationProvenanceV1(
  value: unknown,
): asserts value is PegInRuntimeInvariantReviewReportV1 {
  if (!value || typeof value !== 'object' || !VALIDATION_REPORTS.has(value)) {
    throw new Error(
      'peg-in runtime invariant review validation provenance is missing',
    );
  }
}

export function assertReviewedPegInRuntimeInvariantProfileProvenanceV1(
  value: unknown,
): asserts value is ReviewedPegInRuntimeInvariantProfileV1 {
  if (!value || typeof value !== 'object' || !REVIEWED_REPORTS.has(value)) {
    throw new Error(
      'reviewed peg-in runtime invariant profile provenance is missing',
    );
  }
}

function validateReview(input: {
  readonly reviewerLock: PegInRuntimeInvariantReviewerLockV1;
  readonly packet: PegInRuntimeInvariantReviewPacketV1;
  readonly evaluatedAt?: string;
  readonly canonicalSourceOwnedReviewerRootsLoaded: boolean;
}): PegInRuntimeInvariantReviewReportV1 {
  const reviewerLock = normalizeReviewerLock(input.reviewerLock);
  const packet = normalizeReviewPacket(input.packet);
  const statement = packet.statement;
  const profile = selectActiveReviewerProfile(
    reviewerLock,
    statement,
    input.evaluatedAt ?? new Date().toISOString(),
  );
  if (
    packet.signature.keyIdHex !== statement.reviewer.keyIdHex
    || packet.signature.keyIdHex !== profile.reviewer.keyIdHex
  ) {
    throw new Error(
      'runtime invariant review signature does not bind the selected reviewer',
    );
  }
  const message = canonicalPegInRuntimeInvariantReviewMessageV1(statement);
  if (packet.statementDigestHex !== prefixedSha256(message)) {
    throw new Error('runtime invariant review statement digest is invalid');
  }
  verifyReviewerSignature(
    profile.reviewer,
    packet.signature.signatureHex,
    message,
  );
  assertApprovedRuntimeSourceBinding(profile, statement);
  assertCanonicalAbiBindings(statement.evmMint);

  const report: PegInRuntimeInvariantReviewReportV1 = deepFreeze({
    schema: PEG_IN_RUNTIME_INVARIANT_REVIEW_REPORT_V1_SCHEMA,
    status: PEG_IN_RUNTIME_INVARIANT_REVIEW_STATUS,
    profileId: statement.profileId,
    reviewId: statement.reviewId,
    reviewPacketSha256Hex:
      derivePegInRuntimeInvariantReviewPacketSha256HexV1(packet),
    statementDigestHex: packet.statementDigestHex,
    reviewerPolicyDigestHex:
      derivePegInRuntimeInvariantReviewerPolicyDigestHexV1(reviewerLock),
    runtime: statement.runtime,
    source: statement.source,
    reviewer: statement.reviewer,
    semanticBindings: {
      nativeRecordIsPostExecutionEvidence: true,
      evmReplayWritePrecedesExternalTokenMint: true,
      failedMintRollsBackEvmReplayWriteAndEvent: true,
      directTokenMintEntrypointEnumerated: true,
      ownershipMutationEntrypointsEnumerated: true,
      deployedTokenOwnershipRemainsExternalEvidence: true,
      eventAloneDoesNotProveTokenMint: true,
      wholeBlockCallbackRollbackRemainsExternalEvidence: true,
      reproducibleSolidityBuildClosureRemainsExternalEvidence: true,
    },
    boundary: {
      relativeToSuppliedPolicy: true,
      canonicalSourceOwnedReviewerRootsLoaded:
        input.canonicalSourceOwnedReviewerRootsLoaded,
      exactSourceBindingApprovedByPolicy: true,
      currentRepositorySourceBytesVerifiedByThisValidator: false,
      reviewerSignatureVerified: true,
      organizationalIndependenceCryptographicallyProven: false,
      deployedBridgeCodeVerified: false,
      deployedTokenCodeVerified: false,
      deployedTokenOwnershipVerified: false,
      completeHistoricalTokenOwnershipVerified: false,
      wholeBlockCallbackRollbackVerified: false,
      reproducibleSolidityBuildClosureVerified: false,
      sidechainFinalityVerified: false,
      runtimeCodeStateProofVerified: false,
      runtimeUpgradeHistoryVerified: false,
      historicalMintAbsenceVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      admissionEligible: false,
      gate5Closed: false,
      productionReady: false,
    },
  } as const);
  VALIDATION_REPORTS.add(report);
  return report;
}

function normalizeReviewerLock(
  value: unknown,
): PegInRuntimeInvariantReviewerLockV1 {
  const record = exactRecord(
    value,
    [
      'boundaries',
      'canonicalization',
      'kind',
      'profiles',
      'schemaVersion',
      'signatureAlgorithm',
    ],
    'runtime invariant reviewer lock',
  );
  literal(
    record.schemaVersion,
    PEG_IN_RUNTIME_INVARIANT_REVIEWER_LOCK_SCHEMA_VERSION,
    'runtime invariant reviewer lock schema version',
  );
  literal(
    record.kind,
    PEG_IN_RUNTIME_INVARIANT_REVIEWER_LOCK_KIND,
    'runtime invariant reviewer lock kind',
  );
  literal(
    record.canonicalization,
    CANONICALIZATION,
    'runtime invariant reviewer lock canonicalization',
  );
  literal(
    record.signatureAlgorithm,
    SIGNATURE_ALGORITHM,
    'runtime invariant reviewer lock signature algorithm',
  );
  if (!Array.isArray(record.profiles)) {
    throw new Error('runtime invariant reviewer lock profiles must be an array');
  }
  const profiles = record.profiles.map((entry, index) =>
    normalizeReviewerProfile(entry, index));
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (ids.has(profile.profileId)) {
      throw new Error('runtime invariant reviewer profile IDs must be unique');
    }
    ids.add(profile.profileId);
  }
  const boundaries = exactRecord(
    record.boundaries,
    [
      'runtimeHistoryAndCommittedVaultRemainRequired',
      'runtimeProfilesCannotAddTrustRoots',
      'signaturesDoNotProveOrganizationalIndependence',
      'sourceReviewDoesNotVerifyDeployedCodeOrOwnership',
    ],
    'runtime invariant reviewer lock boundaries',
  );
  for (const [name, value] of Object.entries(boundaries)) {
    literal(value, true, `runtime invariant reviewer lock boundary ${name}`);
  }
  return deepFreeze({
    schemaVersion: PEG_IN_RUNTIME_INVARIANT_REVIEWER_LOCK_SCHEMA_VERSION,
    kind: PEG_IN_RUNTIME_INVARIANT_REVIEWER_LOCK_KIND,
    canonicalization: CANONICALIZATION,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    profiles,
    boundaries: {
      runtimeProfilesCannotAddTrustRoots: true,
      signaturesDoNotProveOrganizationalIndependence: true,
      sourceReviewDoesNotVerifyDeployedCodeOrOwnership: true,
      runtimeHistoryAndCommittedVaultRemainRequired: true,
    },
  });
}

function normalizeReviewerProfile(
  value: unknown,
  index: number,
): PegInRuntimeInvariantReviewerProfileV1 {
  const label = `runtime invariant reviewer profile[${index}]`;
  const record = exactRecord(
    value,
    [
      'forbiddenAuthorityKeyIds',
      'approvedRuntimeSourceBindings',
      'profileId',
      'reviewer',
      'status',
      'validFrom',
      'validUntil',
    ],
    label,
  );
  if (record.status !== 'active' && record.status !== 'revoked') {
    throw new Error(`${label} status is unsupported`);
  }
  if (!Array.isArray(record.forbiddenAuthorityKeyIds)) {
    throw new Error(`${label} forbidden authority key IDs must be an array`);
  }
  if (!Array.isArray(record.approvedRuntimeSourceBindings)) {
    throw new Error(
      `${label} approved runtime/source bindings must be an array`,
    );
  }
  const approvedRuntimeSourceBindings =
    record.approvedRuntimeSourceBindings.map((entry, bindingIndex) => {
      const binding = exactRecord(
        entry,
        [
          'buildAttestationId',
          'buildAttestationSha256Hex',
          'runtimeArtifactSha256Hex',
          'runtimeArtifactSizeBytes',
          'sourceBindingDigestHex',
        ],
        `${label} approved runtime/source binding[${bindingIndex}]`,
      );
      return deepFreeze({
        runtimeArtifactSha256Hex: prefixedFixedHex(
          binding.runtimeArtifactSha256Hex,
          32,
          `${label} approved runtime artifact SHA-256`,
        ),
        runtimeArtifactSizeBytes: positiveCanonicalInteger(
          binding.runtimeArtifactSizeBytes,
          `${label} approved runtime artifact size`,
        ),
        buildAttestationId: portableId(
          binding.buildAttestationId,
          `${label} approved build attestation ID`,
        ),
        buildAttestationSha256Hex: prefixedFixedHex(
          binding.buildAttestationSha256Hex,
          32,
          `${label} approved build attestation SHA-256`,
        ),
        sourceBindingDigestHex: prefixedFixedHex(
          binding.sourceBindingDigestHex,
          32,
          `${label} approved source binding digest`,
        ),
      });
    });
  const approvedRuntimeDigests = approvedRuntimeSourceBindings.map(
    binding => binding.runtimeArtifactSha256Hex,
  );
  if (
    new Set(approvedRuntimeDigests).size !== approvedRuntimeDigests.length
  ) {
    throw new Error(
      `${label} approved runtime/source bindings must not duplicate a runtime`,
    );
  }
  const forbiddenAuthorityKeyIds = record.forbiddenAuthorityKeyIds.map(
    (entry, keyIndex) => fixedHex(
      entry,
      32,
      `${label} forbidden authority key ID[${keyIndex}]`,
      false,
    ),
  );
  if (new Set(forbiddenAuthorityKeyIds).size !== forbiddenAuthorityKeyIds.length) {
    throw new Error(`${label} forbidden authority key IDs must be unique`);
  }
  const reviewer = normalizeReviewerKey(record.reviewer, label);
  if (forbiddenAuthorityKeyIds.includes(reviewer.keyIdHex)) {
    throw new Error(
      `${label} reviewer must remain separate from bridge authorities`,
    );
  }
  const validFrom = isoTimestamp(record.validFrom, `${label} validFrom`);
  const validUntil = isoTimestamp(record.validUntil, `${label} validUntil`);
  if (Date.parse(validFrom) >= Date.parse(validUntil)) {
    throw new Error(`${label} validity interval is empty or inverted`);
  }
  return deepFreeze({
    profileId: portableId(record.profileId, `${label} ID`),
    status: record.status,
    validFrom,
    validUntil,
    reviewer,
    forbiddenAuthorityKeyIds,
    approvedRuntimeSourceBindings,
  });
}

function normalizeReviewerKey(
  value: unknown,
  parentLabel: string,
): PegInRuntimeInvariantReviewerKeyV1 {
  const record = exactRecord(
    value,
    ['keyIdHex', 'organizationId', 'publicKeySpkiDerHex', 'role'],
    `${parentLabel} reviewer`,
  );
  literal(
    record.role,
    'independent-runtime-invariant-reviewer',
    `${parentLabel} reviewer role`,
  );
  return deepFreeze({
    role: 'independent-runtime-invariant-reviewer',
    organizationId: portableId(
      record.organizationId,
      `${parentLabel} reviewer organization`,
    ),
    keyIdHex: fixedHex(
      record.keyIdHex,
      32,
      `${parentLabel} reviewer key ID`,
      false,
    ),
    publicKeySpkiDerHex: variableHex(
      record.publicKeySpkiDerHex,
      `${parentLabel} reviewer public key`,
      false,
    ),
  });
}

function normalizeReviewPacket(
  value: unknown,
): PegInRuntimeInvariantReviewPacketV1 {
  const record = exactRecord(
    value,
    ['schema', 'signature', 'statement', 'statementDigestHex'],
    'runtime invariant review packet',
  );
  literal(
    record.schema,
    PEG_IN_RUNTIME_INVARIANT_REVIEW_PACKET_V1_SCHEMA,
    'runtime invariant review packet schema',
  );
  const signature = exactRecord(
    record.signature,
    ['keyIdHex', 'signatureHex'],
    'runtime invariant review signature',
  );
  return deepFreeze({
    schema: PEG_IN_RUNTIME_INVARIANT_REVIEW_PACKET_V1_SCHEMA,
    statement: normalizeInvariantProfile(record.statement),
    statementDigestHex: prefixedFixedHex(
      record.statementDigestHex,
      32,
      'runtime invariant review statement digest',
    ),
    signature: {
      keyIdHex: fixedHex(
        signature.keyIdHex,
        32,
        'runtime invariant review signature key ID',
        false,
      ),
      signatureHex: fixedHex(
        signature.signatureHex,
        64,
        'runtime invariant review signature',
        false,
      ),
    },
  });
}

function normalizeInvariantProfile(
  value: unknown,
): PegInRuntimeInvariantProfileV1 {
  const record = exactRecord(
    value,
    [
      'boundaries',
      'canonicalization',
      'decision',
      'evmMint',
      'mintEntrypoints',
      'nativeRecord',
      'profileId',
      'reviewId',
      'reviewedAt',
      'reviewer',
      'runtime',
      'schema',
      'signatureAlgorithm',
      'source',
    ],
    'runtime invariant profile V1',
  );
  literal(
    record.schema,
    PEG_IN_RUNTIME_INVARIANT_PROFILE_V1_SCHEMA,
    'runtime invariant profile V1 schema',
  );
  literal(
    record.canonicalization,
    CANONICALIZATION,
    'runtime invariant profile canonicalization',
  );
  literal(
    record.signatureAlgorithm,
    SIGNATURE_ALGORITHM,
    'runtime invariant profile signature algorithm',
  );
  const runtime = normalizeRuntime(record.runtime);
  const source = normalizeSourceBinding(record.source);
  const nativeRecord = normalizeNativeRecord(record.nativeRecord);
  const evmMint = normalizeEvmMint(record.evmMint);
  const mintEntrypoints = normalizeMintEntrypoints(record.mintEntrypoints);
  const decision = normalizeDecision(record.decision);
  const reviewer = exactRecord(
    record.reviewer,
    ['keyIdHex', 'organizationId'],
    'runtime invariant profile reviewer',
  );
  const boundaries = normalizeStatementBoundaries(record.boundaries);
  return deepFreeze({
    schema: PEG_IN_RUNTIME_INVARIANT_PROFILE_V1_SCHEMA,
    profileId: portableId(record.profileId, 'runtime invariant profile ID'),
    reviewId: portableId(record.reviewId, 'runtime invariant review ID'),
    reviewedAt: isoTimestamp(
      record.reviewedAt,
      'runtime invariant review timestamp',
    ),
    canonicalization: CANONICALIZATION,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    runtime,
    source,
    nativeRecord,
    evmMint,
    mintEntrypoints,
    decision,
    reviewer: {
      keyIdHex: fixedHex(
        reviewer.keyIdHex,
        32,
        'runtime invariant reviewer key ID',
        false,
      ),
      organizationId: portableId(
        reviewer.organizationId,
        'runtime invariant reviewer organization',
      ),
    },
    boundaries,
  });
}

function normalizeRuntime(
  value: unknown,
): PegInRuntimeInvariantProfileV1['runtime'] {
  const record = exactRecord(
    value,
    [
      'artifactSha256Hex',
      'artifactSizeBytes',
      'buildAttestationId',
      'buildAttestationSha256Hex',
    ],
    'runtime invariant runtime identity',
  );
  return {
    artifactSha256Hex: prefixedFixedHex(
      record.artifactSha256Hex,
      32,
      'runtime artifact SHA-256',
    ),
    artifactSizeBytes: positiveCanonicalInteger(
      record.artifactSizeBytes,
      'runtime artifact size',
    ),
    buildAttestationId: portableId(
      record.buildAttestationId,
      'runtime build attestation ID',
    ),
    buildAttestationSha256Hex: prefixedFixedHex(
      record.buildAttestationSha256Hex,
      32,
      'runtime build attestation SHA-256',
    ),
  };
}

function normalizeSourceBinding(
  value: unknown,
): PegInRuntimeInvariantSourceBindingV1 {
  const fields = [
    'consensusSourceLockSha256Hex',
    'ergoBridgeAbiSha256Hex',
    'ergoBridgeBytecodeSha256Hex',
    'ergoBridgeSourceSha256Hex',
    'frontierCommitHex',
    'frontierPatchSha256Hex',
    'runtimeSourceManifestSha256Hex',
    'sergAbiSha256Hex',
    'sergBytecodeSha256Hex',
    'sergSourceSha256Hex',
  ] as const;
  const record = exactRecord(
    value,
    fields,
    'runtime invariant source binding',
  );
  return deepFreeze({
    consensusSourceLockSha256Hex: prefixedFixedHex(
      record.consensusSourceLockSha256Hex,
      32,
      'consensus source lock SHA-256',
    ),
    frontierCommitHex: fixedHex(
      record.frontierCommitHex,
      20,
      'Frontier commit',
      false,
    ),
    frontierPatchSha256Hex: prefixedFixedHex(
      record.frontierPatchSha256Hex,
      32,
      'Frontier patch SHA-256',
    ),
    runtimeSourceManifestSha256Hex: prefixedFixedHex(
      record.runtimeSourceManifestSha256Hex,
      32,
      'runtime source manifest SHA-256',
    ),
    ergoBridgeSourceSha256Hex: prefixedFixedHex(
      record.ergoBridgeSourceSha256Hex,
      32,
      'ErgoBridge source SHA-256',
    ),
    ergoBridgeAbiSha256Hex: prefixedFixedHex(
      record.ergoBridgeAbiSha256Hex,
      32,
      'ErgoBridge ABI SHA-256',
    ),
    ergoBridgeBytecodeSha256Hex: prefixedFixedHex(
      record.ergoBridgeBytecodeSha256Hex,
      32,
      'ErgoBridge bytecode SHA-256',
    ),
    sergSourceSha256Hex: prefixedFixedHex(
      record.sergSourceSha256Hex,
      32,
      'SERG source SHA-256',
    ),
    sergAbiSha256Hex: prefixedFixedHex(
      record.sergAbiSha256Hex,
      32,
      'SERG ABI SHA-256',
    ),
    sergBytecodeSha256Hex: prefixedFixedHex(
      record.sergBytecodeSha256Hex,
      32,
      'SERG bytecode SHA-256',
    ),
  });
}

function normalizeNativeRecord(
  value: unknown,
): PegInRuntimeInvariantProfileV1['nativeRecord'] {
  const record = exactRecord(
    value,
    [
      'allFallibleValidationBeforeNativeMutation',
      'callback',
      'nativeRecordIsNotTheEvmWriteBeforeMintGuard',
      'pallet',
      'priorRecordCausesCallbackErrorBeforeNativeMutation',
      'recordWrittenAfterSuccessfulEvmExecution',
      'recordsMonotonicAndNeverDeleted',
      'replayKeyComponents',
      'replayKeyDomain',
      'replayKeyHash',
      'storageHasher',
      'storageMap',
      'storagePrefixHex',
    ],
    'runtime invariant native record',
  );
  literal(record.pallet, 'BridgeCommitment', 'native record pallet');
  literal(
    record.callback,
    'OnBlockStored::on_block_stored',
    'native record callback',
  );
  literal(record.storageMap, 'ProcessedPegIns', 'native record storage map');
  literal(record.storageHasher, 'Blake2_128Concat', 'native storage hasher');
  literal(record.replayKeyHash, 'Blake2b256', 'native replay-key hash');
  literal(
    record.replayKeyDomain,
    PEG_IN_RECORD_KEY_DOMAIN,
    'native replay-key domain',
  );
  if (
    !Array.isArray(record.replayKeyComponents)
    || canonicalE2sJson(record.replayKeyComponents)
      !== canonicalE2sJson(['domain', 'sidechainId', 'ergoBoxId'])
  ) {
    throw new Error('native replay-key components are unsupported');
  }
  for (const field of [
    'recordWrittenAfterSuccessfulEvmExecution',
    'allFallibleValidationBeforeNativeMutation',
    'priorRecordCausesCallbackErrorBeforeNativeMutation',
    'recordsMonotonicAndNeverDeleted',
    'nativeRecordIsNotTheEvmWriteBeforeMintGuard',
  ] as const) {
    literal(record[field], true, `native record invariant ${field}`);
  }
  return deepFreeze({
    pallet: 'BridgeCommitment',
    callback: 'OnBlockStored::on_block_stored',
    storageMap: 'ProcessedPegIns',
    storageHasher: 'Blake2_128Concat',
    storagePrefixHex: literal(
      record.storagePrefixHex,
      PROCESSED_PEG_INS_STORAGE_PREFIX_HEX,
      'native record storage prefix',
    ),
    replayKeyHash: 'Blake2b256',
    replayKeyDomain: PEG_IN_RECORD_KEY_DOMAIN,
    replayKeyComponents: ['domain', 'sidechainId', 'ergoBoxId'],
    recordWrittenAfterSuccessfulEvmExecution: true,
    allFallibleValidationBeforeNativeMutation: true,
    priorRecordCausesCallbackErrorBeforeNativeMutation: true,
    recordsMonotonicAndNeverDeleted: true,
    nativeRecordIsNotTheEvmWriteBeforeMintGuard: true,
  });
}

function normalizeEvmMint(
  value: unknown,
): PegInRuntimeInvariantProfileV1['evmMint'] {
  const record = exactRecord(
    value,
    [
      'bridgeContract',
      'bridgeMintSelectorHex',
      'bridgeMintSignature',
      'eventEmittedAfterTokenMint',
      'eventSignature',
      'eventTopicHex',
      'failedTokenMintRollsBackReplayWriteAndEvent',
      'replayMapping',
      'replayWriteBeforeExternalTokenMint',
      'sameEvmTransaction',
      'tokenContract',
      'tokenMintSelectorHex',
      'tokenMintSignature',
    ],
    'runtime invariant EVM mint',
  );
  literal(record.bridgeContract, 'ErgoBridge', 'bridge contract');
  literal(
    record.bridgeMintSignature,
    BRIDGE_MINT_SIGNATURE,
    'bridge mint signature',
  );
  literal(
    record.replayMapping,
    'processedPegIns(bytes32)',
    'bridge replay mapping',
  );
  literal(record.tokenContract, 'SERG', 'token contract');
  literal(
    record.tokenMintSignature,
    TOKEN_MINT_SIGNATURE,
    'token mint signature',
  );
  literal(
    record.eventSignature,
    PEG_IN_EVENT_SIGNATURE,
    'peg-in event signature',
  );
  for (const field of [
    'replayWriteBeforeExternalTokenMint',
    'eventEmittedAfterTokenMint',
    'sameEvmTransaction',
    'failedTokenMintRollsBackReplayWriteAndEvent',
  ] as const) {
    literal(record[field], true, `EVM mint invariant ${field}`);
  }
  return deepFreeze({
    bridgeContract: 'ErgoBridge',
    bridgeMintSignature: BRIDGE_MINT_SIGNATURE,
    bridgeMintSelectorHex: prefixedFixedHex(
      record.bridgeMintSelectorHex,
      4,
      'bridge mint selector',
    ),
    replayMapping: 'processedPegIns(bytes32)',
    replayWriteBeforeExternalTokenMint: true,
    tokenContract: 'SERG',
    tokenMintSignature: TOKEN_MINT_SIGNATURE,
    tokenMintSelectorHex: prefixedFixedHex(
      record.tokenMintSelectorHex,
      4,
      'token mint selector',
    ),
    eventSignature: PEG_IN_EVENT_SIGNATURE,
    eventTopicHex: prefixedFixedHex(
      record.eventTopicHex,
      32,
      'peg-in event topic',
    ),
    eventEmittedAfterTokenMint: true,
    sameEvmTransaction: true,
    failedTokenMintRollsBackReplayWriteAndEvent: true,
  });
}

function normalizeMintEntrypoints(
  value: unknown,
): PegInRuntimeInvariantProfileV1['mintEntrypoints'] {
  const record = exactRecord(
    value,
    [
      'alternateUnboundMintEntrypointCount',
      'completeSourceInventoryReviewed',
      'manifest',
      'ownershipMutationEntrypoints',
      'proxyDelegateOrFallbackMintRouteCount',
      'requiredDeployedBindings',
    ],
    'runtime invariant mint entrypoints',
  );
  if (
    !Array.isArray(record.manifest)
    || canonicalE2sJson(record.manifest) !== canonicalE2sJson([
      {
        authorization: 'onlyOwner',
        contract: 'ErgoBridge',
        role: 'bridge-orchestrated-mint',
        signature: BRIDGE_MINT_SIGNATURE,
      },
      {
        authorization: 'onlyOwner',
        contract: 'SERG',
        role: 'token-mint',
        signature: TOKEN_MINT_SIGNATURE,
      },
    ])
  ) {
    throw new Error(
      'runtime invariant mint entrypoint manifest must enumerate bridge and direct token mint routes exactly',
    );
  }
  literal(
    record.completeSourceInventoryReviewed,
    true,
    'complete mint source inventory review',
  );
  literal(
    record.alternateUnboundMintEntrypointCount,
    0,
    'alternate unbound mint entrypoint count',
  );
  if (
    !Array.isArray(record.ownershipMutationEntrypoints)
    || canonicalE2sJson(record.ownershipMutationEntrypoints)
      !== canonicalE2sJson([
        'ErgoBridge.renounceOwnership()',
        'ErgoBridge.transferOwnership(address)',
        'SERG.renounceOwnership()',
        'SERG.transferOwnership(address)',
      ])
  ) {
    throw new Error(
      'runtime invariant ownership-mutation entrypoints must be enumerated exactly',
    );
  }
  literal(
    record.proxyDelegateOrFallbackMintRouteCount,
    0,
    'proxy, delegate, or fallback mint-route count',
  );
  const bindings = exactRecord(
    record.requiredDeployedBindings,
    [
      'bridgeSergTokenEqualsReviewedToken',
      'exactBridgeRuntimeCodeRequired',
      'exactTokenRuntimeCodeRequired',
      'independentlyObservedImmediatelyBeforeMintAdmission',
      'tokenOwnerEqualsReviewedBridge',
    ],
    'required deployed mint bindings',
  );
  for (const [field, binding] of Object.entries(bindings)) {
    literal(binding, true, `required deployed mint binding ${field}`);
  }
  return deepFreeze({
    manifest: [
      {
        contract: 'ErgoBridge',
        signature: BRIDGE_MINT_SIGNATURE,
        authorization: 'onlyOwner',
        role: 'bridge-orchestrated-mint',
      },
      {
        contract: 'SERG',
        signature: TOKEN_MINT_SIGNATURE,
        authorization: 'onlyOwner',
        role: 'token-mint',
      },
    ],
    completeSourceInventoryReviewed: true,
    alternateUnboundMintEntrypointCount: 0,
    ownershipMutationEntrypoints: [
      'ErgoBridge.renounceOwnership()',
      'ErgoBridge.transferOwnership(address)',
      'SERG.renounceOwnership()',
      'SERG.transferOwnership(address)',
    ],
    proxyDelegateOrFallbackMintRouteCount: 0,
    requiredDeployedBindings: {
      bridgeSergTokenEqualsReviewedToken: true,
      tokenOwnerEqualsReviewedBridge: true,
      exactBridgeRuntimeCodeRequired: true,
      exactTokenRuntimeCodeRequired: true,
      independentlyObservedImmediatelyBeforeMintAdmission: true,
    },
  });
}

function normalizeDecision(
  value: unknown,
): PegInRuntimeInvariantProfileV1['decision'] {
  const record = exactRecord(
    value,
    [
      'completeMintEntrypointInventoryReviewed',
      'evmWriteBeforeMintInvariantReviewed',
      'exactReviewedRepositoryFilesBound',
      'failedMintRollbackInvariantReviewed',
      'nativePostExecutionRecordSemanticsReviewed',
      'replayIdentityInvariantReviewed',
      'status',
    ],
    'runtime invariant review decision',
  );
  literal(record.status, 'PASS', 'runtime invariant review decision');
  for (const [field, decision] of Object.entries(record)) {
    if (field !== 'status') {
      literal(decision, true, `runtime invariant review decision ${field}`);
    }
  }
  return deepFreeze({
    status: 'PASS',
    exactReviewedRepositoryFilesBound: true,
    replayIdentityInvariantReviewed: true,
    evmWriteBeforeMintInvariantReviewed: true,
    failedMintRollbackInvariantReviewed: true,
    completeMintEntrypointInventoryReviewed: true,
    nativePostExecutionRecordSemanticsReviewed: true,
  });
}

function normalizeStatementBoundaries(
  value: unknown,
): PegInRuntimeInvariantProfileV1['boundaries'] {
  const trueFields = ['sourceSemanticsReviewOnly'] as const;
  const falseFields = [
    'admissionEligible',
    'committedVaultTransitionVerified',
    'deployedBridgeCodeVerified',
    'deployedTokenCodeVerified',
    'deployedTokenOwnershipVerified',
    'completeHistoricalTokenOwnershipVerified',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'mintAuthorized',
    'productionReady',
    'runtimeCodeStateProofVerified',
    'runtimeUpgradeHistoryVerified',
    'sidechainFinalityVerified',
    'wholeBlockCallbackRollbackVerified',
    'reproducibleSolidityBuildClosureVerified',
  ] as const;
  const record = exactRecord(
    value,
    [...trueFields, ...falseFields],
    'runtime invariant profile boundaries',
  );
  for (const field of trueFields) {
    literal(record[field], true, `runtime invariant boundary ${field}`);
  }
  for (const field of falseFields) {
    literal(record[field], false, `runtime invariant boundary ${field}`);
  }
  return deepFreeze({
    sourceSemanticsReviewOnly: true,
    deployedBridgeCodeVerified: false,
    deployedTokenCodeVerified: false,
    deployedTokenOwnershipVerified: false,
    completeHistoricalTokenOwnershipVerified: false,
    wholeBlockCallbackRollbackVerified: false,
    reproducibleSolidityBuildClosureVerified: false,
    sidechainFinalityVerified: false,
    runtimeCodeStateProofVerified: false,
    runtimeUpgradeHistoryVerified: false,
    historicalMintAbsenceVerified: false,
    committedVaultTransitionVerified: false,
    mintAuthorized: false,
    admissionEligible: false,
    gate5Closed: false,
    productionReady: false,
  });
}

function selectActiveReviewerProfile(
  lock: PegInRuntimeInvariantReviewerLockV1,
  statement: PegInRuntimeInvariantProfileV1,
  evaluatedAtValue: string,
): PegInRuntimeInvariantReviewerProfileV1 {
  const evaluatedAt = isoTimestamp(
    evaluatedAtValue,
    'runtime invariant review evaluation timestamp',
  );
  const profile = lock.profiles.find(
    entry => entry.profileId === statement.profileId,
  );
  if (!profile || profile.status !== 'active') {
    throw new Error(
      'runtime invariant reviewer lock has no active profile for the review',
    );
  }
  if (
    statement.reviewer.keyIdHex !== profile.reviewer.keyIdHex
    || statement.reviewer.organizationId
      !== profile.reviewer.organizationId
  ) {
    throw new Error(
      'runtime invariant review actor does not match the reviewer lock',
    );
  }
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const reviewedAtMs = Date.parse(statement.reviewedAt);
  if (
    reviewedAtMs < Date.parse(profile.validFrom)
    || reviewedAtMs > Date.parse(profile.validUntil)
    || evaluatedAtMs < reviewedAtMs
    || evaluatedAtMs > Date.parse(profile.validUntil)
  ) {
    throw new Error(
      'runtime invariant review is outside the reviewer validity window',
    );
  }
  return profile;
}

function assertCanonicalAbiBindings(
  evmMint: PegInRuntimeInvariantProfileV1['evmMint'],
): void {
  const bridgeInterface = new Interface([
    `function ${BRIDGE_MINT_SIGNATURE}`,
    `event ${PEG_IN_EVENT_SIGNATURE}`,
  ]);
  const tokenInterface = new Interface([
    `function ${TOKEN_MINT_SIGNATURE}`,
  ]);
  const bridgeMint = bridgeInterface.getFunction(BRIDGE_MINT_SIGNATURE);
  const tokenMint = tokenInterface.getFunction(TOKEN_MINT_SIGNATURE);
  const pegIn = bridgeInterface.getEvent(PEG_IN_EVENT_SIGNATURE);
  if (!bridgeMint || !tokenMint || !pegIn) {
    throw new Error('canonical peg-in ABI semantics are unavailable');
  }
  if (
    evmMint.bridgeMintSelectorHex !== bridgeMint.selector.toLowerCase()
    || evmMint.tokenMintSelectorHex !== tokenMint.selector.toLowerCase()
    || evmMint.eventTopicHex !== pegIn.topicHash.toLowerCase()
  ) {
    throw new Error(
      'runtime invariant review EVM selectors or event topic do not match the exact reviewed ABI',
    );
  }
}

function assertApprovedRuntimeSourceBinding(
  profile: PegInRuntimeInvariantReviewerProfileV1,
  statement: PegInRuntimeInvariantProfileV1,
): void {
  const sourceBindingDigestHex =
    derivePegInRuntimeInvariantSourceBindingDigestHexV1(statement.source);
  const approved = profile.approvedRuntimeSourceBindings.find(
    binding =>
      binding.runtimeArtifactSha256Hex
        === statement.runtime.artifactSha256Hex,
  );
  if (
    !approved
    || approved.runtimeArtifactSizeBytes
      !== statement.runtime.artifactSizeBytes
    || approved.buildAttestationId
      !== statement.runtime.buildAttestationId
    || approved.buildAttestationSha256Hex
      !== statement.runtime.buildAttestationSha256Hex
    || approved.sourceBindingDigestHex !== sourceBindingDigestHex
  ) {
    throw new Error(
      'runtime invariant review runtime/source binding is not approved by the source-owned reviewer policy',
    );
  }
}

function verifyReviewerSignature(
  reviewer: PegInRuntimeInvariantReviewerKeyV1,
  signatureHex: string,
  message: Buffer,
): void {
  const publicKey = verifiedReviewerPublicKey(reviewer);
  if (
    !verifySignature(
      null,
      message,
      publicKey,
      Buffer.from(signatureHex, 'hex'),
    )
  ) {
    throw new Error('runtime invariant reviewer signature is invalid');
  }
}

function verifiedReviewerPublicKey(
  reviewer: PegInRuntimeInvariantReviewerKeyV1,
): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({
      key: Buffer.from(reviewer.publicKeySpkiDerHex, 'hex'),
      format: 'der',
      type: 'spki',
    });
  } catch (error) {
    throw new Error('runtime invariant reviewer public key is invalid', {
      cause: error,
    });
  }
  const der = key.export({ type: 'spki', format: 'der' });
  if (prefixedSha256(der).slice(2) !== reviewer.keyIdHex) {
    throw new Error(
      'runtime invariant reviewer key ID does not match its public key',
    );
  }
  return key;
}

function parseAbi(bytes: Buffer, label: string): InterfaceAbi {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }
  return parsed as InterfaceAbi;
}

function readGuardedFile(
  bridgeRootValue: string,
  parts: readonly string[],
  label: string,
): Buffer {
  const bridgeRoot = resolve(bridgeRootValue);
  const target = resolve(bridgeRoot, ...parts);
  const relation = relative(bridgeRoot, target);
  if (
    relation === ''
    || relation.startsWith('..')
    || isAbsolute(relation)
  ) {
    throw new Error(`${label} path escapes the bridge root`);
  }
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  return readFileSync(target);
}

function parseJsonRecord(bytes: Buffer, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  return objectRecord(value, label);
}

function objectRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactRecord(
  value: unknown,
  expectedFields: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = objectRecord(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...expectedFields].sort();
  if (
    actual.length !== expected.length
    || actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly the supported fields`);
  }
  return record;
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  }
  return expected;
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
  prefixed = true,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be hexadecimal`);
  }
  const pattern = prefixed
    ? new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`)
    : new RegExp(`^[0-9a-f]{${bytes * 2}}$`);
  if (!pattern.test(value)) {
    throw new Error(
      `${label} must be canonical lowercase ${prefixed ? '0x-prefixed ' : ''}hexadecimal`,
    );
  }
  return value;
}

function prefixedFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be hexadecimal`);
  }
  const prefixed = value.startsWith('0x') ? value : `0x${value}`;
  return fixedHex(prefixed, bytes, label);
}

function variableHex(
  value: unknown,
  label: string,
  prefixed = true,
): string {
  if (
    typeof value !== 'string'
    || !(prefixed ? /^0x(?:[0-9a-f]{2})+$/.test(value) : /^(?:[0-9a-f]{2})+$/.test(value))
  ) {
    throw new Error(`${label} must be canonical non-empty lowercase hexadecimal`);
  }
  return value;
}

function portableId(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 128
    || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)
  ) {
    throw new Error(`${label} must be a portable lowercase identifier`);
  }
  return value;
}

function positiveCanonicalInteger(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^[1-9][0-9]*$/.test(value)
    || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error(`${label} must be a positive canonical safe integer`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  return value;
}

function prefixedSha256(value: Buffer): string {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
