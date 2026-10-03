export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2 =
  '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac' as const;

export function assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2(
  identity: Readonly<{
    readonly bridgeAddressHex: string;
    readonly bridgeOwnerAddressHex: string;
    readonly recipientAddressHex: string;
    readonly removedBaseSudoAddressHex: string;
    readonly tokenAddressHex: string;
  }>,
): void {
  const bridge = canonicalAddress(identity.bridgeAddressHex, 'bridge');
  const owner = canonicalAddress(
    identity.bridgeOwnerAddressHex,
    'bridge owner',
  );
  const recipient = canonicalAddress(
    `0x${identity.recipientAddressHex}`,
    'recipient',
  );
  const removedBaseSudo = canonicalAddress(
    identity.removedBaseSudoAddressHex,
    'removed base Sudo',
  );
  const token = canonicalAddress(identity.tokenAddressHex, 'token');
  if (owner === ZERO_ADDRESS || recipient !== owner) {
    throw new Error(
      'Frontier LAB request-bound owner and recipient must be one nonzero identity',
    );
  }
  if (
    removedBaseSudo
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2
  ) {
    throw new Error(
      'Frontier LAB removed base Sudo differs from the deterministic source profile',
    );
  }
  if (owner === removedBaseSudo) {
    throw new Error(
      'Frontier LAB request-bound owner must differ from the removed base Sudo',
    );
  }
  if (bridge === token || owner === bridge || owner === token) {
    throw new Error(
      'Frontier LAB bridge, token, and request-bound owner must be pairwise distinct',
    );
  }
}

function canonicalAddress(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    throw new Error(`Frontier LAB ${label} address is invalid`);
  }
  return value.toLowerCase();
}

const ZERO_ADDRESS = `0x${'00'.repeat(20)}`;
