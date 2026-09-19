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

export interface SubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1 {
  readonly schema: 'e2s.substrate-federated-isolated-devnet-native-continuation-mining-authority.v1';
  readonly version: 1;
}

interface ContinuationAuthorityState {
  readonly publicKeyHex: string;
  readonly setupTarget: object;
  readonly confirmationTarget: object;
  readonly assertCustody: () => void;
  readonly checkpointMiningCredential: Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly trackerAdmissionMiningCredential: Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly trackerConfirmationMiningCredential: Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  claimed: boolean;
  revoked: boolean;
}

const CONTINUATION_AUTHORITIES = new WeakMap<object, ContinuationAuthorityState>();

/** Internal setup issuer. The three fresh tokens never replace consumed tokens. */
export function issueSubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1(input: Readonly<{
  mnemonic: string;
  publicKeyHex: string;
  setupTarget: object;
  confirmationTarget: object;
  assertCustody: () => void;
}>): Readonly<SubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1> {
  const mnemonic = validMnemonic(input.mnemonic);
  const publicKeyHex = compressedPublicKey(input.publicKeyHex);
  if (input.setupTarget === null || typeof input.setupTarget !== 'object'
    || input.confirmationTarget === null || typeof input.confirmationTarget !== 'object'
    || input.setupTarget === input.confirmationTarget || typeof input.assertCustody !== 'function') {
    throw new Error('native continuation mining authority requires distinct parent targets and custody');
  }
  input.assertCustody();
  const token = Object.freeze({
    schema: 'e2s.substrate-federated-isolated-devnet-native-continuation-mining-authority.v1' as const,
    version: 1 as const,
  });
  CONTINUATION_AUTHORITIES.set(token, {
    publicKeyHex, setupTarget: input.setupTarget, confirmationTarget: input.confirmationTarget,
    assertCustody: input.assertCustody,
    checkpointMiningCredential: issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(mnemonic, publicKeyHex),
    trackerAdmissionMiningCredential: issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(mnemonic, publicKeyHex),
    trackerConfirmationMiningCredential: issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(mnemonic, publicKeyHex),
    claimed: false, revoked: false,
  });
  return token;
}

/** Internal process consumer. A failed claim also destroys the fresh triplet. */
export function claimSubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1(
  authority: Readonly<SubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1>,
  publicKeyHex: string,
  setupTarget: object,
  confirmationTarget: object,
) {
  const retained = CONTINUATION_AUTHORITIES.get(authority);
  if (retained === undefined || retained.claimed || retained.revoked) {
    throw new Error('native continuation mining authority is absent, claimed, or revoked');
  }
  retained.claimed = true;
  const assertCustody = () => {
    if (retained.revoked) throw new Error('native continuation mining authority is revoked');
    retained.assertCustody();
  };
  try {
    if (retained.publicKeyHex !== compressedPublicKey(publicKeyHex)
      || retained.setupTarget !== setupTarget || retained.confirmationTarget !== confirmationTarget) {
      throw new Error('native continuation mining authority parent or signer differs');
    }
    assertCustody();
    for (const credential of [retained.checkpointMiningCredential,
      retained.trackerAdmissionMiningCredential, retained.trackerConfirmationMiningCredential]) {
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential, publicKeyHex);
    }
    return Object.freeze({ checkpointMiningCredential: retained.checkpointMiningCredential,
      trackerAdmissionMiningCredential: retained.trackerAdmissionMiningCredential,
      trackerConfirmationMiningCredential: retained.trackerConfirmationMiningCredential,
      assertCustody });
  } catch (error) {
    revokeSubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1(authority);
    throw error;
  }
}

export function revokeSubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1(
  authority: Readonly<SubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1>,
): void {
  const retained = CONTINUATION_AUTHORITIES.get(authority);
  if (retained === undefined) return;
  retained.revoked = true;
  for (const credential of [retained.checkpointMiningCredential,
    retained.trackerAdmissionMiningCredential, retained.trackerConfirmationMiningCredential]) {
    revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential);
  }
  CONTINUATION_AUTHORITIES.delete(authority);
}

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
