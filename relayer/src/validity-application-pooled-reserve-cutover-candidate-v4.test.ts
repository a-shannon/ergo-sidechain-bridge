import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock(
  './validity-application-pooled-reserve-instance-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('./validity-application-pooled-reserve-instance-v4.js')
    >(),
    assertCompiledValidityApplicationPooledReserveInstanceV4Candidate:
      vi.fn(),
  }),
);
vi.mock(
  './pooled-reserve-mint-reservation-runtime-profile-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './pooled-reserve-mint-reservation-runtime-profile-v4.js'
      )
    >(),
    assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance:
      vi.fn(),
  }),
);
vi.mock(
  './validity-application-pooled-reserve-historical-replay-genesis-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-historical-replay-genesis-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance:
      vi.fn(),
  }),
);
vi.mock(
  './validity-application-pooled-reserve-provisioning-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-provisioning-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveProvisioningV4Packet: vi.fn(),
  }),
);

import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
  assertValidityApplicationPooledReserveCutoverCandidateV4Provenance,
  buildValidityApplicationPooledReserveCutoverCandidateV4,
  type BuildValidityApplicationPooledReserveCutoverCandidateV4Input,
  type LegacyRouteRetirementDeclarationV4,
} from './validity-application-pooled-reserve-cutover-candidate-v4.js';

const LINEAGE_PROFILE_ID = '11'.repeat(32);
const ENCODED_LINEAGE_PROFILE = `0x${'12'.repeat(468)}`;
const APPLICATION_BINDING = `0x${'13'.repeat(603)}`;
const APPLICATION_BINDING_DIGEST = '14'.repeat(32);
const RUNTIME_PROFILE_SCALE = `0x${'1a'.repeat(349)}`;
const BURN_APPLICATION_BINDING = '1b'.repeat(485);
const BURN_APPLICATION_BINDING_DIGEST = '1c'.repeat(32);
const SOURCE_ADMISSION_POLICY_ID = '15'.repeat(32);
const RUNTIME_PROFILE_ID = '16'.repeat(32);
const SOURCE_RUNTIME_CODE_SHA256 = '64'.repeat(32);
const SOURCE_RUNTIME_CODE_BYTES = 1_048_576;
const HISTORICAL_REPLAY_GENESIS_PACKET_DIGEST = '17'.repeat(32);
const CUTOVER_OBSERVATION_REPORT_DIGEST = '19'.repeat(32);
const DUP_DIGEST = '18'.repeat(33);
const DUP_REGISTERS = Object.freeze({
  R4: `0e20${LINEAGE_PROFILE_ID}`,
  R5: `64${DUP_DIGEST}01200101`,
});
const CONTRACT_IDS = Object.freeze({
  tracker: '21'.repeat(32),
  duplicatePrevention: '22'.repeat(32),
  sourceLock: '23'.repeat(32),
  pooledReserve: '24'.repeat(32),
});

describe('pooled-reserve V4 cutover candidate', () => {
  it('binds one deterministic frozen package while retaining every authority boundary false', () => {
    const input = fixture();
    const forward =
      buildValidityApplicationPooledReserveCutoverCandidateV4(input);
    const reversed =
      buildValidityApplicationPooledReserveCutoverCandidateV4({
        ...input,
        legacyRouteDeclarations:
          [...input.legacyRouteDeclarations].reverse(),
      });

    expect(reversed).toEqual(forward);
    expect(reversed.candidateDigestHex).toBe(forward.candidateDigestHex);
    expect(forward.activationParent.nativeHeight).toBe('499');
    expect(forward.application.contractIds).toEqual(CONTRACT_IDS);
    expect(forward.application).toMatchObject({
      runtimeProfileScaleHex: RUNTIME_PROFILE_SCALE.slice(2),
      sourceRuntimeBindingDigestHex: APPLICATION_BINDING_DIGEST,
      burnApplicationBindingHex: BURN_APPLICATION_BINDING,
      applicationBindingDigestHex: BURN_APPLICATION_BINDING_DIGEST,
    });
    expect(forward.replayCutover).toEqual({
      historicalReplayGenesisPacketDigestHex:
        HISTORICAL_REPLAY_GENESIS_PACKET_DIGEST,
      cutoverObservationReportDigestHex: CUTOVER_OBSERVATION_REPORT_DIGEST,
      provisioningDuplicatePreventionDigestHex: DUP_DIGEST,
      importedCanonicalBurnIdCount: 2,
      importedHistoricalLineageCount: 8,
      allObservedHistoricalLineagesComposed: true,
      allHistoricalLineagesImported: false,
    });
    expect(forward.legacyRouteRetirement.requirementCount)
      .toBe(
        VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.length,
      );
    expect(forward.legacyRouteRetirement.declarationsAuthenticated)
      .toBe(false);
    expect(forward.legacyRouteRetirement.routesRetired).toBe(false);
    expect(Object.values(forward.authority).every(value => value === false))
      .toBe(true);
    expect(isRecursivelyFrozen(forward)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveCutoverCandidateV4Provenance(
        forward,
      )
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveCutoverCandidateV4Provenance(
        structuredClone(forward),
      )
    ).toThrow(/not built in this process/);
  });

  it('classifies timeout, federated, and reserved validity routes without collapsing their authorities', () => {
    const bySurface = new Map(
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.map(
        requirement => [requirement.sourceSurface, requirement],
      ),
    );

    expect(bySurface.get('contracts/MainChainLock.es')?.historicalAuthority)
      .toBe('committee-or-depositor-timeout');
    expect(bySurface.get('contracts/MainChainUnlock.es')?.historicalAuthority)
      .toBe('committee');
    expect(bySurface.get('contracts/SideChainState.es')?.historicalAuthority)
      .toBe('committee');
    expect(
      bySurface.get('contracts/SPVTrackerAuthenticated.es')
        ?.historicalAuthority,
    ).toBe('r9-and-anchor-miner');
    expect(bySurface.get('contracts/SPVTrackerValidityV1.es')
      ?.historicalAuthority).toBe('reserved-validity-proof');
    expect(
      bySurface.get('contracts/MainChainCausalVaultValidityV1.es')
        ?.historicalAuthority,
    ).toBe('reserved-validity-proof');
    expect(
      bySurface.get('contracts/DoubleUnlockPreventionValidityV1.es')
      ?.historicalAuthority,
    ).toBe('reserved-validity-proof');
  });

  it('tracks every reviewed Frontier authority route and keeps Root mutation separate from V1 production', () => {
    const frontierRoutes =
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
        .filter(requirement => requirement.layer === 'frontier');

    expect(frontierRoutes.map(requirement => requirement.routeId).sort())
      .toEqual([
        'frontier-ergo-bridge-emergency-pause-v1',
        'frontier-ergo-bridge-fee-withdrawal-v1',
        'frontier-ergo-bridge-owner-mint-v1',
        'frontier-ergo-bridge-peg-out-v1',
        'frontier-ergo-bridge-renounce-ownership-v1',
        'frontier-ergo-bridge-state-update-v1',
        'frontier-ergo-bridge-transfer-ownership-v1',
        'frontier-ergo-bridge-unpause-v1',
        'frontier-root-bridge-address-mutation-v1',
        'frontier-serg-bridge-burn-v1',
        'frontier-serg-owner-mint-v1',
        'frontier-serg-renounce-ownership-v1',
        'frontier-serg-transfer-ownership-v1',
        'frontier-v1-bridge-event-producer-v1',
      ]);
    expect(frontierRoutes.find(
      requirement =>
        requirement.routeId === 'frontier-ergo-bridge-peg-out-v1',
    )).toEqual(expect.objectContaining({
      routeClass: 'bridge-withdrawal',
      sourceSurface: 'solidity/ErgoBridge.sol::pegOut(uint256,bytes)',
      historicalAuthority: 'permissionless-caller',
      requiredDisposition: 'application-bind-or-remove',
    }));
    expect(frontierRoutes.find(
      requirement =>
        requirement.routeId === 'frontier-root-bridge-address-mutation-v1',
    )).toEqual(expect.objectContaining({
      routeClass: 'authority-mutation',
      sourceSurface:
        'sources/frontier/0001-bridge-runtime-commitment.patch::set_bridge_address',
      historicalAuthority: 'root-origin',
      requiredDisposition: 'freeze-authority',
    }));
    expect(frontierRoutes.find(
      requirement =>
        requirement.routeId === 'frontier-v1-bridge-event-producer-v1',
    )).toEqual(expect.objectContaining({
      routeClass: 'commitment-producer',
      sourceSurface:
        'sources/frontier/0001-bridge-runtime-commitment.patch::produce_commitment',
      historicalAuthority: 'selected-bridge-address',
      requiredDisposition: 'application-bind-or-remove',
    }));

    expect(frontierRoutes.find(
      requirement =>
        requirement.routeId === 'frontier-serg-bridge-burn-v1',
    )).toEqual(expect.objectContaining({
      routeClass: 'bridge-burn',
      historicalAuthority: 'token-owner-key',
      requiredDisposition: 'application-bind-or-remove',
    }));
  });

  it('covers every reviewed historical Ergo route contract in the source inventory', () => {
    const successorTargetContracts = new Set([
      'DoubleUnlockPreventionPooledReserveV5.es',
      'MainChainLockPooledReserveV5.es',
      'MainChainPooledReserveValidityApplicationV5.es',
      'SPVTrackerPooledReserveBurnSettlementV5.es',
      'DoubleUnlockPreventionPooledReserveV6.es',
      'MainChainLockPooledReserveV6.es',
      'MainChainPooledReserveValidityApplicationV6.es',
      'SPVTrackerPooledReserveBurnSettlementV6.es',
      'DoubleUnlockPreventionSubstrateFederatedV1.es',
      'SPVTrackerSubstrateFederatedV1.es',
    ]);
    const contractDirectory = resolve(
      import.meta.dirname,
      '..',
      '..',
      'contracts',
    );
    const reviewedHistoricalContracts = readdirSync(contractDirectory)
      .filter(name =>
        name === 'SideChainState.es'
        || /^(?:DoubleUnlockPrevention|MainChain|SPVTracker).*\.es$/.test(name)
      )
      .filter(name => !successorTargetContracts.has(name))
      .sort();
    const registeredHistoricalContracts =
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
        .filter(requirement =>
          requirement.layer === 'ergo'
          && requirement.sourceSurface.startsWith('contracts/')
        )
        .map(requirement => requirement.sourceSurface.slice('contracts/'.length))
        .sort();

    expect(registeredHistoricalContracts).toEqual(
      reviewedHistoricalContracts,
    );
  });

  it('classifies the Causal V2 payout pair by its composed R9/anchor authority', () => {
    const requirements =
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4;
    expect(requirements.find(requirement =>
      requirement.sourceSurface === 'contracts/MainChainCausalVaultV2.es'
    )).toEqual(expect.objectContaining({
      historicalAuthority: 'r9-and-anchor-miner',
      requiredDisposition: 'freeze-and-drain',
    }));
    expect(requirements.find(requirement =>
      requirement.sourceSurface === 'contracts/DoubleUnlockPreventionCausalV2.es'
    )).toEqual(expect.objectContaining({
      historicalAuthority: 'r9-and-anchor-miner',
      requiredDisposition: 'freeze-after-replay-import',
    }));
  });

  it('rejects stale, parentless, or mixed-profile activation declarations', () => {
    const input = fixture();
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      activationParent: {
        ...input.activationParent,
        nativeHeight: 498,
      },
    })).toThrow(/does not immediately precede activation/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      runtimeProfile: {
        ...input.runtimeProfile,
        profile: {
          ...input.runtimeProfile.profile,
          activationHeight: '0',
        },
      },
    })).toThrow(/activation height must have a parent/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      activationParent: {
        ...input.activationParent,
        sourceAdmissionPolicyIdHex: 'fe'.repeat(32),
      },
    })).toThrow(/another source-admission policy/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      activationParent: {
        ...input.activationParent,
        runtimeCodeSha256Hex: 'fe'.repeat(32),
      },
    })).toThrow(/another source runtime/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      activationParent: {
        ...input.activationParent,
        runtimeCodeBytes: SOURCE_RUNTIME_CODE_BYTES - 1,
      },
    })).toThrow(/another source runtime/);
  });

  it('rejects an application/profile mismatch or provisioning without the imported replay genesis', () => {
    const input = fixture();
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      runtimeProfile: {
        ...input.runtimeProfile,
        compiledBinding: {
          ...input.runtimeProfile.compiledBinding,
          contractIds: {
            ...input.runtimeProfile.compiledBinding.contractIds,
            tracker: 'fe'.repeat(32),
          },
        },
      },
    })).toThrow(/does not bind the exact compiled V4 application/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      runtimeProfile: {
        ...input.runtimeProfile,
        compiledBinding: {
          ...input.runtimeProfile.compiledBinding,
          burnApplicationBindingDigestHex: 'fd'.repeat(32),
        },
      },
    })).toThrow(/does not bind the exact compiled V4 application/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      provisioning: {
        ...input.provisioning,
        duplicatePreventionGenesis: {
          mode: 'empty-v4-lineage',
          historicalReplayGenesisPacketDigestHex: null,
          canonicalBurnIdCount: 0,
          digestHex: '00'.repeat(33),
        },
      },
    })).toThrow(/does not consume the historical replay genesis/);
  });

  it('rejects omitted, duplicate, unknown, wrong-disposition, or active legacy routes', () => {
    const input = fixture();
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      legacyRouteDeclarations: input.legacyRouteDeclarations.slice(1),
    })).toThrow(/declarations omit/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      legacyRouteDeclarations: [
        ...input.legacyRouteDeclarations,
        input.legacyRouteDeclarations[0],
      ],
    })).toThrow(/duplicate legacy route/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      legacyRouteDeclarations: [
        ...input.legacyRouteDeclarations,
        {
          ...input.legacyRouteDeclarations[0],
          routeId: 'unknown-route',
        },
      ],
    })).toThrow(/unknown legacy route/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      legacyRouteDeclarations: input.legacyRouteDeclarations.map(
        (entry, index) => index === 0
          ? { ...entry, declaredDisposition: 'freeze-and-drain' as const }
          : entry,
      ),
    })).toThrow(/wrong retirement disposition/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...input,
      legacyRouteDeclarations: input.legacyRouteDeclarations.map(
        (entry, index) => index === 0
          ? { ...entry, declaredStatus: 'active' as const }
          : entry,
      ),
    })).toThrow(/remains active/);
  });
});

function fixture():
  BuildValidityApplicationPooledReserveCutoverCandidateV4Input {
  const compiledInstance = {
    lineageProfileIdHex: `0x${LINEAGE_PROFILE_ID}`,
    encodedLineageProfileHex: ENCODED_LINEAGE_PROFILE,
    application: {
      bindingHex: APPLICATION_BINDING,
      bindingDigestHex: APPLICATION_BINDING_DIGEST,
      sourceRuntimeCodeSha256Hex: SOURCE_RUNTIME_CODE_SHA256,
      sourceRuntimeCodeBytes: SOURCE_RUNTIME_CODE_BYTES,
      runtimeProfileScaleHex: RUNTIME_PROFILE_SCALE,
      runtimeProfileIdHex: RUNTIME_PROFILE_ID,
      burnBindingHex: BURN_APPLICATION_BINDING,
      burnBindingDigestHex: BURN_APPLICATION_BINDING_DIGEST,
    },
    sidechainFinalityPolicy: {
      policyIdHex: SOURCE_ADMISSION_POLICY_ID,
      proofSystemIdHex: '31'.repeat(32),
      proofProfileIdHex: '32'.repeat(32),
      approvedTrustAnchorDigestHex: '33'.repeat(32),
    },
    contracts: {
      tracker: { receipt: { contractIdHex: CONTRACT_IDS.tracker } },
      duplicatePrevention: {
        receipt: { contractIdHex: CONTRACT_IDS.duplicatePrevention },
      },
      sourceLock: { receipt: { contractIdHex: CONTRACT_IDS.sourceLock } },
      pooledReserve: {
        receipt: { contractIdHex: CONTRACT_IDS.pooledReserve },
      },
    },
  } as any;
  const runtimeProfile = {
    profile: {
      activationHeight: '500',
      sidechainIdHex: '41'.repeat(32),
    },
    profileIdHex: RUNTIME_PROFILE_ID,
    compiledBinding: {
      lineageProfileIdHex: compiledInstance.lineageProfileIdHex,
      encodedLineageProfileHex: ENCODED_LINEAGE_PROFILE,
      applicationBindingHex: APPLICATION_BINDING,
      applicationBindingDigestHex: APPLICATION_BINDING_DIGEST,
      runtimeProfileScaleHex: RUNTIME_PROFILE_SCALE,
      runtimeProfileIdHex: RUNTIME_PROFILE_ID,
      burnApplicationBindingHex: BURN_APPLICATION_BINDING,
      burnApplicationBindingDigestHex: BURN_APPLICATION_BINDING_DIGEST,
      contractIds: CONTRACT_IDS,
    },
  } as any;
  const historicalReplayGenesis = {
    packetDigestHex: HISTORICAL_REPLAY_GENESIS_PACKET_DIGEST,
    lineage: {
      lineageProfileIdHex: compiledInstance.lineageProfileIdHex,
      encodedLineageProfileHex: ENCODED_LINEAGE_PROFILE,
    },
    observation: {
      cutoverObservationReportDigestHex: CUTOVER_OBSERVATION_REPORT_DIGEST,
    },
    contributions: Array.from({ length: 8 }, (_, index) => ({
      routeId: `historical-route-${index}`,
    })),
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex: ['51'.repeat(32), '52'.repeat(32)],
      digestHex: DUP_DIGEST,
      registers: DUP_REGISTERS,
    },
  } as any;
  const provisioning = {
    lineageProfileIdHex: compiledInstance.lineageProfileIdHex,
    duplicatePreventionGenesis: {
      mode: 'historical-replay-genesis',
      historicalReplayGenesisPacketDigestHex:
        HISTORICAL_REPLAY_GENESIS_PACKET_DIGEST,
      canonicalBurnIdCount: 2,
      digestHex: DUP_DIGEST,
    },
    boxes: {
      duplicatePrevention: {
        additionalRegisters: DUP_REGISTERS,
      },
    },
  } as any;
  return {
    compiledInstance,
    runtimeProfile,
    historicalReplayGenesis,
    provisioning,
    activationParent: {
      sidechainIdHex: runtimeProfile.profile.sidechainIdHex,
      nativeBlockHashHex: '61'.repeat(32),
      nativeHeight: 499,
      nativeStateRootHex: '62'.repeat(32),
      executionBlockHashHex: '63'.repeat(32),
      runtimeCodeSha256Hex: SOURCE_RUNTIME_CODE_SHA256,
      runtimeCodeBytes: SOURCE_RUNTIME_CODE_BYTES,
      sourceAdmissionPolicyIdHex: SOURCE_ADMISSION_POLICY_ID,
      observationDigestHex: '65'.repeat(32),
    },
    legacyRouteDeclarations: retirementDeclarations(),
  };
}

function retirementDeclarations():
  readonly LegacyRouteRetirementDeclarationV4[] {
  return VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.map(
    (requirement, index) => ({
      routeId: requirement.routeId,
      declaredDisposition: requirement.requiredDisposition,
      declaredStatus: 'inactive-unverified' as const,
      inventoryEvidenceDigestHex:
        (index + 1).toString(16).padStart(2, '0').repeat(32),
      retirementEvidenceDigestHex:
        (index + 65).toString(16).padStart(2, '0').repeat(32),
    }),
  );
}

function isRecursivelyFrozen(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return true;
  }
  seen.add(value);
  return Object.isFrozen(value)
    && Object.values(value).every(child =>
      isRecursivelyFrozen(child, seen)
    );
}
