import { describe, expect, it } from 'vitest';

import {
  assertAuthenticatedSettlementCheckPolicy,
} from './authenticated-settlement-check-policy.js';

const allowed = {
  checkEnabled: true,
  broadcastEnabled: false,
  deployedErgoNetwork: 'testnet',
  observedErgoNetwork: 'testnet',
  sidechainNetwork: 'patched-devnet',
  ergoNodeUrl: 'http://127.0.0.1:9052',
  signerErgoNodeUrl: 'http://localhost:9052',
  sidechainRpcUrl: 'http://localhost:9945',
};

describe('authenticated settlement check policy', () => {
  it('allows only an explicitly enabled non-mainnet check-only shell', () => {
    expect(() => assertAuthenticatedSettlementCheckPolicy(allowed)).not.toThrow();
  });

  it.each([
    ['missing check approval', { checkEnabled: false }, /AUTHENTICATED_SETTLEMENT_CHECK_ENABLED=true/i],
    ['broadcast enabled', { broadcastEnabled: true }, /BRIDGE_BROADCAST_ENABLED.*false/i],
    ['Ergo mainnet deployment', { deployedErgoNetwork: 'mainnet' }, /non-mainnet Ergo deployment/i],
    ['live Ergo mainnet', { observedErgoNetwork: 'mainnet' }, /live non-mainnet Ergo node/i],
    ['Ergo network mismatch', { observedErgoNetwork: 'devnet' }, /networks do not match/i],
    ['sidechain mainnet', { sidechainNetwork: 'mainnet' }, /non-mainnet sidechain/i],
    ['unknown Ergo network', { deployedErgoNetwork: 'staging' }, /non-mainnet Ergo/i],
    ['unknown sidechain network', { sidechainNetwork: '' }, /non-mainnet sidechain/i],
    ['remote Ergo node', { ergoNodeUrl: 'https://testnet.example.org' }, /Ergo node.*loopback/i],
    ['remote signer Ergo node', { signerErgoNodeUrl: 'https://testnet.example.org' }, /signer Ergo node.*loopback/i],
    ['remote sidechain RPC', { sidechainRpcUrl: 'https://sidechain.example.org' }, /sidechain RPC.*loopback/i],
    ['credentialed loopback node', { ergoNodeUrl: 'http://user:pass@127.0.0.1:9052' }, /Ergo node.*loopback/i],
    ['credentialed signer node', { signerErgoNodeUrl: 'http://user:pass@127.0.0.1:9052' }, /signer Ergo node.*loopback/i],
    ['routed signer node', { signerErgoNodeUrl: 'http://127.0.0.1:9052/proxy' }, /signer Ergo node.*loopback/i],
  ])('rejects %s', (_label, change, message) => {
    expect(() => assertAuthenticatedSettlementCheckPolicy({
      ...allowed,
      ...change,
    })).toThrow(message);
  });
});
