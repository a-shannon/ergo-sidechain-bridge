import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MAX_FRONTIER_CURRENT_RECEIPTS_V1_SCALE_BYTES,
  MAX_FRONTIER_CURRENT_TRANSACTION_STATUSES_V1_SCALE_BYTES,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_STATUS,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_STATUS,
  buildNativeFinalizedPegInFrontierEventV1ResultCandidate,
  deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex,
  normalizeNativeFinalizedPegInFrontierEventV1Request,
} from './native-finalized-peg-in-frontier-event-v1.js';
import {
  deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';

const VECTOR = JSON.parse(readFileSync(resolve(
  import.meta.dirname,
  '../test-vectors/native-finalized-peg-in-frontier-event-v1.json',
), 'utf8')) as {
  schema: string;
  trustedAnchorDigestHex: string;
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
};

describe('native finalized peg-in Frontier event V1', () => {
  it('binds the Rust vector while stripping every cryptographic authority claim', () => {
    expect(VECTOR.schema).toBe(
      'e2s.native-finalized-peg-in-frontier-event.vector.v1',
    );
    const request = normalizeNativeFinalizedPegInFrontierEventV1Request(VECTOR.request);
    expect(request).toEqual(VECTOR.request);
    expect(request.schema).toBe(NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA);
    const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
    expect(deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex(requestBytes))
      .toBe(VECTOR.expected.requestDigestHex);

    const candidate = buildNativeFinalizedPegInFrontierEventV1ResultCandidate({
      requestBytes,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    });
    expect(candidate.schema).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_SCHEMA,
    );
    expect(candidate.status).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_STATUS,
    );
    expect(candidate.reportedSourceResultStatus).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_STATUS,
    );
    expect(candidate.event).toEqual(VECTOR.expected.event);
    const { verified: _verified, ...expectedReceiptState } =
      VECTOR.expected.receiptState as Record<string, unknown>;
    expect(candidate.receiptState).toEqual(expectedReceiptState);
    expect(candidate.receiptState).not.toHaveProperty('verified');
    expect(VECTOR.expected.executionIdentity).not.toHaveProperty('status');
    expect(candidate.executionIdentity).not.toHaveProperty('sourceResultStatus');
    expect(candidate.executionIdentity.boundary.verifierExecutionAuthenticated).toBe(false);
    expect(candidate.boundary).toEqual(nonAuthorizingBoundary());
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.event)).toBe(true);
    expect(Object.isFrozen(candidate.boundary)).toBe(true);
  });

  it('uses the exact compact outer request bytes as the sole request identity', () => {
    const request = normalizeNativeFinalizedPegInFrontierEventV1Request(VECTOR.request);
    const compactBytes = Buffer.from(JSON.stringify(request), 'utf8');
    const prettyBytes = Buffer.from(JSON.stringify(request, null, 2), 'utf8');
    expect(deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex(compactBytes))
      .toBe(VECTOR.expected.requestDigestHex);
    expect(deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex(prettyBytes))
      .not.toBe(VECTOR.expected.requestDigestHex);
    expect(() => buildNativeFinalizedPegInFrontierEventV1ResultCandidate({
      requestBytes: prettyBytes,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    })).toThrow(/exact request/i);
  });

  it('cannot promote a structurally rebound fabricated five-key proof report', () => {
    const request = structuredClone(VECTOR.request);
    const execution = request.executionIdentityRequest as Record<string, unknown>;
    const proofNodes = execution.runtimeStateProofNodesHex as string[];
    const originalNode = proofNodes[0];
    proofNodes[0] = `${originalNode.slice(0, -1)}${originalNode.endsWith('0') ? '1' : '0'}`;
    const normalized = normalizeNativeFinalizedPegInFrontierEventV1Request(request);
    const requestBytes = Buffer.from(JSON.stringify(normalized), 'utf8');
    const fabricated = structuredClone(VECTOR.expected);
    fabricated.requestDigestHex =
      deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex(requestBytes);
    const nestedRequestBytes = Buffer.from(
      JSON.stringify(normalized.executionIdentityRequest),
      'utf8',
    );
    const nested = fabricated.executionIdentity as Record<string, unknown>;
    nested.requestDigestHex =
      deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex(
        nestedRequestBytes,
      );
    const nestedRuntime = nested.runtimeState as Record<string, unknown>;
    nestedRuntime.proofBytes = normalized.executionIdentityRequest.runtimeStateProofNodesHex
      .reduce((total, node) => total + (node.length - 2) / 2, 0);
    const receiptState = fabricated.receiptState as Record<string, unknown>;
    receiptState.proofBytes = nestedRuntime.proofBytes;

    const candidate = buildNativeFinalizedPegInFrontierEventV1ResultCandidate({
      requestBytes,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: fabricated,
    });
    expect(candidate.boundary.verifierExecutionAuthenticated).toBe(false);
    expect(candidate.boundary.sidechainFinalityVerified).toBe(false);
    expect(candidate.boundary.executionIdentityVerified).toBe(false);
    expect(candidate.boundary.receiptStateProofVerified).toBe(false);
    expect(candidate.boundary.successfulReceiptVerified).toBe(false);
    expect(candidate.boundary.depositEventSemanticsVerified).toBe(false);
    expect(candidate.boundary.mintAuthorized).toBe(false);
  });

  it('pins the Rust receipt and status byte bounds', () => {
    expect({
      receipts: MAX_FRONTIER_CURRENT_RECEIPTS_V1_SCALE_BYTES,
      statuses: MAX_FRONTIER_CURRENT_TRANSACTION_STATUSES_V1_SCALE_BYTES,
    }).toEqual({ receipts: 8 * 1024 * 1024, statuses: 8 * 1024 * 1024 });
  });

  it.each([
    ['request schema', (request: Record<string, unknown>) => {
      request.schema = 'e2s.native-finalized-peg-in-frontier-event-request.v2';
    }, /request schema/i],
    ['nested V1 schema', (request: Record<string, unknown>) => {
      const nested = request.executionIdentityRequest as Record<string, unknown>;
      nested.schema = 'e2s.native-finalized-peg-in-frontier-event-request.v1';
    }, /execution identity V1 request schema/i],
    ['receipts key', (request: Record<string, unknown>) => {
      const statement = request.statement as Record<string, unknown>;
      statement.currentReceiptsStorageKeyHex = `0x${'00'.repeat(32)}`;
    }, /CurrentReceipts storage key/i],
    ['statuses key', (request: Record<string, unknown>) => {
      const statement = request.statement as Record<string, unknown>;
      statement.currentTransactionStatusesStorageKeyHex = `0x${'00'.repeat(32)}`;
    }, /CurrentTransactionStatuses storage key/i],
  ] as const)('rejects %s drift in the request', (_label, mutate, message) => {
    const request = structuredClone(VECTOR.request);
    mutate(request);
    expect(() => normalizeNativeFinalizedPegInFrontierEventV1Request(request))
      .toThrow(message);
  });

  it.each([
    ['receipt count', (verification: Record<string, unknown>) => {
      const state = verification.receiptState as Record<string, unknown>;
      state.receiptCount = 1;
    }, /counts differ/i],
    ['receipt root', (verification: Record<string, unknown>) => {
      const state = verification.receiptState as Record<string, unknown>;
      state.receiptsRootHex = '0x01';
    }, /receipts root/i],
    ['proof byte count', (verification: Record<string, unknown>) => {
      const state = verification.receiptState as Record<string, unknown>;
      state.proofBytes = 1;
    }, /proof byte count differs/i],
    ['event transaction', (verification: Record<string, unknown>) => {
      const event = verification.event as Record<string, unknown>;
      event.transactionHashHex = `0x${'00'.repeat(32)}`;
    }, /transaction hash differs/i],
    ['global event index', (verification: Record<string, unknown>) => {
      const event = verification.event as Record<string, unknown>;
      event.globalEventIndex = 0;
    }, /global event index differs/i],
    ['transaction log index bound', (verification: Record<string, unknown>) => {
      const event = verification.event as Record<string, unknown>;
      event.transactionLogIndex = 2;
    }, /transaction log index/i],
    ['event amount', (verification: Record<string, unknown>) => {
      const event = verification.event as Record<string, unknown>;
      event.amountNanoErg = '1';
    }, /event fields differ/i],
    ['event amount above the Ergo Long domain', (verification: Record<string, unknown>) => {
      const event = verification.event as Record<string, unknown>;
      event.amountNanoErg = (1n << 63n).toString();
    }, /Ergo Long domain/i],
    ['event topic', (verification: Record<string, unknown>) => {
      const event = verification.event as Record<string, unknown>;
      event.eventSignatureTopicHex = `0x${'00'.repeat(32)}`;
    }, /signature topic/i],
    ['success claim', (verification: Record<string, unknown>) => {
      const boundary = verification.boundary as Record<string, unknown>;
      boundary.successfulReceiptVerified = false;
    }, /successful receipt boundary/i],
    ['production claim', (verification: Record<string, unknown>) => {
      const boundary = verification.boundary as Record<string, unknown>;
      boundary.productionReadinessVerified = true;
    }, /production readiness boundary/i],
    ['nested reviewed-root status', (verification: Record<string, unknown>) => {
      const executionIdentity = verification.executionIdentity as Record<string, unknown>;
      executionIdentity.status =
        'NATIVE_PEG_IN_FRONTIER_EXECUTION_IDENTITY_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT';
    }, /status-free Frontier execution identity projection has an unexpected field/i],
    ['unknown field', (verification: Record<string, unknown>) => {
      verification.mintAuthorized = false;
    }, /unexpected field/i],
  ] as const)('rejects %s drift in the verifier result', (_label, mutate, message) => {
    const request = normalizeNativeFinalizedPegInFrontierEventV1Request(VECTOR.request);
    const verification = structuredClone(VECTOR.expected);
    mutate(verification);
    expect(() => buildNativeFinalizedPegInFrontierEventV1ResultCandidate({
      requestBytes: Buffer.from(JSON.stringify(request), 'utf8'),
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification,
    })).toThrow(message);
  });
});

function nonAuthorizingBoundary() {
  return {
    candidateOnly: true,
    exactRequestBytesDigestBound: true,
    independentlySuppliedTrustAnchorDigestBound: true,
    verifierResultClaimShapeChecked: true,
    verifierExecutionAuthenticated: false,
    sidechainFinalityVerified: false,
    executionIdentityVerified: false,
    receiptStateProofVerified: false,
    receiptsRootRecomputed: false,
    transactionStatusVerified: false,
    successfulReceiptVerified: false,
    depositEventSemanticsVerified: false,
    evmCodeStateVerified: false,
    evmStorageStateVerified: false,
    runtimeBuildAttestationVerified: false,
    runtimeCodeIdentityVerified: false,
    committedVaultTransitionVerified: false,
    historicalMintAbsenceVerified: false,
    mintAuthorized: false,
    transactionMutationEnabled: false,
    gate5Closed: false,
    productionReadinessVerified: false,
  } as const;
}
