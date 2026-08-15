import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  compiled: new WeakSet<object>(),
  observations: new WeakSet<object>(),
  replayImports: new WeakSet<object>(),
}));

vi.mock(
  './validity-application-pooled-reserve-instance-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./validity-application-pooled-reserve-instance-v4.js')
    >();
    return {
      ...actual,
      assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
        value: unknown,
      ) {
        if (value === null || typeof value !== 'object' || !provenance.compiled.has(value)) {
          throw new Error('compiled instance was not built in this process');
        }
      },
    };
  },
);

vi.mock(
  './validity-application-pooled-reserve-ergo-cutover-observation-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./validity-application-pooled-reserve-ergo-cutover-observation-v4.js')
    >();
    const assertProvenance = (value: unknown): void => {
      if (
        value === null
        || typeof value !== 'object'
        || !provenance.observations.has(value)
      ) {
        throw new Error('Ergo cutover observation was not built in this process');
      }
    };
    return {
      ...actual,
      assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance:
        assertProvenance,
      validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
        value: unknown,
      ) {
        assertProvenance(value);
        return value;
      },
    };
  },
);

vi.mock(
  './validity-application-pooled-reserve-authenticated-v2-replay-import-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./validity-application-pooled-reserve-authenticated-v2-replay-import-v4.js')
    >();
    return {
      ...actual,
      assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet(
        value: unknown,
      ) {
        if (
          value === null
          || typeof value !== 'object'
          || !provenance.replayImports.has(value)
        ) {
          throw new Error('replay import was not built in this process');
        }
      },
    };
  },
);

import { getDupTreeDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
} from './ergo-encoding.js';
import {
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance,
  buildValidityApplicationPooledReserveHistoricalReplayGenesisV4,
  type HistoricalReplayGenesisContributionV4Input,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import { HISTORICAL_DUP_FAMILIES_V4 } from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';
import { VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS } from './validity-application-pooled-reserve-instance-v4.js';

const PROFILE_DIGEST = '11'.repeat(32);
const REQUIREMENTS_DIGEST = '22'.repeat(32);
const SOURCE_IDS = ['31'.repeat(32), '32'.repeat(32)] as const;
const LINEAGE_PROFILE_ID = `0x${'41'.repeat(32)}`;
const ENCODED_LINEAGE_PROFILE = `0x${'42'.repeat(64)}`;
const AUTHENTICATED_V2_ROUTE_ID =
  'ergo-double-unlock-prevention-authenticated';
const SNAPSHOT = Object.freeze({
  indexedHeight: 500,
  fullHeight: 500,
  bestHeader: Object.freeze({
    idHex: '51'.repeat(32),
    parentIdHex: '52'.repeat(32),
    height: 500,
    extensionRootHex: '53'.repeat(32),
  }),
});

describe('pooled-reserve V4 global historical replay genesis', () => {
  it('binds an explicit empty contribution for every observed lineage', () => {
    const compiled = compiledInstance();
    const lineages = allEmptyLineages();
    const observation = cutoverObservation(lineages);
    const packet = buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions: emptyContributions(lineages).reverse(),
    });
    const emptyDigest = getDupTreeDigest([]);

    expect(packet.contributions).toHaveLength(HISTORICAL_DUP_FAMILIES_V4.length);
    expect(packet.contributions.every(contribution =>
      contribution.kind === 'empty-observed-lineage'
      && contribution.canonicalBurnIdsHex.length === 0
    )).toBe(true);
    expect(packet.duplicatePreventionGenesis).toEqual({
      canonicalBurnIdsHex: [],
      digestHex: emptyDigest,
      registers: {
        R4: encodeCollByteRegister(Buffer.from(LINEAGE_PROFILE_ID.slice(2), 'hex')),
        R5: encodeAvlTreeRegister(
          Buffer.from(emptyDigest, 'hex'),
          VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
          1,
        ),
      },
    });
    expect(packet.boundaries).toMatchObject({
      cutoverObservationValidatedInProcess: true,
      exactContributionPerObservedLineage: true,
      deterministicInsertOnlyGenesisBuilt: true,
      allObservedHistoricalLineagesComposed: true,
      profileInstanceInventoryExhaustiveAuthenticated: false,
      legacyRoutesRetired: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(Object.isFrozen(packet)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
        packet,
      )
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
        structuredClone(packet),
      )
    ).toThrow(/not built in this process/);
  });

  it('composes one authenticated-V2 import with the empty remainder deterministically', () => {
    const compiled = compiledInstance();
    const burnIds = ['72'.repeat(32), '71'.repeat(32)].sort();
    const lineages = allEmptyLineages().map(lineage =>
      lineage.routeId === AUTHENTICATED_V2_ROUTE_ID
        ? nonemptyLineage(lineage, burnIds)
        : lineage
    );
    const observation = cutoverObservation(lineages);
    const authenticated = lineages.find(
      lineage => lineage.routeId === AUTHENTICATED_V2_ROUTE_ID,
    )!;
    const replayImport = authenticatedV2ReplayImport(compiled, authenticated, burnIds);
    const contributions = emptyContributions(lineages).map(contribution =>
      contribution.routeId === AUTHENTICATED_V2_ROUTE_ID
        ? authenticatedContribution(authenticated, replayImport)
        : contribution
    );
    const forward = buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions,
    });
    const reversed = buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions: [...contributions].reverse(),
    });

    expect(reversed).toEqual(forward);
    expect(reversed.packetDigestHex).toBe(forward.packetDigestHex);
    expect(forward.duplicatePreventionGenesis.canonicalBurnIdsHex).toEqual(burnIds);
    expect(forward.duplicatePreventionGenesis.digestHex)
      .toBe(getDupTreeDigest([...burnIds]));
    expect(forward.contributions.find(contribution =>
      contribution.routeId === AUTHENTICATED_V2_ROUTE_ID
    )).toMatchObject({
      kind: 'authenticated-v2-replay-import',
      rawReplayKeyCount: 2,
      replayImportPacketDigestHex: replayImport.packetDigestHex,
      canonicalBurnIdsHex: burnIds,
    });

    const callerSelectedGenesis = replayImportClone(replayImport);
    callerSelectedGenesis.duplicatePreventionGenesis.digestHex = 'ff'.repeat(33);
    provenance.replayImports.add(callerSelectedGenesis);
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions: contributions.map(contribution =>
        contribution.kind === 'authenticated-v2-replay-import'
          ? authenticatedContribution(authenticated, callerSelectedGenesis)
          : contribution
      ),
    })).toThrow(/exact deterministic V4 DUP genesis/);
  });

  it('orders profile-controlled identities by code units rather than host locale', () => {
    const compiled = compiledInstance();
    const template = allEmptyLineages()[0];
    const lineages = [
      { ...template, instanceId: 'a-instance', packetDigestHex: hexDigest('a') },
      { ...template, instanceId: '_instance', packetDigestHex: hexDigest('_') },
      { ...template, instanceId: 'Z-instance', packetDigestHex: hexDigest('Z') },
    ];
    const packet = buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: cutoverObservation(lineages),
      contributions: emptyContributions(lineages),
    });

    expect(packet.contributions.map(contribution => contribution.instanceId))
      .toEqual(['Z-instance', '_instance', 'a-instance']);
  });

  it('rejects missing, duplicate, and unknown lineage contributions', () => {
    const compiled = compiledInstance();
    const lineages = allEmptyLineages();
    const observation = cutoverObservation(lineages);
    const contributions = emptyContributions(lineages);

    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions: contributions.slice(1),
    })).toThrow(/omits observed lineages/);
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions: [contributions[0], contributions[0], ...contributions.slice(2)],
    })).toThrow(/duplicate contribution/);
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions: [{
        ...contributions[0],
        routeId: 'unknown-duplicate-prevention-route',
      }, ...contributions.slice(1)],
    })).toThrow(/unknown lineage/);
  });

  it('leaves no reusable composition after rejection and accepts a corrected retry', () => {
    const compiled = compiledInstance();
    const lineages = allEmptyLineages();
    const observation = cutoverObservation(lineages);
    const contributions = emptyContributions(lineages);

    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions: contributions.slice(1),
    })).toThrow(/omits observed lineages/);

    const corrected =
      buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
        compiledInstance: compiled,
        cutoverObservation: observation,
        contributions,
      });
    expect(corrected.duplicatePreventionGenesis.canonicalBurnIdsHex)
      .toEqual([]);
    expect(() =>
      assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
        corrected,
      )
    ).not.toThrow();
  });

  it('fails closed for a nonempty lineage without a supported adapter', () => {
    const compiled = compiledInstance();
    const burnId = '81'.repeat(32);
    const lineages = allEmptyLineages();
    lineages[0] = nonemptyLineage(lineages[0], [burnId]);
    const observation = cutoverObservation(lineages);
    const contributions = emptyContributions(lineages);

    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions,
    })).toThrow(/requires supported mapping and source-admission evidence/);

    const fakeImport = authenticatedV2ReplayImport(compiled, lineages[0], [burnId]);
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions: [
        authenticatedContribution(lineages[0], fakeImport),
        ...contributions.slice(1),
      ],
    })).toThrow(/no supported replay-import adapter/);
  });

  it('rejects route identity, snapshot, source-pair, and compiled-profile drift', () => {
    const compiled = compiledInstance();
    const baseLineages = allEmptyLineages();

    const routeDrift = emptyContributions(baseLineages);
    routeDrift[0] = { ...routeDrift[0], instanceId: 'another-instance' };
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: cutoverObservation(baseLineages),
      contributions: routeDrift,
    })).toThrow(/unknown lineage/);

    const snapshotDrift = allEmptyLineages();
    snapshotDrift[0] = {
      ...snapshotDrift[0],
      stableSnapshot: { ...SNAPSHOT, indexedHeight: 499 },
    };
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: cutoverObservation(snapshotDrift),
      contributions: emptyContributions(snapshotDrift),
    })).toThrow(/snapshot drifted/);

    const sourceDrift = allEmptyLineages();
    sourceDrift[0] = {
      ...sourceDrift[0],
      sourceIdDigestsHex: ['91'.repeat(32), SOURCE_IDS[1]],
    };
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: cutoverObservation(sourceDrift),
      contributions: emptyContributions(sourceDrift),
    })).toThrow(/source pair drifted/);

    const profileDrift = allEmptyLineages();
    profileDrift[0] = { ...profileDrift[0], profileDigestHex: '92'.repeat(32) };
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: cutoverObservation(profileDrift),
      contributions: emptyContributions(profileDrift),
    })).toThrow(/profile identity drifted/);

    const burnId = '93'.repeat(32);
    const nonempty = allEmptyLineages().map(lineage =>
      lineage.routeId === AUTHENTICATED_V2_ROUTE_ID
        ? nonemptyLineage(lineage, [burnId])
        : lineage
    );
    const authenticated = nonempty.find(
      lineage => lineage.routeId === AUTHENTICATED_V2_ROUTE_ID,
    )!;
    const replayImport = replayImportClone(
      authenticatedV2ReplayImport(compiled, authenticated, [burnId]),
    );
    replayImport.lineage.lineageProfileIdHex = `0x${'94'.repeat(32)}`;
    provenance.replayImports.add(replayImport);
    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: cutoverObservation(nonempty),
      contributions: emptyContributions(nonempty).map(contribution =>
        contribution.routeId === AUTHENTICATED_V2_ROUTE_ID
          ? authenticatedContribution(authenticated, replayImport)
          : contribution
      ),
    })).toThrow(/compiled V4 lineage/);
  });

  it('rejects a duplicate canonical burn ID across distinct observed lineages', () => {
    const compiled = compiledInstance();
    const burnId = 'a1'.repeat(32);
    const base = allEmptyLineages().filter(
      lineage => lineage.routeId !== AUTHENTICATED_V2_ROUTE_ID,
    );
    const template = allEmptyLineages().find(
      lineage => lineage.routeId === AUTHENTICATED_V2_ROUTE_ID,
    )!;
    const first = nonemptyLineage(template, [burnId]);
    const second = nonemptyLineage({ ...template, instanceId: 'second-instance' }, [burnId]);
    const lineages = [...base, first, second];
    const observation = cutoverObservation(lineages);
    const firstImport = authenticatedV2ReplayImport(compiled, first, [burnId]);
    const secondImport = authenticatedV2ReplayImport(compiled, second, [burnId], 'b2');
    const contributions = emptyContributions(lineages).map(contribution => {
      if (contribution.routeId !== AUTHENTICATED_V2_ROUTE_ID) return contribution;
      return contribution.instanceId === first.instanceId
        ? authenticatedContribution(first, firstImport)
        : authenticatedContribution(second, secondImport);
    });

    expect(() => buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
      compiledInstance: compiled,
      cutoverObservation: observation,
      contributions,
    })).toThrow(/global canonical burn IDs.*strictly sorted and unique/);
  });
});

function compiledInstance(): any {
  const compiled = {
    lineageProfileIdHex: LINEAGE_PROFILE_ID,
    encodedLineageProfileHex: ENCODED_LINEAGE_PROFILE,
  };
  provenance.compiled.add(compiled);
  return compiled;
}

function allEmptyLineages(): any[] {
  return HISTORICAL_DUP_FAMILIES_V4.map((family, index) => ({
    classification: 'never-funded',
    packetDigestHex: hexDigest(`lineage-${index}`),
    profileDigestHex: PROFILE_DIGEST,
    requirementsDigestHex: REQUIREMENTS_DIGEST,
    networkId: 'ergo-testnet',
    routeId: family.routeId,
    sourceSurface: family.sourceSurface,
    instanceId: `instance-${String(index).padStart(2, '0')}`,
    address: `test-address-${index}`,
    ergoTreeHex: `10010100d1${(0x40 + index).toString(16)}00`,
    singletonTokenIdHex: hexDigest(`singleton-${index}`),
    genesisBoxIdHex: hexDigest(`genesis-${index}`),
    descriptor: family,
    stableSnapshot: SNAPSHOT,
    genesisObservedBoxIdHex: null,
    tipBoxIdHex: null,
    tipDigestHex: '00'.repeat(33),
    tipCounter: '0',
    tipSigmaSerializedHex: null,
    tipSigmaSerializedSha256Hex: null,
    rawInsertedKeysHex: [],
    lineageBoxes: [],
    transitions: [],
    observationDigestHex: hexDigest(`observation-${index}`),
    sourceIdDigestsHex: SOURCE_IDS,
  }));
}

function nonemptyLineage(lineage: any, rawKeys: readonly string[]): any {
  return {
    ...lineage,
    classification: 'raw-reconstructed',
    genesisObservedBoxIdHex: lineage.genesisBoxIdHex,
    tipBoxIdHex: hexDigest(`tip-${lineage.instanceId}`),
    tipDigestHex: `01${hexDigest(`tip-digest-${lineage.instanceId}`)}`,
    tipCounter: String(rawKeys.length),
    rawInsertedKeysHex: [...rawKeys],
  };
}

function cutoverObservation(lineages: readonly any[]): any {
  const report = {
    reportDigestHex: hexDigest(`report-${lineages.map(lineage =>
      `${lineage.routeId}/${lineage.instanceId}/${lineage.packetDigestHex}`
    ).join('|')}`),
    profile: {
      profileDigestHex: PROFILE_DIGEST,
      requirementsDigestHex: REQUIREMENTS_DIGEST,
      networkId: 'ergo-testnet',
    },
    observation: {
      stableSnapshot: SNAPSHOT,
      sourceIdDigestsHex: SOURCE_IDS,
    },
    historicalDupLineages: lineages,
  };
  provenance.observations.add(report);
  return report;
}

function emptyContributions(
  lineages: readonly any[],
): HistoricalReplayGenesisContributionV4Input[] {
  return lineages.map(lineage => ({
    kind: 'empty-observed-lineage',
    routeId: lineage.routeId,
    instanceId: lineage.instanceId,
    lineagePacketDigestHex: lineage.packetDigestHex,
  }));
}

function authenticatedContribution(lineage: any, replayImport: any): any {
  return {
    kind: 'authenticated-v2-replay-import',
    routeId: lineage.routeId,
    instanceId: lineage.instanceId,
    lineagePacketDigestHex: lineage.packetDigestHex,
    replayImport,
  };
}

function authenticatedV2ReplayImport(
  compiled: any,
  lineage: any,
  burnIds: readonly string[],
  salt = 'a1',
): any {
  const canonicalBurnIdsHex = [...burnIds].sort();
  const digestHex = getDupTreeDigest([...canonicalBurnIdsHex]);
  const packet = {
    packetDigestHex: hexDigest(
      `replay-${salt}-${lineage.instanceId}-${canonicalBurnIdsHex.join('-')}`,
    ),
    lineage: {
      lineageProfileIdHex: compiled.lineageProfileIdHex,
      encodedLineageProfileHex: compiled.encodedLineageProfileHex,
    },
    source: {
      authenticatedV2DuplicatePreventionNftIdHex: lineage.singletonTokenIdHex,
      authenticatedV2DuplicatePreventionErgoTreeHex: lineage.ergoTreeHex,
      authenticatedV2GenesisBoxIdHex: lineage.genesisBoxIdHex,
      authenticatedV2TipBoxIdHex: lineage.tipBoxIdHex,
      authenticatedV2TipDigestHex: lineage.tipDigestHex,
      authenticatedV2TipCounter: lineage.tipCounter,
    },
    imports: canonicalBurnIdsHex.map((burnIdHex, index) => ({
      legacyHistoryKeyHex: burnIdHex,
      legacyKeySemantics: 'canonical-v4-burn-id',
      sidechainTxHashHex: hexDigest(`sidechain-${salt}-${index}`),
      eventIndex: index,
      canonicalBurnIdHex: burnIdHex,
      nativeCheckpointAdmissionDigestHex: hexDigest(`admission-${salt}-${index}`),
    })),
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex,
      digestHex,
      registers: {
        R4: encodeCollByteRegister(Buffer.from(
          compiled.lineageProfileIdHex.slice(2),
          'hex',
        )),
        R5: encodeAvlTreeRegister(
          Buffer.from(digestHex, 'hex'),
          VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
          1,
        ),
      },
    },
    boundaries: {
      authenticatedV2LineageImported: true,
      allLineagesImported: false,
      legacyRoutesRetired: false,
      profileActivated: false,
      transactionConstructed: false,
      targetNodeAcceptanceEstablished: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  provenance.replayImports.add(packet);
  return packet;
}

function replayImportClone(packet: any): any {
  return structuredClone(packet);
}

function hexDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
