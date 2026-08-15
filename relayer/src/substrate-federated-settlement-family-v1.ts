import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_RECEIPT_V1_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION,
  VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION,
  VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT,
  type ValidityApplicationPooledReserveCompilerBatchV1,
  type ValidityApplicationPooledReserveCompilerReceiptV1,
} from './validity-application-pooled-reserve-instance-v4.js';

export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA =
  'e2s.substrate-federated-settlement-family.v1' as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_REQUEST_SCHEMA =
  'e2s.substrate-federated-settlement-family-compiler-request.v1' as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_IDENTITY_SCHEMA =
  'e2s.substrate-federated-settlement-family-identity.v1' as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1' as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_BYTES = 596 as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX =
  '8a6fa2b2acba330f92718389fc401cc7f15f67602282d949958cc072406fa20e' as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS =
  Object.freeze({
    duplicatePrevention:
      '3a3c8f40d4901b8ae30a5b6a43c001127bcf8d4cb6a3e89bc1b075620b7683e4',
    sourceLock:
      '76c16560b4232d3d992febfd3a9939b67203424087b5b54a1845e13b39464402',
    pooledReserve:
      '16ac723b2c5e899240173abbb5632aa4a1730c0688ada499898a63b05389421c',
  } as const);

export const SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS =
  10_000 as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS =
  10 as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_MAX_SUCCESSOR_HEIGHT_LAG =
  100 as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_MIN_EXTERNAL_FEE_NANOERG =
  1_000_000n;
export const SUBSTRATE_FEDERATED_SETTLEMENT_MAX_EXTERNAL_FEE_NANOERG =
  2_100_000n;
export const SUBSTRATE_FEDERATED_SETTLEMENT_NATIVE_ERG_ASSET_ID_HEX =
  '00'.repeat(32);

const CONTRACT_PATHS = Object.freeze({
  duplicatePrevention:
    'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  sourceLock: 'contracts/MainChainLockPooledReserveV6.es',
  pooledReserve:
    'contracts/MainChainPooledReserveValidityApplicationV6.es',
} as const);
const PLACEHOLDER_PATTERN = /[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g;
const PLACEHOLDERS = Object.freeze({
  duplicatePrevention: Object.freeze([
    'FEDERATED_SETTLEMENT_TRACKER_NFT_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_DUP_NFT_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_RESERVE_NFT_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_FAMILY_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_TRACKER_CONTRACT_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_SOURCE_NETWORK_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_SIDECHAIN_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_RUNTIME_PROFILE_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_FEDERATION_PROFILE_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_ERGO_KEY_SET_DIGEST_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_ERGO_THRESHOLD_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_EPOCH_PLACEHOLDER',
  ] as const),
  sourceLock: Object.freeze([
    'POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
    'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
    'POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
  ] as const),
  pooledReserve: Object.freeze([
    'POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
    'POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
    'POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER',
    'POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER',
  ] as const),
});

type ContractRole = keyof typeof CONTRACT_PATHS;
type Template = Readonly<{
  relativePath: string;
  source: string;
  sha256Hex: string;
}>;
type Templates = Readonly<Record<ContractRole, Template>>;
const requestTemplates = new WeakMap<object, Templates>();
const validatedIdentities = new WeakSet<object>();

export interface SubstrateFederatedSettlementFamilyV1Template {
  readonly relativePath: string;
  readonly source: string;
}

export interface SubstrateFederatedSettlementFamilyV1ResolvedSources {
  readonly duplicatePrevention: string;
  readonly sourceLock: string;
  readonly pooledReserve: string;
}

export interface SubstrateFederatedSettlementFamilyV1PredecessorSources {
  readonly duplicatePrevention: string;
  readonly sourceLock: string;
}

export interface SubstrateFederatedSettlementFamilyV1PredecessorContractIds {
  readonly duplicatePreventionContractIdHex: string;
  readonly sourceLockContractIdHex: string;
}

export interface SubstrateFederatedSettlementTrackerBindingV1 {
  readonly contractIdHex: string;
  readonly templateSourceSha256Hex: string;
  readonly trackerNftIdHex: string;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly runtimeProfileIdHex: string;
  readonly settlementProfileIdHex: string;
  readonly federationProfileIdHex: string;
  readonly sourceAttestationKeySetDigestHex: string;
  readonly sourceAttestationThreshold: number;
  readonly ergoAdmissionKeySetDigestHex: string;
  readonly ergoAdmissionThreshold: number;
  readonly federationEpoch: string;
}

export interface BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput {
  readonly templates: Readonly<Record<
    ContractRole,
    SubstrateFederatedSettlementFamilyV1Template
  >>;
  readonly duplicatePreventionGenesisInputBoxIdHex: string;
  readonly pooledReserveGenesisInputBoxIdHex: string;
  readonly tracker: Readonly<SubstrateFederatedSettlementTrackerBindingV1>;
}

export interface SubstrateFederatedSettlementFamilyV1Profile {
  readonly schema: typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA;
  readonly version: 1;
  readonly encodedProfileHex: string;
  readonly familyIdHex: string;
  readonly duplicatePreventionNftIdHex: string;
  readonly pooledReserveNftIdHex: string;
}

interface FalseBoundaries {
  readonly profileActivated: false;
  readonly nodeCheckPerformed: false;
  readonly signingAuthorityEstablished: false;
  readonly submissionAuthorityEstablished: false;
  readonly broadcastAuthorityEstablished: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
}

export interface SubstrateFederatedSettlementFamilyV1CompilerRequest {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_REQUEST_SCHEMA;
  readonly version: 1;
  readonly sigmaStateCommit: string;
  readonly contracts: readonly {
    readonly role: ContractRole;
    readonly relativePath: string;
    readonly templateSha256Hex: string;
  }[];
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1Profile>;
  readonly tracker: Readonly<SubstrateFederatedSettlementTrackerBindingV1>;
  readonly policies: {
    readonly sourceRefundDelayBlocks:
      typeof SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS;
    readonly minimumAnchorConfirmations:
      typeof SUBSTRATE_FEDERATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS;
    readonly maximumSuccessorCreationHeightLag:
      typeof SUBSTRATE_FEDERATED_SETTLEMENT_MAX_SUCCESSOR_HEIGHT_LAG;
    readonly minimumExternalFeeNanoErg: string;
    readonly maximumExternalFeeNanoErg: string;
    readonly settlementAssetIdHex: string;
    readonly burnLeafVersion: 1;
    readonly settlementBundleVersion: 2;
  };
  readonly boundaries: FalseBoundaries;
}

export interface SubstrateFederatedSettlementFamilyV1Identity {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_IDENTITY_SCHEMA;
  readonly version: 1;
  readonly compilerBatchSha256Hex:
    typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX;
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1Profile>;
  readonly contracts: Readonly<Record<ContractRole, Readonly<{
    templateSha256Hex: string;
    resolvedSourceSha256Hex: string;
    receipt: Readonly<ValidityApplicationPooledReserveCompilerReceiptV1>;
  }>>>;
  readonly semanticDelta: {
    readonly federatedTrackerKeyAndValueConsumed: true;
    readonly federatedTrackerAuthorityBound: true;
    readonly burnLeafV1Preserved: true;
    readonly settlementBundleV2Preserved: true;
    readonly soleDuplicatePreventionAuthorityPreserved: true;
    readonly nativeErgConservationPreserved: true;
    readonly exactPayoutBindingPreserved: true;
    readonly externalFeeFundingPreserved: true;
    readonly sourceLockCommitRefundExclusivityPreserved: true;
    readonly sourceLockTemplateReusedByteForByte: true;
    readonly pooledReserveTemplateReusedByteForByte: true;
    readonly frozenV6ContractIdentitiesReused: false;
  };
  readonly relations: {
    readonly trackerBoundIntoDuplicatePrevention: true;
    readonly duplicatePreventionBoundIntoPooledReserve: true;
    readonly sourceLockBoundIntoPooledReserve: true;
    readonly trackerBoundIntoPooledReserveViaDuplicatePrevention: true;
  };
  readonly boundaries: FalseBoundaries & {
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export interface SubstrateFederatedSettlementFamilyV1DecodedProfile {
  readonly version: 1;
  readonly hashAlgorithmId: 1;
  readonly settlementAssetProfileId: 1;
  readonly flags: 0;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly runtimeProfileIdHex: string;
  readonly settlementProfileIdHex: string;
  readonly federationProfileIdHex: string;
  readonly sourceAttestationKeySetDigestHex: string;
  readonly sourceAttestationThreshold: number;
  readonly ergoAdmissionKeySetDigestHex: string;
  readonly ergoAdmissionThreshold: number;
  readonly federationEpoch: string;
  readonly trackerNftIdHex: string;
  readonly duplicatePreventionNftIdHex: string;
  readonly pooledReserveNftIdHex: string;
  readonly trackerContractIdHex: string;
  readonly trackerTemplateSourceSha256Hex: string;
  readonly duplicatePreventionTemplateSha256Hex: string;
  readonly sourceLockTemplateSha256Hex: string;
  readonly pooledReserveTemplateSha256Hex: string;
  readonly sourceRefundDelayBlocks: number;
  readonly minimumAnchorConfirmations: number;
  readonly maximumSuccessorCreationHeightLag: number;
  readonly minimumExternalFeeNanoErg: string;
  readonly maximumExternalFeeNanoErg: string;
  readonly settlementAssetIdHex: string;
}

export function buildSubstrateFederatedSettlementFamilyV1CompilerRequest(
  input: BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput,
): Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest> {
  assertExactKeys(input, [
    'templates',
    'duplicatePreventionGenesisInputBoxIdHex',
    'pooledReserveGenesisInputBoxIdHex',
    'tracker',
  ], 'substrate federated settlement-family compiler input');
  assertExactKeys(input.templates, [
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ], 'substrate federated settlement-family templates');
  const templates = normalizeTemplates(input.templates);
  const tracker = normalizeTrackerBinding(input.tracker);
  const duplicatePreventionNftIdHex = nonzeroHex(
    input.duplicatePreventionGenesisInputBoxIdHex,
    32,
    'duplicate-prevention genesis input box ID',
  );
  const pooledReserveNftIdHex = nonzeroHex(
    input.pooledReserveGenesisInputBoxIdHex,
    32,
    'pooled-reserve genesis input box ID',
  );
  if (
    new Set([
      tracker.trackerNftIdHex,
      duplicatePreventionNftIdHex,
      pooledReserveNftIdHex,
    ]).size !== 3
  ) {
    throw new Error('federated settlement singleton IDs must be pairwise distinct');
  }

  const encodedProfile = Buffer.concat([
    Buffer.from([1, 1, 1, 0]),
    bytes(tracker.sourceNetworkIdHex),
    bytes(tracker.sidechainIdHex),
    bytes(tracker.bridgeAddressHex),
    bytes(tracker.tokenAddressHex),
    bytes(tracker.runtimeProfileIdHex),
    bytes(tracker.settlementProfileIdHex),
    bytes(tracker.federationProfileIdHex),
    bytes(tracker.sourceAttestationKeySetDigestHex),
    uint16Be(tracker.sourceAttestationThreshold),
    bytes(tracker.ergoAdmissionKeySetDigestHex),
    uint16Be(tracker.ergoAdmissionThreshold),
    uint64Be(tracker.federationEpoch),
    bytes(tracker.trackerNftIdHex),
    bytes(duplicatePreventionNftIdHex),
    bytes(pooledReserveNftIdHex),
    bytes(tracker.contractIdHex),
    bytes(tracker.templateSourceSha256Hex),
    bytes(templates.duplicatePrevention.sha256Hex),
    bytes(templates.sourceLock.sha256Hex),
    bytes(templates.pooledReserve.sha256Hex),
    uint32Be(SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS),
    uint32Be(SUBSTRATE_FEDERATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS),
    uint32Be(SUBSTRATE_FEDERATED_SETTLEMENT_MAX_SUCCESSOR_HEIGHT_LAG),
    uint64Be(
      SUBSTRATE_FEDERATED_SETTLEMENT_MIN_EXTERNAL_FEE_NANOERG.toString(),
    ),
    uint64Be(
      SUBSTRATE_FEDERATED_SETTLEMENT_MAX_EXTERNAL_FEE_NANOERG.toString(),
    ),
    bytes(SUBSTRATE_FEDERATED_SETTLEMENT_NATIVE_ERG_ASSET_ID_HEX),
  ]);
  if (
    encodedProfile.length
      !== SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_BYTES
  ) {
    throw new Error('federated settlement-family profile length drifted');
  }
  const familyIdHex = blake2b256Hex(Buffer.concat([
    Buffer.from(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_DOMAIN, 'ascii'),
    encodedProfile,
  ]));
  const profile = deepFreeze({
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
    version: 1 as const,
    encodedProfileHex: encodedProfile.toString('hex'),
    familyIdHex,
    duplicatePreventionNftIdHex,
    pooledReserveNftIdHex,
  });
  const request = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_REQUEST_SCHEMA,
    version: 1 as const,
    sigmaStateCommit:
      VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT,
    contracts: (Object.keys(CONTRACT_PATHS) as ContractRole[]).map(role => ({
      role,
      relativePath: templates[role].relativePath,
      templateSha256Hex: templates[role].sha256Hex,
    })),
    profile,
    tracker,
    policies: {
      sourceRefundDelayBlocks:
        SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS,
      minimumAnchorConfirmations:
        SUBSTRATE_FEDERATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS,
      maximumSuccessorCreationHeightLag:
        SUBSTRATE_FEDERATED_SETTLEMENT_MAX_SUCCESSOR_HEIGHT_LAG,
      minimumExternalFeeNanoErg:
        SUBSTRATE_FEDERATED_SETTLEMENT_MIN_EXTERNAL_FEE_NANOERG.toString(),
      maximumExternalFeeNanoErg:
        SUBSTRATE_FEDERATED_SETTLEMENT_MAX_EXTERNAL_FEE_NANOERG.toString(),
      settlementAssetIdHex:
        SUBSTRATE_FEDERATED_SETTLEMENT_NATIVE_ERG_ASSET_ID_HEX,
      burnLeafVersion: 1 as const,
      settlementBundleVersion: 2 as const,
    },
    boundaries: falseBoundaries(),
  });
  requestTemplates.set(request, templates);
  return request;
}

export function resolveSubstrateFederatedSettlementFamilyV1Sources(
  request: Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest>,
): Readonly<SubstrateFederatedSettlementFamilyV1ResolvedSources> {
  const predecessors =
    resolveSubstrateFederatedSettlementFamilyV1PredecessorSources(request);
  const pooledReserve = resolveSubstrateFederatedSettlementFamilyV1PooledReserveSource(
    request,
    {
      duplicatePreventionContractIdHex:
        SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS
          .duplicatePrevention,
      sourceLockContractIdHex:
        SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS.sourceLock,
    },
  );
  return deepFreeze({
    ...predecessors,
    pooledReserve,
  });
}

export function resolveSubstrateFederatedSettlementFamilyV1PredecessorSources(
  request: Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest>,
): Readonly<SubstrateFederatedSettlementFamilyV1PredecessorSources> {
  const templates = getRequestTemplates(request);

  const duplicatePrevention = resolveTemplate(
    templates.duplicatePrevention.source,
    [
      ['FEDERATED_SETTLEMENT_TRACKER_NFT_ID_PLACEHOLDER',
        request.tracker.trackerNftIdHex],
      ['FEDERATED_SETTLEMENT_DUP_NFT_ID_PLACEHOLDER',
        request.profile.duplicatePreventionNftIdHex],
      ['FEDERATED_SETTLEMENT_RESERVE_NFT_ID_PLACEHOLDER',
        request.profile.pooledReserveNftIdHex],
      ['FEDERATED_SETTLEMENT_FAMILY_ID_PLACEHOLDER',
        request.profile.familyIdHex],
      ['FEDERATED_SETTLEMENT_TRACKER_CONTRACT_ID_PLACEHOLDER',
        request.tracker.contractIdHex],
      ['FEDERATED_SETTLEMENT_SOURCE_NETWORK_ID_PLACEHOLDER',
        request.tracker.sourceNetworkIdHex],
      ['FEDERATED_SETTLEMENT_SIDECHAIN_ID_PLACEHOLDER',
        request.tracker.sidechainIdHex],
      ['FEDERATED_SETTLEMENT_RUNTIME_PROFILE_ID_PLACEHOLDER',
        request.tracker.runtimeProfileIdHex],
      ['FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
        request.tracker.settlementProfileIdHex],
      ['FEDERATED_SETTLEMENT_FEDERATION_PROFILE_ID_PLACEHOLDER',
        request.tracker.federationProfileIdHex],
      ['FEDERATED_SETTLEMENT_ERGO_KEY_SET_DIGEST_PLACEHOLDER',
        request.tracker.ergoAdmissionKeySetDigestHex],
      ['FEDERATED_SETTLEMENT_ERGO_THRESHOLD_PLACEHOLDER',
        uint16Be(request.tracker.ergoAdmissionThreshold).toString('hex')],
      ['FEDERATED_SETTLEMENT_EPOCH_PLACEHOLDER',
        uint64Be(request.tracker.federationEpoch).toString('hex')],
    ],
    PLACEHOLDERS.duplicatePrevention,
    'federated settlement duplicate prevention',
  );
  const sourceLock = resolveTemplate(
    templates.sourceLock.source,
    [
      ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
        request.tracker.sourceNetworkIdHex],
      ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
        request.tracker.sidechainIdHex],
      ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
        request.tracker.bridgeAddressHex],
      ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
        request.tracker.tokenAddressHex],
      ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
        request.tracker.settlementProfileIdHex],
      ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        request.profile.familyIdHex],
      ['POOLED_RESERVE_NFT_ID_PLACEHOLDER',
        request.profile.pooledReserveNftIdHex],
    ],
    PLACEHOLDERS.sourceLock,
    'federated settlement source lock',
  );
  return deepFreeze({
    duplicatePrevention,
    sourceLock,
  });
}

export function resolveSubstrateFederatedSettlementFamilyV1PooledReserveTemplateSource(
  request: Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest>,
): string {
  const templates = getRequestTemplates(request);
  return resolveTemplatePartially(
    templates.pooledReserve.source,
    [
      ['POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
        request.profile.duplicatePreventionNftIdHex],
      ['POOLED_RESERVE_NFT_ID_PLACEHOLDER',
        request.profile.pooledReserveNftIdHex],
      ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        request.profile.familyIdHex],
      ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
        request.tracker.sidechainIdHex],
      ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
        request.tracker.sourceNetworkIdHex],
      ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
        request.tracker.bridgeAddressHex],
      ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
        request.tracker.tokenAddressHex],
      ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
        request.tracker.settlementProfileIdHex],
    ],
    PLACEHOLDERS.pooledReserve,
    [
      'POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER',
      'POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER',
    ],
    'federated settlement pooled reserve',
  );
}

export function resolveSubstrateFederatedSettlementFamilyV1PooledReserveSource(
  request: Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest>,
  contractIds: Readonly<
    SubstrateFederatedSettlementFamilyV1PredecessorContractIds
  >,
): string {
  assertExactKeys(contractIds, [
    'duplicatePreventionContractIdHex',
    'sourceLockContractIdHex',
  ], 'federated settlement predecessor contract IDs');
  return resolveTemplate(
    resolveSubstrateFederatedSettlementFamilyV1PooledReserveTemplateSource(
      request,
    ),
    [
      ['POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER', nonzeroHex(
        contractIds.duplicatePreventionContractIdHex,
        32,
        'duplicate-prevention contract ID',
      )],
      ['POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER', nonzeroHex(
        contractIds.sourceLockContractIdHex,
        32,
        'source-lock contract ID',
      )],
    ],
    [
      'POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER',
      'POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER',
    ],
    'federated settlement pooled reserve contract binding',
  );
}

export function validateSubstrateFederatedSettlementFamilyV1CompilerBatch(
  input: {
    readonly request:
      Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest>;
    readonly compilerBatchJson: string;
  },
): Readonly<SubstrateFederatedSettlementFamilyV1Identity> {
  assertExactKeys(input, [
    'request',
    'compilerBatchJson',
  ], 'substrate federated settlement-family compiler validation');
  const templates = requestTemplates.get(input.request);
  if (templates === undefined) {
    throw new Error('federated settlement compiler request lacks same-process provenance');
  }
  const resolvedSources =
    resolveSubstrateFederatedSettlementFamilyV1Sources(input.request);
  const batchJson = exactAsciiJson(
    input.compilerBatchJson,
    'federated settlement compiler batch',
  );
  const batchSha256Hex = sha256Hex(Buffer.from(batchJson, 'ascii'));
  if (
    batchSha256Hex
      !== SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX
  ) {
    throw new Error('federated settlement compiler batch SHA-256 mismatch');
  }
  const batch = JSON.parse(batchJson) as
    ValidityApplicationPooledReserveCompilerBatchV1;
  if (
    batch.schema !== VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SCHEMA
    || batch.version !== 1
    || batch.sigmaStateCommit
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT
    || batch.scalaVersion
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION
    || batch.sbtVersion !== VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION
    || !Array.isArray(batch.contracts)
    || batch.contracts.length !== 3
  ) {
    throw new Error('federated settlement compiler batch identity is invalid');
  }
  assertFalseBoundaries(batch, 'federated settlement compiler batch');

  const request = input.request;
  const duplicatePrevention = validateCompiledContract(
    batch.contracts[0],
    'duplicatePrevention',
    templates.duplicatePrevention,
    resolvedSources.duplicatePrevention,
  );
  const sourceLock = validateCompiledContract(
    batch.contracts[1],
    'sourceLock',
    templates.sourceLock,
    resolvedSources.sourceLock,
  );
  const pooledReserve = validateCompiledContract(
    batch.contracts[2],
    'pooledReserve',
    templates.pooledReserve,
    resolvedSources.pooledReserve,
  );

  const identity = deepFreeze({
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_IDENTITY_SCHEMA,
    version: 1 as const,
    compilerBatchSha256Hex:
      SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX,
    profile: request.profile,
    contracts: {
      duplicatePrevention,
      sourceLock,
      pooledReserve,
    },
    semanticDelta: {
      federatedTrackerKeyAndValueConsumed: true as const,
      federatedTrackerAuthorityBound: true as const,
      burnLeafV1Preserved: true as const,
      settlementBundleV2Preserved: true as const,
      soleDuplicatePreventionAuthorityPreserved: true as const,
      nativeErgConservationPreserved: true as const,
      exactPayoutBindingPreserved: true as const,
      externalFeeFundingPreserved: true as const,
      sourceLockCommitRefundExclusivityPreserved: true as const,
      sourceLockTemplateReusedByteForByte: true as const,
      pooledReserveTemplateReusedByteForByte: true as const,
      frozenV6ContractIdentitiesReused: false as const,
    },
    relations: {
      trackerBoundIntoDuplicatePrevention: true as const,
      duplicatePreventionBoundIntoPooledReserve: true as const,
      sourceLockBoundIntoPooledReserve: true as const,
      trackerBoundIntoPooledReserveViaDuplicatePrevention: true as const,
    },
    boundaries: {
      ...falseBoundaries(),
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  validatedIdentities.add(identity);
  return identity;
}

export function assertSubstrateFederatedSettlementFamilyV1Identity(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedSettlementFamilyV1Identity> {
  if (
    value === null
    || typeof value !== 'object'
    || !validatedIdentities.has(value)
  ) {
    throw new Error(
      'federated settlement-family identity lacks same-process compiler provenance',
    );
  }
}

export function decodeSubstrateFederatedSettlementFamilyV1Profile(
  profile: Readonly<SubstrateFederatedSettlementFamilyV1Profile>,
): Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile> {
  if (
    profile.schema !== SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA
    || profile.version !== 1
    || !new RegExp(
      `^[0-9a-f]{${SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_BYTES * 2}}$`,
    ).test(profile.encodedProfileHex)
  ) {
    throw new Error('federated settlement-family profile is invalid');
  }
  const encoded = Buffer.from(profile.encodedProfileHex, 'hex');
  if ([...encoded.subarray(0, 4)].some(
    (field, index) => field !== [1, 1, 1, 0][index],
  )) {
    throw new Error('federated settlement-family profile discriminators are invalid');
  }
  const decoded = deepFreeze({
    version: 1 as const,
    hashAlgorithmId: 1 as const,
    settlementAssetProfileId: 1 as const,
    flags: 0 as const,
    sourceNetworkIdHex: nonzeroSlice(encoded, 4, 36, 'source network ID'),
    sidechainIdHex: nonzeroSlice(encoded, 36, 68, 'sidechain ID'),
    bridgeAddressHex: nonzeroSlice(encoded, 68, 88, 'bridge address'),
    tokenAddressHex: nonzeroSlice(encoded, 88, 108, 'token address'),
    runtimeProfileIdHex: nonzeroSlice(encoded, 108, 140, 'runtime profile ID'),
    settlementProfileIdHex: nonzeroSlice(
      encoded,
      140,
      172,
      'settlement profile ID',
    ),
    federationProfileIdHex: nonzeroSlice(
      encoded,
      172,
      204,
      'federation profile ID',
    ),
    sourceAttestationKeySetDigestHex: nonzeroSlice(
      encoded,
      204,
      236,
      'source-attestation key-set digest',
    ),
    sourceAttestationThreshold: encoded.readUInt16BE(236),
    ergoAdmissionKeySetDigestHex: nonzeroSlice(
      encoded,
      238,
      270,
      'Ergo-admission key-set digest',
    ),
    ergoAdmissionThreshold: encoded.readUInt16BE(270),
    federationEpoch: encoded.readBigUInt64BE(272).toString(),
    trackerNftIdHex: nonzeroSlice(encoded, 280, 312, 'tracker NFT ID'),
    duplicatePreventionNftIdHex: nonzeroSlice(
      encoded,
      312,
      344,
      'duplicate-prevention NFT ID',
    ),
    pooledReserveNftIdHex: nonzeroSlice(
      encoded,
      344,
      376,
      'pooled-reserve NFT ID',
    ),
    trackerContractIdHex: nonzeroSlice(
      encoded,
      376,
      408,
      'tracker contract ID',
    ),
    trackerTemplateSourceSha256Hex: nonzeroSlice(
      encoded,
      408,
      440,
      'tracker template SHA-256',
    ),
    duplicatePreventionTemplateSha256Hex: nonzeroSlice(
      encoded,
      440,
      472,
      'duplicate-prevention template SHA-256',
    ),
    sourceLockTemplateSha256Hex: nonzeroSlice(
      encoded,
      472,
      504,
      'source-lock template SHA-256',
    ),
    pooledReserveTemplateSha256Hex: nonzeroSlice(
      encoded,
      504,
      536,
      'pooled-reserve template SHA-256',
    ),
    sourceRefundDelayBlocks: encoded.readUInt32BE(536),
    minimumAnchorConfirmations: encoded.readUInt32BE(540),
    maximumSuccessorCreationHeightLag: encoded.readUInt32BE(544),
    minimumExternalFeeNanoErg: encoded.readBigUInt64BE(548).toString(),
    maximumExternalFeeNanoErg: encoded.readBigUInt64BE(556).toString(),
    settlementAssetIdHex: encoded.subarray(564, 596).toString('hex'),
  });
  const familyIdHex = blake2b256Hex(Buffer.concat([
    Buffer.from(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_DOMAIN, 'ascii'),
    encoded,
  ]));
  if (
    familyIdHex !== profile.familyIdHex
    || decoded.duplicatePreventionNftIdHex
      !== profile.duplicatePreventionNftIdHex
    || decoded.pooledReserveNftIdHex !== profile.pooledReserveNftIdHex
    || decoded.sourceAttestationThreshold === 0
    || decoded.ergoAdmissionThreshold === 0
    || BigInt(decoded.federationEpoch) === 0n
    || decoded.sourceRefundDelayBlocks
      !== SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS
    || decoded.minimumAnchorConfirmations
      !== SUBSTRATE_FEDERATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS
    || decoded.maximumSuccessorCreationHeightLag
      !== SUBSTRATE_FEDERATED_SETTLEMENT_MAX_SUCCESSOR_HEIGHT_LAG
    || decoded.minimumExternalFeeNanoErg
      !== SUBSTRATE_FEDERATED_SETTLEMENT_MIN_EXTERNAL_FEE_NANOERG.toString()
    || decoded.maximumExternalFeeNanoErg
      !== SUBSTRATE_FEDERATED_SETTLEMENT_MAX_EXTERNAL_FEE_NANOERG.toString()
    || decoded.settlementAssetIdHex
      !== SUBSTRATE_FEDERATED_SETTLEMENT_NATIVE_ERG_ASSET_ID_HEX
  ) {
    throw new Error('federated settlement-family profile bindings are invalid');
  }
  return decoded;
}

function normalizeTrackerBinding(
  value: SubstrateFederatedSettlementTrackerBindingV1,
): Readonly<SubstrateFederatedSettlementTrackerBindingV1> {
  assertExactKeys(value, [
    'contractIdHex',
    'templateSourceSha256Hex',
    'trackerNftIdHex',
    'sourceNetworkIdHex',
    'sidechainIdHex',
    'bridgeAddressHex',
    'tokenAddressHex',
    'runtimeProfileIdHex',
    'settlementProfileIdHex',
    'federationProfileIdHex',
    'sourceAttestationKeySetDigestHex',
    'sourceAttestationThreshold',
    'ergoAdmissionKeySetDigestHex',
    'ergoAdmissionThreshold',
    'federationEpoch',
  ], 'substrate federated settlement tracker binding');
  return deepFreeze({
    contractIdHex: nonzeroHex(value.contractIdHex, 32, 'tracker contract ID'),
    templateSourceSha256Hex: nonzeroHex(
      value.templateSourceSha256Hex,
      32,
      'tracker template SHA-256',
    ),
    trackerNftIdHex: nonzeroHex(value.trackerNftIdHex, 32, 'tracker NFT ID'),
    sourceNetworkIdHex: nonzeroHex(
      value.sourceNetworkIdHex,
      32,
      'source network ID',
    ),
    sidechainIdHex: nonzeroHex(value.sidechainIdHex, 32, 'sidechain ID'),
    bridgeAddressHex: nonzeroHex(value.bridgeAddressHex, 20, 'bridge address'),
    tokenAddressHex: nonzeroHex(value.tokenAddressHex, 20, 'token address'),
    runtimeProfileIdHex: nonzeroHex(
      value.runtimeProfileIdHex,
      32,
      'runtime profile ID',
    ),
    settlementProfileIdHex: nonzeroHex(
      value.settlementProfileIdHex,
      32,
      'settlement profile ID',
    ),
    federationProfileIdHex: nonzeroHex(
      value.federationProfileIdHex,
      32,
      'federation profile ID',
    ),
    sourceAttestationKeySetDigestHex: nonzeroHex(
      value.sourceAttestationKeySetDigestHex,
      32,
      'source-attestation key-set digest',
    ),
    sourceAttestationThreshold: positiveUint16(
      value.sourceAttestationThreshold,
      'source-attestation threshold',
    ),
    ergoAdmissionKeySetDigestHex: nonzeroHex(
      value.ergoAdmissionKeySetDigestHex,
      32,
      'Ergo-admission key-set digest',
    ),
    ergoAdmissionThreshold: positiveUint16(
      value.ergoAdmissionThreshold,
      'Ergo-admission threshold',
    ),
    federationEpoch: positiveLong(value.federationEpoch, 'federation epoch'),
  });
}

function normalizeTemplates(
  input: BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput[
    'templates'
  ],
): Templates {
  return Object.fromEntries(
    (Object.keys(CONTRACT_PATHS) as ContractRole[]).map(role => {
      const template = input[role];
      assertExactKeys(template, [
        'relativePath',
        'source',
      ], `${role} federated settlement template`);
      if (template.relativePath !== CONTRACT_PATHS[role]) {
        throw new Error(`${role} federated settlement template path is invalid`);
      }
      if (
        template.source.length === 0
        || template.source.charCodeAt(0) === 0xfeff
        || template.source.includes('\r')
        || !Buffer.from(template.source, 'utf8')
          .equals(Buffer.from(template.source, 'ascii'))
      ) {
        throw new Error(`${role} template must be non-empty LF-only ASCII`);
      }
      const actual = [...template.source.matchAll(PLACEHOLDER_PATTERN)]
        .map(match => match[0])
        .sort();
      const expected = [...PLACEHOLDERS[role]].sort();
      if (
        actual.length !== expected.length
        || actual.some((placeholder, index) =>
          placeholder !== expected[index]
        )
      ) {
        throw new Error(`${role} federated settlement placeholder set is invalid`);
      }
      return [role, Object.freeze({
        relativePath: template.relativePath,
        source: template.source,
        sha256Hex: sha256Hex(Buffer.from(template.source, 'ascii')),
      })];
    }),
  ) as Templates;
}

function validateCompiledContract(
  value: unknown,
  expectedRole: ContractRole,
  template: Template,
  resolvedSource: string,
) {
  const receipt = value as ValidityApplicationPooledReserveCompilerReceiptV1;
  const resolvedSourceSha256Hex =
    sha256Hex(Buffer.from(resolvedSource, 'ascii'));
  if (
    receipt?.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_RECEIPT_V1_SCHEMA
    || receipt.version !== 1
    || receipt.role !== expectedRole
    || receipt.sigmaStateCommit
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT
    || receipt.scalaVersion
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION
    || receipt.sbtVersion !== VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION
    || receipt.scriptVersion !== 3
    || receipt.treeVersion !== 0
    || receipt.resolvedSourceSha256Hex !== resolvedSourceSha256Hex
    || !Number.isSafeInteger(receipt.propositionBytes)
    || receipt.propositionBytes <= 0
    || receipt.propositionBytes >= 4096
  ) {
    throw new Error(`${expectedRole} federated settlement compiler receipt is invalid`);
  }
  const propositionHex = variableHex(
    receipt.propositionHex,
    `${expectedRole} proposition`,
  );
  const proposition = Buffer.from(propositionHex, 'hex');
  const propositionSha256Hex = sha256Hex(proposition);
  const contractIdHex = blake2b256Hex(proposition);
  if (
    proposition.length !== receipt.propositionBytes
    || receipt.propositionSha256Hex !== propositionSha256Hex
    || receipt.contractIdHex !== contractIdHex
    || contractIdHex
      !== SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS[expectedRole]
  ) {
    throw new Error(`${expectedRole} federated settlement proposition identity is invalid`);
  }
  assertFalseBoundaries(
    receipt,
    `${expectedRole} federated settlement compiler receipt`,
  );
  return deepFreeze({
    templateSha256Hex: template.sha256Hex,
    resolvedSourceSha256Hex,
    receipt: { ...receipt },
  });
}

function nonzeroSlice(
  value: Buffer,
  start: number,
  end: number,
  label: string,
): string {
  const encoded = value.subarray(start, end).toString('hex');
  if (/^0+$/.test(encoded)) {
    throw new Error(`federated settlement ${label} must not be zero`);
  }
  return encoded;
}

function getRequestTemplates(
  request: Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest>,
): Templates {
  const templates = requestTemplates.get(request);
  if (templates === undefined) {
    throw new Error('federated settlement compiler request lacks same-process provenance');
  }
  return templates;
}

function resolveTemplatePartially(
  source: string,
  replacements: readonly (readonly [string, string])[],
  expectedPlaceholders: readonly string[],
  expectedRemaining: readonly string[],
  label: string,
): string {
  const replacementPlaceholders = replacements.map(([placeholder]) => placeholder);
  const expectedReplacements = expectedPlaceholders.slice(
    0,
    expectedPlaceholders.length - expectedRemaining.length,
  );
  if (
    replacementPlaceholders.length !== expectedReplacements.length
    || replacementPlaceholders.some((placeholder, index) =>
      placeholder !== expectedReplacements[index]
    )
    || expectedRemaining.some((placeholder, index) =>
      placeholder
        !== expectedPlaceholders[expectedReplacements.length + index]
    )
  ) {
    throw new Error(`${label} partial replacement order is invalid`);
  }
  let resolved = source;
  for (const [placeholder, replacement] of replacements) {
    if (
      !/^[0-9a-f]+$/.test(replacement)
      || replacement.length % 2 !== 0
      || resolved.split(placeholder).length !== 2
    ) {
      throw new Error(`${label} replacement for ${placeholder} is invalid`);
    }
    resolved = resolved.replace(placeholder, replacement);
  }
  const remaining = [...resolved.matchAll(PLACEHOLDER_PATTERN)]
    .map(match => match[0]);
  if (
    remaining.length !== expectedRemaining.length
    || remaining.some((placeholder, index) =>
      placeholder !== expectedRemaining[index]
    )
  ) {
    throw new Error(`${label} remaining placeholder set is invalid`);
  }
  return resolved;
}

function resolveTemplate(
  source: string,
  replacements: readonly (readonly [string, string])[],
  expectedPlaceholders: readonly string[],
  label: string,
): string {
  if (
    replacements.length !== expectedPlaceholders.length
    || replacements.some(([placeholder], index) =>
      placeholder !== expectedPlaceholders[index]
    )
  ) {
    throw new Error(`${label} replacement order is invalid`);
  }
  let resolved = source;
  for (const [placeholder, replacement] of replacements) {
    if (
      !/^[0-9a-f]+$/.test(replacement)
      || replacement.length % 2 !== 0
      || resolved.split(placeholder).length !== 2
    ) {
      throw new Error(`${label} replacement for ${placeholder} is invalid`);
    }
    resolved = resolved.replace(placeholder, replacement);
  }
  if ([...resolved.matchAll(PLACEHOLDER_PATTERN)].length !== 0) {
    throw new Error(`${label} retains an unresolved placeholder`);
  }
  return resolved;
}

function falseBoundaries(): FalseBoundaries {
  return Object.freeze({
    profileActivated: false as const,
    nodeCheckPerformed: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
  });
}

function assertFalseBoundaries(
  value: Partial<Record<keyof FalseBoundaries, unknown>>,
  label: string,
): void {
  for (const key of Object.keys(falseBoundaries()) as (keyof FalseBoundaries)[]) {
    if (value[key] !== false) {
      throw new Error(`${label} must keep ${key} false`);
    }
  }
}

function exactAsciiJson(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 1024 * 1024
    || value.charCodeAt(0) === 0xfeff
    || value.includes('\r')
    || !Buffer.from(value, 'utf8').equals(Buffer.from(value, 'ascii'))
  ) {
    throw new Error(`${label} must be bounded LF-only ASCII`);
  }
  return value;
}

function nonzeroHex(value: unknown, size: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^(?:0x)?[0-9a-f]{${size * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${size} lowercase hex bytes`);
  }
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (/^0+$/.test(normalized)) {
    throw new Error(`${label} must be nonzero`);
  }
  return normalized;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hex bytes`);
  }
  return value;
}

function bytes(value: string): Buffer {
  return Buffer.from(value, 'hex');
}

function positiveUint16(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value <= 0
    || value > 0xffff
  ) {
    throw new Error(`${label} must fit a positive uint16`);
  }
  return value;
}

function positiveLong(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be canonical positive decimal`);
  }
  const parsed = BigInt(value);
  if (parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds the positive signed Long range`);
  }
  return parsed.toString();
}

function uint16Be(value: number): Buffer {
  const result = Buffer.alloc(2);
  result.writeUInt16BE(positiveUint16(value, 'uint16 value'));
  return result;
}

function uint32Be(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error('uint32 value is out of range');
  }
  const result = Buffer.alloc(4);
  result.writeUInt32BE(value);
  return result;
}

function uint64Be(value: string): Buffer {
  const parsed = BigInt(positiveLong(value, 'uint64 value'));
  const result = Buffer.alloc(8);
  result.writeBigUInt64BE(parsed);
  return result;
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child, seen);
    }
  }
  return value;
}
