export interface ConfirmedErgoTransactionFixture {
  id: string;
  transaction: Record<string, unknown>;
}

let ergoWasmPromise: Promise<any> | undefined;

async function getErgoWasm(): Promise<any> {
  if (!ergoWasmPromise) {
    ergoWasmPromise = import('ergo-lib-wasm-nodejs').then(module => module.default ?? module);
  }
  return ergoWasmPromise;
}

export async function buildConfirmedErgoTransactionFixture(input: {
  outputs: Array<{
    value: string | number | bigint;
    ergoTree: string;
    assets?: Array<{ tokenId: string; amount: string | number | bigint }>;
    additionalRegisters?: Record<string, string>;
    creationHeight?: number;
  }>;
  inclusionHeight?: number;
  inclusionHeaderIdHex?: string;
  inputBoxIdHex?: string;
}): Promise<ConfirmedErgoTransactionFixture> {
  const wasm = await getErgoWasm();
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{
      boxId: input.inputBoxIdHex ?? '44'.repeat(32),
      extension: {},
    }],
    dataInputs: [],
    outputs: input.outputs.map(output => ({
      value: output.value.toString(),
      ergoTree: output.ergoTree,
      assets: (output.assets ?? []).map(asset => ({
        tokenId: asset.tokenId,
        amount: asset.amount.toString(),
      })),
      additionalRegisters: output.additionalRegisters ?? {},
      creationHeight: output.creationHeight ?? 100,
    })),
  }));
  const transaction = wasm.Transaction.from_unsigned_tx(unsigned, [new Uint8Array()]);
  try {
    const canonical = transaction.to_js_eip12() as Record<string, unknown>;
    const id = String(canonical.id).toLowerCase();
    return {
      id,
      transaction: {
        ...canonical,
        inclusionHeight: input.inclusionHeight ?? 111,
        blockId: input.inclusionHeaderIdHex ?? '33'.repeat(32),
      },
    };
  } finally {
    transaction.free?.();
  }
}
