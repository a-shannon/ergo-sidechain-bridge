import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from 'node:crypto';

import {
  getDupTreeDigest,
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  getSubstrateFederatedTrackerDigestV1Hex,
} from './substrate-federated-burn-settlement-v1.js';
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
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
  type LegacyRouteRetirementRequirementV6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';

export const SUBSTRATE_FEDERATED_GREENFIELD_TARGET_DESCRIPTOR_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-target-descriptor.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_SOURCE_HISTORY_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-source-history.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_ERGO_HISTORY_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-ergo-history.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_RELAYER_CLOSURE_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-relayer-closure.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_STATEMENT_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-launch-statement.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_BASELINE_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-launch-baseline.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_GENERATION_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-generation.v1' as const;

const TARGET_DESCRIPTOR_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_TARGET_DESCRIPTOR_V1';
const SOURCE_HISTORY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_SOURCE_HISTORY_V1';
const ERGO_HISTORY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_ERGO_HISTORY_V1';
const RELAYER_CLOSURE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_RELAYER_CLOSURE_V1';
const ROUTE_REQUIREMENTS_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_ROUTE_REQUIREMENTS_V1';
const ROUTE_COVERAGE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_ROUTE_COVERAGE_V1';
const STATEMENT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_STATEMENT_V1';
const ATTESTATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_ATTESTATION_V1';
const SIGNATURE_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_SIGNATURE_SET_V1';
const BASELINE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_BASELINE_V1';
const GENERATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_GENERATION_V1';
const GENESIS_PAYLOAD_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_GENESIS_PAYLOAD_V1';
const GENESIS_PAYLOAD_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_GENESIS_PAYLOAD_SET_V1';
const ED25519_SPKI_PREFIX = Buffer.from(
  '302a300506032b6570032100',
  'hex',
);
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const GENESIS_SINGLETON_VALUE_NANOERG = '10000000' as const;
const targetDescriptors = new WeakSet<object>();
const sourceHistories = new WeakSet<object>();
const ergoHistories = new WeakSet<object>();
const relayerClosures = new WeakSet<object>();
const launchStatements = new WeakSet<object>();
const launchBaselines = new WeakSet<object>();
const generationManifests = new WeakSet<object>();

type FamilyTemplates = Readonly<{
  readonly duplicatePrevention: SubstrateFederatedSettlementFamilyV1Template;
  readonly sourceLock: SubstrateFederatedSettlementFamilyV1Template;
  readonly pooledReserve: SubstrateFederatedSettlementFamilyV1Template;
}>;

interface TargetContractArtifactV1 {
  readonly contractIdHex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly propositionHex: string;
}

export interface SubstrateFederatedGreenfieldTargetDescriptorV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_TARGET_DESCRIPTOR_V1_SCHEMA;
  readonly version: 1;
  readonly descriptorDigestHex: string;
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
}

export interface DeriveSubstrateFederatedGreenfieldTargetDescriptorV1Input {
  readonly trackerRequest:
    Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
  readonly trackerReceipt:
    Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
  readonly familyTemplates: FamilyTemplates;
  readonly familyReceipt:
    Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
}

export interface SubstrateFederatedGreenfieldSourceHistoryV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_SOURCE_HISTORY_V1_SCHEMA;
  readonly version: 1;
  readonly historyDigestHex: string;
  readonly targetDescriptorDigestHex: string;
  readonly genesis: Readonly<{
    readonly nativeBlockHashHex: string;
    readonly executionBlockHashHex: string;
  }>;
  readonly activation: Readonly<{
    readonly nativeBlockHeight: string;
    readonly nativeBlockHashHex: string;
    readonly executionBlockHashHex: string;
  }>;
  readonly manifests: Readonly<{
    readonly finalizedBlocks: Readonly<ByteArtifactV1>;
    readonly runtimeUpgrades: Readonly<ByteArtifactV1>;
    readonly applicationDeployments: Readonly<ByteArtifactV1>;
  }>;
  readonly interval: Readonly<{
    readonly firstNativeBlockHeight: '0';
    readonly lastNativeBlockHeight: string;
  }>;
}

export interface BuildSubstrateFederatedGreenfieldSourceHistoryV1Input {
  readonly target:
    Readonly<SubstrateFederatedGreenfieldTargetDescriptorV1>;
  readonly genesisNativeBlockHashHex: string;
  readonly genesisExecutionBlockHashHex: string;
  readonly activationNativeBlockHeight: string | number | bigint;
  readonly activationNativeBlockHashHex: string;
  readonly activationExecutionBlockHashHex: string;
  readonly finalizedBlocksManifest: Uint8Array;
  readonly runtimeUpgradesManifest: Uint8Array;
  readonly applicationDeploymentsManifest: Uint8Array;
}

export interface SubstrateFederatedGreenfieldErgoHistoryV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_ERGO_HISTORY_V1_SCHEMA;
  readonly version: 1;
  readonly historyDigestHex: string;
  readonly targetDescriptorDigestHex: string;
  readonly genesis: Readonly<{
    readonly headerIdHex: string;
    readonly height: number;
  }>;
  readonly setupAnchor: Readonly<{
    readonly headerIdHex: string;
    readonly height: number;
  }>;
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

export interface BuildSubstrateFederatedGreenfieldErgoHistoryV1Input {
  readonly target:
    Readonly<SubstrateFederatedGreenfieldTargetDescriptorV1>;
  readonly genesisHeaderIdHex: string;
  readonly genesisHeight: number;
  readonly setupAnchorHeaderIdHex: string;
  readonly setupAnchorHeight: number;
  readonly greatestWorkHeadersManifest: Uint8Array;
  readonly transactionsManifest: Uint8Array;
  readonly utxoTransitionsManifest: Uint8Array;
}

interface ByteArtifactV1 {
  readonly sha256Hex: string;
  readonly sizeBytes: number;
}

export interface SubstrateFederatedGreenfieldRelayerClosureV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_RELAYER_CLOSURE_V1_SCHEMA;
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

export interface BuildSubstrateFederatedGreenfieldRelayerClosureV1Input {
  readonly target:
    Readonly<SubstrateFederatedGreenfieldTargetDescriptorV1>;
  readonly gitCommitSha1Hex: string;
  readonly sourceArchive: Uint8Array;
  readonly packageLock: Uint8Array;
  readonly runtimeEntrypointsManifest: Uint8Array;
  readonly buildArtifact: Uint8Array;
}

interface GreenfieldRouteCoverageV1
  extends LegacyRouteRetirementRequirementV6 {
  readonly evidenceComponent:
    | 'source-genesis-history'
    | 'ergo-genesis-history'
    | 'shipped-relayer-closure';
  readonly evidenceDigestHex: string;
  readonly disposition: 'not-instantiated';
}

export interface SubstrateFederatedGreenfieldLaunchStatementV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_STATEMENT_V1_SCHEMA;
  readonly version: 1;
  readonly statementDigestHex: string;
  readonly attestationDigestHex: string;
  readonly activationGenerationIdHex: string;
  readonly settlementNetworkId: 'ergo-testnet';
  readonly sourceNetworkScope: 'public-testnet';
  readonly trustModel: 'federated_non_trustless';
  readonly target:
    Readonly<SubstrateFederatedGreenfieldTargetDescriptorV1>;
  readonly histories: Readonly<{
    readonly source:
      Readonly<SubstrateFederatedGreenfieldSourceHistoryV1>;
    readonly ergo:
      Readonly<SubstrateFederatedGreenfieldErgoHistoryV1>;
    readonly relayer:
      Readonly<SubstrateFederatedGreenfieldRelayerClosureV1>;
  }>;
  readonly routeCoverage: Readonly<{
    readonly staticRequirementsDigestHex: string;
    readonly coverageDigestHex: string;
    readonly routeCount: number;
    readonly frontierRouteCount: number;
    readonly ergoRouteCount: number;
    readonly relayerRouteCount: number;
    readonly routes: readonly Readonly<GreenfieldRouteCoverageV1>[];
  }>;
  readonly claims: Readonly<{
    readonly sourceHistoryCompleteFromGenesisThroughActivation: true;
    readonly ergoHistoryCompleteFromGenesisThroughSetupAnchor: true;
    readonly relayerClosureIsExactShippedArtifact: true;
    readonly predecessorRoutesNeverInstantiated: true;
    readonly emptyGlobalReplayRequired: true;
  }>;
}

export interface BuildSubstrateFederatedGreenfieldLaunchStatementV1Input {
  readonly activationGenerationIdHex: string;
  readonly target:
    Readonly<SubstrateFederatedGreenfieldTargetDescriptorV1>;
  readonly sourceHistory:
    Readonly<SubstrateFederatedGreenfieldSourceHistoryV1>;
  readonly ergoHistory:
    Readonly<SubstrateFederatedGreenfieldErgoHistoryV1>;
  readonly relayerClosure:
    Readonly<SubstrateFederatedGreenfieldRelayerClosureV1>;
}

export interface SubstrateFederatedGreenfieldLaunchSignatureV1 {
  readonly signerPublicKeyHex: string;
  readonly signatureHex: string;
}

export interface SubstrateFederatedGreenfieldLaunchBaselineV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_BASELINE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'authenticated_federated_greenfield_baseline';
  readonly baselineDigestHex: string;
  readonly statement:
    Readonly<SubstrateFederatedGreenfieldLaunchStatementV1>;
  readonly signatures:
    readonly Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>[];
  readonly signatureSetDigestHex: string;
  readonly checks: Readonly<{
    readonly exactSourceAttestationThresholdVerified: true;
    readonly exactTargetDescriptorBound: true;
    readonly exactThreeHistoryClosuresBound: true;
    readonly exactStaticRouteSetBound: true;
    readonly allPredecessorRoutesAttestedNotInstantiated: true;
    readonly emptyReplayDerivedFromQuorumAuthenticatedNonInstantiation: true;
    readonly callerGreenfieldFlagAccepted: false;
    readonly currentEmptyUtxoAcceptedAsHistory: false;
  }>;
  readonly boundaries: Readonly<{
    readonly sourceAttestationQuorumIsLaunchHistoryAuthority: true;
    readonly sourceConsensusIndependentlyVerified: false;
    readonly ergoConsensusIndependentlyVerified: false;
    readonly ergoAdmissionSigmaPropSatisfied: false;
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

export interface BuildSubstrateFederatedGreenfieldLaunchBaselineV1Input {
  readonly statement:
    Readonly<SubstrateFederatedGreenfieldLaunchStatementV1>;
  readonly signatures:
    readonly Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>[];
}

interface TargetGenesisPayloadV1 {
  readonly role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve';
  readonly valueNanoErg: typeof GENESIS_SINGLETON_VALUE_NANOERG;
  readonly ergoTreeHex: string;
  readonly assets: readonly Readonly<{
    readonly tokenId: string;
    readonly amount: '1';
  }>[];
  readonly additionalRegisters: Readonly<Record<string, string>>;
  readonly payloadDigestHex: string;
}

export interface SubstrateFederatedGreenfieldGenerationV1Manifest {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_GENERATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'authenticated_non_authorizing_greenfield_generation';
  readonly manifestDigestHex: string;
  readonly generation: Readonly<{
    readonly label: 'substrate-federated-greenfield-v1';
    readonly generationIdHex: string;
    readonly settlementNetworkId: 'ergo-testnet';
    readonly sourceNetworkScope: 'public-testnet';
    readonly trustModel: 'federated_non_trustless';
  }>;
  readonly launchBaseline: Readonly<{
    readonly baselineDigestHex: string;
    readonly statementDigestHex: string;
    readonly attestationDigestHex: string;
    readonly signatureSetDigestHex: string;
    readonly sourceHistoryDigestHex: string;
    readonly ergoHistoryDigestHex: string;
    readonly relayerClosureDigestHex: string;
    readonly ergoGenesis: Readonly<{
      readonly headerIdHex: string;
      readonly height: number;
    }>;
    readonly ergoSetupAnchor: Readonly<{
      readonly headerIdHex: string;
      readonly height: number;
    }>;
  }>;
  readonly target: Readonly<{
    readonly compilerClosureDigestHex: string;
    readonly profile:
      SubstrateFederatedGreenfieldTargetDescriptorV1['profile'];
    readonly sourceRuntime:
      SubstrateFederatedGreenfieldTargetDescriptorV1['sourceRuntime'];
    readonly federation: Readonly<{
      readonly federationProfileIdHex: string;
      readonly federationEpoch: string;
      readonly sourceAttestationKeySetDigestHex: string;
      readonly sourceAttestationThreshold: number;
      readonly ergoAdmissionKeySetDigestHex: string;
      readonly ergoAdmissionThreshold: number;
      readonly ergoAdmissionPublicKeysHex: readonly string[];
    }>;
    readonly lineages:
      SubstrateFederatedGreenfieldTargetDescriptorV1['lineages'];
    readonly genesisPayloads: Readonly<{
      readonly schema:
        'e2s.substrate-federated-greenfield-genesis-payloads.v1';
      readonly version: 1;
      readonly payloadSetDigestHex: string;
      readonly importedReplayDigestHex: string;
      readonly emptyTrackerDigestHex: string;
      readonly emptyDepositDigestHex: string;
      readonly tracker: Readonly<TargetGenesisPayloadV1>;
      readonly duplicatePrevention: Readonly<TargetGenesisPayloadV1>;
      readonly pooledReserve: Readonly<TargetGenesisPayloadV1>;
      readonly creationHeightsBoundAtMaterialization: false;
      readonly outputIdsBoundAtMaterialization: false;
    }>;
  }>;
  readonly globalReplay: Readonly<{
    readonly sourcePacketDigestHex: string;
    readonly canonicalBurnIdsHex: readonly [];
    readonly canonicalBurnIdCount: 0;
    readonly duplicatePreventionDigestHex: string;
    readonly derivation:
      'empty-from-quorum-authenticated-non-instantiation';
  }>;
  readonly predecessorRoutes: Readonly<{
    readonly exactStaticRouteSetDigestHex: string;
    readonly boundRouteSetDigestHex: string;
    readonly routeCount: number;
    readonly routes: readonly Readonly<GreenfieldRouteCoverageV1>[];
    readonly everyRouteNotInstantiated: true;
  }>;
  readonly blockers: readonly string[];
  readonly checks: Readonly<{
    readonly sameProcessLaunchBaselineVerified: true;
    readonly sameProcessTrackerCompilationVerified: true;
    readonly sameProcessFamilyCompilationVerified: true;
    readonly exactTargetDescriptorMatchedCompilers: true;
    readonly exactStaticPredecessorRouteSetMatched: true;
    readonly emptyReplayRootDerivedInternally: true;
    readonly emptyReplayClaimAuthenticatedBySourceQuorum: true;
    readonly exactTargetGenesisPayloadsBound: true;
    readonly migrationArtifactAcceptedAsGreenfieldAuthority: false;
    readonly callerNonInstantiationClaimsAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly greenfieldLaunchBaselineAuthenticated: true;
    readonly predecessorRouteNonInstantiationAcceptedUnderFederatedTrust: true;
    readonly targetNetworkConsensusIndependentlyAuthenticated: false;
    readonly trackerLineageEstablished: false;
    readonly duplicatePreventionLineageEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly confirmationEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface BuildSubstrateFederatedGreenfieldGenerationV1Input
  extends DeriveSubstrateFederatedGreenfieldTargetDescriptorV1Input {
  readonly launchBaseline:
    Readonly<SubstrateFederatedGreenfieldLaunchBaselineV1>;
}

export function deriveSubstrateFederatedGreenfieldTargetDescriptorV1(
  input: Readonly<DeriveSubstrateFederatedGreenfieldTargetDescriptorV1Input>,
): Readonly<SubstrateFederatedGreenfieldTargetDescriptorV1> {
  exactRecord(input, [
    'trackerRequest',
    'trackerReceipt',
    'familyTemplates',
    'familyReceipt',
  ], 'federated greenfield target-descriptor input');
  assertCompilerClosure(input);
  const tracker = input.trackerRequest;
  const family = input.familyReceipt;
  const familyProfile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    family.profile,
  );
  assertCompilerSemanticJoin(tracker, familyProfile);

  const body = {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_TARGET_DESCRIPTOR_V1_SCHEMA,
    version: 1 as const,
    compiler: {
      trackerRequestDigestHex: fixedHex(
        tracker.requestDigestHex,
        32,
        'greenfield tracker request digest',
      ),
      trackerReceiptDigestHex: fixedHex(
        input.trackerReceipt.receiptDigestHex,
        32,
        'greenfield tracker receipt digest',
      ),
      trackerCompilerLockDigestHex: fixedHex(
        input.trackerReceipt.compilerLockDigestHex,
        32,
        'greenfield tracker compiler-lock digest',
      ),
      familyRequestDigestHex: fixedHex(
        family.familyCompilerRequestDigestHex,
        32,
        'greenfield family request digest',
      ),
      familyReceiptDigestHex: fixedHex(
        family.receiptDigestHex,
        32,
        'greenfield family receipt digest',
      ),
      familyCompilerLockDigestHex: fixedHex(
        family.compilerLockDigestHex,
        32,
        'greenfield family compiler-lock digest',
      ),
    },
    profile: {
      familyIdHex: fixedHex(
        family.profile.familyIdHex,
        32,
        'greenfield family ID',
      ),
      encodedProfileHex: variableHex(
        family.profile.encodedProfileHex,
        'greenfield encoded family profile',
      ),
      settlementProfileIdHex: fixedHex(
        tracker.application.settlementProfileIdHex,
        32,
        'greenfield settlement profile ID',
      ),
    },
    sourceRuntime: normalizeSourceRuntime(tracker.application),
    federation: {
      federationProfileIdHex: fixedHex(
        tracker.profile.profileIdHex,
        32,
        'greenfield federation profile ID',
      ),
      federationEpoch: canonicalUint64(
        tracker.profile.federationEpoch,
        'greenfield federation epoch',
      ),
      maxAdmissionValidityBlocks: canonicalUint64(
        tracker.profile.maxAdmissionValidityBlocks,
        'greenfield admission horizon',
      ),
      sourceAttestationPublicKeysHex: normalizeStrictHexSet(
        tracker.profile.sourceAttestationPublicKeysHex,
        32,
        'greenfield source-attestation public key',
      ),
      sourceAttestationKeySetDigestHex: fixedHex(
        tracker.profile.sourceAttestationKeySetDigestHex,
        32,
        'greenfield source-attestation key-set digest',
      ),
      sourceAttestationThreshold: positiveInteger(
        tracker.profile.sourceAttestationThreshold,
        'greenfield source-attestation threshold',
      ),
      ergoAdmissionPublicKeysHex: normalizeStrictHexSet(
        tracker.profile.ergoAdmissionPublicKeysHex,
        33,
        'greenfield Ergo-admission public key',
      ),
      ergoAdmissionKeySetDigestHex: fixedHex(
        tracker.profile.ergoAdmissionKeySetDigestHex,
        32,
        'greenfield Ergo-admission key-set digest',
      ),
      ergoAdmissionThreshold: positiveInteger(
        tracker.profile.ergoAdmissionThreshold,
        'greenfield Ergo-admission threshold',
      ),
    },
    lineages: {
      tracker: {
        ...contractArtifact(input.trackerReceipt.contract, 'tracker'),
        singletonTokenIdHex: fixedHex(
          tracker.trackerNftIdHex,
          32,
          'greenfield tracker singleton ID',
        ),
        genesisInputBoxIdHex: fixedHex(
          tracker.trackerNftIdHex,
          32,
          'greenfield tracker genesis input ID',
        ),
      },
      duplicatePrevention: {
        ...contractArtifact(
          family.contracts.duplicatePrevention,
          'duplicate-prevention',
        ),
        singletonTokenIdHex: fixedHex(
          family.profile.duplicatePreventionNftIdHex,
          32,
          'greenfield duplicate-prevention singleton ID',
        ),
        genesisInputBoxIdHex: fixedHex(
          family.profile.duplicatePreventionNftIdHex,
          32,
          'greenfield duplicate-prevention genesis input ID',
        ),
      },
      sourceLock: contractArtifact(
        family.contracts.sourceLock,
        'source-lock',
      ),
      pooledReserve: {
        ...contractArtifact(
          family.contracts.pooledReserve,
          'pooled-reserve',
        ),
        singletonTokenIdHex: fixedHex(
          family.profile.pooledReserveNftIdHex,
          32,
          'greenfield pooled-reserve singleton ID',
        ),
        genesisInputBoxIdHex: fixedHex(
          family.profile.pooledReserveNftIdHex,
          32,
          'greenfield pooled-reserve genesis input ID',
        ),
      },
    },
  };
  const descriptor = deepFreeze({
    ...body,
    descriptorDigestHex: sha256CanonicalJson(
      body,
      TARGET_DESCRIPTOR_DIGEST_DOMAIN,
    ),
  });
  targetDescriptors.add(descriptor);
  return descriptor;
}

export function buildSubstrateFederatedGreenfieldSourceHistoryV1(
  input: Readonly<BuildSubstrateFederatedGreenfieldSourceHistoryV1Input>,
): Readonly<SubstrateFederatedGreenfieldSourceHistoryV1> {
  exactRecord(input, [
    'target',
    'genesisNativeBlockHashHex',
    'genesisExecutionBlockHashHex',
    'activationNativeBlockHeight',
    'activationNativeBlockHashHex',
    'activationExecutionBlockHashHex',
    'finalizedBlocksManifest',
    'runtimeUpgradesManifest',
    'applicationDeploymentsManifest',
  ], 'federated greenfield source-history input');
  assertTargetDescriptor(input.target);
  const activationHeight = canonicalUint64(
    input.activationNativeBlockHeight,
    'greenfield source activation height',
  );
  if (activationHeight === '0') {
    throw new Error('greenfield source activation height must be positive');
  }
  const body = {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_SOURCE_HISTORY_V1_SCHEMA,
    version: 1 as const,
    targetDescriptorDigestHex: input.target.descriptorDigestHex,
    genesis: {
      nativeBlockHashHex: fixedHex(
        input.genesisNativeBlockHashHex,
        32,
        'greenfield source genesis native block hash',
      ),
      executionBlockHashHex: fixedHex(
        input.genesisExecutionBlockHashHex,
        32,
        'greenfield source genesis execution block hash',
      ),
    },
    activation: {
      nativeBlockHeight: activationHeight,
      nativeBlockHashHex: fixedHex(
        input.activationNativeBlockHashHex,
        32,
        'greenfield source activation native block hash',
      ),
      executionBlockHashHex: fixedHex(
        input.activationExecutionBlockHashHex,
        32,
        'greenfield source activation execution block hash',
      ),
    },
    manifests: {
      finalizedBlocks: byteArtifact(
        input.finalizedBlocksManifest,
        'greenfield finalized-block history manifest',
      ),
      runtimeUpgrades: byteArtifact(
        input.runtimeUpgradesManifest,
        'greenfield runtime-upgrade history manifest',
      ),
      applicationDeployments: byteArtifact(
        input.applicationDeploymentsManifest,
        'greenfield application-deployment history manifest',
      ),
    },
    interval: {
      firstNativeBlockHeight: '0' as const,
      lastNativeBlockHeight: activationHeight,
    },
  };
  const history = deepFreeze({
    ...body,
    historyDigestHex: sha256CanonicalJson(body, SOURCE_HISTORY_DIGEST_DOMAIN),
  });
  sourceHistories.add(history);
  return history;
}

export function buildSubstrateFederatedGreenfieldErgoHistoryV1(
  input: Readonly<BuildSubstrateFederatedGreenfieldErgoHistoryV1Input>,
): Readonly<SubstrateFederatedGreenfieldErgoHistoryV1> {
  exactRecord(input, [
    'target',
    'genesisHeaderIdHex',
    'genesisHeight',
    'setupAnchorHeaderIdHex',
    'setupAnchorHeight',
    'greatestWorkHeadersManifest',
    'transactionsManifest',
    'utxoTransitionsManifest',
  ], 'federated greenfield Ergo-history input');
  assertTargetDescriptor(input.target);
  const genesisHeight = nonnegativeInteger(
    input.genesisHeight,
    'greenfield Ergo genesis height',
  );
  const setupAnchorHeight = positiveInteger(
    input.setupAnchorHeight,
    'greenfield Ergo setup-anchor height',
  );
  if (setupAnchorHeight < genesisHeight) {
    throw new Error('greenfield Ergo setup anchor precedes genesis');
  }
  const lineages = input.target.lineages;
  const genesisInputs = {
    trackerBoxIdHex: lineages.tracker.genesisInputBoxIdHex,
    duplicatePreventionBoxIdHex:
      lineages.duplicatePrevention.genesisInputBoxIdHex,
    pooledReserveBoxIdHex: lineages.pooledReserve.genesisInputBoxIdHex,
  };
  if (new Set(Object.values(genesisInputs)).size !== 3) {
    throw new Error('greenfield Ergo genesis inputs must be pairwise distinct');
  }
  const body = {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_ERGO_HISTORY_V1_SCHEMA,
    version: 1 as const,
    targetDescriptorDigestHex: input.target.descriptorDigestHex,
    genesis: {
      headerIdHex: fixedHex(
        input.genesisHeaderIdHex,
        32,
        'greenfield Ergo genesis header ID',
      ),
      height: genesisHeight,
    },
    setupAnchor: {
      headerIdHex: fixedHex(
        input.setupAnchorHeaderIdHex,
        32,
        'greenfield Ergo setup-anchor header ID',
      ),
      height: setupAnchorHeight,
    },
    genesisInputs,
    manifests: {
      greatestWorkHeaders: byteArtifact(
        input.greatestWorkHeadersManifest,
        'greenfield Ergo greatest-work history manifest',
      ),
      transactions: byteArtifact(
        input.transactionsManifest,
        'greenfield Ergo transaction history manifest',
      ),
      utxoTransitions: byteArtifact(
        input.utxoTransitionsManifest,
        'greenfield Ergo UTXO history manifest',
      ),
    },
    interval: {
      firstHeaderHeight: genesisHeight,
      lastHeaderHeight: setupAnchorHeight,
    },
  };
  const history = deepFreeze({
    ...body,
    historyDigestHex: sha256CanonicalJson(body, ERGO_HISTORY_DIGEST_DOMAIN),
  });
  ergoHistories.add(history);
  return history;
}

export function buildSubstrateFederatedGreenfieldRelayerClosureV1(
  input: Readonly<BuildSubstrateFederatedGreenfieldRelayerClosureV1Input>,
): Readonly<SubstrateFederatedGreenfieldRelayerClosureV1> {
  exactRecord(input, [
    'target',
    'gitCommitSha1Hex',
    'sourceArchive',
    'packageLock',
    'runtimeEntrypointsManifest',
    'buildArtifact',
  ], 'federated greenfield relayer-closure input');
  assertTargetDescriptor(input.target);
  const body = {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_RELAYER_CLOSURE_V1_SCHEMA,
    version: 1 as const,
    targetDescriptorDigestHex: input.target.descriptorDigestHex,
    gitCommitSha1Hex: commitHex(
      input.gitCommitSha1Hex,
      'greenfield relayer Git commit',
    ),
    artifacts: {
      sourceArchive: byteArtifact(
        input.sourceArchive,
        'greenfield relayer source archive',
      ),
      packageLock: byteArtifact(
        input.packageLock,
        'greenfield relayer package lock',
      ),
      runtimeEntrypoints: byteArtifact(
        input.runtimeEntrypointsManifest,
        'greenfield relayer runtime-entrypoint manifest',
      ),
      buildArtifact: byteArtifact(
        input.buildArtifact,
        'greenfield relayer build artifact',
      ),
    },
  };
  const closure = deepFreeze({
    ...body,
    closureDigestHex: sha256CanonicalJson(body, RELAYER_CLOSURE_DIGEST_DOMAIN),
  });
  relayerClosures.add(closure);
  return closure;
}

export function buildSubstrateFederatedGreenfieldLaunchStatementV1(
  input: Readonly<BuildSubstrateFederatedGreenfieldLaunchStatementV1Input>,
): Readonly<SubstrateFederatedGreenfieldLaunchStatementV1> {
  exactRecord(input, [
    'activationGenerationIdHex',
    'target',
    'sourceHistory',
    'ergoHistory',
    'relayerClosure',
  ], 'federated greenfield launch-statement input');
  assertTargetDescriptor(input.target);
  assertSourceHistory(input.sourceHistory);
  assertErgoHistory(input.ergoHistory);
  assertRelayerClosure(input.relayerClosure);
  const targetDigest = input.target.descriptorDigestHex;
  if (
    input.sourceHistory.targetDescriptorDigestHex !== targetDigest
    || input.ergoHistory.targetDescriptorDigestHex !== targetDigest
    || input.relayerClosure.targetDescriptorDigestHex !== targetDigest
  ) {
    throw new Error('greenfield histories do not bind one exact target descriptor');
  }
  const routeCoverage = buildRouteCoverage(
    input.sourceHistory.historyDigestHex,
    input.ergoHistory.historyDigestHex,
    input.relayerClosure.closureDigestHex,
  );
  const body = {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_STATEMENT_V1_SCHEMA,
    version: 1 as const,
    activationGenerationIdHex: fixedHex(
      input.activationGenerationIdHex,
      32,
      'greenfield activation generation ID',
    ),
    settlementNetworkId: 'ergo-testnet' as const,
    sourceNetworkScope: 'public-testnet' as const,
    trustModel: 'federated_non_trustless' as const,
    target: input.target,
    histories: {
      source: input.sourceHistory,
      ergo: input.ergoHistory,
      relayer: input.relayerClosure,
    },
    routeCoverage,
    claims: {
      sourceHistoryCompleteFromGenesisThroughActivation: true as const,
      ergoHistoryCompleteFromGenesisThroughSetupAnchor: true as const,
      relayerClosureIsExactShippedArtifact: true as const,
      predecessorRoutesNeverInstantiated: true as const,
      emptyGlobalReplayRequired: true as const,
    },
  };
  const statementDigestHex = sha256CanonicalJson(body, STATEMENT_DIGEST_DOMAIN);
  const statement = deepFreeze({
    ...body,
    statementDigestHex,
    attestationDigestHex: sha256CanonicalJson(
      {
        statementDigestHex,
        activationGenerationIdHex: body.activationGenerationIdHex,
        federationProfileIdHex:
          body.target.federation.federationProfileIdHex,
        sourceAttestationKeySetDigestHex:
          body.target.federation.sourceAttestationKeySetDigestHex,
        sourceAttestationThreshold:
          body.target.federation.sourceAttestationThreshold,
      },
      ATTESTATION_DIGEST_DOMAIN,
    ),
  });
  launchStatements.add(statement);
  return statement;
}

export function buildSubstrateFederatedGreenfieldLaunchBaselineV1(
  input: Readonly<BuildSubstrateFederatedGreenfieldLaunchBaselineV1Input>,
): Readonly<SubstrateFederatedGreenfieldLaunchBaselineV1> {
  exactRecord(input, [
    'statement',
    'signatures',
  ], 'federated greenfield launch-baseline input');
  assertLaunchStatement(input.statement);
  const signatures = normalizeAndVerifySignatures(
    input.signatures,
    input.statement,
  );
  const signatureSetDigestHex = sha256CanonicalJson(
    signatures,
    SIGNATURE_SET_DIGEST_DOMAIN,
  );
  const binding = {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_BASELINE_V1_SCHEMA,
    version: 1 as const,
    status: 'authenticated_federated_greenfield_baseline' as const,
    statement: input.statement,
    signatures,
    signatureSetDigestHex,
    checks: {
      exactSourceAttestationThresholdVerified: true as const,
      exactTargetDescriptorBound: true as const,
      exactThreeHistoryClosuresBound: true as const,
      exactStaticRouteSetBound: true as const,
      allPredecessorRoutesAttestedNotInstantiated: true as const,
      emptyReplayDerivedFromQuorumAuthenticatedNonInstantiation: true as const,
      callerGreenfieldFlagAccepted: false as const,
      currentEmptyUtxoAcceptedAsHistory: false as const,
    },
    boundaries: {
      sourceAttestationQuorumIsLaunchHistoryAuthority: true as const,
      sourceConsensusIndependentlyVerified: false as const,
      ergoConsensusIndependentlyVerified: false as const,
      ergoAdmissionSigmaPropSatisfied: false as const,
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

export function buildSubstrateFederatedGreenfieldGenerationV1(
  input: Readonly<BuildSubstrateFederatedGreenfieldGenerationV1Input>,
): Readonly<SubstrateFederatedGreenfieldGenerationV1Manifest> {
  exactRecord(input, [
    'launchBaseline',
    'trackerRequest',
    'trackerReceipt',
    'familyTemplates',
    'familyReceipt',
  ], 'federated greenfield generation input');
  assertSubstrateFederatedGreenfieldLaunchBaselineV1Provenance(
    input.launchBaseline,
  );
  const target = deriveSubstrateFederatedGreenfieldTargetDescriptorV1({
    trackerRequest: input.trackerRequest,
    trackerReceipt: input.trackerReceipt,
    familyTemplates: input.familyTemplates,
    familyReceipt: input.familyReceipt,
  });
  if (
    canonicalJson(target)
      !== canonicalJson(input.launchBaseline.statement.target)
  ) {
    throw new Error(
      'greenfield launch baseline target differs from the exact compiler closure',
    );
  }
  const importedReplayDigestHex = fixedHex(
    getDupTreeDigest([]),
    33,
    'greenfield empty duplicate-prevention digest',
  );
  const targetManifest = buildGenerationTarget(
    target,
    importedReplayDigestHex,
  );
  const routeCoverage = input.launchBaseline.statement.routeCoverage;
  const blockers = deepFreeze([
    'greenfield-target-network-consensus-is-not-independently-authenticated',
    'federated-tracker-lineage-is-not-established',
    'federated-duplicate-prevention-lineage-is-not-established',
    'federated-reserve-lineage-is-not-established',
    'federated-genesis-creation-heights-are-not-bound',
    'federated-genesis-output-identities-are-not-bound',
    'federated-profile-is-not-activated',
    'federated-target-node-acceptance-is-not-established',
    'federated-confirmation-is-not-established',
    'federated-funds-authority-is-not-established',
  ] as const);
  const binding = {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_GENERATION_V1_SCHEMA,
    version: 1 as const,
    status: 'authenticated_non_authorizing_greenfield_generation' as const,
    generation: {
      label: 'substrate-federated-greenfield-v1' as const,
      generationIdHex:
        input.launchBaseline.statement.activationGenerationIdHex,
      settlementNetworkId: 'ergo-testnet' as const,
      sourceNetworkScope: 'public-testnet' as const,
      trustModel: 'federated_non_trustless' as const,
    },
    launchBaseline: {
      baselineDigestHex: input.launchBaseline.baselineDigestHex,
      statementDigestHex: input.launchBaseline.statement.statementDigestHex,
      attestationDigestHex:
        input.launchBaseline.statement.attestationDigestHex,
      signatureSetDigestHex: input.launchBaseline.signatureSetDigestHex,
      sourceHistoryDigestHex:
        input.launchBaseline.statement.histories.source.historyDigestHex,
      ergoHistoryDigestHex:
        input.launchBaseline.statement.histories.ergo.historyDigestHex,
      relayerClosureDigestHex:
        input.launchBaseline.statement.histories.relayer.closureDigestHex,
      ergoGenesis: input.launchBaseline.statement.histories.ergo.genesis,
      ergoSetupAnchor:
        input.launchBaseline.statement.histories.ergo.setupAnchor,
    },
    target: targetManifest,
    globalReplay: {
      sourcePacketDigestHex: input.launchBaseline.baselineDigestHex,
      canonicalBurnIdsHex: deepFreeze([] as []),
      canonicalBurnIdCount: 0 as const,
      duplicatePreventionDigestHex: importedReplayDigestHex,
      derivation:
        'empty-from-quorum-authenticated-non-instantiation' as const,
    },
    predecessorRoutes: {
      exactStaticRouteSetDigestHex:
        routeCoverage.staticRequirementsDigestHex,
      boundRouteSetDigestHex: routeCoverage.coverageDigestHex,
      routeCount: routeCoverage.routeCount,
      routes: routeCoverage.routes,
      everyRouteNotInstantiated: true as const,
    },
    blockers,
    checks: {
      sameProcessLaunchBaselineVerified: true as const,
      sameProcessTrackerCompilationVerified: true as const,
      sameProcessFamilyCompilationVerified: true as const,
      exactTargetDescriptorMatchedCompilers: true as const,
      exactStaticPredecessorRouteSetMatched: true as const,
      emptyReplayRootDerivedInternally: true as const,
      emptyReplayClaimAuthenticatedBySourceQuorum: true as const,
      exactTargetGenesisPayloadsBound: true as const,
      migrationArtifactAcceptedAsGreenfieldAuthority: false as const,
      callerNonInstantiationClaimsAccepted: false as const,
    },
    boundaries: {
      greenfieldLaunchBaselineAuthenticated: true as const,
      predecessorRouteNonInstantiationAcceptedUnderFederatedTrust: true as const,
      targetNetworkConsensusIndependentlyAuthenticated: false as const,
      trackerLineageEstablished: false as const,
      duplicatePreventionLineageEstablished: false as const,
      reserveLineageEstablished: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      confirmationEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const manifest = deepFreeze({
    ...binding,
    manifestDigestHex: sha256CanonicalJson(binding, GENERATION_DIGEST_DOMAIN),
  });
  generationManifests.add(manifest);
  return manifest;
}

export function assertSubstrateFederatedGreenfieldLaunchBaselineV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGreenfieldLaunchBaselineV1> {
  if (
    value === null
    || typeof value !== 'object'
    || !launchBaselines.has(value)
  ) {
    throw new Error(
      'federated greenfield launch baseline was not built in this process',
    );
  }
}

export function assertSubstrateFederatedGreenfieldGenerationV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGreenfieldGenerationV1Manifest> {
  if (
    value === null
    || typeof value !== 'object'
    || !generationManifests.has(value)
  ) {
    throw new Error(
      'federated greenfield generation was not built in this process',
    );
  }
}

function assertCompilerClosure(
  input: Readonly<DeriveSubstrateFederatedGreenfieldTargetDescriptorV1Input>,
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
  family: ReturnType<
    typeof decodeSubstrateFederatedSettlementFamilyV1Profile
  >,
): void {
  const pairs: readonly (readonly [unknown, unknown, string])[] = [
    [family.trackerNftIdHex, tracker.trackerNftIdHex, 'tracker NFT ID'],
    [family.sourceNetworkIdHex, tracker.application.sourceNetworkIdHex,
      'source network ID'],
    [family.sidechainIdHex, tracker.application.sidechainIdHex, 'sidechain ID'],
    [family.bridgeAddressHex, tracker.application.bridgeAddressHex,
      'bridge address'],
    [family.tokenAddressHex, tracker.application.tokenAddressHex,
      'token address'],
    [family.runtimeProfileIdHex, tracker.application.runtimeProfileIdHex,
      'runtime profile ID'],
    [family.settlementProfileIdHex,
      tracker.application.settlementProfileIdHex, 'settlement profile ID'],
    [family.federationProfileIdHex, tracker.profile.profileIdHex,
      'federation profile ID'],
    [family.sourceAttestationKeySetDigestHex,
      tracker.profile.sourceAttestationKeySetDigestHex,
      'source-attestation key-set digest'],
    [family.sourceAttestationThreshold,
      tracker.profile.sourceAttestationThreshold,
      'source-attestation threshold'],
    [family.ergoAdmissionKeySetDigestHex,
      tracker.profile.ergoAdmissionKeySetDigestHex,
      'Ergo-admission key-set digest'],
    [family.ergoAdmissionThreshold, tracker.profile.ergoAdmissionThreshold,
      'Ergo-admission threshold'],
    [family.federationEpoch, tracker.profile.federationEpoch,
      'federation epoch'],
  ];
  for (const [left, right, label] of pairs) {
    if (left !== right) {
      throw new Error(
        `greenfield target ${label} differs across tracker and family compilers`,
      );
    }
  }
}

function buildRouteCoverage(
  sourceHistoryDigestHex: string,
  ergoHistoryDigestHex: string,
  relayerClosureDigestHex: string,
): SubstrateFederatedGreenfieldLaunchStatementV1['routeCoverage'] {
  const requirements = [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6]
    .sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  const routes = requirements.map(requirement => {
    const component = requirement.layer === 'frontier'
      ? 'source-genesis-history' as const
      : requirement.layer === 'ergo'
        ? 'ergo-genesis-history' as const
        : 'shipped-relayer-closure' as const;
    const evidenceDigestHex = requirement.layer === 'frontier'
      ? sourceHistoryDigestHex
      : requirement.layer === 'ergo'
        ? ergoHistoryDigestHex
        : relayerClosureDigestHex;
    return deepFreeze({
      ...requirement,
      evidenceComponent: component,
      evidenceDigestHex: fixedHex(
        evidenceDigestHex,
        32,
        `${requirement.routeId} greenfield evidence digest`,
      ),
      disposition: 'not-instantiated' as const,
    });
  });
  const counts = {
    frontierRouteCount: routes.filter(route => route.layer === 'frontier').length,
    ergoRouteCount: routes.filter(route => route.layer === 'ergo').length,
    relayerRouteCount: routes.filter(route => route.layer === 'relayer').length,
  };
  if (
    routes.length !== 53
    || counts.frontierRouteCount === 0
    || counts.ergoRouteCount === 0
    || counts.relayerRouteCount === 0
    || counts.frontierRouteCount + counts.ergoRouteCount
      + counts.relayerRouteCount !== routes.length
  ) {
    throw new Error('greenfield predecessor route coverage is incomplete');
  }
  return deepFreeze({
    staticRequirementsDigestHex: sha256CanonicalJson(
      requirements,
      ROUTE_REQUIREMENTS_DIGEST_DOMAIN,
    ),
    coverageDigestHex: sha256CanonicalJson(
      routes,
      ROUTE_COVERAGE_DIGEST_DOMAIN,
    ),
    routeCount: routes.length,
    ...counts,
    routes,
  });
}

function normalizeAndVerifySignatures(
  raw: readonly Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>[],
  statement: Readonly<SubstrateFederatedGreenfieldLaunchStatementV1>,
): readonly Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>[] {
  if (!Array.isArray(raw)) {
    throw new Error('greenfield launch signatures must be an array');
  }
  const federation = statement.target.federation;
  if (raw.length !== federation.sourceAttestationThreshold) {
    throw new Error(
      'greenfield launch baseline requires the exact source-attestation threshold',
    );
  }
  const registered = new Set(federation.sourceAttestationPublicKeysHex);
  const signatures = raw.map((value, index) => {
    exactRecord(value, [
      'signerPublicKeyHex',
      'signatureHex',
    ], `greenfield launch signature ${index}`);
    return {
      signerPublicKeyHex: fixedHex(
        value.signerPublicKeyHex,
        32,
        `greenfield launch signature ${index} public key`,
      ),
      signatureHex: fixedHex(
        value.signatureHex,
        64,
        `greenfield launch signature ${index} bytes`,
        true,
      ),
    };
  });
  for (const [index, signature] of signatures.entries()) {
    if (!registered.has(signature.signerPublicKeyHex)) {
      throw new Error('greenfield launch signature key is not registered');
    }
    if (
      index > 0
      && signatures[index - 1]!.signerPublicKeyHex
        >= signature.signerPublicKeyHex
    ) {
      throw new Error(
        'greenfield launch signatures must be strictly sorted and unique',
      );
    }
    verifyEd25519Signature(
      signature,
      statement.attestationDigestHex,
    );
  }
  return deepFreeze(signatures);
}

function verifyEd25519Signature(
  signature: Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>,
  attestationDigestHex: string,
): void {
  const rawPublicKey = Buffer.from(signature.signerPublicKeyHex, 'hex');
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
      format: 'der',
      type: 'spki',
    });
  } catch (error) {
    throw new Error('greenfield launch public key is invalid', { cause: error });
  }
  if (!verifySignature(
    null,
    Buffer.from(attestationDigestHex, 'hex'),
    publicKey,
    Buffer.from(signature.signatureHex, 'hex'),
  )) {
    throw new Error('greenfield launch signature is invalid');
  }
}

function buildGenerationTarget(
  descriptor: Readonly<SubstrateFederatedGreenfieldTargetDescriptorV1>,
  importedReplayDigestHex: string,
): SubstrateFederatedGreenfieldGenerationV1Manifest['target'] {
  const emptyTrackerDigestHex = fixedHex(
    getSubstrateFederatedTrackerDigestV1Hex([]),
    33,
    'greenfield empty tracker digest',
  );
  const emptyDepositDigestHex = fixedHex(
    getPooledReserveEmptyDigest(),
    33,
    'greenfield empty deposit digest',
  );
  const lineages = descriptor.lineages;
  const tracker = targetGenesisPayload(
    'tracker',
    lineages.tracker.propositionHex,
    lineages.tracker.singletonTokenIdHex,
    {
      R4: encodeCollByteRegister(Buffer.from(
        descriptor.federation.federationProfileIdHex,
        'hex',
      )),
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyTrackerDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        370,
      ),
      R6: encodeCollByteRegister(Buffer.from(
        descriptor.sourceRuntime.sidechainIdHex,
        'hex',
      )),
      R7: encodeLongRegister(0n),
      R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from(
        descriptor.federation.ergoAdmissionKeySetDigestHex,
        'hex',
      )),
    },
  );
  const familyRegister = encodeCollByteRegister(Buffer.from(
    descriptor.profile.familyIdHex,
    'hex',
  ));
  const duplicatePrevention = targetGenesisPayload(
    'duplicate-prevention',
    lineages.duplicatePrevention.propositionHex,
    lineages.duplicatePrevention.singletonTokenIdHex,
    {
      R4: familyRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(importedReplayDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        1,
      ),
    },
  );
  const pooledReserve = targetGenesisPayload(
    'pooled-reserve',
    lineages.pooledReserve.propositionHex,
    lineages.pooledReserve.singletonTokenIdHex,
    {
      R4: familyRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyDepositDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        32,
      ),
      R6: encodeLongRegister(0n),
    },
  );
  const payloadSet = { tracker, duplicatePrevention, pooledReserve };
  const genesisPayloads = deepFreeze({
    schema:
      'e2s.substrate-federated-greenfield-genesis-payloads.v1' as const,
    version: 1 as const,
    payloadSetDigestHex: sha256CanonicalJson(
      payloadSet,
      GENESIS_PAYLOAD_SET_DIGEST_DOMAIN,
    ),
    importedReplayDigestHex,
    emptyTrackerDigestHex,
    emptyDepositDigestHex,
    ...payloadSet,
    creationHeightsBoundAtMaterialization: false as const,
    outputIdsBoundAtMaterialization: false as const,
  });
  return deepFreeze({
    compilerClosureDigestHex: sha256CanonicalJson(
      descriptor.compiler,
      TARGET_DESCRIPTOR_DIGEST_DOMAIN,
    ),
    profile: descriptor.profile,
    sourceRuntime: descriptor.sourceRuntime,
    federation: {
      federationProfileIdHex:
        descriptor.federation.federationProfileIdHex,
      federationEpoch: descriptor.federation.federationEpoch,
      sourceAttestationKeySetDigestHex:
        descriptor.federation.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold:
        descriptor.federation.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex:
        descriptor.federation.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold:
        descriptor.federation.ergoAdmissionThreshold,
      ergoAdmissionPublicKeysHex:
        descriptor.federation.ergoAdmissionPublicKeysHex,
    },
    lineages,
    genesisPayloads,
  });
}

function targetGenesisPayload(
  role: TargetGenesisPayloadV1['role'],
  ergoTreeHex: string,
  singletonTokenIdHex: string,
  additionalRegisters: Readonly<Record<string, string>>,
): Readonly<TargetGenesisPayloadV1> {
  const body = {
    role,
    valueNanoErg: GENESIS_SINGLETON_VALUE_NANOERG,
    ergoTreeHex: variableHex(ergoTreeHex, `${role} genesis ErgoTree`),
    assets: deepFreeze([{
      tokenId: fixedHex(
        singletonTokenIdHex,
        32,
        `${role} genesis singleton token ID`,
      ),
      amount: '1' as const,
    }]),
    additionalRegisters: deepFreeze({ ...additionalRegisters }),
  };
  return deepFreeze({
    ...body,
    payloadDigestHex: sha256CanonicalJson(body, GENESIS_PAYLOAD_DIGEST_DOMAIN),
  });
}

function assertTargetDescriptor(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGreenfieldTargetDescriptorV1> {
  if (
    value === null
    || typeof value !== 'object'
    || !targetDescriptors.has(value)
  ) {
    throw new Error('greenfield target descriptor lacks process provenance');
  }
}

function assertSourceHistory(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGreenfieldSourceHistoryV1> {
  if (value === null || typeof value !== 'object' || !sourceHistories.has(value)) {
    throw new Error('greenfield source history lacks process provenance');
  }
}

function assertErgoHistory(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGreenfieldErgoHistoryV1> {
  if (value === null || typeof value !== 'object' || !ergoHistories.has(value)) {
    throw new Error('greenfield Ergo history lacks process provenance');
  }
}

function assertRelayerClosure(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGreenfieldRelayerClosureV1> {
  if (value === null || typeof value !== 'object' || !relayerClosures.has(value)) {
    throw new Error('greenfield relayer closure lacks process provenance');
  }
}

function assertLaunchStatement(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGreenfieldLaunchStatementV1> {
  if (value === null || typeof value !== 'object' || !launchStatements.has(value)) {
    throw new Error('greenfield launch statement lacks process provenance');
  }
}

function normalizeSourceRuntime(
  application: Readonly<
    SubstrateFederatedTrackerCompilerRequestV1['application']
  >,
): SubstrateFederatedGreenfieldTargetDescriptorV1['sourceRuntime'] {
  return deepFreeze({
    sourceNetworkIdHex: fixedHex(
      application.sourceNetworkIdHex,
      32,
      'greenfield source network ID',
    ),
    sidechainIdHex: fixedHex(
      application.sidechainIdHex,
      32,
      'greenfield sidechain ID',
    ),
    bridgeAddressHex: fixedHex(
      application.bridgeAddressHex,
      20,
      'greenfield bridge address',
    ),
    tokenAddressHex: fixedHex(
      application.tokenAddressHex,
      20,
      'greenfield token address',
    ),
    bridgeRuntimeCodeSha256Hex: fixedHex(
      application.bridgeRuntimeCodeSha256Hex,
      32,
      'greenfield bridge runtime digest',
    ),
    bridgeRuntimeCodeBytes: positiveInteger(
      application.bridgeRuntimeCodeBytes,
      'greenfield bridge runtime length',
    ),
    tokenRuntimeCodeSha256Hex: fixedHex(
      application.tokenRuntimeCodeSha256Hex,
      32,
      'greenfield token runtime digest',
    ),
    tokenRuntimeCodeBytes: positiveInteger(
      application.tokenRuntimeCodeBytes,
      'greenfield token runtime length',
    ),
    sourceRuntimeCodeSha256Hex: fixedHex(
      application.sourceRuntimeCodeSha256Hex,
      32,
      'greenfield source runtime digest',
    ),
    sourceRuntimeCodeBytes: positiveInteger(
      application.sourceRuntimeCodeBytes,
      'greenfield source runtime length',
    ),
    runtimeProfileIdHex: fixedHex(
      application.runtimeProfileIdHex,
      32,
      'greenfield runtime profile ID',
    ),
  });
}

function contractArtifact(
  contract: Readonly<{
    readonly contractIdHex: string;
    readonly resolvedSourceSha256Hex: string;
    readonly propositionBytes: number;
    readonly propositionSha256Hex: string;
    readonly propositionHex: string;
  }>,
  label: string,
): Readonly<TargetContractArtifactV1> {
  return deepFreeze({
    contractIdHex: fixedHex(
      contract.contractIdHex,
      32,
      `${label} contract ID`,
    ),
    resolvedSourceSha256Hex: fixedHex(
      contract.resolvedSourceSha256Hex,
      32,
      `${label} resolved-source digest`,
    ),
    propositionBytes: positiveInteger(
      contract.propositionBytes,
      `${label} proposition length`,
    ),
    propositionSha256Hex: fixedHex(
      contract.propositionSha256Hex,
      32,
      `${label} proposition digest`,
    ),
    propositionHex: variableHex(
      contract.propositionHex,
      `${label} proposition bytes`,
    ),
  });
}

function byteArtifact(value: Uint8Array, label: string): Readonly<ByteArtifactV1> {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`${label} must be bytes`);
  }
  const bytes = Buffer.from(value);
  if (bytes.length === 0 || bytes.length > MAX_MANIFEST_BYTES) {
    throw new Error(`${label} size is outside the bounded manifest limit`);
  }
  return deepFreeze({
    sha256Hex: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
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
  const normalizedActual = (actual as string[]).sort(compareCodeUnits);
  const normalizedExpected = [...keys].sort(compareCodeUnits);
  if (canonicalJson(normalizedActual) !== canonicalJson(normalizedExpected)) {
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
  if (normalized.some(
    (value, index) => index > 0 && normalized[index - 1]! >= value,
  )) {
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
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
    || (!allowZero && /^0+$/.test(value))
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase whole-byte hex`);
  }
  return value;
}

function commitHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{40}$/.test(value)
    || /^0+$/.test(value)
  ) {
    throw new Error(`${label} must be one nonzero lowercase 40-hex commit`);
  }
  return value;
}

function canonicalUint64(value: unknown, label: string): string {
  const normalized = typeof value === 'bigint'
    ? value.toString()
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : value;
  if (typeof normalized !== 'string' || !/^(0|[1-9][0-9]*)$/.test(normalized)) {
    throw new Error(`${label} must be a canonical unsigned decimal`);
  }
  const parsed = BigInt(normalized);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds uint64`);
  }
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value as Readonly<T>;
  }
  seen.add(value as object);
  for (const child of Object.values(value as object)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
