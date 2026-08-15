import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_RESULT_CANDIDATE_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
  assertNativeFinalizedPegInFrontierContractStateV1ResultCandidateProvenance,
  buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate,
  deriveNativeFinalizedPegInFrontierContractStateV1ExactRequestDigestHex,
  normalizeNativeFinalizedPegInFrontierContractStateV1Request,
} from './native-finalized-peg-in-frontier-contract-state-v1.js';
import {
  PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
  derivePegInFrontierContractStateStorageKeysV1,
} from './peg-in-frontier-contract-state-v1.js';
import {
  loadTrackedDeploymentIdentityArtifactProfile,
} from './read-only-deployment-identity-observer.js';

const EVENT_VECTOR = JSON.parse(readFileSync(resolve(
  import.meta.dirname,
  '../test-vectors/native-finalized-peg-in-frontier-event-v1.json',
), 'utf8')) as {
  trustedAnchorDigestHex: string;
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
};
const CONTRACT_STATE_VECTOR = JSON.parse(readFileSync(resolve(
  import.meta.dirname,
  '../test-vectors/native-finalized-peg-in-frontier-contract-state-v1.json',
), 'utf8')) as {
  trustedAnchorDigestHex: string;
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
};
const BRIDGE = `0x${'22'.repeat(20)}`;
const TOKEN = `0x${'21'.repeat(20)}`;
const BOX = `0x${'44'.repeat(32)}`;
const OWNER = `0x${'33'.repeat(20)}`;
const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const ARTIFACT_PROFILE = loadTrackedDeploymentIdentityArtifactProfile(BRIDGE_ROOT);

describe('native finalized peg-in Frontier contract-state V1', () => {
  it('consumes the exact deterministic Rust verifier vector', () => {
    const requestBytes = Buffer.from(JSON.stringify(CONTRACT_STATE_VECTOR.request), 'utf8');
    const candidate = buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate({
      requestBytes,
      trustedAnchorDigestHex: CONTRACT_STATE_VECTOR.trustedAnchorDigestHex,
      verification: CONTRACT_STATE_VECTOR.expected,
    });

    expect(candidate.contractState).toMatchObject({
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      processedPegIn: true,
      tokenTotalSupply: '2000000',
      tokenOwnerAddressHex: BRIDGE,
    });
    expect(candidate.boundary).toEqual(nonAuthorizingBoundary());
  });

  it('binds the Rust vector to the reproducibly compiled contract artifacts', () => {
    const statement = CONTRACT_STATE_VECTOR.request.statement as Record<string, unknown>;
    const contractState = CONTRACT_STATE_VECTOR.expected.contractState as Record<string, unknown>;

    expect(statement.bridgeRuntimeCodeSha256Hex).toBe(
      `0x${ARTIFACT_PROFILE.bridge.runtimeBytecodeSha256Hex}`,
    );
    expect(statement.bridgeRuntimeCodeBytes).toBe(
      ARTIFACT_PROFILE.bridge.runtimeByteLength.toString(),
    );
    expect(statement.tokenRuntimeCodeSha256Hex).toBe(
      `0x${ARTIFACT_PROFILE.token.runtimeBytecodeSha256Hex}`,
    );
    expect(statement.tokenRuntimeCodeBytes).toBe(
      ARTIFACT_PROFILE.token.runtimeByteLength.toString(),
    );
    expect(contractState.bridgeRuntimeCodeSha256Hex).toBe(
      statement.bridgeRuntimeCodeSha256Hex,
    );
    expect(contractState.tokenRuntimeCodeSha256Hex).toBe(
      statement.tokenRuntimeCodeSha256Hex,
    );
    expect(ARTIFACT_PROFILE.profileDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(ARTIFACT_PROFILE.buildManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('binds exact post-state identities while stripping every authority claim', () => {
    const request = normalizeNativeFinalizedPegInFrontierContractStateV1Request(baseRequest());
    const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
    const verification = baseVerification(request);
    verification.requestDigestHex =
      deriveNativeFinalizedPegInFrontierContractStateV1ExactRequestDigestHex(requestBytes);

    const candidate = buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate({
      requestBytes,
      trustedAnchorDigestHex: EVENT_VECTOR.trustedAnchorDigestHex,
      verification,
    });
    expect(candidate.schema).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_RESULT_CANDIDATE_SCHEMA,
    );
    expect(candidate.reportedSourceResultStatus).toBe(
      NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
    );
    expect(candidate.contractState).not.toHaveProperty('verified');
    expect(candidate.contractState).toMatchObject({
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      bridgeTokenAddressHex: TOKEN,
      tokenOwnerAddressHex: BRIDGE,
      processedPegIn: true,
      tokenTotalSupply: '2000000',
    });
    expect(candidate.eventVerification.boundary.verifierExecutionAuthenticated).toBe(false);
    expect(candidate.boundary).toEqual(nonAuthorizingBoundary());
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.contractState)).toBe(true);
    expect(() =>
      assertNativeFinalizedPegInFrontierContractStateV1ResultCandidateProvenance(candidate))
      .not.toThrow();
    expect(() =>
      assertNativeFinalizedPegInFrontierContractStateV1ResultCandidateProvenance({
        ...candidate,
      }))
      .toThrow(/candidate provenance is missing/i);
  });

  it('uses the exact outer bytes as the sole request identity', () => {
    const request = normalizeNativeFinalizedPegInFrontierContractStateV1Request(baseRequest());
    const compact = Buffer.from(JSON.stringify(request), 'utf8');
    const pretty = Buffer.from(JSON.stringify(request, null, 2), 'utf8');
    const verification = baseVerification(request);
    verification.requestDigestHex =
      deriveNativeFinalizedPegInFrontierContractStateV1ExactRequestDigestHex(compact);
    expect(() => buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate({
      requestBytes: pretty,
      trustedAnchorDigestHex: EVENT_VECTOR.trustedAnchorDigestHex,
      verification,
    })).toThrow(/exact request/i);
  });

  it.each([
    ['state root', (verification: Record<string, unknown>) => {
      contractState(verification).stateRootHex = `0x${'99'.repeat(32)}`;
    }, /share the authenticated event state root/i],
    ['event bridge', (verification: Record<string, unknown>) => {
      contractState(verification).bridgeAddressHex = `0x${'99'.repeat(20)}`;
    }, /bridge differs/i],
    ['code digest', (verification: Record<string, unknown>) => {
      contractState(verification).bridgeRuntimeCodeSha256Hex = `0x${'99'.repeat(32)}`;
    }, /runtime-code identity differs/i],
    ['token binding', (verification: Record<string, unknown>) => {
      contractState(verification).bridgeTokenAddressHex = OWNER;
    }, /token binding differs/i],
    ['token owner', (verification: Record<string, unknown>) => {
      contractState(verification).tokenOwnerAddressHex = OWNER;
    }, /token owner differs/i],
    ['replay state', (verification: Record<string, unknown>) => {
      contractState(verification).processedPegIn = false;
    }, /replay state/i],
    ['supply domain', (verification: Record<string, unknown>) => {
      contractState(verification).tokenTotalSupply = '00';
    }, /canonical uint256/i],
    ['proof bytes', (verification: Record<string, unknown>) => {
      contractState(verification).proofBytes = 1;
    }, /proof byte count differs/i],
    ['EVM code proof claim', (verification: Record<string, unknown>) => {
      boundary(verification).evmCodeStateVerified = false;
    }, /evmCodeStateVerified boundary/i],
    ['mint claim', (verification: Record<string, unknown>) => {
      boundary(verification).mintAuthorized = true;
    }, /mintAuthorized boundary/i],
    ['daemon admission claim', (verification: Record<string, unknown>) => {
      boundary(verification).daemonAdmissionAuthorized = true;
    }, /daemonAdmissionAuthorized boundary/i],
    ['nested event status', (verification: Record<string, unknown>) => {
      const event = verification.eventVerification as Record<string, unknown>;
      event.status = 'injected';
    }, /status-free Frontier event verification projection has an unexpected field/i],
    ['unknown field', (verification: Record<string, unknown>) => {
      verification.broadcastAuthorized = false;
    }, /unexpected field/i],
  ] as const)('rejects %s report drift', (_label, mutate, message) => {
    const request = normalizeNativeFinalizedPegInFrontierContractStateV1Request(baseRequest());
    const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
    const verification = baseVerification(request);
    verification.requestDigestHex =
      deriveNativeFinalizedPegInFrontierContractStateV1ExactRequestDigestHex(requestBytes);
    mutate(verification);
    expect(() => buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate({
      requestBytes,
      trustedAnchorDigestHex: EVENT_VECTOR.trustedAnchorDigestHex,
      verification,
    })).toThrow(message);
  });
});

function baseRequest(): Record<string, unknown> {
  const keys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: BRIDGE,
    tokenAddressHex: TOKEN,
    ergoBoxIdHex: BOX,
  });
  return {
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    eventRequest: structuredClone(EVENT_VECTOR.request),
    statement: {
      schema: PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      ...keys,
      bridgeRuntimeCodeSha256Hex: `0x${'aa'.repeat(32)}`,
      bridgeRuntimeCodeBytes: '3',
      tokenRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
      tokenRuntimeCodeBytes: '4',
    },
  };
}

function baseVerification(
  request: ReturnType<typeof normalizeNativeFinalizedPegInFrontierContractStateV1Request>,
): Record<string, unknown> {
  const nested = structuredClone(EVENT_VECTOR.expected);
  delete nested.status;
  const eventExecution = nested.executionIdentity as Record<string, unknown>;
  const target = eventExecution.target as Record<string, unknown>;
  const nodes = request.eventRequest.executionIdentityRequest.runtimeStateProofNodesHex;
  return {
    schema: 'e2s.native-finalized-peg-in-frontier-contract-state-verification.v1',
    status: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
    requestDigestHex: `0x${'00'.repeat(32)}`,
    trustAnchorDigestHex: EVENT_VECTOR.trustedAnchorDigestHex,
    eventVerification: nested,
    contractState: {
      stateRootHex: target.stateRootHex,
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      bridgeAccountCodeStorageKeyHex: request.statement.bridgeAccountCodeStorageKeyHex,
      bridgeRuntimeCodeSha256Hex: request.statement.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: request.statement.bridgeRuntimeCodeBytes,
      tokenAccountCodeStorageKeyHex: request.statement.tokenAccountCodeStorageKeyHex,
      tokenRuntimeCodeSha256Hex: request.statement.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: request.statement.tokenRuntimeCodeBytes,
      bridgeOwnerStorageKeyHex: request.statement.bridgeOwnerStorageKeyHex,
      bridgeOwnerAddressHex: OWNER,
      bridgeConfigurationStorageKeyHex: request.statement.bridgeConfigurationStorageKeyHex,
      bridgeTokenAddressHex: TOKEN,
      bridgePaused: false,
      processedPegInStorageKeyHex: request.statement.processedPegInStorageKeyHex,
      processedPegIn: true,
      tokenTotalSupplyStorageKeyHex: request.statement.tokenTotalSupplyStorageKeyHex,
      tokenTotalSupply: '2000000',
      tokenOwnerStorageKeyHex: request.statement.tokenOwnerStorageKeyHex,
      tokenOwnerAddressHex: BRIDGE,
      proofNodeCount: nodes.length,
      proofBytes: nodes.reduce((total, node) => total + (node.length - 2) / 2, 0),
      verified: true,
    },
    boundary: {
      ...(nested.boundary as Record<string, unknown>),
      evmCodeStateVerified: true,
      evmStorageStateVerified: true,
      nativeVerifierExecutionAuthenticated: false,
      daemonAdmissionAuthorized: false,
    },
  };
}

function contractState(verification: Record<string, unknown>): Record<string, unknown> {
  return verification.contractState as Record<string, unknown>;
}

function boundary(verification: Record<string, unknown>): Record<string, unknown> {
  return verification.boundary as Record<string, unknown>;
}

function nonAuthorizingBoundary() {
  return {
    candidateOnly: true,
    exactRequestBytesDigestBound: true,
    independentlySuppliedTrustAnchorDigestBound: true,
    verifierResultClaimShapeChecked: true,
    verifierExecutionAuthenticated: false,
    daemonAdmissionAuthorized: false,
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
    runtimeUpgradeHistoryVerified: false,
    historicalCodeContinuityVerified: false,
    historicalReceiptStateProofCompletenessVerified: false,
    committedVaultTransitionVerified: false,
    historicalMintAbsenceVerified: false,
    mintAuthorized: false,
    settlementAuthorized: false,
    reconciliationHoldReleaseAuthorized: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    transactionMutationEnabled: false,
    gate5Closed: false,
    productionReadinessVerified: false,
  } as const;
}
