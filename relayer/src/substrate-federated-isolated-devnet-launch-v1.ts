import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from 'node:crypto';

import {
  canonicalJson,
  parseStrictJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1Template,
} from './substrate-federated-settlement-family-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import type {
  SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
  type LegacyRouteRetirementRequirementV6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-target-descriptor.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-history.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_CLOSURE_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-relayer-closure.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_STATEMENT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-launch-statement.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_BASELINE_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-launch-baseline.v1' as const;

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_V1';
const ERGO_HISTORY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_V1';
const RELAYER_CLOSURE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_CLOSURE_V1';
const ROUTE_REQUIREMENTS_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ROUTE_REQUIREMENTS_V1';
const ROUTE_COVERAGE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ROUTE_COVERAGE_V1';
const STATEMENT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_STATEMENT_V1';
const ATTESTATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_ATTESTATION_V1';
const SIGNATURE_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SIGNATURE_SET_V1';
const BASELINE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_BASELINE_V1';
const G1DA_HISTORY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_HISTORY_V1';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

const targetDescriptors = new WeakSet<object>();
const ergoHistories = new WeakSet<object>();
const relayerClosures = new WeakSet<object>();
const launchStatements = new WeakSet<object>();
const launchBaselines = new WeakSet<object>();

type FamilyTemplates = Readonly<{
  readonly duplicatePrevention: SubstrateFederatedSettlementFamilyV1Template;
  readonly sourceLock: SubstrateFederatedSettlementFamilyV1Template;
  readonly pooledReserve: SubstrateFederatedSettlementFamilyV1Template;
}>;

interface ByteArtifactV1 {
  readonly sha256Hex: string;
  readonly sizeBytes: number;
}

interface TargetContractArtifactV1 {
  readonly contractIdHex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly propositionHex: string;
}

export interface SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1 {
  readonly acceptanceReport: Uint8Array;
  readonly reportedFinalizedBlocks: Uint8Array;
  readonly runtimeHistory: Uint8Array;
  readonly applicationHistory: Uint8Array;
  readonly historyReceipt: Uint8Array;
}

export interface SubstrateFederatedAuthoritySafeDevnetHistoryPinsV1 {
  readonly expectedAcceptanceDigestHex: string;
  readonly expectedHistoryDigestHex: string;
  readonly expectedHistoryArtifacts: Readonly<{
    readonly acceptanceReportSha256Hex: string;
    readonly reportedFinalizedBlocksSha256Hex: string;
    readonly runtimeHistorySha256Hex: string;
    readonly applicationHistorySha256Hex: string;
    readonly historyReceiptSha256Hex: string;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetTargetPinsV1
  extends SubstrateFederatedAuthoritySafeDevnetHistoryPinsV1 {
  readonly expectedSourceNetworkIdHex: string;
  readonly expectedSidechainIdHex: string;
  readonly expectedRuntimeProfileIdHex: string;
  readonly expectedSettlementProfileIdHex: string;
  readonly expectedSourceAttestationKeySetDigestHex: string;
  readonly expectedSourceAttestationThreshold: number;
}

export interface DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input {
  readonly trackerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
  readonly trackerReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
  readonly familyTemplates: FamilyTemplates;
  readonly familyReceipt:
    Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
  readonly historyBundle:
    Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1>;
  readonly trustPins: Readonly<SubstrateFederatedIsolatedDevnetTargetPinsV1>;
}

export interface SubstrateFederatedIsolatedDevnetTargetDescriptorV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_V1_SCHEMA;
  readonly version: 1;
  readonly descriptorDigestHex: string;
  readonly settlementNetworkId: 'ergo-testnet';
  readonly sourceNetworkScope: 'isolated-devnet';
  readonly trustModel: 'federated_non_trustless';
  readonly compiler: Readonly<{
    readonly trackerRequestDigestHex: string;
    readonly trackerReceiptDigestHex: string;
    readonly trackerCompilerLockDigestHex: string;
    readonly familyRequestDigestHex: string;
    readonly familyReceiptDigestHex: string;
    readonly familyCompilerLockDigestHex: string;
  }>;
  readonly profile: Readonly<{
    readonly familyIdHex: string;
    readonly encodedProfileHex: string;
    readonly settlementProfileIdHex: string;
  }>;
  readonly sourceRuntime: Readonly<{
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly tokenRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly runtimeProfileIdHex: string;
  }>;
  readonly federation: Readonly<{
    readonly federationProfileIdHex: string;
    readonly federationEpoch: string;
    readonly maxAdmissionValidityBlocks: string;
    readonly sourceAttestationPublicKeysHex: readonly string[];
    readonly sourceAttestationKeySetDigestHex: string;
    readonly sourceAttestationThreshold: number;
    readonly ergoAdmissionPublicKeysHex: readonly string[];
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly ergoAdmissionThreshold: number;
  }>;
  readonly lineages: Readonly<{
    readonly tracker: Readonly<TargetContractArtifactV1 & {
      readonly singletonTokenIdHex: string;
      readonly genesisInputBoxIdHex: string;
    }>;
    readonly duplicatePrevention: Readonly<TargetContractArtifactV1 & {
      readonly singletonTokenIdHex: string;
      readonly genesisInputBoxIdHex: string;
    }>;
    readonly sourceLock: Readonly<TargetContractArtifactV1>;
    readonly pooledReserve: Readonly<TargetContractArtifactV1 & {
      readonly singletonTokenIdHex: string;
      readonly genesisInputBoxIdHex: string;
    }>;
  }>;
  readonly capturedSourceHistory: Readonly<{
    readonly acceptanceDigestHex: string;
    readonly historyDigestHex: string;
    readonly status: 'isolated_exact_target_history_collected';
    readonly interval: Readonly<{
      readonly genesisNativeBlockHashHex: string;
      readonly observedTipHeight: string;
      readonly observedTipNativeBlockHashHex: string;
      readonly observedTipExecutionBlockHashHex: string;
      readonly blockCount: number;
    }>;
    readonly target: Readonly<{
      readonly frontierCommit: string;
      readonly frontierPatchSha256Hex: string;
      readonly generatedSpecSha256Hex: string;
      readonly nativeGenesisHashHex: string;
      readonly acceptedNativeTipHashHex: string;
      readonly acceptedExecutionTipHashHex: string;
      readonly sourceRuntimeCodeSha256Hex: string;
      readonly sourceRuntimeCodeBytes: number;
      readonly storageLayoutDigestHex: string;
      readonly bridgeAddressHex: string;
      readonly bridgeRuntimeCodeSha256Hex: string;
      readonly bridgeRuntimeCodeBytes: number;
      readonly tokenAddressHex: string;
      readonly tokenRuntimeCodeSha256Hex: string;
      readonly tokenRuntimeCodeBytes: number;
      readonly binarySha256Hex: string;
      readonly processBindingDigestHex: string;
    }>;
    readonly artifacts: Readonly<{
      readonly acceptanceReport: Readonly<ByteArtifactV1>;
      readonly reportedFinalizedBlocks: Readonly<ByteArtifactV1>;
      readonly runtimeHistory: Readonly<ByteArtifactV1>;
      readonly applicationHistory: Readonly<ByteArtifactV1>;
      readonly historyReceipt: Readonly<ByteArtifactV1>;
    }>;
  }>;
  readonly checks: Readonly<{
    readonly exactG1dAArtifactsRehashed: true;
    readonly exactG1dAAcceptanceDigestRecomputed: true;
    readonly exactG1dAHistoryDigestRecomputed: true;
    readonly exactG1dAApplicationJoinedToCompilerClosure: true;
    readonly explicitSourceDomainPinsMatched: true;
    readonly explicitAcceptancePinMatched: true;
    readonly explicitHistoryPinMatched: true;
    readonly explicitArtifactPinsMatched: true;
    readonly explicitSourceAttestationKeySetPinMatched: true;
    readonly explicitSourceAttestationThresholdPinMatched: true;
  }>;
  readonly boundaries: Readonly<{
    readonly sourceDomainObservedInCapturedHistory: false;
    readonly sourceAttestationQuorumVerified: false;
    readonly sourceConsensusIndependentlyVerified: false;
    readonly independentSourceAdministrationEstablished: false;
    readonly sourceFinalityAuthenticated: false;
    readonly setupLineagesEstablished: false;
    readonly profileActivated: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetErgoHistoryV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_V1_SCHEMA;
  readonly version: 1;
  readonly historyDigestHex: string;
  readonly targetDescriptorDigestHex: string;
  readonly genesis: Readonly<{ readonly headerIdHex: string; readonly height: number }>;
  readonly setupAnchor: Readonly<{ readonly headerIdHex: string; readonly height: number }>;
  readonly genesisInputs: Readonly<{
    readonly trackerBoxIdHex: string;
    readonly duplicatePreventionBoxIdHex: string;
    readonly pooledReserveBoxIdHex: string;
  }>;
  readonly manifests: Readonly<{
    readonly greatestWorkHeaders: Readonly<ByteArtifactV1>;
    readonly transactions: Readonly<ByteArtifactV1>;
    readonly utxoTransitions: Readonly<ByteArtifactV1>;
  }>;
  readonly interval: Readonly<{
    readonly firstHeaderHeight: number;
    readonly lastHeaderHeight: number;
  }>;
}

export interface BuildSubstrateFederatedIsolatedDevnetErgoHistoryV1Input {
  readonly target: Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1>;
  readonly genesisHeaderIdHex: string;
  readonly genesisHeight: number;
  readonly setupAnchorHeaderIdHex: string;
  readonly setupAnchorHeight: number;
  readonly greatestWorkHeadersManifest: Uint8Array;
  readonly transactionsManifest: Uint8Array;
  readonly utxoTransitionsManifest: Uint8Array;
}

export interface SubstrateFederatedIsolatedDevnetRelayerClosureV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_CLOSURE_V1_SCHEMA;
  readonly version: 1;
  readonly closureDigestHex: string;
  readonly targetDescriptorDigestHex: string;
  readonly gitCommitSha1Hex: string;
  readonly artifacts: Readonly<{
    readonly sourceArchive: Readonly<ByteArtifactV1>;
    readonly packageLock: Readonly<ByteArtifactV1>;
    readonly runtimeEntrypoints: Readonly<ByteArtifactV1>;
    readonly buildArtifact: Readonly<ByteArtifactV1>;
  }>;
}

export interface BuildSubstrateFederatedIsolatedDevnetRelayerClosureV1Input {
  readonly target: Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1>;
  readonly gitCommitSha1Hex: string;
  readonly sourceArchive: Uint8Array;
  readonly packageLock: Uint8Array;
  readonly runtimeEntrypointsManifest: Uint8Array;
  readonly buildArtifact: Uint8Array;
}

interface IsolatedRouteCoverageV1 extends LegacyRouteRetirementRequirementV6 {
  readonly evidenceComponent:
    | 'source-captured-history'
    | 'ergo-genesis-history'
    | 'shipped-relayer-closure';
  readonly evidenceDigestHex: string;
  readonly disposition: 'not-instantiated';
}

export interface SubstrateFederatedIsolatedDevnetLaunchStatementV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_STATEMENT_V1_SCHEMA;
  readonly version: 1;
  readonly statementDigestHex: string;
  readonly attestationDigestHex: string;
  readonly activationGenerationIdHex: string;
  readonly settlementNetworkId: 'ergo-testnet';
  readonly sourceNetworkScope: 'isolated-devnet';
  readonly trustModel: 'federated_non_trustless';
  readonly target: Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1>;
  readonly histories: Readonly<{
    readonly source: Readonly<{
      readonly acceptanceDigestHex: string;
      readonly historyDigestHex: string;
      readonly artifactDigestsHex: readonly string[];
    }>;
    readonly ergo: Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryV1>;
    readonly relayer: Readonly<SubstrateFederatedIsolatedDevnetRelayerClosureV1>;
  }>;
  readonly routeCoverage: Readonly<{
    readonly staticRequirementsDigestHex: string;
    readonly coverageDigestHex: string;
    readonly routeCount: number;
    readonly frontierRouteCount: number;
    readonly ergoRouteCount: number;
    readonly relayerRouteCount: number;
    readonly routes: readonly Readonly<IsolatedRouteCoverageV1>[];
  }>;
  readonly claims: Readonly<{
    readonly exactG1dAHistoryClosureBound: true;
    readonly ergoHistoryArtifactsBound: true;
    readonly relayerArtifactClosureBound: true;
    readonly predecessorRoutesAttestedNotInstantiated: true;
    readonly emptyGlobalReplayRequired: true;
  }>;
}

export interface BuildSubstrateFederatedIsolatedDevnetLaunchStatementV1Input {
  readonly activationGenerationIdHex: string;
  readonly target: Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1>;
  readonly ergoHistory: Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryV1>;
  readonly relayerClosure:
    Readonly<SubstrateFederatedIsolatedDevnetRelayerClosureV1>;
}

export interface DeriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1Input {
  readonly statementDigestHex: string;
  readonly sourceAttestationKeySetDigestHex: string;
  readonly sourceAttestationThreshold: number;
}

export interface SubstrateFederatedIsolatedDevnetLaunchSignatureV1 {
  readonly signerPublicKeyHex: string;
  readonly signatureHex: string;
}

export interface SubstrateFederatedIsolatedDevnetLaunchBaselineV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_BASELINE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'authenticated_federated_isolated_devnet_baseline';
  readonly baselineDigestHex: string;
  readonly statement:
    Readonly<SubstrateFederatedIsolatedDevnetLaunchStatementV1>;
  readonly signatures:
    readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
  readonly signatureSetDigestHex: string;
  readonly checks: Readonly<{
    readonly exactSourceAttestationThresholdVerified: true;
    readonly exactTargetDescriptorBound: true;
    readonly exactG1dAHistoryClosureBound: true;
    readonly exactErgoAndRelayerClosuresBound: true;
    readonly exactStaticRouteSetBound: true;
    readonly emptyReplayDerivedFromQuorumAuthenticatedNonInstantiation: true;
  }>;
  readonly boundaries: Readonly<{
    readonly sourceAttestationQuorumIsLaunchHistoryAuthority: true;
    readonly sourceConsensusIndependentlyVerified: false;
    readonly independentSourceAdministrationEstablished: false;
    readonly sourceFinalityAuthenticated: false;
    readonly ergoConsensusIndependentlyVerified: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly setupLineagesEstablished: false;
    readonly profileActivated: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export function deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(
  input: Readonly<DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1> {
  exactRecord(input, [
    'trackerRequest',
    'trackerReceipt',
    'familyTemplates',
    'familyReceipt',
    'historyBundle',
    'trustPins',
  ], 'isolated-devnet target-descriptor input');
  exactRecord(input.trustPins, [
    'expectedAcceptanceDigestHex',
    'expectedHistoryDigestHex',
    'expectedHistoryArtifacts',
    'expectedSourceNetworkIdHex',
    'expectedSidechainIdHex',
    'expectedRuntimeProfileIdHex',
    'expectedSettlementProfileIdHex',
    'expectedSourceAttestationKeySetDigestHex',
    'expectedSourceAttestationThreshold',
  ], 'isolated-devnet target trust pins');
  assertCompilerClosure(input);
  const tracker = input.trackerRequest;
  const family = input.familyReceipt;
  const familyProfile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    family.profile,
  );
  assertCompilerSemanticJoin(tracker, familyProfile);
  const sourceRuntime = normalizeSourceRuntime(tracker.application);
  const federation = normalizeFederation(tracker.profile);
  const capturedSourceHistory = validateG1dAHistoryBundle(
    input.historyBundle,
    {
      expectedAcceptanceDigestHex:
        input.trustPins.expectedAcceptanceDigestHex,
      expectedHistoryDigestHex: input.trustPins.expectedHistoryDigestHex,
      expectedHistoryArtifacts: input.trustPins.expectedHistoryArtifacts,
    },
  );
  assertSourceRuntimeMatchesCapture(sourceRuntime, capturedSourceHistory.target);
  assertExplicitSourceDomainPins(
    sourceRuntime,
    tracker.application.settlementProfileIdHex,
    input.trustPins,
  );
  if (
    federation.sourceAttestationKeySetDigestHex
      !== input.trustPins.expectedSourceAttestationKeySetDigestHex
  ) {
    throw new Error('isolated-devnet source-attestation key-set pin differs');
  }
  if (
    federation.sourceAttestationThreshold
      !== input.trustPins.expectedSourceAttestationThreshold
  ) {
    throw new Error('isolated-devnet source-attestation threshold pin differs');
  }
  const body = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_V1_SCHEMA,
    version: 1 as const,
    settlementNetworkId: 'ergo-testnet' as const,
    sourceNetworkScope: 'isolated-devnet' as const,
    trustModel: 'federated_non_trustless' as const,
    compiler: {
      trackerRequestDigestHex: digest(tracker.requestDigestHex, 'tracker request digest'),
      trackerReceiptDigestHex: digest(input.trackerReceipt.receiptDigestHex, 'tracker receipt digest'),
      trackerCompilerLockDigestHex: digest(input.trackerReceipt.compilerLockDigestHex, 'tracker compiler-lock digest'),
      familyRequestDigestHex: digest(family.familyCompilerRequestDigestHex, 'family request digest'),
      familyReceiptDigestHex: digest(family.receiptDigestHex, 'family receipt digest'),
      familyCompilerLockDigestHex: digest(family.compilerLockDigestHex, 'family compiler-lock digest'),
    },
    profile: {
      familyIdHex: digest(family.profile.familyIdHex, 'family ID'),
      encodedProfileHex: variableHex(family.profile.encodedProfileHex, 'encoded family profile'),
      settlementProfileIdHex: digest(tracker.application.settlementProfileIdHex, 'settlement profile ID'),
    },
    sourceRuntime,
    federation,
    lineages: {
      tracker: {
        ...contractArtifact(input.trackerReceipt.contract, 'tracker'),
        singletonTokenIdHex: digest(tracker.trackerNftIdHex, 'tracker singleton ID'),
        genesisInputBoxIdHex: digest(tracker.trackerNftIdHex, 'tracker genesis input ID'),
      },
      duplicatePrevention: {
        ...contractArtifact(family.contracts.duplicatePrevention, 'duplicate-prevention'),
        singletonTokenIdHex: digest(family.profile.duplicatePreventionNftIdHex, 'DUP singleton ID'),
        genesisInputBoxIdHex: digest(family.profile.duplicatePreventionNftIdHex, 'DUP genesis input ID'),
      },
      sourceLock: contractArtifact(family.contracts.sourceLock, 'source-lock'),
      pooledReserve: {
        ...contractArtifact(family.contracts.pooledReserve, 'pooled-reserve'),
        singletonTokenIdHex: digest(family.profile.pooledReserveNftIdHex, 'reserve singleton ID'),
        genesisInputBoxIdHex: digest(family.profile.pooledReserveNftIdHex, 'reserve genesis input ID'),
      },
    },
    capturedSourceHistory,
    checks: {
      exactG1dAArtifactsRehashed: true as const,
      exactG1dAAcceptanceDigestRecomputed: true as const,
      exactG1dAHistoryDigestRecomputed: true as const,
      exactG1dAApplicationJoinedToCompilerClosure: true as const,
      explicitSourceDomainPinsMatched: true as const,
      explicitAcceptancePinMatched: true as const,
      explicitHistoryPinMatched: true as const,
      explicitArtifactPinsMatched: true as const,
      explicitSourceAttestationKeySetPinMatched: true as const,
      explicitSourceAttestationThresholdPinMatched: true as const,
    },
    boundaries: falseBoundaries(),
  };
  const descriptor = deepFreeze({
    ...body,
    descriptorDigestHex: sha256CanonicalJson(
      body,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_DIGEST_DOMAIN,
    ),
  });
  targetDescriptors.add(descriptor);
  return descriptor;
}

export function inspectSubstrateFederatedAuthoritySafeDevnetHistoryBundleV1(
  bundle: Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1>,
  pins: Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryPinsV1>,
): SubstrateFederatedIsolatedDevnetTargetDescriptorV1['capturedSourceHistory'] {
  return validateG1dAHistoryBundle(bundle, pins);
}

export function buildSubstrateFederatedIsolatedDevnetErgoHistoryV1(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetErgoHistoryV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryV1> {
  exactRecord(input, [
    'target',
    'genesisHeaderIdHex',
    'genesisHeight',
    'setupAnchorHeaderIdHex',
    'setupAnchorHeight',
    'greatestWorkHeadersManifest',
    'transactionsManifest',
    'utxoTransitionsManifest',
  ], 'isolated-devnet Ergo-history input');
  assertTargetDescriptor(input.target);
  const genesisHeight = nonnegativeInteger(input.genesisHeight, 'Ergo genesis height');
  const setupAnchorHeight = positiveInteger(input.setupAnchorHeight, 'Ergo setup-anchor height');
  if (setupAnchorHeight < genesisHeight) {
    throw new Error('isolated-devnet Ergo setup anchor precedes genesis');
  }
  const lineages = input.target.lineages;
  const genesisInputs = {
    trackerBoxIdHex: lineages.tracker.genesisInputBoxIdHex,
    duplicatePreventionBoxIdHex: lineages.duplicatePrevention.genesisInputBoxIdHex,
    pooledReserveBoxIdHex: lineages.pooledReserve.genesisInputBoxIdHex,
  };
  if (new Set(Object.values(genesisInputs)).size !== 3) {
    throw new Error('isolated-devnet Ergo genesis inputs must be pairwise distinct');
  }
  const body = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_V1_SCHEMA,
    version: 1 as const,
    targetDescriptorDigestHex: input.target.descriptorDigestHex,
    genesis: {
      headerIdHex: digest(input.genesisHeaderIdHex, 'Ergo genesis header ID'),
      height: genesisHeight,
    },
    setupAnchor: {
      headerIdHex: digest(input.setupAnchorHeaderIdHex, 'Ergo setup-anchor header ID'),
      height: setupAnchorHeight,
    },
    genesisInputs,
    manifests: {
      greatestWorkHeaders: byteArtifact(input.greatestWorkHeadersManifest, 'Ergo greatest-work history'),
      transactions: byteArtifact(input.transactionsManifest, 'Ergo transaction history'),
      utxoTransitions: byteArtifact(input.utxoTransitionsManifest, 'Ergo UTXO history'),
    },
    interval: { firstHeaderHeight: genesisHeight, lastHeaderHeight: setupAnchorHeight },
  };
  const history = deepFreeze({
    ...body,
    historyDigestHex: sha256CanonicalJson(body, ERGO_HISTORY_DIGEST_DOMAIN),
  });
  ergoHistories.add(history);
  return history;
}

export function buildSubstrateFederatedIsolatedDevnetRelayerClosureV1(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetRelayerClosureV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetRelayerClosureV1> {
  exactRecord(input, [
    'target',
    'gitCommitSha1Hex',
    'sourceArchive',
    'packageLock',
    'runtimeEntrypointsManifest',
    'buildArtifact',
  ], 'isolated-devnet relayer-closure input');
  assertTargetDescriptor(input.target);
  const body = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_CLOSURE_V1_SCHEMA,
    version: 1 as const,
    targetDescriptorDigestHex: input.target.descriptorDigestHex,
    gitCommitSha1Hex: fixedHex(input.gitCommitSha1Hex, 20, 'relayer Git commit'),
    artifacts: {
      sourceArchive: byteArtifact(input.sourceArchive, 'relayer source archive'),
      packageLock: byteArtifact(input.packageLock, 'relayer package lock'),
      runtimeEntrypoints: byteArtifact(input.runtimeEntrypointsManifest, 'relayer runtime entrypoints'),
      buildArtifact: byteArtifact(input.buildArtifact, 'relayer build artifact'),
    },
  };
  const closure = deepFreeze({
    ...body,
    closureDigestHex: sha256CanonicalJson(body, RELAYER_CLOSURE_DIGEST_DOMAIN),
  });
  relayerClosures.add(closure);
  return closure;
}

export function buildSubstrateFederatedIsolatedDevnetLaunchStatementV1(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetLaunchStatementV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetLaunchStatementV1> {
  exactRecord(input, [
    'activationGenerationIdHex',
    'target',
    'ergoHistory',
    'relayerClosure',
  ], 'isolated-devnet launch-statement input');
  assertTargetDescriptor(input.target);
  assertErgoHistory(input.ergoHistory);
  assertRelayerClosure(input.relayerClosure);
  if (
    input.ergoHistory.targetDescriptorDigestHex !== input.target.descriptorDigestHex
    || input.relayerClosure.targetDescriptorDigestHex !== input.target.descriptorDigestHex
  ) {
    throw new Error('isolated-devnet launch closures target different descriptors');
  }
  const source = input.target.capturedSourceHistory;
  const artifactDigestsHex = Object.values(source.artifacts)
    .map(value => value.sha256Hex);
  const routeCoverage = buildRouteCoverage(
    source.historyDigestHex,
    input.ergoHistory.historyDigestHex,
    input.relayerClosure.closureDigestHex,
  );
  const body = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_STATEMENT_V1_SCHEMA,
    version: 1 as const,
    activationGenerationIdHex: digest(input.activationGenerationIdHex, 'activation generation ID'),
    settlementNetworkId: 'ergo-testnet' as const,
    sourceNetworkScope: 'isolated-devnet' as const,
    trustModel: 'federated_non_trustless' as const,
    target: input.target,
    histories: {
      source: {
        acceptanceDigestHex: source.acceptanceDigestHex,
        historyDigestHex: source.historyDigestHex,
        artifactDigestsHex,
      },
      ergo: input.ergoHistory,
      relayer: input.relayerClosure,
    },
    routeCoverage,
    claims: {
      exactG1dAHistoryClosureBound: true as const,
      ergoHistoryArtifactsBound: true as const,
      relayerArtifactClosureBound: true as const,
      predecessorRoutesAttestedNotInstantiated: true as const,
      emptyGlobalReplayRequired: true as const,
    },
  };
  const statementDigestHex = sha256CanonicalJson(body, STATEMENT_DIGEST_DOMAIN);
  const statement = deepFreeze({
    ...body,
    statementDigestHex,
    attestationDigestHex:
      deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1({
        statementDigestHex,
        sourceAttestationKeySetDigestHex:
          input.target.federation.sourceAttestationKeySetDigestHex,
        sourceAttestationThreshold:
          input.target.federation.sourceAttestationThreshold,
      }),
  });
  launchStatements.add(statement);
  return statement;
}

export function deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1(
  input: Readonly<
    DeriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1Input
  >,
): string {
  exactRecord(
    input,
    [
      'sourceAttestationKeySetDigestHex',
      'sourceAttestationThreshold',
      'statementDigestHex',
    ],
    'isolated-devnet launch-attestation digest input',
  );
  return sha256CanonicalJson({
    statementDigestHex: digest(
      input.statementDigestHex,
      'launch statement digest',
    ),
    sourceAttestationKeySetDigestHex: digest(
      input.sourceAttestationKeySetDigestHex,
      'launch source-attestation key-set digest',
    ),
    sourceAttestationThreshold: positiveInteger(
      input.sourceAttestationThreshold,
      'launch source-attestation threshold',
    ),
  }, ATTESTATION_DIGEST_DOMAIN);
}

export function buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1(
  input: Readonly<{
    readonly statement:
      Readonly<SubstrateFederatedIsolatedDevnetLaunchStatementV1>;
    readonly signatures:
      readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetLaunchBaselineV1> {
  exactRecord(input, ['statement', 'signatures'], 'isolated-devnet launch-baseline input');
  assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance(
    input.statement,
  );
  const signatures = normalizeAndVerifySignatures(input.signatures, input.statement);
  const signatureSetDigestHex = sha256CanonicalJson(
    signatures,
    SIGNATURE_SET_DIGEST_DOMAIN,
  );
  const binding = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_BASELINE_V1_SCHEMA,
    version: 1 as const,
    status: 'authenticated_federated_isolated_devnet_baseline' as const,
    statement: input.statement,
    signatures,
    signatureSetDigestHex,
    checks: {
      exactSourceAttestationThresholdVerified: true as const,
      exactTargetDescriptorBound: true as const,
      exactG1dAHistoryClosureBound: true as const,
      exactErgoAndRelayerClosuresBound: true as const,
      exactStaticRouteSetBound: true as const,
      emptyReplayDerivedFromQuorumAuthenticatedNonInstantiation: true as const,
    },
    boundaries: {
      sourceAttestationQuorumIsLaunchHistoryAuthority: true as const,
      sourceConsensusIndependentlyVerified: false as const,
      independentSourceAdministrationEstablished: false as const,
      sourceFinalityAuthenticated: false as const,
      ergoConsensusIndependentlyVerified: false as const,
      targetNodeAcceptanceEstablished: false as const,
      setupLineagesEstablished: false as const,
      profileActivated: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const baseline = deepFreeze({
    ...binding,
    baselineDigestHex: sha256CanonicalJson(binding, BASELINE_DIGEST_DOMAIN),
  });
  launchBaselines.add(baseline);
  return baseline;
}

export function assertSubstrateFederatedIsolatedDevnetLaunchBaselineV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetLaunchBaselineV1> {
  if (value === null || typeof value !== 'object' || !launchBaselines.has(value)) {
    throw new Error('isolated-devnet launch baseline was not built in this process');
  }
}

function validateG1dAHistoryBundle(
  bundle: Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1>,
  pins: Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryPinsV1>,
): SubstrateFederatedIsolatedDevnetTargetDescriptorV1['capturedSourceHistory'] {
  exactRecord(bundle, [
    'acceptanceReport',
    'reportedFinalizedBlocks',
    'runtimeHistory',
    'applicationHistory',
    'historyReceipt',
  ], 'G1dA history bundle');
  exactRecord(pins, [
    'expectedAcceptanceDigestHex',
    'expectedHistoryDigestHex',
    'expectedHistoryArtifacts',
  ], 'isolated-devnet target pins');
  const acceptance = parsedRecord(bundle.acceptanceReport, 'G1dA acceptance report');
  const receipt = parsedRecord(bundle.historyReceipt, 'G1dA history receipt');
  const finalized = parsedRecord(bundle.reportedFinalizedBlocks, 'G1dA finalized-block history');
  const runtime = parsedRecord(bundle.runtimeHistory, 'G1dA runtime history');
  const application = parsedRecord(bundle.applicationHistory, 'G1dA application history');
  assertSchema(acceptance, 'e2s.substrate-federated-authority-safe-devnet-acceptance.v1', 'G1dA acceptance');
  assertSchema(receipt, 'e2s.substrate-federated-authority-safe-devnet-history.v1', 'G1dA receipt');
  assertSchema(finalized, 'e2s.substrate-federated-authority-safe-devnet-reported-finalized-blocks.v1', 'G1dA finalized blocks');
  assertSchema(runtime, 'e2s.substrate-federated-authority-safe-devnet-runtime-history.v1', 'G1dA runtime history');
  assertSchema(application, 'e2s.substrate-federated-authority-safe-devnet-application-history.v1', 'G1dA application history');
  exactRecord(acceptance, [
    'schema', 'version', 'status', 'source', 'toolchain', 'binary',
    'chainSpec', 'runtimeTests', 'observation', 'processes', 'checks',
    'boundaries', 'acceptanceDigestHex',
  ], 'G1dA acceptance report');
  exactRecord(receipt, [
    'schema', 'version', 'status', 'acceptanceDigestHex', 'target',
    'interval', 'artifacts', 'checks', 'boundaries', 'historyDigestHex',
  ], 'G1dA history receipt');
  if (acceptance.status !== 'isolated_exact_authority_safe_target_accepted') {
    throw new Error('G1dA acceptance status is invalid');
  }
  assertAcceptanceSchemaDetails(acceptance);
  assertExpectedFlags(record(acceptance.checks, 'G1dA acceptance checks'), {
    exactPatchedSourceCheckoutVerifiedBeforeAndAfter: true,
    exactLockedToolchainVerifiedBeforeAndAfter: true,
    sourceLockedOfflineBuildPassed: true,
    freshIsolatedCargoTargetUsed: true,
    deterministicWasmPathRemappingApplied: true,
    builtInRuntimeBaseSpecReproducedExactly: true,
    runningNodeImageIdentityBoundForBothNodesAndVerifiedBeforeAndAfter: true,
    exactMutualPeerIdentityAndLoopbackIsolationObservedAtActionBoundaries: true,
    spawnedNodeListenersBoundAndReleased: true,
    generatedSpecAcceptedByExactBinary: true,
    nodeAcceptedSpecSemanticallyMatchesGeneratedSpec: true,
    exactTwoNodeRuntimeObservationJoined: true,
    directOwnerMintDryRunRejected: true,
    sourceLockedDirectOwnerMintBlockRejected: true,
    sourceLockedForwardedOwnerMintBlockRejected: true,
    typedQuarantineAndAbsentAuthorityStateObserved: true,
  }, 'G1dA acceptance checks');
  assertExpectedFlags(record(acceptance.boundaries, 'G1dA acceptance boundaries'), {
    exactAuthoritySafeTargetIdentityObserved: true,
    targetHistoryIntakeEligible: true,
    targetHistoryCollected: false,
    targetHistoryAuthenticated: false,
    independentSourceAdministrationEstablished: false,
    sourceFinalityAuthenticated: false,
    completeBuildToolClosureVerified: false,
    dependencyCacheContentAttested: false,
    independentBuildAttestationVerified: false,
    syntheticDryRunProbeOnly: true,
    probeSubmitted: false,
    probeBroadcast: false,
    federatedLaunchEligible: false,
    mintAuthorized: false,
    settlementAuthorized: false,
    valueLifecycleTransactionConstructed: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    profileActivated: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'G1dA acceptance boundaries');
  const acceptanceDigestHex = digest(acceptance.acceptanceDigestHex, 'G1dA acceptance digest');
  const { acceptanceDigestHex: _acceptanceDigest, ...acceptanceBody } = acceptance;
  if (sha256G1cCanonicalJson(acceptanceBody) !== acceptanceDigestHex) {
    throw new Error('G1dA acceptance digest does not match its report');
  }
  const historyDigestHex = digest(receipt.historyDigestHex, 'G1dA history digest');
  const { historyDigestHex: _historyDigest, ...receiptBody } = receipt;
  if (sha256CanonicalJson(receiptBody, G1DA_HISTORY_DIGEST_DOMAIN) !== historyDigestHex) {
    throw new Error('G1dA history digest does not match its receipt');
  }
  if (
    acceptanceDigestHex !== digest(receipt.acceptanceDigestHex, 'receipt acceptance digest')
    || acceptanceDigestHex !== digest(pins.expectedAcceptanceDigestHex, 'acceptance pin')
  ) {
    throw new Error('G1dA acceptance digest differs from its explicit pin');
  }
  if (historyDigestHex !== digest(pins.expectedHistoryDigestHex, 'history pin')) {
    throw new Error('G1dA history digest differs from its explicit pin');
  }
  const artifacts = {
    acceptanceReport: byteArtifact(bundle.acceptanceReport, 'G1dA acceptance report'),
    reportedFinalizedBlocks: byteArtifact(bundle.reportedFinalizedBlocks, 'G1dA finalized blocks'),
    runtimeHistory: byteArtifact(bundle.runtimeHistory, 'G1dA runtime history'),
    applicationHistory: byteArtifact(bundle.applicationHistory, 'G1dA application history'),
    historyReceipt: byteArtifact(bundle.historyReceipt, 'G1dA history receipt'),
  };
  const receiptArtifacts = record(receipt.artifacts, 'G1dA receipt artifacts');
  exactRecord(receiptArtifacts, [
    'acceptanceReport', 'reportedFinalizedBlocks', 'runtimeHistory',
    'applicationHistory',
  ], 'G1dA receipt artifacts');
  assertReceiptArtifact(receipt, 'acceptanceReport', artifacts.acceptanceReport);
  assertReceiptArtifact(receipt, 'reportedFinalizedBlocks', artifacts.reportedFinalizedBlocks);
  assertReceiptArtifact(receipt, 'runtimeHistory', artifacts.runtimeHistory);
  assertReceiptArtifact(receipt, 'applicationHistory', artifacts.applicationHistory);
  const expected = pins.expectedHistoryArtifacts;
  exactRecord(expected, [
    'acceptanceReportSha256Hex',
    'reportedFinalizedBlocksSha256Hex',
    'runtimeHistorySha256Hex',
    'applicationHistorySha256Hex',
    'historyReceiptSha256Hex',
  ], 'G1dA artifact pins');
  const pinPairs: readonly (readonly [string, unknown, string])[] = [
    [artifacts.acceptanceReport.sha256Hex, expected.acceptanceReportSha256Hex, 'acceptance report'],
    [artifacts.reportedFinalizedBlocks.sha256Hex, expected.reportedFinalizedBlocksSha256Hex, 'finalized blocks'],
    [artifacts.runtimeHistory.sha256Hex, expected.runtimeHistorySha256Hex, 'runtime history'],
    [artifacts.applicationHistory.sha256Hex, expected.applicationHistorySha256Hex, 'application history'],
    [artifacts.historyReceipt.sha256Hex, expected.historyReceiptSha256Hex, 'history receipt'],
  ];
  for (const [actual, expectedDigest, label] of pinPairs) {
    if (actual !== digest(expectedDigest, `${label} pin`)) {
      throw new Error(`G1dA ${label} differs from its explicit artifact pin`);
    }
  }
  const receiptTarget = record(receipt.target, 'G1dA receipt target');
  exactRecord(receiptTarget, [
    'frontierCommit', 'frontierPatchSha256Hex', 'generatedSpecSha256Hex',
    'nativeGenesisHashHex', 'acceptedNativeTipHashHex',
    'acceptedExecutionTipHashHex', 'sourceRuntimeCodeSha256Hex',
    'sourceRuntimeCodeBytes', 'storageLayoutDigestHex', 'bridgeAddressHex',
    'bridgeRuntimeCodeSha256Hex', 'bridgeRuntimeCodeBytes', 'tokenAddressHex',
    'tokenRuntimeCodeSha256Hex', 'tokenRuntimeCodeBytes', 'binarySha256Hex',
    'processBindingDigestHex',
  ], 'G1dA receipt target');
  for (const manifest of [finalized, runtime, application]) {
    assertTargetProjection(receiptTarget, record(manifest.target, 'G1dA manifest target'));
  }
  const interval = record(receipt.interval, 'G1dA receipt interval');
  exactRecord(interval, [
    'semantics', 'genesisNativeBlockHashHex', 'observedTipHeight',
    'observedTipNativeBlockHashHex', 'observedTipExecutionBlockHashHex',
    'blockCount', 'reportedFinality',
  ], 'G1dA receipt interval');
  validateSourceHistoryManifests(
    finalized,
    runtime,
    application,
    receiptTarget,
    interval,
  );
  assertAcceptanceMatchesHistory(acceptance, receiptTarget, interval);
  assertExpectedFlags(record(receipt.checks, 'G1dA receipt checks'), {
    freshExactTargetAcceptanceConsumed: true,
    exactProcessOwnedObservationTipConsumed: true,
    exactAcceptedTargetIdentityRecheckedAtHistoryTip: true,
    archiveGenesisStateReadFromBothOrigins: true,
    completeBoundedHeightIntervalCollected: true,
    nativeAndExecutionParentChainsContiguous: true,
    bothOriginsMatchedEveryCollectedHeight: true,
    acceptedTipIsAncestorOfEachRpcReportedFinalizedHead: true,
    everyCollectedRowStableAfterCollection: true,
    exactRuntimeAndApplicationHistoryMaterialized: true,
  }, 'G1dA receipt checks');
  assertExpectedFlags(record(receipt.boundaries, 'G1dA receipt boundaries'), {
    targetHistoryCollected: true,
    targetHistoryAuthenticated: false,
    sourceAttestationQuorumVerified: false,
    sourceConsensusIndependentlyVerified: false,
    independentSourceAdministrationEstablished: false,
    sourceFinalityAuthenticated: false,
    ergoHistoryCollected: false,
    relayerClosureCollected: false,
    isolatedDevnetTargetDescriptorProduced: false,
    isolatedDevnetLaunchStatementProduced: false,
    portableReplayCompleted: false,
    setupTransactionIdentitiesFrozen: false,
    setupTransactionConstructed: false,
    setupTransactionSigned: false,
    nodeCheckPerformed: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    profileActivated: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'G1dA receipt authority boundaries');
  if (receipt.status !== 'isolated_exact_target_history_collected') {
    throw new Error('G1dA history status is not the exact collected-target status');
  }
  return deepFreeze({
    acceptanceDigestHex,
    historyDigestHex,
    status: 'isolated_exact_target_history_collected' as const,
    interval: {
      genesisNativeBlockHashHex: digest(interval.genesisNativeBlockHashHex, 'history genesis hash'),
      observedTipHeight: canonicalUint64(interval.observedTipHeight, 'history tip height'),
      observedTipNativeBlockHashHex: digest(interval.observedTipNativeBlockHashHex, 'history native tip'),
      observedTipExecutionBlockHashHex: digest(interval.observedTipExecutionBlockHashHex, 'history execution tip'),
      blockCount: positiveInteger(interval.blockCount, 'history block count'),
    },
    target: normalizeCapturedTarget(receiptTarget),
    artifacts,
  });
}

function buildRouteCoverage(
  sourceDigestHex: string,
  ergoDigestHex: string,
  relayerDigestHex: string,
): SubstrateFederatedIsolatedDevnetLaunchStatementV1['routeCoverage'] {
  const requirements = [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6]
    .sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  const routes = requirements.map(requirement => {
    const evidenceComponent = requirement.layer === 'frontier'
      ? 'source-captured-history' as const
      : requirement.layer === 'ergo'
        ? 'ergo-genesis-history' as const
        : 'shipped-relayer-closure' as const;
    const evidenceDigestHex = requirement.layer === 'frontier'
      ? sourceDigestHex
      : requirement.layer === 'ergo'
        ? ergoDigestHex
        : relayerDigestHex;
    return deepFreeze({
      ...requirement,
      evidenceComponent,
      evidenceDigestHex: digest(evidenceDigestHex, `${requirement.routeId} evidence digest`),
      disposition: 'not-instantiated' as const,
    });
  });
  const frontierRouteCount = routes.filter(route => route.layer === 'frontier').length;
  const ergoRouteCount = routes.filter(route => route.layer === 'ergo').length;
  const relayerRouteCount = routes.filter(route => route.layer === 'relayer').length;
  if (
    routes.length !== 53
    || frontierRouteCount === 0
    || ergoRouteCount === 0
    || relayerRouteCount === 0
    || frontierRouteCount + ergoRouteCount + relayerRouteCount !== routes.length
  ) {
    throw new Error('isolated-devnet predecessor route coverage is incomplete');
  }
  return deepFreeze({
    staticRequirementsDigestHex: sha256CanonicalJson(
      requirements,
      ROUTE_REQUIREMENTS_DIGEST_DOMAIN,
    ),
    coverageDigestHex: sha256CanonicalJson(routes, ROUTE_COVERAGE_DIGEST_DOMAIN),
    routeCount: routes.length,
    frontierRouteCount,
    ergoRouteCount,
    relayerRouteCount,
    routes,
  });
}

function normalizeAndVerifySignatures(
  raw: readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[],
  statement: Readonly<SubstrateFederatedIsolatedDevnetLaunchStatementV1>,
): readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[] {
  if (!Array.isArray(raw) || raw.length !== statement.target.federation.sourceAttestationThreshold) {
    throw new Error('isolated-devnet launch requires the exact source-attestation threshold');
  }
  const registered = new Set(statement.target.federation.sourceAttestationPublicKeysHex);
  const signatures = raw.map((value, index) => {
    exactRecord(value, ['signerPublicKeyHex', 'signatureHex'], `launch signature ${index}`);
    return {
      signerPublicKeyHex: fixedHex(value.signerPublicKeyHex, 32, `launch signature ${index} public key`),
      signatureHex: fixedHex(value.signatureHex, 64, `launch signature ${index} bytes`, true),
    };
  });
  for (const [index, signature] of signatures.entries()) {
    if (!registered.has(signature.signerPublicKeyHex)) {
      throw new Error('isolated-devnet launch signature key is not registered');
    }
    if (index > 0 && signatures[index - 1]!.signerPublicKeyHex >= signature.signerPublicKeyHex) {
      throw new Error('isolated-devnet launch signatures must be strictly sorted and unique');
    }
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(signature.signerPublicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    if (!verifySignature(
      null,
      Buffer.from(statement.attestationDigestHex, 'hex'),
      publicKey,
      Buffer.from(signature.signatureHex, 'hex'),
    )) {
      throw new Error('isolated-devnet launch signature is invalid');
    }
  }
  return deepFreeze(signatures);
}

function assertCompilerClosure(
  input: Readonly<DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input>,
): void {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
    input.trackerReceipt,
    input.trackerRequest,
  );
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
    input.familyReceipt,
    {
      trackerRequest: input.trackerRequest,
      trackerReceipt: input.trackerReceipt,
      templates: input.familyTemplates,
      duplicatePreventionGenesisInputBoxIdHex:
        input.familyReceipt.profile.duplicatePreventionNftIdHex,
      pooledReserveGenesisInputBoxIdHex:
        input.familyReceipt.profile.pooledReserveNftIdHex,
    },
  );
}

function assertCompilerSemanticJoin(
  tracker: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
  family: ReturnType<typeof decodeSubstrateFederatedSettlementFamilyV1Profile>,
): void {
  const pairs: readonly (readonly [unknown, unknown, string])[] = [
    [family.trackerNftIdHex, tracker.trackerNftIdHex, 'tracker NFT ID'],
    [family.sourceNetworkIdHex, tracker.application.sourceNetworkIdHex, 'source network ID'],
    [family.sidechainIdHex, tracker.application.sidechainIdHex, 'sidechain ID'],
    [family.bridgeAddressHex, tracker.application.bridgeAddressHex, 'bridge address'],
    [family.tokenAddressHex, tracker.application.tokenAddressHex, 'token address'],
    [family.runtimeProfileIdHex, tracker.application.runtimeProfileIdHex, 'runtime profile ID'],
    [family.settlementProfileIdHex, tracker.application.settlementProfileIdHex, 'settlement profile ID'],
    [family.federationProfileIdHex, tracker.profile.profileIdHex, 'federation profile ID'],
    [family.sourceAttestationKeySetDigestHex, tracker.profile.sourceAttestationKeySetDigestHex, 'source key-set digest'],
    [family.sourceAttestationThreshold, tracker.profile.sourceAttestationThreshold, 'source threshold'],
    [family.ergoAdmissionKeySetDigestHex, tracker.profile.ergoAdmissionKeySetDigestHex, 'Ergo key-set digest'],
    [family.ergoAdmissionThreshold, tracker.profile.ergoAdmissionThreshold, 'Ergo threshold'],
    [family.federationEpoch, tracker.profile.federationEpoch, 'federation epoch'],
  ];
  for (const [left, right, label] of pairs) {
    if (left !== right) {
      throw new Error(`isolated-devnet ${label} differs across compiler closure`);
    }
  }
}

function normalizeSourceRuntime(
  application: Readonly<SubstrateFederatedTrackerCompilerRequestV1['application']>,
): SubstrateFederatedIsolatedDevnetTargetDescriptorV1['sourceRuntime'] {
  return deepFreeze({
    sourceNetworkIdHex: digest(application.sourceNetworkIdHex, 'source network ID'),
    sidechainIdHex: digest(application.sidechainIdHex, 'sidechain ID'),
    bridgeAddressHex: fixedHex(application.bridgeAddressHex, 20, 'bridge address'),
    tokenAddressHex: fixedHex(application.tokenAddressHex, 20, 'token address'),
    bridgeRuntimeCodeSha256Hex: digest(application.bridgeRuntimeCodeSha256Hex, 'bridge runtime digest'),
    bridgeRuntimeCodeBytes: positiveInteger(application.bridgeRuntimeCodeBytes, 'bridge runtime length'),
    tokenRuntimeCodeSha256Hex: digest(application.tokenRuntimeCodeSha256Hex, 'token runtime digest'),
    tokenRuntimeCodeBytes: positiveInteger(application.tokenRuntimeCodeBytes, 'token runtime length'),
    sourceRuntimeCodeSha256Hex: digest(application.sourceRuntimeCodeSha256Hex, 'source runtime digest'),
    sourceRuntimeCodeBytes: positiveInteger(application.sourceRuntimeCodeBytes, 'source runtime length'),
    runtimeProfileIdHex: digest(application.runtimeProfileIdHex, 'runtime profile ID'),
  });
}

function normalizeFederation(
  profile: Readonly<SubstrateFederatedTrackerCompilerRequestV1['profile']>,
): SubstrateFederatedIsolatedDevnetTargetDescriptorV1['federation'] {
  return deepFreeze({
    federationProfileIdHex: digest(profile.profileIdHex, 'federation profile ID'),
    federationEpoch: canonicalUint64(profile.federationEpoch, 'federation epoch'),
    maxAdmissionValidityBlocks: canonicalUint64(profile.maxAdmissionValidityBlocks, 'admission horizon'),
    sourceAttestationPublicKeysHex: normalizeStrictHexSet(profile.sourceAttestationPublicKeysHex, 32, 'source-attestation key'),
    sourceAttestationKeySetDigestHex: digest(profile.sourceAttestationKeySetDigestHex, 'source-attestation key-set digest'),
    sourceAttestationThreshold: positiveInteger(profile.sourceAttestationThreshold, 'source-attestation threshold'),
    ergoAdmissionPublicKeysHex: normalizeStrictHexSet(profile.ergoAdmissionPublicKeysHex, 33, 'Ergo-admission key'),
    ergoAdmissionKeySetDigestHex: digest(profile.ergoAdmissionKeySetDigestHex, 'Ergo-admission key-set digest'),
    ergoAdmissionThreshold: positiveInteger(profile.ergoAdmissionThreshold, 'Ergo-admission threshold'),
  });
}

function normalizeCapturedTarget(
  value: Record<string, unknown>,
): SubstrateFederatedIsolatedDevnetTargetDescriptorV1['capturedSourceHistory']['target'] {
  return deepFreeze({
    frontierCommit: fixedHex(value.frontierCommit, 20, 'Frontier commit'),
    frontierPatchSha256Hex: digest(value.frontierPatchSha256Hex, 'Frontier patch digest'),
    generatedSpecSha256Hex: digest(value.generatedSpecSha256Hex, 'generated spec digest'),
    nativeGenesisHashHex: digest(value.nativeGenesisHashHex, 'native genesis hash'),
    acceptedNativeTipHashHex: digest(value.acceptedNativeTipHashHex, 'accepted native tip'),
    acceptedExecutionTipHashHex: digest(value.acceptedExecutionTipHashHex, 'accepted execution tip'),
    sourceRuntimeCodeSha256Hex: digest(value.sourceRuntimeCodeSha256Hex, 'source runtime digest'),
    sourceRuntimeCodeBytes: positiveInteger(value.sourceRuntimeCodeBytes, 'source runtime length'),
    storageLayoutDigestHex: digest(value.storageLayoutDigestHex, 'storage-layout digest'),
    bridgeAddressHex: fixedHex(value.bridgeAddressHex, 20, 'captured bridge address'),
    bridgeRuntimeCodeSha256Hex: digest(value.bridgeRuntimeCodeSha256Hex, 'captured bridge runtime digest'),
    bridgeRuntimeCodeBytes: positiveInteger(value.bridgeRuntimeCodeBytes, 'captured bridge runtime length'),
    tokenAddressHex: fixedHex(value.tokenAddressHex, 20, 'captured token address'),
    tokenRuntimeCodeSha256Hex: digest(value.tokenRuntimeCodeSha256Hex, 'captured token runtime digest'),
    tokenRuntimeCodeBytes: positiveInteger(value.tokenRuntimeCodeBytes, 'captured token runtime length'),
    binarySha256Hex: digest(value.binarySha256Hex, 'source binary digest'),
    processBindingDigestHex: digest(value.processBindingDigestHex, 'source process binding'),
  });
}

function assertSourceRuntimeMatchesCapture(
  runtime: SubstrateFederatedIsolatedDevnetTargetDescriptorV1['sourceRuntime'],
  captured: SubstrateFederatedIsolatedDevnetTargetDescriptorV1['capturedSourceHistory']['target'],
): void {
  const pairs: readonly (readonly [unknown, unknown, string])[] = [
    [runtime.bridgeAddressHex, captured.bridgeAddressHex, 'bridge address'],
    [runtime.tokenAddressHex, captured.tokenAddressHex, 'token address'],
    [runtime.bridgeRuntimeCodeSha256Hex, captured.bridgeRuntimeCodeSha256Hex, 'bridge runtime digest'],
    [runtime.bridgeRuntimeCodeBytes, captured.bridgeRuntimeCodeBytes, 'bridge runtime length'],
    [runtime.tokenRuntimeCodeSha256Hex, captured.tokenRuntimeCodeSha256Hex, 'token runtime digest'],
    [runtime.tokenRuntimeCodeBytes, captured.tokenRuntimeCodeBytes, 'token runtime length'],
    [runtime.sourceRuntimeCodeSha256Hex, captured.sourceRuntimeCodeSha256Hex, 'source runtime digest'],
    [runtime.sourceRuntimeCodeBytes, captured.sourceRuntimeCodeBytes, 'source runtime length'],
  ];
  for (const [left, right, label] of pairs) {
    if (left !== right) {
      throw new Error(`G1dA ${label} differs from the compiler target`);
    }
  }
}

function assertExplicitSourceDomainPins(
  runtime: SubstrateFederatedIsolatedDevnetTargetDescriptorV1['sourceRuntime'],
  settlementProfileIdHex: string,
  pins: Readonly<SubstrateFederatedIsolatedDevnetTargetPinsV1>,
): void {
  const pairs: readonly (readonly [string, unknown, string])[] = [
    [runtime.sourceNetworkIdHex, pins.expectedSourceNetworkIdHex,
      'source-network ID'],
    [runtime.sidechainIdHex, pins.expectedSidechainIdHex, 'sidechain ID'],
    [runtime.runtimeProfileIdHex, pins.expectedRuntimeProfileIdHex,
      'runtime-profile ID'],
    [digest(settlementProfileIdHex, 'settlement-profile ID'),
      pins.expectedSettlementProfileIdHex,
      'settlement-profile ID'],
  ];
  for (const [actual, expected, label] of pairs) {
    if (actual !== digest(expected, `${label} pin`)) {
      throw new Error(`isolated-devnet ${label} differs from its explicit pin`);
    }
  }
}

function contractArtifact(
  value: Readonly<{
    readonly contractIdHex: string;
    readonly resolvedSourceSha256Hex: string;
    readonly propositionBytes: number;
    readonly propositionSha256Hex: string;
    readonly propositionHex: string;
  }>,
  label: string,
): Readonly<TargetContractArtifactV1> {
  return deepFreeze({
    contractIdHex: digest(value.contractIdHex, `${label} contract ID`),
    resolvedSourceSha256Hex: digest(value.resolvedSourceSha256Hex, `${label} source digest`),
    propositionBytes: positiveInteger(value.propositionBytes, `${label} proposition length`),
    propositionSha256Hex: digest(value.propositionSha256Hex, `${label} proposition digest`),
    propositionHex: variableHex(value.propositionHex, `${label} proposition bytes`),
  });
}

function assertReceiptArtifact(
  receipt: Record<string, unknown>,
  key: string,
  actual: Readonly<ByteArtifactV1>,
): void {
  const artifacts = record(receipt.artifacts, 'G1dA receipt artifacts');
  const expected = record(artifacts[key], `G1dA receipt ${key} artifact`);
  exactRecord(expected, ['sha256Hex', 'sizeBytes'], `G1dA receipt ${key} artifact`);
  if (
    digest(expected.sha256Hex, `${key} receipt digest`) !== actual.sha256Hex
    || positiveInteger(expected.sizeBytes, `${key} receipt size`) !== actual.sizeBytes
  ) {
    throw new Error(`G1dA ${key} bytes differ from the history receipt`);
  }
}

function assertTargetProjection(
  receipt: Record<string, unknown>,
  manifest: Record<string, unknown>,
): void {
  const keys = [
    'frontierCommit',
    'frontierPatchSha256Hex',
    'generatedSpecSha256Hex',
    'nativeGenesisHashHex',
    'acceptedNativeTipHashHex',
    'acceptedExecutionTipHashHex',
    'sourceRuntimeCodeSha256Hex',
    'sourceRuntimeCodeBytes',
    'storageLayoutDigestHex',
    'bridgeAddressHex',
    'bridgeRuntimeCodeSha256Hex',
    'bridgeRuntimeCodeBytes',
    'tokenAddressHex',
    'tokenRuntimeCodeSha256Hex',
    'tokenRuntimeCodeBytes',
  ] as const;
  exactRecord(manifest, keys, 'G1dA manifest target');
  for (const key of keys) {
    if (canonicalJson(receipt[key]) !== canonicalJson(manifest[key])) {
      throw new Error(`G1dA manifest target ${key} differs from the receipt`);
    }
  }
}

function assertAcceptanceSchemaDetails(
  acceptance: Record<string, unknown>,
): void {
  const toolchain = record(acceptance.toolchain, 'G1c acceptance toolchain');
  exactRecord(toolchain, [
    'lockSha256Hex', 'platformKey', 'rustTarget', 'cargo', 'rustc', 'git',
  ], 'G1c acceptance toolchain');
  digest(toolchain.lockSha256Hex, 'G1c toolchain lock');
  nonemptyString(toolchain.platformKey, 'G1c toolchain platform');
  nonemptyString(toolchain.rustTarget, 'G1c Rust target');
  for (const name of ['cargo', 'rustc', 'git'] as const) {
    const executable = record(toolchain[name], `G1c ${name} tool`);
    exactRecord(executable, ['version', 'sha256Hex'], `G1c ${name} tool`);
    nonemptyString(executable.version, `G1c ${name} version`);
    digest(executable.sha256Hex, `G1c ${name} executable`);
  }
  const expectedTests = [
    'bridge_atomicity_tests::authority_safe_genesis_quarantines_owner_mint_without_sudo_or_active_profile',
    'bridge_atomicity_tests::inactive_profile_rejects_direct_owner_mint_before_evm_and_preserves_authoring',
  ] as const;
  const runtimeTests = array(acceptance.runtimeTests, 'G1c runtime tests');
  if (runtimeTests.length !== expectedTests.length) {
    throw new Error('G1c runtime-test closure is incomplete');
  }
  for (const [index, expectedName] of expectedTests.entries()) {
    const test = record(runtimeTests[index], `G1c runtime test ${index}`);
    exactRecord(test, ['name', 'outputDigestHex'], `G1c runtime test ${index}`);
    if (test.name !== expectedName) {
      throw new Error('G1c runtime-test identity is invalid');
    }
    digest(test.outputDigestHex, `G1c runtime test ${index} output`);
  }
}

function validateSourceHistoryManifests(
  finalized: Record<string, unknown>,
  runtime: Record<string, unknown>,
  application: Record<string, unknown>,
  target: Record<string, unknown>,
  interval: Record<string, unknown>,
): void {
  exactRecord(finalized, [
    'schema', 'version', 'target', 'firstHeight', 'lastHeight',
    'finalityAuthority', 'reportedFinality', 'blocks',
  ], 'G1dA finalized-block history');
  exactRecord(runtime, [
    'schema', 'version', 'target', 'firstHeight', 'lastHeight', 'states',
  ], 'G1dA runtime history');
  exactRecord(application, [
    'schema', 'version', 'target', 'firstHeight', 'lastHeight',
    'bridgeAddressHex', 'tokenAddressHex', 'states',
  ], 'G1dA application history');
  if (finalized.finalityAuthority !== 'two-owned-node-rpc-reported') {
    throw new Error('G1dA finality authority label is invalid');
  }
  if (interval.semantics !== 'genesis-through-accepted-observation-tip-inclusive') {
    throw new Error('G1dA history interval semantics are invalid');
  }
  const tipHeight = canonicalUint64(interval.observedTipHeight, 'history tip height');
  const blockCount = positiveInteger(interval.blockCount, 'history block count');
  if (BigInt(tipHeight) + 1n !== BigInt(blockCount) || blockCount > 257) {
    throw new Error('G1dA history block count is not the complete bounded interval');
  }
  for (const manifest of [finalized, runtime, application]) {
    if (manifest.firstHeight !== '0' || manifest.lastHeight !== tipHeight) {
      throw new Error('G1dA artifact intervals do not match the receipt');
    }
  }
  const blocks = array(finalized.blocks, 'G1dA finalized blocks');
  const runtimeStates = array(runtime.states, 'G1dA runtime states');
  const applicationStates = array(application.states, 'G1dA application states');
  if (
    blocks.length !== blockCount
    || runtimeStates.length !== blockCount
    || applicationStates.length !== blockCount
  ) {
    throw new Error('G1dA history manifests omit bounded interval rows');
  }
  let previousNativeHash = '00'.repeat(32);
  let previousExecutionHash = '00'.repeat(32);
  for (let index = 0; index < blockCount; index += 1) {
    const height = String(index);
    const block = record(blocks[index], `G1dA block ${height}`);
    exactRecord(block, [
      'height', 'nativeBlockHashHex', 'nativeHeader',
      'executionBlockHashHex', 'executionBlock',
    ], `G1dA block ${height}`);
    if (block.height !== height) {
      throw new Error('G1dA block heights are not complete and contiguous');
    }
    const nativeHash = digest(block.nativeBlockHashHex, `G1dA native block ${height}`);
    const executionHash = digest(
      block.executionBlockHashHex,
      `G1dA execution block ${height}`,
    );
    const nativeHeader = record(block.nativeHeader, `G1dA native header ${height}`);
    const executionBlock = record(block.executionBlock, `G1dA execution block ${height}`);
    exactRecord(nativeHeader, [
      'digest', 'extrinsicsRoot', 'number', 'parentHash', 'stateRoot',
    ], `G1dA native header ${height}`);
    const nativeDigest = record(
      nativeHeader.digest,
      `G1dA native digest ${height}`,
    );
    exactRecord(nativeDigest, ['logs'], `G1dA native digest ${height}`);
    array(nativeDigest.logs, `G1dA native digest logs ${height}`);
    prefixedDigest(nativeHeader.extrinsicsRoot, `G1dA extrinsics root ${height}`);
    prefixedDigest(nativeHeader.stateRoot, `G1dA native state root ${height}`);
    exactRecord(executionBlock, [
      'author', 'baseFeePerGas', 'difficulty', 'extraData', 'gasLimit',
      'gasUsed', 'hash', 'logsBloom', 'miner', 'nonce', 'number',
      'parentHash', 'receiptsRoot', 'sha3Uncles', 'size', 'stateRoot',
      'timestamp', 'totalDifficulty', 'transactions', 'transactionsRoot',
      'uncles',
    ], `G1dA execution block ${height}`);
    array(executionBlock.transactions, `G1dA execution transactions ${height}`);
    array(executionBlock.uncles, `G1dA execution uncles ${height}`);
    if (
      rpcQuantity(nativeHeader.number, `G1dA native height ${height}`) !== BigInt(index)
      || rpcQuantity(executionBlock.number, `G1dA execution height ${height}`) !== BigInt(index)
      || prefixedDigest(nativeHeader.parentHash, `G1dA native parent ${height}`)
        !== previousNativeHash
      || prefixedDigest(executionBlock.parentHash, `G1dA execution parent ${height}`)
        !== previousExecutionHash
      || prefixedDigest(executionBlock.hash, `G1dA execution hash ${height}`)
        !== executionHash
    ) {
      throw new Error(`G1dA parent or block identity drifted at height ${height}`);
    }
    const runtimeState = record(runtimeStates[index], `G1dA runtime state ${height}`);
    exactRecord(runtimeState, [
      'height', 'nativeBlockHashHex', 'runtimeCodeSha256Hex',
      'runtimeCodeBytes',
    ], `G1dA runtime state ${height}`);
    const applicationState = record(
      applicationStates[index],
      `G1dA application state ${height}`,
    );
    exactRecord(applicationState, [
      'height', 'executionBlockHashHex', 'bridgeRuntimeCodeSha256Hex',
      'bridgeRuntimeCodeBytes', 'tokenRuntimeCodeSha256Hex',
      'tokenRuntimeCodeBytes',
    ], `G1dA application state ${height}`);
    if (
      runtimeState.height !== height
      || digest(runtimeState.nativeBlockHashHex, `runtime native hash ${height}`)
        !== nativeHash
      || applicationState.height !== height
      || digest(applicationState.executionBlockHashHex, `application execution hash ${height}`)
        !== executionHash
    ) {
      throw new Error(`G1dA runtime/application row differs at height ${height}`);
    }
    digest(runtimeState.runtimeCodeSha256Hex, `runtime code ${height}`);
    positiveInteger(runtimeState.runtimeCodeBytes, `runtime code length ${height}`);
    digest(applicationState.bridgeRuntimeCodeSha256Hex, `bridge code ${height}`);
    positiveInteger(applicationState.bridgeRuntimeCodeBytes, `bridge code length ${height}`);
    digest(applicationState.tokenRuntimeCodeSha256Hex, `token code ${height}`);
    positiveInteger(applicationState.tokenRuntimeCodeBytes, `token code length ${height}`);
    previousNativeHash = nativeHash;
    previousExecutionHash = executionHash;
  }
  if (
    digest(interval.genesisNativeBlockHashHex, 'history genesis hash')
      !== digest(target.nativeGenesisHashHex, 'target genesis hash')
    || digest(blocks[0] && record(blocks[0], 'genesis block').nativeBlockHashHex,
      'manifest genesis hash') !== digest(target.nativeGenesisHashHex, 'target genesis hash')
    || previousNativeHash !== digest(interval.observedTipNativeBlockHashHex, 'history native tip')
    || previousNativeHash !== digest(target.acceptedNativeTipHashHex, 'target native tip')
    || previousExecutionHash !== digest(interval.observedTipExecutionBlockHashHex, 'history execution tip')
    || previousExecutionHash !== digest(target.acceptedExecutionTipHashHex, 'target execution tip')
  ) {
    throw new Error('G1dA manifest endpoints differ from the accepted target');
  }
  if (
    application.bridgeAddressHex !== target.bridgeAddressHex
    || application.tokenAddressHex !== target.tokenAddressHex
  ) {
    throw new Error('G1dA application-history addresses differ from the target');
  }
  const finalRuntime = record(runtimeStates.at(-1), 'G1dA final runtime state');
  const finalApplication = record(applicationStates.at(-1), 'G1dA final application state');
  const tipPairs: readonly (readonly [unknown, unknown, string])[] = [
    [finalRuntime.runtimeCodeSha256Hex, target.sourceRuntimeCodeSha256Hex, 'runtime digest'],
    [finalRuntime.runtimeCodeBytes, target.sourceRuntimeCodeBytes, 'runtime length'],
    [finalApplication.bridgeRuntimeCodeSha256Hex, target.bridgeRuntimeCodeSha256Hex, 'bridge digest'],
    [finalApplication.bridgeRuntimeCodeBytes, target.bridgeRuntimeCodeBytes, 'bridge length'],
    [finalApplication.tokenRuntimeCodeSha256Hex, target.tokenRuntimeCodeSha256Hex, 'token digest'],
    [finalApplication.tokenRuntimeCodeBytes, target.tokenRuntimeCodeBytes, 'token length'],
  ];
  for (const [actual, expected, label] of tipPairs) {
    if (actual !== expected) throw new Error(`G1dA tip ${label} differs from the target`);
  }
  validateReportedFinality(
    finalized.reportedFinality,
    interval.reportedFinality,
    tipHeight,
    previousNativeHash,
  );
}

function validateReportedFinality(
  manifestValue: unknown,
  receiptValue: unknown,
  tipHeight: string,
  tipHashHex: string,
): void {
  if (canonicalJson(manifestValue) !== canonicalJson(receiptValue)) {
    throw new Error('G1dA reported finality differs from the receipt');
  }
  const paths = array(manifestValue, 'G1dA reported finality');
  if (paths.length !== 2) throw new Error('G1dA reported finality is incomplete');
  const roles = new Set<string>();
  for (const [pathIndex, rawPath] of paths.entries()) {
    const path = record(rawPath, `G1dA finality path ${pathIndex}`);
    exactRecord(path, [
      'role', 'headHeight', 'headNativeBlockHashHex', 'ancestryToAcceptedTip',
    ], `G1dA finality path ${pathIndex}`);
    if (path.role !== 'primary' && path.role !== 'witness') {
      throw new Error('G1dA finality role is invalid');
    }
    if (roles.has(path.role)) throw new Error('G1dA finality roles are duplicated');
    roles.add(path.role);
    const headHeight = BigInt(canonicalUint64(path.headHeight, 'finality head height'));
    const acceptedHeight = BigInt(tipHeight);
    const ancestry = array(path.ancestryToAcceptedTip, 'G1dA finality ancestry');
    if (headHeight < acceptedHeight || ancestry.length !== Number(headHeight - acceptedHeight + 1n)) {
      throw new Error('G1dA finality ancestry does not reach the accepted tip');
    }
    let expectedHeight = headHeight;
    let expectedHash = digest(path.headNativeBlockHashHex, 'finality head hash');
    for (const [index, rawRow] of ancestry.entries()) {
      const row = record(rawRow, `G1dA finality row ${index}`);
      exactRecord(row, [
        'height', 'nativeBlockHashHex', 'parentNativeBlockHashHex',
      ], `G1dA finality row ${index}`);
      if (
        BigInt(canonicalUint64(row.height, 'finality row height')) !== expectedHeight
        || digest(row.nativeBlockHashHex, 'finality row hash') !== expectedHash
      ) {
        throw new Error('G1dA finality ancestry is not contiguous');
      }
      expectedHash = digest(row.parentNativeBlockHashHex, 'finality parent hash');
      expectedHeight -= 1n;
    }
    const tipRow = record(ancestry.at(-1), 'G1dA finality accepted-tip row');
    if (digest(tipRow.nativeBlockHashHex, 'finality accepted-tip hash') !== tipHashHex) {
      throw new Error('G1dA finality ancestry ends at a different accepted tip');
    }
  }
}

function assertAcceptanceMatchesHistory(
  acceptance: Record<string, unknown>,
  target: Record<string, unknown>,
  interval: Record<string, unknown>,
): void {
  const source = record(acceptance.source, 'G1c acceptance source');
  const binary = record(acceptance.binary, 'G1c acceptance binary');
  const chainSpec = record(acceptance.chainSpec, 'G1c acceptance chain spec');
  const observation = record(acceptance.observation, 'G1c acceptance observation');
  const processes = record(acceptance.processes, 'G1c acceptance processes');
  exactRecord(source, [
    'frontierCommit', 'frontierPatchSha256Hex', 'checkoutDigestHex',
  ], 'G1c acceptance source');
  exactRecord(binary, [
    'byteLength', 'sha256Hex', 'version',
  ], 'G1c acceptance binary');
  exactRecord(chainSpec, [
    'reproducedBaseByteLength', 'reproducedBaseSha256Hex',
    'generatedByteLength', 'generatedSha256Hex', 'nodeAcceptedByteLength',
    'nodeAcceptedSha256Hex', 'semanticDigestHex',
  ], 'G1c acceptance chain spec');
  exactRecord(observation, [
    'nativeGenesisHashHex', 'nativeTipHeight', 'runtimeCodeSha256Hex',
    'storageLayoutDigestHex', 'twoNodeConsensusDigestHex',
    'observationDigestHex',
  ], 'G1c acceptance observation');
  exactRecord(processes, [
    'primaryPeerIdSha256Hex', 'witnessPeerIdSha256Hex',
    'processBindingDigestHex',
  ], 'G1c acceptance processes');
  const pairs: readonly (readonly [unknown, unknown, string])[] = [
    [source.frontierCommit, target.frontierCommit, 'Frontier commit'],
    [source.frontierPatchSha256Hex, target.frontierPatchSha256Hex,
      'Frontier patch digest'],
    [chainSpec.generatedSha256Hex, target.generatedSpecSha256Hex,
      'generated spec digest'],
    [stripLowerHexPrefix(observation.nativeGenesisHashHex),
      target.nativeGenesisHashHex, 'native genesis hash'],
    [observation.nativeTipHeight, interval.observedTipHeight,
      'accepted native tip height'],
    [observation.runtimeCodeSha256Hex, target.sourceRuntimeCodeSha256Hex,
      'source runtime digest'],
    [observation.storageLayoutDigestHex, target.storageLayoutDigestHex,
      'storage-layout digest'],
    [binary.sha256Hex, target.binarySha256Hex, 'binary digest'],
    [processes.processBindingDigestHex, target.processBindingDigestHex,
      'process binding digest'],
  ];
  for (const [left, right, label] of pairs) {
    if (left !== right) {
      throw new Error(`G1c ${label} differs from the G1dA history`);
    }
  }
}

function stripLowerHexPrefix(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error('G1c native genesis hash must be 0x-prefixed lowercase hex');
  }
  return value.slice(2);
}

function assertSchema(value: Record<string, unknown>, schema: string, label: string): void {
  if (value.schema !== schema || value.version !== 1) {
    throw new Error(`${label} schema or version is invalid`);
  }
}

function assertExpectedFlags(
  actual: Record<string, unknown>,
  expected: Readonly<Record<string, boolean>>,
  label: string,
): void {
  exactRecord(actual, Object.keys(expected), label);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`${label} are not admissible`);
    }
  }
}

function parsedRecord(value: Uint8Array, label: string): Record<string, unknown> {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
  const parsed = parseStrictJson(Buffer.from(value).toString('utf8'), label);
  return record(parsed, label);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function rpcQuantity(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical RPC quantity`);
  }
  return BigInt(value);
}

function prefixedDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 0x-prefixed lowercase digest hex`);
  }
  return value.slice(2);
}

function byteArtifact(value: Uint8Array, label: string): Readonly<ByteArtifactV1> {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
  const bytes = Buffer.from(value);
  if (bytes.length === 0 || bytes.length > MAX_ARTIFACT_BYTES) {
    throw new Error(`${label} size is outside the bounded artifact limit`);
  }
  return deepFreeze({ sha256Hex: sha256(bytes), sizeBytes: bytes.length });
}

function falseBoundaries(): SubstrateFederatedIsolatedDevnetTargetDescriptorV1['boundaries'] {
  return deepFreeze({
    sourceDomainObservedInCapturedHistory: false as const,
    sourceAttestationQuorumVerified: false as const,
    sourceConsensusIndependentlyVerified: false as const,
    independentSourceAdministrationEstablished: false as const,
    sourceFinalityAuthenticated: false as const,
    setupLineagesEstablished: false as const,
    profileActivated: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Reflect.ownKeys(value);
  if (actual.some(key => typeof key !== 'string')) {
    throw new Error(`${label} keys are invalid`);
  }
  const actualStrings = (actual as string[]).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (canonicalJson(actualStrings) !== canonicalJson(expected)) {
    throw new Error(`${label} fields are invalid`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
  }
}

function normalizeStrictHexSet(
  values: readonly string[],
  bytes: number,
  label: string,
): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} set must be non-empty`);
  }
  const normalized = values.map((value, index) =>
    fixedHex(value, bytes, `${label} ${index}`)
  );
  if (normalized.some((value, index) => index > 0 && normalized[index - 1]! >= value)) {
    throw new Error(`${label} set must be strictly sorted and unique`);
  }
  return deepFreeze(normalized);
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
  allowZero = false,
): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  if (!allowZero && /^0+$/.test(value)) throw new Error(`${label} must be nonzero`);
  return value;
}

function digest(value: unknown, label: string): string {
  return fixedHex(value, 32, label);
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase whole-byte hex`);
  }
  return value;
}

function canonicalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) throw new Error(`${label} exceeds uint64`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must be a positive signed Int`);
  }
  return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must be a nonnegative signed Int`);
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256G1cCanonicalJson(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(sortG1cCanonical(value)), 'utf8'));
}

function sortG1cCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortG1cCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortG1cCanonical(child)]),
    );
  }
  return value;
}

function assertTargetDescriptor(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1> {
  if (value === null || typeof value !== 'object' || !targetDescriptors.has(value)) {
    throw new Error('isolated-devnet target descriptor lacks process provenance');
  }
}

function assertErgoHistory(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryV1> {
  if (value === null || typeof value !== 'object' || !ergoHistories.has(value)) {
    throw new Error('isolated-devnet Ergo history lacks process provenance');
  }
}

function assertRelayerClosure(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetRelayerClosureV1> {
  if (value === null || typeof value !== 'object' || !relayerClosures.has(value)) {
    throw new Error('isolated-devnet relayer closure lacks process provenance');
  }
}

export function assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetLaunchStatementV1> {
  if (value === null || typeof value !== 'object' || !launchStatements.has(value)) {
    throw new Error('isolated-devnet launch statement lacks process provenance');
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
