import { Mnemonic } from 'ethers';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINING_CREDENTIAL_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-mining-credential.v1' as const;

interface CredentialState {
  readonly mnemonic: string;
  readonly publicKeyHex: string;
}

export interface SubstrateFederatedIsolatedDevnetMiningCredentialV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINING_CREDENTIAL_V1_SCHEMA;
  readonly version: 1;
}

const CREDENTIALS = new WeakMap<object, CredentialState>();

/** Internal one-shot handoff. The token never contains or serializes the phrase. */
export function issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
  mnemonicValue: string,
  publicKeyValue: string,
): Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> {
  const mnemonic = validMnemonic(mnemonicValue);
  const publicKeyHex = compressedPublicKey(publicKeyValue);
  const token = Object.freeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINING_CREDENTIAL_V1_SCHEMA,
    version: 1 as const,
  });
  CREDENTIALS.set(token, Object.freeze({ mnemonic, publicKeyHex }));
  return token;
}

export function assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
  value: unknown,
  expectedPublicKeyValue: string,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !CREDENTIALS.has(value)
  ) {
    throw new Error('isolated mining credential is absent, consumed, or revoked');
  }
  const credential = value as SubstrateFederatedIsolatedDevnetMiningCredentialV1;
  if (
    credential.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINING_CREDENTIAL_V1_SCHEMA
    || credential.version !== 1
    || Object.keys(credential).sort().join(',') !== 'schema,version'
  ) {
    throw new Error('isolated mining credential token shape differs from V1');
  }
  const expectedPublicKeyHex = compressedPublicKey(expectedPublicKeyValue);
  if (CREDENTIALS.get(value)!.publicKeyHex !== expectedPublicKeyHex) {
    throw new Error('isolated mining credential differs from the setup signer');
  }
}

export function consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
  value: Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
  expectedPublicKeyValue: string,
  action: (mnemonic: string) => void,
): void {
  assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
    value,
    expectedPublicKeyValue,
  );
  if (typeof action !== 'function') {
    throw new Error('isolated mining credential consumer is required');
  }
  const state = CREDENTIALS.get(value)!;
  CREDENTIALS.delete(value);
  let mnemonic = state.mnemonic;
  try {
    const result = action(mnemonic);
    if (result !== undefined) {
      throw new Error('isolated mining credential consumer must return void');
    }
  } finally {
    mnemonic = '';
  }
}

export function revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
  value: Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
): void {
  CREDENTIALS.delete(value);
}

function validMnemonic(value: string): string {
  if (typeof value !== 'string' || !Mnemonic.isValidMnemonic(value)) {
    throw new Error('isolated mining credential requires a valid mnemonic');
  }
  return value;
}

function compressedPublicKey(value: string): string {
  if (
    typeof value !== 'string'
    || !/^(?:02|03)[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error('isolated mining credential public key must be compressed');
  }
  return value;
}
