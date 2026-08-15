import { keccak256 } from 'ethers';
import { describe, expect, it } from 'vitest';

import {
  assertHistoricalSidechainObservationIdentity,
} from './sidechain-client.js';

const BRIDGE_ADDRESS = `0x${'11'.repeat(20)}`;
const SERG_ADDRESS = `0x${'22'.repeat(20)}`;
const MIGRATED_OWNER_ADDRESS = `0x${'33'.repeat(20)}`;
const BRIDGE_CODE = '0x6001600055';
const SERG_CODE = '0x6002600055';

function validIdentityInput() {
  return {
    expectedChainId: '1337',
    observedChainId: '1337',
    bridgeAddress: BRIDGE_ADDRESS,
    sergAddress: SERG_ADDRESS,
    observedSergTokenAddress: SERG_ADDRESS,
    observedSergOwnerAddress: BRIDGE_ADDRESS,
    bridgeCode: BRIDGE_CODE,
    sergCode: SERG_CODE,
    expectedBridgeCodeHashHex: keccak256(BRIDGE_CODE).slice(2),
    expectedSergCodeHashHex: keccak256(SERG_CODE).slice(2),
  };
}

describe('SidechainClient historical observation identity', () => {
  it('keeps historical receipt observation available after sERG ownership migration', () => {
    const identity = assertHistoricalSidechainObservationIdentity({
      ...validIdentityInput(),
      observedSergOwnerAddress: MIGRATED_OWNER_ADDRESS,
    });

    expect(identity).toEqual({ sergOwnership: 'migrated_or_renounced' });
  });

  it('keeps historical receipt observation available after ownership renouncement', () => {
    const identity = assertHistoricalSidechainObservationIdentity({
      ...validIdentityInput(),
      observedSergOwnerAddress: `0x${'00'.repeat(20)}`,
    });

    expect(identity).toEqual({ sergOwnership: 'migrated_or_renounced' });
  });

  it('still rejects chain, bridge-token, and runtime-code identity drift', () => {
    expect(() => assertHistoricalSidechainObservationIdentity({
      ...validIdentityInput(),
      observedChainId: '1338',
    })).toThrow(/chain ID/i);
    expect(() => assertHistoricalSidechainObservationIdentity({
      ...validIdentityInput(),
      observedSergTokenAddress: MIGRATED_OWNER_ADDRESS,
    })).toThrow(/sERG token/i);
    expect(() => assertHistoricalSidechainObservationIdentity({
      ...validIdentityInput(),
      bridgeCode: '0x6000',
    })).toThrow(/ErgoBridge runtime code/i);
    expect(() => assertHistoricalSidechainObservationIdentity({
      ...validIdentityInput(),
      sergCode: '0x6000',
    })).toThrow(/sERG runtime code/i);
  });
});
