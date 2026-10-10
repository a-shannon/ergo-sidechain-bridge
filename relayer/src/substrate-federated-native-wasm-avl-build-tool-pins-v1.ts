export type WasmAvlBuildToolNameV2 = 'wasmPack' | 'wasmBindgen' | 'rustc' | 'cargo';

const REVIEWED_BUILD_TOOL_HASHES = Object.freeze({
  'win32-x64': Object.freeze({
    wasmPack: '6e569a9bea962dbdc3e30e9aef076b1d559f7819b1cbb7ffce85ece8a7e47da8',
    wasmBindgen: '9d669c8c13bb70a37c8518c9476f9b716c7fdf463daaa73742dffb486e7f802a',
    rustc: 'cf79cfd77b0a144c56a0a6af6bf10bcdf095a73718cd4bf2b9d4fe2d2cbded55',
    cargo: 'ddfbad20b31b918d3439d070945ec59bbfe037a6ec0ab5b584459e69c8b37d1b',
  }),
});

export function validateWasmAvlBuildToolHashV2(
  name: WasmAvlBuildToolNameV2,
  sha256Hex: string,
  host = `${process.platform}-${process.arch}`,
): void {
  const expected = REVIEWED_BUILD_TOOL_HASHES[
    host as keyof typeof REVIEWED_BUILD_TOOL_HASHES
  ];
  if (!expected) throw new Error(`WASM AVL build has no reviewed tool pins for ${host}`);
  if (!/^[0-9a-f]{64}$/u.test(sha256Hex) || sha256Hex !== expected[name]) {
    throw new Error(`WASM AVL ${name} executable does not match its reviewed hash`);
  }
}
