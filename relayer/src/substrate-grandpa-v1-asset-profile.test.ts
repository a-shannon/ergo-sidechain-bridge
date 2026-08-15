import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
  selectSubstrateGrandpaV1AssetProfile,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
} from './profiles/substrate-grandpa-v1/trustless-burn-proof.js';

const sidechainIdHex = '11'.repeat(32);
const sidechainTxHashHex = '22'.repeat(32);

describe('Substrate/GRANDPA V1 asset profile', () => {
  it('selects the one static native-ERG profile with exact V1 semantics', () => {
    const profile = selectSubstrateGrandpaV1AssetProfile(
      SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
    );

    expect(profile).toBe(SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE);
    expect(profile).toEqual({
      assetProfileId: 'e2s.substrate-grandpa-v1.asset.native-erg.v1',
      burnLeafDomain: 'E2S_TRUSTLESS_BURN_LEAF_V1',
      burnLeafFormatVersion: 1,
      asset: 'ERG',
      assetIdHex: '00'.repeat(32),
      amountUnit: 'nanoERG',
      amountRange: 'positive-ergo-long',
      burnLeafAmountEncoding: 'u64be',
      pegInRuntimeAmountEncoding: 'u64le',
      committedVaultAmountEncoding: 'box-value-and-ergo-long-r6',
    });
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it.each([
    undefined,
    null,
    '',
    'e2s.substrate-grandpa-v1.asset.native-erg.v2',
    'e2s.substrate-grandpa-v1.asset.token.v1',
    'E2S.SUBSTRATE-GRANDPA-V1.ASSET.NATIVE-ERG.V1',
  ])('rejects an unknown asset-profile identifier fail closed', profileId => {
    expect(() => selectSubstrateGrandpaV1AssetProfile(profileId)).toThrow(
      'unsupported Substrate/GRANDPA V1 asset profile',
    );
  });

  it('keeps nonzero asset bytes available only as a negative codec fixture', () => {
    const eventIndex = 7;
    const leaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: '33'.repeat(32),
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex,
        eventIndex,
      }),
      sidechainTxHashHex,
      eventIndex,
      recipientErgoTreeHashHex: '44'.repeat(32),
      amountNanoErg: '1000000',
      assetIdHex: '55'.repeat(32),
    });

    expect(leaf.assetIdHex).toBe('55'.repeat(32));
    expect(leaf.encodedLeafHex).toHaveLength(205 * 2);
    expect(leaf.assetIdHex).not.toBe(
      SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
    );
  });
});
