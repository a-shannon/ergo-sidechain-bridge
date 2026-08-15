import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import { deriveEip0045ContractIdHex } from './bridge-validity-finality-statement-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES,
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_SHA256_HEX,
  EIP0045_BRIDGE_VALIDITY_TRACKER_SOURCE_SHA256_HEX,
} from './bridge-validity-tracker-contract-v1.js';

const trackerSourceUrl =
  new URL('../../contracts/SPVTrackerValidityV1.es', import.meta.url);
const bridgeAttributesUrl =
  new URL('../../.gitattributes', import.meta.url);

describe('EIP-0045 bridge validity tracker identity', () => {
  it('freezes the exact pinned-compiler proposition and source identities', () => {
    const proposition = Buffer.from(
      EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
      'hex',
    );
    const source = readFileSync(trackerSourceUrl);

    expect(proposition).toHaveLength(
      EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES,
    );
    expect(sha256Hex(proposition))
      .toBe(EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_SHA256_HEX);
    expect(deriveEip0045ContractIdHex(proposition))
      .toBe(EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX);
    expect(sha256Hex(source))
      .toBe(EIP0045_BRIDGE_VALIDITY_TRACKER_SOURCE_SHA256_HEX);
  });

  it('pins the trust root without adding committee authorization', () => {
    const source = readFileSync(trackerSourceUrl, 'ascii');

    expect(source).toContain('verifyStark(');
    expect(source).toContain('E2S_SPV_VALIDITY_V1');
    expect(source).toContain('R9[Coll[Byte]]');
    expect(source).not.toContain('R9[SigmaProp]');
    expect(source).not.toContain('proveDlog');
    expect(source).not.toContain('atLeast(');
  });

  it('materializes the source identity with canonical LF bytes', () => {
    const rules = readFileSync(bridgeAttributesUrl, 'ascii')
      .split(/\r?\n/u)
      .map(rule => rule.trim());

    expect(rules).toContain(
      'contracts/SPVTrackerValidityV1.es text eol=lf',
    );
  });
});

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
