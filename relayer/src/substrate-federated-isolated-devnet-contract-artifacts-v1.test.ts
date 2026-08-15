import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance,
  collectSubstrateFederatedIsolatedDevnetContractArtifactsV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-contract-artifacts-v1.js';

describe('isolated-devnet contract artifact collection', () => {
  it('collects the four exact reviewed templates as immutable source text', () => {
    const result =
      collectSubstrateFederatedIsolatedDevnetContractArtifactsV1();

    assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance(
      result,
    );
    expect(result.receipt.schema).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V1_SCHEMA,
    );
    expect(result.receipt.status).toBe(
      'exact_reviewed_contract_templates_collected',
    );
    expect(Object.keys(result.templates)).toEqual([
      'tracker',
      'duplicatePrevention',
      'sourceLock',
      'pooledReserve',
    ]);
    expect(result.receipt.artifacts).toEqual({
      tracker: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
        sizeBytes: 13_865,
        sha256Hex:
          '8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852',
      },
      duplicatePrevention: {
        relativePath:
          'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
        sizeBytes: 17_657,
        sha256Hex:
          'a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f',
      },
      sourceLock: {
        relativePath: 'contracts/MainChainLockPooledReserveV6.es',
        sizeBytes: 6_401,
        sha256Hex:
          'f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b',
      },
      pooledReserve: {
        relativePath:
          'contracts/MainChainPooledReserveValidityApplicationV6.es',
        sizeBytes: 9_953,
        sha256Hex:
          '44f8bf015c301b3fe478764cfc2b841a026b9727a71fa0c4d5a60309894d67f5',
      },
    });
    for (const [role, source] of Object.entries(result.templates)) {
      const identity = result.receipt.artifacts[
        role as keyof typeof result.receipt.artifacts
      ];
      expect(source).toMatch(/\n$/u);
      expect(source).not.toContain('\r');
      expect(Buffer.byteLength(source, 'utf8')).toBe(identity.sizeBytes);
      expect(sha256(Buffer.from(source, 'utf8'))).toBe(identity.sha256Hex);
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.templates)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(result.receipt.boundaries).toMatchObject({
      compilerExecuted: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
  });

  it('does not transfer process provenance through serialization', () => {
    const result =
      collectSubstrateFederatedIsolatedDevnetContractArtifactsV1();

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance(
        structuredClone(result),
      )
    ).toThrow(/lack process provenance/u);
  });
});

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
