import { createHash } from 'crypto';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from './committee-config.js';
import {
  parsePegInRouteManifestSource,
  pegInRouteManifestDigestHex,
  resolvePegInRouteMainChainLockSource,
  resolvePegInRouteSettlementVaultSource,
  sha256Utf8,
  validatePegInRouteManifest,
  type PegInRouteManifestV1,
} from './peg-in-route-manifest.js';

const ACTIVE_TREE = `1008cd02${'11'.repeat(32)}`;
const VAULT_TREE = `1008cd02${'22'.repeat(32)}`;
const LEGACY_TREE = `1008cd02${'33'.repeat(32)}`;
const ACTIVE_ADDRESS = ErgoAddress.fromErgoTree(ACTIVE_TREE, Network.Testnet).toString();
const VAULT_ADDRESS = ErgoAddress.fromErgoTree(VAULT_TREE, Network.Testnet).toString();
const LEGACY_ADDRESS = ErgoAddress.fromErgoTree(LEGACY_TREE, Network.Testnet).toString();
const TRACKER_NFT_ID = 'aa'.repeat(32);
const DUP_NFT_ID = 'bb'.repeat(32);

const TEMPLATE_SOURCE = [
  '{',
  '  val vault = fromBase16("SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER")',
  '  val committee = Coll(COMMITTEE_SIGMAPROP_PLACEHOLDERS)',
  '  atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)',
  '}',
].join('\n');
const VAULT_TEMPLATE_SOURCE = [
  '{',
  '  val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")',
  '  val dup = fromBase16("DUP_NFT_ID_PLACEHOLDER")',
  '  sigmaProp(tracker != dup)',
  '}',
].join('\n');

function rawSha256Hex(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function resolvedSource(): string {
  return injectCommitteePlaceholders(
    TEMPLATE_SOURCE,
    createCommitteeConfig(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES, '2'),
  ).replaceAll('SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER', VAULT_TREE);
}

function resolvedVaultSource(): string {
  return VAULT_TEMPLATE_SOURCE
    .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', TRACKER_NFT_ID)
    .replaceAll('DUP_NFT_ID_PLACEHOLDER', DUP_NFT_ID);
}

export function pegInRouteManifestFixture(): PegInRouteManifestV1 {
  return {
    schemaVersion: 'ergo.bridge.peg-in-route-manifest.v1',
    kind: 'committed-vault-route-manifest',
    manifestId: 'peg-in-route-v1-testnet',
    network: {
      id: 'ergo-testnet',
      nodeInfoNetwork: 'testnet',
      addressNetworkPrefix: 16,
      p2sAddressHeader: 19,
      anchorHeader: {
        height: 91,
        idHex: '44'.repeat(32),
        minimumDepth: 10,
        maximumAgeBlocks: 720,
      },
    },
    coverage: {
      mode: 'complete_active_and_historical_main-chain-lock_route_set',
      declaredLegacyCount: 1,
      cutoff: {
        event: 'committed_vault_v3_route_declared',
        sourceRevision: '55'.repeat(20),
      },
      basis: [{
        reference: 'repository://docs/reviewed-peg-in-route.md',
        sha256Hex: '66'.repeat(32),
      }],
    },
    route: {
      profile: 'committed-vault-v3',
      commitConfirmations: 10,
      committee: {
        publicKeysHex: [...CHECK_ONLY_COMMITTEE_PUBKEY_HEXES],
        threshold: 2,
      },
      mainChainLock: {
        scriptRole: 'refundable-deposit-staging',
        address: ACTIVE_ADDRESS,
        ergoTreeHex: ACTIVE_TREE,
        ergoTreeSha256Hex: rawSha256Hex(ACTIVE_TREE),
        source: {
          reference: 'contracts/MainChainLock.es',
          templateSha256Hex: sha256Utf8(TEMPLATE_SOURCE),
          resolvedSha256Hex: sha256Utf8(resolvedSource()),
        },
      },
      settlementVault: {
        scriptRole: 'configured-settlement-vault',
        profileId: 'main-chain-aggregate-unlock-trustless-v1-compatibility',
        address: VAULT_ADDRESS,
        ergoTreeHex: VAULT_TREE,
        ergoTreeSha256Hex: rawSha256Hex(VAULT_TREE),
        source: {
          reference: 'contracts/MainChainAggregateUnlockTrustless.es',
          templateSha256Hex: sha256Utf8(VAULT_TEMPLATE_SOURCE),
          resolvedSha256Hex: sha256Utf8(resolvedVaultSource()),
          trackerNftIdHex: TRACKER_NFT_ID,
          duplicatePreventionNftIdHex: DUP_NFT_ID,
        },
      },
    },
    legacyMainChainLocks: [{
      ordinal: 0,
      scriptRole: 'legacy-refundable-deposit-staging',
      version: 'legacy-v2',
      address: LEGACY_ADDRESS,
      ergoTreeHex: LEGACY_TREE,
      ergoTreeSha256Hex: rawSha256Hex(LEGACY_TREE),
    }],
  };
}

export const PEG_IN_ROUTE_TEMPLATE_FIXTURE = TEMPLATE_SOURCE;
export const PEG_IN_ROUTE_VAULT_TEMPLATE_FIXTURE = VAULT_TEMPLATE_SOURCE;

describe('peg-in route manifest', () => {
  it('validates exact route identities and computes a canonical digest', () => {
    const manifest = validatePegInRouteManifest(pegInRouteManifestFixture());
    expect(manifest.route.mainChainLock.address).toBe(ACTIVE_ADDRESS);
    expect(manifest.route.settlementVault.profileId).toBe(
      'main-chain-aggregate-unlock-trustless-v1-compatibility',
    );
    expect(pegInRouteManifestDigestHex(manifest)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resolves the exact committee and vault-bound MainChainLock source', () => {
    const manifest = validatePegInRouteManifest(pegInRouteManifestFixture());
    expect(resolvePegInRouteMainChainLockSource(manifest, TEMPLATE_SOURCE)).toBe(resolvedSource());
  });

  it('resolves the exact NFT-bound settlement-vault source', () => {
    const manifest = validatePegInRouteManifest(pegInRouteManifestFixture());
    expect(resolvePegInRouteSettlementVaultSource(manifest, VAULT_TEMPLATE_SOURCE))
      .toBe(resolvedVaultSource());
  });

  it('rejects duplicate JSON keys before ordinary parsing can overwrite them', () => {
    const source = JSON.stringify(pegInRouteManifestFixture()).replace(
      '"manifestId":"peg-in-route-v1-testnet"',
      '"manifestId":"first","manifestId":"peg-in-route-v1-testnet"',
    );
    expect(() => parsePegInRouteManifestSource(source)).toThrow('duplicate JSON object key');
  });

  it('rejects an ambiguous settlement-vault profile', () => {
    const manifest: any = structuredClone(pegInRouteManifestFixture());
    manifest.route.settlementVault.profileId = 'generic-vault';
    expect(() => validatePegInRouteManifest(manifest)).toThrow(
      'route.settlementVault.profileId must equal',
    );

    const sharedNft: any = structuredClone(pegInRouteManifestFixture());
    sharedNft.route.settlementVault.source.duplicatePreventionNftIdHex =
      sharedNft.route.settlementVault.source.trackerNftIdHex;
    expect(() => validatePegInRouteManifest(sharedNft)).toThrow('NFT IDs must differ');
  });

  it('rejects an address that does not encode the bound ErgoTree', () => {
    const manifest: any = structuredClone(pegInRouteManifestFixture());
    manifest.route.mainChainLock.address = VAULT_ADDRESS;
    expect(() => validatePegInRouteManifest(manifest)).toThrow(
      'route.mainChainLock.address does not encode ergoTreeHex',
    );
  });

  it('rejects commit depths below the source minimum', () => {
    const manifest: any = structuredClone(pegInRouteManifestFixture());
    manifest.route.commitConfirmations = 9;
    expect(() => validatePegInRouteManifest(manifest)).toThrow('must be at least 10');
  });

  it('rejects duplicate active, vault, or legacy identities', () => {
    const manifest: any = structuredClone(pegInRouteManifestFixture());
    manifest.legacyMainChainLocks[0].address = manifest.route.mainChainLock.address;
    manifest.legacyMainChainLocks[0].ergoTreeHex = manifest.route.mainChainLock.ergoTreeHex;
    manifest.legacyMainChainLocks[0].ergoTreeSha256Hex =
      manifest.route.mainChainLock.ergoTreeSha256Hex;
    expect(() => validatePegInRouteManifest(manifest)).toThrow('route script addresses must be unique');
  });

  it('rejects a changed template or resolved source', () => {
    const manifest = validatePegInRouteManifest(pegInRouteManifestFixture());
    expect(() => resolvePegInRouteMainChainLockSource(manifest, `${TEMPLATE_SOURCE}\n`)).toThrow(
      'template SHA-256',
    );
    const changed: any = structuredClone(manifest);
    changed.route.mainChainLock.source.resolvedSha256Hex = '77'.repeat(32);
    expect(() => resolvePegInRouteMainChainLockSource(changed, TEMPLATE_SOURCE)).toThrow(
      'resolved MainChainLock source SHA-256',
    );

    expect(() => resolvePegInRouteSettlementVaultSource(
      manifest,
      `${VAULT_TEMPLATE_SOURCE}\n`,
    )).toThrow('settlement-vault template SHA-256');
    const changedVault: any = structuredClone(manifest);
    changedVault.route.settlementVault.source.resolvedSha256Hex = '88'.repeat(32);
    expect(() => resolvePegInRouteSettlementVaultSource(
      changedVault,
      VAULT_TEMPLATE_SOURCE,
    )).toThrow('resolved settlement-vault source SHA-256');
  });

  it('rejects unknown fields and a stale anchor policy', () => {
    const unknown: any = structuredClone(pegInRouteManifestFixture());
    unknown.route.mainChainLock.unreviewed = true;
    expect(() => validatePegInRouteManifest(unknown)).toThrow('fields must be exactly');

    const stale: any = structuredClone(pegInRouteManifestFixture());
    stale.network.anchorHeader.maximumAgeBlocks = 721;
    expect(() => validatePegInRouteManifest(stale)).toThrow('freshness bound');
  });
});
