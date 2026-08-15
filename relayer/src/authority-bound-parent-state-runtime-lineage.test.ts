import blakejs from 'blakejs';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate,
  AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
} from './authority-bound-native-finalized-peg-in-runtime-identity-v2.js';

const authorityMocks = vi.hoisted(() => {
  const evaluators = new WeakSet<object>();
  const candidates = new WeakMap<object, {
    evaluator: object;
    requestDigestHex: string;
  }>();
  return {
    evaluators,
    candidates,
    assertEvaluator: vi.fn((evaluator: unknown) => {
      if (
        !evaluator
        || typeof evaluator !== 'object'
        || !evaluators.has(evaluator)
      ) {
        throw new Error('candidate evaluator provenance is missing');
      }
    }),
    assertCandidate: vi.fn((input: {
      evaluator: unknown;
      candidate: unknown;
      expectedRequestDigestHex: string;
    }) => {
      if (!input.candidate || typeof input.candidate !== 'object') {
        throw new Error('candidate provenance is missing');
      }
      const provenance = candidates.get(input.candidate);
      if (
        !provenance
        || provenance.evaluator !== input.evaluator
        || provenance.requestDigestHex !== input.expectedRequestDigestHex
      ) {
        throw new Error('candidate provenance is missing');
      }
    }),
  };
});

const collectorMocks = vi.hoisted(() => ({
  collect: vi.fn(),
}));

vi.mock(
  './authority-bound-native-finalized-peg-in-runtime-identity-v2.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './authority-bound-native-finalized-peg-in-runtime-identity-v2.js'
      )
    >();
    return {
      ...actual,
      assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance:
        authorityMocks.assertEvaluator,
      assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance:
        authorityMocks.assertCandidate,
    };
  },
);

vi.mock('./native-checkpoint-proof-collector.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-checkpoint-proof-collector.js')
  >();
  return {
    ...actual,
    collectNativeFinalizedPegInRuntimeIdentityV2Candidate:
      collectorMocks.collect,
  };
});

import {
  AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_STATUS,
  assertAuthorityBoundParentStateRuntimeLineageProvenance,
  assertCollectedAuthorityBoundParentStateRuntimeLineageProvenance,
  collectAuthorityBoundParentStateRuntimeLineage,
  createAuthorityBoundParentStateRuntimeLineage,
} from './authority-bound-parent-state-runtime-lineage.js';
import {
  deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex,
  type NativeFinalizedPegInRuntimeIdentityV2Request,
} from './native-finalized-peg-in-runtime-identity-v2.js';
import type { NativeSubstrateRpcProofCodec } from './native-substrate-rpc-proof-codec.js';
import {
  encodePegInRuntimeProfileV1ScaleHex,
  encodePegInRuntimeRecordV1ScaleHex,
} from './peg-in-runtime-state.js';
import {
  PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  type PegInRuntimeCodeIdentityV2,
  type PegInRuntimeIdentityStatementV2,
} from './peg-in-runtime-identity-v2.js';
import { ReadOnlySubstrateFinalityRpc } from './substrate-finality-provider.js';

const hex = (byte: string, bytes = 32): string =>
  `0x${byte.repeat(bytes)}`;
const sidechainIdHex = hex('11');
const ergoBoxIdHex = hex('44');
const trustAnchor = {
  sidechainIdHex,
  checkpointHashHex: hex('09'),
  checkpointNumber: '9',
  grandpaSetId: '7',
  authorityListScaleHex:
    `0x04${'21'.repeat(32)}0100000000000000`,
} as const;
const trustAnchorDigestHex = hex('a1');
const executionBlockHashHex = hex('ee');
const runtimeA = runtimeCode('a1', 'runtime-build-a', 'b1');
const runtimeB = runtimeCode('a2', 'runtime-build-b', 'b2');
const profileScaleHex = encodePegInRuntimeProfileV1ScaleHex({
  formatVersion: 1,
  sidechainIdHex,
  bridgeAddress: hex('33', 20),
  profileRevision: '2',
  activationHeight: '7',
});
const parentHeader = substrateHeader({
  parentHashHex: trustAnchor.checkpointHashHex,
  height: 10,
  stateRootHex: hex('10'),
});
const executionHeader = substrateHeader({
  parentHashHex: parentHeader.hashHex,
  height: 11,
  stateRootHex: hex('11'),
});

beforeEach(() => {
  authorityMocks.assertEvaluator.mockClear();
  authorityMocks.assertCandidate.mockClear();
  collectorMocks.collect.mockReset();
});

describe('authority-bound parent-state runtime lineage', () => {
  it('selects the expected producer runtime from the exact parent request', () => {
    const fixture = lineageFixture();
    const lineage = createAuthorityBoundParentStateRuntimeLineage(fixture);

    expect(lineage.status).toBe(
      AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_STATUS,
    );
    expect(lineage.schema).toBe(
      'e2s.authority-bound-parent-state-runtime-lineage-expectation-candidate.v2',
    );
    expect(lineage.parentState.nativeBlockHashHex).toBe(parentHeader.hashHex);
    expect(lineage.executionState.parentHashHex).toBe(parentHeader.hashHex);
    expect(lineage.executionState.nativeBlockHashHex).toBe(
      executionHeader.hashHex,
    );
    expect(lineage.executionState.executionBlockHashHex).toBe(
      executionBlockHashHex,
    );
    expect(lineage.executionState.executionBlockHashHex).not.toBe(
      lineage.executionState.nativeBlockHashHex,
    );
    expect(lineage.expectedProducerRuntime).toEqual(runtimeA);
    expect(
      lineage.runtimeCodeExpectationChangedInExecutionBlock,
    ).toBe(true);
    expect(lineage.boundary).toEqual({
      exactParentTargetRequestBindingChecked: true,
      expectedProducerRuntimeSelectedFromParentRequest: true,
      recordExecutionIdentityDecoded: true,
      recordNativeHeightBindingChecked: true,
      executionBlockHashMappedToNativeState: false,
      childOutputContentExposed: false,
      childProofClaimsAccepted: false,
      launcherInstallationActivationCampaignCompleted: false,
      sidechainFinalityVerified: false,
      parentStateRuntimeCodeStateProofVerified: false,
      executionStateRuntimeCodeStateProofVerified: false,
      runtimeUpgradeHistoryVerified: false,
      historicalMintAbsenceVerified: false,
      cutoverPolicyVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(Object.isFrozen(lineage)).toBe(true);
    expect(Object.isFrozen(lineage.parentState.expectedRuntimeCode)).toBe(true);
    expect(() =>
      assertAuthorityBoundParentStateRuntimeLineageProvenance(lineage),
    ).not.toThrow();
    expect(() =>
      assertAuthorityBoundParentStateRuntimeLineageProvenance(
        structuredClone(lineage),
      ),
    ).toThrow(/provenance/i);
  });

  it('does not infer an upgrade when parent and post-state code are identical', () => {
    const fixture = lineageFixture({
      executionRuntime: runtimeA,
      executionEvaluator: evaluatorFor(runtimeA),
    });
    const lineage = createAuthorityBoundParentStateRuntimeLineage(fixture);

    expect(
      lineage.runtimeCodeExpectationChangedInExecutionBlock,
    ).toBe(false);
    expect(lineage.expectedProducerRuntime.artifactSha256Hex).toBe(
      lineage.executionState.expectedRuntimeCode.artifactSha256Hex,
    );
  });

  it('rejects one runtime digest paired with conflicting artifact sizes', () => {
    const executionRuntime = {
      ...runtimeA,
      artifactSizeBytes: '4097',
    };
    const fixture = lineageFixture({
      executionRuntime,
      executionEvaluator: evaluatorFor(executionRuntime),
    });

    expect(() =>
      createAuthorityBoundParentStateRuntimeLineage(fixture),
    ).toThrow(/identical runtime code digests.*different artifact sizes/i);
  });

  it.each([
    ['parent membership', (fixture: MutableLineageFixture) => {
      fixture.parent.request = {
        ...fixture.parent.request,
        statement: fixture.execution.request.statement,
      };
    }, /parent-state.*non-membership/i],
    ['target non-membership', (fixture: MutableLineageFixture) => {
      fixture.execution.request = {
        ...fixture.execution.request,
        statement: fixture.parent.request.statement,
      };
    }, /execution-state.*membership/i],
    ['different deposit', (fixture: MutableLineageFixture) => {
      fixture.parent.request = {
        ...fixture.parent.request,
        statement: {
          ...fixture.parent.request.statement,
          ergoBoxIdHex: hex('55'),
        } as PegInRuntimeIdentityStatementV2,
      };
    }, /different Ergo deposits/i],
    ['different trust anchor', (fixture: MutableLineageFixture) => {
      fixture.parent.request = {
        ...fixture.parent.request,
        trustAnchor: {
          ...fixture.parent.request.trustAnchor,
          checkpointHashHex: hex('08'),
        },
      };
    }, /different trust anchors/i],
    ['wrong parent hash', (fixture: MutableLineageFixture) => {
      fixture.execution.request = requestFor(
        substrateHeader({
          parentHashHex: hex('77'),
          height: 11,
          stateRootHex: hex('11'),
        }),
        fixture.execution.request.statement,
      );
    }, /does not directly descend/i],
    ['non-consecutive height', (fixture: MutableLineageFixture) => {
      const header = substrateHeader({
        parentHashHex: parentHeader.hashHex,
        height: 12,
        stateRootHex: hex('11'),
      });
      const statement = executionMembershipStatement(
        runtimeB,
        executionBlockHashHex,
        12,
      );
      fixture.execution.request = requestFor(header, statement);
    }, /not consecutive/i],
    ['wrong record height', (fixture: MutableLineageFixture) => {
      fixture.execution.request = {
        ...fixture.execution.request,
        statement: executionMembershipStatement(
          runtimeB,
          executionBlockHashHex,
          12,
        ),
      };
    }, /record height.*native execution state height/i],
    ['profile generation drift', (fixture: MutableLineageFixture) => {
      const statement = fixture.parent.request.statement;
      if (statement.record.outcome !== 'nonMembership') throw new Error('fixture');
      fixture.parent.request = {
        ...fixture.parent.request,
        statement: {
          ...statement,
          expectedProfileScaleHex: encodePegInRuntimeProfileV1ScaleHex({
            formatVersion: 1,
            sidechainIdHex,
            bridgeAddress: hex('33', 20),
            profileRevision: '3',
            activationHeight: '7',
          }),
        },
      };
    }, /record revision|profile generation/i],
  ])('rejects %s', (_label, mutate, error) => {
    const fixture = lineageFixture() as MutableLineageFixture;
    mutate(fixture);
    refreshCandidateProvenance(fixture);

    expect(() =>
      createAuthorityBoundParentStateRuntimeLineage(fixture),
    ).toThrow(error);
  });

  it('rejects cloned, cross-evaluator, and cross-anchor candidates', () => {
    const cloned = lineageFixture();
    cloned.parent.candidate = structuredClone(cloned.parent.candidate);
    expect(() =>
      createAuthorityBoundParentStateRuntimeLineage(cloned),
    ).toThrow(/candidate provenance/i);

    const crossed = lineageFixture();
    crossed.parent.evaluator = crossed.execution.evaluator;
    expect(() =>
      createAuthorityBoundParentStateRuntimeLineage(crossed),
    ).toThrow(/candidate provenance/i);

    const anchorDrift = lineageFixture();
    (
      anchorDrift.execution.candidate as unknown as {
        trustAnchorDigestHex: string;
      }
    ).trustAnchorDigestHex = hex('a2');
    expect(() =>
      createAuthorityBoundParentStateRuntimeLineage(anchorDrift),
    ).toThrow(/different trust anchors/i);
  });

  it('collects target membership before deriving exact parent non-membership', async () => {
    const parentEvaluator = evaluatorFor(runtimeA);
    const executionEvaluator = evaluatorFor(runtimeB);
    const executionStatement = executionMembershipStatement(
      runtimeB,
      executionBlockHashHex,
      11,
    );
    const executionRequest = requestFor(executionHeader, executionStatement);
    const parentStatement = parentNonMembershipStatement(runtimeA);
    const parentRequest = requestFor(parentHeader, parentStatement);
    collectorMocks.collect
      .mockImplementationOnce(async input =>
        collectedCandidate(
          executionRequest,
          executionEvaluator,
          input.statement,
          'c1',
        ))
      .mockImplementationOnce(async input =>
        collectedCandidate(
          parentRequest,
          parentEvaluator,
          input.statement,
          'c2',
        ));

    const result = await collectAuthorityBoundParentStateRuntimeLineage({
      rpc: readOnlyRpc(),
      codec: {} as NativeSubstrateRpcProofCodec,
      trustAnchor,
      trustedAnchorDigestHex: trustAnchorDigestHex,
      executionTargetNativeBlockHashHex: executionHeader.hashHex,
      expectedExecutionBlockHashHex: executionBlockHashHex,
      executionStatement,
      parentEvaluator,
      executionEvaluator,
    });

    expect(collectorMocks.collect).toHaveBeenCalledTimes(2);
    expect(collectorMocks.collect.mock.calls[0][0]).toMatchObject({
      targetNativeBlockHashHex: executionHeader.hashHex,
      statement: executionStatement,
      evaluator: executionEvaluator,
    });
    expect(collectorMocks.collect.mock.calls[1][0]).toMatchObject({
      targetNativeBlockHashHex: parentHeader.hashHex,
      evaluator: parentEvaluator,
      statement: {
        schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
        ergoBoxIdHex,
        expectedProfileScaleHex: profileScaleHex,
        record: { outcome: 'nonMembership' },
        runtimeCode: runtimeA,
      },
    });
    expect(result.lineage.expectedProducerRuntime).toEqual(runtimeA);
    expect(result.lineage.executionState.expectedRuntimeCode).toEqual(runtimeB);
    expect(result.lineage.boundary.mintAuthorized).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() =>
      assertCollectedAuthorityBoundParentStateRuntimeLineageProvenance(result),
    ).not.toThrow();
    expect(() =>
      assertCollectedAuthorityBoundParentStateRuntimeLineageProvenance(
        structuredClone(result),
      ),
    ).toThrow(/provenance/i);
  });

  it('rejects malformed execution identity before collecting parent state', async () => {
    const parentEvaluator = evaluatorFor(runtimeA);
    const executionEvaluator = evaluatorFor(runtimeB);
    const wrongBlock = executionMembershipStatement(
      runtimeB,
      hex('77'),
      11,
    );
    await expect(collectAuthorityBoundParentStateRuntimeLineage({
      rpc: readOnlyRpc(),
      codec: {} as NativeSubstrateRpcProofCodec,
      trustAnchor,
      trustedAnchorDigestHex: trustAnchorDigestHex,
      executionTargetNativeBlockHashHex: executionHeader.hashHex,
      expectedExecutionBlockHashHex: executionBlockHashHex,
      executionStatement: wrongBlock,
      parentEvaluator,
      executionEvaluator,
    })).rejects.toThrow(/expected EVM execution block/i);
    expect(collectorMocks.collect).not.toHaveBeenCalled();

    const wrongHeight = executionMembershipStatement(
      runtimeB,
      executionBlockHashHex,
      12,
    );
    const executionRequest = requestFor(executionHeader, wrongHeight);
    collectorMocks.collect.mockImplementationOnce(async input =>
      collectedCandidate(
        executionRequest,
        executionEvaluator,
        input.statement,
        'c3',
      ));
    await expect(collectAuthorityBoundParentStateRuntimeLineage({
      rpc: readOnlyRpc(),
      codec: {} as NativeSubstrateRpcProofCodec,
      trustAnchor,
      trustedAnchorDigestHex: trustAnchorDigestHex,
      executionTargetNativeBlockHashHex: executionHeader.hashHex,
      expectedExecutionBlockHashHex: executionBlockHashHex,
      executionStatement: wrongHeight,
      parentEvaluator,
      executionEvaluator,
    })).rejects.toThrow(/native execution identity or record height/i);
    expect(collectorMocks.collect).toHaveBeenCalledTimes(1);
  });

  it('rejects a self-consistent collected native block other than the requested target', async () => {
    const parentEvaluator = evaluatorFor(runtimeA);
    const executionEvaluator = evaluatorFor(runtimeB);
    const executionStatement = executionMembershipStatement(
      runtimeB,
      executionBlockHashHex,
      11,
    );
    const alternateHeader = substrateHeader({
      parentHashHex: parentHeader.hashHex,
      height: 11,
      stateRootHex: hex('77'),
    });
    const alternateRequest = requestFor(
      alternateHeader,
      executionStatement,
    );
    collectorMocks.collect.mockImplementationOnce(async input =>
      collectedCandidate(
        alternateRequest,
        executionEvaluator,
        input.statement,
        'c4',
      ));

    await expect(collectAuthorityBoundParentStateRuntimeLineage({
      rpc: readOnlyRpc(),
      codec: {} as NativeSubstrateRpcProofCodec,
      trustAnchor,
      trustedAnchorDigestHex: trustAnchorDigestHex,
      executionTargetNativeBlockHashHex: executionHeader.hashHex,
      expectedExecutionBlockHashHex: executionBlockHashHex,
      executionStatement,
      parentEvaluator,
      executionEvaluator,
    })).rejects.toThrow(/native execution identity.*snapshotted target/i);
    expect(collectorMocks.collect).toHaveBeenCalledTimes(1);
  });

  it('snapshots collection inputs before awaiting the execution-state collector', async () => {
    const parentEvaluator = evaluatorFor(runtimeA);
    const executionEvaluator = evaluatorFor(runtimeB);
    const executionStatement = executionMembershipStatement(
      runtimeB,
      executionBlockHashHex,
      11,
    );
    const executionRequest = requestFor(executionHeader, executionStatement);
    const parentRequest = requestFor(
      parentHeader,
      parentNonMembershipStatement(runtimeA),
    );
    let releaseExecution!: () => void;
    const executionGate = new Promise<void>(resolve => {
      releaseExecution = resolve;
    });
    collectorMocks.collect
      .mockImplementationOnce(async input => {
        await executionGate;
        return collectedCandidate(
          executionRequest,
          executionEvaluator,
          input.statement,
          'c5',
        );
      })
      .mockImplementationOnce(async input =>
        collectedCandidate(
          parentRequest,
          parentEvaluator,
          input.statement,
          'c6',
        ));
    const collectionInput = {
      rpc: readOnlyRpc(),
      codec: {} as NativeSubstrateRpcProofCodec,
      trustAnchor: { ...trustAnchor },
      trustedAnchorDigestHex: trustAnchorDigestHex,
      executionTargetNativeBlockHashHex: executionHeader.hashHex,
      expectedExecutionBlockHashHex: executionBlockHashHex,
      executionStatement,
      parentEvaluator,
      executionEvaluator,
      deadlineMs: 5000,
      rpcConcurrency: 2,
      maxAttempts: 3,
    };
    const pending = collectAuthorityBoundParentStateRuntimeLineage(
      collectionInput,
    );
    await vi.waitFor(() => {
      expect(collectorMocks.collect).toHaveBeenCalledTimes(1);
    });
    collectionInput.parentEvaluator = evaluatorFor(runtimeA);
    collectionInput.trustAnchor.checkpointHashHex = hex('77');
    collectionInput.deadlineMs = 1;
    collectionInput.rpcConcurrency = 1;
    collectionInput.maxAttempts = 1;
    releaseExecution();

    const result = await pending;
    expect(collectorMocks.collect.mock.calls[1][0]).toMatchObject({
      evaluator: parentEvaluator,
      trustAnchor,
      deadlineMs: 5000,
      rpcConcurrency: 2,
      maxAttempts: 3,
    });
    expect(result.lineage.expectedProducerRuntime).toEqual(runtimeA);
  });

  it('keeps the expectation candidate outside funds-path consumers', () => {
    for (const sourceName of [
      'relayer-daemon.ts',
      'peg-in-runtime-reconciliation.ts',
    ]) {
      const source = readFileSync(
        new URL(`./${sourceName}`, import.meta.url),
        'utf8',
      );
      expect(source).not.toContain(
        'collectAuthorityBoundParentStateRuntimeLineage',
      );
      expect(source).not.toContain(
        'createAuthorityBoundParentStateRuntimeLineage',
      );
    }
  });
});

type MutableLineageFixture = ReturnType<typeof lineageFixture>;

function lineageFixture(options: {
  executionRuntime?: PegInRuntimeCodeIdentityV2;
  executionEvaluator?:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
} = {}) {
  const executionRuntime = options.executionRuntime ?? runtimeB;
  const parentEvaluator = evaluatorFor(runtimeA);
  const executionEvaluator =
    options.executionEvaluator ?? evaluatorFor(executionRuntime);
  const parentRequest = requestFor(
    parentHeader,
    parentNonMembershipStatement(runtimeA),
  );
  const executionRequest = requestFor(
    executionHeader,
    executionMembershipStatement(
      executionRuntime,
      executionBlockHashHex,
      11,
    ),
  );
  const fixture = {
    parent: {
      request: parentRequest,
      evaluator: parentEvaluator,
      candidate: candidateFor(parentEvaluator, parentRequest, 'd1'),
    },
    execution: {
      request: executionRequest,
      evaluator: executionEvaluator,
      candidate: candidateFor(executionEvaluator, executionRequest, 'd2'),
    },
  };
  return fixture;
}

function refreshCandidateProvenance(fixture: MutableLineageFixture): void {
  fixture.parent.candidate = candidateFor(
    fixture.parent.evaluator,
    fixture.parent.request,
    'e1',
  );
  fixture.execution.candidate = candidateFor(
    fixture.execution.evaluator,
    fixture.execution.request,
    'e2',
  );
}

function parentNonMembershipStatement(
  runtimeCodeIdentity: PegInRuntimeCodeIdentityV2,
): PegInRuntimeIdentityStatementV2 {
  return {
    schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
    ergoBoxIdHex,
    expectedProfileScaleHex: profileScaleHex,
    record: { outcome: 'nonMembership' },
    runtimeCode: runtimeCodeIdentity,
  };
}

function executionMembershipStatement(
  runtimeCodeIdentity: PegInRuntimeCodeIdentityV2,
  executionBlockHashHex: string,
  sidechainHeight: number,
): PegInRuntimeIdentityStatementV2 {
  return {
    schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
    ergoBoxIdHex,
    record: {
      outcome: 'membership',
      expectedRecordScaleHex: encodePegInRuntimeRecordV1ScaleHex({
        formatVersion: 1,
        sidechainIdHex,
        bridgeAddress: hex('33', 20),
        profileRevision: '2',
        profileActivationHeight: '7',
        ergoBoxIdHex,
        recipientAddress: hex('55', 20),
        amountNanoErg: '2000000',
        sidechainHeight: String(sidechainHeight),
        executionBlockHashHex,
        transactionHashHex: hex('66'),
        eventIndex: 9,
      }),
    },
    runtimeCode: runtimeCodeIdentity,
  };
}

function requestFor(
  header: ReturnType<typeof substrateHeader>,
  statement: PegInRuntimeIdentityStatementV2,
): NativeFinalizedPegInRuntimeIdentityV2Request {
  return {
    schema: 'e2s.native-finalized-peg-in-runtime-identity-request.v2',
    trustAnchor: { ...trustAnchor },
    targetNativeBlockHashHex: header.hashHex,
    targetHeaderScaleHex: header.scaleHex,
    linkedGrandpaProofs: [],
    checkpointTailHeadersScaleHex: [header.scaleHex],
    finalityProofScaleHex: '0x01',
    statement,
    runtimeStateProofNodesHex: ['0x02'],
  };
}

function runtimeCode(
  artifactByte: string,
  buildAttestationId: string,
  attestationByte: string,
): PegInRuntimeCodeIdentityV2 {
  return {
    storageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    artifactSha256Hex: hex(artifactByte),
    artifactSizeBytes: '4096',
    buildAttestationId,
    buildAttestationSha256Hex: hex(attestationByte),
  };
}

function evaluatorFor(
  runtimeCodeIdentity: PegInRuntimeCodeIdentityV2,
): AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator {
  const evaluator = {
    executableSha256Hex: hex('90'),
    runtimeCodeSha256Hex: runtimeCodeIdentity.artifactSha256Hex,
    runtimeCodeSizeBytes: runtimeCodeIdentity.artifactSizeBytes,
    runtimeBuildAttestationId: runtimeCodeIdentity.buildAttestationId,
    runtimeBuildPacketSha256Hex:
      runtimeCodeIdentity.buildAttestationSha256Hex,
    executionPolicySha256: '91'.repeat(32),
    executionBoundary: {
      mode:
        'source-refreshed-dual-attestation-candidate-output-only',
      sourceOwnedRuntimeBuildAttestorLockReloadedPerLaunch: true,
      sourceOwnedNativeVerifierAttestorLockReloadedPerLaunch: true,
      executionPolicyValidatedPerLaunch: true,
      containedProcessRequired: true,
      immutableLauncherInstallationRequired: true,
      authorityRecordV2Required: true,
      launcherInstallationActivationCampaignCompleted: false,
      launcherAtomicBootstrapProven: false,
      targetStateCodeIsHistoricalProducerCode: false,
      targetRuntimeBuildIdentityVerified: false,
      runtimeUpgradeHistoryVerified: false,
      runtimeCodeIdentityVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
    },
    deriveExecutableInvocationSha256Hex: () => hex('92'),
    evaluate: vi.fn(),
  } as unknown as
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
  authorityMocks.evaluators.add(evaluator);
  return evaluator;
}

function candidateFor(
  evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
  request: NativeFinalizedPegInRuntimeIdentityV2Request,
  childByte: string,
): AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate {
  const requestDigestHex =
    deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(request);
  const candidate = {
    requestDigestHex,
    trustAnchorDigestHex,
    quarantinedChildOutput: {
      sha256Hex: childByte.repeat(32),
      sizeBytes: '1024',
      contentExposed: false,
      proofClaimsAccepted: false,
    },
  } as unknown as
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate;
  authorityMocks.candidates.set(candidate, {
    evaluator,
    requestDigestHex,
  });
  return candidate;
}

function collectedCandidate(
  request: NativeFinalizedPegInRuntimeIdentityV2Request,
  evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
  statement: PegInRuntimeIdentityStatementV2,
  childByte: string,
) {
  expect(statement).toEqual(request.statement);
  return {
    collection: { request },
    candidate: candidateFor(evaluator, request, childByte),
  };
}

function substrateHeader(input: {
  parentHashHex: string;
  height: number;
  stateRootHex: string;
}) {
  const bytes = Buffer.concat([
    fixedHex(input.parentHashHex),
    compactUint(input.height),
    fixedHex(input.stateRootHex),
    fixedHex(hex('ee')),
    Buffer.from([0]),
  ]);
  return {
    hashHex: `0x${Buffer.from(
      blakejs.blake2b(bytes, undefined, 32),
    ).toString('hex')}`,
    scaleHex: `0x${bytes.toString('hex')}`,
  };
}

function compactUint(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 64) {
    throw new Error('test compact integer is outside single-byte range');
  }
  return Buffer.from([value << 2]);
}

function fixedHex(value: string): Buffer {
  return Buffer.from(value.slice(2), 'hex');
}

function readOnlyRpc(): ReadOnlySubstrateFinalityRpc {
  return new ReadOnlySubstrateFinalityRpc({
    request: vi.fn(async () => {
      throw new Error('mock collector must not invoke RPC');
    }),
  });
}
