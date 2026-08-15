import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import { deriveEip0045ContractIdHex } from './bridge-validity-finality-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_SHA256_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_SHA256_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';

const trackerSourceUrl = new URL(
  '../../contracts/SPVTrackerValidityApplicationV2.es',
  import.meta.url,
);

describe('EIP-0045 application-bound validity tracker identity', () => {
  it('freezes one distinct pinned-compiler proposition and source identity', () => {
    const proposition = Buffer.from(
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
      'hex',
    );
    const source = readFileSync(trackerSourceUrl);

    expect(proposition).toHaveLength(
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES,
    );
    expect(sha256Hex(proposition))
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_SHA256_HEX);
    expect(deriveEip0045ContractIdHex(proposition))
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX);
    expect(sha256Hex(source))
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_SHA256_HEX);
  });

  it('pins application semantics and derives the anchor tuple from one header', () => {
    const source = readFileSync(trackerSourceUrl, 'ascii');

    expect(source).toContain('SPVTrackerValidityApplicationV2');
    expect(source).toContain('E2S_SPV_VALIDITY_APPLICATION_KEY_V2');
    expect(source).toContain('E2S_SPV_VALIDITY_APPLICATION_VALUE_V2');
    expect(source).toContain('E2S_CAUSAL_APPLICATION_BINDING_V2');
    expect(source).toContain('CONTEXT.headers(headerIndex)');
    expect(source).toContain('anchorHeader.id');
    expect(source).toContain('anchorHeader.height');
    expect(source).toContain('anchorHeader.extensionRoot');
    expect(source).toContain(
      'successor.creationInfo._1 >= SELF.creationInfo._1',
    );
    expect(source).toContain('successor.creationInfo._1 <= HEIGHT');
    expect(source).toContain(
      'successor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag',
    );
    expect(source).toContain('successor.R8[Int].get <= HEIGHT');
    expect(source).not.toContain('successor.R8[Int].get == HEIGHT');
    expect(source).toContain('verifyStark(');
    expect(source).toContain('R9[Coll[Byte]]');
    expect(source).not.toContain('R9[SigmaProp]');
    expect(source).not.toContain('proveDlog');
    expect(source).not.toContain('atLeast(');
    expect(EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX)
      .toBe('11'.repeat(32));
    expect(EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX)
      .toBe('22'.repeat(32));
    expect(EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX)
      .toBe('55'.repeat(32));
    expect(EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX)
      .toBe(
        'a0a5ba76f51548dfa7148b623cedcbb6205ce1f51428a508480ece5df66e73f5',
      );
    expect(EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX)
      .toHaveLength(240 * 2);
    expect(source).toContain(
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    );
  });
});

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
