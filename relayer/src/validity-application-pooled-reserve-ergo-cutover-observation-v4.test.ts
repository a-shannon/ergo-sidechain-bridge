import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedV2VaultChainSource } from './authenticated-v2-vault-reconstruction.js';
import {
  parseErgoCutoverObservationArgs,
  runErgoCutoverObservationCli,
} from './scripts/observe-validity-application-pooled-reserve-ergo-cutover-v4.js';
import {
  assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance,
  observeValidityApplicationPooledReserveErgoCutoverV4,
  validateValidityApplicationPooledReserveErgoCutoverObservationV4Report,
} from './validity-application-pooled-reserve-ergo-cutover-observation-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-cutover-candidate-v4.js';
import {
  buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';
import { HISTORICAL_DUP_FAMILIES_V4 } from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';
import { sha256CanonicalJson } from './strict-json.js';

const BEST_HEADER_ID = 'd1'.repeat(32);
const BEST_PARENT_ID = 'd2'.repeat(32);
const EXTENSION_ROOT = 'd3'.repeat(32);
const temporaryRoots: string[] = [];

interface SourceCounters {
  begin: number;
  end: number;
  bestHeader: number;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

function profileInput(
  networkId: 'ergo-testnet' | 'ergo-mainnet' = 'ergo-testnet',
): BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input {
  const addressNetworkPrefix = networkId === 'ergo-testnet' ? 16 : 0;
  const addressNetwork = networkId === 'ergo-testnet'
    ? Network.Testnet
    : Network.Mainnet;
  return {
    network: { networkId, addressNetworkPrefix },
    reviewedSource: {
      sourceRevisionHex: 'a1'.repeat(20),
      basis: [{
        reference: 'repository://bridge/reviewed-ergo-cutover-observation-basis-v4',
        sha256Hex: 'b2'.repeat(32),
      }],
    },
    routes: VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .filter(requirement => requirement.layer === 'ergo')
      .map((requirement, index) => {
        const ergoTreeHex = tree(index);
        const singleton = requirement.routeClass === 'tracker'
          || requirement.routeClass === 'duplicate-prevention'
          || requirement.routeClass === 'sidechain-state';
        return {
          routeId: requirement.routeId,
          sourceSurface: requirement.sourceSurface,
          requiredDisposition: requirement.requiredDisposition,
          instances: [{
            instanceId: `candidate-${String(index).padStart(2, '0')}`,
            address: ErgoAddress.fromErgoTree(ergoTreeHex, addressNetwork).toString(),
            ergoTreeHex,
            ergoTreeSha256Hex: sha256Bytes(ergoTreeHex),
            singletonTokenIdHex: singleton ? hex(index + 1) : null,
            genesisBoxIdHex: singleton ? hex(index + 65) : null,
          }],
        };
      }),
  };
}

function emptySource(
  observationSourceId: string,
  options: Readonly<{ driftAfterFirstLineage?: boolean }> = {},
): { source: AuthenticatedV2VaultChainSource; counters: SourceCounters } {
  let budgetActive = false;
  const counters: SourceCounters = { begin: 0, end: 0, bestHeader: 0 };
  const assertBudget = (): void => {
    if (!budgetActive) throw new Error('test source read occurred outside aggregate budget');
  };
  const currentHeight = (): number =>
    options.driftAfterFirstLineage && counters.bestHeader >= 2 ? 501 : 500;
  const source: AuthenticatedV2VaultChainSource = {
    observationSourceId,
    beginAuthenticatedTrackerReconstruction() {
      if (budgetActive) throw new Error('test source budget is already active');
      budgetActive = true;
      counters.begin += 1;
    },
    endAuthenticatedTrackerReconstruction() {
      if (!budgetActive) throw new Error('test source budget is not active');
      budgetActive = false;
      counters.end += 1;
    },
    async getInfo() {
      assertBudget();
      return { network: 'testnet' };
    },
    async getIndexedHeight() {
      assertBudget();
      const height = currentHeight();
      return { indexedHeight: height, fullHeight: height };
    },
    async getBestHeader() {
      assertBudget();
      const height = currentHeight();
      counters.bestHeader += 1;
      return {
        id: height === 500 ? BEST_HEADER_ID : 'e1'.repeat(32),
        parentId: height === 500 ? BEST_PARENT_ID : 'e2'.repeat(32),
        height,
        extensionRoot: EXTENSION_ROOT,
      };
    },
    async getIndexedBoxesByTokenId() {
      assertBudget();
      return [];
    },
    async getIndexedBoxesByAddress() {
      assertBudget();
      return [];
    },
    async getUnspentBoxesByAddress() {
      assertBudget();
      return [];
    },
    async getTransaction() {
      assertBudget();
      return null;
    },
    async getBlockHeaderById() {
      assertBudget();
      return null;
    },
    async getBoxByIdOrNull() {
      assertBudget();
      return null;
    },
    async getBoxBinaryByIdOrNull() {
      assertBudget();
      return null;
    },
  };
  return { source, counters };
}

function tree(index: number): string {
  return `10010100d1${(0x40 + index).toString(16)}00`;
}

function hex(value: number): string {
  return value.toString(16).padStart(2, '0').repeat(32);
}

function sha256Bytes(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex');
}

describe('pooled-reserve V4 Ergo cutover observation', () => {
  it('composes every DUP lineage and the inventory under one non-authorizing budget', async () => {
    const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      profileInput(),
    );
    const primary = emptySource('https://primary.invalid');
    const witness = emptySource('https://witness.invalid');
    const report = await observeValidityApplicationPooledReserveErgoCutoverV4({
      profile,
      expectedProfileDigestHex: profile.profileDigestHex,
      primarySource: primary.source,
      witnessSource: witness.source,
      observedAt: () => new Date('2026-08-01T12:00:00.000Z'),
    });

    expect(report.historicalDupLineages).toHaveLength(HISTORICAL_DUP_FAMILIES_V4.length);
    expect(report.historicalDupLineages.every(
      lineage => lineage.classification === 'never-funded',
    )).toBe(true);
    expect(report.inventory.summary.historicalLineageJoinedCount)
      .toBe(HISTORICAL_DUP_FAMILIES_V4.length);
    expect(report.summary).toMatchObject({
      historicalDupLineageCount: HISTORICAL_DUP_FAMILIES_V4.length,
      reconstructedHistoricalDupLineageCount: 0,
      neverFundedHistoricalDupLineageCount: HISTORICAL_DUP_FAMILIES_V4.length,
      rawHistoricalReplayKeyCount: 0,
      lineagesRequiringEventAndAdmissionEvidence: 0,
    });
    expect(report.nextEvidence).toEqual([]);
    expect(report.routeProfile.profileDigestHex).toBe(profile.profileDigestHex);
    expect(report.boundaries).toMatchObject({
      aggregateBudgetHooksApplied: true,
      sourceAdapterBudgetEnforcementAuthenticated: false,
      orchestratorRuntimeDatabaseConsulted: false,
      sourceAdapterProvenanceAuthenticated: false,
      profileReviewAuthenticated: false,
      publicationAuthorized: false,
      replayGenesisEligible: false,
      legacyRoutesRetired: false,
      profileActivated: false,
      transactionCheckPerformed: false,
      mintAuthorized: false,
      payoutAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(primary.counters).toMatchObject({ begin: 1, end: 1 });
    expect(witness.counters).toMatchObject({ begin: 1, end: 1 });
    expect(JSON.stringify(report)).not.toContain('https://primary.invalid');
    expect(JSON.stringify(report)).not.toContain('https://witness.invalid');
    expect(Object.isFrozen(report)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance(report)
    ).not.toThrow();
    expect(validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
      structuredClone(report),
    ).reportDigestHex).toBe(report.reportDigestHex);

    const tampered = structuredClone(report) as any;
    tampered.summary.routeCount += 1;
    expect(() =>
      validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(tampered)
    ).toThrow(/digest does not match/i);
    expect(() =>
      assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance(
        structuredClone(report),
      )
    ).toThrow(/not built in this process/i);

    const inventoryAuthorityRewrite = structuredClone(report) as any;
    inventoryAuthorityRewrite.inventory.authority.fundsAuthorityEstablished = true;
    inventoryAuthorityRewrite.inventory.packetDigestHex = digestWithoutField(
      inventoryAuthorityRewrite.inventory,
      'packetDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4',
    );
    inventoryAuthorityRewrite.reportDigestHex = digestWithoutField(
      inventoryAuthorityRewrite,
      'reportDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4',
    );
    expect(() =>
      validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
        inventoryAuthorityRewrite,
      )
    ).toThrow(/inventory authority boundary/i);

    const lineageAuthorityRewrite = structuredClone(report) as any;
    lineageAuthorityRewrite.historicalDupLineages[0].boundaries.fundsAuthorityEstablished = true;
    lineageAuthorityRewrite.historicalDupLineages[0].packetDigestHex = digestWithoutField(
      lineageAuthorityRewrite.historicalDupLineages[0],
      'packetDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_PACKET_V4',
    );
    lineageAuthorityRewrite.reportDigestHex = digestWithoutField(
      lineageAuthorityRewrite,
      'reportDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4',
    );
    expect(() =>
      validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
        lineageAuthorityRewrite,
      )
    ).toThrow(/historical DUP lineage 0 is invalid/i);

    const inventoryIdentityRewrite = structuredClone(report) as any;
    const coveredKeys = new Set(
      inventoryIdentityRewrite.inventory.historicalDuplicatePrevention.map(
        (coverage: any) => `${coverage.routeId}/${coverage.instanceId}`,
      ),
    );
    const rewrittenRoute = inventoryIdentityRewrite.inventory.routes.find(
      (route: any) => !coveredKeys.has(
        `${route.routeId}/${route.instances[0].instanceId}`,
      ),
    );
    rewrittenRoute.instances[0].instanceId = 'coordinated-rewrite';
    rewrittenRoute.instances[0].inventoryEvidenceDigestHex = digestWithoutField(
      rewrittenRoute.instances[0],
      'inventoryEvidenceDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INSTANCE_INVENTORY_V4',
    );
    rewrittenRoute.inventoryEvidenceDigestHex = digestWithoutField(
      rewrittenRoute,
      'inventoryEvidenceDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_INVENTORY_V4',
    );
    inventoryIdentityRewrite.inventory.packetDigestHex = digestWithoutField(
      inventoryIdentityRewrite.inventory,
      'packetDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4',
    );
    inventoryIdentityRewrite.reportDigestHex = digestWithoutField(
      inventoryIdentityRewrite,
      'reportDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4',
    );
    expect(() =>
      validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
        inventoryIdentityRewrite,
      )
    ).toThrow(/canonical route profile/i);

    const blockerRemoval = structuredClone(report) as any;
    const blockedRoute = blockerRemoval.inventory.routes[0];
    blockedRoute.blockerCodes = blockedRoute.blockerCodes.filter(
      (blocker: string) => blocker !== 'retirement-evidence-required',
    );
    blockedRoute.inventoryEvidenceDigestHex = digestWithoutField(
      blockedRoute,
      'inventoryEvidenceDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_INVENTORY_V4',
    );
    blockerRemoval.inventory.packetDigestHex = digestWithoutField(
      blockerRemoval.inventory,
      'packetDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4',
    );
    blockerRemoval.reportDigestHex = digestWithoutField(
      blockerRemoval,
      'reportDigestHex',
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4',
    );
    expect(() =>
      validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
        blockerRemoval,
      )
    ).toThrow(/omits a blocker/i);
  });

  it('rejects mainnet, digest drift, and missing aggregate-budget hooks before reads', async () => {
    const mainnet = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      profileInput('ergo-mainnet'),
    );
    const first = emptySource('https://primary.invalid');
    const second = emptySource('https://witness.invalid');
    await expect(observeValidityApplicationPooledReserveErgoCutoverV4({
      profile: mainnet,
      expectedProfileDigestHex: mainnet.profileDigestHex,
      primarySource: first.source,
      witnessSource: second.source,
    })).rejects.toThrow(/non-mainnet/i);
    expect(first.counters.begin).toBe(0);
    expect(second.counters.begin).toBe(0);

    const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      profileInput(),
    );
    await expect(observeValidityApplicationPooledReserveErgoCutoverV4({
      profile,
      expectedProfileDigestHex: 'ff'.repeat(32),
      primarySource: first.source,
      witnessSource: second.source,
    })).rejects.toThrow(/expected digest/i);
    expect(first.counters.begin).toBe(0);
    expect(second.counters.begin).toBe(0);

    const unbounded = { ...first.source } as any;
    delete unbounded.beginAuthenticatedTrackerReconstruction;
    delete unbounded.endAuthenticatedTrackerReconstruction;
    await expect(observeValidityApplicationPooledReserveErgoCutoverV4({
      profile,
      expectedProfileDigestHex: profile.profileDigestHex,
      primarySource: unbounded,
      witnessSource: second.source,
    })).rejects.toThrow(/aggregate observation budget hooks/i);
  });

  it('fails closed when the source pair moves between producer observations', async () => {
    const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      profileInput(),
    );
    const primary = emptySource('https://primary.invalid', {
      driftAfterFirstLineage: true,
    });
    const witness = emptySource('https://witness.invalid', {
      driftAfterFirstLineage: true,
    });
    await expect(observeValidityApplicationPooledReserveErgoCutoverV4({
      profile,
      expectedProfileDigestHex: profile.profileDigestHex,
      primarySource: primary.source,
      witnessSource: witness.source,
    })).rejects.toThrow(/another inventory snapshot/i);
    expect(primary.counters).toMatchObject({ begin: 1, end: 1 });
    expect(witness.counters).toMatchObject({ begin: 1, end: 1 });
  });
});

function digestWithoutField(
  value: Record<string, unknown>,
  field: string,
  domain: string,
): string {
  const binding = { ...value };
  delete binding[field];
  return sha256CanonicalJson(binding, domain);
}

describe('pooled-reserve V4 Ergo cutover observation CLI', () => {
  it('parses only the complete explicit argument set', () => {
    expect(parseErgoCutoverObservationArgs(['--help'])).toMatchObject({
      help: true,
      errors: [],
    });
    const missing = parseErgoCutoverObservationArgs([]);
    expect(missing.errors).toEqual(expect.arrayContaining([
      '--profile is required',
      '--expected-profile-digest is required',
      '--primary-node-url is required',
      '--witness-node-url is required',
      '--out is required',
    ]));
    expect(parseErgoCutoverObservationArgs([
      '--profile', 'one.json',
      '--profile', 'two.json',
      '--unknown', 'value',
    ]).errors).toEqual(expect.arrayContaining([
      '--profile may be provided only once',
      'unknown option: --unknown',
    ]));
  });

  it('writes one create-only repository-local report without exposing origins', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bridge-ergo-cutover-'));
    temporaryRoots.push(root);
    const input = profileInput();
    writeFileSync(join(root, 'profile.json'), `${JSON.stringify(input)}\n`, 'utf8');
    const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(input);
    const sources = new Map([
      ['https://primary.invalid', emptySource('https://primary.invalid')],
      ['https://witness.invalid', emptySource('https://witness.invalid')],
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const argv = [
      '--profile', 'profile.json',
      '--expected-profile-digest', profile.profileDigestHex,
      '--primary-node-url', 'https://primary.invalid',
      '--witness-node-url', 'https://witness.invalid',
      '--out', 'reports/cutover.json',
    ];
    await runErgoCutoverObservationCli(argv, {
      cwd: root,
      bridgeRoot: root,
      createSource: origin => sources.get(origin)!.source,
      now: () => new Date('2026-08-01T12:00:00.000Z'),
    });
    const output = readFileSync(join(root, 'reports', 'cutover.json'), 'utf8');
    const parsed = validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
      JSON.parse(output),
    );
    expect(parsed.profile.profileDigestHex).toBe(profile.profileDigestHex);
    expect(output).not.toContain('https://primary.invalid');
    expect(output).not.toContain('https://witness.invalid');
    await expect(runErgoCutoverObservationCli(argv, {
      cwd: root,
      bridgeRoot: root,
      createSource: origin => sources.get(origin)!.source,
    })).rejects.toThrow(/new file/i);
  });

  it('rejects duplicate profile keys and keeps authority capabilities unreachable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bridge-ergo-cutover-'));
    temporaryRoots.push(root);
    writeFileSync(
      join(root, 'duplicate.json'),
      '{"network":{},"network":{},"reviewedSource":{},"routes":[]}',
      'utf8',
    );
    await expect(runErgoCutoverObservationCli([
      '--profile', 'duplicate.json',
      '--expected-profile-digest', 'aa'.repeat(32),
      '--primary-node-url', 'https://primary.invalid',
      '--witness-node-url', 'https://witness.invalid',
      '--out', 'report.json',
    ], {
      cwd: root,
      bridgeRoot: root,
      createSource: () => {
        throw new Error('source creation must not be reached');
      },
    })).rejects.toThrow(/duplicate JSON object key/i);

    const moduleSource = readFileSync(resolve(
      process.cwd(),
      'src/validity-application-pooled-reserve-ergo-cutover-observation-v4.ts',
    ), 'utf8');
    const cliSource = readFileSync(resolve(
      process.cwd(),
      'src/scripts/observe-validity-application-pooled-reserve-ergo-cutover-v4.ts',
    ), 'utf8');
    const combined = `${moduleSource}\n${cliSource}`;
    for (const forbidden of [
      /process\.env/,
      /deployed_state/i,
      /StateTracker/,
      /SidechainClient/,
      /JsonRpcSigner/,
      /sendTransaction/,
      /broadcastTransaction/,
      /transactions\/check/,
    ]) {
      expect(combined).not.toMatch(forbidden);
    }
    expect(cliSource).toContain('AuthenticatedV2VaultReadOnlyNodeClient');
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(packageJson.scripts['p1:ergo-cutover:observe']).toBe(
      'tsx src/scripts/observe-validity-application-pooled-reserve-ergo-cutover-v4.ts',
    );
  });
});
