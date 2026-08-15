import blakejs from 'blakejs';
import {
  Address,
  ErgoTree,
} from 'ergo-lib-wasm-nodejs';

export function canonicalizeCompiledErgoTreeHex(
  value: unknown,
  label = 'compiled ErgoTree',
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be canonical nonempty even-length hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (
    clean.length === 0
    || clean.length % 2 !== 0
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be canonical nonempty even-length hex`);
  }
  const canonical = clean.toLowerCase();
  let tree: ErgoTree | undefined;
  try {
    tree = ErgoTree.from_base16_bytes(canonical);
    if (tree.to_base16_bytes().toLowerCase() !== canonical) {
      throw new Error(`${label} must round-trip to the exact serialized bytes`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('round-trip')) throw error;
    throw new Error(`${label} must decode as a canonical serialized ErgoTree`);
  } finally {
    tree?.free();
  }
  return canonical;
}

export function bindCompiledContractIdentity(
  addressValue: unknown,
  ergoTreeValue: unknown,
  label = 'compiled contract',
): { address: string; ergoTreeHex: string } {
  if (typeof addressValue !== 'string' || addressValue.length === 0) {
    throw new Error(`${label} address must be a nonempty base58 address`);
  }
  const ergoTreeHex = canonicalizeCompiledErgoTreeHex(
    ergoTreeValue,
    `${label} ErgoTree`,
  );
  let address: Address | undefined;
  let addressTree: ErgoTree | undefined;
  try {
    address = Address.from_base58(addressValue);
    addressTree = address.to_ergo_tree();
    if (addressTree.to_base16_bytes().toLowerCase() !== ergoTreeHex) {
      throw new Error(`${label} address does not encode the compiled ErgoTree`);
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes('does not encode the compiled ErgoTree')
    ) {
      throw error;
    }
    throw new Error(`${label} address must be a valid base58 address`);
  } finally {
    addressTree?.free();
    address?.free();
  }
  return { address: addressValue, ergoTreeHex };
}

export function deriveCompiledErgoTreeHashHex(
  value: unknown,
  label = 'compiled ErgoTree',
): string {
  const ergoTreeHex = canonicalizeCompiledErgoTreeHex(value, label);
  return Buffer.from(
    blakejs.blake2b(Buffer.from(ergoTreeHex, 'hex'), undefined, 32),
  ).toString('hex');
}
