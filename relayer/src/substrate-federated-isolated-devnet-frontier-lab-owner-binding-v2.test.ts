import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from './substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
} from './substrate-federated-isolated-devnet-frontier-lab-owner-binding-v2.js';

describe('isolated devnet Frontier LAB request-bound owner V2', () => {
  const requestOwner = '0x4f9b9f038c4ce5b83af4972f0bf38bcac7316bdd';

  it('binds an arbitrary nonzero request owner to the exact recipient', () => {
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        bridgeOwnerAddressHex: requestOwner,
        recipientAddressHex: requestOwner.slice(2),
        removedBaseSudoAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).not.toThrow();
  });

  it('rejects zero, recipient drift, and source-profile Sudo drift independently', () => {
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        bridgeOwnerAddressHex: `0x${'00'.repeat(20)}`,
        recipientAddressHex: '00'.repeat(20),
        removedBaseSudoAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).toThrow(/one nonzero identity/u);

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        bridgeOwnerAddressHex: requestOwner,
        recipientAddressHex: '07'.repeat(20),
        removedBaseSudoAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).toThrow(/owner and recipient/u);

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        bridgeOwnerAddressHex: requestOwner,
        recipientAddressHex: requestOwner.slice(2),
        removedBaseSudoAddressHex: `0x${'08'.repeat(20)}`,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).toThrow(/removed base Sudo differs/u);
  });

  it('rejects the removed base Sudo and every application identity collision', () => {
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        bridgeOwnerAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
        recipientAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2
            .slice(2),
        removedBaseSudoAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).toThrow(/owner must differ from the removed base Sudo/u);

    for (const owner of [
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
    ]) {
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
          bridgeAddressHex:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
          bridgeOwnerAddressHex: owner,
          recipientAddressHex: owner.slice(2),
          removedBaseSudoAddressHex:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
          tokenAddressHex:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
        })).toThrow(/must be pairwise distinct/u);
    }
  });

  it('rejects malformed owner and recipient addresses before comparison', () => {
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        bridgeOwnerAddressHex: requestOwner.slice(2),
        recipientAddressHex: requestOwner.slice(2),
        removedBaseSudoAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).toThrow(/bridge owner address is invalid/u);

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        bridgeOwnerAddressHex: requestOwner,
        recipientAddressHex: `0x${requestOwner.slice(2)}`,
        removedBaseSudoAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).toThrow(/recipient address is invalid/u);
  });
});
