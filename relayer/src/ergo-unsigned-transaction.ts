import { assertContextExtensionSafe } from './context-extension-guard.js';

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return wasmPromise;
}

export function toUnsignedTransactionJson(eip12Tx: any): any {
  return {
    inputs: eip12Tx.inputs.map((input: any) => ({
      boxId: input.boxId,
      extension: input.extension || {},
    })),
    dataInputs: (eip12Tx.dataInputs || []).map((input: any) => ({
      boxId: input.boxId,
    })),
    outputs: eip12Tx.outputs.map((output: any) => ({
      value: typeof output.value === 'bigint'
        ? output.value.toString()
        : String(output.value),
      ergoTree: output.ergoTree,
      assets: (output.assets || []).map((asset: any) => ({
        tokenId: asset.tokenId,
        amount: typeof asset.amount === 'bigint'
          ? asset.amount.toString()
          : String(asset.amount),
      })),
      additionalRegisters: output.additionalRegisters || {},
      creationHeight: output.creationHeight,
    })),
  };
}

function assertCreationHeight(
  label: string,
  collection: string,
  index: number,
  box: any,
): void {
  if (!Number.isSafeInteger(box?.creationHeight) || box.creationHeight <= 0) {
    throw new Error(
      `${label}: ${collection}[${index}] must have a positive safe integer creationHeight`,
    );
  }
}

export function assertEip12CreationHeights(label: string, eip12Tx: any): void {
  const inputs = Array.isArray(eip12Tx?.inputs) ? eip12Tx.inputs : [];
  const dataInputs = Array.isArray(eip12Tx?.dataInputs)
    ? eip12Tx.dataInputs
    : [];
  const outputs = Array.isArray(eip12Tx?.outputs) ? eip12Tx.outputs : [];

  inputs.forEach((box: any, index: number) =>
    assertCreationHeight(label, 'inputs', index, box));
  dataInputs.forEach((box: any, index: number) =>
    assertCreationHeight(label, 'dataInputs', index, box));
  outputs.forEach((box: any, index: number) =>
    assertCreationHeight(label, 'outputs', index, box));
}

/**
 * Derive the proof-independent Ergo transaction ID without signer, key,
 * network, persistence, submission, or broadcast capability.
 */
export async function deriveUnsignedTransactionId(eip12Tx: any): Promise<string> {
  assertContextExtensionSafe(
    eip12Tx.inputs ?? [],
    'derive unsigned transaction ID',
  );
  assertEip12CreationHeights('derive unsigned transaction ID', eip12Tx);
  const wasm = await getWasm();
  const unsignedTx = wasm.UnsignedTransaction.from_json(
    JSON.stringify(toUnsignedTransactionJson(eip12Tx)),
  );
  try {
    return unsignedTx.id().to_str().toLowerCase();
  } finally {
    unsignedTx.free?.();
  }
}
