import { canonicalJson } from './strict-json.js';
import { MINER_FEE_TREE } from './ergo-encoding.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const MIN_BOX_VALUE = 1_000_000n;

export interface SubstrateFederatedSingletonIssuanceInputV1 {
  readonly label: string;
  readonly genesisInput: Eip12Box;
  readonly expectedNftIdHex: string;
  readonly propositionHex: string;
  readonly registers: Readonly<Record<string, string>>;
  readonly singletonValue: bigint;
  readonly fee: bigint;
  readonly creationHeight: number;
}

export function isSubstrateFederatedSingletonIssuanceFundingUsableV1(
  value: bigint,
  singletonValue: bigint,
  fee: bigint,
): boolean {
  const change = value - singletonValue - fee;
  return change === 0n || change >= MIN_BOX_VALUE;
}

export async function materializeSubstrateFederatedSingletonIssuanceV1(
  input: Readonly<SubstrateFederatedSingletonIssuanceInputV1>,
): Promise<MaterializedUnsignedTransaction> {
  const nftIdHex = fixedHex(input.expectedNftIdHex, 32, `${input.label} NFT ID`);
  if (nftIdHex !== input.genesisInput.boxId) {
    throw new Error(`${input.label} NFT ID must equal its genesis input box ID`);
  }
  const propositionHex = variableHex(input.propositionHex, `${input.label} proposition`);
  const outputs: Eip12OutputCandidate[] = [{
    value: input.singletonValue,
    ergoTree: propositionHex,
    assets: [{ tokenId: nftIdHex, amount: '1' }],
    additionalRegisters: input.registers,
    creationHeight: input.creationHeight,
  }];
  const change = BigInt(input.genesisInput.value) - input.singletonValue - input.fee;
  if (change < 0n) throw new Error(`${input.label} is underfunded`);
  if (!isSubstrateFederatedSingletonIssuanceFundingUsableV1(
    BigInt(input.genesisInput.value),
    input.singletonValue,
    input.fee,
  )) {
    throw new Error(`${input.label} would create a dust change output`);
  }
  if (change > 0n) {
    outputs.push({
      value: change,
      ergoTree: variableHex(
        input.genesisInput.ergoTree,
        `${input.label} change ErgoTree`,
      ),
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    });
  }
  outputs.push({
    value: input.fee,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  });

  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...input.genesisInput, extension: {} }],
    dataInputs: [],
    outputs,
  }, input.label);
  assertMaterializedIssuance({
    transaction,
    genesisInput: input.genesisInput,
    propositionHex,
    nftIdHex,
    registers: input.registers,
    singletonValue: input.singletonValue,
    fee: input.fee,
    change,
    creationHeight: input.creationHeight,
  });
  return transaction;
}

function assertMaterializedIssuance(input: Readonly<{
  transaction: MaterializedUnsignedTransaction;
  genesisInput: Eip12Box;
  propositionHex: string;
  nftIdHex: string;
  registers: Readonly<Record<string, string>>;
  singletonValue: bigint;
  fee: bigint;
  change: bigint;
  creationHeight: number;
}>): void {
  const expectedOutputCount = input.change === 0n ? 2 : 3;
  if (
    input.transaction.outputs.length !== expectedOutputCount
    || input.transaction.eip12Tx.outputs.length !== expectedOutputCount
    || input.transaction.eip12Tx.inputs.length !== 1
    || input.transaction.eip12Tx.inputs[0]!.boxId !== input.genesisInput.boxId
    || Object.keys(input.transaction.eip12Tx.inputs[0]!.extension).length !== 0
    || input.transaction.eip12Tx.dataInputs.length !== 0
  ) {
    throw new Error('federated issuance transaction shape drifted');
  }
  const state = input.transaction.outputs[0]!;
  if (
    state.transactionId !== input.transaction.txId
    || state.index !== 0
    || state.value !== input.singletonValue.toString()
    || state.ergoTree !== input.propositionHex
    || state.creationHeight !== input.creationHeight
    || state.assets.length !== 1
    || state.assets[0]!.tokenId !== input.nftIdHex
    || state.assets[0]!.amount !== '1'
    || canonicalJson(state.additionalRegisters) !== canonicalJson(input.registers)
  ) {
    throw new Error('federated issuance state output drifted');
  }
  const fee = input.transaction.outputs.at(-1)!;
  if (
    fee.value !== input.fee.toString()
    || fee.ergoTree !== MINER_FEE_TREE
    || fee.assets.length !== 0
    || Object.keys(fee.additionalRegisters).length !== 0
    || fee.creationHeight !== input.creationHeight
  ) {
    throw new Error('federated issuance fee output drifted');
  }
  if (input.change > 0n) {
    const change = input.transaction.outputs[1]!;
    if (
      change.value !== input.change.toString()
      || change.ergoTree !== input.genesisInput.ergoTree
      || change.assets.length !== 0
      || Object.keys(change.additionalRegisters).length !== 0
      || change.creationHeight !== input.creationHeight
    ) {
      throw new Error('federated issuance change output drifted');
    }
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be nonempty canonical lowercase byte hex`);
  }
  return value;
}
