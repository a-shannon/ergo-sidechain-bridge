import {
  encodeCollByteRegister,
  encodeLongRegister,
} from '../../ergo-settlement-core/ergo-encoding.js';
import type {
  BoxLike as SettlementBoxLike,
} from '../../ergo-settlement-core/settlement-transaction.js';
import {
  planChangeOrFeeBigInt,
  safeNanoErgNumber,
} from '../../ergo-settlement-core/tx-balance.js';
import {
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-settlement-policy.js';
import {
  selectSubstrateGrandpaV1AssetProfile,
} from './asset-profile.js';

export type BoxLike = SettlementBoxLike;

export interface BuildPegInCommitmentTxInput {
  assetProfileId: string;
  depositBox: BoxLike;
  feeBox: BoxLike;
  vaultErgoTreeHex: string;
  targetH160Hex: string;
  depositorErgoTreeHex: string;
  creationHeight: number;
  minerFee?: number | string | bigint;
  minBoxValue?: number | string | bigint;
}

export interface PegInCommitmentOutput {
  value: number;
  ergoTree: string;
  assets: [];
  additionalRegisters: Record<string, string>;
  creationHeight: number;
}

export interface PegInCommitmentUnsignedTx {
  inputs: Array<{ boxId: string; extension: Record<string, string> }>;
  dataInputs: [];
  outputs: PegInCommitmentOutput[];
}

const MIN_BOX_VALUE = 1_000_000;

function normalizeFixedHex(hex: string, expectedBytes: number, label: string): string {
  const clean = normalizeNonemptyHex(hex, label);
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean;
}

function normalizeNonemptyHex(hex: string, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be nonempty even-length hex`);
  }
  return clean.toLowerCase();
}

function normalizeBoxId(boxId: string, label: string): string {
  try {
    return normalizeFixedHex(boxId, 32, `${label} boxId`);
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('must be nonempty even-length hex')) {
      throw new Error(`${label} boxId must be 32 bytes`);
    }
    throw error;
  }
}

function safePositiveNanoErg(value: number | string | bigint, label: string): number {
  const amount = safeNanoErgNumber(value, label);
  if (amount <= 0) {
    throw new Error(`${label} must be positive: ${amount}`);
  }
  return amount;
}

function assertPureErg(box: BoxLike, label: string): void {
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error(`${label} must be pure ERG with no tokens`);
  }
}

/**
 * Plan an unsigned V1 consume transaction that transfers one refundable
 * deposit into the canonical committed vault without signing or external I/O.
 */
export function buildPegInCommitmentTx(
  input: BuildPegInCommitmentTxInput,
): PegInCommitmentUnsignedTx {
  selectSubstrateGrandpaV1AssetProfile(input.assetProfileId);
  const depositBoxId = normalizeBoxId(input.depositBox.boxId, 'depositBox');
  const feeBoxId = normalizeBoxId(input.feeBox.boxId, 'feeBox');
  if (depositBoxId === feeBoxId) {
    throw new Error('depositBox and feeBox must be distinct');
  }

  const vaultErgoTreeHex = normalizeNonemptyHex(input.vaultErgoTreeHex, 'vaultErgoTree');
  const targetH160Hex = normalizeFixedHex(input.targetH160Hex, 20, 'targetH160');
  const depositorErgoTreeHex = normalizeNonemptyHex(input.depositorErgoTreeHex, 'depositorErgoTree');
  const feeChangeErgoTreeHex = normalizeNonemptyHex(input.feeBox.ergoTree, 'feeBox ergoTree');

  if (!Number.isSafeInteger(input.creationHeight) || input.creationHeight < 0) {
    throw new Error(`creationHeight must be a non-negative safe integer: ${input.creationHeight}`);
  }

  assertPureErg(input.depositBox, 'depositBox');
  assertPureErg(input.feeBox, 'feeBox');

  const depositValue = safePositiveNanoErg(input.depositBox.value, 'depositBox value');
  const feeValue = safePositiveNanoErg(input.feeBox.value, 'feeBox value');
  const minerFee = safePositiveNanoErg(input.minerFee ?? MINER_FEE, 'miner fee');
  const minBoxValue = safePositiveNanoErg(input.minBoxValue ?? MIN_BOX_VALUE, 'min box value');

  if (depositValue < minBoxValue) {
    throw new Error(`depositBox value ${depositValue} is below min box value ${minBoxValue}`);
  }
  if (minerFee < minBoxValue) {
    throw new Error(`miner fee ${minerFee} is below min box value ${minBoxValue}`);
  }
  if (feeValue < minerFee) {
    throw new Error(`feeBox value ${feeValue} does not cover miner fee ${minerFee}`);
  }

  const feePlan = planChangeOrFeeBigInt(
    BigInt(feeValue) - BigInt(minerFee),
    BigInt(minerFee),
    BigInt(minBoxValue),
  );
  const feeChangeValue = safeNanoErgNumber(feePlan.changeOutputValue, 'fee change value');
  const minerFeeValue = safeNanoErgNumber(feePlan.minerFeeValue, 'miner fee output value');

  const outputs: PegInCommitmentOutput[] = [
    {
      value: depositValue,
      ergoTree: vaultErgoTreeHex,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(depositBoxId, 'hex')),
        R5: encodeCollByteRegister(Buffer.from(targetH160Hex, 'hex')),
        R6: encodeLongRegister(depositValue),
        R7: encodeCollByteRegister(Buffer.from(depositorErgoTreeHex, 'hex')),
      },
      creationHeight: input.creationHeight,
    },
  ];

  if (feeChangeValue > 0) {
    outputs.push({
      value: feeChangeValue,
      ergoTree: feeChangeErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    });
  }

  outputs.push({
    value: minerFeeValue,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  });

  return {
    inputs: [
      { boxId: depositBoxId, extension: {} },
      { boxId: feeBoxId, extension: {} },
    ],
    dataInputs: [],
    outputs,
  };
}
