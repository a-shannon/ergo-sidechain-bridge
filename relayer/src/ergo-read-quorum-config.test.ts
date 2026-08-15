import { describe, expect, it } from 'vitest';

import { getErgoReadQuorumSourceIdentityConfig } from './config.js';

const hex = (byte: string): string => byte.repeat(32);

describe('Ergo read-quorum configuration', () => {
  it('keeps the daemon configuration fail-closed when no witness is configured', () => {
    expect(getErgoReadQuorumSourceIdentityConfig({
      witnessNodeUrl: undefined,
      primaryNodeIdentityDigestHex: undefined,
      primaryAdministrationIdentityDigestHex: undefined,
      witnessNodeIdentityDigestHex: undefined,
      witnessAdministrationIdentityDigestHex: undefined,
    })).toBeNull();
  });

  it('requires every pinned source identity once a witness is configured', () => {
    expect(() => getErgoReadQuorumSourceIdentityConfig({
      witnessNodeUrl: 'http://127.0.0.1:9152',
      primaryNodeIdentityDigestHex: hex('11'),
      primaryAdministrationIdentityDigestHex: hex('12'),
      witnessNodeIdentityDigestHex: undefined,
      witnessAdministrationIdentityDigestHex: undefined,
    })).toThrow(
      'ERGO_READ_QUORUM_WITNESS_IDENTITY_DIGEST, '
      + 'ERGO_READ_QUORUM_WITNESS_ADMINISTRATION_DIGEST',
    );
  });

  it('returns the complete static source binding without adding authority', () => {
    expect(getErgoReadQuorumSourceIdentityConfig({
      witnessNodeUrl: 'http://127.0.0.1:9152',
      primaryNodeIdentityDigestHex: hex('21'),
      primaryAdministrationIdentityDigestHex: hex('22'),
      witnessNodeIdentityDigestHex: hex('23'),
      witnessAdministrationIdentityDigestHex: hex('24'),
    })).toEqual({
      witnessNodeUrl: 'http://127.0.0.1:9152',
      primaryNodeIdentityDigestHex: hex('21'),
      primaryAdministrationIdentityDigestHex: hex('22'),
      witnessNodeIdentityDigestHex: hex('23'),
      witnessAdministrationIdentityDigestHex: hex('24'),
    });
  });
});
