/**
 * Devnet Fleet Address -- derives and prints Fleet signer address + pubkey.
 *
 * Read-only. No DB writes. No signing. Never prints mnemonic.
 * Derives using the same path as fleet-signer.ts: masterKey.deriveChild(0).
 *
 * Exits 1 if WALLET_MNEMONIC is not set.
 */

import { ErgoHDKey } from '@fleet-sdk/wallet';

async function main(): Promise<void> {
  const walletPhrase = process.env.WALLET_MNEMONIC?.trim();
  if (!walletPhrase) {
    console.error('WALLET_MNEMONIC not set');
    process.exit(1);
  }

  const networkPrefix = parseInt(process.env.ERGO_NETWORK_PREFIX ?? '16', 10);
  const masterKey = await ErgoHDKey.fromMnemonic(walletPhrase);
  const childKey = masterKey.deriveChild(0);

  const address = childKey.address.toString(networkPrefix);
  const pubKeyHex = Buffer.from(childKey.publicKey).toString('hex');

  // Machine-readable output: one value per line, labeled.
  console.log(`FLEET_ADDRESS=${address}`);
  console.log(`FLEET_PUBKEY_HEX=${pubKeyHex}`);
}

main().catch((err: any) => {
  console.error(`Fleet address error: ${err.message ?? err}`);
  process.exit(1);
});
