export interface LocalWasmRootSignerPublicIdentity {
  readonly publicKeyHex: string;
  readonly p2pkErgoTreeHex: string;
  readonly networkPrefix: 16;
}

/** Derive only the public root identity used by the check-only WASM signer. */
export async function deriveLocalWasmRootSignerPublicIdentity(
  mnemonic: string,
): Promise<Readonly<LocalWasmRootSignerPublicIdentity>> {
  if (!mnemonic.trim()) {
    throw new Error('local WASM root signer mnemonic is empty');
  }
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let seed: Uint8Array | undefined;
  let root: any;
  let publicKey: any;
  let address: any;
  let ergoTree: any;
  let operationError: unknown;
  try {
    seed = wasm.Mnemonic.to_seed(mnemonic, '');
    root = wasm.ExtSecretKey.derive_master(seed);
    publicKey = root.public_key();
    address = wasm.Address.p2pk_from_pk_bytes(publicKey.pub_key_bytes());
    ergoTree = address.to_ergo_tree();
    const publicKeyHex = Buffer.from(publicKey.pub_key_bytes())
      .toString('hex')
      .toLowerCase();
    return Object.freeze({
      publicKeyHex,
      p2pkErgoTreeHex: Buffer.from(ergoTree.sigma_serialize_bytes())
        .toString('hex')
        .toLowerCase(),
      networkPrefix: 16 as const,
    });
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    let cleanupError: unknown;
    const cleanup = (operation: () => void) => {
      try {
        operation();
      } catch (error) {
        cleanupError ??= error;
      }
    };
    cleanup(() => seed?.fill(0));
    cleanup(() => ergoTree?.free?.());
    cleanup(() => address?.free?.());
    cleanup(() => publicKey?.free?.());
    cleanup(() => root?.free?.());
    if (operationError === undefined && cleanupError !== undefined) {
      throw new Error(
        `local WASM root signer cleanup failed: ${String(cleanupError)}`,
      );
    }
  }
}
