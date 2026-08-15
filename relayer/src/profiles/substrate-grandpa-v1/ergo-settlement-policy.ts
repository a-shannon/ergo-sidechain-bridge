import { ECDH } from 'node:crypto';

export const MINER_FEE = 1_100_000;

export const EMPTY_AVL_DIGEST =
  '6aaafd25f895a30bc9cc00e6cc67a817f8e265e48cbfc700a1635bb002e62eb900';

export const MINER_FEE_TREE =
  '1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304';

/** Decode one fully consumed, canonical proveDlog SigmaProp constant. */
export function decodeCanonicalDlogSigmaPropRegister(
  registerHex: string,
  label = 'SigmaProp register',
): string {
  const clean = registerHex.startsWith('0x') ? registerHex.slice(2) : registerHex;
  const canonical = clean.toLowerCase();
  if (
    !/^[0-9a-f]+$/i.test(clean)
    || canonical.length !== 70
    || !canonical.startsWith('08cd')
  ) {
    throw new Error(`${label} must be one fully consumed canonical proveDlog SigmaProp register`);
  }

  const compressedPubKeyHex = canonical.slice(4);
  if (!compressedPubKeyHex.startsWith('02') && !compressedPubKeyHex.startsWith('03')) {
    throw new Error(`${label} must contain a compressed secp256k1 public key`);
  }
  try {
    const normalized = ECDH.convertKey(
      Buffer.from(compressedPubKeyHex, 'hex'),
      'secp256k1',
      undefined,
      undefined,
      'compressed',
    ).toString('hex');
    if (normalized !== compressedPubKeyHex) {
      throw new Error('noncanonical compressed key');
    }
  } catch {
    throw new Error(`${label} must contain a valid canonical secp256k1 public key`);
  }

  return compressedPubKeyHex;
}
