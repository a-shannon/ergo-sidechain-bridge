import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  compiledV4: new WeakSet<object>(),
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
        if (
          value === null
          || typeof value !== 'object'
          || !provenance.compiledV4.has(value)
        ) {
          throw new Error('compiled V4 instance was not built in this process');
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
  buildValidityApplicationPooledReserveBurnSettlementV5,
} from './validity-application-pooled-reserve-burn-settlement-v5.js';
import {
  buildValidityApplicationPooledReserveBurnSettlementV5FixtureInput,
} from './validity-application-pooled-reserve-burn-settlement-v5-fixture.js';
import {
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput,
} from './validity-application-pooled-reserve-burn-family-v5-fixture.js';
import {
  buildValidityApplicationPooledReserveHistoricalReplayGenesisV4,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import {
  HISTORICAL_DUP_FAMILIES_V4,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';
import {
  buildValidityApplicationPooledReserveReplayCutoverV5,
} from './validity-application-pooled-reserve-replay-cutover-v5.js';

const PROFILE_DIGEST = '11'.repeat(32);
const REQUIREMENTS_DIGEST = '22'.repeat(32);
const SOURCE_IDS = ['31'.repeat(32), '32'.repeat(32)] as const;
const AUTHENTICATED_V2_ROUTE_ID =
  'ergo-double-unlock-prevention-authenticated';
const INSERT_ONLY_AVL_FLAGS = 0x01;
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

describe('pooled-reserve V4 producer to V5 replay-cutover integration', () => {
  it('carries a real-composer historical burn into V5 rejection', async () => {
    const settlement =
      await buildValidityApplicationPooledReserveBurnSettlementV5FixtureInput();
    const compilerFixture =
      await buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput();
    const compiledV4 = {
      lineageProfileIdHex:
        `0x${settlement.compiledInstance.sourceRuntimeLineageProfileIdHex}`,
      encodedLineageProfileHex: `0x${'42'.repeat(64)}`,
    };
    provenance.compiledV4.add(compiledV4);
    const historicalBurnIdHex = settlement.claim.burnLeaf.burnIdHex
      .replace(/^0x/, '');
    const lineages = HISTORICAL_DUP_FAMILIES_V4.map((family, index) => ({
      classification: family.routeId === AUTHENTICATED_V2_ROUTE_ID
        ? 'raw-reconstructed'
        : 'never-funded',
      packetDigestHex: sha256Hex(`lineage-${index}`),
      profileDigestHex: PROFILE_DIGEST,
      requirementsDigestHex: REQUIREMENTS_DIGEST,
      networkId: 'ergo-testnet',
      routeId: family.routeId,
      sourceSurface: family.sourceSurface,
      instanceId: `instance-${String(index).padStart(2, '0')}`,
      address: `test-address-${index}`,
      ergoTreeHex: `10010100d1${(0x40 + index).toString(16)}00`,
      singletonTokenIdHex: sha256Hex(`singleton-${index}`),
      genesisBoxIdHex: sha256Hex(`genesis-${index}`),
      descriptor: family,
      stableSnapshot: SNAPSHOT,
      genesisObservedBoxIdHex:
        family.routeId === AUTHENTICATED_V2_ROUTE_ID
          ? sha256Hex(`genesis-${index}`)
          : null,
      tipBoxIdHex: family.routeId === AUTHENTICATED_V2_ROUTE_ID
        ? sha256Hex(`tip-${index}`)
        : null,
      tipDigestHex: family.routeId === AUTHENTICATED_V2_ROUTE_ID
        ? `01${sha256Hex(`tip-digest-${index}`)}`
        : '00'.repeat(33),
      tipCounter: family.routeId === AUTHENTICATED_V2_ROUTE_ID ? '1' : '0',
      tipSigmaSerializedHex: null,
      tipSigmaSerializedSha256Hex: null,
      rawInsertedKeysHex: family.routeId === AUTHENTICATED_V2_ROUTE_ID
        ? [historicalBurnIdHex]
        : [],
      lineageBoxes: [],
      transitions: [],
      observationDigestHex: sha256Hex(`observation-${index}`),
      sourceIdDigestsHex: SOURCE_IDS,
    }));
    const authenticatedLineage = lineages.find(lineage =>
      lineage.routeId === AUTHENTICATED_V2_ROUTE_ID
    )!;
    const replayImport = authenticatedV2ReplayImport(
      compiledV4,
      authenticatedLineage,
      historicalBurnIdHex,
    );
    provenance.replayImports.add(replayImport);
    const observation = {
      reportDigestHex: sha256Hex('real-v4-composer-observation'),
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
    provenance.observations.add(observation);
    const historicalReplayGenesis =
      buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
        compiledInstance: compiledV4 as any,
        cutoverObservation: observation as any,
        contributions: lineages.map(lineage =>
          lineage.routeId === AUTHENTICATED_V2_ROUTE_ID
            ? {
                kind: 'authenticated-v2-replay-import' as const,
                routeId: lineage.routeId,
                instanceId: lineage.instanceId,
                lineagePacketDigestHex: lineage.packetDigestHex,
                replayImport,
              }
            : {
                kind: 'empty-observed-lineage' as const,
                routeId: lineage.routeId,
                instanceId: lineage.instanceId,
                lineagePacketDigestHex: lineage.packetDigestHex,
              }
        ),
      });

    const cutover = await buildValidityApplicationPooledReserveReplayCutoverV5({
      compiledInstance: settlement.compiledInstance,
      historicalReplayGenesis,
      duplicatePreventionGenesisInputBox:
        compilerFixture.genesis.duplicatePreventionInput,
      duplicatePreventionNanoErg: '10000000',
      creationHeight: 112,
    });

    expect(cutover.sourceReplay.historicalReplayGenesisPacketDigestHex)
      .toBe(historicalReplayGenesis.packetDigestHex);
    expect(cutover.sourceReplay.canonicalBurnIdsHex)
      .toEqual([historicalBurnIdHex]);
    expect(cutover.sourceReplay.duplicatePreventionDigestHex)
      .toBe(getDupTreeDigest([historicalBurnIdHex]));
    expect(cutover.targetLineage.lineageProfileIdHex)
      .toBe(settlement.compiledInstance.lineageProfileIdHex);

    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...settlement,
      duplicatePreventionState: {
        predecessor: cutover.duplicatePreventionBox,
        historyKeys: cutover.sourceReplay.canonicalBurnIdsHex,
      },
    })).rejects.toThrow(/already present in replay history/);
  });
});

function authenticatedV2ReplayImport(
  compiledV4: {
    lineageProfileIdHex: string;
    encodedLineageProfileHex: string;
  },
  lineage: any,
  canonicalBurnIdHex: string,
): any {
  const digestHex = getDupTreeDigest([canonicalBurnIdHex]);
  return {
    packetDigestHex: sha256Hex(`replay:${canonicalBurnIdHex}`),
    lineage: {
      lineageProfileIdHex: compiledV4.lineageProfileIdHex,
      encodedLineageProfileHex: compiledV4.encodedLineageProfileHex,
    },
    source: {
      authenticatedV2DuplicatePreventionNftIdHex:
        lineage.singletonTokenIdHex,
      authenticatedV2DuplicatePreventionErgoTreeHex: lineage.ergoTreeHex,
      authenticatedV2GenesisBoxIdHex: lineage.genesisBoxIdHex,
      authenticatedV2TipBoxIdHex: lineage.tipBoxIdHex,
      authenticatedV2TipDigestHex: lineage.tipDigestHex,
      authenticatedV2TipCounter: lineage.tipCounter,
    },
    imports: [{
      legacyHistoryKeyHex: canonicalBurnIdHex,
      legacyKeySemantics: 'canonical-v4-burn-id',
      sidechainTxHashHex: sha256Hex('sidechain-transaction'),
      eventIndex: 0,
      canonicalBurnIdHex,
      nativeCheckpointAdmissionDigestHex: sha256Hex('source-admission'),
    }],
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex: [canonicalBurnIdHex],
      digestHex,
      registers: {
        R4: encodeCollByteRegister(Buffer.from(
          compiledV4.lineageProfileIdHex.replace(/^0x/, ''),
          'hex',
        )),
        R5: encodeAvlTreeRegister(
          Buffer.from(digestHex, 'hex'),
          INSERT_ONLY_AVL_FLAGS,
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
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
