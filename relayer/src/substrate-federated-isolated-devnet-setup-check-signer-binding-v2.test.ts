import { describe, expect, it } from 'vitest';

import {
  issueSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  type SubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance,
  registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
  revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';

const MNEMONIC =
  'test test test test test test test test test test test junk';
const PUBLIC_KEY_HEX =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const OTHER_PUBLIC_KEY_HEX =
  '02c6047f9441ed7d6d3045406e95c07cd85a778e4b8cef3ca7abac09b95c709ee5';

describe('isolated setup-check signer binding V2', () => {
  it('rejects structurally valid provenance without an issued credential', () => {
    const forgedCredential = Object.freeze({
      schema: 'e2s.substrate-federated-isolated-devnet-mining-credential.v1',
      version: 1 as const,
    }) as Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;

    expect(() =>
      registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2(
        signerBinding(PUBLIC_KEY_HEX),
        forgedCredential,
      )
    ).toThrow(/credential is absent, consumed, or revoked/);
  });

  it('binds exact signer provenance and revokes it independently', () => {
    const credential =
      issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        MNEMONIC,
        PUBLIC_KEY_HEX,
      );
    try {
      const binding =
        registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2(
          signerBinding(PUBLIC_KEY_HEX),
          credential,
        );
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(
          binding,
        )
      ).not.toThrow();
      revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2(binding);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(
          binding,
        )
      ).toThrow(/lacks active process provenance/);
    } finally {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential);
    }
  });

  it('rejects a credential issued for another signer', () => {
    const credential =
      issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        MNEMONIC,
        PUBLIC_KEY_HEX,
      );
    try {
      expect(() =>
        registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2(
          signerBinding(OTHER_PUBLIC_KEY_HEX),
          credential,
        )
      ).toThrow(/credential differs from the setup signer/);
    } finally {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential);
    }
  });
});

function signerBinding(publicKeyHex: string) {
  return Object.freeze({
    publicKeyHex,
    p2pkErgoTreeHex: `0008cd${publicKeyHex}`,
    rewardInputErgoTrees: Object.freeze({
      delay1: '00',
      delay720: '00',
    }),
    networkPrefix: 16 as const,
  });
}
