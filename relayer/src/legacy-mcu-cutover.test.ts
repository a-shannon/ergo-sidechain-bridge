import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import { encodeCollByteRegister, encodeLongRegister } from './ergo-helpers.js';
import {
  assessLegacyMcuCutover,
  LegacyMcuCutoverBlockedError,
  type LegacyMcuCutoverSource,
} from './legacy-mcu-cutover.js';
import {
  legacyMcuCutoverManifestDigestHex,
  validateLegacyMcuCutoverManifest,
  type LegacyMcuCutoverManifestV1,
} from './legacy-mcu-cutover-manifest.js';
import type { LegacyMcuBoxLike } from './legacy-mcu-inventory.js';
import { parseLegacyMcuCutoverArgs } from './scripts/legacy-mcu-cutover-assess.js';

const TREE = '10010100d17300';
const OTHER_TREE = '10010100d17400';
const ADDRESS = ErgoAddress.fromErgoTree(TREE, Network.Testnet).toString();
const TIP_HEIGHT = 20_000;
const ANCHOR_HEIGHT = 19_900;
const TIP_ID = 'aa'.repeat(32);
const ANCHOR_ID = 'bb'.repeat(32);
const GENERATED_AT = '2026-07-16T00:00:00.000Z';

function rawSha256Hex(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function manifest(): LegacyMcuCutoverManifestV1 {
  return validateLegacyMcuCutoverManifest({
    schemaVersion: 'ergo.bridge.legacy-mcu-manifest.v1',
    kind: 'legacy-mcu-address-script-manifest',
    manifestId: 'legacy-mcu-v1-testnet',
    network: {
      id: 'ergo-testnet',
      nodeInfoNetwork: 'testnet',
      addressNetworkPrefix: 16,
      p2sAddressHeader: 19,
      anchorHeader: {
        height: ANCHOR_HEIGHT,
        idHex: ANCHOR_ID,
        minimumDepth: 10,
        maximumAgeBlocks: 720,
      },
    },
    coverage: {
      mode: 'complete_historical_v1_mcu_address_script_set',
      declaredEntryCount: 1,
      cutoff: {
        event: 'legacy_mcu_creation_disabled',
        sourceRevision: '11'.repeat(20),
      },
      basis: [{ reference: 'repository://legacy-review', sha256Hex: '22'.repeat(32) }],
    },
    entries: [{
      ordinal: 0,
      scriptRole: 'legacy-mcu-v1',
      address: ADDRESS,
      addressHeader: 19,
      ergoTreeHex: TREE,
      ergoTreeSha256Hex: rawSha256Hex(TREE),
    }],
  });
}

function legacyBox(overrides: Partial<LegacyMcuBoxLike> = {}): LegacyMcuBoxLike {
  return {
    boxId: 'cc'.repeat(32),
    transactionId: 'dd'.repeat(32),
    creationHeight: 500,
    ergoTree: TREE,
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from('ee'.repeat(32), 'hex')),
      R5: encodeLongRegister(5_000_000),
      R6: encodeCollByteRegister(Buffer.from('10010100d17300', 'hex')),
      R7: encodeLongRegister(1_234),
      R8: encodeLongRegister(500),
    },
    ...overrides,
  };
}

function source(
  sourceId: string,
  boxes: unknown[] = [],
): LegacyMcuCutoverSource {
  return {
    observationSourceId: sourceId,
    getInfo: vi.fn(async () => ({ fullHeight: TIP_HEIGHT, network: 'testnet' })),
    getIndexedHeight: vi.fn(async () => ({
      indexedHeight: TIP_HEIGHT,
      fullHeight: TIP_HEIGHT,
    })),
    getBestHeader: vi.fn(async () => ({ height: TIP_HEIGHT, id: TIP_ID })),
    getBlockHeaderIdsAtHeight: vi.fn(async () => [ANCHOR_ID]),
    getCurrentHeight: vi.fn(async () => TIP_HEIGHT),
    getUnspentBoxesByAddress: vi.fn(async () => boxes),
  };
}

async function assess(
  primary = source('http://127.0.0.1:9052'),
  witness = source('http://127.0.0.1:9053'),
  value = manifest(),
) {
  return assessLegacyMcuCutover({
    manifest: value,
    expectedManifestSha256Hex: legacyMcuCutoverManifestDigestHex(value),
    primarySource: primary,
    witnessSource: witness,
    generatedAt: GENERATED_AT,
  });
}

describe('legacy MCU cutover assessment', () => {
  it('reports only the non-authorizing manifest-bound two-origin zero-UTXO observation', async () => {
    const primary = source('http://127.0.0.1:9052');
    const witness = source('http://127.0.0.1:9053');
    const report = await assess(primary, witness);

    expect(report.decision).toEqual({
      classification: 'observation_condition_met_under_explicit_manifest',
      observationConditionMet: true,
      cutoverAuthorized: false,
      blockers: [],
      statement: 'The non-authorizing zero-legacy-UTXO observation condition is met under the explicit manifest and two bound origins.',
    });
    expect(report.networkObservation).toMatchObject({
      exactSourceAgreement: true,
      primary: {
        sourceId: 'http://127.0.0.1:9052',
        snapshotBefore: { indexedHeight: TIP_HEIGHT, fullHeight: TIP_HEIGHT },
        anchorHeader: { depthAtSnapshot: 100 },
        inventory: { currentHeightSource: 'manifest-snapshot', addresses: [ADDRESS] },
      },
      witness: {
        sourceId: 'http://127.0.0.1:9053',
        snapshotBefore: { indexedHeight: TIP_HEIGHT, fullHeight: TIP_HEIGHT },
        anchorHeader: { depthAtSnapshot: 100 },
        inventory: { currentHeightSource: 'manifest-snapshot', addresses: [ADDRESS] },
      },
    });
    expect(report.boundary).toMatchObject({
      readOnly: true,
      distinctSourceOriginsRequired: true,
      independentSourceOperationProven: false,
      canonicalConsensusProven: false,
      synchronizedExtraIndexesRequired: true,
      sourceOperationalIndependenceAuthenticated: false,
      expectedManifestDigestMatched: true,
      manifestAnchorDepthPolicyEnforced: true,
      manifestCompletenessProvenByTool: false,
      manifestReviewApprovalBound: false,
      cutoverAuthorized: false,
      transactionOperationsPerformed: false,
      fundsAuthorityGranted: false,
      deploymentActivationClaimed: false,
      productionReadinessClaimed: false,
    });
    expect(primary.getCurrentHeight).not.toHaveBeenCalled();
    expect(witness.getCurrentHeight).not.toHaveBeenCalled();
  });

  it('never infers cutover authority or independent operation from distinct origins', async () => {
    const sharedBackend = source('http://127.0.0.1:9999');
    const primary = {
      ...sharedBackend,
      observationSourceId: 'http://127.0.0.1:9052',
    };
    const witness = {
      ...sharedBackend,
      observationSourceId: 'http://127.0.0.1:9053',
    };

    const report = await assess(primary, witness);

    expect(report.decision.observationConditionMet).toBe(true);
    expect(report.decision.cutoverAuthorized).toBe(false);
    expect(report.boundary).toMatchObject({
      sourceOperationalIndependenceAuthenticated: false,
      independentSourceOperationProven: false,
      manifestReviewApprovalBound: false,
      cutoverAuthorized: false,
      fundsAuthorityGranted: false,
    });
  });

  it('blocks every remaining legacy UTXO and preserves quarantine details per source', async () => {
    const report = await assess(source('http://127.0.0.1:9052', [legacyBox()]));

    expect(report.decision.classification).toBe('blocked_legacy_utxo_present');
    expect(report.decision.observationConditionMet).toBe(false);
    expect(report.networkObservation.primary.inventory.boxes[0]).toMatchObject({
      classification: 'quarantined',
      ergoTreeHex: TREE,
      malformed: false,
    });
  });

  it('blocks query failures, malformed boxes, script mismatch, and duplicate IDs', async () => {
    const failedQuery = source('http://127.0.0.1:9052');
    failedQuery.getUnspentBoxesByAddress = vi.fn(async () => {
      throw new Error('strict pagination failed');
    });
    expect((await assess(failedQuery)).decision.classification).toBe('blocked_query_failure');

    const malformed = await assess(source(
      'http://127.0.0.1:9052',
      [legacyBox({ boxId: 'bad' })],
    ));
    expect(malformed.decision.classification).toBe('blocked_box_malformed');

    const wrongScript = await assess(source(
      'http://127.0.0.1:9052',
      [legacyBox({ ergoTree: OTHER_TREE })],
    ));
    expect(wrongScript.decision.classification).toBe('blocked_script_mismatch');

    const duplicate = await assess(source(
      'http://127.0.0.1:9052',
      [legacyBox(), legacyBox()],
    ));
    expect(duplicate.decision.classification).toBe('blocked_box_malformed');
    expect(duplicate.decision.blockers.map(blocker => blocker.code))
      .toContain('blocked_legacy_utxo_present');
  });

  it('blocks lagging and drifting address indexes before a zero-UTXO decision', async () => {
    const lagging = source('http://127.0.0.1:9052');
    lagging.getIndexedHeight = vi.fn(async () => ({
      indexedHeight: TIP_HEIGHT - 1,
      fullHeight: TIP_HEIGHT,
    }));
    await expect(assess(lagging)).rejects.toMatchObject({
      classification: 'blocked_index_unsynchronized',
    });
    expect(lagging.getUnspentBoxesByAddress).not.toHaveBeenCalled();

    const drifting = source('http://127.0.0.1:9052');
    drifting.getInfo = vi.fn()
      .mockResolvedValueOnce({ fullHeight: TIP_HEIGHT, network: 'testnet' })
      .mockResolvedValueOnce({ fullHeight: TIP_HEIGHT + 1, network: 'testnet' });
    drifting.getIndexedHeight = vi.fn()
      .mockResolvedValueOnce({ indexedHeight: TIP_HEIGHT, fullHeight: TIP_HEIGHT })
      .mockResolvedValueOnce({ indexedHeight: TIP_HEIGHT + 1, fullHeight: TIP_HEIGHT + 1 });
    drifting.getBestHeader = vi.fn()
      .mockResolvedValueOnce({ height: TIP_HEIGHT, id: TIP_ID })
      .mockResolvedValueOnce({ height: TIP_HEIGHT + 1, id: 'ab'.repeat(32) });
    expect((await assess(drifting)).decision.classification)
      .toBe('blocked_node_view_unstable');
  });

  it('blocks same-height reorgs and cross-source snapshot disagreement', async () => {
    const sameHeightReorg = source('http://127.0.0.1:9052');
    sameHeightReorg.getBestHeader = vi.fn()
      .mockResolvedValueOnce({ height: TIP_HEIGHT, id: TIP_ID })
      .mockResolvedValueOnce({ height: TIP_HEIGHT, id: 'ac'.repeat(32) });
    expect((await assess(sameHeightReorg)).decision.classification)
      .toBe('blocked_node_view_unstable');

    const disagreeingWitness = source('http://127.0.0.1:9053');
    disagreeingWitness.getBestHeader = vi.fn(async () => ({
      height: TIP_HEIGHT,
      id: 'ad'.repeat(32),
    }));
    await expect(assess(
      source('http://127.0.0.1:9052'),
      disagreeingWitness,
    )).rejects.toMatchObject({ classification: 'blocked_source_disagreement' });
  });

  it('blocks duplicate origin identity, wrong network, wrong anchor, and unexpected digest', async () => {
    const primary = source('http://127.0.0.1:9052');
    await expect(assess(primary, primary)).rejects.toMatchObject({
      classification: 'blocked_source_identity',
    });
    await expect(assess(
      primary,
      source('http://127.0.0.1:9052'),
    )).rejects.toMatchObject({ classification: 'blocked_source_identity' });

    const wrongNetwork = source('http://127.0.0.1:9052');
    wrongNetwork.getInfo = vi.fn(async () => ({ fullHeight: TIP_HEIGHT, network: 'mainnet' }));
    await expect(assess(wrongNetwork)).rejects.toMatchObject({
      classification: 'blocked_network_mismatch',
    });

    const wrongAnchor = source('http://127.0.0.1:9052');
    wrongAnchor.getBlockHeaderIdsAtHeight = vi.fn(async () => ['bc'.repeat(32)]);
    await expect(assess(wrongAnchor)).rejects.toMatchObject({
      classification: 'blocked_anchor_policy',
    });

    const value = manifest();
    await expect(assessLegacyMcuCutover({
      manifest: value,
      expectedManifestSha256Hex: 'ff'.repeat(32),
      primarySource: primary,
      witnessSource: source('http://127.0.0.1:9053'),
    })).rejects.toBeInstanceOf(LegacyMcuCutoverBlockedError);
  });

  it('enforces the manifest anchor minimum-depth and maximum-age window', async () => {
    const shallow = structuredClone(manifest());
    shallow.network.anchorHeader.minimumDepth = 101;
    await expect(assess(
      source('http://127.0.0.1:9052'),
      source('http://127.0.0.1:9053'),
      validateLegacyMcuCutoverManifest(shallow),
    )).rejects.toMatchObject({ classification: 'blocked_anchor_policy' });

    const stale = structuredClone(manifest());
    stale.network.anchorHeader.maximumAgeBlocks = 99;
    await expect(assess(
      source('http://127.0.0.1:9052'),
      source('http://127.0.0.1:9053'),
      validateLegacyMcuCutoverManifest(stale),
    )).rejects.toMatchObject({ classification: 'blocked_anchor_policy' });
  });

  it('keeps the dedicated CLI explicit, dual-source, read-only, and outside runtime authority', () => {
    expect(() => parseLegacyMcuCutoverArgs(['--address', ADDRESS])).toThrow(/Unknown argument/);
    expect(() => parseLegacyMcuCutoverArgs(['--current-height', '10'])).toThrow(/Unknown argument/);
    expect(() => parseLegacyMcuCutoverArgs(['--node-url', 'http://127.0.0.1:9052']))
      .toThrow(/Unknown argument/);
    expect(() => parseLegacyMcuCutoverArgs([])).toThrow(/--manifest is required/);
    expect(parseLegacyMcuCutoverArgs([
      '--manifest', 'manifest.json',
      '--expected-manifest-sha256', '11'.repeat(32),
      '--primary-node-url', 'http://127.0.0.1:9052',
      '--witness-node-url', 'http://127.0.0.1:9053',
      '--json-out', 'report.json',
    ])).toMatchObject({
      manifestPath: 'manifest.json',
      primaryNodeUrl: 'http://127.0.0.1:9052',
      witnessNodeUrl: 'http://127.0.0.1:9053',
      jsonOut: 'report.json',
    });

    const cliSource = readFileSync(
      new URL('./scripts/legacy-mcu-cutover-assess.ts', import.meta.url),
      'utf8',
    );
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(cliSource).toContain('AuthenticatedV2VaultReadOnlyNodeClient');
    expect(cliSource).not.toMatch(/ErgoClient|fleet-signer|StateTracker|deployed_state|dotenv|process\.env/);
    expect(cliSource).not.toMatch(/submitTransaction|signAndSubmit|checkTransaction|buildTransaction/);
    expect(packageJson.scripts['cutover:legacy-mcu-assess'])
      .toBe('tsx src/scripts/legacy-mcu-cutover-assess.ts');
  });
});
