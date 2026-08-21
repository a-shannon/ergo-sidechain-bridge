import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  decodeSubstrateFederatedIsolatedDevnetFrontierLabMintProofStatementV2,
} from './substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1-fixture.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

describe('isolated devnet Frontier mint-proof consumer V2 application', () => {
  it('accepts the reference statement bound to the deterministic LAB deployment', () => {
    expect(() =>
      decodeSubstrateFederatedIsolatedDevnetFrontierLabMintProofStatementV2(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
      )).not.toThrow();
  });

  it.each([
    ['bridgeAddressHex', '0x0606060606060606060606060606060606060606'],
    ['tokenAddressHex', '0x0707070707070707070707070707070707070707'],
  ] as const)(
    'rejects a canonical statement with a different %s before Cargo',
    (field, value) => {
      const statement =
        decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
        );
      const sourceIntent = decodePegInSourceIntentV2Hex(
        statement.sourceIntentHex,
      );
      const changedIntent = {
        ...sourceIntent,
        [field]: value,
      };
      const changedStatementHex =
        encodeValidityApplicationPooledReserveMintReservationStatementV4Hex({
          ...statement,
          sourceIntentHex: encodePegInSourceIntentV2Hex(changedIntent),
          sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(changedIntent),
        });

      expect(() =>
        decodeSubstrateFederatedIsolatedDevnetFrontierLabMintProofStatementV2(
          changedStatementHex,
        )).toThrow(
          'Frontier LAB proof application differs from the deterministic deployment',
        );
    },
  );
});
