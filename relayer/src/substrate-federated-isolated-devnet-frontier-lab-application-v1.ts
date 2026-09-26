export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1 =
  '0x970951a12f975e6762482aca81e57d5a2a4e73f4' as const;

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1 =
  '0xc01ee7f10ea4af4673cfff62710e1d7792aba8f3' as const;

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1 =
  '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac' as const;

export function assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1(
  application: Readonly<{
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
  }>,
): void {
  if (
    canonicalAddress(application.bridgeAddressHex, 'bridge')
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1
    || canonicalAddress(application.tokenAddressHex, 'token')
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1
  ) {
    throw new Error(
      'Frontier LAB proof application differs from the deterministic deployment',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerV1(
  identity: Readonly<{
    readonly bridgeOwnerAddressHex: string;
    readonly recipientAddressHex: string;
  }>,
): void {
  if (
    canonicalAddress(identity.bridgeOwnerAddressHex, 'bridge owner')
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1
    || canonicalAddress(`0x${identity.recipientAddressHex}`, 'recipient')
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1
  ) {
    throw new Error(
      'Frontier LAB bridge owner or recipient differs from the deterministic deployment',
    );
  }
}

function canonicalAddress(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    throw new Error(`Frontier LAB ${label} address is invalid`);
  }
  return value.toLowerCase();
}
