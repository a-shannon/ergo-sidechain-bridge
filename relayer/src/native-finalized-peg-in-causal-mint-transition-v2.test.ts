import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES,
  NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_RESULT_CANDIDATE_SCHEMA,
  assertNativeFinalizedPegInCausalMintTransitionV2ResultCandidateProvenance,
  buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate,
  deriveNativeFinalizedPegInCausalMintTransitionV2ExactRequestDigestHex,
  normalizeNativeFinalizedPegInCausalMintTransitionV2Request,
} from './native-finalized-peg-in-causal-mint-transition-v2.js';

const VECTOR = JSON.parse(readFileSync(new URL(
  '../test-vectors/native-finalized-peg-in-causal-mint-transition-v2.json',
  import.meta.url,
), 'utf8')) as Record<string, any>;

describe('native finalized causal peg-in mint transition V2', () => {
  it('consumes the exact Rust vector as a non-authorizing candidate', () => {
    const candidate = candidateFromVector();

    expect(candidate.schema).toBe(
      NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_RESULT_CANDIDATE_SCHEMA,
    );
    expect(candidate.headerBinding).toMatchObject({
      parentNativeHeight: '1024',
      childNativeHeight: '1025',
    });
    expect(candidate.causalTransition).toMatchObject({
      recordKeyHex: VECTOR.request.statement.recordKeyHex,
      parentPendingKeyCount: 1,
      postPendingKeyCount: 0,
    });
    expect(Object.values(candidate.boundary).filter(value => value === true)).toHaveLength(5);
    expect(candidate.boundary.nativeVerifierExecutionAuthenticated).toBe(false);
    expect(candidate.boundary.mintAuthorized).toBe(false);
    expect(candidate.boundary.broadcastAuthorized).toBe(false);
    expect(candidate.boundary.gate5Closed).toBe(false);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(() => assertNativeFinalizedPegInCausalMintTransitionV2ResultCandidateProvenance(
      candidate,
    )).not.toThrow();
    expect(() => assertNativeFinalizedPegInCausalMintTransitionV2ResultCandidateProvenance({
      ...candidate,
    })).toThrow(/candidate provenance is missing/i);
  });

  it('binds the exact outer bytes and rejects duplicate JSON keys', () => {
    const request = normalizeNativeFinalizedPegInCausalMintTransitionV2Request(VECTOR.request);
    const compact = Buffer.from(JSON.stringify(request), 'utf8');
    const pretty = Buffer.from(JSON.stringify(request, null, 2), 'utf8');
    const verification = structuredClone(VECTOR.expected);
    verification.requestDigestHex =
      deriveNativeFinalizedPegInCausalMintTransitionV2ExactRequestDigestHex(compact);
    expect(() => buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate({
      requestBytes: pretty,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification,
    })).toThrow(/exact request/i);

    const source = JSON.stringify(VECTOR.request);
    const duplicate = Buffer.from(
      `{"schema":${JSON.stringify(VECTOR.request.schema)},${source.slice(1)}`,
      'utf8',
    );
    expect(() => buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate({
      requestBytes: duplicate,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    })).toThrow(/duplicate JSON object key/i);
  });

  it('rejects oversized bytes before decoding', () => {
    expect(() => buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate({
      requestBytes: new Uint8Array(MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES + 1).fill(0xff),
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    })).toThrow(/request exceeds 67108864 bytes/i);
  });

  it.each([
    ['trust root', (value: any) => { value.trustAnchorDigestHex = hash('99'); }, /trust anchor/i],
    ['parent hash', (value: any) => {
      value.headerBinding.parentNativeBlockHashHex = hash('99');
    }, /nested T20C parent and child/i],
    ['child root', (value: any) => {
      value.headerBinding.childStateRootHex = hash('99');
    }, /nested T20C parent and child/i],
    ['direct child claim', (value: any) => {
      value.headerBinding.directParentChildVerified = false;
    }, /direct parent\/child verification/i],
    ['record key', (value: any) => { value.causalTransition.recordKeyHex = hash('99'); }, /record key differs/i],
    ['profile ID', (value: any) => { value.causalTransition.causalProfileIdHex = hash('00'); }, /must not be zero/i],
    ['pending counts', (value: any) => { value.causalTransition.postPendingKeyCount = 1; }, /one exact deletion/i],
    ['processed record', (value: any) => {
      value.causalTransition.processedRecordScaleHex = `0x02${value.causalTransition.processedRecordScaleHex.slice(4)}`;
    }, /nested T20C record/i],
    ['consumed successor', (value: any) => {
      value.causalTransition.consumedAdmissionV3Hex = replaceByte(
        value.causalTransition.consumedAdmissionV3Hex,
        100,
        '99',
      );
    }, /execution successor/i],
    ['parent proof count', (value: any) => { value.causalTransition.parentProofNodeCount -= 1; }, /exact request/i],
    ['post proof bytes', (value: any) => { value.causalTransition.postProofBytes -= 1; }, /exact request/i],
    ['proof claim', (value: any) => { value.causalTransition.verified = false; }, /causal transition verification/i],
    ['authority claim', (value: any) => { value.boundary.mintAuthorized = true; }, /mintAuthorized boundary/i],
    ['unknown field', (value: any) => { value.broadcastAuthorized = false; }, /unexpected field set/i],
  ] as const)('rejects isolated %s report drift', (_label, mutate, message) => {
    const verification = structuredClone(VECTOR.expected);
    mutate(verification);
    expect(() => buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate({
      requestBytes: Buffer.from(JSON.stringify(VECTOR.request), 'utf8'),
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification,
    })).toThrow(message);
  });

  it.each([
    ['record key', (value: any) => { value.statement.recordKeyHex = hash('99'); }],
    ['pending map key', (value: any) => {
      value.statement.pendingAdmissionStorageKeyHex = '0x01';
    }],
    ['nested request', (value: any) => {
      value.mintTransitionRequest.parentStateProofNodesHex[1] =
        value.mintTransitionRequest.parentStateProofNodesHex[0];
    }],
  ] as const)('rejects isolated %s request drift', (_label, mutate) => {
    const request = structuredClone(VECTOR.request);
    mutate(request);
    expect(() => normalizeNativeFinalizedPegInCausalMintTransitionV2Request(request))
      .toThrow();
  });
});

function candidateFromVector() {
  return buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate({
    requestBytes: Buffer.from(JSON.stringify(VECTOR.request), 'utf8'),
    trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
    verification: VECTOR.expected,
  });
}

function hash(byte: string): string {
  return `0x${byte.repeat(32)}`;
}

function replaceByte(value: string, offset: number, byte: string): string {
  const start = 2 + offset * 2;
  return `${value.slice(0, start)}${byte}${value.slice(start + 2)}`;
}
