import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';

import {
  getDupTreeDigest,
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture,
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput,
} from './validity-application-pooled-reserve-burn-family-v5-fixture.js';
import {
  buildValidityApplicationPooledReserveBurnSettlementV5,
  deriveValidityApplicationPooledReserveTrackerKeyV5Hex,
  encodeValidityApplicationPooledReserveTrackerValueV5Hex,
  getValidityApplicationPooledReserveTrackerDigestV5Hex,
  type BuildValidityApplicationPooledReserveBurnSettlementV5Input,
  type ValidityApplicationPooledReserveBurnSettlementV5Packet,
  type ValidityApplicationPooledReserveTrackerHistoryEntryV5,
  type ValidityApplicationPooledReserveTrackerValueV5Input,
} from './validity-application-pooled-reserve-burn-settlement-v5.js';
import {
  buildValidityApplicationPooledReserveInstanceV5,
  type ValidityApplicationPooledReserveInstanceV5Candidate,
} from './validity-application-pooled-reserve-instance-v5.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12OutputCandidate,
} from './unsigned-ergo-transaction.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V5_ACCEPTANCE_FIXTURE_SCHEMA =
  'e2s.validity-application-pooled-reserve-burn-settlement-jvm-fixture.v5' as const;

export interface ValidityApplicationPooledReserveBurnSettlementV5AcceptanceFixture {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V5_ACCEPTANCE_FIXTURE_SCHEMA;
  readonly version: 5;
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
    readonly syntheticSettlementPredecessorsConstructed: true;
    readonly reservePredecessorProvenanceEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly sidechainFinalityEstablished: false;
    readonly proofSystemActivated: false;
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
  'relayer/test-vectors/validity-application-pooled-reserve-compiler-v5.json';
const COMPILER_RECEIPT_SHA256 =
  'b56eb130f63de10e26801e9983f722a6185a658580a1949fe0d133e717756db1';
const SIGMASTATE_COMMIT = 'f78deadd668f801e7fae3bc884283f79c6f484fa';
const VALID_P2PK_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const RECIPIENT_TREE = VALID_P2PK_TREE;
const BURN_AMOUNT = '10000000';
const RESERVE_VALUE = 42_000_000n;
const RESERVE_LIABILITY = 40_000_000n;
const SINGLETON_VALUE = 2_000_000n;
const SIDECHAIN_HEIGHT = '77';
const ANCHOR_HEIGHT = 120;
const CURRENT_HEIGHT = 130;
const REQUIRED_ANCHOR_DEPTH = 10;
const COMPILER_RECEIPT_JSON = readCompilerReceipt();
const INSERT_ONLY_AVL_FLAGS = 0x01;

let fixturePromise:
Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV5AcceptanceFixture
>> | undefined;

export function
buildValidityApplicationPooledReserveBurnSettlementV5AcceptanceFixture():
Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV5AcceptanceFixture
>> {
  fixturePromise ??= buildFixture();
  return fixturePromise;
}

async function buildFixture(): Promise<Readonly<
ValidityApplicationPooledReserveBurnSettlementV5AcceptanceFixture
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
      throw new Error('WASM changed the exact V5 unsigned transaction');
    }
    const contextExtensions = serializeInputExtensions(wasm, unsigned);
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = String(unsignedId.to_str()).toLowerCase();
    if (unsignedTransactionIdHex !== packet.transaction.txId) {
      throw new Error('V5 unsigned transaction ID drifted');
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
      throw new Error('proofless transaction bytes differ from V5 settlement');
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
        VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V5_ACCEPTANCE_FIXTURE_SCHEMA,
      version: 5 as const,
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
        syntheticSettlementPredecessorsConstructed: true as const,
        reservePredecessorProvenanceEstablished: false as const,
        trackerAdmissionEstablished: false as const,
        sidechainFinalityEstablished: false as const,
        proofSystemActivated: false as const,
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
      },
    });
  } finally {
    prooflessId?.free?.();
    proofless?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

let compiledPromise: Promise<Readonly<
  ValidityApplicationPooledReserveInstanceV5Candidate
>> | undefined;

async function exactCompiledInstance() {
  if (!compiledPromise) {
    compiledPromise = buildCompiledInstance();
  }
  return compiledPromise;
}

async function buildCompiledInstance() {
  const compilerRequest =
    await buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture();
  return buildValidityApplicationPooledReserveInstanceV5({
    compilerRequest,
    compilerBatchJson: COMPILER_RECEIPT_JSON,
  });
}

let genesisPromise: ReturnType<
  typeof buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput
> | undefined;

async function genesisBoxes() {
  genesisPromise ??=
    buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput();
  return (await genesisPromise).genesis;
}

export async function
buildValidityApplicationPooledReserveBurnSettlementV5FixtureInput():
Promise<BuildValidityApplicationPooledReserveBurnSettlementV5Input> {
  const compiled = await exactCompiledInstance();
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
  const trackerValueInput: ValidityApplicationPooledReserveTrackerValueV5Input = {
    bridgeEventRootHex: proof.bridgeEventRootHex,
    checkpointCommitmentHex: `0x${'bc'.repeat(32)}`,
    anchorHeaderIdHex: `0x${'cd'.repeat(32)}`,
    anchorHeaderHeight: ANCHOR_HEIGHT,
    sidechainConsensusBlockHashHex: `0x${'de'.repeat(32)}`,
    burnLeafCount: proof.leafCount,
    applicationBindingDigestHex: compiled.application.burnBindingDigestHex,
    settlementProfileIdHex: profile.settlementProfileIdHex,
    pooledReserveProfileIdHex: compiled.lineageProfileIdHex,
    applicationPayloadDigestHex: `0x${'ef'.repeat(32)}`,
    programIdHex: compiled.application.programIdHex,
    verifierProfileIdHex: compiled.application.verifierProfileIdHex,
  };
  const trackerHistory = [{
    key: deriveValidityApplicationPooledReserveTrackerKeyV5Hex({
      sidechainIdHex: profile.sidechainIdHex,
      sidechainHeight: SIDECHAIN_HEIGHT,
      executionBlockHashHex: sidechainBlockHashHex,
    }),
    value:
      encodeValidityApplicationPooledReserveTrackerValueV5Hex(trackerValueInput),
  }] satisfies readonly ValidityApplicationPooledReserveTrackerHistoryEntryV5[];
  const state = await buildSyntheticSettlementState(
    compiled,
    profile.sidechainIdHex,
    trackerHistory,
  );
  const claim: BuildValidityApplicationPooledReserveBurnSettlementV5Input[
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
  return {
    compiledInstance: compiled,
    trackerState: {
      dataInput: state.trackerDataInput,
      history: trackerHistory,
    },
    reserveState: {
      predecessor: state.reservePredecessor,
    },
    duplicatePreventionState: {
      predecessor: state.duplicatePreventionPredecessor,
      historyKeys: [],
    },
    feeFundingInput: state.feeFundingInput,
    claim,
    currentErgoHeight: CURRENT_HEIGHT,
    creationHeight: CURRENT_HEIGHT,
    feeNanoErg: MINER_FEE,
  };
}

async function buildExactPacket():
Promise<Readonly<ValidityApplicationPooledReserveBurnSettlementV5Packet>> {
  return buildValidityApplicationPooledReserveBurnSettlementV5(
    await buildValidityApplicationPooledReserveBurnSettlementV5FixtureInput(),
  );
}

async function buildSyntheticSettlementState(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV5Candidate>,
  sidechainIdHex: string,
  history: readonly ValidityApplicationPooledReserveTrackerHistoryEntryV5[],
): Promise<{
  readonly trackerDataInput: Eip12Box;
  readonly duplicatePreventionPredecessor: Eip12Box;
  readonly reservePredecessor: Eip12Box;
  readonly feeFundingInput: Eip12Box;
}> {
  const genesis = await genesisBoxes();
  const profileRegister = encodeCollByteRegister(Buffer.from(
    compiled.lineageProfileIdHex,
    'hex',
  ));
  const trackerIssuance = await issueSingleton({
    label: 'pooled-reserve V5 synthetic tracker predecessor',
    genesisInput: genesis.trackerInput,
    nftIdHex: compiled.genesis.trackerNftIdHex,
    propositionHex: compiled.contracts.tracker.receipt.propositionHex,
    value: SINGLETON_VALUE,
    registers: {
      R4: profileRegister,
      R5: encodeAvlTreeRegister(Buffer.from(
        getValidityApplicationPooledReserveTrackerDigestV5Hex(history),
        'hex',
      ), INSERT_ONLY_AVL_FLAGS, 370),
      R6: encodeCollByteRegister(Buffer.from(
        sidechainIdHex.replace(/^0x/, ''),
        'hex',
      )),
      R7: encodeLongRegister(BigInt(SIDECHAIN_HEIGHT)),
      R8: encodeIntRegister(1),
      R9: encodeCollByteRegister(Buffer.from(
        compiled.sidechainFinalityPolicy.approvedTrustAnchorDigestHex,
        'hex',
      )),
    },
  });
  const duplicatePreventionIssuance = await issueSingleton({
    label: 'pooled-reserve V5 synthetic DUP predecessor',
    genesisInput: genesis.duplicatePreventionInput,
    nftIdHex: compiled.genesis.duplicatePreventionNftIdHex,
    propositionHex:
      compiled.contracts.duplicatePrevention.receipt.propositionHex,
    value: SINGLETON_VALUE,
    registers: {
      R4: profileRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(getDupTreeDigest([]), 'hex'),
        INSERT_ONLY_AVL_FLAGS,
        1,
      ),
    },
  });
  const reserveIssuance = await issueSingleton({
    label: 'pooled-reserve V5 synthetic reserve predecessor',
    genesisInput: genesis.pooledReserveInput,
    nftIdHex: compiled.genesis.settlementVaultNftIdHex,
    propositionHex: compiled.contracts.pooledReserve.receipt.propositionHex,
    value: RESERVE_VALUE,
    registers: {
      R4: profileRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
        INSERT_ONLY_AVL_FLAGS,
        32,
      ),
      R6: encodeLongRegister(RESERVE_LIABILITY),
    },
  });
  return {
    trackerDataInput: trackerIssuance.outputs[0],
    duplicatePreventionPredecessor:
      duplicatePreventionIssuance.outputs[0],
    reservePredecessor: reserveIssuance.outputs[0],
    feeFundingInput: await buildExactFeeBox(
      duplicatePreventionIssuance.outputs[1],
    ),
  };
}

async function issueSingleton(input: {
  readonly label: string;
  readonly genesisInput: Eip12Box;
  readonly nftIdHex: string;
  readonly propositionHex: string;
  readonly value: bigint;
  readonly registers: Readonly<Record<string, string>>;
}) {
  if (input.nftIdHex !== input.genesisInput.boxId) {
    throw new Error(`${input.label} NFT must equal its exact genesis box ID`);
  }
  const change = BigInt(input.genesisInput.value) - input.value
    - BigInt(MINER_FEE);
  if (change <= 0n) {
    throw new Error(`${input.label} genesis value is insufficient`);
  }
  const outputs: Eip12OutputCandidate[] = [{
    value: input.value,
    ergoTree: input.propositionHex,
    assets: [{ tokenId: input.nftIdHex, amount: '1' }],
    additionalRegisters: input.registers,
    creationHeight: 112,
  }, {
    value: change,
    ergoTree: input.genesisInput.ergoTree,
    assets: [],
    additionalRegisters: {},
    creationHeight: 112,
  }, {
    value: MINER_FEE,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: 112,
  }];
  return materializeUnsignedTransaction({
    inputs: [{ ...input.genesisInput, extension: {} }],
    dataInputs: [],
    outputs,
  }, input.label);
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
  }, 'pooled-reserve V5 burn acceptance external fee');
  return transaction.outputs[0];
}

function canonicalUnsignedShape(
  packet: Readonly<ValidityApplicationPooledReserveBurnSettlementV5Packet>,
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
            `V5 settlement input ${index} ContextExtension keys drifted`,
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
    throw new Error('V5 settlement transaction must contain three inputs');
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
