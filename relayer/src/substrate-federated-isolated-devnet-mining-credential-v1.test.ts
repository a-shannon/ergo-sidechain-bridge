import { describe, expect, it, vi } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  issueSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  issueSubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1 as issueContinuation,
  claimSubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1 as claimContinuation,
  revokeSubstrateFederatedIsolatedDevnetNativeContinuationMiningAuthorityV1 as revokeContinuation,
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

describe('native continuation mining authority', () => {
  function fixture() {
    const setupTarget = Object.freeze({ phase: 'setup' });
    const confirmationTarget = Object.freeze({ phase: 'confirmation' });
    let live = true;
    const assertCustody = vi.fn(() => { if (!live) throw new Error('synthetic custody expired'); });
    const authority = issueContinuation({ mnemonic: MNEMONIC, publicKeyHex: PUBLIC_KEY_HEX,
      setupTarget, confirmationTarget, assertCustody });
    return { setupTarget, confirmationTarget, authority, assertCustody,
      dispose: () => { live = false; },
      claim: () => claimContinuation(authority, PUBLIC_KEY_HEX, setupTarget, confirmationTarget) };
  }

  it('hands a distinct triplet to its exact owner once without serializing secrets or targets', () => {
    const f = fixture();
    expect(Object.keys(f.authority).sort()).toEqual(['schema', 'version']);
    expect(JSON.stringify(f.authority)).not.toContain(MNEMONIC);
    const batch = f.claim();
    const credentials = [batch.checkpointMiningCredential, batch.trackerAdmissionMiningCredential,
      batch.trackerConfirmationMiningCredential];
    expect(new Set(credentials).size).toBe(3);
    expect(() => f.claim()).toThrow(/claimed/);
    for (const credential of credentials) {
      const action = vi.fn((mnemonic: string) => { expect(mnemonic).toBe(MNEMONIC); });
      consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential, PUBLIC_KEY_HEX, action);
      expect(action).toHaveBeenCalledOnce();
      expect(() => consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential, PUBLIC_KEY_HEX,
        () => undefined)).toThrow(/consumed/);
    }
    expect(batch.assertCustody).not.toThrow();
    f.dispose();
    expect(batch.assertCustody).toThrow(/custody expired/);
    revokeContinuation(f.authority);
  });

  it.each(['setup', 'confirmation', 'signer', 'custody'] as const)(
    'destroys the triplet after a mismatched first claim: %s', fault => {
      const f = fixture();
      if (fault === 'custody') f.dispose();
      expect(() => claimContinuation(f.authority, fault === 'signer' ? `03${'11'.repeat(32)}` : PUBLIC_KEY_HEX,
        fault === 'setup' ? { ...f.setupTarget } : f.setupTarget,
        fault === 'confirmation' ? { ...f.confirmationTarget } : f.confirmationTarget))
        .toThrow(fault === 'custody' ? /custody expired/ : /parent or signer differs/);
      expect(() => f.claim()).toThrow(/absent, claimed, or revoked/);
    },
  );

  it('rejects a copied authority without consuming the original', () => {
    const f = fixture();
    expect(() => claimContinuation({ ...f.authority }, PUBLIC_KEY_HEX, f.setupTarget, f.confirmationTarget))
      .toThrow(/absent/);
    expect(() => f.claim()).not.toThrow();
    revokeContinuation(f.authority);
  });

  it.each(['before claim', 'after claim', 'after checkpoint', 'after admission'] as const)(
    'revokes every remaining credential and retained custody: %s', point => {
      const f = fixture();
      if (point === 'before claim') {
        revokeContinuation(f.authority);
        expect(() => f.claim()).toThrow(/revoked/);
        return;
      }
      const batch = f.claim();
      if (point !== 'after claim') consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        batch.checkpointMiningCredential, PUBLIC_KEY_HEX, () => undefined);
      if (point === 'after admission') consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        batch.trackerAdmissionMiningCredential, PUBLIC_KEY_HEX, () => undefined);
      revokeContinuation(f.authority);
      expect(batch.assertCustody).toThrow(/revoked/);
      for (const credential of [batch.checkpointMiningCredential, batch.trackerAdmissionMiningCredential,
        batch.trackerConfirmationMiningCredential]) {
        expect(() => assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential, PUBLIC_KEY_HEX))
          .toThrow(/consumed, or revoked/);
      }
    },
  );
});
