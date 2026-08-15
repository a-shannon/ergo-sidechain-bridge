import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v5.js';
import {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_DOMAIN,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_PREFIX_BYTES,
  derivePooledReserveBurnApplicationBindingV5DigestHex,
  encodePooledReserveBurnApplicationBindingV5,
  encodePooledReserveBurnApplicationBindingV5Prefix,
} from './pooled-reserve-burn-statement-v5.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_RECEIPT_V1_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION,
  VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION,
  VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex,
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveProofProfileIdV1Hex,
  deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex,
  type ValidityApplicationPooledReserveDepositStatePolicyV1,
  type ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
  type ValidityApplicationPooledReserveCompilerBatchV1,
  type ValidityApplicationPooledReserveCompilerReceiptV1,
  type ValidityApplicationPooledReserveRuntimeBindingV4,
  type ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
  type ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
} from './validity-application-pooled-reserve-instance-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_REQUEST_SCHEMA =
  'e2s.validity-application-pooled-reserve-burn-family-compiler-request.v5' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_IDENTITY_SCHEMA =
  'e2s.validity-application-pooled-reserve-burn-family-identity.v5' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_BATCH_SHA256_HEX =
  'b56eb130f63de10e26801e9983f722a6185a658580a1949fe0d133e717756db1' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS =
  Object.freeze({
    tracker:
      'c9f54f6e60bcad8a135df23e92c69a5134144c2cebc7091566f6da490b7cff08',
    duplicatePrevention:
      'dea715869bab05f678d7d7f30375d95d6b791a2ed2d8db4a8c982dcef88a778c',
    sourceLock:
      '79f6b7d0ba8053c9b5746bb6139b864445656da0c6ced34d16bba2f636710b4a',
    pooledReserve:
      '00e45fb10eb4b70a8b0aa7276f17752c7c46210dd474b553b1f5cdfd3edabac6',
  } as const);

const CONTRACT_PATHS = Object.freeze({
  tracker: 'contracts/SPVTrackerPooledReserveBurnSettlementV5.es',
  duplicatePrevention:
    'contracts/DoubleUnlockPreventionPooledReserveV5.es',
  sourceLock: 'contracts/MainChainLockPooledReserveV5.es',
  pooledReserve:
    'contracts/MainChainPooledReserveValidityApplicationV5.es',
} as const);
const PLACEHOLDER_PATTERN = /[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g;
const PLACEHOLDERS = Object.freeze({
  tracker: Object.freeze([
    'POOLED_RESERVE_BURN_V5_PROGRAM_ID_PLACEHOLDER',
    'POOLED_RESERVE_BURN_V5_VERIFIER_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_BURN_V5_APPLICATION_BINDING_PREFIX_PLACEHOLDER',
    'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
  ] as const),
  duplicatePrevention: Object.freeze([
    'POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER',
    'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
    'POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
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
    'POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER',
    'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
    'POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
    'POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
    'POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER',
    'POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER',
    'POOLED_RESERVE_APPLICATION_BINDING_DIGEST_PLACEHOLDER',
  ] as const),
});

type ContractRole = keyof typeof CONTRACT_PATHS;
type NormalizedTemplate = Readonly<{
  relativePath: string;
  source: string;
  sha256Hex: string;
}>;
type NormalizedTemplates = Readonly<Record<ContractRole, NormalizedTemplate>>;
const compilerRequestTemplates =
  new WeakMap<object, NormalizedTemplates>();

export interface ValidityApplicationPooledReserveBurnFamilyV5Template {
  readonly relativePath: string;
  readonly source: string;
}

export interface BuildValidityApplicationPooledReserveBurnFamilyV5CompilerRequestInput {
  readonly templates: Readonly<Record<
    ContractRole,
    ValidityApplicationPooledReserveBurnFamilyV5Template
  >>;
  readonly genesis: {
    readonly trackerInput: Eip12Box;
    readonly duplicatePreventionInput: Eip12Box;
    readonly pooledReserveInput: Eip12Box;
  };
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly settlementProfileIdHex: string;
  readonly approvedTrustAnchorDigestHex: string;
  readonly sourceRuntimeProfileScaleHex: string;
  readonly runtimeBinding: ValidityApplicationPooledReserveRuntimeBindingV4;
}

export interface ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_REQUEST_SCHEMA;
  readonly version: 5;
  readonly sigmaStateCommit: string;
  readonly contracts: readonly {
    readonly role: ContractRole;
    readonly relativePath: string;
    readonly templateSha256Hex: string;
  }[];
  readonly lineage: {
    readonly profileIdHex: string;
    readonly encodedProfileHex: string;
    readonly trackerGenesisInputBoxIdHex: string;
    readonly duplicatePreventionGenesisInputBoxIdHex: string;
    readonly pooledReserveGenesisInputBoxIdHex: string;
    readonly trackerNftIdHex: string;
    readonly duplicatePreventionNftIdHex: string;
    readonly pooledReserveNftIdHex: string;
  };
  readonly policies: {
    readonly proofSystemIdHex: string;
    readonly proofProfileIdHex: string;
    readonly sidechainFinalityPolicyIdHex: string;
    readonly ergoDepositFinalityPolicyIdHex: string;
    readonly sourceCommitmentPolicyIdHex: string;
    readonly depositStatePolicyIdHex: string;
  };
  readonly sourceRuntime: {
    readonly profileScaleHex: string;
    readonly profileIdHex: string;
    readonly lineageProfileIdHex: string;
    readonly proofSystemIdHex: string;
    readonly proofProfileIdHex: string;
  };
  readonly bindings: {
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly settlementProfileIdHex: string;
    readonly approvedTrustAnchorDigestHex: string;
    readonly programIdHex: string;
    readonly verifierProfileIdHex: string;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly applicationBindingDomain: string;
    readonly applicationBindingPrefixHex: string;
  };
  readonly boundaries: {
    readonly contractsCompiled: false;
    readonly profileActivated: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  };
}

export interface ValidityApplicationPooledReserveBurnFamilyV5Identity {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_IDENTITY_SCHEMA;
  readonly version: 5;
  readonly compilerBatchSha256Hex:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_BATCH_SHA256_HEX;
  readonly lineageProfileIdHex: string;
  readonly sourceRuntimeProfileIdHex: string;
  readonly sourceRuntimeLineageProfileIdHex: string;
  readonly proofProfileIdHex: string;
  readonly applicationBindingHex: string;
  readonly applicationBindingDigestHex: string;
  readonly contracts: Readonly<Record<ContractRole, Readonly<{
    templateSha256Hex: string;
    resolvedSourceSha256Hex: string;
    receipt: Readonly<ValidityApplicationPooledReserveCompilerReceiptV1>;
  }>>>;
  readonly relations: {
    readonly sourceRuntimeBoundIntoTracker: true;
    readonly trackerBoundIntoDuplicatePrevention: true;
    readonly trackerBoundIntoPooledReserve: true;
    readonly duplicatePreventionBoundIntoPooledReserve: true;
    readonly sourceLockBoundIntoPooledReserve: true;
    readonly applicationBindingBoundIntoPooledReserve: true;
  };
  readonly boundaries: {
    readonly profileActivated: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export async function buildValidityApplicationPooledReserveBurnFamilyV5CompilerRequest(
  input: BuildValidityApplicationPooledReserveBurnFamilyV5CompilerRequestInput,
): Promise<Readonly<
  ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest
>> {
  assertExactKeys(input, [
    'templates',
    'genesis',
    'sourceNetworkIdHex',
    'sidechainIdHex',
    'bridgeAddressHex',
    'tokenAddressHex',
    'settlementProfileIdHex',
    'approvedTrustAnchorDigestHex',
    'sourceRuntimeProfileScaleHex',
    'runtimeBinding',
  ], 'pooled-reserve burn-family V5 compiler request');
  assertExactKeys(input.genesis, [
    'trackerInput',
    'duplicatePreventionInput',
    'pooledReserveInput',
  ], 'pooled-reserve burn-family V5 genesis');
  assertExactKeys(input.templates, [
    'tracker',
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ], 'pooled-reserve burn-family V5 templates');

  const templates = normalizeTemplates(input.templates);
  const sourceNetworkIdHex = prefixedHex(input.sourceNetworkIdHex, 32,
    'source network ID');
  const sidechainIdHex = prefixedHex(input.sidechainIdHex, 32,
    'sidechain ID');
  const bridgeAddressHex = prefixedHex(input.bridgeAddressHex, 20,
    'bridge address');
  const tokenAddressHex = prefixedHex(input.tokenAddressHex, 20,
    'token address');
  const settlementProfileIdHex = prefixedHex(input.settlementProfileIdHex, 32,
    'settlement profile ID');
  const approvedTrustAnchorDigestHex = prefixedHex(
    input.approvedTrustAnchorDigestHex,
    32,
    'approved trust-anchor digest',
  );
  const runtime = normalizeRuntimeBinding(input.runtimeBinding);
  const sourceRuntimeProfileScaleHex = prefixedHex(
    input.sourceRuntimeProfileScaleHex,
    349,
    'exact source runtime profile V4',
  );
  const sourceRuntimeProfile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      sourceRuntimeProfileScaleHex,
    );
  if (
    sourceRuntimeProfile.sourceNetworkIdHex !== sourceNetworkIdHex
    || sourceRuntimeProfile.sidechainIdHex !== sidechainIdHex
    || sourceRuntimeProfile.bridgeAddressHex !== bridgeAddressHex
    || sourceRuntimeProfile.tokenAddressHex !== tokenAddressHex
    || sourceRuntimeProfile.settlementProfileIdHex !== settlementProfileIdHex
    || sourceRuntimeProfile.bridgeRuntimeCodeSha256Hex
      !== runtime.bridgeRuntimeCodeSha256Hex
    || sourceRuntimeProfile.bridgeRuntimeCodeBytes
      !== runtime.bridgeRuntimeCodeBytes
    || sourceRuntimeProfile.tokenRuntimeCodeSha256Hex
      !== runtime.tokenRuntimeCodeSha256Hex
    || sourceRuntimeProfile.tokenRuntimeCodeBytes
      !== runtime.tokenRuntimeCodeBytes
    || sourceRuntimeProfile.maxPendingBlocks !== runtime.maxPendingBlocks
    || sourceRuntimeProfile.sourceProofSystemIdHex
      !== VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX
    || sourceRuntimeProfile.sourceProofProfileIdHex
      !== VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX
  ) {
    throw new Error(
      'pooled-reserve burn-family V5 must retain the exact compatible V4 source runtime profile',
    );
  }
  const sourceRuntimeProfileIdHex =
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(
      sourceRuntimeProfileScaleHex,
    );
  const proofProfileIdHex =
    deriveValidityApplicationPooledReserveProofProfileIdV1Hex({
      statementVersion: 5,
      programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX}`,
      verifierProfileIdHex:
        `0x${POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX}`,
    });
  const sidechainFinalityPolicy:
    ValidityApplicationPooledReserveSidechainFinalityPolicyV1 = {
      proofSystemIdHex:
        VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
      proofProfileIdHex,
      approvedTrustAnchorDigestHex,
      programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX}`,
      verifierProfileIdHex:
        `0x${POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX}`,
    };
  const ergoDepositFinalityPolicy:
    ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1 = {
      version: 1,
      requiredSuccessorDepth: 10,
      blockIdentityAndAncestryRequired: true,
      divergentRpcAction: 'hold',
      reorgAction: 'invalidate',
    };
  const sourceCommitmentPolicy:
    ValidityApplicationPooledReserveSourceCommitmentPolicyV1 = {
      version: 1,
      refundDelayBlocks:
        VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
      pooledReserveInputIndex: 0,
      sourceLockInputIndex: 1,
      externalFeeInputIndex: 2,
      pooledReserveOutputIndex: 0,
      externalFeeOutputIndex: 1,
      sourceLockMustBeConsumed: true,
      externalFeeMustBeValueNeutral: true,
    };
  const depositStatePolicy:
    ValidityApplicationPooledReserveDepositStatePolicyV1 = {
      version: 1,
      keyLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
      valueLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
      operationFlags:
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      keySource: 'source-lock-box-id',
      valueHash: 'blake2b256',
      commitmentDomain:
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
    };
  const policyIds = {
    sidechainFinality:
      deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex(
        sidechainFinalityPolicy,
      ),
    ergoDepositFinality:
      deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex(
        ergoDepositFinalityPolicy,
      ),
    sourceCommitment:
      deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex(
        sourceCommitmentPolicy,
      ),
    depositState:
      deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex(
        depositStatePolicy,
      ),
  };
  const semantics: PegInPooledReserveLineageProfileV4Semantics = {
    sourceNetworkIdHex,
    sidechainIdHex,
    bridgeAddressHex,
    tokenAddressHex,
    settlementProfileIdHex,
    sourceLockTemplateSha256Hex: `0x${templates.sourceLock.sha256Hex}`,
    validityTrackerTemplateSha256Hex: `0x${templates.tracker.sha256Hex}`,
    settlementVaultTemplateSha256Hex:
      `0x${templates.pooledReserve.sha256Hex}`,
    duplicatePreventionTemplateSha256Hex:
      `0x${templates.duplicatePrevention.sha256Hex}`,
    sidechainFinalityPolicyIdHex: policyIds.sidechainFinality,
    ergoDepositFinalityPolicyIdHex: policyIds.ergoDepositFinality,
    proofSystemIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex,
    sourceCommitmentPolicyIdHex: policyIds.sourceCommitment,
    depositCommitmentStatePolicyIdHex: policyIds.depositState,
    profileRevision: '2',
    activationHeight: sourceRuntimeProfile.activationHeight,
  };
  const lineage = await derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox: input.genesis.trackerInput,
    duplicatePreventionGenesisInputBox:
      input.genesis.duplicatePreventionInput,
    settlementVaultGenesisInputBox: input.genesis.pooledReserveInput,
    semantics,
  });
  if (
    sourceRuntimeProfile.lineageProfileIdHex === lineage.profileIdHex
  ) {
    throw new Error(
      'pooled-reserve V5 settlement lineage must remain distinct from the V4 source runtime lineage',
    );
  }
  const applicationBindingPrefixHex =
    encodePooledReserveBurnApplicationBindingV5Prefix({
      runtimeProfileScaleHex: sourceRuntimeProfileScaleHex,
      sourceRuntimeCodeSha256Hex:
        stripPrefix(runtime.sourceRuntimeCodeSha256Hex),
      sourceRuntimeCodeBytes: runtime.sourceRuntimeCodeBytes,
      trackerNftIdHex:
        stripPrefix(lineage.genesis.tracker.singletonNftIdHex),
    }).toString('hex');
  if (
    applicationBindingPrefixHex.length / 2
      !== POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_PREFIX_BYTES
  ) {
    throw new Error('pooled-reserve burn-family V5 prefix length drifted');
  }

  const request = deepFreeze({
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_REQUEST_SCHEMA,
    version: 5 as const,
    sigmaStateCommit:
      VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT,
    contracts: (Object.keys(CONTRACT_PATHS) as ContractRole[]).map(role => ({
      role,
      relativePath: templates[role].relativePath,
      templateSha256Hex: templates[role].sha256Hex,
    })),
    lineage: {
      profileIdHex: stripPrefix(lineage.profileIdHex),
      encodedProfileHex: stripPrefix(lineage.encodedProfileHex),
      trackerGenesisInputBoxIdHex:
        stripPrefix(lineage.profile.trackerGenesisInputBoxIdHex),
      duplicatePreventionGenesisInputBoxIdHex:
        stripPrefix(lineage.profile.duplicatePreventionGenesisInputBoxIdHex),
      pooledReserveGenesisInputBoxIdHex:
        stripPrefix(lineage.profile.settlementVaultGenesisInputBoxIdHex),
      trackerNftIdHex:
        stripPrefix(lineage.genesis.tracker.singletonNftIdHex),
      duplicatePreventionNftIdHex:
        stripPrefix(lineage.genesis.duplicatePrevention.singletonNftIdHex),
      pooledReserveNftIdHex:
        stripPrefix(lineage.genesis.settlementVault.singletonNftIdHex),
    },
    policies: {
      proofSystemIdHex: stripPrefix(
        VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
      ),
      proofProfileIdHex: stripPrefix(proofProfileIdHex),
      sidechainFinalityPolicyIdHex:
        stripPrefix(policyIds.sidechainFinality),
      ergoDepositFinalityPolicyIdHex:
        stripPrefix(policyIds.ergoDepositFinality),
      sourceCommitmentPolicyIdHex:
        stripPrefix(policyIds.sourceCommitment),
      depositStatePolicyIdHex: stripPrefix(policyIds.depositState),
    },
    sourceRuntime: {
      profileScaleHex: stripPrefix(sourceRuntimeProfileScaleHex),
      profileIdHex: stripPrefix(sourceRuntimeProfileIdHex),
      lineageProfileIdHex:
        stripPrefix(sourceRuntimeProfile.lineageProfileIdHex),
      proofSystemIdHex:
        stripPrefix(sourceRuntimeProfile.sourceProofSystemIdHex),
      proofProfileIdHex:
        stripPrefix(sourceRuntimeProfile.sourceProofProfileIdHex),
    },
    bindings: {
      sourceNetworkIdHex: stripPrefix(sourceNetworkIdHex),
      sidechainIdHex: stripPrefix(sidechainIdHex),
      bridgeAddressHex: stripPrefix(bridgeAddressHex),
      tokenAddressHex: stripPrefix(tokenAddressHex),
      settlementProfileIdHex: stripPrefix(settlementProfileIdHex),
      approvedTrustAnchorDigestHex:
        stripPrefix(approvedTrustAnchorDigestHex),
      programIdHex: POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX,
      verifierProfileIdHex:
        POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX,
      sourceRuntimeCodeSha256Hex:
        stripPrefix(runtime.sourceRuntimeCodeSha256Hex),
      sourceRuntimeCodeBytes: runtime.sourceRuntimeCodeBytes,
      applicationBindingDomain:
        POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_DOMAIN,
      applicationBindingPrefixHex,
    },
    boundaries: {
      contractsCompiled: false as const,
      profileActivated: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    },
  });
  compilerRequestTemplates.set(request, templates);
  return request;
}

export function validateValidityApplicationPooledReserveBurnFamilyV5CompilerBatch(
  input: {
    readonly request:
      Readonly<ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest>;
    readonly compilerBatchJson: string;
  },
): Readonly<ValidityApplicationPooledReserveBurnFamilyV5Identity> {
  assertExactKeys(input, [
    'request',
    'compilerBatchJson',
  ], 'pooled-reserve burn-family V5 compiler validation');
  const templates = compilerRequestTemplates.get(input.request);
  if (templates === undefined) {
    throw new Error(
      'pooled-reserve burn-family V5 request must be derived in this process',
    );
  }
  const batchJson = input.compilerBatchJson;
  if (
    typeof batchJson !== 'string'
    || batchJson.length === 0
    || batchJson.length > 1024 * 1024
    || batchJson.charCodeAt(0) === 0xfeff
    || batchJson.includes('\r')
    || !Buffer.from(batchJson, 'utf8').equals(Buffer.from(batchJson, 'ascii'))
  ) {
    throw new Error(
      'pooled-reserve burn-family V5 compiler batch must be bounded LF-only ASCII JSON',
    );
  }
  if (
    createHash('sha256').update(Buffer.from(batchJson, 'ascii')).digest('hex')
      !== VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_BATCH_SHA256_HEX
  ) {
    throw new Error(
      'pooled-reserve burn-family V5 compiler batch SHA-256 is not reviewed',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(batchJson);
  } catch {
    throw new Error(
      'pooled-reserve burn-family V5 compiler batch is not valid JSON',
    );
  }
  assertExactKeys(parsed, [
    'schema',
    'version',
    'sigmaStateCommit',
    'scalaVersion',
    'sbtVersion',
    'contracts',
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ], 'pooled-reserve burn-family V5 compiler batch');
  const batch = parsed as unknown as
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
    || batch.contracts.length !== 4
  ) {
    throw new Error(
      'pooled-reserve burn-family V5 compiler batch identity is invalid',
    );
  }
  assertFalseCompilerBoundaries(
    batch,
    'pooled-reserve burn-family V5 compiler batch',
  );

  const request = input.request;
  const trackerSource = resolveTemplate(
    templates.tracker.source,
    [
      [
        'POOLED_RESERVE_BURN_V5_PROGRAM_ID_PLACEHOLDER',
        request.bindings.programIdHex,
      ],
      [
        'POOLED_RESERVE_BURN_V5_VERIFIER_PROFILE_ID_PLACEHOLDER',
        request.bindings.verifierProfileIdHex,
      ],
      [
        'POOLED_RESERVE_BURN_V5_APPLICATION_BINDING_PREFIX_PLACEHOLDER',
        request.bindings.applicationBindingPrefixHex,
      ],
      [
        'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        request.lineage.profileIdHex,
      ],
    ],
    PLACEHOLDERS.tracker,
    'pooled-reserve burn-family V5 tracker',
  );
  const tracker = validateCompiledContract(
    batch.contracts[0],
    'tracker',
    templates.tracker,
    trackerSource,
    4,
  );

  const applicationBinding = encodePooledReserveBurnApplicationBindingV5({
    runtimeProfileScaleHex: `0x${request.sourceRuntime.profileScaleHex}`,
    sourceRuntimeCodeSha256Hex:
      request.bindings.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: request.bindings.sourceRuntimeCodeBytes,
    trackerNftIdHex: request.lineage.trackerNftIdHex,
    settlementTrackerContractIdHex:
      tracker.receipt.contractIdHex,
  });
  if (
    applicationBinding
      .subarray(0, POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_PREFIX_BYTES)
      .toString('hex') !== request.bindings.applicationBindingPrefixHex
  ) {
    throw new Error(
      'pooled-reserve burn-family V5 application binding prefix drifted',
    );
  }
  const applicationBindingDigestHex =
    derivePooledReserveBurnApplicationBindingV5DigestHex(applicationBinding);

  const duplicatePreventionSource = resolveTemplate(
    templates.duplicatePrevention.source,
    [
      ['POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER',
        request.lineage.trackerNftIdHex],
      ['POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
        request.lineage.duplicatePreventionNftIdHex],
      ['POOLED_RESERVE_NFT_ID_PLACEHOLDER',
        request.lineage.pooledReserveNftIdHex],
      ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        request.lineage.profileIdHex],
      ['POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER',
        tracker.receipt.contractIdHex],
      ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
        request.bindings.sidechainIdHex],
      ['POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
        request.bindings.approvedTrustAnchorDigestHex],
    ],
    PLACEHOLDERS.duplicatePrevention,
    'pooled-reserve burn-family V5 duplicate prevention',
  );
  const duplicatePrevention = validateCompiledContract(
    batch.contracts[1],
    'duplicatePrevention',
    templates.duplicatePrevention,
    duplicatePreventionSource,
    0,
  );

  const sourceLockSource = resolveTemplate(
    templates.sourceLock.source,
    [
      ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
        request.bindings.sourceNetworkIdHex],
      ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
        request.bindings.sidechainIdHex],
      ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
        request.bindings.bridgeAddressHex],
      ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
        request.bindings.tokenAddressHex],
      ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
        request.bindings.settlementProfileIdHex],
      ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        request.lineage.profileIdHex],
      ['POOLED_RESERVE_NFT_ID_PLACEHOLDER',
        request.lineage.pooledReserveNftIdHex],
    ],
    PLACEHOLDERS.sourceLock,
    'pooled-reserve burn-family V5 source lock',
  );
  const sourceLock = validateCompiledContract(
    batch.contracts[2],
    'sourceLock',
    templates.sourceLock,
    sourceLockSource,
    0,
  );

  const pooledReserveSource = resolveTemplate(
    templates.pooledReserve.source,
    [
      ['POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER',
        request.lineage.trackerNftIdHex],
      ['POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
        request.lineage.duplicatePreventionNftIdHex],
      ['POOLED_RESERVE_NFT_ID_PLACEHOLDER',
        request.lineage.pooledReserveNftIdHex],
      ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        request.lineage.profileIdHex],
      ['POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER',
        tracker.receipt.contractIdHex],
      ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
        request.bindings.sidechainIdHex],
      ['POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
        request.bindings.approvedTrustAnchorDigestHex],
      ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
        request.bindings.sourceNetworkIdHex],
      ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
        request.bindings.bridgeAddressHex],
      ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
        request.bindings.tokenAddressHex],
      ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
        request.bindings.settlementProfileIdHex],
      ['POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER',
        duplicatePrevention.receipt.contractIdHex],
      ['POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER',
        sourceLock.receipt.contractIdHex],
      ['POOLED_RESERVE_APPLICATION_BINDING_DIGEST_PLACEHOLDER',
        applicationBindingDigestHex],
    ],
    PLACEHOLDERS.pooledReserve,
    'pooled-reserve burn-family V5 reserve',
  );
  const pooledReserve = validateCompiledContract(
    batch.contracts[3],
    'pooledReserve',
    templates.pooledReserve,
    pooledReserveSource,
    0,
  );

  return deepFreeze({
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_IDENTITY_SCHEMA,
    version: 5 as const,
    compilerBatchSha256Hex:
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_BATCH_SHA256_HEX,
    lineageProfileIdHex: request.lineage.profileIdHex,
    sourceRuntimeProfileIdHex: request.sourceRuntime.profileIdHex,
    sourceRuntimeLineageProfileIdHex:
      request.sourceRuntime.lineageProfileIdHex,
    proofProfileIdHex: request.policies.proofProfileIdHex,
    applicationBindingHex: applicationBinding.toString('hex'),
    applicationBindingDigestHex,
    contracts: {
      tracker,
      duplicatePrevention,
      sourceLock,
      pooledReserve,
    },
    relations: {
      sourceRuntimeBoundIntoTracker: true as const,
      trackerBoundIntoDuplicatePrevention: true as const,
      trackerBoundIntoPooledReserve: true as const,
      duplicatePreventionBoundIntoPooledReserve: true as const,
      sourceLockBoundIntoPooledReserve: true as const,
      applicationBindingBoundIntoPooledReserve: true as const,
    },
    boundaries: {
      profileActivated: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
}

function validateCompiledContract(
  value: unknown,
  expectedRole: ContractRole,
  template: NormalizedTemplate,
  resolvedSource: string,
  expectedTreeVersion: 0 | 4,
) {
  const expectedResolvedSourceSha256Hex = createHash('sha256')
    .update(Buffer.from(resolvedSource, 'ascii'))
    .digest('hex');
  assertExactKeys(value, [
    'schema',
    'version',
    'role',
    'sigmaStateCommit',
    'scalaVersion',
    'sbtVersion',
    'scriptVersion',
    'treeVersion',
    'resolvedSourceSha256Hex',
    'propositionBytes',
    'propositionSha256Hex',
    'propositionHex',
    'contractIdHex',
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ], `${expectedRole} burn-family V5 compiler receipt`);
  const receipt = value as unknown as
    ValidityApplicationPooledReserveCompilerReceiptV1;
  if (
    receipt.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_RECEIPT_V1_SCHEMA
    || receipt.version !== 1
    || receipt.role !== expectedRole
    || receipt.sigmaStateCommit
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT
    || receipt.scalaVersion
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION
    || receipt.sbtVersion !== VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION
    || receipt.scriptVersion !== 3
    || receipt.treeVersion !== expectedTreeVersion
    || !Number.isSafeInteger(receipt.propositionBytes)
    || receipt.propositionBytes <= 0
    || receipt.propositionBytes >= 4096
    || fixedBareHex(
      receipt.resolvedSourceSha256Hex,
      32,
      `${expectedRole} resolved-source SHA-256`,
    ) !== expectedResolvedSourceSha256Hex
  ) {
    throw new Error(`${expectedRole} burn-family V5 compiler receipt is invalid`);
  }
  const propositionHex = variableBareHex(
    receipt.propositionHex,
    `${expectedRole} proposition`,
  );
  const proposition = Buffer.from(propositionHex, 'hex');
  const propositionSha256Hex = createHash('sha256')
    .update(proposition)
    .digest('hex');
  const contractIdHex = Buffer.from(
    blakejs.blake2b(proposition, undefined, 32),
  ).toString('hex');
  if (
    proposition.length !== receipt.propositionBytes
    || fixedBareHex(
      receipt.propositionSha256Hex,
      32,
      `${expectedRole} proposition SHA-256`,
    ) !== propositionSha256Hex
    || fixedBareHex(
      receipt.contractIdHex,
      32,
      `${expectedRole} contract ID`,
    ) !== contractIdHex
    || contractIdHex
      !== VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS[
        expectedRole
      ]
  ) {
    throw new Error(
      `${expectedRole} burn-family V5 proposition identity is invalid`,
    );
  }
  assertFalseCompilerBoundaries(
    receipt,
    `${expectedRole} burn-family V5 compiler receipt`,
  );
  return deepFreeze({
    templateSha256Hex: template.sha256Hex,
    resolvedSourceSha256Hex: expectedResolvedSourceSha256Hex,
    receipt: { ...receipt },
  });
}

function resolveTemplate(
  source: string,
  replacements: readonly (readonly [string, string])[],
  expectedPlaceholders: readonly string[],
  label: string,
): string {
  const replacementNames = replacements.map(([placeholder]) => placeholder);
  if (
    replacementNames.length !== expectedPlaceholders.length
    || replacementNames.some((value, index) =>
      value !== expectedPlaceholders[index]
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

function assertFalseCompilerBoundaries(
  value: {
    readonly profileActivated: unknown;
    readonly nodeCheckPerformed: unknown;
    readonly signingAuthorityEstablished: unknown;
    readonly submissionAuthorityEstablished: unknown;
    readonly broadcastAuthorityEstablished: unknown;
    readonly fundsAuthorityEstablished: unknown;
    readonly gate5Closed: unknown;
  },
  label: string,
): void {
  for (const key of [
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ] as const) {
    if (value[key] !== false) {
      throw new Error(`${label} must keep ${key} false`);
    }
  }
}

function fixedBareHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase hex bytes`);
  }
  return value;
}

function variableBareHex(value: unknown, label: string): string {
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

function normalizeTemplates(
  templates: BuildValidityApplicationPooledReserveBurnFamilyV5CompilerRequestInput[
    'templates'
  ],
): NormalizedTemplates {
  return Object.fromEntries(
    (Object.keys(CONTRACT_PATHS) as ContractRole[]).map(role => {
      const template = templates[role];
      assertExactKeys(template, ['relativePath', 'source'], `${role} template`);
      if (template.relativePath !== CONTRACT_PATHS[role]) {
        throw new Error(`${role} template path is not the canonical V5 path`);
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
        || actual.some((value, index) => value !== expected[index])
      ) {
        throw new Error(`${role} template placeholder set is invalid`);
      }
      return [role, Object.freeze({
        relativePath: template.relativePath,
        source: template.source,
        sha256Hex: createHash('sha256')
          .update(Buffer.from(template.source, 'ascii'))
          .digest('hex'),
      })];
    }),
  ) as NormalizedTemplates;
}

function normalizeRuntimeBinding(
  input: ValidityApplicationPooledReserveRuntimeBindingV4,
) {
  assertExactKeys(input, [
    'sourceRuntimeCodeSha256Hex',
    'sourceRuntimeCodeBytes',
    'bridgeRuntimeCodeSha256Hex',
    'bridgeRuntimeCodeBytes',
    'tokenRuntimeCodeSha256Hex',
    'tokenRuntimeCodeBytes',
    'maxPendingBlocks',
  ], 'pooled-reserve burn-family V5 runtime binding');
  return Object.freeze({
    sourceRuntimeCodeSha256Hex: prefixedHex(
      input.sourceRuntimeCodeSha256Hex,
      32,
      'source runtime code SHA-256',
    ),
    sourceRuntimeCodeBytes: positiveUint32(
      input.sourceRuntimeCodeBytes,
      'source runtime code bytes',
    ),
    bridgeRuntimeCodeSha256Hex: prefixedHex(
      input.bridgeRuntimeCodeSha256Hex,
      32,
      'bridge runtime code SHA-256',
    ),
    bridgeRuntimeCodeBytes: positiveUint32(
      input.bridgeRuntimeCodeBytes,
      'bridge runtime code bytes',
    ),
    tokenRuntimeCodeSha256Hex: prefixedHex(
      input.tokenRuntimeCodeSha256Hex,
      32,
      'token runtime code SHA-256',
    ),
    tokenRuntimeCodeBytes: positiveUint32(
      input.tokenRuntimeCodeBytes,
      'token runtime code bytes',
    ),
    maxPendingBlocks: positiveUint32(
      input.maxPendingBlocks,
      'maximum pending blocks',
    ),
  });
}

function positiveUint32(
  value: string | number | bigint,
  label: string,
): number {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must be an unsigned integer`);
  }
  if (parsed < 1n || parsed > 0xffff_ffffn) {
    throw new Error(`${label} must fit a positive uint32`);
  }
  return Number(parsed);
}

function prefixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^(?:0x)?[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase hex bytes`);
  }
  return `0x${stripPrefix(value)}`;
}

function stripPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
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
