import {
  decodeCollByteRegister,
  encodeCollByteRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodePegInSourceIntentV2Hex,
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  PEG_IN_SOURCE_INTENT_V2_BYTES,
} from './peg-in-causal-admission-v2.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  normalizeErgoTreeHex,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-source-refund.v4' as const;

const MIN_BOX_VALUE = 1_000_000n;
const MAX_MINER_FEE = 2_100_000n;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const ERGO_INT_MAX = 0x7fff_ffff;
const ZERO_ASSET_ID_HEX = `0x${'00'.repeat(32)}`;
const packets = new WeakSet<object>();

export interface BuildValidityApplicationPooledReserveSourceRefundV4Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly sourceLockBox: Eip12Box;
  readonly externalFeeFundingBox: Eip12Box;
  readonly creationHeight: number;
}

export interface ValidityApplicationPooledReserveSourceRefundV4Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_V4_SCHEMA;
  readonly version: 4;
  readonly lineageProfileIdHex: string;
  readonly sourceIntentHex: string;
  readonly source: {
    readonly sourceLockBoxIdHex: string;
    readonly sourceCreationHeight: number;
    readonly refundTimeoutHeight: number;
    readonly amountNanoErg: string;
    readonly depositorErgoTreeHex: string;
  };
  readonly transaction: MaterializedUnsignedTransaction;
  readonly boxes: {
    readonly sourceLock: Eip12Box;
    readonly externalFeeFunding: Eip12Box;
    readonly depositorRefund: Eip12Box;
    readonly minerFee: Eip12Box;
  };
  readonly invariants: {
    readonly exactSourceProfile: true;
    readonly exactTimeoutBoundary: true;
    readonly exactDepositorAndSourceBinding: true;
    readonly fullSourceValueReturned: true;
    readonly externalFeeIsValueNeutral: true;
    readonly noResidualOutput: true;
  };
  readonly boundaries: {
    readonly refundTransactionConstructed: true;
    readonly sourceUnspentEstablished: false;
    readonly currentHeightObserved: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly profileActivated: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export async function buildValidityApplicationPooledReserveSourceRefundV4(
  input: BuildValidityApplicationPooledReserveSourceRefundV4Input,
): Promise<Readonly<ValidityApplicationPooledReserveSourceRefundV4Packet>> {
  assertObjectKeys(input, [
    'compiledInstance',
    'sourceLockBox',
    'externalFeeFundingBox',
    'creationHeight',
  ], [], 'pooled-reserve source-refund input');

  const compiled = input.compiledInstance;
  const sourceLockInput = structuredClone(input.sourceLockBox);
  const feeFundingInput = structuredClone(input.externalFeeFundingBox);
  const creationHeightInput = input.creationHeight;

  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(compiled);
  const sourceLock = await normalizeEip12Box(
    sourceLockInput,
    'pooled-reserve source-lock box',
  );
  const externalFeeFunding = await normalizeEip12Box(
    feeFundingInput,
    'pooled-reserve external fee-funding box',
  );
  if (sourceLock.boxId === externalFeeFunding.boxId) {
    throw new Error(
      'pooled-reserve source lock and external fee funding must be distinct',
    );
  }

  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const expectedSourceTree = canonicalHex(
    compiled.contracts.sourceLock.receipt.propositionHex,
    'compiled pooled-reserve source-lock proposition',
  );
  if (sourceLock.ergoTree !== expectedSourceTree) {
    throw new Error(
      'source-lock ErgoTree does not match the compiled pooled-reserve profile',
    );
  }
  if (
    sourceLock.assets.length !== 0
    || Object.keys(sourceLock.additionalRegisters).sort().join(',') !== 'R4,R5'
  ) {
    throw new Error(
      'source-lock box must be canonical pure ERG with exact R4/R5 registers',
    );
  }

  const sourceIntentRegister = requiredRegister(
    sourceLock,
    'R4',
    'source-lock box',
  );
  const sourceIntentBytesHex = decodeCollByteRegister(
    sourceIntentRegister,
    'source-lock R4',
  );
  if (
    Buffer.from(sourceIntentBytesHex, 'hex').length
      !== PEG_IN_SOURCE_INTENT_V2_BYTES
    || sourceIntentRegister.toLowerCase()
      !== encodeCollByteRegister(Buffer.from(sourceIntentBytesHex, 'hex'))
  ) {
    throw new Error(
      `source-lock R4 must be canonical ${PEG_IN_SOURCE_INTENT_V2_BYTES}-byte source intent`,
    );
  }
  const sourceIntentHex = `0x${sourceIntentBytesHex}`;
  const sourceIntent = decodePegInSourceIntentV2Hex(sourceIntentHex);
  const intentBindings = [
    ['format version', sourceIntent.formatVersion,
      PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION],
    ['source network', sourceIntent.sourceNetworkIdHex,
      profile.sourceNetworkIdHex],
    ['sidechain', sourceIntent.sidechainIdHex, profile.sidechainIdHex],
    ['bridge address', sourceIntent.bridgeAddressHex, profile.bridgeAddressHex],
    ['token address', sourceIntent.tokenAddressHex, profile.tokenAddressHex],
    ['settlement profile', sourceIntent.settlementProfileIdHex,
      profile.settlementProfileIdHex],
    ['pooled-reserve profile', sourceIntent.admissionProfileIdHex,
      compiled.lineageProfileIdHex],
    ['source asset', sourceIntent.sourceAssetIdHex, ZERO_ASSET_ID_HEX],
  ] as const;
  for (const [label, actual, expected] of intentBindings) {
    if (actual !== expected) {
      throw new Error(
        `source-lock source intent ${label} does not match the compiled profile`,
      );
    }
  }
  if (sourceIntent.recipientAddressHex === `0x${'00'.repeat(20)}`) {
    throw new Error('source-lock source intent recipient must not be zero');
  }
  const sourceAmount = atLeastMinBox(
    sourceIntent.amountNanoErg,
    'source-lock source intent amount',
  );
  if (BigInt(sourceLock.value) !== sourceAmount) {
    throw new Error(
      'source-lock value must equal the source intent amount',
    );
  }

  const depositorRegister = requiredRegister(
    sourceLock,
    'R5',
    'source-lock box',
  );
  const depositorTreeBytesHex = decodeCollByteRegister(
    depositorRegister,
    'source-lock R5',
  );
  if (
    depositorTreeBytesHex.length === 0
    || depositorRegister.toLowerCase()
      !== encodeCollByteRegister(Buffer.from(depositorTreeBytesHex, 'hex'))
  ) {
    throw new Error(
      'source-lock R5 must contain a canonical non-empty depositor ErgoTree',
    );
  }
  const depositorErgoTreeHex = await normalizeErgoTreeHex(
    depositorTreeBytesHex,
    'source-lock depositor ErgoTree',
  );

  assertPureExternalFeeFunding(externalFeeFunding);
  const feeValue = minerFee(
    externalFeeFunding.value,
    'pooled-reserve external refund fee',
  );
  const creationHeight = positiveHeight(
    creationHeightInput,
    'pooled-reserve source-refund creation height',
  );
  if (creationHeight < externalFeeFunding.creationHeight) {
    throw new Error(
      'pooled-reserve source-refund creation height predates fee funding',
    );
  }
  const refundTimeoutHeight = checkedHeightAdd(
    sourceLock.creationHeight,
    VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
    'pooled-reserve source-refund timeout',
  );
  if (creationHeight < refundTimeoutHeight) {
    throw new Error(
      `pooled-reserve source refund is before timeout height ${refundTimeoutHeight}`,
    );
  }

  const transaction = await materializeUnsignedTransaction({
    inputs: [
      { ...sourceLock, extension: {} },
      { ...externalFeeFunding, extension: {} },
    ],
    dataInputs: [],
    outputs: [
      {
        value: sourceAmount,
        ergoTree: depositorErgoTreeHex,
        assets: [],
        additionalRegisters: {
          R4: encodeCollByteRegister(Buffer.from(sourceLock.boxId, 'hex')),
        },
        creationHeight,
      },
      {
        value: feeValue,
        ergoTree: MINER_FEE_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight,
      },
    ],
  }, 'validity application pooled-reserve source refund');
  assertExactRefund({
    transaction,
    sourceLock,
    externalFeeFunding,
    depositorErgoTreeHex,
    sourceAmount,
    feeValue,
    creationHeight,
  });

  const result = deepFreeze({
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_V4_SCHEMA,
    version: 4 as const,
    lineageProfileIdHex: compiled.lineageProfileIdHex,
    sourceIntentHex,
    source: Object.freeze({
      sourceLockBoxIdHex: sourceLock.boxId,
      sourceCreationHeight: sourceLock.creationHeight,
      refundTimeoutHeight,
      amountNanoErg: sourceAmount.toString(),
      depositorErgoTreeHex,
    }),
    transaction,
    boxes: Object.freeze({
      sourceLock,
      externalFeeFunding,
      depositorRefund: transaction.outputs[0],
      minerFee: transaction.outputs[1],
    }),
    invariants: Object.freeze({
      exactSourceProfile: true as const,
      exactTimeoutBoundary: true as const,
      exactDepositorAndSourceBinding: true as const,
      fullSourceValueReturned: true as const,
      externalFeeIsValueNeutral: true as const,
      noResidualOutput: true as const,
    }),
    boundaries: Object.freeze({
      refundTransactionConstructed: true as const,
      sourceUnspentEstablished: false as const,
      currentHeightObserved: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      profileActivated: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  packets.add(result);
  return result;
}

export function assertValidityApplicationPooledReserveSourceRefundV4Packet(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveSourceRefundV4Packet
> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'pooled-reserve source-refund packet was not built in this process',
    );
  }
}

function assertExactRefund(input: {
  transaction: MaterializedUnsignedTransaction;
  sourceLock: Eip12Box;
  externalFeeFunding: Eip12Box;
  depositorErgoTreeHex: string;
  sourceAmount: bigint;
  feeValue: bigint;
  creationHeight: number;
}): void {
  const tx = input.transaction;
  const refund = tx.outputs[0];
  const fee = tx.outputs[1];
  const expectedSourceIdRegister = encodeCollByteRegister(
    Buffer.from(input.sourceLock.boxId, 'hex'),
  );
  if (
    tx.eip12Tx.inputs.length !== 2
    || tx.eip12Tx.inputs[0].boxId !== input.sourceLock.boxId
    || tx.eip12Tx.inputs[1].boxId !== input.externalFeeFunding.boxId
    || tx.eip12Tx.inputs.some(
      candidate => Object.keys(candidate.extension).length !== 0,
    )
    || tx.eip12Tx.dataInputs.length !== 0
    || tx.outputs.length !== 2
  ) {
    throw new Error('pooled-reserve source-refund topology drifted');
  }
  if (
    BigInt(refund.value) !== input.sourceAmount
    || refund.ergoTree !== input.depositorErgoTreeHex
    || refund.assets.length !== 0
    || Object.keys(refund.additionalRegisters).join(',') !== 'R4'
    || refund.additionalRegisters.R4 !== expectedSourceIdRegister
    || refund.creationHeight !== input.creationHeight
  ) {
    throw new Error('pooled-reserve depositor refund output drifted');
  }
  if (
    BigInt(input.externalFeeFunding.value) !== input.feeValue
    || BigInt(fee.value) !== input.feeValue
    || fee.ergoTree !== MINER_FEE_TREE
    || fee.assets.length !== 0
    || Object.keys(fee.additionalRegisters).length !== 0
    || fee.creationHeight !== input.creationHeight
  ) {
    throw new Error('pooled-reserve source-refund fee is not value-neutral');
  }
  const inputValue =
    BigInt(input.sourceLock.value) + BigInt(input.externalFeeFunding.value);
  const outputValue = tx.outputs.reduce(
    (total, output) => total + BigInt(output.value),
    0n,
  );
  if (inputValue !== outputValue) {
    throw new Error('pooled-reserve source-refund value conservation drifted');
  }
}

function requiredRegister(
  box: Eip12Box,
  key: string,
  label: string,
): string {
  const value = box.additionalRegisters[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is missing ${key}`);
  }
  return value;
}

function assertPureExternalFeeFunding(box: Eip12Box): void {
  if (
    box.assets.length !== 0
    || Object.keys(box.additionalRegisters).length !== 0
  ) {
    throw new Error(
      'pooled-reserve external fee funding must be pure ERG with no registers',
    );
  }
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

function positiveHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > ERGO_INT_MAX) {
    throw new Error(`${label} must be a positive signed Int`);
  }
  return value;
}

function checkedHeightAdd(
  height: number,
  delta: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(height)
    || height < 0
    || height > ERGO_INT_MAX - delta
  ) {
    throw new Error(`${label} exceeds the signed Int range`);
  }
  return height + delta;
}

function canonicalHex(value: string, label: string): string {
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be canonical hex`);
  }
  return normalized;
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
