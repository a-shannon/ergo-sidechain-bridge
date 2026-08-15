import { createHash } from 'crypto';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  legacyMcuCutoverManifestDigestHex,
  parseLegacyMcuCutoverManifestSource,
  validateLegacyMcuCutoverManifest,
  type LegacyMcuCutoverManifestV1,
} from './legacy-mcu-cutover-manifest.js';

const TREE_A = '10010100d17300';
const ADDRESS_A = ErgoAddress.fromErgoTree(TREE_A, Network.Testnet).toString();

function rawSha256Hex(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function manifestValue(): LegacyMcuCutoverManifestV1 {
  return {
    schemaVersion: 'ergo.bridge.legacy-mcu-manifest.v1',
    kind: 'legacy-mcu-address-script-manifest',
    manifestId: 'legacy-mcu-v1-testnet',
    network: {
      id: 'ergo-testnet',
      nodeInfoNetwork: 'testnet',
      addressNetworkPrefix: 16,
      p2sAddressHeader: 19,
      anchorHeader: {
        height: 1,
        idHex: '22'.repeat(32),
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
      basis: [{
        reference: 'repository://docs/reviewed-legacy-mcu-history.md',
        sha256Hex: '33'.repeat(32),
      }],
    },
    entries: [{
      ordinal: 0,
      scriptRole: 'legacy-mcu-v1',
      address: ADDRESS_A,
      addressHeader: 19,
      ergoTreeHex: TREE_A,
      ergoTreeSha256Hex: rawSha256Hex(TREE_A),
    }],
  };
}

describe('legacy MCU cutover manifest', () => {
  it('validates the exact V1 schema and computes an order-independent canonical digest', () => {
    const manifest = validateLegacyMcuCutoverManifest(manifestValue());
    const reordered = {
      entries: manifest.entries,
      coverage: manifest.coverage,
      network: manifest.network,
      manifestId: manifest.manifestId,
      kind: manifest.kind,
      schemaVersion: manifest.schemaVersion,
    };

    expect(legacyMcuCutoverManifestDigestHex(manifest))
      .toBe('9c47e77f76343ede5b9f63b1d6b9a9b65728c619d91fece7164a1edc774f8783');
    expect(legacyMcuCutoverManifestDigestHex(
      validateLegacyMcuCutoverManifest(reordered),
    )).toBe(legacyMcuCutoverManifestDigestHex(manifest));
  });

  it('rejects duplicate JSON keys and unknown fields', () => {
    const source = JSON.stringify(manifestValue()).replace(
      '"kind":"legacy-mcu-address-script-manifest"',
      '"kind":"legacy-mcu-address-script-manifest","kind":"legacy-mcu-address-script-manifest"',
    );
    expect(() => parseLegacyMcuCutoverManifestSource(source)).toThrow(/duplicate JSON object key: kind/);
    expect(() => validateLegacyMcuCutoverManifest({
      ...manifestValue(),
      ignoredPolicy: true,
    })).toThrow(/fields must be exactly/);
  });

  it('rejects count, order, address, tree, and raw-byte digest ambiguity', () => {
    expect(() => validateLegacyMcuCutoverManifest({
      ...manifestValue(),
      coverage: { ...manifestValue().coverage, declaredEntryCount: 2 },
    })).toThrow(/declaredEntryCount/);

    const wrongOrdinal = manifestValue();
    wrongOrdinal.entries[0].ordinal = 1;
    expect(() => validateLegacyMcuCutoverManifest(wrongOrdinal)).toThrow(/ordinal/);

    const wrongNetwork = manifestValue();
    wrongNetwork.entries[0].address = ErgoAddress.fromErgoTree(TREE_A, Network.Mainnet).toString();
    expect(() => validateLegacyMcuCutoverManifest(wrongNetwork)).toThrow(/addressHeader|network/);

    const wrongTree = manifestValue();
    wrongTree.entries[0].ergoTreeHex = '10010100d17400';
    wrongTree.entries[0].ergoTreeSha256Hex = rawSha256Hex(wrongTree.entries[0].ergoTreeHex);
    expect(() => validateLegacyMcuCutoverManifest(wrongTree)).toThrow(/does not encode ergoTreeHex/);

    const wrongDigest = manifestValue();
    wrongDigest.entries[0].ergoTreeSha256Hex = '44'.repeat(32);
    expect(() => validateLegacyMcuCutoverManifest(wrongDigest)).toThrow(/does not match ergoTreeHex/);
  });

  it('rejects contradictory network tuples and unbounded anchor freshness', () => {
    const contradictory = manifestValue();
    contradictory.network.id = 'ergo-mainnet';
    contradictory.network.nodeInfoNetwork = 'mainnet';
    expect(() => validateLegacyMcuCutoverManifest(contradictory))
      .toThrow(/address prefix must be 0 for mainnet/);

    const freeFormId = manifestValue();
    freeFormId.network.id = 'reviewed-testnet';
    expect(() => validateLegacyMcuCutoverManifest(freeFormId))
      .toThrow(/network.id must equal ergo-<nodeInfoNetwork>/);

    const invertedWindow = manifestValue();
    invertedWindow.network.anchorHeader.minimumDepth = 100;
    invertedWindow.network.anchorHeader.maximumAgeBlocks = 99;
    expect(() => validateLegacyMcuCutoverManifest(invertedWindow))
      .toThrow(/maximumAgeBlocks must be at least minimumDepth/);

    const shallowPolicy = manifestValue();
    shallowPolicy.network.anchorHeader.minimumDepth = 9;
    expect(() => validateLegacyMcuCutoverManifest(shallowPolicy))
      .toThrow(/minimumDepth must be at least 10/);

    const unboundedAge = manifestValue();
    unboundedAge.network.anchorHeader.maximumAgeBlocks = 721;
    expect(() => validateLegacyMcuCutoverManifest(unboundedAge))
      .toThrow(/exceeds the V1 freshness bound/);
  });

  it('requires a sorted, non-empty external coverage basis', () => {
    const emptyBasis = manifestValue();
    emptyBasis.coverage.basis = [];
    expect(() => validateLegacyMcuCutoverManifest(emptyBasis)).toThrow(/basis must not be empty/);

    const unsortedBasis = manifestValue();
    unsortedBasis.coverage.basis = [
      { reference: 'repository://z', sha256Hex: '55'.repeat(32) },
      { reference: 'repository://a', sha256Hex: '66'.repeat(32) },
    ];
    expect(() => validateLegacyMcuCutoverManifest(unsortedBasis)).toThrow(/lexically sorted/);
  });
});
