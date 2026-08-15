export const SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID =
  'e2s.substrate-grandpa-v1.asset.native-erg.v1' as const;

export const SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE = Object.freeze({
  assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
  burnLeafDomain: 'E2S_TRUSTLESS_BURN_LEAF_V1' as const,
  burnLeafFormatVersion: 1 as const,
  asset: 'ERG' as const,
  assetIdHex: '00'.repeat(32),
  amountUnit: 'nanoERG' as const,
  amountRange: 'positive-ergo-long' as const,
  burnLeafAmountEncoding: 'u64be' as const,
  pegInRuntimeAmountEncoding: 'u64le' as const,
  committedVaultAmountEncoding: 'box-value-and-ergo-long-r6' as const,
});

export type SubstrateGrandpaV1AssetProfile =
  typeof SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE;

/**
 * Select the statically registered V1 asset semantics. The profile ID is an
 * off-wire runtime selection boundary and does not change the frozen burn
 * leaf, checkpoint, candidate or contract bytes.
 */
export function selectSubstrateGrandpaV1AssetProfile(
  assetProfileId: unknown,
): SubstrateGrandpaV1AssetProfile {
  if (assetProfileId !== SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID) {
    throw new Error('unsupported Substrate/GRANDPA V1 asset profile');
  }
  return SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE;
}
