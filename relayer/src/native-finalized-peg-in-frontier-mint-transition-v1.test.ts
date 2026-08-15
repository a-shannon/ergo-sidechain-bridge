import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_RESULT_CANDIDATE_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_STATUS,
  assertNativeFinalizedPegInFrontierMintTransitionV1ResultCandidateProvenance,
  buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate,
  deriveNativeFinalizedPegInFrontierMintTransitionV1ExactRequestDigestHex,
  normalizeNativeFinalizedPegInFrontierMintTransitionV1Request,
} from './native-finalized-peg-in-frontier-mint-transition-v1.js';

const VECTOR = JSON.parse(readFileSync(resolve(
  import.meta.dirname,
  '../test-vectors/native-finalized-peg-in-frontier-mint-transition-v1.json',
), 'utf8')) as {
  trustedAnchorDigestHex: string;
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
};

describe('native finalized peg-in Frontier mint-transition V1', () => {
  it('consumes the exact deterministic Rust verifier vector without granting authority', () => {
    const requestBytes = Buffer.from(JSON.stringify(VECTOR.request), 'utf8');
    const candidate = buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate({
      requestBytes,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    });

    expect(candidate.schema).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_RESULT_CANDIDATE_SCHEMA,
    );
    expect(candidate.reportedSourceResultStatus).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_STATUS,
    );
    expect(candidate.parentLink).toMatchObject({
      parentNativeHeight: '1024',
      eventNativeHeight: '1025',
    });
    expect(candidate.parentLink).not.toHaveProperty('directParentVerified');
    expect(candidate.transition).toMatchObject({
      parentProcessedPegIn: false,
      postProcessedPegIn: true,
      parentTokenTotalSupply: '0',
      postTokenTotalSupply: '2000000',
      tokenTotalSupplyDelta: '2000000',
      parentRecipientBalance: '0',
      postRecipientBalance: '2000000',
      recipientBalanceDelta: '2000000',
      mintAmount: '2000000',
    });
    expect(candidate.transition).not.toHaveProperty('verified');
    expect(Object.values(candidate.boundary).filter(value => value === true)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(candidate.boundary.mintAuthorized).toBe(false);
    expect(candidate.boundary.daemonAdmissionAuthorized).toBe(false);
    expect(candidate.boundary.broadcastAuthorized).toBe(false);
    expect(candidate.boundary.gate5Closed).toBe(false);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(() =>
      assertNativeFinalizedPegInFrontierMintTransitionV1ResultCandidateProvenance(candidate))
      .not.toThrow();
    expect(() =>
      assertNativeFinalizedPegInFrontierMintTransitionV1ResultCandidateProvenance({
        ...candidate,
      }))
      .toThrow(/candidate provenance is missing/i);
  });

  it('uses the exact outer bytes as the sole request identity', () => {
    const request = normalizeNativeFinalizedPegInFrontierMintTransitionV1Request(
      VECTOR.request,
    );
    const compact = Buffer.from(JSON.stringify(request), 'utf8');
    const pretty = Buffer.from(JSON.stringify(request, null, 2), 'utf8');
    const verification = structuredClone(VECTOR.expected);
    verification.requestDigestHex =
      deriveNativeFinalizedPegInFrontierMintTransitionV1ExactRequestDigestHex(compact);
    expect(() => buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate({
      requestBytes: pretty,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification,
    })).toThrow(/exact request/i);
  });

  it('rejects oversized request bytes before UTF-8 decoding or JSON parsing', () => {
    const oversizedInvalidUtf8 = new Uint8Array(
      MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES + 1,
    ).fill(0xff);
    expect(() => buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate({
      requestBytes: oversizedInvalidUtf8,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    })).toThrow(/request exceeds 67108864 bytes/i);
  });

  it('rejects duplicate JSON object keys before accepting a native report candidate', () => {
    const requestSource = JSON.stringify(VECTOR.request);
    const duplicateSchemaRequest = Buffer.from(
      `{"schema":${JSON.stringify(VECTOR.request.schema)},${requestSource.slice(1)}`,
      'utf8',
    );
    expect(() => buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate({
      requestBytes: duplicateSchemaRequest,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    })).toThrow(/duplicate JSON object key/i);
  });

  it('rejects a report under a different independently supplied trust root', () => {
    expect(() => buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate({
      requestBytes: Buffer.from(JSON.stringify(VECTOR.request), 'utf8'),
      trustedAnchorDigestHex: hash('00'),
      verification: VECTOR.expected,
    })).toThrow(/independently supplied trust anchor/i);
  });

  it.each([
    ['parent hash', (result: any) => {
      result.parentLink.parentNativeBlockHashHex = hash('99');
    }, /parent hash differs/i],
    ['parent height', (result: any) => {
      result.parentLink.parentNativeHeight = '1023';
    }, /canonical parent header/i],
    ['parent state root shape', (result: any) => {
      result.parentLink.parentStateRootHex = '0x01';
    }, /parent state root/i],
    ['parent state root identity', (result: any) => {
      result.parentLink.parentStateRootHex = hash('99');
    }, /canonical parent header/i],
    ['direct-parent claim', (result: any) => {
      result.parentLink.directParentVerified = false;
    }, /direct-parent verification/i],
    ['parent runtime digest', (result: any) => {
      result.transition.parentRuntimeCodeSha256Hex = hash('99');
    }, /parent runtime code differs/i],
    ['native replay key', (result: any) => {
      result.transition.parentNativeProcessedRecordStorageKeyHex = '0x01';
    }, /processed-record key/i],
    ['parent replay', (result: any) => {
      result.transition.parentProcessedPegIn = true;
    }, /parent replay state/i],
    ['post replay', (result: any) => {
      result.transition.postProcessedPegIn = false;
    }, /post replay state/i],
    ['parent supply', (result: any) => {
      result.transition.parentTokenTotalSupply = '1';
    }, /supply delta differs/i],
    ['post supply', (result: any) => {
      result.transition.postTokenTotalSupply = '1999999';
    }, /supply delta differs/i],
    ['supply delta', (result: any) => {
      result.transition.tokenTotalSupplyDelta = '1999999';
    }, /supply delta differs/i],
    ['recipient balance slot', (result: any) => {
      result.transition.recipientBalanceSlotHex = hash('99');
    }, /balance slot/i],
    ['recipient balance key', (result: any) => {
      result.transition.recipientBalanceStorageKeyHex = '0x01';
    }, /balance storage key/i],
    ['parent recipient balance', (result: any) => {
      result.transition.parentRecipientBalance = '1';
    }, /balance delta differs/i],
    ['post recipient balance', (result: any) => {
      result.transition.postRecipientBalance = '1999999';
    }, /balance delta differs/i],
    ['recipient balance delta', (result: any) => {
      result.transition.recipientBalanceDelta = '1999999';
    }, /balance delta differs/i],
    ['mint token', (result: any) => {
      result.transition.mintTokenAddressHex = address('99');
    }, /paired mint log/i],
    ['mint transaction', (result: any) => {
      result.transition.mintTransactionHashHex = hash('99');
    }, /paired mint log/i],
    ['mint transaction index', (result: any) => {
      result.transition.mintTransactionIndex = 0;
    }, /paired mint log/i],
    ['mint receipt-log order', (result: any) => {
      result.transition.mintTransactionLogIndex = 1;
    }, /paired mint log/i],
    ['mint global order', (result: any) => {
      result.transition.mintGlobalEventIndex = 2;
    }, /paired mint log/i],
    ['mint source', (result: any) => {
      result.transition.mintFromAddressHex = address('99');
    }, /paired mint log/i],
    ['mint recipient', (result: any) => {
      result.transition.mintRecipientAddressHex = address('99');
    }, /paired mint log/i],
    ['mint amount', (result: any) => {
      result.transition.mintAmount = '1999999';
    }, /paired mint log/i],
    ['parent proof nodes', (result: any) => {
      result.transition.parentProofNodeCount -= 1;
    }, /parent proof shape/i],
    ['parent proof bytes', (result: any) => {
      result.transition.parentProofBytes -= 1;
    }, /parent proof shape/i],
    ['post proof nodes', (result: any) => {
      result.transition.postProofNodeCount -= 1;
    }, /post proof shape/i],
    ['post proof bytes', (result: any) => {
      result.transition.postProofBytes -= 1;
    }, /post proof shape/i],
    ['transition verified', (result: any) => {
      result.transition.verified = false;
    }, /mint-transition verification/i],
    ['positive boundary', (result: any) => {
      result.boundary.singleTokenEffectVerified = false;
    }, /singleTokenEffectVerified boundary/i],
    ['authority boundary', (result: any) => {
      result.boundary.mintAuthorized = true;
    }, /mintAuthorized boundary/i],
    ['reviewed lineage boundary', (result: any) => {
      result.boundary.reviewedDeploymentLineageVerified = true;
    }, /reviewedDeploymentLineageVerified boundary/i],
    ['nested status injection', (result: any) => {
      result.contractStateVerification.status = 'injected';
    }, /status-free Frontier contract-state verification projection/i],
    ['unknown result field', (result: any) => {
      result.broadcastAuthorized = false;
    }, /unexpected field/i],
  ] as const)('rejects isolated %s report drift', (_label, mutate, message) => {
    const verification = structuredClone(VECTOR.expected);
    mutate(verification);
    expect(() => buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate({
      requestBytes: Buffer.from(JSON.stringify(VECTOR.request), 'utf8'),
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification,
    })).toThrow(message);
  });

  it.each([
    ['native replay key', (request: any) => {
      request.statement.parentNativeProcessedRecordStorageKeyHex = '0x01';
    }],
    ['recipient balance key', (request: any) => {
      request.statement.recipientBalanceStorageKeyHex = '0x01';
    }],
    ['duplicate parent proof node', (request: any) => {
      request.parentStateProofNodesHex[1] = request.parentStateProofNodesHex[0];
    }],
  ] as const)('rejects isolated %s request drift', (_label, mutate) => {
    const request = structuredClone(VECTOR.request);
    mutate(request);
    expect(() => normalizeNativeFinalizedPegInFrontierMintTransitionV1Request(request))
      .toThrow();
  });
});

function hash(byte: string): string {
  return `0x${byte.repeat(32)}`;
}

function address(byte: string): string {
  return `0x${byte.repeat(20)}`;
}
