import { describe, expect, it } from 'vitest';

import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  buildFederatedPooledReserveSourceProofProfileV1,
  encodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1,
  assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Provenance,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
const ERGO_ADMISSION_PUBLIC_KEY_HEX = `02${'11'.repeat(32)}`;

describe('isolated-devnet source-attestation campaign session V1', () => {
  it('binds one fresh key set to distinct launch and FED-1 profiles', () => {
    const session = sessionV1();
    const other = sessionV1();
    const { binding } = session;

    expect(binding.sourceAttestationPublicKeysHex).toHaveLength(3);
    expect(binding.sourceAttestationPublicKeysHex).toEqual(
      [...binding.sourceAttestationPublicKeysHex].sort(),
    );
    expect(binding.checkpointSourceAttestationKeySetDigestHex).not.toBe(
      binding.federatedMintProfile.sourceAttestationKeySetDigestHex,
    );
    expect(binding.federatedMintProfile.signerPublicKeysHex).toEqual(
      binding.sourceAttestationPublicKeysHex.map(value => `0x${value}`),
    );
    expect(binding.federatedMintProfileScaleHex).toBe(
      encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
        {
          federationEpoch: binding.federatedMintProfile.federationEpoch,
          threshold: binding.federatedMintProfile.threshold,
          signerPublicKeysHex:
            binding.federatedMintProfile.signerPublicKeysHex,
          maxValidityBlocks:
            binding.federatedMintProfile.maxValidityBlocks,
          verifierProfileIdHex:
            binding.federatedMintProfile.verifierProfileIdHex,
        },
      ),
    );
    expect(binding.boundaries.runtimeProviderCompiled).toBe(false);
    expect(binding.boundaries.mintExecuted).toBe(false);
    expect(structuredClone(binding)).toEqual(binding);
    expect(binding).not.toHaveProperty('privateKey');
    expect(binding.federatedMintProfile).not.toHaveProperty('privateKey');
    expect(other.binding.sourceAttestationPublicKeysHex).not.toEqual(
      binding.sourceAttestationPublicKeysHex,
    );
    expect(other.binding.federatedMintProfile.proofProfileIdHex).not.toBe(
      binding.federatedMintProfile.proofProfileIdHex,
    );
    assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Provenance(
      session,
    );

    session.dispose();
    other.dispose();
  });

  it('rejects unproven launch objects and exposes no raw or mint signer', () => {
    const session = sessionV1();
    expect(session).not.toHaveProperty('signLaunch');
    expect(session).not.toHaveProperty('signMintResult');
    expect(() => session.signLaunchStatement(Object.freeze({}) as never))
      .toThrow(/launch statement lacks process provenance/);
    session.dispose();
  });

  it('loses all signing capability on disposal and rejects cloned provenance', () => {
    const session = sessionV1();
    session.dispose();
    expect(() => session.signLaunchStatement(Object.freeze({}) as never))
      .toThrow(/disposed/);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Provenance(
        structuredClone(session.binding),
      )).toThrow(/lacks provenance/);
  });

  it('preserves the exact public reference profile as a compatibility wrapper', () => {
    const profile = buildFederatedPooledReserveSourceProofProfileV1({
      federationEpoch:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
      threshold: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1,
      signerPublicKeysHex:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
      maxValidityBlocks:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
      verifierProfileIdHex:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
    });

    expect(profile.proofProfileIdHex).toBe(
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    );
    expect(() => buildFederatedPooledReserveSourceProofProfileV1({
      federationEpoch: 1,
      threshold: 2,
      signerPublicKeysHex: [...profile.signerPublicKeysHex].reverse(),
      maxValidityBlocks: 64,
      verifierProfileIdHex: profile.verifierProfileIdHex,
    })).toThrow(/not canonical/);
  });
});

function sessionV1() {
  return createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1({
    ergoAdmissionThreshold: 1,
    ergoAdmissionPublicKeysHex: [ERGO_ADMISSION_PUBLIC_KEY_HEX],
  });
}
