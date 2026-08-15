import { describe, expect, it, vi } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  issueSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';

const MNEMONIC =
  'test test test test test test test test test test test junk';
const PUBLIC_KEY_HEX =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

describe('isolated devnet mining credential V1', () => {
  it('hands one phrase to one exact public-key consumer without serializing it', () => {
    const credential = issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
      MNEMONIC,
      PUBLIC_KEY_HEX,
    );
    expect(JSON.stringify(credential)).not.toContain('test');
    expect(Object.keys(credential).sort()).toEqual(['schema', 'version']);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        credential,
        PUBLIC_KEY_HEX,
      )
    ).not.toThrow();

    const consume = vi.fn((mnemonic: string) => {
      expect(mnemonic).toBe(MNEMONIC);
    });
    consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
      credential,
      PUBLIC_KEY_HEX,
      consume,
    );
    expect(consume).toHaveBeenCalledTimes(1);
    expect(() =>
      consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        credential,
        PUBLIC_KEY_HEX,
        () => undefined,
      )
    ).toThrow(/consumed, or revoked/);
  });

  it('rejects signer drift, malformed consumers, and revoked credentials', () => {
    const wrongKey = `03${'11'.repeat(32)}`;
    const credential = issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
      MNEMONIC,
      PUBLIC_KEY_HEX,
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        credential,
        wrongKey,
      )
    ).toThrow(/differs from the setup signer/);
    expect(() =>
      consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        credential,
        PUBLIC_KEY_HEX,
        (() => 'leak') as unknown as () => void,
      )
    ).toThrow(/must return void/);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        credential,
        PUBLIC_KEY_HEX,
      )
    ).toThrow(/consumed, or revoked/);

    const revoked = issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
      MNEMONIC,
      PUBLIC_KEY_HEX,
    );
    revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(revoked);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        revoked,
        PUBLIC_KEY_HEX,
      )
    ).toThrow(/consumed, or revoked/);
  });
});
