import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MAX_FRONTIER_CURRENT_BLOCK_V1_SCALE_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_STATUS,
  buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate,
  deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex,
  normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';

const VECTOR = JSON.parse(readFileSync(resolve(
  import.meta.dirname,
  '../test-vectors/native-finalized-peg-in-frontier-execution-identity-v1.json',
), 'utf8')) as {
  schema: string;
  trustedAnchorDigestHex: string;
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
};

describe('native finalized peg-in Frontier execution identity V1', () => {
  it('binds the deterministic Rust vector into a non-authoritative candidate', () => {
    expect(VECTOR.schema).toBe(
      'e2s.native-finalized-peg-in-frontier-execution-identity.vector.v1',
    );
    const request = normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(
      VECTOR.request,
    );
    expect(request).toEqual(VECTOR.request);
    expect(request.schema).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
    );
    const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
    expect(deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex(
      requestBytes,
    ))
      .toBe(VECTOR.expected.requestDigestHex);

    const candidate =
      buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate({
        requestBytes,
        trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
        verification: VECTOR.expected,
      });
    expect(candidate.schema).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_SCHEMA,
    );
    expect(candidate.status).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_STATUS,
    );
    expect(candidate.sourceResultSchema).toBe(VECTOR.expected.schema);
    expect(candidate.sourceResultStatus).toBe(VECTOR.expected.status);
    expect(candidate.requestDigestHex).toBe(VECTOR.expected.requestDigestHex);
    expect(candidate.record).toEqual(VECTOR.expected.record);
    expect(candidate.execution).toEqual(VECTOR.expected.execution);
    expect(candidate.authority).not.toHaveProperty('linkedAncestryVerified');
    expect(candidate.finality).not.toHaveProperty('verified');
    expect(candidate.runtimeState).not.toHaveProperty('verified');
    expect(candidate.boundary).toEqual({
      candidateOnly: true,
      exactRequestBytesDigestBound: true,
      independentlySuppliedTrustAnchorDigestBound: true,
      verifierResultClaimShapeChecked: true,
      verifierExecutionAuthenticated: false,
      sidechainFinalityVerified: false,
      runtimeCodeStateProofVerified: false,
      currentBlockStateProofVerified: false,
      processedRecordStateProofVerified: false,
      executionBlockHashMappedToNativeState: false,
      transactionRootRecomputed: false,
      ommersHashRecomputed: false,
      recordTransactionBoundExactlyOnce: false,
      receiptInclusionVerified: false,
      transactionStatusVerified: false,
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
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.boundary)).toBe(true);
    expect(candidate.execution.executionBlockHashHex)
      .toBe(candidate.record.executionBlockHashHex);
    expect(candidate.execution.recordTransactionHashHex)
      .toBe(candidate.record.transactionHashHex);
  });

  it('uses the exact verifier request bytes as the sole request identity', () => {
    const request = normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(
      VECTOR.request,
    );
    const compactBytes = Buffer.from(JSON.stringify(request), 'utf8');
    const prettyBytes = Buffer.from(JSON.stringify(request, null, 2), 'utf8');

    expect(deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex(
      compactBytes,
    )).toBe(VECTOR.expected.requestDigestHex);
    expect(deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex(
      prettyBytes,
    )).not.toBe(VECTOR.expected.requestDigestHex);
    expect(() => buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate({
      requestBytes: prettyBytes,
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification: VECTOR.expected,
    })).toThrow(/exact request/i);
  });

  it('cannot promote a structurally bound fabricated proof report', () => {
    const request = structuredClone(VECTOR.request);
    const proofNodes = request.runtimeStateProofNodesHex as string[];
    const originalNode = proofNodes[0];
    const lastNibble = originalNode.at(-1);
    proofNodes[0] = `${originalNode.slice(0, -1)}${lastNibble === '0' ? '1' : '0'}`;
    const normalized = normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(
      request,
    );
    const requestBytes = Buffer.from(JSON.stringify(normalized), 'utf8');
    const fabricatedReport = structuredClone(VECTOR.expected);
    fabricatedReport.requestDigestHex =
      deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex(
        requestBytes,
      );

    const candidate =
      buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate({
        requestBytes,
        trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
        verification: fabricatedReport,
      });

    expect(candidate.boundary.verifierExecutionAuthenticated).toBe(false);
    expect(candidate.boundary.sidechainFinalityVerified).toBe(false);
    expect(candidate.boundary.runtimeCodeStateProofVerified).toBe(false);
    expect(candidate.boundary.currentBlockStateProofVerified).toBe(false);
    expect(candidate.boundary.processedRecordStateProofVerified).toBe(false);
    expect(candidate.boundary.executionBlockHashMappedToNativeState).toBe(false);
    expect(candidate.boundary.transactionRootRecomputed).toBe(false);
    expect(candidate.boundary.ommersHashRecomputed).toBe(false);
    expect(candidate.boundary.recordTransactionBoundExactlyOnce).toBe(false);
    expect(JSON.stringify(candidate)).not.toContain('Verified\":true');
  });

  it('pins the Rust proof and CurrentBlock bounds', () => {
    expect({
      nodes: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES,
      nodeBytes: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES,
      proofBytes: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
      currentBlockBytes: MAX_FRONTIER_CURRENT_BLOCK_V1_SCALE_BYTES,
    }).toEqual({
      nodes: 512,
      nodeBytes: 8 * 1024 * 1024,
      proofBytes: 12 * 1024 * 1024,
      currentBlockBytes: 8 * 1024 * 1024,
    });
  });

  it.each([
    ['request schema', (request: Record<string, unknown>) => {
      request.schema = 'e2s.native-finalized-peg-in-runtime-identity-request.v2';
    }, /request schema/i],
    ['duplicate proof node', (request: Record<string, unknown>) => {
      const nodes = request.runtimeStateProofNodesHex as string[];
      request.runtimeStateProofNodesHex = [nodes[0], nodes[0]];
    }, /duplicate/i],
    ['CurrentBlock key', (request: Record<string, unknown>) => {
      const statement = request.statement as Record<string, unknown>;
      statement.currentBlockStorageKeyHex = `0x${'00'.repeat(32)}`;
    }, /CurrentBlock storage key/i],
    ['record bytes', (request: Record<string, unknown>) => {
      const statement = request.statement as Record<string, unknown>;
      statement.expectedRecordScaleHex = '0x01';
    }, /peg-in runtime record SCALE/i],
  ] as const)('rejects %s drift in the request', (_label, mutate, message) => {
    const request = structuredClone(VECTOR.request);
    mutate(request);
    expect(() => normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(request))
      .toThrow(message);
  });

  it.each([
    ['runtime code', (verification: Record<string, unknown>) => {
      const state = verification.runtimeState as Record<string, unknown>;
      state.runtimeCodeSha256Hex = `0x${'00'.repeat(32)}`;
    }, /runtime-code result differs/i],
    ['CurrentBlock digest', (verification: Record<string, unknown>) => {
      const state = verification.runtimeState as Record<string, unknown>;
      state.currentBlockScaleSha256Hex = '0x01';
    }, /CurrentBlock SCALE SHA-256/i],
    ['execution block mapping', (verification: Record<string, unknown>) => {
      const execution = verification.execution as Record<string, unknown>;
      execution.executionBlockHashHex = `0x${'00'.repeat(32)}`;
    }, /block identity differs/i],
    ['execution transaction mapping', (verification: Record<string, unknown>) => {
      const execution = verification.execution as Record<string, unknown>;
      execution.recordTransactionHashHex = `0x${'00'.repeat(32)}`;
    }, /transaction identity differs/i],
    ['transaction position', (verification: Record<string, unknown>) => {
      const execution = verification.execution as Record<string, unknown>;
      execution.recordTransactionIndex = execution.transactionCount;
    }, /outside the authenticated block/i],
    ['receipt claim', (verification: Record<string, unknown>) => {
      const boundary = verification.boundary as Record<string, unknown>;
      boundary.receiptInclusionVerified = true;
    }, /receipt inclusion boundary/i],
    ['production claim', (verification: Record<string, unknown>) => {
      const boundary = verification.boundary as Record<string, unknown>;
      boundary.productionReadinessVerified = true;
    }, /production-readiness boundary/i],
    ['unknown field', (verification: Record<string, unknown>) => {
      verification.mintAuthorized = false;
    }, /unexpected field/i],
  ] as const)('rejects %s drift in the verifier result', (_label, mutate, message) => {
    const request = normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(
      VECTOR.request,
    );
    const verification = structuredClone(VECTOR.expected);
    mutate(verification);
    expect(() => buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate({
      requestBytes: Buffer.from(JSON.stringify(request), 'utf8'),
      trustedAnchorDigestHex: VECTOR.trustedAnchorDigestHex,
      verification,
    })).toThrow(message);
  });

  it('rejects a verifier result under a different trust root', () => {
    const request = normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(
      VECTOR.request,
    );
    expect(() => buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate({
      requestBytes: Buffer.from(JSON.stringify(request), 'utf8'),
      trustedAnchorDigestHex: `0x${'00'.repeat(32)}`,
      verification: VECTOR.expected,
    })).toThrow(/independently supplied trust anchor/i);
  });
});
