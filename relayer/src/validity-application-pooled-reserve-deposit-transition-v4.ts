import blakejs from 'blakejs';
import {
  getPooledReserveEmptyDigest,
  insertPooledReserveCommitment,
  verifyPooledReserveCommitmentInsert,
} from './avl-bridge.js';
import {
  decodeCanonicalLongRegister,
  decodeAvlTreeRegisterDigest,
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
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveProvisioningV4Packet,
  type ValidityApplicationPooledReserveProvisioningV4Packet,
} from './validity-application-pooled-reserve-provisioning-v4.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  normalizeErgoTreeHex,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_TRANSITION_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-deposit-transition.v4' as const;

const MIN_BOX_VALUE = 1_000_000n;
const MAX_MINER_FEE = 2_100_000n;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const ERGO_INT_MAX = 0x7fff_ffff;
const ZERO_ASSET_ID_HEX = `0x${'00'.repeat(32)}`;
const packets = new WeakSet<object>();

export interface ValidityApplicationPooledReserveDepositTransitionFeesV4 {
  readonly sourceLockCreationNanoErg?: string | number | bigint;
  readonly reserveTransitionNanoErg?: string | number | bigint;
}

export interface ValidityApplicationPooledReserveDepositTransitionHeightsV4 {
  readonly sourceLockCreation: number;
  readonly reserveTransition: number;
}

export interface ValidityApplicationPooledReserveDepositHistoryEntryV4 {
  readonly sourceLockBoxIdHex: string;
  readonly depositCommitmentHex: string;
}

export interface ValidityApplicationPooledReserveStateV4 {
  readonly reservePredecessor: Eip12Box;
  readonly depositHistory:
    readonly ValidityApplicationPooledReserveDepositHistoryEntryV4[];
}

export interface DeriveValidityApplicationPooledReserveDepositCommitmentV4Input {
  readonly lineageProfileIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly sourceIntentHex: string;
}

export interface BuildValidityApplicationPooledReserveDepositTransitionV4Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly provisioning:
    Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
  readonly sourceFundingBox: Eip12Box;
  readonly sourceIntent: PegInSourceIntentV2;
  readonly depositorErgoTreeHex: string;
  readonly reserveState?: ValidityApplicationPooledReserveStateV4;
  readonly fees?: ValidityApplicationPooledReserveDepositTransitionFeesV4;
  readonly creationHeights:
    ValidityApplicationPooledReserveDepositTransitionHeightsV4;
}

export interface ValidityApplicationPooledReserveDepositTransitionV4Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_TRANSITION_V4_SCHEMA;
  readonly version: 4;
  readonly lineageProfileIdHex: string;
  readonly sourceIntentHex: string;
  readonly depositCommitmentHex: string;
  readonly depositInsertProofHex: string;
  readonly predecessorReserveDigestHex: string;
  readonly successorReserveDigestHex: string;
  readonly reserveState: {
    readonly predecessorDepositCount: number;
    readonly successorDepositCount: number;
    readonly predecessorLiabilityNanoErg: string;
    readonly successorLiabilityNanoErg: string;
    readonly protectedReserveSeedNanoErg: string;
  };
  readonly transactions: {
    readonly sourceLockCreation: MaterializedUnsignedTransaction;
    readonly reserveTransition: MaterializedUnsignedTransaction;
  };
  readonly boxes: {
    readonly sourceLock: Eip12Box;
    readonly transitionFeeFunding: Eip12Box;
    readonly reservePredecessor: Eip12Box;
    readonly reserveSuccessor: Eip12Box;
  };
  readonly invariants: {
    readonly sourceLockCreatedFromExactIntent: true;
    readonly transitionConsumesExactReserveAndSource: true;
    readonly depositCommitmentBindsSourceIdAndIntent: true;
    readonly reserveInsertProofReplayed: true;
    readonly protectedValueMovesWithoutFee: true;
    readonly reserveLiabilityTracksDeposit: true;
    readonly externalFeeIsValueNeutral: true;
    readonly commitPrecedesRefundTimeout: true;
  };
  readonly boundaries: {
    readonly sourceLockCreationConstructed: true;
    readonly reserveTransitionConstructed: true;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly depositCommitmentStateEstablished: false;
    readonly ergoDepositFinalityEstablished: false;
    readonly mintEligibilityEstablished: false;
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

export function deriveValidityApplicationPooledReserveDepositCommitmentV4Hex(
  input: DeriveValidityApplicationPooledReserveDepositCommitmentV4Input,
): string {
  assertObjectKeys(input, [
    'lineageProfileIdHex',
    'sourceLockBoxIdHex',
    'sourceIntentHex',
  ], [], 'pooled-reserve deposit commitment input');
  return blake2b256Hex(Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
      'ascii',
    ),
    Buffer.from(fixedHex(
      input.lineageProfileIdHex,
      32,
      'pooled-reserve profile ID',
    ), 'hex'),
    Buffer.from(fixedHex(
      input.sourceLockBoxIdHex,
      32,
      'source-lock box ID',
    ), 'hex'),
    Buffer.from(fixedHex(
      input.sourceIntentHex,
      229,
      'source intent',
    ), 'hex'),
  ]));
}

export async function buildValidityApplicationPooledReserveDepositTransitionV4(
  input: BuildValidityApplicationPooledReserveDepositTransitionV4Input,
): Promise<Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>> {
  assertObjectKeys(input, [
    'compiledInstance',
    'provisioning',
    'sourceFundingBox',
    'sourceIntent',
    'depositorErgoTreeHex',
    'creationHeights',
  ], ['fees', 'reserveState'], 'pooled-reserve deposit-transition input');
  const compiled = input.compiledInstance;
  const provisioning = input.provisioning;
  const sourceFundingInput = structuredClone(input.sourceFundingBox);
  const sourceIntentInput = structuredClone(input.sourceIntent);
  const depositorErgoTreeHexInput = input.depositorErgoTreeHex;
  const reserveStateInput = input.reserveState === undefined
    ? undefined
    : structuredClone(input.reserveState);
  const feesInput = input.fees === undefined
    ? undefined
    : structuredClone(input.fees);
  const creationHeightsInput = structuredClone(input.creationHeights);
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
    compiled,
  );
  assertValidityApplicationPooledReserveProvisioningV4Packet(
    provisioning,
  );
  if (provisioning.lineageProfileIdHex !== compiled.lineageProfileIdHex) {
    throw new Error(
      'pooled-reserve provisioning does not match the compiled instance',
    );
  }
  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const sourceIntentHex = validateSourceIntent(
    sourceIntentInput,
    profile,
    compiled.lineageProfileIdHex,
  );
  const sourceIntent = decodePegInSourceIntentV2Hex(sourceIntentHex);
  const sourceAmount = atLeastMinBox(
    sourceIntent.amountNanoErg,
    'source intent amount',
  );
  const fees = normalizeFees(feesInput);
  const reserveState = normalizeReserveStateInput(reserveStateInput);
  const sourceFunding = await normalizeEip12Box(
    sourceFundingInput,
    'pooled-reserve source funding box',
  );
  assertPureFundingBox(sourceFunding);
  assertDistinctBoxIds([
    sourceFunding,
    provisioning.boxes.tracker,
    provisioning.boxes.duplicatePrevention,
    provisioning.boxes.pooledReserve,
  ]);
  const reservePredecessor = await normalizeEip12Box(
    reserveState?.reservePredecessor ?? provisioning.boxes.pooledReserve,
    'pooled-reserve predecessor',
  );
  assertDistinctBoxIds([
    sourceFunding,
    reservePredecessor,
    provisioning.boxes.tracker,
    provisioning.boxes.duplicatePrevention,
  ]);
  const depositHistory = reserveState?.depositHistory ?? [];
  const predecessorDigestHex = decodeAvlTreeRegisterDigest(
    reservePredecessor.additionalRegisters.R5,
    'pooled-reserve predecessor R5',
  );
  const predecessorLiability = decodeCanonicalLongRegister(
    reservePredecessor.additionalRegisters.R6,
    'pooled-reserve predecessor R6',
  );
  assertExactReservePredecessor({
    reserve: reservePredecessor,
    compiled,
    provisioning,
    depositHistory,
    predecessorDigestHex,
    predecessorLiability,
  });
  const depositorErgoTreeHex = await normalizeErgoTreeHex(
    depositorErgoTreeHexInput,
    'pooled-reserve depositor ErgoTree',
  );
  const heights = normalizeHeights(
    creationHeightsInput,
    sourceFunding,
    reservePredecessor,
  );

  const sourceLockCreation = await buildSourceLockCreation({
    sourceFunding,
    sourceIntentHex,
    sourceAmount,
    sourceLockPropositionHex:
      compiled.contracts.sourceLock.receipt.propositionHex,
    depositorErgoTreeHex,
    creationFee: fees.sourceLockCreation,
    transitionFee: fees.reserveTransition,
    creationHeight: heights.sourceLockCreation,
  });
  assertExactSourceLockCreation({
    compiled,
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

  const depositCommitmentHex =
    deriveValidityApplicationPooledReserveDepositCommitmentV4Hex({
      lineageProfileIdHex: compiled.lineageProfileIdHex,
      sourceLockBoxIdHex: sourceLock.boxId,
      sourceIntentHex,
    });
  const insertion = insertPooledReserveCommitment(
    depositHistory.map(entry => ({
      key: entry.sourceLockBoxIdHex,
      value: entry.depositCommitmentHex,
    })),
    sourceLock.boxId,
    depositCommitmentHex,
  );
  const replayedSuccessorDigestHex = verifyPooledReserveCommitmentInsert(
    predecessorDigestHex,
    sourceLock.boxId,
    depositCommitmentHex,
    insertion.insert_proof_hex,
  );
  if (replayedSuccessorDigestHex !== insertion.new_digest_hex) {
    throw new Error('pooled-reserve insertion replay disagrees with the prover');
  }

  const predecessorValue = positiveLong(
    reservePredecessor.value,
    'pooled-reserve predecessor value',
  );
  const successorValue = checkedAdd(
    predecessorValue,
    sourceAmount,
    'pooled-reserve successor value',
  );
  const successorLiability = checkedAdd(
    predecessorLiability,
    sourceAmount,
    'pooled-reserve successor liability',
  );
  const reserveSuccessor: Eip12OutputCandidate = {
    value: successorValue,
    ergoTree: compiled.contracts.pooledReserve.receipt.propositionHex,
    assets: [{
      tokenId: fixedHex(
        compiled.genesis.settlementVaultNftIdHex,
        32,
        'pooled-reserve NFT ID',
      ),
      amount: '1',
    }],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(fixedHex(
        compiled.lineageProfileIdHex,
        32,
        'pooled-reserve profile ID',
      ), 'hex')),
      R5: encodeAvlTreeRegister(
        Buffer.from(insertion.new_digest_hex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
      ),
      R6: encodeLongRegister(successorLiability),
    },
    creationHeight: heights.reserveTransition,
  };
  const reserveTransition = await materializeUnsignedTransaction({
    inputs: [
      {
        ...reservePredecessor,
        extension: {
          '0': encodeCollByteRegister(Buffer.from(
            insertion.insert_proof_hex,
            'hex',
          )),
        },
      },
      { ...sourceLock, extension: {} },
      { ...transitionFeeFunding, extension: {} },
    ],
    dataInputs: [],
    outputs: [
      reserveSuccessor,
      feeOutput(fees.reserveTransition, heights.reserveTransition),
    ],
  }, 'validity application pooled-reserve deposit transition');
  assertExactTransition({
    compiled,
    reservePredecessor,
    sourceLock,
    transitionFeeFunding,
    reserveTransition,
    sourceAmount,
    predecessorLiability,
    successorValue,
    successorLiability,
    successorDigestHex: insertion.new_digest_hex,
    insertProofHex: insertion.insert_proof_hex,
    transitionFee: fees.reserveTransition,
    transitionHeight: heights.reserveTransition,
  });

  const result = deepFreeze({
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_TRANSITION_V4_SCHEMA,
    version: 4 as const,
    lineageProfileIdHex: compiled.lineageProfileIdHex,
    sourceIntentHex,
    depositCommitmentHex,
    depositInsertProofHex: insertion.insert_proof_hex,
    predecessorReserveDigestHex: predecessorDigestHex,
    successorReserveDigestHex: insertion.new_digest_hex,
    reserveState: Object.freeze({
      predecessorDepositCount: depositHistory.length,
      successorDepositCount: depositHistory.length + 1,
      predecessorLiabilityNanoErg: predecessorLiability.toString(),
      successorLiabilityNanoErg: successorLiability.toString(),
      protectedReserveSeedNanoErg:
        provisioning.pooledReserveGenesisSeedNanoErg,
    }),
    transactions: Object.freeze({
      sourceLockCreation,
      reserveTransition,
    }),
    boxes: Object.freeze({
      sourceLock,
      transitionFeeFunding,
      reservePredecessor,
      reserveSuccessor: reserveTransition.outputs[0],
    }),
    invariants: Object.freeze({
      sourceLockCreatedFromExactIntent: true as const,
      transitionConsumesExactReserveAndSource: true as const,
      depositCommitmentBindsSourceIdAndIntent: true as const,
      reserveInsertProofReplayed: true as const,
      protectedValueMovesWithoutFee: true as const,
      reserveLiabilityTracksDeposit: true as const,
      externalFeeIsValueNeutral: true as const,
      commitPrecedesRefundTimeout: true as const,
    }),
    boundaries: Object.freeze({
      sourceLockCreationConstructed: true as const,
      reserveTransitionConstructed: true as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      depositCommitmentStateEstablished: false as const,
      ergoDepositFinalityEstablished: false as const,
      mintEligibilityEstablished: false as const,
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
  packets.add(result);
  return result;
}

export function assertValidityApplicationPooledReserveDepositTransitionV4Packet(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveDepositTransitionV4Packet
> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'pooled-reserve deposit-transition packet was not built in this process',
    );
  }
}

function validateSourceIntent(
  input: PegInSourceIntentV2,
  profile: ReturnType<typeof decodePegInPooledReserveLineageProfileV4Hex>,
  lineageProfileIdHex: string,
): string {
  assertObjectKeys(input, [
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
  ], [], 'pooled-reserve source intent');
  const encoded = encodePegInSourceIntentV2Hex(input);
  const decoded = decodePegInSourceIntentV2Hex(encoded);
  const bindings = [
    ['format version', decoded.formatVersion,
      PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION],
    ['source network', decoded.sourceNetworkIdHex, profile.sourceNetworkIdHex],
    ['sidechain', decoded.sidechainIdHex, profile.sidechainIdHex],
    ['bridge address', decoded.bridgeAddressHex, profile.bridgeAddressHex],
    ['token address', decoded.tokenAddressHex, profile.tokenAddressHex],
    [
      'settlement profile',
      decoded.settlementProfileIdHex,
      profile.settlementProfileIdHex,
    ],
    ['pooled-reserve profile', decoded.admissionProfileIdHex, lineageProfileIdHex],
    ['source asset', decoded.sourceAssetIdHex, ZERO_ASSET_ID_HEX],
  ] as const;
  for (const [label, actual, expected] of bindings) {
    if (actual !== expected) {
      throw new Error(
        `source intent ${label} does not match the pooled-reserve instance`,
      );
    }
  }
  atLeastMinBox(decoded.amountNanoErg, 'source intent amount');
  if (decoded.recipientAddressHex === `0x${'00'.repeat(20)}`) {
    throw new Error('source intent recipient must not be the zero address');
  }
  return encoded;
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
  const outputs: Eip12OutputCandidate[] = [
    {
      value: input.sourceAmount,
      ergoTree: variableHex(
        input.sourceLockPropositionHex,
        'source-lock proposition',
      ),
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(
          fixedHex(input.sourceIntentHex, 229, 'source intent'),
          'hex',
        )),
        R5: encodeCollByteRegister(Buffer.from(
          input.depositorErgoTreeHex,
          'hex',
        )),
      },
      creationHeight: input.creationHeight,
    },
    {
      value: input.transitionFee,
      ergoTree: input.sourceFunding.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    },
  ];
  const change = BigInt(input.sourceFunding.value)
    - input.sourceAmount
    - input.transitionFee
    - input.creationFee;
  if (change < 0n) {
    throw new Error('pooled-reserve source funding is underfunded');
  }
  appendChange(
    outputs,
    change,
    input.sourceFunding.ergoTree,
    input.creationHeight,
    'pooled-reserve source-lock creation change',
  );
  outputs.push(feeOutput(input.creationFee, input.creationHeight));
  return materializeUnsignedTransaction({
    inputs: [{ ...input.sourceFunding, extension: {} }],
    dataInputs: [],
    outputs,
  }, 'validity application pooled-reserve source-lock creation');
}

function assertExactSourceLockCreation(input: {
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
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
  const expectedChange = BigInt(input.sourceFunding.value)
    - input.sourceAmount
    - input.transitionFee
    - input.creationFee;
  const expectedOutputCount = expectedChange === 0n ? 3 : 4;
  if (
    tx.eip12Tx.inputs.length !== 1
    || tx.eip12Tx.inputs[0].boxId !== input.sourceFunding.boxId
    || Object.keys(tx.eip12Tx.inputs[0].extension).length !== 0
    || tx.eip12Tx.dataInputs.length !== 0
    || tx.outputs.length !== expectedOutputCount
    || tx.outputs.reduce(
      (total, output) => total + BigInt(output.value),
      0n,
    ) !== BigInt(input.sourceFunding.value)
  ) {
    throw new Error('pooled-reserve source-lock creation topology drifted');
  }

  const sourceLock = tx.outputs[0];
  const expectedSourceLockRegisters = {
    R4: encodeCollByteRegister(Buffer.from(
      fixedHex(input.sourceIntentHex, 229, 'source intent'),
      'hex',
    )),
    R5: encodeCollByteRegister(Buffer.from(
      input.depositorErgoTreeHex,
      'hex',
    )),
  };
  if (
    BigInt(sourceLock.value) !== input.sourceAmount
    || sourceLock.ergoTree
      !== input.compiled.contracts.sourceLock.receipt.propositionHex
    || sourceLock.assets.length !== 0
    || Object.keys(sourceLock.additionalRegisters).sort().join(',') !== 'R4,R5'
    || sourceLock.additionalRegisters.R4 !== expectedSourceLockRegisters.R4
    || sourceLock.additionalRegisters.R5 !== expectedSourceLockRegisters.R5
    || sourceLock.creationHeight !== input.creationHeight
  ) {
    throw new Error('pooled-reserve source-lock output drifted');
  }

  const transitionFeeFunding = tx.outputs[1];
  if (
    BigInt(transitionFeeFunding.value) !== input.transitionFee
    || transitionFeeFunding.ergoTree !== input.sourceFunding.ergoTree
    || transitionFeeFunding.assets.length !== 0
    || Object.keys(transitionFeeFunding.additionalRegisters).length !== 0
    || transitionFeeFunding.creationHeight !== input.creationHeight
  ) {
    throw new Error(
      'pooled-reserve transition-fee funding output drifted',
    );
  }

  if (expectedChange > 0n) {
    const change = tx.outputs[2];
    if (
      BigInt(change.value) !== expectedChange
      || change.ergoTree !== input.sourceFunding.ergoTree
      || change.assets.length !== 0
      || Object.keys(change.additionalRegisters).length !== 0
      || change.creationHeight !== input.creationHeight
    ) {
      throw new Error('pooled-reserve source-lock creation change drifted');
    }
  }

  const fee = tx.outputs[tx.outputs.length - 1];
  if (
    BigInt(fee.value) !== input.creationFee
    || fee.ergoTree !== MINER_FEE_TREE
    || fee.assets.length !== 0
    || Object.keys(fee.additionalRegisters).length !== 0
    || fee.creationHeight !== input.creationHeight
  ) {
    throw new Error('pooled-reserve source-lock creation fee drifted');
  }
}

function assertExactReservePredecessor(input: {
  reserve: Eip12Box;
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
  depositHistory:
    readonly ValidityApplicationPooledReserveDepositHistoryEntryV4[];
  predecessorDigestHex: string;
  predecessorLiability: bigint;
}): void {
  const {
    reserve,
    compiled,
    provisioning,
    depositHistory,
    predecessorDigestHex,
    predecessorLiability,
  } = input;
  const expectedRegisters = {
    R4: encodeCollByteRegister(Buffer.from(fixedHex(
      compiled.lineageProfileIdHex,
      32,
      'pooled-reserve profile ID',
    ), 'hex')),
    R5: encodeAvlTreeRegister(
      Buffer.from(predecessorDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
    ),
    R6: encodeLongRegister(predecessorLiability),
  };
  if (
    reserve.ergoTree
      !== fixedHex(
        compiled.contracts.pooledReserve.receipt.propositionHex,
        undefined,
        'pooled-reserve proposition',
      )
    || reserve.assets.length !== 1
    || reserve.assets[0].tokenId
      !== fixedHex(
        compiled.genesis.settlementVaultNftIdHex,
        32,
        'pooled-reserve NFT ID',
      )
    || reserve.assets[0].amount !== '1'
    || Object.keys(reserve.additionalRegisters).sort().join(',')
      !== 'R4,R5,R6'
    || reserve.additionalRegisters.R4 !== expectedRegisters.R4
    || reserve.additionalRegisters.R5 !== expectedRegisters.R5
    || reserve.additionalRegisters.R6 !== expectedRegisters.R6
  ) {
    throw new Error('pooled-reserve predecessor is not an exact V4 reserve');
  }
  if (
    predecessorLiability < 0n
    || predecessorLiability > ERGO_POSITIVE_LONG_MAX
    || BigInt(reserve.value) < predecessorLiability
    || BigInt(reserve.value) - predecessorLiability
      !== BigInt(provisioning.pooledReserveGenesisSeedNanoErg)
  ) {
    throw new Error(
      'pooled-reserve predecessor does not preserve the reviewed reserve seed',
    );
  }
  if (
    depositHistory.length === 0
    && (
      reserve.boxId !== provisioning.boxes.pooledReserve.boxId
      || predecessorDigestHex !== getPooledReserveEmptyDigest()
      || predecessorLiability !== 0n
    )
  ) {
    throw new Error(
      'empty pooled-reserve history requires the exact reviewed genesis',
    );
  }
  if (depositHistory.length > 0 && predecessorLiability === 0n) {
    throw new Error(
      'non-empty pooled-reserve history requires positive liability',
    );
  }
}

function assertExactTransition(input: {
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  reservePredecessor: Eip12Box;
  sourceLock: Eip12Box;
  transitionFeeFunding: Eip12Box;
  reserveTransition: MaterializedUnsignedTransaction;
  sourceAmount: bigint;
  predecessorLiability: bigint;
  successorValue: bigint;
  successorLiability: bigint;
  successorDigestHex: string;
  insertProofHex: string;
  transitionFee: bigint;
  transitionHeight: number;
}): void {
  const tx = input.reserveTransition;
  if (
    tx.eip12Tx.dataInputs.length !== 0
    || tx.eip12Tx.inputs.length !== 3
    || tx.outputs.length !== 2
    || tx.eip12Tx.inputs[0].boxId !== input.reservePredecessor.boxId
    || tx.eip12Tx.inputs[1].boxId !== input.sourceLock.boxId
    || tx.eip12Tx.inputs[2].boxId !== input.transitionFeeFunding.boxId
    || tx.eip12Tx.inputs[0].extension['0']
      !== encodeCollByteRegister(Buffer.from(input.insertProofHex, 'hex'))
    || Object.keys(tx.eip12Tx.inputs[0].extension).length !== 1
    || Object.keys(tx.eip12Tx.inputs[1].extension).length !== 0
    || Object.keys(tx.eip12Tx.inputs[2].extension).length !== 0
  ) {
    throw new Error('pooled-reserve transition input topology drifted');
  }
  const successor = tx.outputs[0];
  const expectedProfileRegister = encodeCollByteRegister(Buffer.from(fixedHex(
    input.compiled.lineageProfileIdHex,
    32,
    'pooled-reserve profile ID',
  ), 'hex'));
  const successorFailures = [
    [
      'value conservation',
      BigInt(input.reservePredecessor.value)
      + BigInt(input.sourceLock.value)
      + BigInt(input.transitionFeeFunding.value)
      === tx.outputs.reduce(
        (total, output) => total + BigInt(output.value),
        0n,
      ),
    ],
    [
      'source-lock proposition',
      input.sourceLock.ergoTree
        === input.compiled.contracts.sourceLock.receipt.propositionHex,
    ],
    ['source-lock value', BigInt(input.sourceLock.value) === input.sourceAmount],
    ['source-lock tokens', input.sourceLock.assets.length === 0],
    [
      'source-lock registers',
      Object.keys(input.sourceLock.additionalRegisters).sort().join(',')
        === 'R4,R5',
    ],
    ['successor value', BigInt(successor.value) === input.successorValue],
    [
      'protected reserve seed',
      BigInt(successor.value) - input.successorLiability
        === BigInt(input.reservePredecessor.value)
          - input.predecessorLiability,
    ],
    [
      'deposit value delta',
      input.successorValue
        === BigInt(input.reservePredecessor.value) + input.sourceAmount,
    ],
    [
      'reserve proposition',
      successor.ergoTree
        === input.compiled.contracts.pooledReserve.receipt.propositionHex,
    ],
    ['reserve token cardinality', successor.assets.length === 1],
    [
      'reserve NFT',
      successor.assets[0]?.tokenId
        === fixedHex(
        input.compiled.genesis.settlementVaultNftIdHex,
        32,
        'pooled-reserve NFT ID',
      ),
    ],
    ['reserve NFT amount', successor.assets[0]?.amount === '1'],
    [
      'reserve register shape',
      Object.keys(successor.additionalRegisters).sort().join(',')
        === 'R4,R5,R6',
    ],
    [
      'reserve profile',
      successor.additionalRegisters.R4 === expectedProfileRegister,
    ],
    [
      'reserve deposit root',
      successor.additionalRegisters.R5
        === encodeAvlTreeRegister(
        Buffer.from(input.successorDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
      ),
    ],
    [
      'reserve liability',
      successor.additionalRegisters.R6
        === encodeLongRegister(input.successorLiability),
    ],
    ['reserve creation height', successor.creationHeight === input.transitionHeight],
  ] as const;
  const failedSuccessorChecks = successorFailures
    .filter(([, passed]) => !passed)
    .map(([label]) => label);
  if (failedSuccessorChecks.length !== 0) {
    throw new Error(
      `pooled-reserve transition successor drifted: ${
        failedSuccessorChecks.join(', ')
      }`,
    );
  }
  const fee = tx.outputs[1];
  if (
    BigInt(input.transitionFeeFunding.value) !== input.transitionFee
    || BigInt(fee.value) !== input.transitionFee
    || fee.ergoTree !== MINER_FEE_TREE
    || fee.assets.length !== 0
    || Object.keys(fee.additionalRegisters).length !== 0
    || fee.creationHeight !== input.transitionHeight
  ) {
    throw new Error('pooled-reserve transition fee is not value-neutral');
  }
}

function normalizeReserveStateInput(
  input: ValidityApplicationPooledReserveStateV4 | undefined,
): ValidityApplicationPooledReserveStateV4 | undefined {
  if (input === undefined) return undefined;
  assertObjectKeys(input, [
    'reservePredecessor',
    'depositHistory',
  ], [], 'pooled-reserve predecessor state');
  if (!Array.isArray(input.depositHistory)) {
    throw new Error('pooled-reserve deposit history must be an array');
  }
  const depositHistory = input.depositHistory.map((entry, index) => {
    assertObjectKeys(entry, [
      'sourceLockBoxIdHex',
      'depositCommitmentHex',
    ], [], `pooled-reserve deposit history entry ${index}`);
    return Object.freeze({
      sourceLockBoxIdHex: fixedHex(
        entry.sourceLockBoxIdHex,
        32,
        `pooled-reserve deposit history entry ${index} source-lock box ID`,
      ),
      depositCommitmentHex: fixedHex(
        entry.depositCommitmentHex,
        32,
        `pooled-reserve deposit history entry ${index} commitment`,
      ),
    });
  });
  if (
    new Set(depositHistory.map(entry => entry.sourceLockBoxIdHex)).size
      !== depositHistory.length
  ) {
    throw new Error('pooled-reserve deposit history contains duplicate keys');
  }
  return Object.freeze({
    reservePredecessor: input.reservePredecessor,
    depositHistory: Object.freeze(depositHistory),
  });
}

function normalizeFees(
  input: ValidityApplicationPooledReserveDepositTransitionFeesV4 | undefined,
): { sourceLockCreation: bigint; reserveTransition: bigint } {
  if (input !== undefined) {
    assertObjectKeys(input, [], [
      'sourceLockCreationNanoErg',
      'reserveTransitionNanoErg',
    ], 'pooled-reserve deposit-transition fees');
  }
  return {
    sourceLockCreation: minerFee(
      input?.sourceLockCreationNanoErg ?? MINER_FEE,
      'source-lock creation fee',
    ),
    reserveTransition: minerFee(
      input?.reserveTransitionNanoErg ?? MINER_FEE,
      'reserve transition fee',
    ),
  };
}

function normalizeHeights(
  input: ValidityApplicationPooledReserveDepositTransitionHeightsV4,
  sourceFunding: Eip12Box,
  reservePredecessor: Eip12Box,
): ValidityApplicationPooledReserveDepositTransitionHeightsV4 {
  assertObjectKeys(input, [
    'sourceLockCreation',
    'reserveTransition',
  ], [], 'pooled-reserve deposit-transition heights');
  const heights = {
    sourceLockCreation: positiveHeight(
      input.sourceLockCreation,
      'source-lock creation height',
    ),
    reserveTransition: positiveHeight(
      input.reserveTransition,
      'reserve transition height',
    ),
  };
  if (heights.sourceLockCreation < sourceFunding.creationHeight) {
    throw new Error('source-lock creation height predates its funding input');
  }
  if (
    heights.sourceLockCreation
      > ERGO_INT_MAX
        - VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS
  ) {
    throw new Error(
      'source-lock creation height cannot preserve the refund timeout in a signed Int',
    );
  }
  if (heights.reserveTransition < heights.sourceLockCreation) {
    throw new Error('reserve transition height predates the source lock');
  }
  if (heights.reserveTransition < reservePredecessor.creationHeight) {
    throw new Error('reserve transition height predates the reserve predecessor');
  }
  if (
    heights.reserveTransition
    >= heights.sourceLockCreation
      + VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS
  ) {
    throw new Error('reserve transition is at or after the source refund timeout');
  }
  return heights;
}

function assertPureFundingBox(box: Eip12Box): void {
  if (
    box.assets.length !== 0
    || Object.keys(box.additionalRegisters).length !== 0
  ) {
    throw new Error(
      'pooled-reserve source funding must be pure ERG with no registers',
    );
  }
  positiveLong(box.value, 'pooled-reserve source funding value');
}

function assertDistinctBoxIds(boxes: readonly Eip12Box[]): void {
  if (new Set(boxes.map(box => box.boxId)).size !== boxes.length) {
    throw new Error('pooled-reserve deposit-transition inputs must be distinct');
  }
}

function appendChange(
  outputs: Eip12OutputCandidate[],
  value: bigint,
  ergoTree: string,
  creationHeight: number,
  label: string,
): void {
  if (value === 0n) return;
  if (value < MIN_BOX_VALUE) {
    throw new Error(`${label} is below the minimum box value`);
  }
  outputs.push({
    value,
    ergoTree,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  });
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

function minerFee(value: string | number | bigint, label: string): bigint {
  const fee = atLeastMinBox(value, label);
  if (fee > MAX_MINER_FEE) {
    throw new Error(`${label} exceeds the reviewed miner-fee bound`);
  }
  return fee;
}

function atLeastMinBox(
  value: string | number | bigint,
  label: string,
): bigint {
  const normalized = positiveLong(value, label);
  if (normalized < MIN_BOX_VALUE) {
    throw new Error(`${label} must be at least ${MIN_BOX_VALUE}`);
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
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must be a positive signed Int`);
  }
  return value;
}

function fixedHex(
  value: string,
  bytes: number | undefined,
  label: string,
): string {
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (
    !/^[0-9a-f]+$/.test(normalized)
    || normalized.length % 2 !== 0
    || (bytes !== undefined && normalized.length !== bytes * 2)
  ) {
    throw new Error(`${label} must be canonical hex`);
  }
  return normalized;
}

function variableHex(value: string, label: string): string {
  return fixedHex(value, undefined, label);
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function assertObjectKeys(
  value: object,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): void {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const allowed = [...requiredKeys, ...optionalKeys].sort();
  const missing = requiredKeys.filter(
    key => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (
    missing.length !== 0
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
