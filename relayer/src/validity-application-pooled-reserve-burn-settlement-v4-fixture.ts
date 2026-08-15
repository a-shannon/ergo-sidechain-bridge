import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';

import {
  buildBridgeCheckpointCommitmentV1,
} from './bridge-checkpoint-commitment.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  buildCompiledPooledReserveBurnTrackerV4Context,
  type PooledReserveBurnTrackerV4Context,
} from './pooled-reserve-burn-tracker-v4.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  compileValidityApplicationPooledReserveInstanceV4,
  createPinnedValidityApplicationPooledReserveCompilerV4,
  deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex,
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex,
  type ValidityApplicationPooledReserveDepositStatePolicyV1,
  type ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
  type ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  buildValidityApplicationPooledReserveProvisioningV4,
  type ValidityApplicationPooledReserveProvisioningV4Packet,
} from './validity-application-pooled-reserve-provisioning-v4.js';
import {
  buildValidityApplicationPooledReserveDepositTransitionV4,
  type ValidityApplicationPooledReserveDepositTransitionV4Packet,
} from './validity-application-pooled-reserve-deposit-transition-v4.js';
import {
  buildValidityApplicationPooledReserveBurnSettlementV4,
  deriveValidityApplicationPooledReserveTrackerKeyV4Hex,
  encodeValidityApplicationPooledReserveTrackerValueV4Hex,
  getValidityApplicationPooledReserveTrackerDigestV4Hex,
  type BuildValidityApplicationPooledReserveBurnSettlementV4Input,
  type ValidityApplicationPooledReserveBurnSettlementV4Packet,
  type ValidityApplicationPooledReserveTrackerHistoryEntryV4,
  type ValidityApplicationPooledReserveTrackerValueV4Input,
} from './validity-application-pooled-reserve-burn-settlement-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_ACCEPTANCE_FIXTURE_SCHEMA =
  'e2s.validity-application-pooled-reserve-burn-settlement-jvm-fixture.v1' as const;
export const
VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_INTEGRATED_FIXTURE_SCHEMA =
  'e2s.validity-application-pooled-reserve-burn-settlement-integrated-fixture.v1' as const;

export interface ValidityApplicationPooledReserveBurnSettlementV4AcceptanceFixture {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_ACCEPTANCE_FIXTURE_SCHEMA;
  readonly version: 1;
  readonly sigmaStateCommit: string;
  readonly compilerReceipt: {
    readonly relativePath: string;
    readonly sha256Hex: string;
  };
  readonly contracts: {
    readonly tracker: ContractIdentity;
    readonly duplicatePrevention: ContractIdentity;
    readonly pooledReserve: ContractIdentity;
  };
  readonly currentErgoHeight: number;
  readonly transactionShape: {
    readonly protectedInputIndices: readonly [0, 1];
    readonly reserveInputIndex: 0;
    readonly duplicatePreventionInputIndex: 1;
    readonly externalFeeInputIndex: 2;
    readonly trackerDataInputIndex: 0;
    readonly reserveOutputIndex: 0;
    readonly duplicatePreventionOutputIndex: 1;
    readonly payoutOutputIndex: 2;
    readonly externalFeeOutputIndex: 3;
  };
  readonly bindings: {
    readonly lineageProfileIdHex: string;
    readonly trackerNftIdHex: string;
    readonly duplicatePreventionNftIdHex: string;
    readonly pooledReserveNftIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly trackerInputDigestHex: string;
    readonly burnLeafHex: string;
    readonly burnIdHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafCount: number;
    readonly proofBundleHex: string;
    readonly amountNanoErg: string;
    readonly recipientErgoTreeHex: string;
    readonly anchorHeaderHeight: number;
    readonly requiredAnchorDepth: number;
  };
  readonly eip12UnsignedTransaction: Readonly<Record<string, unknown>>;
  readonly inputBoxSigmaHex: readonly [string, string, string];
  readonly dataInputBoxSigmaHex: readonly [string];
  readonly contextExtensions: readonly [
    SerializedContextExtension,
    SerializedContextExtension,
    SerializedContextExtension,
  ];
  readonly unsignedTransactionIdHex: string;
  readonly prooflessTransactionIdHex: string;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly boundaries: {
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

export interface ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_INTEGRATED_FIXTURE_SCHEMA;
  readonly version: 1;
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly provisioning:
    Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
  readonly depositTransition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
  readonly trackerContext: Readonly<PooledReserveBurnTrackerV4Context>;
  readonly settlementPacket:
    Readonly<ValidityApplicationPooledReserveBurnSettlementV4Packet>;
  readonly boundaries: {
    readonly fixtureOnly: true;
    readonly sourceAdmissionEstablished: false;
    readonly sidechainFinalityEstablished: false;
    readonly proofSystemActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

interface ContractIdentity {
  readonly contractIdHex: string;
  readonly propositionSha256Hex: string;
  readonly propositionBytes: number;
}

interface SerializedContextExtension {
  readonly keys: readonly number[];
  readonly serializedHex: string;
  readonly serializedBlake2b256Hex: string;
}

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const COMPILER_RECEIPT_RELATIVE_PATH =
  'relayer/test-vectors/validity-application-pooled-reserve-compiler-v4.json';
const COMPILER_RECEIPT_SHA256 =
  '69a545564256e84b28c6744f96e3a484eac76b3c30b97f99f6eee14fda57dc52';
const SIGMASTATE_COMMIT = 'f78deadd668f801e7fae3bc884283f79c6f484fa';
const VALID_P2PK_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const RECIPIENT_TREE = VALID_P2PK_TREE;
const GENESIS_TREE = `0008cd02${'11'.repeat(32)}`;
const DEPOSITOR_TREE = VALID_P2PK_TREE;
const SOURCE_AMOUNT = '40000000';
const BURN_AMOUNT = '10000000';
const SIDECHAIN_HEIGHT = '77';
const ANCHOR_HEIGHT = 120;
const CURRENT_HEIGHT = 130;
const REQUIRED_ANCHOR_DEPTH = 10;
const ANCHOR_CONTEXT_INDEX = REQUIRED_ANCHOR_DEPTH - 1;
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
const TEMPLATES = Object.freeze({
  tracker: readTemplate('SPVTrackerPooledReserveBurnV4.es'),
  duplicatePrevention:
    readTemplate('DoubleUnlockPreventionPooledReserveV4.es'),
  sourceLock: readTemplate('MainChainLockPooledReserveV4.es'),
  pooledReserve:
    readTemplate('MainChainPooledReserveValidityApplicationV4.es'),
});
const COMPILER_RECEIPT_JSON = readCompilerReceipt();
const RUNTIME_BINDING = {
  sourceRuntimeCodeSha256Hex: `0x${'dd'.repeat(32)}`,
  sourceRuntimeCodeBytes: 8192,
  bridgeRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
  bridgeRuntimeCodeBytes: 4096,
  tokenRuntimeCodeSha256Hex: `0x${'cc'.repeat(32)}`,
  tokenRuntimeCodeBytes: 2048,
  maxPendingBlocks: 20,
} as const;
const SIDECHAIN_FINALITY_POLICY:
ValidityApplicationPooledReserveSidechainFinalityPolicyV1 = {
  proofSystemIdHex:
    VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  proofProfileIdHex:
    VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
  approvedTrustAnchorDigestHex: `0x${'aa'.repeat(32)}`,
  programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX}`,
  verifierProfileIdHex:
    `0x${POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX}`,
};
const ERGO_DEPOSIT_FINALITY_POLICY:
ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1 = {
  version: 1,
  requiredSuccessorDepth: 10,
  blockIdentityAndAncestryRequired: true,
  divergentRpcAction: 'hold',
  reorgAction: 'invalidate',
};
const SOURCE_COMMITMENT_POLICY:
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
const DEPOSIT_STATE_POLICY:
ValidityApplicationPooledReserveDepositStatePolicyV1 = {
  version: 1,
  keyLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
  valueLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  operationFlags: VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  keySource: 'source-lock-box-id',
  valueHash: 'blake2b256',
  commitmentDomain:
    VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
};

let fixturePromise:
Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV4AcceptanceFixture
>> | undefined;
let integratedFixturePromise:
Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
>> | undefined;
const integratedFixtures = new WeakSet<object>();

export function
buildValidityApplicationPooledReserveBurnSettlementV4AcceptanceFixture():
Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV4AcceptanceFixture
>> {
  fixturePromise ??= buildFixture();
  return fixturePromise;
}

export function
buildValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture():
Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
>> {
  integratedFixturePromise ??= buildIntegratedFixture();
  return integratedFixturePromise;
}

export function
assertValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
> {
  if (
    value === null
    || typeof value !== 'object'
    || !integratedFixtures.has(value)
  ) {
    throw new Error(
      'pooled-reserve V4 integrated fixture must be built in this process',
    );
  }
}

async function buildFixture(): Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV4AcceptanceFixture
>> {
  const packet = await buildExactPacket();
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const eip12UnsignedTransaction = canonicalUnsignedShape(packet);
  let unsigned: any;
  let unsignedId: any;
  let proofless: any;
  let prooflessId: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    const roundTrip = unsigned.to_js_eip12();
    if (canonicalJson(roundTrip) !== canonicalJson(eip12UnsignedTransaction)) {
      throw new Error('WASM changed the exact AF-4C-1 unsigned transaction');
    }
    const contextExtensions = serializeInputExtensions(wasm, unsigned);
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = String(unsignedId.to_str()).toLowerCase();
    if (unsignedTransactionIdHex !== packet.transaction.txId) {
      throw new Error('AF-4C-1 unsigned transaction ID drifted');
    }
    unsignedId.free?.();
    unsignedId = undefined;
    const consumedUnsigned = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(
      consumedUnsigned,
      [new Uint8Array(), new Uint8Array(), new Uint8Array()],
    );
    prooflessId = proofless.id();
    const prooflessTransactionIdHex =
      String(prooflessId.to_str()).toLowerCase();
    const prooflessBytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (
      prooflessTransactionIdHex !== unsignedTransactionIdHex
      || blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex
    ) {
      throw new Error('proofless transaction bytes differ from AF-4C-1');
    }

    const compiled = await exactCompiledInstance();
    const trackerContract = contractIdentity(
      compiled.contracts.tracker.receipt.propositionHex,
      compiled.contracts.tracker.receipt.contractIdHex,
    );
    const dupContract = contractIdentity(
      compiled.contracts.duplicatePrevention.receipt.propositionHex,
      compiled.contracts.duplicatePrevention.receipt.contractIdHex,
    );
    const reserveContract = contractIdentity(
      compiled.contracts.pooledReserve.receipt.propositionHex,
      compiled.contracts.pooledReserve.receipt.contractIdHex,
    );
    return deepFreeze({
      schema:
        VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_ACCEPTANCE_FIXTURE_SCHEMA,
      version: 1 as const,
      sigmaStateCommit: SIGMASTATE_COMMIT,
      compilerReceipt: {
        relativePath: COMPILER_RECEIPT_RELATIVE_PATH,
        sha256Hex: COMPILER_RECEIPT_SHA256,
      },
      contracts: {
        tracker: trackerContract,
        duplicatePrevention: dupContract,
        pooledReserve: reserveContract,
      },
      currentErgoHeight: CURRENT_HEIGHT,
      transactionShape: {
        protectedInputIndices: [0, 1] as const,
        reserveInputIndex: 0 as const,
        duplicatePreventionInputIndex: 1 as const,
        externalFeeInputIndex: 2 as const,
        trackerDataInputIndex: 0 as const,
        reserveOutputIndex: 0 as const,
        duplicatePreventionOutputIndex: 1 as const,
        payoutOutputIndex: 2 as const,
        externalFeeOutputIndex: 3 as const,
      },
      bindings: {
        lineageProfileIdHex: packet.lineageProfileIdHex,
        trackerNftIdHex: compiled.genesis.trackerNftIdHex,
        duplicatePreventionNftIdHex:
          compiled.genesis.duplicatePreventionNftIdHex,
        pooledReserveNftIdHex: compiled.genesis.settlementVaultNftIdHex,
        trackerKeyHex: packet.tracker.keyHex,
        trackerValueHex: packet.tracker.valueHex,
        trackerInputDigestHex: packet.tracker.inputDigestHex,
        burnLeafHex: packet.burn.leaf.encodedLeafHex,
        burnIdHex: packet.burn.leaf.burnIdHex,
        bridgeEventRootHex: packet.tracker.decodedValue.bridgeEventRootHex,
        burnLeafCount: packet.burn.leafCount,
        proofBundleHex: packet.proofBundleHex,
        amountNanoErg: packet.burn.leaf.amountNanoErg,
        recipientErgoTreeHex: packet.burn.recipientErgoTreeHex,
        anchorHeaderHeight: packet.tracker.decodedValue.anchorHeaderHeight,
        requiredAnchorDepth: REQUIRED_ANCHOR_DEPTH,
      },
      eip12UnsignedTransaction,
      inputBoxSigmaHex: [
        serializeBox(wasm, packet.boxes.reservePredecessor),
        serializeBox(wasm, packet.boxes.duplicatePreventionPredecessor),
        serializeBox(wasm, packet.boxes.feeFundingInput),
      ] as const,
      dataInputBoxSigmaHex: [
        serializeBox(wasm, packet.boxes.trackerDataInput),
      ] as const,
      contextExtensions,
      unsignedTransactionIdHex,
      prooflessTransactionIdHex,
      prooflessTransactionHex: prooflessBytes.toString('hex'),
      prooflessTransactionBytes: prooflessBytes.length,
      boundaries: {
        targetNodeAcceptanceEstablished: false as const,
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
  } finally {
    prooflessId?.free?.();
    proofless?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

let compiledPromise: ReturnType<
typeof compileValidityApplicationPooledReserveInstanceV4
> | undefined;

async function exactCompiledInstance() {
  return buildValidityApplicationPooledReserveV4CompiledFixtureInstance();
}

export function buildValidityApplicationPooledReserveV4CompiledFixtureInstance() {
  if (!compiledPromise) {
    compiledPromise = buildCompiledInstance();
  }
  return compiledPromise;
}

async function buildCompiledInstance() {
  const { trackerGenesisInputBox, duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox } = await genesisBoxes();
  const semantics: PegInPooledReserveLineageProfileV4Semantics = {
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    sourceLockTemplateSha256Hex: `0x${sha256Text(TEMPLATES.sourceLock)}`,
    validityTrackerTemplateSha256Hex: `0x${sha256Text(TEMPLATES.tracker)}`,
    settlementVaultTemplateSha256Hex:
      `0x${sha256Text(TEMPLATES.pooledReserve)}`,
    duplicatePreventionTemplateSha256Hex:
      `0x${sha256Text(TEMPLATES.duplicatePrevention)}`,
    sidechainFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex(
        SIDECHAIN_FINALITY_POLICY,
      ),
    ergoDepositFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex(
        ERGO_DEPOSIT_FINALITY_POLICY,
      ),
    proofSystemIdHex: SIDECHAIN_FINALITY_POLICY.proofSystemIdHex,
    proofProfileIdHex: SIDECHAIN_FINALITY_POLICY.proofProfileIdHex,
    sourceCommitmentPolicyIdHex:
      deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex(
        SOURCE_COMMITMENT_POLICY,
      ),
    depositCommitmentStatePolicyIdHex:
      deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex(
        DEPOSIT_STATE_POLICY,
      ),
    profileRevision: '1',
    activationHeight: '0',
  };
  const lineage = await derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    semantics,
  });
  return compileValidityApplicationPooledReserveInstanceV4({
    lineageCandidate: lineage,
    templates: TEMPLATES,
    runtimeBinding: RUNTIME_BINDING,
    sidechainFinalityPolicy: SIDECHAIN_FINALITY_POLICY,
    ergoDepositFinalityPolicy: ERGO_DEPOSIT_FINALITY_POLICY,
    sourceCommitmentPolicy: SOURCE_COMMITMENT_POLICY,
    depositCommitmentStatePolicy: DEPOSIT_STATE_POLICY,
    compiler: createPinnedValidityApplicationPooledReserveCompilerV4(
      COMPILER_RECEIPT_JSON,
    ),
  });
}

let genesisPromise: Promise<{
  readonly trackerGenesisInputBox: Eip12Box;
  readonly duplicatePreventionGenesisInputBox: Eip12Box;
  readonly settlementVaultGenesisInputBox: Eip12Box;
}> | undefined;

async function genesisBoxes() {
  genesisPromise ??= (async () => {
    const funding = await materializeUnsignedTransaction({
      inputs: [{ ...BASE_INPUT, extension: {} }],
      dataInputs: [],
      outputs: [0, 1, 2].map(() => ({
        value: '100000000',
        ergoTree: GENESIS_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 111,
      })),
    }, 'pooled-reserve burn-settlement acceptance genesis fixture');
    return {
      trackerGenesisInputBox: funding.outputs[0],
      duplicatePreventionGenesisInputBox: funding.outputs[1],
      settlementVaultGenesisInputBox: funding.outputs[2],
    };
  })();
  return genesisPromise;
}

interface TrackerFixtureStateV4 {
  readonly historyEntry:
    Readonly<ValidityApplicationPooledReserveTrackerHistoryEntryV4>;
  readonly dataInput?: Eip12Box;
}

interface BuildTrackerFixtureStateV4Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly provisioning:
    Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
  readonly profile:
    ReturnType<typeof decodePegInPooledReserveLineageProfileV4Hex>;
  readonly sidechainBlockHashHex: string;
  readonly burnLeaves: readonly TrustlessBurnLeafInput[];
  readonly proof: ReturnType<typeof buildTrustlessBurnInclusionProof>;
}

interface ExactPacketComponentsV4 {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly provisioning:
    Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
  readonly depositTransition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
  readonly packet:
    Readonly<ValidityApplicationPooledReserveBurnSettlementV4Packet>;
}

type BuildTrackerFixtureStateV4 = (
  input: Readonly<BuildTrackerFixtureStateV4Input>,
) => Promise<Readonly<TrackerFixtureStateV4>>;

async function buildExactPacket():
Promise<Readonly<ValidityApplicationPooledReserveBurnSettlementV4Packet>> {
  return (await buildExactPacketComponents()).packet;
}

async function buildExactPacketComponents(
  buildTrackerState: BuildTrackerFixtureStateV4 =
    buildLegacyTrackerFixtureState,
): Promise<Readonly<ExactPacketComponentsV4>> {
  const compiled = await exactCompiledInstance();
  const genesis = await genesisBoxes();
  const provisioning =
    await buildValidityApplicationPooledReserveProvisioningV4({
      compiledInstance: compiled,
      ...genesis,
      values: {
        trackerNanoErg: '2000000',
        duplicatePreventionNanoErg: '2000000',
        pooledReserveNanoErg: '2000000',
      },
      fees: {
        trackerIssuanceNanoErg: MINER_FEE,
        duplicatePreventionIssuanceNanoErg: MINER_FEE,
        pooledReserveIssuanceNanoErg: MINER_FEE,
      },
      creationHeights: {
        trackerIssuance: 112,
        duplicatePreventionIssuance: 112,
        pooledReserveIssuance: 112,
      },
    });
  const depositTransition =
    await buildValidityApplicationPooledReserveDepositTransitionV4({
      compiledInstance: compiled,
      provisioning,
      sourceFundingBox: provisioning.transactions.trackerIssuance.outputs[1],
      sourceIntent: sourceIntent(compiled.lineageProfileIdHex),
      depositorErgoTreeHex: DEPOSITOR_TREE,
      fees: {
        sourceLockCreationNanoErg: MINER_FEE,
        reserveTransitionNanoErg: MINER_FEE,
      },
      creationHeights: {
        sourceLockCreation: 113,
        reserveTransition: 114,
      },
    });
  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const sidechainBlockHashHex = `0x${'ab'.repeat(32)}`;
  const burnLeaves: readonly TrustlessBurnLeafInput[] = [0, 1, 2].map(index => {
    const sidechainTxHashHex =
      `0x${String(index + 1).padStart(2, '0').repeat(32)}`;
    return {
      sidechainIdHex: profile.sidechainIdHex,
      sidechainBlockHashHex,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex: profile.sidechainIdHex,
        sidechainTxHashHex,
        eventIndex: index,
      }),
      sidechainTxHashHex,
      eventIndex: index,
      recipientErgoTreeHashHex: blake2b256Hex(
        Buffer.from(RECIPIENT_TREE, 'hex'),
      ),
      amountNanoErg: index === 1 ? BURN_AMOUNT : '1000000',
      assetIdHex: `0x${'00'.repeat(32)}`,
    };
  });
  const proof = buildTrustlessBurnInclusionProof(
    [...burnLeaves],
    burnLeaves[1].burnIdHex,
  );
  const trackerState = await buildTrackerState({
    compiledInstance: compiled,
    provisioning,
    profile,
    sidechainBlockHashHex,
    burnLeaves,
    proof,
  });
  const trackerHistory = [trackerState.historyEntry] satisfies
    readonly ValidityApplicationPooledReserveTrackerHistoryEntryV4[];
  const trackerDataInput = trackerState.dataInput
    ?? await buildTrackerBox(provisioning.boxes.tracker, trackerHistory);
  const feeFundingInput = await buildExactFeeBox(
    provisioning.transactions.duplicatePreventionIssuance.outputs[1],
  );
  const claim: BuildValidityApplicationPooledReserveBurnSettlementV4Input[
  'claim'
  ] = {
    trackerIdentity: {
      sidechainHeight: SIDECHAIN_HEIGHT,
      executionBlockHashHex: sidechainBlockHashHex,
    },
    burnLeaf: burnLeaves[1],
    leafIndex: proof.leafIndex,
    leafCount: proof.leafCount,
    burnProof: proof.proof,
    recipientErgoTreeHex: RECIPIENT_TREE,
  };
  const packet = await buildValidityApplicationPooledReserveBurnSettlementV4({
    compiledInstance: compiled,
    trackerState: {
      dataInput: trackerDataInput,
      history: trackerHistory,
    },
    reserveState: {
      predecessor: depositTransition.boxes.reserveSuccessor,
    },
    duplicatePreventionState: {
      predecessor: provisioning.boxes.duplicatePrevention,
      historyKeys: [],
    },
    feeFundingInput,
    claim,
    currentErgoHeight: CURRENT_HEIGHT,
    creationHeight: CURRENT_HEIGHT,
    feeNanoErg: MINER_FEE,
  });
  return deepFreeze({
    compiledInstance: compiled,
    provisioning,
    depositTransition,
    packet,
  });
}

async function buildLegacyTrackerFixtureState(
  input: Readonly<BuildTrackerFixtureStateV4Input>,
): Promise<Readonly<TrackerFixtureStateV4>> {
  const trackerValueInput: ValidityApplicationPooledReserveTrackerValueV4Input = {
    bridgeEventRootHex: input.proof.bridgeEventRootHex,
    checkpointCommitmentHex: `0x${'bc'.repeat(32)}`,
    anchorHeaderIdHex: `0x${'cd'.repeat(32)}`,
    anchorHeaderHeight: ANCHOR_HEIGHT,
    sidechainConsensusBlockHashHex: `0x${'de'.repeat(32)}`,
    burnLeafCount: input.proof.leafCount,
    applicationBindingDigestHex:
      input.compiledInstance.application.burnBindingDigestHex,
    settlementProfileIdHex: input.profile.settlementProfileIdHex,
    pooledReserveProfileIdHex: input.compiledInstance.lineageProfileIdHex,
    applicationPayloadDigestHex: `0x${'ef'.repeat(32)}`,
    programIdHex: input.compiledInstance.application.programIdHex,
    verifierProfileIdHex:
      input.compiledInstance.application.verifierProfileIdHex,
  };
  return Object.freeze({
    historyEntry: Object.freeze({
      key: deriveValidityApplicationPooledReserveTrackerKeyV4Hex({
        sidechainIdHex: input.profile.sidechainIdHex,
        sidechainHeight: SIDECHAIN_HEIGHT,
        executionBlockHashHex: input.sidechainBlockHashHex,
      }),
      value:
        encodeValidityApplicationPooledReserveTrackerValueV4Hex(
          trackerValueInput,
        ),
    }),
  });
}

async function buildIntegratedFixture(): Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
>> {
  let trackerContext:
    Readonly<PooledReserveBurnTrackerV4Context> | undefined;
  const components = await buildExactPacketComponents(async input => {
    const checkpoint = buildBridgeCheckpointCommitmentV1({
      sidechainIdHex: input.profile.sidechainIdHex,
      sidechainHeight: SIDECHAIN_HEIGHT,
      sidechainConsensusBlockHashHex: `0x${'de'.repeat(32)}`,
      executionBlockHashHex: input.sidechainBlockHashHex,
      bridgeEventRootHex: input.proof.bridgeEventRootHex,
      burnLeafCount: input.proof.leafCount,
      finalityAuthoritySetId: '1',
      finalityAuthoritySetHashHex: `0x${'90'.repeat(32)}`,
      finalityProofHashHex: `0x${'91'.repeat(32)}`,
    }).checkpoint;
    trackerContext =
      await buildCompiledPooledReserveBurnTrackerV4Context({
        compiledInstance: input.compiledInstance,
        checkpoint,
        targetNativeStateRootHex: '12'.repeat(32),
        finalityHorizonHeight: '100',
        finalityHorizonHashHex: '34'.repeat(32),
        currentErgoHeight: CURRENT_HEIGHT,
        anchorContextIndex: ANCHOR_CONTEXT_INDEX,
        proofChunksHex: ['01', '0203'],
      });
    return Object.freeze({
      historyEntry: Object.freeze({
        key: trackerContext.trackerTransition.trackerKeyHex,
        value: trackerContext.trackerTransition.trackerValueHex,
      }),
      dataInput: await materializeTrackerContextSuccessor(trackerContext),
    });
  });
  if (trackerContext === undefined) {
    throw new Error('integrated V4 tracker context was not constructed');
  }
  const result: Readonly<
  ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
  > = deepFreeze({
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_INTEGRATED_FIXTURE_SCHEMA,
    version: 1 as const,
    compiledInstance: components.compiledInstance,
    provisioning: components.provisioning,
    depositTransition: components.depositTransition,
    trackerContext,
    settlementPacket: components.packet,
    boundaries: {
      fixtureOnly: true as const,
      sourceAdmissionEstablished: false as const,
      sidechainFinalityEstablished: false as const,
      proofSystemActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  integratedFixtures.add(result);
  return result;
}

async function materializeTrackerContextSuccessor(
  context: Readonly<PooledReserveBurnTrackerV4Context>,
): Promise<Eip12Box> {
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  let unsigned: any;
  let unsignedId: any;
  let candidates: any;
  let candidate: any;
  let successor: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(context.eip12UnsignedTransaction),
    );
    if (
      canonicalJson(unsigned.to_js_eip12())
      !== canonicalJson(context.eip12UnsignedTransaction)
    ) {
      throw new Error(
        'materialized integrated tracker transaction shape drifted',
      );
    }
    unsignedId = unsigned.id();
    const transactionId = unsignedId.to_str().toLowerCase();
    if (transactionId !== context.unsignedTransactionIdHex) {
      throw new Error(
        'materialized integrated tracker transaction identity drifted',
      );
    }
    candidates = unsigned.output_candidates();
    if (candidates.len() !== 1) {
      throw new Error(
        'integrated tracker transaction must have exactly one successor',
      );
    }
    candidate = candidates.get(0);
    successor = wasm.ErgoBox.from_box_candidate(candidate, unsignedId, 0);
    candidate = undefined;
    unsignedId = undefined;
    return successor.to_js_eip12() as Eip12Box;
  } finally {
    successor?.free?.();
    candidate?.free?.();
    candidates?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

async function buildTrackerBox(
  predecessor: Eip12Box,
  history: readonly ValidityApplicationPooledReserveTrackerHistoryEntryV4[],
): Promise<Eip12Box> {
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...predecessor, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: predecessor.value,
      ergoTree: predecessor.ergoTree,
      assets: predecessor.assets,
      additionalRegisters: {
        ...predecessor.additionalRegisters,
        R5: encodeAvlTreeRegister(
          Buffer.from(
            getValidityApplicationPooledReserveTrackerDigestV4Hex(history),
            'hex',
          ),
          0x01,
          370,
        ),
        R7: encodeLongRegister(BigInt(SIDECHAIN_HEIGHT)),
        R8: encodeIntRegister(1),
      },
      creationHeight: 115,
    }],
  }, 'pooled-reserve V4 tracker acceptance data input');
  return transaction.outputs[0];
}

async function buildExactFeeBox(source: Eip12Box): Promise<Eip12Box> {
  const sourceValue = BigInt(source.value);
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...source, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: MINER_FEE,
      ergoTree: VALID_P2PK_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 115,
    }, {
      value: sourceValue - BigInt(MINER_FEE),
      ergoTree: VALID_P2PK_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 115,
    }],
  }, 'pooled-reserve V4 burn acceptance external fee');
  return transaction.outputs[0];
}

function sourceIntent(admissionProfileIdHex: string): PegInSourceIntentV2 {
  return {
    formatVersion: PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    admissionProfileIdHex,
    sourceAssetIdHex: `0x${'00'.repeat(32)}`,
    amountNanoErg: SOURCE_AMOUNT,
    recipientAddressHex: `0x${'66'.repeat(20)}`,
  };
}

function canonicalUnsignedShape(
  packet: Readonly<ValidityApplicationPooledReserveBurnSettlementV4Packet>,
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    inputs: packet.transaction.eip12Tx.inputs.map(input => ({
      boxId: input.boxId,
      extension: input.extension,
    })),
    dataInputs: packet.transaction.eip12Tx.dataInputs.map(input => ({
      boxId: input.boxId,
    })),
    outputs: packet.transaction.eip12Tx.outputs.map(output => ({
      value: String(output.value),
      ergoTree: output.ergoTree,
      assets: (output.assets ?? []).map(asset => ({
        tokenId: asset.tokenId,
        amount: String(asset.amount),
      })),
      additionalRegisters: output.additionalRegisters ?? {},
      creationHeight: output.creationHeight,
    })),
  });
}

function serializeInputExtensions(
  wasm: any,
  unsigned: any,
): readonly [
  SerializedContextExtension,
  SerializedContextExtension,
  SerializedContextExtension,
] {
  const inputs = unsigned.inputs();
  const output: SerializedContextExtension[] = [];
  try {
    for (let index = 0; index < inputs.len(); index += 1) {
      const item = inputs.get(index);
      const extension = item.extension();
      try {
        const keys = [...extension.keys()];
        const expected = index < 2 ? [0, 1, 2, 3] : [];
        if (
          keys.length !== expected.length
          || keys.some((key, keyIndex) => key !== expected[keyIndex])
        ) {
          throw new Error(
            `AF-4C-1 input ${index} ContextExtension keys drifted`,
          );
        }
        const serialized = Buffer.from(extension.sigma_serialize_bytes());
        output.push(Object.freeze({
          keys: Object.freeze(keys),
          serializedHex: serialized.toString('hex'),
          serializedBlake2b256Hex: blake2b256Hex(serialized),
        }));
      } finally {
        extension.free?.();
        item.free?.();
      }
    }
  } finally {
    inputs.free?.();
  }
  if (output.length !== 3) {
    throw new Error('AF-4C-1 transaction must contain exactly three inputs');
  }
  return Object.freeze(output) as unknown as readonly [
    SerializedContextExtension,
    SerializedContextExtension,
    SerializedContextExtension,
  ];
}

function serializeBox(
  wasm: any,
  boxJson: Eip12Box,
): string {
  const box = wasm.ErgoBox.from_json(JSON.stringify(boxJson));
  try {
    return Buffer.from(box.sigma_serialize_bytes()).toString('hex');
  } finally {
    box.free?.();
  }
}

function contractIdentity(
  propositionHex: string,
  expectedContractIdHex: string,
): ContractIdentity {
  const bytes = Buffer.from(propositionHex, 'hex');
  const contractIdHex = blake2b256Hex(bytes);
  if (contractIdHex !== expectedContractIdHex.replace(/^0x/, '')) {
    throw new Error('compiled pooled-reserve contract ID drifted');
  }
  return Object.freeze({
    contractIdHex,
    propositionSha256Hex:
      createHash('sha256').update(bytes).digest('hex'),
    propositionBytes: bytes.length,
  });
}

function readTemplate(name: string): string {
  return readFileSync(resolve(BRIDGE_ROOT, 'contracts', name), 'utf8');
}

function readCompilerReceipt(): string {
  const value = readFileSync(
    resolve(BRIDGE_ROOT, ...COMPILER_RECEIPT_RELATIVE_PATH.split('/')),
    'ascii',
  );
  const digest = createHash('sha256').update(value, 'ascii').digest('hex');
  if (digest !== COMPILER_RECEIPT_SHA256) {
    throw new Error('pooled-reserve compiler receipt bytes drifted');
  }
  return value;
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
