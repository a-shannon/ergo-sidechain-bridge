import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  derivePooledReserveMintReservationRuntimeProfileV4,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  type BuildValidityApplicationPooledReserveBurnFamilyV5CompilerRequestInput,
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerRequest,
  type ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest,
} from './validity-application-pooled-reserve-burn-family-v5.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex,
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex,
  type ValidityApplicationPooledReserveRuntimeBindingV4,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const CONTRACT_PATHS = Object.freeze({
  tracker: 'contracts/SPVTrackerPooledReserveBurnSettlementV5.es',
  duplicatePrevention:
    'contracts/DoubleUnlockPreventionPooledReserveV5.es',
  sourceLock: 'contracts/MainChainLockPooledReserveV5.es',
  pooledReserve:
    'contracts/MainChainPooledReserveValidityApplicationV5.es',
} as const);
const SOURCE_V4_CONTRACT_PATHS = Object.freeze({
  tracker: 'contracts/SPVTrackerPooledReserveBurnV4.es',
  duplicatePrevention:
    'contracts/DoubleUnlockPreventionPooledReserveV4.es',
  sourceLock: 'contracts/MainChainLockPooledReserveV4.es',
  pooledReserve:
    'contracts/MainChainPooledReserveValidityApplicationV4.es',
} as const);
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const GENESIS_TREE = `0008cd02${'11'.repeat(32)}`;
const SOURCE_RUNTIME_CODE = Buffer.alloc(4_096, 0x61);
const RUNTIME_BINDING = Object.freeze({
  sourceRuntimeCodeSha256Hex: `0x${createHash('sha256')
    .update(SOURCE_RUNTIME_CODE)
    .digest('hex')}`,
  sourceRuntimeCodeBytes: SOURCE_RUNTIME_CODE.length,
  bridgeRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
  bridgeRuntimeCodeBytes: 4096,
  tokenRuntimeCodeSha256Hex: `0x${'cc'.repeat(32)}`,
  tokenRuntimeCodeBytes: 2048,
  maxPendingBlocks: 20,
} as const);

let fixturePromise:
Promise<Readonly<
  ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest
>> | undefined;

export function buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture():
Promise<Readonly<
  ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest
>> {
  fixturePromise ??= buildFixture();
  return fixturePromise;
}

async function buildFixture(): Promise<Readonly<
  ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest
>> {
  return buildValidityApplicationPooledReserveBurnFamilyV5CompilerRequest(
    await buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput(),
  );
}

export async function buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput():
Promise<BuildValidityApplicationPooledReserveBurnFamilyV5CompilerRequestInput> {
  const genesis = await buildGenesisBoxes();
  const sourceRuntimeProfileScaleHex =
    await buildSourceRuntimeProfileV4(genesis, RUNTIME_BINDING);
  return {
    templates: {
      tracker: readTemplate('tracker'),
      duplicatePrevention: readTemplate('duplicatePrevention'),
      sourceLock: readTemplate('sourceLock'),
      pooledReserve: readTemplate('pooledReserve'),
    },
    genesis: {
      trackerInput: genesis[0],
      duplicatePreventionInput: genesis[1],
      pooledReserveInput: genesis[2],
    },
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    approvedTrustAnchorDigestHex: `0x${'aa'.repeat(32)}`,
    sourceRuntimeProfileScaleHex,
    runtimeBinding: RUNTIME_BINDING,
  };
}

async function buildSourceRuntimeProfileV4(
  genesis: readonly [Eip12Box, Eip12Box, Eip12Box],
  runtimeBinding: ValidityApplicationPooledReserveRuntimeBindingV4,
): Promise<string> {
  const sourceTemplates = Object.fromEntries(
    Object.entries(SOURCE_V4_CONTRACT_PATHS).map(([role, relativePath]) => [
      role,
      readFileSync(resolve(BRIDGE_ROOT, relativePath), 'utf8'),
    ]),
  ) as Readonly<Record<keyof typeof SOURCE_V4_CONTRACT_PATHS, string>>;
  const sidechainFinalityPolicy = {
    proofSystemIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
    approvedTrustAnchorDigestHex: `0x${'aa'.repeat(32)}`,
    programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX}`,
    verifierProfileIdHex:
      `0x${POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX}`,
  } as const;
  const ergoDepositFinalityPolicy = {
    version: 1,
    requiredSuccessorDepth: 10,
    blockIdentityAndAncestryRequired: true,
    divergentRpcAction: 'hold',
    reorgAction: 'invalidate',
  } as const;
  const sourceCommitmentPolicy = {
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
  const depositStatePolicy = {
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
  const semantics: PegInPooledReserveLineageProfileV4Semantics = {
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    sourceLockTemplateSha256Hex: sha256Hex(sourceTemplates.sourceLock),
    validityTrackerTemplateSha256Hex: sha256Hex(sourceTemplates.tracker),
    settlementVaultTemplateSha256Hex:
      sha256Hex(sourceTemplates.pooledReserve),
    duplicatePreventionTemplateSha256Hex:
      sha256Hex(sourceTemplates.duplicatePrevention),
    sidechainFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex(
        sidechainFinalityPolicy,
      ),
    ergoDepositFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex(
        ergoDepositFinalityPolicy,
      ),
    proofSystemIdHex: sidechainFinalityPolicy.proofSystemIdHex,
    proofProfileIdHex: sidechainFinalityPolicy.proofProfileIdHex,
    sourceCommitmentPolicyIdHex:
      deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex(
        sourceCommitmentPolicy,
      ),
    depositCommitmentStatePolicyIdHex:
      deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex(
        depositStatePolicy,
      ),
    profileRevision: '1',
    activationHeight: '0',
  };
  const sourceLineage = await derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox: genesis[0],
    duplicatePreventionGenesisInputBox: genesis[1],
    settlementVaultGenesisInputBox: genesis[2],
    semantics,
  });
  return encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
    derivePooledReserveMintReservationRuntimeProfileV4({
      encodedLineageProfileHex: sourceLineage.encodedProfileHex,
      lineageProfileIdHex: sourceLineage.profileIdHex,
      bridgeRuntimeCodeSha256Hex:
        runtimeBinding.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: Number(runtimeBinding.bridgeRuntimeCodeBytes),
      tokenRuntimeCodeSha256Hex:
        runtimeBinding.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: Number(runtimeBinding.tokenRuntimeCodeBytes),
      maxPendingBlocks: Number(runtimeBinding.maxPendingBlocks),
    }),
  );
}

async function buildGenesisBoxes(): Promise<readonly [
  Eip12Box,
  Eip12Box,
  Eip12Box,
]> {
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [0, 1, 2].map(() => ({
      value: '100000000',
      ergoTree: GENESIS_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    })),
  }, 'pooled-reserve burn-family V5 compiler genesis fixture');
  return [
    transaction.outputs[0],
    transaction.outputs[1],
    transaction.outputs[2],
  ];
}

function readTemplate(role: keyof typeof CONTRACT_PATHS) {
  const relativePath = CONTRACT_PATHS[role];
  return Object.freeze({
    relativePath,
    source: readFileSync(resolve(BRIDGE_ROOT, relativePath), 'utf8'),
  });
}

function sha256Hex(value: string): string {
  return `0x${createHash('sha256')
    .update(Buffer.from(value, 'ascii'))
    .digest('hex')}`;
}
