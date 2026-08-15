import type { BoxLike } from './aggregate-settlement-tx.js';
import {
  decodeCollByteRegister,
  encodeCollByteRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodePegInSourceIntentV2Hex,
  PEG_IN_SOURCE_INTENT_V2_BYTES,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import { planChangeOrFeeBigInt } from './tx-balance.js';

export const PEG_IN_CAUSAL_REFUND_TIMEOUT_BLOCKS = 10_000;

export interface PegInCausalPlanOutputV2 {
  value: string;
  ergoTree: string;
  assets: [];
  additionalRegisters: Record<string, string>;
  creationHeight: number;
}

export interface PegInCausalUnsignedTxV2 {
  inputs: Array<{ boxId: string; extension: Record<string, string> }>;
  dataInputs: [];
  outputs: PegInCausalPlanOutputV2[];
}

interface PegInCausalCommonPlanInputV2 {
  sourceLockBox: BoxLike;
  feeBox: BoxLike;
  expectedSourceLockErgoTreeHex: string;
  expectedSourceNetworkIdHex: string;
  expectedAdmissionProfileIdHex: string;
  creationHeight: number;
  minerFee?: number | string | bigint;
  minBoxValue?: number | string | bigint;
}

export interface BuildPegInCausalCommitmentV2TxInput
  extends PegInCausalCommonPlanInputV2 {
  causalVaultErgoTreeHex: string;
}

export type BuildPegInCausalRefundV2TxInput = PegInCausalCommonPlanInputV2;

interface ValidatedSourceLockV2 {
  sourceBoxId: string;
  sourceValue: bigint;
  sourceCreationHeight: number;
  sourceIntentHex: string;
  sourceIntentRegister: string;
  depositorErgoTreeHex: string;
  intent: PegInSourceIntentV2;
}

interface CommonPlanContextV2 {
  source: ValidatedSourceLockV2;
  feeBoxId: string;
  feeChangeErgoTreeHex: string;
  feeChangeValue: bigint;
  minerFeeValue: bigint;
  creationHeight: number;
}

const MIN_BOX_VALUE = 1_000_000;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

/**
 * Builds an unsigned, side-effect-free transition from a refundable causal
 * source lock to the exact non-refundable causal vault. The source intent is
 * copied from the box register, never accepted as a caller-supplied value.
 */
export function buildPegInCausalCommitmentV2Tx(
  input: BuildPegInCausalCommitmentV2TxInput,
): PegInCausalUnsignedTxV2 {
  const context = validateCommonPlan(input);
  const timeoutHeight =
    context.source.sourceCreationHeight + PEG_IN_CAUSAL_REFUND_TIMEOUT_BLOCKS;
  if (context.creationHeight >= timeoutHeight) {
    throw new Error(
      `commit creationHeight ${context.creationHeight} is at or after timeout height ${timeoutHeight}`,
    );
  }
  const causalVaultErgoTreeHex = normalizeNonemptyHex(
    input.causalVaultErgoTreeHex,
    'causalVaultErgoTree',
  );

  return buildTransaction(context, {
    value: context.source.sourceValue.toString(),
    ergoTree: causalVaultErgoTreeHex,
    assets: [],
    additionalRegisters: {
      R4: context.source.sourceIntentRegister,
      R5: encodeCollByteRegister(Buffer.from(context.source.sourceBoxId, 'hex')),
    },
    creationHeight: context.creationHeight,
  });
}

/**
 * Builds the timeout refund shape enforced by MainChainLockCausalV2. The full
 * source value returns to the depositor; a distinct fee input funds the fee.
 */
export function buildPegInCausalRefundV2Tx(
  input: BuildPegInCausalRefundV2TxInput,
): PegInCausalUnsignedTxV2 {
  const context = validateCommonPlan(input);
  const timeoutHeight =
    context.source.sourceCreationHeight + PEG_IN_CAUSAL_REFUND_TIMEOUT_BLOCKS;
  if (input.creationHeight < timeoutHeight) {
    throw new Error(
      `refund creationHeight ${input.creationHeight} is before timeout height ${timeoutHeight}`,
    );
  }

  return buildTransaction(context, {
    value: context.source.sourceValue.toString(),
    ergoTree: context.source.depositorErgoTreeHex,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(context.source.sourceBoxId, 'hex')),
    },
    creationHeight: context.creationHeight,
  });
}

function validateCommonPlan(input: PegInCausalCommonPlanInputV2): CommonPlanContextV2 {
  const sourceBoxId = normalizeFixedHex(input.sourceLockBox.boxId, 32, 'sourceLockBox boxId');
  const feeBoxId = normalizeFixedHex(input.feeBox.boxId, 32, 'feeBox boxId');
  if (sourceBoxId === feeBoxId) {
    throw new Error('sourceLockBox and feeBox must be distinct');
  }
  const expectedSourceLockErgoTreeHex = normalizeNonemptyHex(
    input.expectedSourceLockErgoTreeHex,
    'expected source-lock ErgoTree',
  );
  const actualSourceLockErgoTreeHex = normalizeNonemptyHex(
    input.sourceLockBox.ergoTree,
    'sourceLockBox ErgoTree',
  );
  if (actualSourceLockErgoTreeHex !== expectedSourceLockErgoTreeHex) {
    throw new Error('sourceLockBox ErgoTree does not match the active causal source profile');
  }

  assertPureErg(input.sourceLockBox, 'sourceLockBox');
  assertPureErg(input.feeBox, 'feeBox');
  const sourceValue = positiveNanoErg(input.sourceLockBox.value, 'sourceLockBox value');
  const feeValue = positiveNanoErg(input.feeBox.value, 'feeBox value');
  const minerFee = positiveNanoErg(input.minerFee ?? MINER_FEE, 'miner fee');
  const minBoxValue = positiveNanoErg(input.minBoxValue ?? MIN_BOX_VALUE, 'min box value');
  const creationHeight = nonnegativeHeight(input.creationHeight, 'creationHeight');
  const sourceCreationHeight = nonnegativeHeight(
    input.sourceLockBox.creationHeight,
    'sourceLockBox creationHeight',
  );
  if (sourceValue < minBoxValue) {
    throw new Error(`sourceLockBox value ${sourceValue} is below min box value ${minBoxValue}`);
  }
  if (minerFee < minBoxValue) {
    throw new Error(`miner fee ${minerFee} is below min box value ${minBoxValue}`);
  }
  if (feeValue < minerFee) {
    throw new Error(`feeBox value ${feeValue} does not cover miner fee ${minerFee}`);
  }

  const sourceIntentRegister = requiredRegister(input.sourceLockBox, 'R4', 'sourceLockBox');
  const sourceIntentHex = decodeCollByteRegister(sourceIntentRegister, 'sourceLockBox R4');
  if (Buffer.from(sourceIntentHex, 'hex').length !== PEG_IN_SOURCE_INTENT_V2_BYTES) {
    throw new Error(`sourceLockBox R4 must contain exactly ${PEG_IN_SOURCE_INTENT_V2_BYTES} bytes`);
  }
  const canonicalIntentRegister = encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex'));
  if (normalizeSerializedRegister(sourceIntentRegister) !== canonicalIntentRegister) {
    throw new Error('sourceLockBox R4 must use canonical Coll[Byte] serialization');
  }
  const intent = decodePegInSourceIntentV2Hex(`0x${sourceIntentHex}`);
  const expectedSourceNetworkIdHex = prefixedFixedHex(
    input.expectedSourceNetworkIdHex,
    32,
    'expected source network ID',
  );
  const expectedAdmissionProfileIdHex = prefixedFixedHex(
    input.expectedAdmissionProfileIdHex,
    32,
    'expected admission profile ID',
  );
  if (intent.sourceNetworkIdHex !== expectedSourceNetworkIdHex) {
    throw new Error('sourceLockBox source network does not match the expected source network');
  }
  if (intent.admissionProfileIdHex !== expectedAdmissionProfileIdHex) {
    throw new Error('sourceLockBox admission profile does not match the expected admission profile');
  }
  if (intent.sourceAssetIdHex !== `0x${'00'.repeat(32)}`) {
    throw new Error('sourceLockBox source asset must be the native ERG zero asset ID');
  }
  const sourceAmount = positiveNanoErg(intent.amountNanoErg, 'source intent amount');
  if (sourceValue !== sourceAmount) {
    throw new Error(
      `sourceLockBox value ${sourceValue} must equal source intent amount ${sourceAmount}`,
    );
  }

  const depositorRegister = requiredRegister(input.sourceLockBox, 'R5', 'sourceLockBox');
  const depositorErgoTreeHex = decodeCollByteRegister(depositorRegister, 'sourceLockBox R5');
  if (depositorErgoTreeHex.length === 0) {
    throw new Error('sourceLockBox R5 depositor ErgoTree must not be empty');
  }
  if (
    normalizeSerializedRegister(depositorRegister)
    !== encodeCollByteRegister(Buffer.from(depositorErgoTreeHex, 'hex'))
  ) {
    throw new Error('sourceLockBox R5 must use canonical Coll[Byte] serialization');
  }

  const feeChangeErgoTreeHex = normalizeNonemptyHex(input.feeBox.ergoTree, 'feeBox ergoTree');
  const feePlan = planChangeOrFeeBigInt(
    feeValue - minerFee,
    minerFee,
    minBoxValue,
  );

  return {
    source: {
      sourceBoxId,
      sourceValue,
      sourceCreationHeight,
      sourceIntentHex,
      sourceIntentRegister: canonicalIntentRegister,
      depositorErgoTreeHex,
      intent,
    },
    feeBoxId,
    feeChangeErgoTreeHex,
    feeChangeValue: feePlan.changeOutputValue,
    minerFeeValue: feePlan.minerFeeValue,
    creationHeight,
  };
}

function buildTransaction(
  context: CommonPlanContextV2,
  primaryOutput: PegInCausalPlanOutputV2,
): PegInCausalUnsignedTxV2 {
  const outputs = [primaryOutput];
  if (context.feeChangeValue > 0n) {
    outputs.push({
      value: context.feeChangeValue.toString(),
      ergoTree: context.feeChangeErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight: context.creationHeight,
    });
  }
  outputs.push({
    value: context.minerFeeValue.toString(),
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: context.creationHeight,
  });

  return {
    inputs: [
      { boxId: context.source.sourceBoxId, extension: {} },
      { boxId: context.feeBoxId, extension: {} },
    ],
    dataInputs: [],
    outputs,
  };
}

function requiredRegister(box: BoxLike, register: string, label: string): string {
  const value = box.additionalRegisters?.[register];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is missing ${register}`);
  }
  return value;
}

function assertPureErg(box: BoxLike, label: string): void {
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error(`${label} must be pure ERG with no tokens`);
  }
}

function positiveNanoErg(value: number | string | bigint, label: string): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be supplied as an exact integer`);
  }
  if (typeof value === 'string' && !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer`);
  }
  const amount = BigInt(value);
  if (amount <= 0n) throw new Error(`${label} must be positive`);
  if (amount > ERGO_POSITIVE_LONG_MAX) {
    throw new Error(`${label} exceeds the positive Ergo Long range`);
  }
  return amount;
}

function nonnegativeHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeSerializedRegister(value: string): string {
  return (value.startsWith('0x') ? value.slice(2) : value).toLowerCase();
}

function prefixedFixedHex(value: string, bytes: number, label: string): string {
  return `0x${normalizeFixedHex(value, bytes, label)}`;
}

function normalizeFixedHex(value: string, bytes: number, label: string): string {
  const clean = normalizeNonemptyHex(value, label);
  if (clean.length !== bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return clean;
}

function normalizeNonemptyHex(value: string, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be nonempty even-length hexadecimal`);
  }
  return clean.toLowerCase();
}
