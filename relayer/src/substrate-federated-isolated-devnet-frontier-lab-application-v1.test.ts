import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1,
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from './substrate-federated-isolated-devnet-frontier-lab-application-v1.js';

describe('isolated devnet Frontier LAB application V1', () => {
  it('accepts only the deterministic LAB deployment identity', () => {
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).not.toThrow();

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
        bridgeAddressHex: '0x0606060606060606060606060606060606060606',
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).toThrow(
        'Frontier LAB proof application differs from the deterministic deployment',
      );

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        tokenAddressHex: '0x0707070707070707070707070707070707070707',
      })).toThrow(
        'Frontier LAB proof application differs from the deterministic deployment',
      );
  });

  it('rejects malformed addresses before comparing the deployment identity', () => {
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
        bridgeAddressHex: '970951a12f975e6762482aca81e57d5a2a4e73f4',
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      })).toThrow('Frontier LAB bridge address is invalid');
  });

  it('binds the peg-in recipient to the distinct deterministic LAB owner', () => {
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerV1({
        bridgeOwnerAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
        recipientAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1
            .slice(2),
      })).not.toThrow();

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerV1({
        bridgeOwnerAddressHex: '0x0606060606060606060606060606060606060606',
        recipientAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1
            .slice(2),
      })).toThrow(
        'Frontier LAB bridge owner or recipient differs from the deterministic deployment',
      );

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerV1({
        bridgeOwnerAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
        recipientAddressHex: '07'.repeat(20),
      })).toThrow(
        'Frontier LAB bridge owner or recipient differs from the deterministic deployment',
      );
  });
});
