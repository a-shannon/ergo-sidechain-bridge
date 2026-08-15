import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  encodeBridgeCausalApplicationBindingV2,
  deriveBridgeCausalApplicationBindingV2DigestHex,
} from './bridge-validity-application-statement-v2.js';
import {
  assertDerivedPegInPooledReserveLineageProfileV4Candidate,
  type PegInPooledReserveLineageProfileV4Candidate,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  derivePooledReserveMintReservationRuntimeProfileV4,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  derivePooledReserveBurnApplicationBindingV4DigestHex,
  encodePooledReserveBurnApplicationBindingV4,
  encodePooledReserveBurnApplicationBindingV4Prefix,
} from './pooled-reserve-burn-statement-v4.js';
export const VALIDITY_APPLICATION_POOLED_RESERVE_INSTANCE_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-instance.v4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_RECEIPT_V1_SCHEMA =
  'e2s.validity-application-pooled-reserve-compiler-receipt.v1' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SCHEMA =
  'e2s.validity-application-pooled-reserve-compiler-batch.v1' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_SIDECHAIN_FINALITY_POLICY_V1_DOMAIN =
  'E2S_POOLED_RESERVE_SIDECHAIN_FINALITY_POLICY_V1' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_DEPOSIT_FINALITY_POLICY_V1_DOMAIN =
  'E2S_POOLED_RESERVE_ERGO_DEPOSIT_FINALITY_POLICY_V1' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_COMMITMENT_POLICY_V1_DOMAIN =
  'E2S_POOLED_RESERVE_SOURCE_COMMITMENT_POLICY_V1' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_STATE_POLICY_V1_DOMAIN =
  'E2S_POOLED_RESERVE_DEPOSIT_STATE_POLICY_V1' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT =
  'f78deadd668f801e7fae3bc884283f79c6f484fa' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION =
  '2.13.18' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION =
  '1.12.11' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SHA256_HEX =
  '69a545564256e84b28c6744f96e3a484eac76b3c30b97f99f6eee14fda57dc52' as const;

export const VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS =
  10_000 as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH =
  32 as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH =
  32 as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS =
  0x01 as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN =
  'E2S_PEG_IN_DEPOSIT_COMMITMENT_V4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_V1_DOMAIN =
  'E2S_EIP0045_BRIDGE_APPLICATION_VALIDITY_PROOF_SYSTEM_V1' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_V1_DOMAIN =
  'E2S_POOLED_RESERVE_APPLICATION_VALIDITY_PROOF_PROFILE_V1' as const;

// These IDs describe the exact preactivation VerifyStark path compiled below.
// They are deliberately distinct from the federated peg-in compatibility
// profile and do not establish target-node activation.
export const VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX =
  domainHash(
    VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_V1_DOMAIN,
    Buffer.from([1]),
  );
export const VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX =
  deriveValidityApplicationPooledReserveProofProfileIdV1Hex({
    statementVersion: 4,
    programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX}`,
    verifierProfileIdHex:
      `0x${POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX}`,
  });

export function deriveValidityApplicationPooledReserveProofProfileIdV1Hex(
  input: {
    readonly statementVersion: 4 | 5;
    readonly programIdHex: string;
    readonly verifierProfileIdHex: string;
  },
): string {
  assertExactDataObject(input, [
    'statementVersion',
    'programIdHex',
    'verifierProfileIdHex',
  ], 'pooled-reserve proof profile');
  if (input.statementVersion !== 4 && input.statementVersion !== 5) {
    throw new Error('pooled-reserve proof-profile statement version is invalid');
  }
  return domainHash(
    VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_V1_DOMAIN,
    Buffer.concat([
      Buffer.from([1, 3, 4, input.statementVersion]),
      fixedHexBytes(
        input.programIdHex,
        32,
        'pooled-reserve proof-profile program ID',
      ),
      fixedHexBytes(
        input.verifierProfileIdHex,
        32,
        'pooled-reserve proof-profile verifier ID',
      ),
    ]),
  );
}

const PLACEHOLDER_PATTERN = /[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g;
const compiledCandidates = new WeakSet<object>();
const TRACKER_PLACEHOLDERS = Object.freeze([
  'POOLED_RESERVE_BURN_V4_PROGRAM_ID_PLACEHOLDER',
  'POOLED_RESERVE_BURN_V4_VERIFIER_PROFILE_ID_PLACEHOLDER',
  'POOLED_RESERVE_BURN_V4_APPLICATION_BINDING_PREFIX_PLACEHOLDER',
] as const);
const DUP_PLACEHOLDERS = Object.freeze([
  'POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER',
  'POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
  'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
  'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
  'POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER',
  'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
  'POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
] as const);
const SOURCE_LOCK_PLACEHOLDERS = Object.freeze([
  'POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
  'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
  'POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
  'POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
  'POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
  'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
  'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
] as const);
const POOLED_RESERVE_PLACEHOLDERS = Object.freeze([
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
] as const);
const pinnedCompilers =
  new WeakSet<ValidityApplicationPooledReserveCompilerV4>();

export type ValidityApplicationPooledReserveContractRoleV4 =
  | 'tracker'
  | 'duplicatePrevention'
  | 'sourceLock'
  | 'pooledReserve';

export interface ValidityApplicationPooledReserveTemplatesV4 {
  readonly tracker: string;
  readonly duplicatePrevention: string;
  readonly sourceLock: string;
  readonly pooledReserve: string;
}

export interface ValidityApplicationPooledReserveRuntimeBindingV4 {
  readonly sourceRuntimeCodeSha256Hex: string;
  readonly sourceRuntimeCodeBytes: string | number | bigint;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: string | number | bigint;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: string | number | bigint;
  readonly maxPendingBlocks: string | number | bigint;
}

export interface ValidityApplicationPooledReserveSidechainFinalityPolicyV1 {
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly approvedTrustAnchorDigestHex: string;
  readonly programIdHex: string;
  readonly verifierProfileIdHex: string;
}

export interface ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1 {
  readonly version: 1;
  readonly requiredSuccessorDepth: string | number | bigint;
  readonly blockIdentityAndAncestryRequired: true;
  readonly divergentRpcAction: 'hold';
  readonly reorgAction: 'invalidate';
}

export interface ValidityApplicationPooledReserveSourceCommitmentPolicyV1 {
  readonly version: 1;
  readonly refundDelayBlocks:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS;
  readonly pooledReserveInputIndex: 0;
  readonly sourceLockInputIndex: 1;
  readonly externalFeeInputIndex: 2;
  readonly pooledReserveOutputIndex: 0;
  readonly externalFeeOutputIndex: 1;
  readonly sourceLockMustBeConsumed: true;
  readonly externalFeeMustBeValueNeutral: true;
}

export interface ValidityApplicationPooledReserveDepositStatePolicyV1 {
  readonly version: 1;
  readonly keyLength:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH;
  readonly valueLength:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH;
  readonly operationFlags:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS;
  readonly keySource: 'source-lock-box-id';
  readonly valueHash: 'blake2b256';
  readonly commitmentDomain:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN;
}

export interface ValidityApplicationPooledReserveCompilerRequestV4 {
  readonly role: ValidityApplicationPooledReserveContractRoleV4;
  readonly source: string;
  readonly resolvedSourceSha256Hex: string;
  readonly scriptVersion: 3;
  readonly treeVersion: 0 | 4;
}

export interface ValidityApplicationPooledReserveCompilerReceiptV1 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly role: ValidityApplicationPooledReserveContractRoleV4;
  readonly sigmaStateCommit: string;
  readonly scalaVersion: string;
  readonly sbtVersion: string;
  readonly scriptVersion: 3;
  readonly treeVersion: 0 | 4;
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly propositionHex: string;
  readonly contractIdHex: string;
  readonly profileActivated: false;
  readonly nodeCheckPerformed: false;
  readonly signingAuthorityEstablished: false;
  readonly submissionAuthorityEstablished: false;
  readonly broadcastAuthorityEstablished: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
}

export interface ValidityApplicationPooledReserveCompilerBatchV1 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SCHEMA;
  readonly version: 1;
  readonly sigmaStateCommit: string;
  readonly scalaVersion: string;
  readonly sbtVersion: string;
  readonly contracts:
    readonly Readonly<ValidityApplicationPooledReserveCompilerReceiptV1>[];
  readonly profileActivated: false;
  readonly nodeCheckPerformed: false;
  readonly signingAuthorityEstablished: false;
  readonly submissionAuthorityEstablished: false;
  readonly broadcastAuthorityEstablished: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
}

export type ValidityApplicationPooledReserveCompilerV4 = (
  request: Readonly<ValidityApplicationPooledReserveCompilerRequestV4>,
) => Promise<Readonly<ValidityApplicationPooledReserveCompilerReceiptV1>>;

export interface CompileValidityApplicationPooledReserveInstanceV4Input {
  readonly lineageCandidate:
    Readonly<PegInPooledReserveLineageProfileV4Candidate>;
  readonly templates: ValidityApplicationPooledReserveTemplatesV4;
  readonly runtimeBinding: ValidityApplicationPooledReserveRuntimeBindingV4;
  readonly sidechainFinalityPolicy:
    ValidityApplicationPooledReserveSidechainFinalityPolicyV1;
  readonly ergoDepositFinalityPolicy:
    ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1;
  readonly sourceCommitmentPolicy:
    ValidityApplicationPooledReserveSourceCommitmentPolicyV1;
  readonly depositCommitmentStatePolicy:
    ValidityApplicationPooledReserveDepositStatePolicyV1;
  readonly compiler: ValidityApplicationPooledReserveCompilerV4;
}

export interface CompiledValidityApplicationPooledReserveContractV4 {
  readonly templateSha256Hex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly receipt:
    Readonly<ValidityApplicationPooledReserveCompilerReceiptV1>;
}

export interface ValidityApplicationPooledReserveInstanceV4Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_INSTANCE_V4_SCHEMA;
  readonly version: 4;
  readonly lineageProfileIdHex: string;
  readonly encodedLineageProfileHex: string;
  readonly genesis: {
    readonly trackerInputBoxIdHex: string;
    readonly trackerNftIdHex: string;
    readonly duplicatePreventionInputBoxIdHex: string;
    readonly duplicatePreventionNftIdHex: string;
    readonly settlementVaultInputBoxIdHex: string;
    readonly settlementVaultNftIdHex: string;
  };
  readonly application: {
    readonly sourceRuntimeBindingHex: string;
    readonly sourceRuntimeBindingDigestHex: string;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly bindingHex: string;
    readonly bindingDigestHex: string;
    readonly runtimeProfileScaleHex: string;
    readonly runtimeProfileIdHex: string;
    readonly burnBindingHex: string;
    readonly burnBindingDigestHex: string;
    readonly programIdHex: string;
    readonly verifierProfileIdHex: string;
    readonly statementContractIdHex: string;
  };
  readonly sidechainFinalityPolicy: {
    readonly policyIdHex: string;
    readonly proofSystemIdHex: string;
    readonly proofProfileIdHex: string;
    readonly approvedTrustAnchorDigestHex: string;
  };
  readonly ergoDepositFinalityPolicy: {
    readonly policyIdHex: string;
    readonly version: 1;
    readonly requiredSuccessorDepth: string;
    readonly blockIdentityAndAncestryRequired: true;
    readonly divergentRpcAction: 'hold';
    readonly reorgAction: 'invalidate';
  };
  readonly sourceCommitmentPolicy: {
    readonly policyIdHex: string;
  } & ValidityApplicationPooledReserveSourceCommitmentPolicyV1;
  readonly depositCommitmentStatePolicy: {
    readonly policyIdHex: string;
  } & ValidityApplicationPooledReserveDepositStatePolicyV1;
  readonly contracts: {
    readonly tracker: CompiledValidityApplicationPooledReserveContractV4;
    readonly duplicatePrevention:
      CompiledValidityApplicationPooledReserveContractV4;
    readonly sourceLock: CompiledValidityApplicationPooledReserveContractV4;
    readonly pooledReserve:
      CompiledValidityApplicationPooledReserveContractV4;
  };
  readonly relations: {
    readonly trackerContractBoundIntoDuplicatePrevention: true;
    readonly trackerContractBoundIntoPooledReserve: true;
    readonly duplicatePreventionContractBoundIntoPooledReserve: true;
    readonly sourceLockContractBoundIntoPooledReserve: true;
    readonly singletonIdsDerivedFromGenesisInputs: true;
  };
  readonly boundaries: {
    readonly setupTransactionsConstructed: false;
    readonly singletonLineagesEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly depositCommitmentStateEstablished: false;
    readonly mintEligibilityEstablished: false;
    readonly burnSettlementEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
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

export function createPinnedValidityApplicationPooledReserveCompilerV4(
  batchJson: string,
): ValidityApplicationPooledReserveCompilerV4 {
  if (
    typeof batchJson !== 'string'
    || batchJson.length === 0
    || batchJson.charCodeAt(0) === 0xfeff
    || batchJson.includes('\r')
    || !Buffer.from(batchJson, 'utf8').equals(Buffer.from(batchJson, 'ascii'))
  ) {
    throw new Error(
      'pooled-reserve compiler batch must be non-empty BOM-free LF-only ASCII JSON',
    );
  }
  if (
    sha256Utf8(batchJson)
    !== VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SHA256_HEX
  ) {
    throw new Error(
      'pooled-reserve compiler batch does not match the reviewed SHA-256 lock',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(batchJson);
  } catch {
    throw new Error('pooled-reserve compiler batch is not valid JSON');
  }
  assertExactDataObject(parsed, [
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
  ], 'pooled-reserve compiler batch');
  const batch = parsed as unknown as ValidityApplicationPooledReserveCompilerBatchV1;
  if (
    batch.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SCHEMA
    || batch.version !== 1
    || batch.sigmaStateCommit
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT
    || batch.scalaVersion
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION
    || batch.sbtVersion !== VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION
    || !Array.isArray(batch.contracts)
    || batch.contracts.length !== 4
  ) {
    throw new Error('pooled-reserve compiler batch identity is invalid');
  }
  assertFalseBoundaries(batch, 'pooled-reserve compiler batch');

  const expectedRoles:
    readonly ValidityApplicationPooledReserveContractRoleV4[] = [
      'tracker',
      'duplicatePrevention',
      'sourceLock',
      'pooledReserve',
    ];
  const receipts = new Map<
    ValidityApplicationPooledReserveContractRoleV4,
    Readonly<ValidityApplicationPooledReserveCompilerReceiptV1>
  >();
  for (const [index, value] of batch.contracts.entries()) {
    const role = expectedRoles[index];
    if (role === undefined) {
      throw new Error('pooled-reserve compiler batch role order is invalid');
    }
    const receipt = validateCompilerReceipt(value, role);
    receipts.set(role, receipt);
  }

  const compiler: ValidityApplicationPooledReserveCompilerV4 =
    async request => {
      const receipt = receipts.get(request.role);
      if (receipt === undefined) {
        throw new Error(`missing pinned ${request.role} compiler receipt`);
      }
      return receipt;
    };
  pinnedCompilers.add(compiler);
  return compiler;
}

export function deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex(
  input: ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
): string {
  const policy = normalizeSidechainFinalityPolicyIdentity(input);
  return domainHash(
    VALIDITY_APPLICATION_POOLED_RESERVE_SIDECHAIN_FINALITY_POLICY_V1_DOMAIN,
    Buffer.concat([
      Buffer.from([1]),
      fixedHexBytes(policy.proofSystemIdHex, 32, 'proof-system ID'),
      fixedHexBytes(policy.proofProfileIdHex, 32, 'proof-profile ID'),
      fixedHexBytes(
        policy.approvedTrustAnchorDigestHex,
        32,
        'approved trust-anchor digest',
      ),
      fixedHexBytes(policy.programIdHex, 32, 'program ID'),
      fixedHexBytes(
        policy.verifierProfileIdHex,
        32,
        'verifier profile ID',
      ),
    ]),
  );
}

export function deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex(
  input: ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
): string {
  const policy = normalizeErgoDepositFinalityPolicy(input);
  return domainHash(
    VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_DEPOSIT_FINALITY_POLICY_V1_DOMAIN,
    Buffer.concat([
      Buffer.from([policy.version]),
      uint32Be(
        BigInt(policy.requiredSuccessorDepth),
        'required successor depth',
      ),
      Buffer.from([0x07]),
    ]),
  );
}

export function deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex(
  input: ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
): string {
  const policy = normalizeSourceCommitmentPolicy(input);
  return domainHash(
    VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_COMMITMENT_POLICY_V1_DOMAIN,
    Buffer.concat([
      Buffer.from([policy.version]),
      uint32Be(BigInt(policy.refundDelayBlocks), 'refund delay blocks'),
      Buffer.from([
        policy.pooledReserveInputIndex,
        policy.sourceLockInputIndex,
        policy.externalFeeInputIndex,
        policy.pooledReserveOutputIndex,
        policy.externalFeeOutputIndex,
        0x03,
      ]),
    ]),
  );
}

export function deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex(
  input: ValidityApplicationPooledReserveDepositStatePolicyV1,
): string {
  const policy = normalizeDepositStatePolicy(input);
  return domainHash(
    VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_STATE_POLICY_V1_DOMAIN,
    Buffer.concat([
      Buffer.from([policy.version]),
      uint16Be(policy.keyLength, 'deposit key length'),
      uint16Be(policy.valueLength, 'deposit value length'),
      Buffer.from([policy.operationFlags, 1, 1]),
      Buffer.from(policy.commitmentDomain, 'ascii'),
    ]),
  );
}

export async function compileValidityApplicationPooledReserveInstanceV4(
  input: CompileValidityApplicationPooledReserveInstanceV4Input,
): Promise<Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>> {
  assertExactDataObject(input, [
    'lineageCandidate',
    'templates',
    'runtimeBinding',
    'sidechainFinalityPolicy',
    'ergoDepositFinalityPolicy',
    'sourceCommitmentPolicy',
    'depositCommitmentStatePolicy',
    'compiler',
  ], 'pooled-reserve compiler input');
  assertDerivedPegInPooledReserveLineageProfileV4Candidate(
    input.lineageCandidate,
  );
  if (
    typeof input.compiler !== 'function'
    || !pinnedCompilers.has(input.compiler)
  ) {
    throw new Error(
      'pooled-reserve compiler must come from the reviewed pinned compiler batch',
    );
  }

  const candidate = input.lineageCandidate;
  const profile = candidate.profile;
  const templates = normalizeTemplates(input.templates, profile);
  const runtime = normalizeRuntimeBinding(input.runtimeBinding);
  const sidechainFinality =
    normalizeSidechainFinalityPolicy(input.sidechainFinalityPolicy);
  const ergoDepositFinality =
    normalizeErgoDepositFinalityPolicy(input.ergoDepositFinalityPolicy);
  const sourceCommitment =
    normalizeSourceCommitmentPolicy(input.sourceCommitmentPolicy);
  const depositState =
    normalizeDepositStatePolicy(input.depositCommitmentStatePolicy);

  const sidechainFinalityPolicyIdHex =
    deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex(
      sidechainFinality,
    );
  const ergoDepositFinalityPolicyIdHex =
    deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex(
      ergoDepositFinality,
    );
  const sourceCommitmentPolicyIdHex =
    deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex(
      sourceCommitment,
    );
  const depositCommitmentStatePolicyIdHex =
    deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex(
      depositState,
    );
  assertPolicyBinding(
    sidechainFinalityPolicyIdHex,
    profile.sidechainFinalityPolicyIdHex,
    'sidechain-finality',
  );
  assertPolicyBinding(
    ergoDepositFinalityPolicyIdHex,
    profile.ergoDepositFinalityPolicyIdHex,
    'Ergo-deposit-finality',
  );
  assertPolicyBinding(
    sourceCommitmentPolicyIdHex,
    profile.sourceCommitmentPolicyIdHex,
    'source-commitment',
  );
  assertPolicyBinding(
    depositCommitmentStatePolicyIdHex,
    profile.depositCommitmentStatePolicyIdHex,
    'deposit-state',
  );
  if (
    normalizePrefixedHex(sidechainFinality.proofSystemIdHex, 32)
      !== profile.proofSystemIdHex
    || normalizePrefixedHex(sidechainFinality.proofProfileIdHex, 32)
      !== profile.proofProfileIdHex
  ) {
    throw new Error(
      'sidechain-finality proof identity does not match the pooled-reserve profile',
    );
  }

  const sourceRuntimeBindingInput = {
    sourceNetworkIdHex: stripHexPrefix(profile.sourceNetworkIdHex),
    sidechainIdHex: stripHexPrefix(profile.sidechainIdHex),
    bridgeAddressHex: stripHexPrefix(profile.bridgeAddressHex),
    tokenAddressHex: stripHexPrefix(profile.tokenAddressHex),
    settlementProfileIdHex: stripHexPrefix(profile.settlementProfileIdHex),
    causalProfileIdHex: stripHexPrefix(candidate.profileIdHex),
    bridgeRuntimeCodeSha256Hex:
      stripHexPrefix(runtime.bridgeRuntimeCodeSha256Hex),
    bridgeRuntimeCodeBytes: Number(runtime.bridgeRuntimeCodeBytes),
    tokenRuntimeCodeSha256Hex:
      stripHexPrefix(runtime.tokenRuntimeCodeSha256Hex),
    tokenRuntimeCodeBytes: Number(runtime.tokenRuntimeCodeBytes),
  };
  const sourceRuntimeBinding =
    encodeBridgeCausalApplicationBindingV2(sourceRuntimeBindingInput);
  const sourceRuntimeBindingDigestHex =
    deriveBridgeCausalApplicationBindingV2DigestHex(sourceRuntimeBinding);
  const runtimeProfile = derivePooledReserveMintReservationRuntimeProfileV4({
    encodedLineageProfileHex: candidate.encodedProfileHex,
    lineageProfileIdHex: candidate.profileIdHex,
    bridgeRuntimeCodeSha256Hex: runtime.bridgeRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes: Number(runtime.bridgeRuntimeCodeBytes),
    tokenRuntimeCodeSha256Hex: runtime.tokenRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes: Number(runtime.tokenRuntimeCodeBytes),
    maxPendingBlocks: Number(runtime.maxPendingBlocks),
  });
  const runtimeProfileScaleHex =
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(runtimeProfile);
  const runtimeProfileIdHex =
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(
      runtimeProfileScaleHex,
    );
  const burnBindingPrefix = encodePooledReserveBurnApplicationBindingV4Prefix({
    runtimeProfileScaleHex,
    sourceRuntimeCodeSha256Hex:
      stripHexPrefix(runtime.sourceRuntimeCodeSha256Hex),
    sourceRuntimeCodeBytes: Number(runtime.sourceRuntimeCodeBytes),
    trackerNftIdHex:
      stripHexPrefix(candidate.genesis.tracker.singletonNftIdHex),
  });

  const trackerSource = resolveTemplate(
    templates.tracker.source,
    [
      [
        'POOLED_RESERVE_BURN_V4_PROGRAM_ID_PLACEHOLDER',
        stripHexPrefix(sidechainFinality.programIdHex),
      ],
      [
        'POOLED_RESERVE_BURN_V4_VERIFIER_PROFILE_ID_PLACEHOLDER',
        stripHexPrefix(sidechainFinality.verifierProfileIdHex),
      ],
      [
        'POOLED_RESERVE_BURN_V4_APPLICATION_BINDING_PREFIX_PLACEHOLDER',
        burnBindingPrefix.toString('hex'),
      ],
    ],
    TRACKER_PLACEHOLDERS,
    'pooled-reserve tracker',
  );
  const tracker = await compileAndValidate(
    input.compiler,
    'tracker',
    templates.tracker.sha256Hex,
    trackerSource,
    4,
  );
  const burnBinding = encodePooledReserveBurnApplicationBindingV4({
    runtimeProfileScaleHex,
    sourceRuntimeCodeSha256Hex:
      stripHexPrefix(runtime.sourceRuntimeCodeSha256Hex),
    sourceRuntimeCodeBytes: Number(runtime.sourceRuntimeCodeBytes),
    trackerNftIdHex:
      stripHexPrefix(candidate.genesis.tracker.singletonNftIdHex),
    settlementTrackerContractIdHex: tracker.receipt.contractIdHex,
  });
  const burnBindingDigestHex =
    derivePooledReserveBurnApplicationBindingV4DigestHex(burnBinding);

  const duplicatePreventionSource = resolveTemplate(
    templates.duplicatePrevention.source,
    [
      [
        'POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER',
        stripHexPrefix(candidate.genesis.tracker.singletonNftIdHex),
      ],
      [
        'POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
        stripHexPrefix(
          candidate.genesis.duplicatePrevention.singletonNftIdHex,
        ),
      ],
      [
        'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
        stripHexPrefix(candidate.genesis.settlementVault.singletonNftIdHex),
      ],
      [
        'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        stripHexPrefix(candidate.profileIdHex),
      ],
      [
        'POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER',
        tracker.receipt.contractIdHex,
      ],
      [
        'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
        stripHexPrefix(profile.sidechainIdHex),
      ],
      [
        'POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
        stripHexPrefix(sidechainFinality.approvedTrustAnchorDigestHex),
      ],
    ],
    DUP_PLACEHOLDERS,
    'pooled-reserve duplicate prevention',
  );
  const duplicatePrevention = await compileAndValidate(
    input.compiler,
    'duplicatePrevention',
    templates.duplicatePrevention.sha256Hex,
    duplicatePreventionSource,
    0,
  );

  const sourceLockSource = resolveTemplate(
    templates.sourceLock.source,
    [
      [
        'POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
        stripHexPrefix(profile.sourceNetworkIdHex),
      ],
      [
        'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
        stripHexPrefix(profile.sidechainIdHex),
      ],
      [
        'POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
        stripHexPrefix(profile.bridgeAddressHex),
      ],
      [
        'POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
        stripHexPrefix(profile.tokenAddressHex),
      ],
      [
        'POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
        stripHexPrefix(profile.settlementProfileIdHex),
      ],
      [
        'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        stripHexPrefix(candidate.profileIdHex),
      ],
      [
        'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
        stripHexPrefix(candidate.genesis.settlementVault.singletonNftIdHex),
      ],
    ],
    SOURCE_LOCK_PLACEHOLDERS,
    'pooled-reserve source lock',
  );
  const sourceLock = await compileAndValidate(
    input.compiler,
    'sourceLock',
    templates.sourceLock.sha256Hex,
    sourceLockSource,
    0,
  );

  const pooledReserveSource = resolveTemplate(
    templates.pooledReserve.source,
    [
      [
        'POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER',
        stripHexPrefix(candidate.genesis.tracker.singletonNftIdHex),
      ],
      [
        'POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
        stripHexPrefix(
          candidate.genesis.duplicatePrevention.singletonNftIdHex,
        ),
      ],
      [
        'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
        stripHexPrefix(candidate.genesis.settlementVault.singletonNftIdHex),
      ],
      [
        'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
        stripHexPrefix(candidate.profileIdHex),
      ],
      [
        'POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER',
        tracker.receipt.contractIdHex,
      ],
      [
        'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
        stripHexPrefix(profile.sidechainIdHex),
      ],
      [
        'POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
        stripHexPrefix(sidechainFinality.approvedTrustAnchorDigestHex),
      ],
      [
        'POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
        stripHexPrefix(profile.sourceNetworkIdHex),
      ],
      [
        'POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
        stripHexPrefix(profile.bridgeAddressHex),
      ],
      [
        'POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
        stripHexPrefix(profile.tokenAddressHex),
      ],
      [
        'POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
        stripHexPrefix(profile.settlementProfileIdHex),
      ],
      [
        'POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER',
        duplicatePrevention.receipt.contractIdHex,
      ],
      [
        'POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER',
        sourceLock.receipt.contractIdHex,
      ],
      [
        'POOLED_RESERVE_APPLICATION_BINDING_DIGEST_PLACEHOLDER',
        burnBindingDigestHex,
      ],
    ],
    POOLED_RESERVE_PLACEHOLDERS,
    'pooled reserve',
  );
  const pooledReserve = await compileAndValidate(
    input.compiler,
    'pooledReserve',
    templates.pooledReserve.sha256Hex,
    pooledReserveSource,
    0,
  );

  const result = deepFreeze({
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_INSTANCE_V4_SCHEMA,
    version: 4 as const,
    lineageProfileIdHex: candidate.profileIdHex,
    encodedLineageProfileHex: candidate.encodedProfileHex,
    genesis: Object.freeze({
      trackerInputBoxIdHex: profile.trackerGenesisInputBoxIdHex,
      trackerNftIdHex: candidate.genesis.tracker.singletonNftIdHex,
      duplicatePreventionInputBoxIdHex:
        profile.duplicatePreventionGenesisInputBoxIdHex,
      duplicatePreventionNftIdHex:
        candidate.genesis.duplicatePrevention.singletonNftIdHex,
      settlementVaultInputBoxIdHex:
        profile.settlementVaultGenesisInputBoxIdHex,
      settlementVaultNftIdHex:
        candidate.genesis.settlementVault.singletonNftIdHex,
    }),
    application: Object.freeze({
      sourceRuntimeBindingHex: sourceRuntimeBinding.toString('hex'),
      sourceRuntimeBindingDigestHex,
      sourceRuntimeCodeSha256Hex: stripHexPrefix(
        runtime.sourceRuntimeCodeSha256Hex,
      ),
      sourceRuntimeCodeBytes: Number(runtime.sourceRuntimeCodeBytes),
      bindingHex: sourceRuntimeBinding.toString('hex'),
      bindingDigestHex: sourceRuntimeBindingDigestHex,
      runtimeProfileScaleHex,
      runtimeProfileIdHex,
      burnBindingHex: burnBinding.toString('hex'),
      burnBindingDigestHex,
      programIdHex: normalizePrefixedHex(
        sidechainFinality.programIdHex,
        32,
      ),
      verifierProfileIdHex: normalizePrefixedHex(
        sidechainFinality.verifierProfileIdHex,
        32,
      ),
      statementContractIdHex: tracker.receipt.contractIdHex,
    }),
    sidechainFinalityPolicy: Object.freeze({
      policyIdHex: sidechainFinalityPolicyIdHex,
      proofSystemIdHex: normalizePrefixedHex(
        sidechainFinality.proofSystemIdHex,
        32,
      ),
      proofProfileIdHex: normalizePrefixedHex(
        sidechainFinality.proofProfileIdHex,
        32,
      ),
      approvedTrustAnchorDigestHex: normalizePrefixedHex(
        sidechainFinality.approvedTrustAnchorDigestHex,
        32,
      ),
    }),
    ergoDepositFinalityPolicy: Object.freeze({
      policyIdHex: ergoDepositFinalityPolicyIdHex,
      ...ergoDepositFinality,
    }),
    sourceCommitmentPolicy: Object.freeze({
      policyIdHex: sourceCommitmentPolicyIdHex,
      ...sourceCommitment,
    }),
    depositCommitmentStatePolicy: Object.freeze({
      policyIdHex: depositCommitmentStatePolicyIdHex,
      ...depositState,
    }),
    contracts: Object.freeze({
      tracker,
      duplicatePrevention,
      sourceLock,
      pooledReserve,
    }),
    relations: Object.freeze({
      trackerContractBoundIntoDuplicatePrevention: true as const,
      trackerContractBoundIntoPooledReserve: true as const,
      duplicatePreventionContractBoundIntoPooledReserve: true as const,
      sourceLockContractBoundIntoPooledReserve: true as const,
      singletonIdsDerivedFromGenesisInputs: true as const,
    }),
    boundaries: Object.freeze({
      setupTransactionsConstructed: false as const,
      singletonLineagesEstablished: false as const,
      reserveLineageEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      depositCommitmentStateEstablished: false as const,
      mintEligibilityEstablished: false as const,
      burnSettlementEstablished: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  compiledCandidates.add(result);
  return result;
}

export function assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveInstanceV4Candidate
> {
  if (
    value === null
    || typeof value !== 'object'
    || !compiledCandidates.has(value)
  ) {
    throw new Error(
      'pooled-reserve V4 instance must be compiled from the same-process reviewed lineage candidate',
    );
  }
}

function normalizeTemplates(
  input: ValidityApplicationPooledReserveTemplatesV4,
  profile: PegInPooledReserveLineageProfileV4Candidate['profile'],
) {
  assertExactDataObject(input, [
    'tracker',
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ], 'pooled-reserve templates');
  return {
    tracker: normalizeTemplate(
      input.tracker,
      profile.validityTrackerTemplateSha256Hex,
      TRACKER_PLACEHOLDERS,
      'pooled-reserve tracker template',
    ),
    duplicatePrevention: normalizeTemplate(
      input.duplicatePrevention,
      profile.duplicatePreventionTemplateSha256Hex,
      DUP_PLACEHOLDERS,
      'pooled-reserve duplicate-prevention template',
    ),
    sourceLock: normalizeTemplate(
      input.sourceLock,
      profile.sourceLockTemplateSha256Hex,
      SOURCE_LOCK_PLACEHOLDERS,
      'pooled-reserve source-lock template',
    ),
    pooledReserve: normalizeTemplate(
      input.pooledReserve,
      profile.settlementVaultTemplateSha256Hex,
      POOLED_RESERVE_PLACEHOLDERS,
      'pooled-reserve template',
    ),
  };
}

function normalizeTemplate(
  source: string,
  expectedSha256Hex: string,
  placeholders: readonly string[],
  label: string,
): { source: string; sha256Hex: string } {
  if (
    typeof source !== 'string'
    || source.length === 0
    || source.charCodeAt(0) === 0xfeff
    || source.includes('\r')
    || !Buffer.from(source, 'utf8').equals(Buffer.from(source, 'ascii'))
  ) {
    throw new Error(`${label} must be non-empty BOM-free LF-only ASCII`);
  }
  const sha256Hex = sha256Utf8(source);
  if (normalizePrefixedHex(expectedSha256Hex, 32) !== `0x${sha256Hex}`) {
    throw new Error(`${label} does not match the lineage profile SHA-256`);
  }
  const actual = [...source.matchAll(PLACEHOLDER_PATTERN)].map(
    match => match[0],
  );
  if (
    actual.length !== placeholders.length
    || actual.some((value, index) => value !== placeholders[index])
  ) {
    const actualSorted = [...actual].sort();
    const expectedSorted = [...placeholders].sort();
    if (
      actualSorted.length !== expectedSorted.length
      || actualSorted.some((value, index) => value !== expectedSorted[index])
    ) {
      throw new Error(`${label} placeholder set is invalid`);
    }
  }
  for (const placeholder of placeholders) {
    if (source.split(placeholder).length !== 2) {
      throw new Error(`${label} must contain ${placeholder} exactly once`);
    }
  }
  return Object.freeze({ source, sha256Hex });
}

function normalizeRuntimeBinding(
  input: ValidityApplicationPooledReserveRuntimeBindingV4,
) {
  assertExactDataObject(input, [
    'sourceRuntimeCodeSha256Hex',
    'sourceRuntimeCodeBytes',
    'bridgeRuntimeCodeSha256Hex',
    'bridgeRuntimeCodeBytes',
    'tokenRuntimeCodeSha256Hex',
    'tokenRuntimeCodeBytes',
    'maxPendingBlocks',
  ], 'pooled-reserve runtime binding');
  return Object.freeze({
    sourceRuntimeCodeSha256Hex: normalizePrefixedHex(
      input.sourceRuntimeCodeSha256Hex,
      32,
    ),
    sourceRuntimeCodeBytes: canonicalUint32(
      input.sourceRuntimeCodeBytes,
      'source runtime code bytes',
      true,
    ),
    bridgeRuntimeCodeSha256Hex: normalizePrefixedHex(
      input.bridgeRuntimeCodeSha256Hex,
      32,
    ),
    bridgeRuntimeCodeBytes: canonicalUint32(
      input.bridgeRuntimeCodeBytes,
      'bridge runtime code bytes',
      true,
    ),
    tokenRuntimeCodeSha256Hex: normalizePrefixedHex(
      input.tokenRuntimeCodeSha256Hex,
      32,
    ),
    tokenRuntimeCodeBytes: canonicalUint32(
      input.tokenRuntimeCodeBytes,
      'token runtime code bytes',
      true,
    ),
    maxPendingBlocks: canonicalUint32(
      input.maxPendingBlocks,
      'maximum pending blocks',
      true,
    ),
  });
}

function normalizeSidechainFinalityPolicy(
  input: ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
) {
  const policy = normalizeSidechainFinalityPolicyIdentity(input);
  if (
    policy.proofSystemIdHex
      !== VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX
    || policy.proofProfileIdHex
      !== VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX
    || policy.programIdHex
      !== `0x${POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX}`
    || policy.verifierProfileIdHex
      !== `0x${POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX}`
  ) {
    throw new Error(
      'pooled-reserve sidechain-finality policy must use the exact '
      + 'application-validity preactivation proof profile',
    );
  }
  return policy;
}

function normalizeSidechainFinalityPolicyIdentity(
  input: ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
) {
  assertExactDataObject(input, [
    'proofSystemIdHex',
    'proofProfileIdHex',
    'approvedTrustAnchorDigestHex',
    'programIdHex',
    'verifierProfileIdHex',
  ], 'pooled-reserve sidechain-finality policy');
  return Object.freeze({
    proofSystemIdHex:
      normalizePrefixedHex(input.proofSystemIdHex, 32),
    proofProfileIdHex:
      normalizePrefixedHex(input.proofProfileIdHex, 32),
    approvedTrustAnchorDigestHex:
      normalizePrefixedHex(input.approvedTrustAnchorDigestHex, 32),
    programIdHex: normalizePrefixedHex(input.programIdHex, 32),
    verifierProfileIdHex:
      normalizePrefixedHex(input.verifierProfileIdHex, 32),
  });
}

function normalizeErgoDepositFinalityPolicy(
  input: ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
) {
  assertExactDataObject(input, [
    'version',
    'requiredSuccessorDepth',
    'blockIdentityAndAncestryRequired',
    'divergentRpcAction',
    'reorgAction',
  ], 'pooled-reserve Ergo-deposit-finality policy');
  if (
    input.version !== 1
    || input.blockIdentityAndAncestryRequired !== true
    || input.divergentRpcAction !== 'hold'
    || input.reorgAction !== 'invalidate'
  ) {
    throw new Error(
      'pooled-reserve Ergo-deposit-finality policy must fail closed on ancestry, RPC disagreement and reorg',
    );
  }
  return Object.freeze({
    version: 1 as const,
    requiredSuccessorDepth: canonicalUint32(
      input.requiredSuccessorDepth,
      'required successor depth',
      false,
    ).toString(),
    blockIdentityAndAncestryRequired: true as const,
    divergentRpcAction: 'hold' as const,
    reorgAction: 'invalidate' as const,
  });
}

function normalizeSourceCommitmentPolicy(
  input: ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
) {
  assertExactDataObject(input, [
    'version',
    'refundDelayBlocks',
    'pooledReserveInputIndex',
    'sourceLockInputIndex',
    'externalFeeInputIndex',
    'pooledReserveOutputIndex',
    'externalFeeOutputIndex',
    'sourceLockMustBeConsumed',
    'externalFeeMustBeValueNeutral',
  ], 'pooled-reserve source-commitment policy');
  const expected = {
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
  } as const;
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (input[key] !== expected[key]) {
      throw new Error(
        `pooled-reserve source-commitment policy ${key} is invalid`,
      );
    }
  }
  return Object.freeze(expected);
}

function normalizeDepositStatePolicy(
  input: ValidityApplicationPooledReserveDepositStatePolicyV1,
) {
  assertExactDataObject(input, [
    'version',
    'keyLength',
    'valueLength',
    'operationFlags',
    'keySource',
    'valueHash',
    'commitmentDomain',
  ], 'pooled-reserve deposit-state policy');
  const expected = {
    version: 1,
    keyLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
    valueLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
    operationFlags:
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
    keySource: 'source-lock-box-id',
    valueHash: 'blake2b256',
    commitmentDomain:
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  } as const;
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (input[key] !== expected[key]) {
      throw new Error(`pooled-reserve deposit-state policy ${key} is invalid`);
    }
  }
  return Object.freeze(expected);
}

function resolveTemplate(
  source: string,
  replacements: ReadonlyArray<readonly [string, string]>,
  expectedPlaceholders: readonly string[],
  label: string,
): string {
  if (
    replacements.length !== expectedPlaceholders.length
    || replacements.some(
      ([placeholder], index) =>
        placeholder !== expectedPlaceholders[index],
    )
  ) {
    throw new Error(`${label} replacement order is invalid`);
  }
  let resolved = source;
  for (const [placeholder, replacement] of replacements) {
    if (
      replacement.length === 0
      || !/^[0-9a-f]+$/.test(replacement)
      || resolved.split(placeholder).length !== 2
    ) {
      throw new Error(`${label} ${placeholder} replacement is invalid`);
    }
    resolved = resolved.replace(placeholder, replacement);
  }
  if (PLACEHOLDER_PATTERN.test(resolved)) {
    PLACEHOLDER_PATTERN.lastIndex = 0;
    throw new Error(`${label} retained a placeholder`);
  }
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return resolved;
}

async function compileAndValidate(
  compiler: ValidityApplicationPooledReserveCompilerV4,
  role: ValidityApplicationPooledReserveContractRoleV4,
  templateSha256Hex: string,
  source: string,
  treeVersion: 0 | 4,
): Promise<Readonly<CompiledValidityApplicationPooledReserveContractV4>> {
  const resolvedSourceSha256Hex = sha256Utf8(source);
  const request = Object.freeze({
    role,
    source,
    resolvedSourceSha256Hex,
    scriptVersion: 3 as const,
    treeVersion,
  });
  const receipt = validateCompilerReceipt(
    await compiler(request),
    role,
    resolvedSourceSha256Hex,
    treeVersion,
  );
  return deepFreeze({
    templateSha256Hex,
    resolvedSourceSha256Hex,
    receipt,
  });
}

function validateCompilerReceipt(
  value: unknown,
  expectedRole: ValidityApplicationPooledReserveContractRoleV4,
  expectedSourceSha256Hex?: string,
  expectedTreeVersion?: 0 | 4,
): Readonly<ValidityApplicationPooledReserveCompilerReceiptV1> {
  assertExactDataObject(value, [
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
  ], `${expectedRole} pooled-reserve compiler receipt`);
  const receipt =
    value as unknown as ValidityApplicationPooledReserveCompilerReceiptV1;
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
    || (receipt.treeVersion !== 0 && receipt.treeVersion !== 4)
    || (
      expectedTreeVersion !== undefined
      && receipt.treeVersion !== expectedTreeVersion
    )
    || !Number.isSafeInteger(receipt.propositionBytes)
    || receipt.propositionBytes <= 0
    || receipt.propositionBytes >= 4096
  ) {
    throw new Error(`${expectedRole} pooled-reserve compiler receipt is invalid`);
  }
  const sourceSha256Hex = fixedBareHex(
    receipt.resolvedSourceSha256Hex,
    32,
    `${expectedRole} resolved-source SHA-256`,
  );
  if (
    expectedSourceSha256Hex !== undefined
    && sourceSha256Hex !== expectedSourceSha256Hex
  ) {
    throw new Error(
      `${expectedRole} pooled-reserve compiler receipt source drifted`,
    );
  }
  const propositionHex = variableBareHex(
    receipt.propositionHex,
    `${expectedRole} proposition`,
  );
  const proposition = Buffer.from(propositionHex, 'hex');
  if (proposition.length !== receipt.propositionBytes) {
    throw new Error(`${expectedRole} proposition byte length is invalid`);
  }
  if (
    fixedBareHex(
      receipt.propositionSha256Hex,
      32,
      `${expectedRole} proposition SHA-256`,
    ) !== sha256Bytes(proposition)
  ) {
    throw new Error(`${expectedRole} proposition SHA-256 is invalid`);
  }
  if (
    fixedBareHex(
      receipt.contractIdHex,
      32,
      `${expectedRole} contract ID`,
    ) !== blake2b256Hex(proposition)
  ) {
    throw new Error(`${expectedRole} contract ID is invalid`);
  }
  assertFalseBoundaries(
    receipt,
    `${expectedRole} pooled-reserve compiler receipt`,
  );
  return deepFreeze({ ...receipt });
}

function assertFalseBoundaries(
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

function assertPolicyBinding(
  actual: string,
  expected: string,
  label: string,
): void {
  if (actual !== normalizePrefixedHex(expected, 32)) {
    throw new Error(`${label} policy ID does not match the lineage profile`);
  }
}

function assertExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpected.length
    || actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expectedKeys.join(', ')}`);
  }
  for (const key of actualKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label} fields must be own enumerable data properties`);
    }
  }
}

function canonicalUint32(
  value: string | number | bigint,
  label: string,
  requirePositive: boolean,
): bigint {
  let parsed: bigint;
  try {
    if (
      typeof value === 'number'
      && (!Number.isSafeInteger(value) || value < 0)
    ) {
      throw new Error();
    }
    if (typeof value === 'string' && !/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new Error();
    }
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must be a canonical uint32`);
  }
  if (
    parsed < 0n
    || parsed > 0xffff_ffffn
    || (requirePositive && parsed === 0n)
  ) {
    throw new Error(`${label} must be a canonical uint32`);
  }
  return parsed;
}

function uint16Be(value: number, label: string): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must be a uint16`);
  }
  const result = Buffer.alloc(2);
  result.writeUInt16BE(value);
  return result;
}

function uint32Be(value: bigint, label: string): Buffer {
  if (value < 0n || value > 0xffff_ffffn) {
    throw new Error(`${label} must be a uint32`);
  }
  const result = Buffer.alloc(4);
  result.writeUInt32BE(Number(value));
  return result;
}

function normalizePrefixedHex(
  value: string,
  bytes: number,
): `0x${string}` {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
    || value === `0x${'00'.repeat(bytes)}`
  ) {
    throw new Error(`value must be ${bytes} nonzero lowercase 0x-prefixed bytes`);
  }
  return value as `0x${string}`;
}

function fixedHexBytes(value: string, bytes: number, label: string): Buffer {
  try {
    return Buffer.from(stripHexPrefix(normalizePrefixedHex(value, bytes)), 'hex');
  } catch {
    throw new Error(`${label} must be ${bytes} nonzero lowercase bytes`);
  }
}

function fixedBareHex(value: string, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase hex bytes`);
  }
  return value;
}

function variableBareHex(value: string, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase even-length hex`);
  }
  return value;
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function domainHash(domain: string, payload: Buffer): `0x${string}` {
  return `0x${blake2b256Hex(Buffer.concat([
    Buffer.from(domain, 'ascii'),
    payload,
  ]))}`;
}

function sha256Utf8(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
