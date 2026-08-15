import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import {
  isAbsolute,
  posix,
  relative,
  resolve,
} from 'node:path';
import type ts from 'typescript';

import {
  assertAuthorityBoundDeploymentLineageProvenance,
  type AuthorityBoundDeploymentLineageCandidate,
} from './authority-bound-deployment-lineage.js';
import {
  assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance,
  type PooledReserveMintReservationRuntimeProfileV4Candidate,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  assertDeploymentIdentityCandidateProvenance,
  loadTrackedDeploymentIdentityArtifactProfile,
  type DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import {
  INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_DIGEST_HEX,
} from './reviewed-deployment-lineage-profiles.js';
import {
  canonicalJson,
  parseStrictJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
  type LegacyRouteRetirementRequirementV4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';

export const FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_SCHEMA =
  'e2s.frontier-relayer-compatibility-authority-inventory.v4' as const;
export const FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_STATUS =
  'blocked_non_authorizing_inventory_candidate' as const;
export const FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_DIGEST_DOMAIN =
  'E2S_FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4' as const;

const MAX_STATIC_SOURCE_BYTES = 16 * 1024 * 1024;
const ZERO_ADDRESS = `0x${'00'.repeat(20)}`;
const PACKETS = new WeakSet<object>();
let TYPESCRIPT_PARSER: typeof import('typescript') | null = null;

export type CompatibilitySourcePresenceV4 =
  | 'reviewed-source-present'
  | 'tracked-artifact-present'
  | 'source-absent';
export type CompatibilityTargetObservationV4 =
  | 'not-observed'
  | 'exact-state-observed'
  | 'source-disagreement';
export type CompatibilityReachabilityV4 =
  | 'unknown'
  | 'reachable-at-exact-state'
  | 'disabled-at-exact-state';
export type CompatibilityHistoryV4 =
  | 'unproved'
  | 'bounded-rpc-corroborated'
  | 'finalized-exact-state-only';
export type CompatibilityRetirementV4 =
  | 'required'
  | 'candidate-only'
  | 'blocked-external-evidence';
export type LocalCapabilityConfigurationObservationV4 =
  | 'not-observed'
  | 'enabled'
  | 'disabled';

export type FrontierRelayerCompatibilityRouteClassV4 =
  | 'owner-mint'
  | 'fee-withdrawal'
  | 'state-update'
  | 'pause-control'
  | 'bridge-burn'
  | 'bridge-withdrawal'
  | 'authority-mutation'
  | 'commitment-producer'
  | 'runtime-entrypoint';

export interface FrontierRelayerCompatibilityRouteRequirementV4 {
  readonly routeId: string;
  readonly layer: 'frontier' | 'relayer';
  readonly routeClass: FrontierRelayerCompatibilityRouteClassV4;
  readonly sourceSurface: string;
  readonly historicalAuthority:
    | 'owner-key'
    | 'token-owner-key'
    | 'root-origin'
    | 'selected-bridge-address'
    | 'permissionless-caller'
    | 'local-runtime-capability';
  readonly requiredDisposition:
    | 'disable-authority'
    | 'freeze-authority'
    | 'application-bind-or-remove'
    | 'remove-runtime-capability';
}

export interface FrontierRelayerCompatibilityRouteObservationV4
  extends FrontierRelayerCompatibilityRouteRequirementV4 {
  readonly sourcePresence: CompatibilitySourcePresenceV4;
  readonly targetObservation: CompatibilityTargetObservationV4;
  readonly reachability: CompatibilityReachabilityV4;
  readonly history: CompatibilityHistoryV4;
  readonly retirement: CompatibilityRetirementV4;
  readonly configurationObservation:
    | LocalCapabilityConfigurationObservationV4
    | 'not-applicable';
  readonly configurationRetirementEffect: 'none';
  readonly blockers: readonly string[];
}

export interface BuildFrontierRelayerCompatibilityAuthorityInventoryV4Input {
  readonly bridgeRoot: string;
  readonly deploymentIdentity:
    Readonly<DeploymentIdentityCandidate>;
  readonly deploymentLineage:
    Readonly<AuthorityBoundDeploymentLineageCandidate>;
  readonly runtimeProfile:
    Readonly<PooledReserveMintReservationRuntimeProfileV4Candidate>;
  readonly configurationObservation: Readonly<{
    sidechainBroadcast:
      LocalCapabilityConfigurationObservationV4;
    legacyAggregateSettlement:
      LocalCapabilityConfigurationObservationV4;
  }>;
}

export interface FrontierRelayerCompatibilityAuthorityInventoryV4 {
  readonly schema:
    typeof FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_SCHEMA;
  readonly version: 4;
  readonly status:
    typeof FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_STATUS;
  readonly packetDigestHex: string;
  readonly sourceClosure: Readonly<{
    artifactProfileDigestHex: string;
    buildManifestSha256Hex: string;
    routeInventoryDigestHex: string;
    files: readonly Readonly<{
      path: string;
      sha256Hex: string;
      sizeBytes: number;
    }>[];
    absentFiles: readonly string[];
    sourceClosureDigestHex: string;
  }>;
  readonly observations: Readonly<{
    deploymentIdentityCandidateDigestHex: string;
    deploymentLineageCandidateDigestHex: string;
    runtimeProfileCandidateDigestHex: string;
    reviewedDeploymentLineageProfileDigestHex: string;
    reviewedDeploymentLineageProfile:
      | 'inert-conformance-profile'
      | 'reviewed-non-inert-profile';
    runtimeActivationHeight: string;
    runtimeActivation:
      | 'zero-height-candidate'
      | 'nonzero-unactivated-candidate';
    networkScope: string;
    chainId: string;
    tipHeight: string;
    tipHashHex: string;
    bridgeAddress: string;
    tokenAddress: string;
    bridgeOwnerAddress: string;
    tokenOwnerAddress: string;
    boundedLineageStartHeight: string;
    boundedLineageTerminalHeight: string;
    boundedLineageTerminalExecutionBlockHashHex: string;
  }>;
  readonly configurationObservation: Readonly<{
    source: 'caller-supplied-non-authorizing-observation';
    sidechainBroadcast: LocalCapabilityConfigurationObservationV4;
    legacyAggregateSettlement:
      LocalCapabilityConfigurationObservationV4;
    retirementEffect: 'none';
  }>;
  readonly routes: readonly FrontierRelayerCompatibilityRouteObservationV4[];
  readonly checks: Readonly<{
    sameProcessDeploymentIdentityVerified: true;
    sameProcessDeploymentLineageVerified: true;
    sameProcessRuntimeProfileVerified: true;
    currentTrackedArtifactClosureMatched: true;
    exactCandidateBindingsMatched: true;
    exactStaticRouteInventoryVerified: true;
    everyRouteSourceSurfaceBound: true;
    exactAbiCapabilitiesVerified: true;
    rootMutationAndV1ProducerSeparated: true;
    relayerSourceCapabilitiesVerified: true;
    callerRetirementClaimsAccepted: false;
    configurationCanRetireCapability: false;
  }>;
  readonly blockers: readonly string[];
  readonly authority: Readonly<{
    inventoryAuthoritative: false;
    legacyRouteInventoryAuthenticated: false;
    legacyRouteRetirementAuthenticated: false;
    cutoverComplete: false;
    profileActivated: false;
    targetNodeAcceptanceEstablished: false;
    mintAuthorized: false;
    payoutAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    trustlessStatusEstablished: false;
    productionReadinessEstablished: false;
    releaseReadinessEstablished: false;
  }>;
}

export const FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4:
readonly FrontierRelayerCompatibilityRouteRequirementV4[] = deepFreeze(
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
    .filter(requirement =>
      requirement.layer === 'frontier' || requirement.layer === 'relayer'
    )
    .map(exactFrontierRelayerRequirement),
);

assertExactFrontierRelayerCompatibilityRouteInventoryV4(
  FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
);

export function assertExactFrontierRelayerCompatibilityRouteInventoryV4(
  value: unknown,
): asserts value is readonly FrontierRelayerCompatibilityRouteRequirementV4[] {
  if (!Array.isArray(value)) {
    throw new Error('Frontier/relayer compatibility route inventory must be an array');
  }
  if (
    canonicalJson(value)
      !== canonicalJson(FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4)
  ) {
    throw new Error(
      'Frontier/relayer compatibility route inventory must enumerate every exact route',
    );
  }
  const routeIds = value.map(candidate => {
    const record = exactRecord(candidate, [
      'historicalAuthority',
      'layer',
      'requiredDisposition',
      'routeClass',
      'routeId',
      'sourceSurface',
    ], 'Frontier/relayer compatibility route');
    return stringValue(record.routeId, 'Frontier/relayer compatibility route ID');
  });
  if (new Set(routeIds).size !== routeIds.length) {
    throw new Error('Frontier/relayer compatibility route IDs must be unique');
  }
}

export function buildFrontierRelayerCompatibilityAuthorityInventoryV4(
  input: BuildFrontierRelayerCompatibilityAuthorityInventoryV4Input,
): Readonly<FrontierRelayerCompatibilityAuthorityInventoryV4> {
  exactRecord(input, [
    'bridgeRoot',
    'configurationObservation',
    'deploymentIdentity',
    'deploymentLineage',
    'runtimeProfile',
  ], 'Frontier/relayer compatibility inventory input');
  assertDeploymentIdentityCandidateProvenance(input.deploymentIdentity);
  assertAuthorityBoundDeploymentLineageProvenance(input.deploymentLineage);
  assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
    input.runtimeProfile,
  );
  const configuration = normalizeConfigurationObservation(
    input.configurationObservation,
  );
  assertAllFalse(input.deploymentIdentity.authority, 'deployment identity authority');
  assertAllFalse(input.deploymentLineage.authority, 'deployment lineage authority');
  assertAllFalse(input.runtimeProfile.authority, 'runtime profile authority');

  const currentArtifactProfile =
    loadTrackedDeploymentIdentityArtifactProfile(input.bridgeRoot);
  assertCandidateBindings(
    input.deploymentIdentity,
    input.deploymentLineage,
    input.runtimeProfile,
    currentArtifactProfile,
  );
  const sourceClosure = buildStaticSourceClosure(
    input.bridgeRoot,
    currentArtifactProfile.profileDigestHex,
    currentArtifactProfile.buildManifestSha256Hex,
  );
  const activationHeight = canonicalUint64(
    input.runtimeProfile.profile.activationHeight,
    'runtime profile activation height',
  );
  const inertLineage =
    input.deploymentLineage.reviewedProfileDigestHex
      === INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_DIGEST_HEX;
  const bridgeOwnerActive =
    input.deploymentIdentity.view.bridgeOwnerAddress !== ZERO_ADDRESS;
  const routes = deepFreeze(
    FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4.map(requirement =>
      observeRoute({
        requirement,
        bridgeOwnerActive,
        configuration,
      })
    ),
  );
  const blockers = deepFreeze([
    ...(activationHeight === '0'
      ? ['v4-activation-height-is-zero']
      : []),
    ...(inertLineage
      ? ['deployment-lineage-profile-is-inert-conformance-only']
      : []),
    'target-runtime-activation-is-not-observed',
    'legacy-route-retirement-evidence-is-not-authenticated',
    'historical-receipt-state-proof-completeness-is-not-proved',
    'fee-withdrawal-history-is-not-authenticated',
    'v1-commitment-producer-application-binding-is-not-authenticated',
    'relayer-runtime-capability-removal-is-not-authenticated',
  ]);
  const checks = deepFreeze({
    sameProcessDeploymentIdentityVerified: true as const,
    sameProcessDeploymentLineageVerified: true as const,
    sameProcessRuntimeProfileVerified: true as const,
    currentTrackedArtifactClosureMatched: true as const,
    exactCandidateBindingsMatched: true as const,
    exactStaticRouteInventoryVerified: true as const,
    everyRouteSourceSurfaceBound: true as const,
    exactAbiCapabilitiesVerified: true as const,
    rootMutationAndV1ProducerSeparated: true as const,
    relayerSourceCapabilitiesVerified: true as const,
    callerRetirementClaimsAccepted: false as const,
    configurationCanRetireCapability: false as const,
  });
  const authority = deepFreeze({
    inventoryAuthoritative: false as const,
    legacyRouteInventoryAuthenticated: false as const,
    legacyRouteRetirementAuthenticated: false as const,
    cutoverComplete: false as const,
    profileActivated: false as const,
    targetNodeAcceptanceEstablished: false as const,
    mintAuthorized: false as const,
    payoutAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
    releaseReadinessEstablished: false as const,
  });
  const observations = deepFreeze({
    deploymentIdentityCandidateDigestHex:
      input.deploymentIdentity.candidateDigestHex,
    deploymentLineageCandidateDigestHex:
      input.deploymentLineage.candidateDigestHex,
    runtimeProfileCandidateDigestHex:
      input.runtimeProfile.candidateDigestHex,
    reviewedDeploymentLineageProfileDigestHex:
      input.deploymentLineage.reviewedProfileDigestHex,
    reviewedDeploymentLineageProfile: inertLineage
      ? 'inert-conformance-profile' as const
      : 'reviewed-non-inert-profile' as const,
    runtimeActivationHeight: activationHeight,
    runtimeActivation: activationHeight === '0'
      ? 'zero-height-candidate' as const
      : 'nonzero-unactivated-candidate' as const,
    networkScope: input.deploymentIdentity.view.declaredNetworkScope,
    chainId: input.deploymentIdentity.view.chainId,
    tipHeight: input.deploymentIdentity.view.tipHeight,
    tipHashHex: input.deploymentIdentity.view.tipHashHex,
    bridgeAddress: input.deploymentIdentity.view.bridgeAddress,
    tokenAddress: input.deploymentIdentity.view.tokenAddress,
    bridgeOwnerAddress: input.deploymentIdentity.view.bridgeOwnerAddress,
    tokenOwnerAddress: input.deploymentIdentity.view.tokenOwnerAddress,
    boundedLineageStartHeight: input.deploymentLineage.interval.startHeight,
    boundedLineageTerminalHeight:
      input.deploymentLineage.interval.terminalHeight,
    boundedLineageTerminalExecutionBlockHashHex:
      input.deploymentLineage.interval.terminalExecutionBlockHashHex,
  });
  const configurationObservation = deepFreeze({
    source: 'caller-supplied-non-authorizing-observation' as const,
    ...configuration,
    retirementEffect: 'none' as const,
  });
  const binding = {
    schema: FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_SCHEMA,
    version: 4 as const,
    status: FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_STATUS,
    sourceClosure,
    observations,
    configurationObservation,
    routes,
    checks,
    blockers,
    authority,
  } as const;
  const packet = deepFreeze({
    ...binding,
    packetDigestHex: `0x${sha256CanonicalJson(
      binding,
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_DIGEST_DOMAIN,
    )}`,
  }) as Readonly<FrontierRelayerCompatibilityAuthorityInventoryV4>;
  PACKETS.add(packet);
  return packet;
}

export function assertFrontierRelayerCompatibilityAuthorityInventoryV4Provenance(
  value: unknown,
): asserts value is Readonly<
  FrontierRelayerCompatibilityAuthorityInventoryV4
> {
  if (!value || typeof value !== 'object' || !PACKETS.has(value)) {
    throw new Error(
      'Frontier/relayer compatibility authority inventory provenance is missing',
    );
  }
}

function observeRoute(input: {
  requirement: FrontierRelayerCompatibilityRouteRequirementV4;
  bridgeOwnerActive: boolean;
  configuration: Readonly<{
    sidechainBroadcast: LocalCapabilityConfigurationObservationV4;
    legacyAggregateSettlement: LocalCapabilityConfigurationObservationV4;
  }>;
}): FrontierRelayerCompatibilityRouteObservationV4 {
  const { requirement } = input;
  const isRelayer = requirement.layer === 'relayer';
  const isBridgeOwnerRoute =
    requirement.historicalAuthority === 'owner-key';
  const isTokenMint =
    requirement.routeId === 'frontier-serg-owner-mint-v1';
  const isTokenOwnershipMutation =
    requirement.historicalAuthority === 'token-owner-key'
      && requirement.routeClass === 'authority-mutation';
  const isTokenBridgeBurn =
    requirement.routeClass === 'bridge-burn';
  const isBridgeWithdrawal =
    requirement.routeClass === 'bridge-withdrawal';
  const isRuntimeConfigurationMutation =
    requirement.routeId === 'frontier-root-bridge-address-mutation-v1';
  const isRetiredRelayerOwnerMint =
    requirement.routeId === 'relayer-owner-mint-entrypoint-v1';
  const isRetiredRelayerLegacySettlement =
    requirement.routeId === 'relayer-legacy-settlement-entrypoint-v1';
  const isRetiredRelayerStateUpdater =
    requirement.routeId === 'relayer-side-chain-state-updater-v1';
  const isRetiredRelayerRuntime =
    isRetiredRelayerOwnerMint
      || isRetiredRelayerLegacySettlement
      || isRetiredRelayerStateUpdater;
  const exactOwnerReachability =
    isBridgeOwnerRoute || isTokenMint
      ? input.bridgeOwnerActive
        ? 'reachable-at-exact-state' as const
        : 'disabled-at-exact-state' as const
      : 'unknown' as const;
  const reachability = isRetiredRelayerRuntime
    ? 'disabled-at-exact-state' as const
    : isTokenOwnershipMutation
    ? 'unknown' as const
    : isTokenBridgeBurn || isBridgeWithdrawal
      ? 'reachable-at-exact-state' as const
    : exactOwnerReachability;
  const configurationObservation = requirement.routeId
    === 'relayer-owner-mint-entrypoint-v1'
    ? input.configuration.sidechainBroadcast
    : requirement.routeId === 'relayer-legacy-settlement-entrypoint-v1'
      ? input.configuration.legacyAggregateSettlement
      : 'not-applicable' as const;
  const retirement = isRetiredRelayerRuntime
    ? 'candidate-only' as const
    : isRelayer
      || requirement.routeClass === 'commitment-producer'
      || requirement.routeClass === 'bridge-burn'
      || requirement.routeClass === 'bridge-withdrawal'
      || isRuntimeConfigurationMutation
      || isTokenOwnershipMutation
    ? 'blocked-external-evidence' as const
    : reachability === 'disabled-at-exact-state'
      ? 'candidate-only' as const
      : 'required' as const;
  return deepFreeze({
    ...requirement,
    sourcePresence: isRetiredRelayerRuntime
      ? 'source-absent' as const
      : requirement.sourceSurface.includes('/compiled/')
      ? 'tracked-artifact-present' as const
      : 'reviewed-source-present' as const,
    targetObservation: requirement.layer === 'frontier'
      && !requirement.sourceSurface.startsWith('sources/frontier/')
      ? 'exact-state-observed' as const
      : 'not-observed' as const,
    reachability,
    history: requirement.layer === 'frontier'
      && !requirement.sourceSurface.startsWith('sources/frontier/')
      ? 'bounded-rpc-corroborated' as const
      : 'unproved' as const,
    retirement,
    configurationObservation,
    configurationRetirementEffect: 'none' as const,
    blockers: routeBlockers(requirement, retirement),
  });
}

function routeBlockers(
  requirement: FrontierRelayerCompatibilityRouteRequirementV4,
  retirement: CompatibilityRetirementV4,
): readonly string[] {
  const blockers = [
    ...(retirement === 'candidate-only'
      && requirement.layer !== 'relayer'
      ? ['exact-state-disablement-is-not-route-retirement']
      : []),
    ...(requirement.routeClass === 'fee-withdrawal'
      ? ['fee-withdrawal-history-is-not-authenticated']
      : []),
    ...(requirement.routeClass === 'commitment-producer'
      ? ['v1-statement-does-not-bind-reviewed-application-identity']
      : []),
    ...(requirement.routeClass === 'bridge-burn'
      ? ['legacy-token-burn-application-binding-is-not-authenticated']
      : []),
    ...(requirement.routeClass === 'bridge-withdrawal'
      ? ['legacy-pegout-application-binding-is-not-authenticated']
      : []),
    ...(requirement.routeId === 'frontier-root-bridge-address-mutation-v1'
      ? ['activated-runtime-configuration-is-not-observed']
      : []),
    ...(requirement.layer === 'relayer'
      ? ['relayer-runtime-capability-removal-is-not-authenticated']
      : []),
  ];
  return deepFreeze(blockers);
}

function assertCandidateBindings(
  identity: Readonly<DeploymentIdentityCandidate>,
  lineage: Readonly<AuthorityBoundDeploymentLineageCandidate>,
  runtime: Readonly<PooledReserveMintReservationRuntimeProfileV4Candidate>,
  artifact: ReturnType<typeof loadTrackedDeploymentIdentityArtifactProfile>,
): void {
  if (
    identity.view.artifactProfileDigestHex !== artifact.profileDigestHex
    || identity.view.buildManifestSha256Hex
      !== artifact.buildManifestSha256Hex
  ) {
    throw new Error(
      'deployment identity does not match the current tracked artifact closure',
    );
  }
  if (
    identity.view.bridgeRuntimeBytecodeSha256Hex
      !== artifact.bridge.runtimeBytecodeSha256Hex
    || identity.view.bridgeRuntimeByteLength
      !== artifact.bridge.runtimeByteLength
    || identity.view.tokenRuntimeBytecodeSha256Hex
      !== artifact.token.runtimeBytecodeSha256Hex
    || identity.view.tokenRuntimeByteLength
      !== artifact.token.runtimeByteLength
  ) {
    throw new Error(
      'deployment identity runtime code does not match the current tracked artifacts',
    );
  }
  if (
    lineage.deploymentIdentityCandidateDigestHex
      !== identity.candidateDigestHex
    || lineage.artifactProfileDigestHex
      !== identity.view.artifactProfileDigestHex
  ) {
    throw new Error(
      'deployment lineage does not bind the exact deployment identity candidate',
    );
  }
  if (
    lineage.deployments.bridge.address !== identity.view.bridgeAddress
    || lineage.deployments.token.address !== identity.view.tokenAddress
    || lineage.deployments.bridge.runtimeBytecodeSha256Hex
      !== identity.view.bridgeRuntimeBytecodeSha256Hex
    || lineage.deployments.token.runtimeBytecodeSha256Hex
      !== identity.view.tokenRuntimeBytecodeSha256Hex
  ) {
    throw new Error(
      'deployment lineage contract bindings do not match deployment identity',
    );
  }
  if (
    normalizeHex(runtime.profile.bridgeAddressHex)
      !== normalizeHex(identity.view.bridgeAddress)
    || normalizeHex(runtime.profile.tokenAddressHex)
      !== normalizeHex(identity.view.tokenAddress)
    || normalizeHex(runtime.profile.bridgeRuntimeCodeSha256Hex)
      !== normalizeHex(identity.view.bridgeRuntimeBytecodeSha256Hex)
    || runtime.profile.bridgeRuntimeCodeBytes
      !== identity.view.bridgeRuntimeByteLength
    || normalizeHex(runtime.profile.tokenRuntimeCodeSha256Hex)
      !== normalizeHex(identity.view.tokenRuntimeBytecodeSha256Hex)
    || runtime.profile.tokenRuntimeCodeBytes
      !== identity.view.tokenRuntimeByteLength
  ) {
    throw new Error(
      'runtime profile does not bind the exact observed deployment identity',
    );
  }
  if (
    identity.view.bridgeTokenAddress !== identity.view.tokenAddress
    || identity.view.tokenOwnerAddress !== identity.view.bridgeAddress
  ) {
    throw new Error(
      'deployment identity does not retain the exact bridge/token ownership bindings',
    );
  }
}

export function assertFrontierRelayerCompatibilityAuthoritySourceBoundaryV4(
  input: Readonly<{
    bridgeRoot: string;
    sidechainContractAbiSource: string;
  }>,
): void {
  assertGuardedSourcePathAbsent(
    input.bridgeRoot,
    'relayer/src/sidechain-state-updater.ts',
  );
  for (const requirement of ['function processedPegIns', 'event PegIn']) {
    if (!input.sidechainContractAbiSource.includes(requirement)) {
      throw new Error(
        `tracked compatibility source relayer/src/sidechain-contract-abi.ts lacks ${requirement}`,
      );
    }
  }
  if (input.sidechainContractAbiSource.includes('updateErgoState')) {
    throw new Error(
      'tracked active sidechain ABI retains the historical updateErgoState entrypoint',
    );
  }
}

function loadTypescriptParser(): typeof import('typescript') {
  if (TYPESCRIPT_PARSER) return TYPESCRIPT_PARSER;
  try {
    TYPESCRIPT_PARSER = createRequire(import.meta.url)('typescript') as
      typeof import('typescript');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `TypeScript parser is required for the SCS runtime source boundary: ${message}`,
    );
  }
  return TYPESCRIPT_PARSER;
}

function parseTypescriptSource(
  source: string,
  fileName: string,
): Readonly<{
  parser: typeof import('typescript');
  sourceFile: ts.SourceFile;
}> {
  const parser = loadTypescriptParser();
  const sourceFile = parser.createSourceFile(
    fileName,
    source,
    parser.ScriptTarget.Latest,
    true,
    parser.ScriptKind.TS,
  );
  const diagnostics = (
    sourceFile as ts.SourceFile & {
      readonly parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    throw new Error(`${fileName} must be syntactically valid TypeScript`);
  }
  return Object.freeze({ parser, sourceFile });
}

function sameModuleSpecifier(value: string, expected: string): boolean {
  return posix.normalize(value) === posix.normalize(expected);
}

function dynamicallyImportsOrRequiresModule(
  parser: typeof import('typescript'),
  sourceFile: ts.SourceFile,
  moduleName: string,
): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      parser.isCallExpression(node)
      && node.arguments.length === 1
      && parser.isStringLiteral(node.arguments[0])
      && sameModuleSpecifier(node.arguments[0].text, moduleName)
      && (
        node.expression.kind === parser.SyntaxKind.ImportKeyword
        || (
          parser.isIdentifier(node.expression)
          && node.expression.text === 'require'
        )
      )
    ) {
      found = true;
      return;
    }
    parser.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!found) {
    found = sourceFile.statements.some(statement =>
      parser.isImportEqualsDeclaration(statement)
      && parser.isExternalModuleReference(statement.moduleReference)
      && statement.moduleReference.expression
      && parser.isStringLiteral(statement.moduleReference.expression)
      && sameModuleSpecifier(
        statement.moduleReference.expression.text,
        moduleName,
      )
    );
  }
  return found;
}

function importsOrRequiresModule(
  parser: typeof import('typescript'),
  sourceFile: ts.SourceFile,
  moduleName: string,
): boolean {
  return sourceFile.statements.some(statement =>
    (
      parser.isImportDeclaration(statement)
      || parser.isExportDeclaration(statement)
    )
    && statement.moduleSpecifier
    && parser.isStringLiteral(statement.moduleSpecifier)
    && sameModuleSpecifier(statement.moduleSpecifier.text, moduleName)
  ) || dynamicallyImportsOrRequiresModule(parser, sourceFile, moduleName);
}

export function assertRetiredOperationalSubmissionRuntimeSourceV4(
  input: Readonly<{ relayerDaemonSource: string }>,
): void {
  const genericLifecycleModule =
    './apps/bridge-daemon/ergo-operational-transaction.js';
  const compatibilityModule =
    './ergo-operational-transaction-compatibility.js';
  const daemonMarkers = [
    'submitPegInCommittedVaultTransition({',
    'peg-in commitment signer loading',
    'peg-in commitment fee selection',
    'submitScsOracleUpdate',
    'submitDupHeartbeatTouch',
    'runErgoOperationalTransaction({',
    'SCS oracle signer loading',
    'SCS oracle fee selection',
    'SCS update submitted',
  ] as const;
  for (const marker of daemonMarkers) {
    if (input.relayerDaemonSource.includes(marker)) {
      throw new Error(
        `tracked daemon retains fixed operational submission capability: ${marker}`,
      );
    }
  }

  const daemon = parseTypescriptSource(
    input.relayerDaemonSource,
    'relayer-daemon.ts',
  );
  for (const moduleName of [genericLifecycleModule, compatibilityModule]) {
    if (importsOrRequiresModule(daemon.parser, daemon.sourceFile, moduleName)) {
      throw new Error(
        `tracked daemon must not import or require retired operational module ${moduleName}`,
      );
    }
  }
}

export function assertRetiredPegInCommitmentRuntimeSourcesV4(
  input: Readonly<{
    runtimeSources: readonly Readonly<{ path: string; source: string }>[];
  }>,
): void {
  const retiredNames = new Set([
    `submit${'Commitment'}`,
    `submit${'Detected'}`,
  ]);
  for (const runtimeSource of input.runtimeSources) {
    const parsed = parseTypescriptSource(
      runtimeSource.source,
      runtimeSource.path,
    );
    let retiredName: string | null = null;
    const visit = (node: ts.Node): void => {
      if (retiredName) return;
      if (parsed.parser.isIdentifier(node) && retiredNames.has(node.text)) {
        retiredName = node.text;
        return;
      }
      if (
        (
          parsed.parser.isStringLiteral(node)
          || parsed.parser.isNoSubstitutionTemplateLiteral(node)
        )
        && retiredNames.has(node.text)
      ) {
        retiredName = node.text;
        return;
      }
      parsed.parser.forEachChild(node, visit);
    };
    visit(parsed.sourceFile);
    if (retiredName) {
      throw new Error(
        `tracked runtime source ${runtimeSource.path} retains retired committed-vault capability ${retiredName}`,
      );
    }
  }
}

function collectRelayerRuntimeSources(
  bridgeRoot: string,
): readonly Readonly<{ path: string; source: string }>[] {
  const sourceRoot = resolve(bridgeRoot, 'relayer/src');
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `tracked relayer runtime source tree must not contain symlinks: ${entryPath}`,
        );
      }
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const path = relative(bridgeRoot, entryPath).replace(/\\/g, '/');
        if (!path.endsWith('.test.ts')) paths.push(path);
      }
    }
  };
  visit(sourceRoot);
  return Object.freeze(paths.sort().map(path => Object.freeze({
    path,
    source: readGuardedSourceFile(bridgeRoot, path).toString('utf8'),
  })));
}

function buildStaticSourceClosure(
  bridgeRoot: string,
  artifactProfileDigestHex: string,
  buildManifestSha256Hex: string,
): FrontierRelayerCompatibilityAuthorityInventoryV4['sourceClosure'] {
  assertExactFrontierRelayerCompatibilityRouteInventoryV4(
    FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
  );
  const sourceFiles = Object.entries({
    'relayer/package.json': [
      '"e2e:aggregate"',
      '"settle:aggregate"',
    ],
    'relayer/src/aggregate-settlement-service.ts': [
      'async confirmSingleClaimSettlement(',
      'async confirmBatchSettlement(',
      'broadcastPermitted: false',
    ],
    'relayer/src/aggregate-settlement-approvals.ts': [
      'loadHistoricalAggregateSettlementApprovals',
      'HistoricalAggregateSettlementApprovalLookup',
      'non-broadcast aggregate settlement check command',
    ],
    'relayer/src/config.ts': [
      'aggregateSettlementEnabled',
      'broadcastEnabled',
    ],
    'relayer/src/ergo-client.ts': [
      'export class ErgoClient',
      'async getTransaction(',
      'async hasUnconfirmedTransaction(',
    ],
    'relayer/src/fleet-signer.ts': [
      'export async function signTransactionForSubmission(',
      'export async function signTransactionForCheck(',
      'assertSignedTransactionIdMatchesExpected(',
    ],
    'relayer/src/peg-in-transition.ts': [
      'legacy owner-mint execution is retired',
    ],
    'relayer/src/relayer-daemon.ts': [
      'Peg-out held fail-closed because legacy aggregate payout execution is retired',
      'confirmSingleClaimSettlement',
      'confirmBatchSettlement',
    ],
    'relayer/src/scripts/aggregate-settlement.ts': [
      'SUPPORTED_AGGREGATE_COMMANDS',
      'Prepare commands construct unsigned diagnostics only',
      'prepare-batch',
      'confirmSingleClaimSettlement',
    ],
    'relayer/src/scripts/e2e-aggregate-settlement.ts': [
      'supportedNonSubmissionCommands',
      'No command in this runner signs, checks, submits, or broadcasts',
      'confirmSingleClaimSettlement',
    ],
    'relayer/src/adapters/peg-in-mint-confirmation.ts': [
      'observeFrontierPegInMintTransportConfirmation',
    ],
    'relayer/src/relayer-core/peg-in-mint-transport-lifecycle.ts': [
      'PEG_IN_MINT_FEE_POLICY_ID',
      'normalizePegInMintAcceptedSubmission',
    ],
    'relayer/src/sidechain-client.ts': [
      'loadReviewedPegInMintRuntimeIdentity',
      'observePegInMintTransportConfirmation',
      '#bridgeContract',
    ],
    'relayer/src/sidechain-contract-abi.ts': [],
    'solidity/ErgoBridge.sol': [
      'function updateErgoState',
      'function mintSERG',
      'function pegOut',
      'function withdrawFees',
      'function emergencyPause',
      'function unpause',
    ],
    'solidity/SERG.sol': [
      'function mint',
      'function bridgeBurn',
    ],
    'solidity/compiled/ErgoBridge.abi': [],
    'solidity/compiled/SERG.abi': [],
    'sources/consensus-source-lock.json': [],
    'sources/frontier/0001-bridge-runtime-commitment.patch': [
      'pub fn set_bridge_address',
      'ensure_root(origin)?',
      'BridgeAddress::<T>::get()',
      'fn produce_commitment',
      'PegOut(address,uint256,bytes)',
    ],
  } as const).map(([path, requiredText]) => {
    const bytes = readGuardedSourceFile(bridgeRoot, path);
    const text = bytes.toString('utf8');
    for (const requirement of requiredText) {
      if (!text.includes(requirement)) {
        throw new Error(
          `tracked compatibility source ${path} lacks ${requirement}`,
        );
      }
    }
    return deepFreeze({
      path,
      sha256Hex: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
    });
  });
  const pegInTransitionSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/peg-in-transition.ts',
  ).toString('utf8');
  const sidechainClientSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/sidechain-client.ts',
  ).toString('utf8');
  const relayerDaemonSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/relayer-daemon.ts',
  ).toString('utf8');
  const sidechainContractAbiSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/sidechain-contract-abi.ts',
  ).toString('utf8');
  assertFrontierRelayerCompatibilityAuthoritySourceBoundaryV4({
    bridgeRoot,
    sidechainContractAbiSource,
  });
  const mintConfirmationSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/adapters/peg-in-mint-confirmation.ts',
  ).toString('utf8');
  const mintLifecycleSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/relayer-core/peg-in-mint-transport-lifecycle.ts',
  ).toString('utf8');
  const aggregateSettlementServiceSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/aggregate-settlement-service.ts',
  ).toString('utf8');
  const aggregateSettlementApprovalsSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/aggregate-settlement-approvals.ts',
  ).toString('utf8');
  const aggregateSettlementCliSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/scripts/aggregate-settlement.ts',
  ).toString('utf8');
  const aggregateSettlementE2eSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/scripts/e2e-aggregate-settlement.ts',
  ).toString('utf8');
  const ergoClientSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/ergo-client.ts',
  ).toString('utf8');
  const fleetSignerSource = readGuardedSourceFile(
    bridgeRoot,
    'relayer/src/fleet-signer.ts',
  ).toString('utf8');
  const genericTransactionPath = ['/', 'transactions'].join('');
  assertRetiredOperationalSubmissionRuntimeSourceV4({
    relayerDaemonSource,
  });
  assertRetiredPegInCommitmentRuntimeSourcesV4({
    runtimeSources: collectRelayerRuntimeSources(bridgeRoot),
  });
  if (
    ergoClientSource.includes('async submitTransaction(')
    || fleetSignerSource.includes('export async function signAndSubmit(')
    || fleetSignerSource.includes('export async function signAndSubmitDetailed(')
    || fleetSignerSource.includes('export function interpretSubmitResult(')
    || fleetSignerSource.includes(
      `npostDirect('${genericTransactionPath}'`,
    )
  ) {
    throw new Error(
      'tracked compatibility source retains a generic Ergo transaction submission capability',
    );
  }
  if (
    pegInTransitionSource.includes('sidechain.mintSERG')
    || pegInTransitionSource.includes('executeMintTransport')
    || pegInTransitionSource.includes('startFundsReleaseTransport')
    || sidechainClientSource.includes('async mintSERG(')
    || sidechainClientSource.includes('bridgeContract.mintSERG(')
    || sidechainClientSource.includes('submitPegInMint')
    || sidechainClientSource.includes('signPegInMintEnvelope')
    || sidechainClientSource.includes('buildPegInMintEnvelope')
    || sidechainContractAbiSource.includes('mintSERG')
    || relayerDaemonSource.includes('runPegInMintTransport')
    || relayerDaemonSource.includes('executeMintTransport')
    || mintConfirmationSource.includes('broadcastTransaction')
    || mintConfirmationSource.includes('signTransaction')
    || mintLifecycleSource.includes('executePegInMintTransport')
    || mintLifecycleSource.includes('PegInMintTransportPorts')
  ) {
    throw new Error(
      'tracked compatibility source retains a direct relayer owner-mint entrypoint',
    );
  }
  const absentFiles = deepFreeze([
    'relayer/dist/ergo-operational-transaction-compatibility.d.ts',
    'relayer/dist/ergo-operational-transaction-compatibility.d.ts.map',
    'relayer/dist/ergo-operational-transaction-compatibility.js',
    'relayer/dist/ergo-operational-transaction-compatibility.js.map',
    'relayer/dist/ergo-operational-transaction-compatibility.test.d.ts',
    'relayer/dist/ergo-operational-transaction-compatibility.test.d.ts.map',
    'relayer/dist/ergo-operational-transaction-compatibility.test.js',
    'relayer/dist/ergo-operational-transaction-compatibility.test.js.map',
    'relayer/dist/scripts/redeploy-mcl.d.ts',
    'relayer/dist/scripts/redeploy-mcl.d.ts.map',
    'relayer/dist/scripts/redeploy-mcl.js',
    'relayer/dist/scripts/redeploy-mcl.js.map',
    'relayer/dist/scripts/test-dup-e2e.d.ts',
    'relayer/dist/scripts/test-dup-e2e.d.ts.map',
    'relayer/dist/scripts/test-dup-e2e.js',
    'relayer/dist/scripts/test-dup-e2e.js.map',
    'relayer/dist/scripts/trigger-peg-in.d.ts',
    'relayer/dist/scripts/trigger-peg-in.d.ts.map',
    'relayer/dist/scripts/trigger-peg-in.js',
    'relayer/dist/scripts/trigger-peg-in.js.map',
    'relayer/dist/scripts/spikes/spike2c-ergoscript-context-eval.d.ts',
    'relayer/dist/scripts/spikes/spike2c-ergoscript-context-eval.d.ts.map',
    'relayer/dist/scripts/spikes/spike2c-ergoscript-context-eval.js',
    'relayer/dist/scripts/spikes/spike2c-ergoscript-context-eval.js.map',
    'relayer/dist/scripts/spikes/spike3c-avl-tracker-eval.d.ts',
    'relayer/dist/scripts/spikes/spike3c-avl-tracker-eval.d.ts.map',
    'relayer/dist/scripts/spikes/spike3c-avl-tracker-eval.js',
    'relayer/dist/scripts/spikes/spike3c-avl-tracker-eval.js.map',
    'relayer/dist/scripts/spikes/spike4-dup-batched-insert.d.ts',
    'relayer/dist/scripts/spikes/spike4-dup-batched-insert.d.ts.map',
    'relayer/dist/scripts/spikes/spike4-dup-batched-insert.js',
    'relayer/dist/scripts/spikes/spike4-dup-batched-insert.js.map',
    'relayer/dist/scripts/spikes/spike8-spv-tracker-contract-eval.d.ts',
    'relayer/dist/scripts/spikes/spike8-spv-tracker-contract-eval.d.ts.map',
    'relayer/dist/scripts/spikes/spike8-spv-tracker-contract-eval.js',
    'relayer/dist/scripts/spikes/spike8-spv-tracker-contract-eval.js.map',
    'relayer/dist/scripts/spikes/spike9-aggregate-settlement-eval.d.ts',
    'relayer/dist/scripts/spikes/spike9-aggregate-settlement-eval.d.ts.map',
    'relayer/dist/scripts/spikes/spike9-aggregate-settlement-eval.js',
    'relayer/dist/scripts/spikes/spike9-aggregate-settlement-eval.js.map',
    'relayer/dist/scripts/spikes/spike10-aggregate-payout-eval.d.ts',
    'relayer/dist/scripts/spikes/spike10-aggregate-payout-eval.d.ts.map',
    'relayer/dist/scripts/spikes/spike10-aggregate-payout-eval.js',
    'relayer/dist/scripts/spikes/spike10-aggregate-payout-eval.js.map',
    'relayer/dist/scripts/spikes/spike11-multi-claim-aggregate.d.ts',
    'relayer/dist/scripts/spikes/spike11-multi-claim-aggregate.d.ts.map',
    'relayer/dist/scripts/spikes/spike11-multi-claim-aggregate.js',
    'relayer/dist/scripts/spikes/spike11-multi-claim-aggregate.js.map',
    'relayer/src/ergo-operational-transaction-compatibility.ts',
    'relayer/src/legacy-aggregate-settlement-execution.ts',
    'relayer/src/scripts/deploy.ts',
    'relayer/src/scripts/redeploy-dup.ts',
    'relayer/src/scripts/redeploy-mcl.ts',
    'relayer/src/scripts/redeploy-scs.ts',
    'relayer/src/scripts/test-dup-e2e.ts',
    'relayer/src/scripts/trigger-peg-in.ts',
    'relayer/src/scripts/spikes/spike2c-ergoscript-context-eval.ts',
    'relayer/src/scripts/spikes/spike3c-avl-tracker-eval.ts',
    'relayer/src/scripts/spikes/spike4-dup-batched-insert.ts',
    'relayer/src/scripts/spikes/spike8-spv-tracker-contract-eval.ts',
    'relayer/src/scripts/spikes/spike9-aggregate-settlement-eval.ts',
    'relayer/src/scripts/spikes/spike10-aggregate-payout-eval.ts',
    'relayer/src/scripts/spikes/spike11-multi-claim-aggregate.ts',
    'relayer/src/sidechain-state-updater.ts',
  ] as const);
  for (const path of absentFiles) {
    assertGuardedSourcePathAbsent(bridgeRoot, path);
  }
  if (
    aggregateSettlementServiceSource.includes(
      'admitLegacyAggregateSettlementSubmission',
    )
    || aggregateSettlementServiceSource.includes(
      'revalidateLegacyAggregateSettlementSubmission',
    )
    || aggregateSettlementServiceSource.includes(
      'reserveLegacyAggregateSettlementSubmission',
    )
    || aggregateSettlementServiceSource.includes(
      'finalizeLegacyAggregateSettlementSubmission',
    )
    || aggregateSettlementApprovalsSource.includes(
      'submitExplicitAggregateSingleClaim',
    )
    || aggregateSettlementApprovalsSource.includes(
      'submitExplicitAggregateBatchClaims',
    )
    || relayerDaemonSource.includes('tryBatchSettlement(')
    || relayerDaemonSource.includes(
      'submitFileApprovedAggregateSingleClaim',
    )
    || relayerDaemonSource.includes(
      'submitFileApprovedAggregateBatchClaims',
    )
    || aggregateSettlementCliSource.includes("command === 'submit'")
    || aggregateSettlementCliSource.includes("command === 'submit-batch'")
    || aggregateSettlementCliSource.includes("command === 'check'")
    || aggregateSettlementCliSource.includes("command === 'check-batch'")
    || aggregateSettlementCliSource.includes("command === 'check-with-ingest'")
    || aggregateSettlementCliSource.includes("command === 'check-anchored'")
    || aggregateSettlementCliSource.includes('signAndCheck(')
    || aggregateSettlementCliSource.includes('/fleet-signer.js')
    || aggregateSettlementCliSource.includes('/transactions/check')
    || aggregateSettlementE2eSource.includes("command === 'submit'")
    || aggregateSettlementE2eSource.includes("command === 'run'")
    || aggregateSettlementE2eSource.includes("command === 'trigger'")
    || aggregateSettlementE2eSource.includes("command === 'import-pegout'")
    || aggregateSettlementE2eSource.includes("command === 'check'")
    || aggregateSettlementE2eSource.includes('signAndCheck(')
    || aggregateSettlementE2eSource.includes('/fleet-signer.js')
    || aggregateSettlementE2eSource.includes('/transactions/check')
    || aggregateSettlementServiceSource.includes(
      'legacy-aggregate-settlement-execution.js',
    )
    || aggregateSettlementApprovalsSource.includes(
      'legacy-aggregate-settlement-execution.js',
    )
    || relayerDaemonSource.includes(
      'legacy-aggregate-settlement-execution.js',
    )
    || aggregateSettlementCliSource.includes(
      'legacy-aggregate-settlement-execution.js',
    )
    || aggregateSettlementE2eSource.includes(
      'legacy-aggregate-settlement-execution.js',
    )
  ) {
    throw new Error(
      'tracked compatibility source retains a direct relayer legacy settlement entrypoint',
    );
  }
  assertLegacyErgoBridgeStateMutatingAbiInventoryV4(
    parseStrictJson(
      readGuardedSourceFile(
        bridgeRoot,
        'solidity/compiled/ErgoBridge.abi',
      ).toString('utf8'),
      'ErgoBridge ABI',
    ),
    FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
  );
  assertAbiCapabilities(
    parseStrictJson(
      readGuardedSourceFile(
        bridgeRoot,
        'solidity/compiled/SERG.abi',
      ).toString('utf8'),
      'SERG ABI',
    ),
    [
      'mint(address,uint256)',
      'bridgeBurn(address,uint256)',
      'renounceOwnership()',
      'transferOwnership(address)',
    ],
    'SERG ABI',
  );
  const files = deepFreeze(sourceFiles);
  const coveredSourcePaths = new Set([
    ...files.map(file => file.path),
    ...absentFiles,
  ]);
  for (const requirement of
    FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4) {
    const sourcePath = requirement.sourceSurface.split('::', 1)[0];
    if (!coveredSourcePaths.has(sourcePath)) {
      throw new Error(
        `Frontier/relayer route source is absent from the source closure: ${sourcePath}`,
      );
    }
  }
  const routeInventoryDigestHex = `0x${sha256CanonicalJson(
    FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
    'E2S_FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4',
  )}`;
  const binding = {
    artifactProfileDigestHex,
    buildManifestSha256Hex,
    routeInventoryDigestHex,
    files,
    absentFiles,
  } as const;
  return deepFreeze({
    ...binding,
    sourceClosureDigestHex: `0x${sha256CanonicalJson(
      binding,
      'E2S_FRONTIER_RELAYER_COMPATIBILITY_SOURCE_CLOSURE_V4',
    )}`,
  });
}

export function assertLegacyErgoBridgeStateMutatingAbiInventoryV4(
  value: unknown,
  requirements:
    readonly FrontierRelayerCompatibilityRouteRequirementV4[],
): void {
  if (
    Array.isArray(value)
    && value.some(entry =>
      !!entry
      && typeof entry === 'object'
      && !Array.isArray(entry)
      && (
        (entry as Record<string, unknown>).type === 'fallback'
        || (entry as Record<string, unknown>).type === 'receive'
      )
    )
  ) {
    throw new Error(
      'ErgoBridge ABI contains an unclassified fallback or receive surface',
    );
  }
  const functions = parseAbiFunctionSurfaces(value, 'ErgoBridge ABI');
  const stateMutating = functions.filter(entry =>
    entry.stateMutability !== 'view' && entry.stateMutability !== 'pure'
  );
  const actualSignatures = stateMutating
    .map(entry => entry.signature)
    .sort();
  const prefix = 'solidity/ErgoBridge.sol::';
  const expectedSignatures = requirements
    .filter(requirement => requirement.sourceSurface.startsWith(prefix))
    .map(requirement => {
      const selector = requirement.sourceSurface.slice(prefix.length);
      if (selector.includes('(')) {
        return selector;
      }
      const matches = stateMutating.filter(entry => entry.name === selector);
      if (matches.length !== 1) {
        throw new Error(
          `ErgoBridge route ${requirement.routeId} does not resolve to one exact state-mutating ABI function`,
        );
      }
      return matches[0].signature;
    })
    .sort();
  if (
    new Set(expectedSignatures).size !== expectedSignatures.length
    || canonicalJson(expectedSignatures) !== canonicalJson(actualSignatures)
  ) {
    throw new Error(
      'ErgoBridge state-mutating ABI inventory must match every exact legacy route',
    );
  }
}

function assertAbiCapabilities(
  value: unknown,
  expectedSignatures: readonly string[],
  label: string,
): void {
  const signatures = parseAbiFunctionSurfaces(value, label)
    .map(entry => entry.signature);
  for (const expected of expectedSignatures) {
    if (!signatures.includes(expected)) {
      throw new Error(`${label} lacks exact capability ${expected}`);
    }
  }
}

function normalizeConfigurationObservation(
  value: unknown,
): Readonly<{
  sidechainBroadcast: LocalCapabilityConfigurationObservationV4;
  legacyAggregateSettlement: LocalCapabilityConfigurationObservationV4;
}> {
  const record = exactRecord(value, [
    'legacyAggregateSettlement',
    'sidechainBroadcast',
  ], 'local capability configuration observation');
  return deepFreeze({
    sidechainBroadcast: configurationValue(
      record.sidechainBroadcast,
      'sidechain broadcast configuration observation',
    ),
    legacyAggregateSettlement: configurationValue(
      record.legacyAggregateSettlement,
      'legacy aggregate settlement configuration observation',
    ),
  });
}

function configurationValue(
  value: unknown,
  label: string,
): LocalCapabilityConfigurationObservationV4 {
  if (
    value !== 'not-observed'
    && value !== 'enabled'
    && value !== 'disabled'
  ) {
    throw new Error(
      `${label} must be not-observed, enabled, or disabled`,
    );
  }
  return value;
}

function readGuardedSourceFile(
  bridgeRoot: string,
  relativePath: string,
): Buffer {
  if (
    typeof bridgeRoot !== 'string'
    || bridgeRoot.trim() === ''
    || !isAbsolute(bridgeRoot)
  ) {
    throw new Error('bridge root must be a non-empty absolute path');
  }
  const canonicalRoot = realpathSync(resolve(bridgeRoot));
  const requestedPath = resolve(canonicalRoot, relativePath);
  const relativeToRoot = relative(canonicalRoot, requestedPath);
  if (
    relativeToRoot === ''
    || relativeToRoot === '..'
    || relativeToRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    || isAbsolute(relativeToRoot)
  ) {
    throw new Error(`tracked source path escapes bridge root: ${relativePath}`);
  }
  const metadata = lstatSync(requestedPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`tracked source must be a regular file: ${relativePath}`);
  }
  if (metadata.size <= 0 || metadata.size > MAX_STATIC_SOURCE_BYTES) {
    throw new Error(`tracked source has unsupported size: ${relativePath}`);
  }
  const canonicalPath = realpathSync(requestedPath);
  const canonicalRelative = relative(canonicalRoot, canonicalPath);
  if (
    canonicalRelative === '..'
    || canonicalRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    || isAbsolute(canonicalRelative)
  ) {
    throw new Error(`tracked source resolves outside bridge root: ${relativePath}`);
  }
  return readFileSync(canonicalPath);
}

function exactFrontierRelayerRequirement(
  requirement: LegacyRouteRetirementRequirementV4,
): FrontierRelayerCompatibilityRouteRequirementV4 {
  if (
    requirement.layer !== 'frontier'
    && requirement.layer !== 'relayer'
  ) {
    throw new Error('Frontier/relayer route has another layer');
  }
  if (
    requirement.routeClass !== 'owner-mint'
    && requirement.routeClass !== 'fee-withdrawal'
    && requirement.routeClass !== 'state-update'
    && requirement.routeClass !== 'pause-control'
    && requirement.routeClass !== 'bridge-burn'
    && requirement.routeClass !== 'bridge-withdrawal'
    && requirement.routeClass !== 'authority-mutation'
    && requirement.routeClass !== 'commitment-producer'
    && requirement.routeClass !== 'runtime-entrypoint'
  ) {
    throw new Error('Frontier/relayer route has another route class');
  }
  return {
    routeId: requirement.routeId,
    layer: requirement.layer,
    routeClass: requirement.routeClass,
    sourceSurface: requirement.sourceSurface,
    historicalAuthority: exactFrontierRelayerHistoricalAuthority(
      requirement.historicalAuthority,
    ),
    requiredDisposition: exactFrontierRelayerDisposition(
      requirement.requiredDisposition,
    ),
  };
}

function assertGuardedSourcePathAbsent(
  bridgeRoot: string,
  relativePath: string,
): void {
  if (
    typeof bridgeRoot !== 'string'
    || bridgeRoot.trim() === ''
    || !isAbsolute(bridgeRoot)
  ) {
    throw new Error('bridge root must be a non-empty absolute path');
  }
  const canonicalRoot = realpathSync(resolve(bridgeRoot));
  const requestedPath = resolve(canonicalRoot, relativePath);
  const relativeToRoot = relative(canonicalRoot, requestedPath);
  if (
    relativeToRoot === ''
    || relativeToRoot === '..'
    || relativeToRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    || isAbsolute(relativeToRoot)
  ) {
    throw new Error(`tracked absent source path escapes bridge root: ${relativePath}`);
  }
  if (existsSync(requestedPath)) {
    throw new Error(`retired compatibility source must be absent: ${relativePath}`);
  }
}

function parseAbiFunctionSurfaces(
  value: unknown,
  label: string,
): readonly Readonly<{
  name: string;
  signature: string;
  stateMutability: string;
}>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value
    .filter((entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === 'object'
        && !Array.isArray(entry)
        && entry.type === 'function'
    )
    .map(entry => {
      const name = stringValue(entry.name, `${label} function name`);
      const stateMutability = stringValue(
        entry.stateMutability,
        `${label} function state mutability`,
      );
      if (!Array.isArray(entry.inputs)) {
        throw new Error(`${label} function inputs must be an array`);
      }
      const inputTypes = entry.inputs.map(input => {
        const record = exactRecordWithAllowedExtras(
          input,
          ['internalType', 'name', 'type'],
          `${label} function input`,
        );
        return stringValue(record.type, `${label} function input type`);
      });
      return deepFreeze({
        name,
        signature: `${name}(${inputTypes.join(',')})`,
        stateMutability,
      });
    });
}

function exactFrontierRelayerHistoricalAuthority(
  value: LegacyRouteRetirementRequirementV4['historicalAuthority'],
): FrontierRelayerCompatibilityRouteRequirementV4['historicalAuthority'] {
  switch (value) {
    case 'owner-key':
    case 'token-owner-key':
    case 'root-origin':
    case 'selected-bridge-address':
    case 'permissionless-caller':
    case 'local-runtime-capability':
      return value;
    default:
      throw new Error('Frontier/relayer route has another historical authority');
  }
}

function exactFrontierRelayerDisposition(
  value: LegacyRouteRetirementRequirementV4['requiredDisposition'],
): FrontierRelayerCompatibilityRouteRequirementV4['requiredDisposition'] {
  switch (value) {
    case 'disable-authority':
    case 'freeze-authority':
    case 'application-bind-or-remove':
    case 'remove-runtime-capability':
      return value;
    default:
      throw new Error('Frontier/relayer route has another required disposition');
  }
}

function assertAllFalse(value: unknown, label: string): void {
  const record = exactRecordWithAllowedExtras(
    value,
    Object.keys(value as Record<string, unknown>),
    label,
  );
  if (
    Object.keys(record).length === 0
    || Object.values(record).some(candidate => candidate !== false)
  ) {
    throw new Error(`${label} must retain only false authority flags`);
  }
}

function exactRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = recordValue(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} fields are not exact`);
  }
  return record;
}

function exactRecordWithAllowedExtras(
  value: unknown,
  allowedFields: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = recordValue(value, label);
  const unexpected = Object.keys(record)
    .filter(field => !allowedFields.includes(field));
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported fields`);
  }
  return record;
}

function recordValue(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function canonicalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds uint64`);
  }
  return parsed.toString();
}

function normalizeHex(value: string): string {
  return value.toLowerCase().replace(/^0x/, '');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (!value || typeof value !== 'object' || seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);
  for (const item of Object.values(value as Record<string, unknown>)) {
    deepFreeze(item, seen);
  }
  return Object.freeze(value);
}
