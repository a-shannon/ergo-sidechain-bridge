import { assertContextExtensionSafe } from './context-extension-guard.js';

export interface Eip12Asset {
  tokenId: string;
  amount: string;
}

export interface Eip12Box {
  boxId: string;
  value: string;
  ergoTree: string;
  assets: Eip12Asset[];
  additionalRegisters: Record<string, string>;
  creationHeight: number;
  transactionId: string;
  index: number;
}

export interface Eip12UnsignedInput extends Eip12Box {
  extension: Record<string, string>;
}

export interface Eip12OutputCandidate {
  value: string | number | bigint;
  ergoTree: string;
  assets?: Array<{ tokenId: string; amount: string | number | bigint }>;
  additionalRegisters?: Record<string, string>;
  creationHeight: number;
}

export interface Eip12UnsignedTransaction {
  inputs: Eip12UnsignedInput[];
  dataInputs: Eip12Box[];
  outputs: Eip12OutputCandidate[];
}

export interface MaterializedUnsignedTransaction {
  txId: string;
  eip12Tx: Eip12UnsignedTransaction;
  outputs: Eip12Box[];
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs').then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function normalizeEip12Box(box: unknown, label: string): Promise<Eip12Box> {
  const normalized = normalizeBoxJson(box, label);
  const wasm = await getWasm();
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify(normalized));
  } catch (error: any) {
    throw new Error(`${label} is not a valid EIP-12 box: ${error?.message ?? String(error)}`);
  }
  const canonical = parsed.to_js_eip12() as Eip12Box;
  if (canonical.boxId.toLowerCase() !== normalized.boxId) {
    throw new Error(`${label} boxId does not match its serialized box contents`);
  }
  return canonical;
}

export async function normalizeErgoTreeHex(
  value: unknown,
  label: string,
): Promise<string> {
  const normalized = normalizeVariableHex(value, label);
  const wasm = await getWasm();
  let tree: any;
  try {
    tree = wasm.ErgoTree.from_base16_bytes(normalized);
    tree.constants_len();
    const canonical = String(tree.to_base16_bytes()).toLowerCase();
    if (canonical !== normalized) {
      throw new Error(`${label} is not canonically serialized`);
    }
    return canonical;
  } catch (error: any) {
    if (
      error instanceof Error
      && error.message === `${label} is not canonically serialized`
    ) {
      throw error;
    }
    throw new Error(
      `${label} is not a valid ErgoTree: ${error?.message ?? String(error)}`,
    );
  } finally {
    tree?.free();
  }
}

export async function materializeUnsignedTransaction(
  tx: Eip12UnsignedTransaction,
  label: string,
): Promise<MaterializedUnsignedTransaction> {
  if (!Array.isArray(tx.inputs) || tx.inputs.length === 0) {
    throw new Error(`${label} requires at least one input`);
  }
  if (!Array.isArray(tx.outputs) || tx.outputs.length === 0) {
    throw new Error(`${label} requires at least one output`);
  }
  if (!Array.isArray(tx.dataInputs)) {
    throw new Error(`${label} dataInputs must be an array`);
  }
  const normalized = await normalizeUnsignedTransaction(tx, label);
  assertContextExtensionSafe(normalized.inputs, label, 4);

  const wasm = await getWasm();
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(toUnsignedJson(normalized)));
  const txIdObject = unsigned.id();
  const txId = txIdObject.to_str().toLowerCase();
  const candidates = unsigned.output_candidates();
  const outputs: Eip12Box[] = [];
  for (let index = 0; index < candidates.len(); index += 1) {
    const output = wasm.ErgoBox.from_box_candidate(candidates.get(index), txIdObject, index);
    outputs.push(output.to_js_eip12() as Eip12Box);
  }
  return {
    txId,
    eip12Tx: structuredClone(normalized),
    outputs,
  };
}

async function normalizeUnsignedTransaction(
  tx: Eip12UnsignedTransaction,
  label: string,
): Promise<Eip12UnsignedTransaction> {
  const inputs = await Promise.all(tx.inputs.map(async (input, index) => {
    const { extension, ...box } = input;
    return {
      ...await normalizeEip12Box(box, `${label} inputs[${index}]`),
      extension: structuredClone(extension ?? {}),
    };
  }));
  const dataInputs = await Promise.all(tx.dataInputs.map((box, index) =>
    normalizeEip12Box(box, `${label} dataInputs[${index}]`),
  ));
  const outputs = tx.outputs.map((candidate, index) =>
    normalizeOutputCandidate(candidate, `${label} outputs[${index}]`),
  );

  assertDistinctBoxReferences(inputs, dataInputs, label);
  assertErgConservation(inputs, outputs, label);
  assertTokenConservation(inputs, outputs, label);
  return { inputs, dataInputs, outputs };
}

function normalizeOutputCandidate(
  candidate: Eip12OutputCandidate,
  label: string,
): Eip12OutputCandidate {
  assertPositiveCreationHeight(candidate, label);
  return {
    value: normalizePositiveAmount(candidate.value, `${label}.value`),
    ergoTree: normalizeVariableHex(candidate.ergoTree, `${label}.ergoTree`),
    assets: (candidate.assets ?? []).map((asset, index) => ({
      tokenId: normalizeHex(asset.tokenId, 32, `${label}.assets[${index}].tokenId`),
      amount: normalizePositiveAmount(asset.amount, `${label}.assets[${index}].amount`),
    })),
    additionalRegisters: normalizeRegisters(
      candidate.additionalRegisters ?? {},
      `${label}.additionalRegisters`,
    ),
    creationHeight: candidate.creationHeight,
  };
}

function assertDistinctBoxReferences(
  inputs: Eip12UnsignedInput[],
  dataInputs: Eip12Box[],
  label: string,
): void {
  const spent = new Set<string>();
  for (const input of inputs) {
    if (spent.has(input.boxId)) throw new Error(`${label} contains duplicate input box IDs`);
    spent.add(input.boxId);
  }
  const readOnly = new Set<string>();
  for (const input of dataInputs) {
    if (readOnly.has(input.boxId)) throw new Error(`${label} contains duplicate data input box IDs`);
    if (spent.has(input.boxId)) {
      throw new Error(`${label} cannot reference one box as both input and data input`);
    }
    readOnly.add(input.boxId);
  }
}

function assertErgConservation(
  inputs: Eip12UnsignedInput[],
  outputs: Eip12OutputCandidate[],
  label: string,
): void {
  const inputValue = inputs.reduce((sum, box) => sum + BigInt(box.value), 0n);
  const outputValue = outputs.reduce((sum, box) => sum + BigInt(box.value), 0n);
  if (inputValue !== outputValue) {
    throw new Error(`${label} does not conserve ERG value (${inputValue} input, ${outputValue} output)`);
  }
}

function assertTokenConservation(
  inputs: Eip12UnsignedInput[],
  outputs: Eip12OutputCandidate[],
  label: string,
): void {
  const inputTotals = collectTokenTotals(inputs);
  const outputTotals = collectTokenTotals(outputs);
  const mintedTokenId = inputs[0].boxId;
  for (const [tokenId, inputAmount] of inputTotals) {
    const outputAmount = outputTotals.get(tokenId) ?? 0n;
    if (outputAmount !== inputAmount) {
      throw new Error(
        `${label} must preserve existing token ${tokenId} exactly (${inputAmount} input, ${outputAmount} output)`,
      );
    }
  }
  for (const [tokenId, outputAmount] of outputTotals) {
    if (tokenId === mintedTokenId) continue;
    const inputAmount = inputTotals.get(tokenId) ?? 0n;
    if (outputAmount > inputAmount) {
      throw new Error(
        `${label} creates token ${tokenId} outside the first-input minting rule`,
      );
    }
  }
}

function collectTokenTotals(
  boxes: Array<{ assets?: Array<{ tokenId: string; amount: string | number | bigint }> }>,
): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const box of boxes) {
    for (const asset of box.assets ?? []) {
      const tokenId = normalizeHex(asset.tokenId, 32, 'token ID');
      totals.set(tokenId, (totals.get(tokenId) ?? 0n) + BigInt(asset.amount));
    }
  }
  return totals;
}

function toUnsignedJson(tx: Eip12UnsignedTransaction): Record<string, unknown> {
  return {
    inputs: tx.inputs.map(input => ({
      boxId: normalizeHex(input.boxId, 32, 'input boxId'),
      extension: input.extension ?? {},
    })),
    dataInputs: tx.dataInputs.map(input => ({
      boxId: normalizeHex(input.boxId, 32, 'data input boxId'),
    })),
    outputs: tx.outputs.map((output, index) => ({
      value: normalizePositiveAmount(output.value, `outputs[${index}].value`),
      ergoTree: normalizeVariableHex(output.ergoTree, `outputs[${index}].ergoTree`),
      assets: (output.assets ?? []).map((asset, assetIndex) => ({
        tokenId: normalizeHex(asset.tokenId, 32, `outputs[${index}].assets[${assetIndex}].tokenId`),
        amount: normalizePositiveAmount(
          asset.amount,
          `outputs[${index}].assets[${assetIndex}].amount`,
        ),
      })),
      additionalRegisters: normalizeRegisters(
        output.additionalRegisters ?? {},
        `outputs[${index}].additionalRegisters`,
      ),
      creationHeight: output.creationHeight,
    })),
  };
}

function normalizeBoxJson(box: unknown, label: string): Eip12Box {
  if (!box || typeof box !== 'object' || Array.isArray(box)) {
    throw new Error(`${label} must be an EIP-12 box object`);
  }
  const value = box as Record<string, unknown>;
  const {
    boxId,
    value: boxValue,
    ergoTree,
    assets: assetInput,
    additionalRegisters,
    creationHeight,
    transactionId,
    index: boxIndex,
  } = value;
  assertPositiveCreationHeight({ creationHeight }, label);
  if (!Number.isInteger(boxIndex) || Number(boxIndex) < 0 || Number(boxIndex) > 0x7fff) {
    throw new Error(`${label}.index must be a non-negative signed 16-bit integer`);
  }
  if (!Array.isArray(assetInput)) {
    throw new Error(`${label}.assets must be an array`);
  }
  return {
    boxId: normalizeHex(boxId, 32, `${label}.boxId`),
    value: normalizeBoxAmount(boxValue, `${label}.value`),
    ergoTree: normalizeVariableHex(ergoTree, `${label}.ergoTree`),
    assets: assetInput.map((asset, index) => {
      if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
        throw new Error(`${label}.assets[${index}] must be an object`);
      }
      const token = asset as Record<string, unknown>;
      const { tokenId, amount } = token;
      return {
        tokenId: normalizeHex(tokenId, 32, `${label}.assets[${index}].tokenId`),
        amount: normalizeBoxAmount(amount, `${label}.assets[${index}].amount`),
      };
    }),
    additionalRegisters: normalizeRegisters(
      additionalRegisters,
      `${label}.additionalRegisters`,
    ),
    creationHeight: Number(creationHeight),
    transactionId: normalizeHex(transactionId, 32, `${label}.transactionId`),
    index: Number(boxIndex),
  };
}

function normalizeRegisters(value: unknown, label: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const registers: Record<string, string> = {};
  for (const [key, register] of Object.entries(value as Record<string, unknown>)) {
    if (!/^R[4-9]$/.test(key)) throw new Error(`${label}.${key} is not a non-mandatory register`);
    registers[key] = normalizeVariableHex(register, `${label}.${key}`);
  }
  return registers;
}

function assertPositiveCreationHeight(value: any, label: string): void {
  if (!Number.isSafeInteger(value?.creationHeight) || value.creationHeight <= 0) {
    throw new Error(`${label}.creationHeight must be a positive safe integer`);
  }
}

function normalizePositiveAmount(value: unknown, label: string): string {
  const raw = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`${label} must be a positive integer`);
  const parsed = BigInt(raw);
  if (parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit a positive signed 64-bit integer`);
  }
  return raw;
}

function normalizeBoxAmount(value: unknown, label: string): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${label} numeric JSON value must be a positive safe integer`);
    }
    return String(value);
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(
      `${label} must be a primitive positive decimal string or positive safe integer`,
    );
  }
  const parsed = BigInt(value);
  if (parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit a positive signed 64-bit integer`);
  }
  return value;
}

function normalizeHex(value: unknown, bytes: number, label: string): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (typeof clean !== 'string' || !/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function normalizeVariableHex(value: unknown, label: string): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (
    typeof clean !== 'string'
    || clean.length === 0
    || clean.length % 2 !== 0
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}
