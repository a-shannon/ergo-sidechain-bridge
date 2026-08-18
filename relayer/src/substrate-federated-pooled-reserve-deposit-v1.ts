import {
  getPooledReserveEmptyDigest,
  insertPooledReserveCommitment,
  verifyPooledReserveCommitmentInsert,
} from './avl-bridge.js';
import {
  decodeAvlTreeRegisterDigest,
  decodeCanonicalLongRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodePegInSourceIntentV2Hex,
  encodePegInSourceIntentV2Hex,
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  PEG_IN_SOURCE_INTENT_V2_BYTES,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  assertSubstrateFederatedSettlementFamilyV1Identity,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1DecodedProfile,
  type SubstrateFederatedSettlementFamilyV1Identity,
} from './substrate-federated-settlement-family-v1.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  normalizeErgoTreeHex,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';
import {
  deriveValidityApplicationPooledReserveDepositCommitmentV4Hex,
} from './validity-application-pooled-reserve-deposit-transition-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';

export const SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V1_SCHEMA =
  'e2s.substrate-federated-pooled-reserve-deposit.v1' as const;

const MIN_BOX_VALUE = 1_000_000n;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const ERGO_INT_MAX = 0x7fff_ffff;
const packets = new WeakSet<object>();

export interface SubstrateFederatedDepositHistoryEntryV1 {
  readonly sourceLockBoxIdHex: string;
  readonly depositCommitmentHex: string;
}

export interface SubstrateFederatedPooledReserveStateV1 {
  readonly predecessor: Eip12Box;
  readonly depositHistory: readonly SubstrateFederatedDepositHistoryEntryV1[];
}

export interface SubstrateFederatedPooledReserveDepositFeesV1 {
  readonly sourceLockCreationNanoErg?: string | number | bigint;
  readonly reserveTransitionNanoErg?: string | number | bigint;
}

export interface SubstrateFederatedPooledReserveDepositHeightsV1 {
  readonly currentErgoHeight: number;
  readonly sourceLockCreation: number;
  readonly reserveTransition: number;
}

export interface BuildSubstrateFederatedPooledReserveDepositV1Input {
  readonly familyIdentity:
    Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly sourceFundingInput: Eip12Box;
  readonly reserveState: SubstrateFederatedPooledReserveStateV1;
  readonly sourceIntent: PegInSourceIntentV2;
  readonly depositorErgoTreeHex: string;
  readonly creationHeights: SubstrateFederatedPooledReserveDepositHeightsV1;
  readonly fees?: SubstrateFederatedPooledReserveDepositFeesV1;
}

export interface SubstrateFederatedPooledReserveDepositV1Packet {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V1_SCHEMA;
  readonly version: 1;
  readonly trustModel: 'federated_non_trustless';
  readonly familyIdHex: string;
  readonly sourceIntentHex: string;
  readonly depositCommitmentHex: string;
  readonly depositInsertProofHex: string;
  readonly reserve: {
    readonly inputDigestHex: string;
    readonly outputDigestHex: string;
    readonly inputValueNanoErg: string;
    readonly outputValueNanoErg: string;
    readonly inputLiabilityNanoErg: string;
    readonly outputLiabilityNanoErg: string;
    readonly protectedSeedNanoErg: string;
    readonly predecessorDepositCount: number;
    readonly successorDepositCount: number;
  };
  readonly transactions: {
    readonly sourceLockCreation: MaterializedUnsignedTransaction;
    readonly reserveTransition: MaterializedUnsignedTransaction;
  };
  readonly boxes: {
    readonly sourceFundingInput: Eip12Box;
    readonly sourceLock: Eip12Box;
    readonly transitionFeeFunding: Eip12Box;
    readonly reservePredecessor: Eip12Box;
    readonly reserveSuccessor: Eip12Box;
  };
  readonly invariants: {
    readonly exactFederatedFamilyBound: true;
    readonly exactSourceIntentBound: true;
    readonly sourceLockCreatedBeforeRefundTimeout: true;
    readonly transitionConsumesExactSourceAndReserve: true;
    readonly depositCommitmentBindsSourceIdAndIntent: true;
    readonly reserveInsertProofReplayed: true;
    readonly reserveValueAndLiabilityIncreaseTogether: true;
    readonly protectedReserveSeedPreserved: true;
    readonly externalFeeIsValueNeutral: true;
    readonly deterministicUnsignedTransactionsConstructed: true;
  };
  readonly boundaries: {
    readonly sourceLockCreationConstructed: true;
    readonly reserveTransitionConstructed: true;
    readonly predecessorStateProvenanceEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly depositCommitmentStateEstablished: false;
    readonly ergoDepositFinalityEstablished: false;
    readonly sidechainMintAcceptanceEstablished: false;
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

export async function buildSubstrateFederatedPooledReserveDepositV1(
  rawInput: Readonly<BuildSubstrateFederatedPooledReserveDepositV1Input>,
): Promise<Readonly<SubstrateFederatedPooledReserveDepositV1Packet>> {
  assertExactKeys(rawInput, [
    'familyIdentity',
    'sourceFundingInput',
    'reserveState',
    'sourceIntent',
    'depositorErgoTreeHex',
    'creationHeights',
  ], 'substrate federated pooled-reserve deposit input', ['fees']);
  const family = rawInput.familyIdentity;
  assertSubstrateFederatedSettlementFamilyV1Identity(family);
  const snapshot = {
    sourceFundingInput: structuredClone(rawInput.sourceFundingInput),
    reserveState: structuredClone(rawInput.reserveState),
    sourceIntent: structuredClone(rawInput.sourceIntent),
    depositorErgoTreeHex: rawInput.depositorErgoTreeHex,
    creationHeights: structuredClone(rawInput.creationHeights),
    fees: rawInput.fees === undefined
      ? undefined
      : structuredClone(rawInput.fees),
  };
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    family.profile,
  );
  const sourceIntentHex = validateSourceIntent(
    snapshot.sourceIntent,
    profile,
    family.profile.familyIdHex,
  );
  const sourceIntent = decodePegInSourceIntentV2Hex(sourceIntentHex);
  const sourceAmount = atLeastMinBox(
    sourceIntent.amountNanoErg,
    'substrate federated source amount',
  );
  const fees = normalizeFees(snapshot.fees, profile);
  const reserveState = normalizeReserveState(snapshot.reserveState);
  const [sourceFunding, reservePredecessor] = await Promise.all([
    normalizeEip12Box(
      snapshot.sourceFundingInput,
      'substrate federated source funding input',
    ),
    normalizeEip12Box(
      reserveState.predecessor,
      'substrate federated pooled-reserve predecessor',
    ),
  ]);
  assertDistinctBoxIds([sourceFunding, reservePredecessor]);
  assertPureFundingBox(sourceFunding);
  const reserve = assertReservePredecessor({
    reserve: reservePredecessor,
    family,
    depositHistory: reserveState.depositHistory,
  });
  const depositorErgoTreeHex = await normalizeErgoTreeHex(
    snapshot.depositorErgoTreeHex,
    'substrate federated depositor ErgoTree',
  );
  const heights = normalizeHeights(
    snapshot.creationHeights,
    sourceFunding,
    reservePredecessor,
    profile,
  );

  const sourceLockCreation = await buildSourceLockCreation({
    sourceFunding,
    sourceIntentHex,
    sourceAmount,
    sourceLockPropositionHex:
      family.contracts.sourceLock.receipt.propositionHex,
    depositorErgoTreeHex,
    creationFee: fees.sourceLockCreation,
    transitionFee: fees.reserveTransition,
    creationHeight: heights.sourceLockCreation,
  });
  assertExactSourceLockCreation({
    family,
    sourceFunding,
    sourceLockCreation,
    sourceIntentHex,
    depositorErgoTreeHex,
    sourceAmount,
    creationFee: fees.sourceLockCreation,
    transitionFee: fees.reserveTransition,
    creationHeight: heights.sourceLockCreation,
  });
  const sourceLock = sourceLockCreation.outputs[0];
  const transitionFeeFunding = sourceLockCreation.outputs[1];
  assertDistinctBoxIds([
    reservePredecessor,
    sourceLock,
    transitionFeeFunding,
  ]);

  const depositCommitmentHex =
    deriveValidityApplicationPooledReserveDepositCommitmentV4Hex({
      lineageProfileIdHex: family.profile.familyIdHex,
      sourceLockBoxIdHex: sourceLock.boxId,
      sourceIntentHex,
    });
  const insertion = insertPooledReserveCommitment(
    reserveState.depositHistory.map(entry => ({
      key: entry.sourceLockBoxIdHex,
      value: entry.depositCommitmentHex,
    })),
    sourceLock.boxId,
    depositCommitmentHex,
  );
  const replayedDigest = verifyPooledReserveCommitmentInsert(
    reserve.inputDigestHex,
    sourceLock.boxId,
    depositCommitmentHex,
    insertion.insert_proof_hex,
  );
  if (replayedDigest !== insertion.new_digest_hex) {
    throw new Error(
      'substrate federated deposit insertion replay disagrees with the prover',
    );
  }

  const outputValue = checkedAdd(
    reserve.inputValue,
    sourceAmount,
    'substrate federated reserve successor value',
  );
  const outputLiability = checkedAdd(
    reserve.inputLiability,
    sourceAmount,
    'substrate federated reserve successor liability',
  );
  const reserveSuccessor: Eip12OutputCandidate = {
    value: outputValue,
    ergoTree: family.contracts.pooledReserve.receipt.propositionHex,
    assets: [{
      tokenId: family.profile.pooledReserveNftIdHex,
      amount: '1',
    }],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(
        family.profile.familyIdHex,
        'hex',
      )),
      R5: encodeAvlTreeRegister(
        Buffer.from(insertion.new_digest_hex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
      ),
      R6: encodeLongRegister(outputLiability),
    },
    creationHeight: heights.reserveTransition,
  };
  const reserveTransition = await materializeUnsignedTransaction({
    inputs: [{
      ...reservePredecessor,
      extension: {
        '0': encodeCollByteRegister(Buffer.from(
          insertion.insert_proof_hex,
          'hex',
        )),
      },
    }, {
      ...sourceLock,
      extension: {},
    }, {
      ...transitionFeeFunding,
      extension: {},
    }],
    dataInputs: [],
    outputs: [
      reserveSuccessor,
      feeOutput(fees.reserveTransition, heights.reserveTransition),
    ],
  }, 'substrate federated pooled-reserve deposit V1');
  assertExactReserveTransition({
    family,
    reservePredecessor,
    sourceLock,
    transitionFeeFunding,
    reserveTransition,
    insertProofHex: insertion.insert_proof_hex,
    successorDigestHex: insertion.new_digest_hex,
    sourceAmount,
    inputLiability: reserve.inputLiability,
    outputValue,
    outputLiability,
    fee: fees.reserveTransition,
    creationHeight: heights.reserveTransition,
  });

  const result = deepFreeze({
    schema: SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V1_SCHEMA,
    version: 1 as const,
    trustModel: 'federated_non_trustless' as const,
    familyIdHex: family.profile.familyIdHex,
    sourceIntentHex,
    depositCommitmentHex,
    depositInsertProofHex: insertion.insert_proof_hex,
    reserve: {
      inputDigestHex: reserve.inputDigestHex,
      outputDigestHex: insertion.new_digest_hex,
      inputValueNanoErg: reserve.inputValue.toString(),
      outputValueNanoErg: outputValue.toString(),
      inputLiabilityNanoErg: reserve.inputLiability.toString(),
      outputLiabilityNanoErg: outputLiability.toString(),
      protectedSeedNanoErg: reserve.protectedSeed.toString(),
      predecessorDepositCount: reserveState.depositHistory.length,
      successorDepositCount: reserveState.depositHistory.length + 1,
    },
    transactions: {
      sourceLockCreation,
      reserveTransition,
    },
    boxes: {
      sourceFundingInput: sourceFunding,
      sourceLock,
      transitionFeeFunding,
      reservePredecessor,
      reserveSuccessor: reserveTransition.outputs[0],
    },
    invariants: {
      exactFederatedFamilyBound: true as const,
      exactSourceIntentBound: true as const,
      sourceLockCreatedBeforeRefundTimeout: true as const,
      transitionConsumesExactSourceAndReserve: true as const,
      depositCommitmentBindsSourceIdAndIntent: true as const,
      reserveInsertProofReplayed: true as const,
      reserveValueAndLiabilityIncreaseTogether: true as const,
      protectedReserveSeedPreserved: true as const,
      externalFeeIsValueNeutral: true as const,
      deterministicUnsignedTransactionsConstructed: true as const,
    },
    boundaries: {
      sourceLockCreationConstructed: true as const,
      reserveTransitionConstructed: true as const,
      predecessorStateProvenanceEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      depositCommitmentStateEstablished: false as const,
      ergoDepositFinalityEstablished: false as const,
      sidechainMintAcceptanceEstablished: false as const,
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
  packets.add(result);
  return result;
}

export function assertSubstrateFederatedPooledReserveDepositV1Packet(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedPooledReserveDepositV1Packet> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'substrate federated deposit packet lacks same-process provenance',
    );
  }
}

function validateSourceIntent(
  input: PegInSourceIntentV2,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
  familyIdHex: string,
): string {
  assertExactKeys(input, [
    'formatVersion',
    'sourceNetworkIdHex',
    'sidechainIdHex',
    'bridgeAddressHex',
    'tokenAddressHex',
    'settlementProfileIdHex',
    'admissionProfileIdHex',
    'sourceAssetIdHex',
    'amountNanoErg',
    'recipientAddressHex',
  ], 'substrate federated source intent');
  const encoded = encodePegInSourceIntentV2Hex(input);
  const decoded = decodePegInSourceIntentV2Hex(encoded);
  const bindings = [
    ['format version', decoded.formatVersion,
      PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION],
    ['source network', hex(decoded.sourceNetworkIdHex),
      profile.sourceNetworkIdHex],
    ['sidechain', hex(decoded.sidechainIdHex), profile.sidechainIdHex],
    ['bridge address', hex(decoded.bridgeAddressHex), profile.bridgeAddressHex],
    ['token address', hex(decoded.tokenAddressHex), profile.tokenAddressHex],
    ['settlement profile', hex(decoded.settlementProfileIdHex),
      profile.settlementProfileIdHex],
    ['federated family', hex(decoded.admissionProfileIdHex), familyIdHex],
    ['source asset', hex(decoded.sourceAssetIdHex),
      profile.settlementAssetIdHex],
  ] as const;
  for (const [label, actual, expected] of bindings) {
    if (actual !== expected) {
      throw new Error(
        `source intent ${label} does not match the federated family`,
      );
    }
  }
  atLeastMinBox(decoded.amountNanoErg, 'substrate federated source amount');
  if (/^0+$/.test(hex(decoded.recipientAddressHex))) {
    throw new Error('substrate federated recipient must not be the zero address');
  }
  return encoded;
}

function normalizeReserveState(
  input: SubstrateFederatedPooledReserveStateV1,
): Readonly<SubstrateFederatedPooledReserveStateV1> {
  assertExactKeys(input, [
    'predecessor',
    'depositHistory',
  ], 'substrate federated reserve state');
  if (!Array.isArray(input.depositHistory)) {
    throw new Error('substrate federated deposit history must be an array');
  }
  const seen = new Set<string>();
  const depositHistory = input.depositHistory.map((entry, index) => {
    assertExactKeys(entry, [
      'sourceLockBoxIdHex',
      'depositCommitmentHex',
    ], `substrate federated deposit history entry ${index}`);
    const sourceLockBoxIdHex = fixedHex(
      entry.sourceLockBoxIdHex,
      32,
      `substrate federated deposit history entry ${index} source-lock box ID`,
    );
    if (seen.has(sourceLockBoxIdHex)) {
      throw new Error('substrate federated deposit history has duplicate keys');
    }
    seen.add(sourceLockBoxIdHex);
    return Object.freeze({
      sourceLockBoxIdHex,
      depositCommitmentHex: fixedHex(
        entry.depositCommitmentHex,
        32,
        `substrate federated deposit history entry ${index} commitment`,
      ),
    });
  });
  return Object.freeze({
    predecessor: input.predecessor,
    depositHistory: Object.freeze(depositHistory),
  });
}

function assertReservePredecessor(input: {
  reserve: Eip12Box;
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  depositHistory: readonly SubstrateFederatedDepositHistoryEntryV1[];
}): {
  inputDigestHex: string;
  inputValue: bigint;
  inputLiability: bigint;
  protectedSeed: bigint;
} {
  const reserve = input.reserve;
  const inputDigestHex = decodeAvlTreeRegisterDigest(
    reserve.additionalRegisters.R5,
    'substrate federated reserve R5',
  );
  const inputLiability = decodeCanonicalLongRegister(
    reserve.additionalRegisters.R6,
    'substrate federated reserve R6',
  );
  const expectedR4 = encodeCollByteRegister(Buffer.from(
    input.family.profile.familyIdHex,
    'hex',
  ));
  if (
    reserve.ergoTree
      !== input.family.contracts.pooledReserve.receipt.propositionHex
    || reserve.assets.length !== 1
    || reserve.assets[0]?.tokenId
      !== input.family.profile.pooledReserveNftIdHex
    || reserve.assets[0]?.amount !== '1'
    || Object.keys(reserve.additionalRegisters).sort().join(',') !== 'R4,R5,R6'
    || reserve.additionalRegisters.R4 !== expectedR4
    || reserve.additionalRegisters.R5 !== encodeAvlTreeRegister(
      Buffer.from(inputDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
    )
    || reserve.additionalRegisters.R6 !== encodeLongRegister(inputLiability)
  ) {
    throw new Error(
      'substrate federated reserve predecessor identity or policy mismatch',
    );
  }
  let expectedDigestHex = getPooledReserveEmptyDigest();
  const priorEntries: { key: string; value: string }[] = [];
  for (const entry of input.depositHistory) {
    expectedDigestHex = insertPooledReserveCommitment(
      priorEntries,
      entry.sourceLockBoxIdHex,
      entry.depositCommitmentHex,
    ).new_digest_hex;
    priorEntries.push({
      key: entry.sourceLockBoxIdHex,
      value: entry.depositCommitmentHex,
    });
  }
  if (inputDigestHex !== expectedDigestHex) {
    throw new Error(
      'substrate federated reserve deposit history does not match its AVL digest',
    );
  }
  const inputValue = positiveLong(
    reserve.value,
    'substrate federated reserve value',
  );
  if (inputLiability < 0n || inputLiability > inputValue) {
    throw new Error('substrate federated reserve liability is invalid');
  }
  if (input.depositHistory.length === 0 && inputLiability !== 0n) {
    throw new Error(
      'empty substrate federated deposit history requires zero liability',
    );
  }
  const protectedSeed = inputValue - inputLiability;
  if (protectedSeed < MIN_BOX_VALUE) {
    throw new Error(
      'substrate federated reserve seed is below the minimum box value',
    );
  }
  return { inputDigestHex, inputValue, inputLiability, protectedSeed };
}

async function buildSourceLockCreation(input: {
  sourceFunding: Eip12Box;
  sourceIntentHex: string;
  sourceAmount: bigint;
  sourceLockPropositionHex: string;
  depositorErgoTreeHex: string;
  creationFee: bigint;
  transitionFee: bigint;
  creationHeight: number;
}): Promise<MaterializedUnsignedTransaction> {
  const outputs: Eip12OutputCandidate[] = [{
    value: input.sourceAmount,
    ergoTree: input.sourceLockPropositionHex,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(
        fixedHex(
          input.sourceIntentHex,
          PEG_IN_SOURCE_INTENT_V2_BYTES,
          'substrate federated source intent',
        ),
        'hex',
      )),
      R5: encodeCollByteRegister(Buffer.from(
        input.depositorErgoTreeHex,
        'hex',
      )),
    },
    creationHeight: input.creationHeight,
  }, {
    value: input.transitionFee,
    ergoTree: input.sourceFunding.ergoTree,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  }];
  const change = BigInt(input.sourceFunding.value)
    - input.sourceAmount
    - input.transitionFee
    - input.creationFee;
  if (change < 0n) {
    throw new Error('substrate federated source funding is underfunded');
  }
  if (change > 0n) {
    if (change < MIN_BOX_VALUE) {
      throw new Error(
        'substrate federated source-lock change is below the minimum box value',
      );
    }
    outputs.push({
      value: change,
      ergoTree: input.sourceFunding.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    });
  }
  outputs.push(feeOutput(input.creationFee, input.creationHeight));
  return materializeUnsignedTransaction({
    inputs: [{ ...input.sourceFunding, extension: {} }],
    dataInputs: [],
    outputs,
  }, 'substrate federated source-lock creation V1');
}

function assertExactSourceLockCreation(input: {
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  sourceFunding: Eip12Box;
  sourceLockCreation: MaterializedUnsignedTransaction;
  sourceIntentHex: string;
  depositorErgoTreeHex: string;
  sourceAmount: bigint;
  creationFee: bigint;
  transitionFee: bigint;
  creationHeight: number;
}): void {
  const tx = input.sourceLockCreation;
  const change = BigInt(input.sourceFunding.value)
    - input.sourceAmount
    - input.transitionFee
    - input.creationFee;
  const sourceLock = tx.outputs[0];
  const transitionFee = tx.outputs[1];
  const minerFee = tx.outputs[tx.outputs.length - 1];
  if (
    tx.eip12Tx.inputs.length !== 1
    || tx.eip12Tx.inputs[0]?.boxId !== input.sourceFunding.boxId
    || Object.keys(tx.eip12Tx.inputs[0]?.extension ?? {}).length !== 0
    || tx.eip12Tx.dataInputs.length !== 0
    || tx.outputs.length !== (change === 0n ? 3 : 4)
    || tx.outputs.reduce((sum, output) => sum + BigInt(output.value), 0n)
      !== BigInt(input.sourceFunding.value)
    || sourceLock?.value !== input.sourceAmount.toString()
    || sourceLock?.ergoTree
      !== input.family.contracts.sourceLock.receipt.propositionHex
    || sourceLock.assets.length !== 0
    || Object.keys(sourceLock.additionalRegisters).sort().join(',') !== 'R4,R5'
    || sourceLock.additionalRegisters.R4 !== encodeCollByteRegister(Buffer.from(
      fixedHex(
        input.sourceIntentHex,
        PEG_IN_SOURCE_INTENT_V2_BYTES,
        'substrate federated source intent',
      ),
      'hex',
    ))
    || sourceLock.additionalRegisters.R5 !== encodeCollByteRegister(Buffer.from(
      input.depositorErgoTreeHex,
      'hex',
    ))
    || sourceLock.creationHeight !== input.creationHeight
    || transitionFee?.value !== input.transitionFee.toString()
    || transitionFee.ergoTree !== input.sourceFunding.ergoTree
    || transitionFee.assets.length !== 0
    || Object.keys(transitionFee.additionalRegisters).length !== 0
    || transitionFee.creationHeight !== input.creationHeight
    || minerFee?.value !== input.creationFee.toString()
    || minerFee.ergoTree !== MINER_FEE_TREE
    || minerFee.assets.length !== 0
    || Object.keys(minerFee.additionalRegisters).length !== 0
    || minerFee.creationHeight !== input.creationHeight
  ) {
    throw new Error('substrate federated source-lock creation topology drifted');
  }
  if (change > 0n) {
    const changeOutput = tx.outputs[2];
    if (
      changeOutput?.value !== change.toString()
      || changeOutput.ergoTree !== input.sourceFunding.ergoTree
      || changeOutput.assets.length !== 0
      || Object.keys(changeOutput.additionalRegisters).length !== 0
      || changeOutput.creationHeight !== input.creationHeight
    ) {
      throw new Error('substrate federated source-lock change drifted');
    }
  }
}

function assertExactReserveTransition(input: {
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  reservePredecessor: Eip12Box;
  sourceLock: Eip12Box;
  transitionFeeFunding: Eip12Box;
  reserveTransition: MaterializedUnsignedTransaction;
  insertProofHex: string;
  successorDigestHex: string;
  sourceAmount: bigint;
  inputLiability: bigint;
  outputValue: bigint;
  outputLiability: bigint;
  fee: bigint;
  creationHeight: number;
}): void {
  const tx = input.reserveTransition;
  const successor = tx.outputs[0];
  const fee = tx.outputs[1];
  const expectedR4 = encodeCollByteRegister(Buffer.from(
    input.family.profile.familyIdHex,
    'hex',
  ));
  if (
    tx.eip12Tx.inputs.length !== 3
    || tx.eip12Tx.dataInputs.length !== 0
    || tx.outputs.length !== 2
    || tx.eip12Tx.inputs[0]?.boxId !== input.reservePredecessor.boxId
    || tx.eip12Tx.inputs[1]?.boxId !== input.sourceLock.boxId
    || tx.eip12Tx.inputs[2]?.boxId !== input.transitionFeeFunding.boxId
    || Object.keys(tx.eip12Tx.inputs[0]?.extension ?? {}).join(',') !== '0'
    || tx.eip12Tx.inputs[0]?.extension['0'] !== encodeCollByteRegister(
      Buffer.from(input.insertProofHex, 'hex'),
    )
    || Object.keys(tx.eip12Tx.inputs[1]?.extension ?? {}).length !== 0
    || Object.keys(tx.eip12Tx.inputs[2]?.extension ?? {}).length !== 0
    || tx.outputs.reduce((sum, output) => sum + BigInt(output.value), 0n)
      !== BigInt(input.reservePredecessor.value)
        + BigInt(input.sourceLock.value)
        + BigInt(input.transitionFeeFunding.value)
    || input.sourceLock.ergoTree
      !== input.family.contracts.sourceLock.receipt.propositionHex
    || input.sourceLock.value !== input.sourceAmount.toString()
    || successor?.value !== input.outputValue.toString()
    || successor.ergoTree
      !== input.family.contracts.pooledReserve.receipt.propositionHex
    || successor.assets.length !== 1
    || successor.assets[0]?.tokenId
      !== input.family.profile.pooledReserveNftIdHex
    || successor.assets[0]?.amount !== '1'
    || Object.keys(successor.additionalRegisters).sort().join(',') !== 'R4,R5,R6'
    || successor.additionalRegisters.R4 !== expectedR4
    || successor.additionalRegisters.R5 !== encodeAvlTreeRegister(
      Buffer.from(input.successorDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
    )
    || successor.additionalRegisters.R6 !== encodeLongRegister(
      input.outputLiability,
    )
    || successor.creationHeight !== input.creationHeight
    || input.outputValue - input.outputLiability
      !== BigInt(input.reservePredecessor.value) - input.inputLiability
    || fee?.value !== input.fee.toString()
    || fee.ergoTree !== MINER_FEE_TREE
    || fee.assets.length !== 0
    || Object.keys(fee.additionalRegisters).length !== 0
    || fee.creationHeight !== input.creationHeight
    || input.transitionFeeFunding.value !== input.fee.toString()
  ) {
    throw new Error('substrate federated reserve transition topology drifted');
  }
}

function normalizeFees(
  input: SubstrateFederatedPooledReserveDepositFeesV1 | undefined,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): { sourceLockCreation: bigint; reserveTransition: bigint } {
  if (input !== undefined) {
    assertExactKeys(input, [], 'substrate federated deposit fees', [
      'sourceLockCreationNanoErg',
      'reserveTransitionNanoErg',
    ]);
  }
  const minimum = BigInt(profile.minimumExternalFeeNanoErg);
  const maximum = BigInt(profile.maximumExternalFeeNanoErg);
  return {
    sourceLockCreation: boundedFee(
      input?.sourceLockCreationNanoErg ?? MINER_FEE,
      minimum,
      maximum,
      'substrate federated source-lock creation fee',
    ),
    reserveTransition: boundedFee(
      input?.reserveTransitionNanoErg ?? MINER_FEE,
      minimum,
      maximum,
      'substrate federated reserve-transition fee',
    ),
  };
}

function normalizeHeights(
  input: SubstrateFederatedPooledReserveDepositHeightsV1,
  sourceFunding: Eip12Box,
  reservePredecessor: Eip12Box,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): SubstrateFederatedPooledReserveDepositHeightsV1 {
  assertExactKeys(input, [
    'currentErgoHeight',
    'sourceLockCreation',
    'reserveTransition',
  ], 'substrate federated deposit heights');
  const heights = {
    currentErgoHeight: positiveHeight(
      input.currentErgoHeight,
      'substrate federated current Ergo height',
    ),
    sourceLockCreation: positiveHeight(
      input.sourceLockCreation,
      'substrate federated source-lock creation height',
    ),
    reserveTransition: positiveHeight(
      input.reserveTransition,
      'substrate federated reserve-transition creation height',
    ),
  };
  if (
    heights.sourceLockCreation < sourceFunding.creationHeight
    || heights.sourceLockCreation > heights.currentErgoHeight
  ) {
    throw new Error(
      'substrate federated source-lock creation height is outside the observed history',
    );
  }
  if (
    heights.sourceLockCreation > ERGO_INT_MAX - profile.sourceRefundDelayBlocks
  ) {
    throw new Error(
      'substrate federated source-lock height cannot preserve its refund timeout',
    );
  }
  if (
    heights.reserveTransition < heights.sourceLockCreation
    || heights.reserveTransition < reservePredecessor.creationHeight
    || heights.reserveTransition > heights.currentErgoHeight
  ) {
    throw new Error(
      'substrate federated reserve-transition height is outside the observed history',
    );
  }
  if (
    heights.reserveTransition
      < heights.currentErgoHeight - profile.maximumSuccessorCreationHeightLag
  ) {
    throw new Error(
      'substrate federated reserve successor exceeds the creation-height lag',
    );
  }
  if (
    heights.currentErgoHeight
      >= heights.sourceLockCreation + profile.sourceRefundDelayBlocks
  ) {
    throw new Error(
      'substrate federated reserve transition is at or after the refund timeout',
    );
  }
  return heights;
}

function assertPureFundingBox(box: Eip12Box): void {
  if (
    box.assets.length !== 0
    || Object.keys(box.additionalRegisters).length !== 0
  ) {
    throw new Error(
      'substrate federated source funding must be pure ERG with no registers',
    );
  }
  positiveLong(box.value, 'substrate federated source funding value');
}

function assertDistinctBoxIds(boxes: readonly Eip12Box[]): void {
  if (new Set(boxes.map(box => box.boxId)).size !== boxes.length) {
    throw new Error('substrate federated deposit inputs must be distinct');
  }
}

function feeOutput(value: bigint, creationHeight: number): Eip12OutputCandidate {
  return {
    value,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  };
}

function boundedFee(
  value: string | number | bigint,
  minimum: bigint,
  maximum: bigint,
  label: string,
): bigint {
  const fee = positiveLong(value, label);
  if (fee < minimum || fee > maximum) {
    throw new Error(`${label} is outside the federated fee policy`);
  }
  return fee;
}

function atLeastMinBox(
  value: string | number | bigint,
  label: string,
): bigint {
  const normalized = positiveLong(value, label);
  if (normalized < MIN_BOX_VALUE) {
    throw new Error(`${label} is below the minimum box value`);
  }
  return normalized;
}

function positiveLong(
  value: string | number | bigint,
  label: string,
): bigint {
  if (
    !['string', 'number', 'bigint'].includes(typeof value)
    || (typeof value === 'number' && !Number.isSafeInteger(value))
  ) {
    throw new Error(`${label} must be an exact integer`);
  }
  let normalized: bigint;
  try {
    normalized = typeof value === 'bigint' ? value : BigInt(value);
  } catch {
    throw new Error(`${label} must be an integer`);
  }
  if (normalized <= 0n || normalized > ERGO_POSITIVE_LONG_MAX) {
    throw new Error(`${label} must be a positive signed Long`);
  }
  return normalized;
}

function checkedAdd(left: bigint, right: bigint, label: string): bigint {
  if (left > ERGO_POSITIVE_LONG_MAX - right) {
    throw new Error(`${label} exceeds the positive signed Long range`);
  }
  return left + right;
}

function positiveHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > ERGO_INT_MAX) {
    throw new Error(`${label} must be a positive signed Int`);
  }
  return value;
}

function hex(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('substrate federated binding must be canonical hex');
  }
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('substrate federated binding must be canonical hex');
  }
  return normalized;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = hex(value);
  if (normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} canonical bytes`);
  }
  return normalized;
}

function assertExactKeys(
  value: object,
  requiredKeys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value);
  const allowed = [...requiredKeys, ...optionalKeys];
  if (
    requiredKeys.some(key => !Object.hasOwn(value, key))
    || actual.some(key => !allowed.includes(key))
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
