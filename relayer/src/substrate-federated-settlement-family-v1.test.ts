import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_BYTES,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS,
  buildSubstrateFederatedSettlementFamilyV1CompilerRequest,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  resolveSubstrateFederatedSettlementFamilyV1Sources,
  validateSubstrateFederatedSettlementFamilyV1CompilerBatch,
} from './substrate-federated-settlement-family-v1.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerFixture,
  buildSubstrateFederatedSettlementFamilyV1CompilerFixtureInput,
} from './substrate-federated-settlement-family-v1-fixture.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_CONTRACT_IDS,
} from './validity-application-pooled-reserve-burn-family-v6.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const REQUEST_PATH = resolve(
  BRIDGE_ROOT,
  'relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-request.json',
);
const BATCH_PATH = resolve(
  BRIDGE_ROOT,
  'relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json',
);

describe('substrate federated settlement family V1', () => {
  test('freezes one semantic profile and exact three-contract compiler family', () => {
    const request = buildSubstrateFederatedSettlementFamilyV1CompilerFixture();
    expect(request).toEqual(readJson(REQUEST_PATH));
    expect(request.profile.encodedProfileHex.length / 2)
      .toBe(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_BYTES);
    expect(request.profile.familyIdHex)
      .toBe('fc4ef41f900e0801c56183999056ef739c4cce29dab9a7c7129ecaf49c76e6e8');

    const identity =
      validateSubstrateFederatedSettlementFamilyV1CompilerBatch({
        request,
        compilerBatchJson: readFileSync(BATCH_PATH, 'ascii'),
      });
    expect(identity.compilerBatchSha256Hex)
      .toBe(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX);
    expect(decodeSubstrateFederatedSettlementFamilyV1Profile(identity.profile))
      .toEqual({
        version: 1,
        hashAlgorithmId: 1,
        settlementAssetProfileId: 1,
        flags: 0,
        sourceNetworkIdHex: request.tracker.sourceNetworkIdHex,
        sidechainIdHex: request.tracker.sidechainIdHex,
        bridgeAddressHex: request.tracker.bridgeAddressHex,
        tokenAddressHex: request.tracker.tokenAddressHex,
        runtimeProfileIdHex: request.tracker.runtimeProfileIdHex,
        settlementProfileIdHex: request.tracker.settlementProfileIdHex,
        federationProfileIdHex: request.tracker.federationProfileIdHex,
        sourceAttestationKeySetDigestHex:
          request.tracker.sourceAttestationKeySetDigestHex,
        sourceAttestationThreshold:
          request.tracker.sourceAttestationThreshold,
        ergoAdmissionKeySetDigestHex:
          request.tracker.ergoAdmissionKeySetDigestHex,
        ergoAdmissionThreshold: request.tracker.ergoAdmissionThreshold,
        federationEpoch: request.tracker.federationEpoch,
        trackerNftIdHex: request.tracker.trackerNftIdHex,
        duplicatePreventionNftIdHex:
          request.profile.duplicatePreventionNftIdHex,
        pooledReserveNftIdHex: request.profile.pooledReserveNftIdHex,
        trackerContractIdHex: request.tracker.contractIdHex,
        trackerTemplateSourceSha256Hex:
          request.tracker.templateSourceSha256Hex,
        duplicatePreventionTemplateSha256Hex:
          request.contracts[0].templateSha256Hex,
        sourceLockTemplateSha256Hex: request.contracts[1].templateSha256Hex,
        pooledReserveTemplateSha256Hex:
          request.contracts[2].templateSha256Hex,
        sourceRefundDelayBlocks: request.policies.sourceRefundDelayBlocks,
        minimumAnchorConfirmations:
          request.policies.minimumAnchorConfirmations,
        maximumSuccessorCreationHeightLag:
          request.policies.maximumSuccessorCreationHeightLag,
        minimumExternalFeeNanoErg:
          request.policies.minimumExternalFeeNanoErg,
        maximumExternalFeeNanoErg:
          request.policies.maximumExternalFeeNanoErg,
        settlementAssetIdHex: request.policies.settlementAssetIdHex,
      });
    expect(Object.fromEntries(
      Object.entries(identity.contracts).map(([role, contract]) => [
        role,
        contract.receipt.contractIdHex,
      ]),
    )).toEqual(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS);
    const resolvedSources =
      resolveSubstrateFederatedSettlementFamilyV1Sources(request);
    for (const [role, source] of Object.entries(resolvedSources)) {
      expect(source).not.toMatch(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/);
      expect(identity.contracts[
        role as keyof typeof identity.contracts
      ].resolvedSourceSha256Hex).toBe(
        createHash('sha256').update(source, 'ascii').digest('hex'),
      );
    }
    expect(identity.semanticDelta).toEqual({
      federatedTrackerKeyAndValueConsumed: true,
      federatedTrackerAuthorityBound: true,
      burnLeafV1Preserved: true,
      settlementBundleV2Preserved: true,
      soleDuplicatePreventionAuthorityPreserved: true,
      nativeErgConservationPreserved: true,
      exactPayoutBindingPreserved: true,
      externalFeeFundingPreserved: true,
      sourceLockCommitRefundExclusivityPreserved: true,
      sourceLockTemplateReusedByteForByte: true,
      pooledReserveTemplateReusedByteForByte: true,
      frozenV6ContractIdentitiesReused: false,
    });
    const v6ContractIds = new Set<string>(Object.values(
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_CONTRACT_IDS,
    ));
    expect(Object.values(
      SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS,
    ).some(contractId => v6ContractIds.has(contractId))).toBe(false);
    expect(Object.values(identity.boundaries).every(value => value === false))
      .toBe(true);
  });

  test('changes family identity for every authority or template input drift', () => {
    const baselineInput =
      buildSubstrateFederatedSettlementFamilyV1CompilerFixtureInput();
    const baseline =
      buildSubstrateFederatedSettlementFamilyV1CompilerRequest(baselineInput);
    for (const input of [
      {
        ...baselineInput,
        tracker: {
          ...baselineInput.tracker,
          contractIdHex: 'aa'.repeat(32),
        },
      },
      {
        ...baselineInput,
        tracker: {
          ...baselineInput.tracker,
          sourceAttestationKeySetDigestHex: 'ab'.repeat(32),
        },
      },
      {
        ...baselineInput,
        tracker: {
          ...baselineInput.tracker,
          ergoAdmissionThreshold: 1,
        },
      },
      {
        ...baselineInput,
        templates: {
          ...baselineInput.templates,
          sourceLock: {
            ...baselineInput.templates.sourceLock,
            source: `${baselineInput.templates.sourceLock.source}\n`,
          },
        },
      },
    ]) {
      const candidate =
        buildSubstrateFederatedSettlementFamilyV1CompilerRequest(input);
      expect(candidate.profile.familyIdHex)
        .not.toBe(baseline.profile.familyIdHex);
    }
  });

  test('rejects singleton collisions, template aliases and forged provenance', () => {
    const input =
      buildSubstrateFederatedSettlementFamilyV1CompilerFixtureInput();
    expect(() => buildSubstrateFederatedSettlementFamilyV1CompilerRequest({
      ...input,
      duplicatePreventionGenesisInputBoxIdHex:
        input.tracker.trackerNftIdHex,
    })).toThrow(/pairwise distinct/);
    expect(() => buildSubstrateFederatedSettlementFamilyV1CompilerRequest({
      ...input,
      templates: {
        ...input.templates,
        sourceLock: {
          ...input.templates.sourceLock,
          relativePath: input.templates.pooledReserve.relativePath,
        },
      },
    })).toThrow(/template path/);
    expect(() => validateSubstrateFederatedSettlementFamilyV1CompilerBatch({
      request: {
        ...buildSubstrateFederatedSettlementFamilyV1CompilerFixture(),
      },
      compilerBatchJson: readFileSync(BATCH_PATH, 'ascii'),
    })).toThrow(/same-process provenance/);
    const profile =
      buildSubstrateFederatedSettlementFamilyV1CompilerFixture().profile;
    expect(() => decodeSubstrateFederatedSettlementFamilyV1Profile({
      ...profile,
      encodedProfileHex: profile.encodedProfileHex.toUpperCase(),
    })).toThrow(/profile is invalid/i);
    expect(() => decodeSubstrateFederatedSettlementFamilyV1Profile({
      ...profile,
      duplicatePreventionNftIdHex: 'ff'.repeat(32),
    })).toThrow(/bindings are invalid/i);
  });

  test('keeps V6 source-lock and reserve templates exact while replacing DUP semantics', () => {
    const request = buildSubstrateFederatedSettlementFamilyV1CompilerFixture();
    expect(request.contracts).toEqual([
      expect.objectContaining({
        role: 'duplicatePrevention',
        relativePath:
          'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
      }),
      {
        role: 'sourceLock',
        relativePath: 'contracts/MainChainLockPooledReserveV6.es',
        templateSha256Hex:
          'f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b',
      },
      {
        role: 'pooledReserve',
        relativePath:
          'contracts/MainChainPooledReserveValidityApplicationV6.es',
        templateSha256Hex:
          '44f8bf015c301b3fe478764cfc2b841a026b9727a71fa0c4d5a60309894d67f5',
      },
    ]);
    const dup = readFileSync(
      resolve(
        BRIDGE_ROOT,
        'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
      ),
      'ascii',
    );
    expect(dup).toContain('E2S_SPV_SUBSTRATE_FEDERATED_KEY_V1');
    expect(dup).toContain('E2S_SPV_SUBSTRATE_FEDERATED_VALUE_V1');
    expect(dup).not.toContain('E2S_SPV_VALIDITY_APPLICATION_VALUE_V5');
    expect(dup).not.toContain('TRUST_ANCHOR');
  });
});

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'ascii'));
}
