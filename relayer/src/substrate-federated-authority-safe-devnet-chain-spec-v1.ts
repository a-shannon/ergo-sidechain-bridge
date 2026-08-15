import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';

import {
  assertDeploymentIdentityArtifactProfileProvenance,
  loadTrackedDeploymentIdentityArtifactProfile,
} from './read-only-deployment-identity-observer.js';
import {
  assertTrackedStorageLayouts,
  type BuildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Input,
  buildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1,
  parseStrictJsonPreservingNumbers,
  SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_ID,
  SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_NAME,
  SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_PROTOCOL_ID,
  stringifyJsonPreservingNumbers,
  type SubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Report,
} from './substrate-federated-legacy-compatibility-devnet-chain-spec-v1.js';
import { parseStrictJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_CHAIN_SPEC_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-chain-spec.v1' as const;

const SPEC_NAME = 'Bridge Federated Authority-Safe Target';
const SPEC_ID = 'bridge_federated_authority_safe';
const PROTOCOL_ID = 'bridge-fed-authority-safe';
const MAX_BASE_SPEC_BYTES = 16 * 1024 * 1024;
const SOURCE_LOCK_PATH = 'sources/consensus-source-lock.json';
const FRONTIER_PATCH_PATH =
  'sources/frontier/0001-bridge-runtime-commitment.patch';

export interface BuildSubstrateFederatedAuthoritySafeDevnetChainSpecV1Input
  extends BuildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Input {
  readonly expectedBaseSpecSha256Hex: string;
  readonly expectedFrontierCommit: string;
  readonly expectedFrontierPatchSha256Hex: string;
  readonly expectedRuntimeCodeSha256Hex: string;
  readonly expectedSudoAddress: string;
}

export interface SubstrateFederatedAuthoritySafeDevnetChainSpecV1Report {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_CHAIN_SPEC_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'isolated_authority_safe_genesis_candidate';
  readonly baseSpecSha256Hex: string;
  readonly legacyApplicationEmbeddingSha256Hex: string;
  readonly chainSpecSha256Hex: string;
  readonly chainSpecBytes: number;
  readonly chain: Readonly<{
    readonly name: typeof SPEC_NAME;
    readonly id: typeof SPEC_ID;
    readonly protocolId: typeof PROTOCOL_ID;
    readonly chainType: 'Development';
    readonly chainId: string;
  }>;
  readonly source: Readonly<{
    readonly frontierCommit: string;
    readonly frontierPatchSha256Hex: string;
    readonly runtimeCodeByteLength: number;
    readonly runtimeCodeSha256Hex: string;
    readonly removedSudoAddress: string;
  }>;
  readonly application:
    SubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Report['application'];
  readonly checks: Readonly<{
    readonly trackedSolidityBuildClosureVerified: true;
    readonly trackedStorageLayoutsVerified: true;
    readonly trackedFrontierPatchBytesVerified: true;
    readonly runtimeCodePinVerified: true;
    readonly applicationRuntimeCodeEmbeddedAtGenesis: true;
    readonly exactApplicationBindingsInitialized: true;
    readonly typedLegacyMintQuarantineConfigured: true;
    readonly sudoKeyRemoved: true;
    readonly activeMintProfileGenesisFieldsAbsent: true;
    readonly noBootnodesEmbedded: true;
    readonly telemetryDisabled: true;
  }>;
  readonly boundaries: Readonly<{
    readonly isolatedDevelopmentTargetOnly: true;
    readonly historicalOwnerMintEntrypointEmbedded: true;
    readonly authoritySafeTargetIdentityObserved: false;
    readonly legacyOwnerMintRuntimeRejectionObserved: false;
    readonly independentSourceOriginsEstablished: false;
    readonly federatedLaunchEligible: false;
    readonly federatedMintAuthorityEstablished: false;
    readonly sourceHistoryAuthenticated: false;
    readonly sourceFinalityAuthenticated: false;
    readonly ergoHistoryAuthenticated: false;
    readonly launchStatementProduced: false;
    readonly sourceAttestationProduced: false;
    readonly transactionConstructed: false;
    readonly transactionSigned: false;
    readonly transactionSubmitted: false;
    readonly transactionBroadcast: false;
    readonly profileActivated: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface SubstrateFederatedAuthoritySafeDevnetChainSpecV1Result {
  readonly chainSpecBytes: Uint8Array;
  readonly report: Readonly<
    SubstrateFederatedAuthoritySafeDevnetChainSpecV1Report
  >;
}

export interface ValidateSubstrateFederatedAuthoritySafeDevnetChainSpecV1Input {
  readonly bridgeRoot: string;
  readonly baseSpecBytes: Uint8Array;
  readonly chainSpecBytes: Uint8Array;
  readonly report: Readonly<
    SubstrateFederatedAuthoritySafeDevnetChainSpecV1Report
  >;
  readonly expectedChainId: bigint;
  readonly expectedBridgeAddress: string;
  readonly expectedTokenAddress: string;
  readonly expectedBridgeOwnerAddress: string;
  readonly expectedBaseSpecSha256Hex: string;
  readonly expectedFrontierCommit: string;
  readonly expectedFrontierPatchSha256Hex: string;
  readonly expectedRuntimeCodeSha256Hex: string;
  readonly expectedSudoAddress: string;
}

export function buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1(
  input: Readonly<
    BuildSubstrateFederatedAuthoritySafeDevnetChainSpecV1Input
  >,
): Readonly<SubstrateFederatedAuthoritySafeDevnetChainSpecV1Result> {
  const bridgeRoot = resolve(nonemptyString(input.bridgeRoot, 'bridge root'));
  const baseSpecBytes = boundedBytes(input.baseSpecBytes);
  const expectedChainId = positiveChainId(input.expectedChainId);
  if (expectedChainId === 1n) {
    throw new Error('authority-safe chain spec refuses chain ID 1');
  }
  const expectedBridgeAddress = evmAddress(
    input.bridgeAddress,
    'expected bridge address',
  );
  const expectedTokenAddress = evmAddress(
    input.tokenAddress,
    'expected token address',
  );
  const expectedBridgeOwnerAddress = evmAddress(
    input.bridgeOwnerAddress,
    'expected bridge owner address',
  );
  const expectedBaseSpecSha256Hex = sha256Hex(
    input.expectedBaseSpecSha256Hex,
    'expected base-spec SHA-256',
  );
  if (sha256(baseSpecBytes) !== expectedBaseSpecSha256Hex) {
    throw new Error('base Frontier chain spec differs from the explicit pin');
  }
  const expectedFrontierCommit = lowercaseHex(
    input.expectedFrontierCommit,
    40,
    'expected Frontier commit',
  );
  const expectedPatchSha256Hex = sha256Hex(
    input.expectedFrontierPatchSha256Hex,
    'expected Frontier patch SHA-256',
  );
  const expectedRuntimeCodeSha256Hex = sha256Hex(
    input.expectedRuntimeCodeSha256Hex,
    'expected runtime code SHA-256',
  );
  const expectedSudoAddress = evmAddress(
    input.expectedSudoAddress,
    'expected Sudo address',
  );
  const source = loadFrontierSourceClosure(
    bridgeRoot,
    expectedFrontierCommit,
    expectedPatchSha256Hex,
  );

  const baseSpec = record(
    parseStrictJsonPreservingNumbers(
      strictUtf8(baseSpecBytes, 'base Frontier chain spec'),
      'base Frontier chain spec',
    ),
    'base Frontier chain spec',
  );
  const baseRuntimeGenesis = childRecord(
    childRecord(baseSpec, 'genesis', 'base Frontier chain spec'),
    'runtimeGenesis',
    'base Frontier genesis',
  );
  const basePatch = childRecord(
    baseRuntimeGenesis,
    'patch',
    'base runtime genesis',
  );
  if (Object.hasOwn(basePatch, 'bridgeCommitment')) {
    throw new Error(
      'authority-safe base spec must not contain a bridgeCommitment genesis profile',
    );
  }
  const baseSudo = exactSudoConfig(basePatch.sudo);
  if (baseSudo !== expectedSudoAddress) {
    throw new Error('base Sudo identity differs from the explicit pin');
  }
  const runtimeCode = runtimeBytes(baseRuntimeGenesis.code);
  const runtimeCodeSha256Hex = sha256(runtimeCode);
  if (runtimeCodeSha256Hex !== expectedRuntimeCodeSha256Hex) {
    throw new Error('base Frontier runtime code differs from the explicit pin');
  }

  const legacy =
    buildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1(input);
  const targetSpec = record(
    parseStrictJsonPreservingNumbers(
      strictUtf8(legacy.chainSpecBytes, 'legacy application embedding'),
      'legacy application embedding',
    ),
    'legacy application embedding',
  );
  const targetRuntimeGenesis = childRecord(
    childRecord(targetSpec, 'genesis', 'generated chain spec'),
    'runtimeGenesis',
    'generated genesis',
  );
  const targetPatch = childRecord(
    targetRuntimeGenesis,
    'patch',
    'generated runtime genesis',
  );
  if (Object.hasOwn(targetPatch, 'bridgeCommitment')) {
    throw new Error('legacy application embedding introduced bridge profile state');
  }
  if (exactSudoConfig(targetPatch.sudo) !== baseSudo) {
    throw new Error('legacy application embedding changed the Sudo identity');
  }
  targetPatch.sudo = { key: null };
  targetPatch.bridgeCommitment = {
    legacyMintQuarantineAddress: legacy.report.application.bridgeAddress,
  };
  targetSpec.name = SPEC_NAME;
  targetSpec.id = SPEC_ID;
  targetSpec.protocolId = PROTOCOL_ID;

  const chainSpecBytes = Buffer.from(
    stringifyJsonPreservingNumbers(targetSpec),
    'utf8',
  );
  const report = Object.freeze({
    schema: SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_CHAIN_SPEC_V1_SCHEMA,
    version: 1 as const,
    status: 'isolated_authority_safe_genesis_candidate' as const,
    baseSpecSha256Hex: legacy.report.baseSpecSha256Hex,
    legacyApplicationEmbeddingSha256Hex:
      legacy.report.chainSpecSha256Hex,
    chainSpecSha256Hex: sha256(chainSpecBytes),
    chainSpecBytes: chainSpecBytes.length,
    chain: Object.freeze({
      name: SPEC_NAME,
      id: SPEC_ID,
      protocolId: PROTOCOL_ID,
      chainType: 'Development' as const,
      chainId: legacy.report.chain.chainId,
    }),
    source: Object.freeze({
      frontierCommit: source.frontierCommit,
      frontierPatchSha256Hex: source.frontierPatchSha256Hex,
      runtimeCodeByteLength: runtimeCode.length,
      runtimeCodeSha256Hex,
      removedSudoAddress: baseSudo,
    }),
    application: legacy.report.application,
    checks: Object.freeze({
      trackedSolidityBuildClosureVerified: true as const,
      trackedStorageLayoutsVerified: true as const,
      trackedFrontierPatchBytesVerified: true as const,
      runtimeCodePinVerified: true as const,
      applicationRuntimeCodeEmbeddedAtGenesis: true as const,
      exactApplicationBindingsInitialized: true as const,
      typedLegacyMintQuarantineConfigured: true as const,
      sudoKeyRemoved: true as const,
      activeMintProfileGenesisFieldsAbsent: true as const,
      noBootnodesEmbedded: true as const,
      telemetryDisabled: true as const,
    }),
    boundaries: Object.freeze({
      isolatedDevelopmentTargetOnly: true as const,
      historicalOwnerMintEntrypointEmbedded: true as const,
      authoritySafeTargetIdentityObserved: false as const,
      legacyOwnerMintRuntimeRejectionObserved: false as const,
      independentSourceOriginsEstablished: false as const,
      federatedLaunchEligible: false as const,
      federatedMintAuthorityEstablished: false as const,
      sourceHistoryAuthenticated: false as const,
      sourceFinalityAuthenticated: false as const,
      ergoHistoryAuthenticated: false as const,
      launchStatementProduced: false as const,
      sourceAttestationProduced: false as const,
      transactionConstructed: false as const,
      transactionSigned: false as const,
      transactionSubmitted: false as const,
      transactionBroadcast: false as const,
      profileActivated: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  const result = Object.freeze({
    chainSpecBytes: Uint8Array.from(chainSpecBytes),
    report,
  });
  validateSubstrateFederatedAuthoritySafeDevnetChainSpecV1({
    bridgeRoot,
    baseSpecBytes,
    ...result,
    expectedChainId,
    expectedBridgeAddress,
    expectedTokenAddress,
    expectedBridgeOwnerAddress,
    expectedBaseSpecSha256Hex,
    expectedFrontierCommit,
    expectedFrontierPatchSha256Hex: expectedPatchSha256Hex,
    expectedRuntimeCodeSha256Hex,
    expectedSudoAddress,
  });
  return result;
}

export function validateSubstrateFederatedAuthoritySafeDevnetChainSpecV1(
  input: Readonly<
    ValidateSubstrateFederatedAuthoritySafeDevnetChainSpecV1Input
  >,
): void {
  const bridgeRoot = resolve(nonemptyString(input.bridgeRoot, 'bridge root'));
  const baseSpecBytes = boundedBytes(input.baseSpecBytes);
  const chainSpecBytes = boundedBytes(input.chainSpecBytes);
  const report = input.report;
  const expectedChainId = positiveChainId(input.expectedChainId);
  if (expectedChainId === 1n) {
    throw new Error('authority-safe chain spec refuses chain ID 1');
  }
  const expectedBridgeAddress = evmAddress(
    input.expectedBridgeAddress,
    'expected bridge address',
  );
  const expectedTokenAddress = evmAddress(
    input.expectedTokenAddress,
    'expected token address',
  );
  const expectedBridgeOwnerAddress = evmAddress(
    input.expectedBridgeOwnerAddress,
    'expected bridge owner address',
  );
  const expectedBaseSpecSha256Hex = sha256Hex(
    input.expectedBaseSpecSha256Hex,
    'expected base-spec SHA-256',
  );
  if (sha256(baseSpecBytes) !== expectedBaseSpecSha256Hex) {
    throw new Error('validation base Frontier chain spec differs from the explicit pin');
  }
  const expectedFrontierCommit = lowercaseHex(
    input.expectedFrontierCommit,
    40,
    'expected Frontier commit',
  );
  const expectedFrontierPatchSha256Hex = sha256Hex(
    input.expectedFrontierPatchSha256Hex,
    'expected Frontier patch SHA-256',
  );
  const expectedRuntimeCodeSha256Hex = sha256Hex(
    input.expectedRuntimeCodeSha256Hex,
    'expected runtime code SHA-256',
  );
  const expectedSudoAddress = evmAddress(
    input.expectedSudoAddress,
    'expected Sudo address',
  );
  const expectedLegacy =
    buildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1({
      bridgeRoot,
      baseSpecBytes,
      expectedChainId,
      bridgeAddress: expectedBridgeAddress,
      tokenAddress: expectedTokenAddress,
      bridgeOwnerAddress: expectedBridgeOwnerAddress,
    });
  assertExactKeys(
    report as unknown as Record<string, unknown>,
    [
      'schema',
      'version',
      'status',
      'baseSpecSha256Hex',
      'legacyApplicationEmbeddingSha256Hex',
      'chainSpecSha256Hex',
      'chainSpecBytes',
      'chain',
      'source',
      'application',
      'checks',
      'boundaries',
    ],
    'authority-safe candidate report',
  );
  if (
    report.schema
      !== SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_CHAIN_SPEC_V1_SCHEMA
    || report.version !== 1
    || report.status !== 'isolated_authority_safe_genesis_candidate'
  ) {
    throw new Error('authority-safe candidate report identity is unsupported');
  }
  if (report.baseSpecSha256Hex !== expectedBaseSpecSha256Hex) {
    throw new Error('authority-safe base-spec provenance drifted');
  }
  if (
    report.legacyApplicationEmbeddingSha256Hex
      !== expectedLegacy.report.chainSpecSha256Hex
  ) {
    throw new Error('legacy application embedding differs from the pinned base spec');
  }
  if (
    report.chainSpecSha256Hex !== sha256(chainSpecBytes)
    || report.chainSpecBytes !== chainSpecBytes.byteLength
  ) {
    throw new Error('authority-safe candidate bytes differ from the report');
  }
  assertExactKeys(
    report.chain as unknown as Record<string, unknown>,
    ['name', 'id', 'protocolId', 'chainType', 'chainId'],
    'authority-safe chain report',
  );
  if (
    report.chain.name !== SPEC_NAME
    || report.chain.id !== SPEC_ID
    || report.chain.protocolId !== PROTOCOL_ID
    || report.chain.chainType !== 'Development'
    || report.chain.chainId !== expectedChainId.toString()
  ) {
    throw new Error('authority-safe chain report drifted');
  }
  assertExactKeys(
    report.source as unknown as Record<string, unknown>,
    [
      'frontierCommit',
      'frontierPatchSha256Hex',
      'runtimeCodeByteLength',
      'runtimeCodeSha256Hex',
      'removedSudoAddress',
    ],
    'authority-safe source report',
  );
  if (
    report.source.frontierCommit !== expectedFrontierCommit
    || report.source.frontierPatchSha256Hex
      !== expectedFrontierPatchSha256Hex
    || report.source.runtimeCodeSha256Hex
      !== expectedRuntimeCodeSha256Hex
    || report.source.removedSudoAddress !== expectedSudoAddress
    || !Number.isSafeInteger(report.source.runtimeCodeByteLength)
    || report.source.runtimeCodeByteLength <= 0
  ) {
    throw new Error('authority-safe source report drifted from explicit pins');
  }
  loadFrontierSourceClosure(
    bridgeRoot,
    expectedFrontierCommit,
    expectedFrontierPatchSha256Hex,
  );
  const artifactProfile = loadTrackedDeploymentIdentityArtifactProfile(
    bridgeRoot,
  );
  assertDeploymentIdentityArtifactProfileProvenance(artifactProfile);
  assertTrackedStorageLayouts(bridgeRoot);
  assertExactKeys(
    report.application as unknown as Record<string, unknown>,
    [
      'bridgeAddress',
      'tokenAddress',
      'bridgeOwnerAddress',
      'tokenOwnerAddress',
      'bridgeRuntimeByteLength',
      'bridgeRuntimeBytecodeSha256Hex',
      'tokenRuntimeByteLength',
      'tokenRuntimeBytecodeSha256Hex',
      'artifactProfileDigestHex',
      'buildManifestSha256Hex',
    ],
    'authority-safe application report',
  );
  const bridgeAddress = evmAddress(
    report.application.bridgeAddress,
    'reported bridge address',
  );
  const tokenAddress = evmAddress(
    report.application.tokenAddress,
    'reported token address',
  );
  const bridgeOwnerAddress = evmAddress(
    report.application.bridgeOwnerAddress,
    'reported bridge owner address',
  );
  const tokenOwnerAddress = evmAddress(
    report.application.tokenOwnerAddress,
    'reported token owner address',
  );
  if (
    bridgeAddress !== expectedBridgeAddress
    || tokenAddress !== expectedTokenAddress
    || bridgeOwnerAddress !== expectedBridgeOwnerAddress
    || bridgeAddress === tokenAddress
    || tokenOwnerAddress !== bridgeAddress
    || report.application.bridgeRuntimeByteLength
      !== artifactProfile.bridge.runtimeByteLength
    || report.application.bridgeRuntimeBytecodeSha256Hex
      !== artifactProfile.bridge.runtimeBytecodeSha256Hex
    || report.application.tokenRuntimeByteLength
      !== artifactProfile.token.runtimeByteLength
    || report.application.tokenRuntimeBytecodeSha256Hex
      !== artifactProfile.token.runtimeBytecodeSha256Hex
    || report.application.artifactProfileDigestHex
      !== artifactProfile.profileDigestHex
    || report.application.buildManifestSha256Hex
      !== artifactProfile.buildManifestSha256Hex
  ) {
    throw new Error('authority-safe application report drifted from tracked artifacts');
  }
  assertExactKeys(
    report.checks as unknown as Record<string, unknown>,
    [
      'trackedSolidityBuildClosureVerified',
      'trackedStorageLayoutsVerified',
      'trackedFrontierPatchBytesVerified',
      'runtimeCodePinVerified',
      'applicationRuntimeCodeEmbeddedAtGenesis',
      'exactApplicationBindingsInitialized',
      'typedLegacyMintQuarantineConfigured',
      'sudoKeyRemoved',
      'activeMintProfileGenesisFieldsAbsent',
      'noBootnodesEmbedded',
      'telemetryDisabled',
    ],
    'authority-safe checks report',
  );
  if (Object.values(report.checks).some(value => value !== true)) {
    throw new Error('authority-safe checks report contains an unverified claim');
  }
  assertExactKeys(
    report.boundaries as unknown as Record<string, unknown>,
    [
      'isolatedDevelopmentTargetOnly',
      'historicalOwnerMintEntrypointEmbedded',
      'authoritySafeTargetIdentityObserved',
      'legacyOwnerMintRuntimeRejectionObserved',
      'independentSourceOriginsEstablished',
      'federatedLaunchEligible',
      'federatedMintAuthorityEstablished',
      'sourceHistoryAuthenticated',
      'sourceFinalityAuthenticated',
      'ergoHistoryAuthenticated',
      'launchStatementProduced',
      'sourceAttestationProduced',
      'transactionConstructed',
      'transactionSigned',
      'transactionSubmitted',
      'transactionBroadcast',
      'profileActivated',
      'gate5Closed',
      'trustlessStatusEstablished',
      'productionReadinessEstablished',
    ],
    'authority-safe boundaries report',
  );
  if (
    report.boundaries.isolatedDevelopmentTargetOnly !== true
    || report.boundaries.historicalOwnerMintEntrypointEmbedded !== true
  ) {
    throw new Error('authority-safe candidate report weakens required boundaries');
  }
  const spec = record(
    parseStrictJsonPreservingNumbers(
      strictUtf8(chainSpecBytes, 'authority-safe chain spec'),
      'authority-safe chain spec',
    ),
    'authority-safe chain spec',
  );
  if (
    spec.name !== report.chain.name
    || spec.id !== report.chain.id
    || spec.protocolId !== report.chain.protocolId
    || spec.chainType !== report.chain.chainType
    || !Array.isArray(spec.bootNodes)
    || spec.bootNodes.length !== 0
    || spec.telemetryEndpoints !== null
  ) {
    throw new Error('authority-safe chain identity or isolated scope drifted');
  }
  const runtimeGenesis = childRecord(
    childRecord(spec, 'genesis', 'authority-safe chain spec'),
    'runtimeGenesis',
    'authority-safe genesis',
  );
  const patch = childRecord(
    runtimeGenesis,
    'patch',
    'authority-safe runtime genesis',
  );
  const sudo = record(patch.sudo, 'authority-safe Sudo genesis config');
  assertExactKeys(sudo, ['key'], 'authority-safe Sudo genesis config');
  if (sudo.key !== null) {
    throw new Error('authority-safe Sudo key must remain absent');
  }
  const bridgeCommitment = record(
    patch.bridgeCommitment,
    'authority-safe bridge commitment genesis config',
  );
  assertExactKeys(
    bridgeCommitment,
    ['legacyMintQuarantineAddress'],
    'authority-safe bridge commitment genesis config',
  );
  if (
    bridgeCommitment.legacyMintQuarantineAddress
      !== report.application.bridgeAddress
  ) {
    throw new Error('authority-safe mint quarantine address drifted');
  }
  const evmChainId = childRecord(
    patch,
    'evmChainId',
    'authority-safe runtime genesis',
  );
  if (
    Object.keys(evmChainId).length !== 1
    || BigInt(jsonUnsignedInteger(evmChainId.chainId, 'EVM chain ID'))
      !== BigInt(report.chain.chainId)
  ) {
    throw new Error('authority-safe EVM chain identity drifted');
  }
  const runtimeCode = runtimeBytes(runtimeGenesis.code);
  if (
    runtimeCode.length !== report.source.runtimeCodeByteLength
    || sha256(runtimeCode) !== report.source.runtimeCodeSha256Hex
  ) {
    throw new Error('authority-safe runtime code drifted');
  }
  const accounts = childRecord(
    childRecord(patch, 'evm', 'authority-safe runtime genesis'),
    'accounts',
    'authority-safe EVM genesis',
  );
  validateApplicationAccount(
    accounts,
    bridgeAddress,
    report.application.bridgeRuntimeByteLength,
    report.application.bridgeRuntimeBytecodeSha256Hex,
    {
      [storageSlot(0)]: addressWord(bridgeOwnerAddress),
      [storageSlot(3)]: addressWord(tokenAddress),
    },
    'bridge',
  );
  validateApplicationAccount(
    accounts,
    tokenAddress,
    report.application.tokenRuntimeByteLength,
    report.application.tokenRuntimeBytecodeSha256Hex,
    {
      [storageSlot(3)]: shortStringWord('Sidechain ERG'),
      [storageSlot(4)]: shortStringWord('sERG'),
      [storageSlot(5)]: addressWord(bridgeAddress),
    },
    'token',
  );
  for (const boundary of [
    report.boundaries.authoritySafeTargetIdentityObserved,
    report.boundaries.legacyOwnerMintRuntimeRejectionObserved,
    report.boundaries.independentSourceOriginsEstablished,
    report.boundaries.federatedLaunchEligible,
    report.boundaries.federatedMintAuthorityEstablished,
    report.boundaries.sourceHistoryAuthenticated,
    report.boundaries.sourceFinalityAuthenticated,
    report.boundaries.ergoHistoryAuthenticated,
    report.boundaries.launchStatementProduced,
    report.boundaries.sourceAttestationProduced,
    report.boundaries.transactionConstructed,
    report.boundaries.transactionSigned,
    report.boundaries.transactionSubmitted,
    report.boundaries.transactionBroadcast,
    report.boundaries.profileActivated,
    report.boundaries.gate5Closed,
    report.boundaries.trustlessStatusEstablished,
    report.boundaries.productionReadinessEstablished,
  ]) {
    if (boundary !== false) {
      throw new Error('authority-safe candidate report widens authority');
    }
  }
  const legacySpec = record(
    parseStrictJsonPreservingNumbers(
      strictUtf8(chainSpecBytes, 'authority-safe chain spec'),
      'authority-safe chain spec',
    ),
    'authority-safe chain spec',
  );
  const legacyPatch = childRecord(
    childRecord(
      childRecord(legacySpec, 'genesis', 'authority-safe chain spec'),
      'runtimeGenesis',
      'authority-safe genesis',
    ),
    'patch',
    'authority-safe runtime genesis',
  );
  delete legacyPatch.bridgeCommitment;
  legacyPatch.sudo = { key: expectedSudoAddress };
  legacySpec.name =
    SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_NAME;
  legacySpec.id =
    SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_ID;
  legacySpec.protocolId =
    SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_PROTOCOL_ID;
  const legacyEmbeddingBytes = Buffer.from(
    stringifyJsonPreservingNumbers(legacySpec),
    'utf8',
  );
  if (
    !Buffer.from(legacyEmbeddingBytes).equals(
      Buffer.from(expectedLegacy.chainSpecBytes),
    )
  ) {
    throw new Error('legacy application embedding provenance drifted');
  }
}

function loadFrontierSourceClosure(
  bridgeRoot: string,
  expectedFrontierCommit: string,
  expectedPatchSha256Hex: string,
): Readonly<{
  frontierCommit: string;
  frontierPatchSha256Hex: string;
}> {
  const lock = record(
    parseStrictJson(
      readFileSync(resolve(bridgeRoot, SOURCE_LOCK_PATH), 'utf8'),
      SOURCE_LOCK_PATH,
    ),
    'consensus source lock',
  );
  if (lock.schemaVersion !== 3 || lock.kind !== 'bridge-consensus-source-lock') {
    throw new Error('consensus source lock identity is unsupported');
  }
  const frontier = childRecord(lock, 'frontier', 'consensus source lock');
  const frontierCommit = lowercaseHex(frontier.commit, 40, 'Frontier commit');
  if (frontierCommit !== expectedFrontierCommit) {
    throw new Error('Frontier commit differs from the explicit pin');
  }
  if (frontier.patchPath !== FRONTIER_PATCH_PATH) {
    throw new Error('Frontier patch path differs from the authority-safe profile');
  }
  const frontierPatchSha256Hex = sha256Hex(
    frontier.patchSha256,
    'source-lock Frontier patch SHA-256',
  );
  if (frontierPatchSha256Hex !== expectedPatchSha256Hex) {
    throw new Error('Frontier patch digest differs from the explicit pin');
  }
  const actualPatchSha256Hex = sha256(
    readFileSync(resolve(bridgeRoot, FRONTIER_PATCH_PATH)),
  );
  if (actualPatchSha256Hex !== frontierPatchSha256Hex) {
    throw new Error('tracked Frontier patch bytes differ from the source lock');
  }
  return Object.freeze({ frontierCommit, frontierPatchSha256Hex });
}

function exactSudoConfig(value: unknown): string {
  const sudo = record(value, 'base Sudo genesis config');
  if (
    Object.keys(sudo).length !== 1
    || !Object.hasOwn(sudo, 'key')
  ) {
    throw new Error('base Sudo genesis config must contain only one key');
  }
  return evmAddress(sudo.key, 'base Sudo key');
}

function runtimeBytes(value: unknown): Uint8Array {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/.test(value)
  ) {
    throw new Error('base Frontier runtime code must be canonical lowercase hex');
  }
  return Uint8Array.from(Buffer.from(value.slice(2), 'hex'));
}

function validateApplicationAccount(
  accounts: Readonly<Record<string, unknown>>,
  address: string,
  expectedRuntimeByteLength: number,
  expectedRuntimeSha256Hex: string,
  expectedStorage: Readonly<Record<string, string>>,
  label: string,
): void {
  const matches = Object.entries(accounts).filter(
    ([key]) => key.toLowerCase() === address,
  );
  if (matches.length !== 1) {
    throw new Error(`authority-safe ${label} account identity drifted`);
  }
  if (matches[0]![0] !== address) {
    throw new Error(`authority-safe ${label} account key is not canonical`);
  }
  const account = record(matches[0]![1], `authority-safe ${label} account`);
  assertExactKeys(
    account,
    ['balance', 'code', 'nonce', 'storage'],
    `authority-safe ${label} account`,
  );
  if (account.balance !== '0x0' || account.nonce !== '0x1') {
    throw new Error(`authority-safe ${label} account header drifted`);
  }
  const code = byteArray(account.code, `authority-safe ${label} runtime code`);
  if (
    code.length !== expectedRuntimeByteLength
    || sha256(code) !== expectedRuntimeSha256Hex
  ) {
    throw new Error(`authority-safe ${label} runtime code drifted`);
  }
  const storage = record(
    account.storage,
    `authority-safe ${label} storage`,
  );
  assertExactKeys(
    storage,
    Object.keys(expectedStorage),
    `authority-safe ${label} storage`,
  );
  for (const [key, expected] of Object.entries(expectedStorage)) {
    if (storage[key] !== expected) {
      throw new Error(`authority-safe ${label} storage binding drifted`);
    }
  }
}

function byteArray(value: unknown, label: string): Uint8Array {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a nonempty byte array`);
  }
  const bytes = value.map(byte => Number(jsonUnsignedInteger(byte, label)));
  if (bytes.some(byte => byte > 255)) {
    throw new Error(`${label} must be a nonempty byte array`);
  }
  return Uint8Array.from(bytes);
}

function jsonUnsignedInteger(value: unknown, label: string): string {
  const source = stringifyJsonPreservingNumbers(value);
  if (!/^(?:0|[1-9][0-9]*)$/.test(source)) {
    throw new Error(`${label} must be a nonnegative JSON integer`);
  }
  return source;
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${label} fields drifted`);
  }
}

function addressWord(value: string): string {
  return `0x${'0'.repeat(24)}${value.slice(2)}`;
}

function storageSlot(value: number): string {
  return `0x${value.toString(16).padStart(64, '0')}`;
}

function shortStringWord(value: string): string {
  const bytes = Buffer.from(value, 'utf8');
  return `0x${bytes.toString('hex').padEnd(62, '0')}${(bytes.length * 2)
    .toString(16)
    .padStart(2, '0')}`;
}

function evmAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be canonical lowercase 20-byte hex`);
  }
  if (/^0x0{40}$/.test(value)) throw new Error(`${label} must not be zero`);
  return value;
}

function positiveChainId(value: unknown): bigint {
  if (typeof value !== 'bigint' || value <= 0n) {
    throw new Error('expected chain ID must be a positive bigint');
  }
  return value;
}

function boundedBytes(value: Uint8Array): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error('base Frontier chain spec must be bytes');
  }
  if (value.byteLength === 0 || value.byteLength > MAX_BASE_SPEC_BYTES) {
    throw new Error('base Frontier chain spec size is outside the bounded limit');
  }
  return Uint8Array.from(value);
}

function childRecord(
  parent: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): Record<string, unknown> {
  return record(parent[key], `${label} ${key}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function lowercaseHex(value: unknown, length: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase hex`);
  }
  return value;
}

function sha256Hex(value: unknown, label: string): string {
  return lowercaseHex(value, 64, label);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function strictUtf8(value: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new Error(`${label} must be canonical UTF-8`);
  }
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}
