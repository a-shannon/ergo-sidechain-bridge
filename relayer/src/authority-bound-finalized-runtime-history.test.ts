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
  AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATUS,
  MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES,
  assertAuthorityBoundFinalizedRuntimeHistoryProvenance,
  assertCollectedAuthorityBoundFinalizedRuntimeHistoryProvenance,
  collectAuthorityBoundFinalizedRuntimeHistory,
  createAuthorityBoundFinalizedRuntimeHistory,
} from './authority-bound-finalized-runtime-history.js';
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
const checkpointHeader = substrateHeader({
  parentHashHex: hex('08'),
  height: 9,
  stateRootHex: hex('09'),
  runtimeEnvironmentUpdated: false,
});
const trustAnchor = {
  sidechainIdHex,
  checkpointHashHex: checkpointHeader.hashHex,
  checkpointNumber: '9',
  grandpaSetId: '7',
  authorityListScaleHex:
    `0x04${'21'.repeat(32)}0100000000000000`,
} as const;
const trustAnchorDigestHex = hex('a1');
const executionBlockHashHex = hex('ee');
const runtimeA = runtimeCode('a1', 'runtime-build-a', 'b1');
const runtimeB = runtimeCode('a2', 'runtime-build-b', 'b2');
const runtimeC = runtimeCode('a3', 'runtime-build-c', 'b3');
const profileScaleHex = profileScale();

beforeEach(() => {
  authorityMocks.assertEvaluator.mockClear();
  authorityMocks.assertCandidate.mockClear();
  collectorMocks.collect.mockReset();
});

describe('authority-bound finalized runtime history', () => {
  it('enumerates one complete checkpoint-to-execution expectation interval', () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const history = createAuthorityBoundFinalizedRuntimeHistory(fixture);

    expect(history.status).toBe(
      AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATUS,
    );
    expect(history.schema).toBe(
      'e2s.authority-bound-finalized-runtime-history-expectation-candidate.v2',
    );
    expect(history.startCheckpointHashHex).toBe(
      trustAnchor.checkpointHashHex,
    );
    expect(history.startCheckpointHeight).toBe('9');
    expect(history.executionBlockHeight).toBe('11');
    expect(history.executionNativeBlockHashHex).toBe(
      history.states.at(-1)!.nativeBlockHashHex,
    );
    expect(history.executionBlockHashHex).toBe(executionBlockHashHex);
    expect(history.executionBlockHashHex).not.toBe(
      history.executionNativeBlockHashHex,
    );
    expect(history.stateCount).toBe(3);
    expect(history.transitions).toEqual([]);
    expect(history.runtimeEnvironmentUpdateMarkers).toEqual([]);
    expect(history.changeAndRevertExpectationObserved).toBe(false);
    expect(history.expectedProducerRuntime).toEqual(runtimeA);
    expect(history.states.map(state => state.recordExpectation.outcome))
      .toEqual(['NON_MEMBERSHIP', 'NON_MEMBERSHIP', 'MEMBERSHIP']);
    expect(history.boundary).toEqual({
      checkpointToExecutionStateCoverageCompleteInCandidate: true,
      everyHeightConsecutiveAndDirectlyLinked: true,
      everyExpectedCodeChangeMarkedInHeader: true,
      changeAndRevertExpectationClassified: true,
      nativeAndExecutionBlockIdentitiesSeparated: true,
      executionBlockHashMappedToNativeState: false,
      childOutputContentExposed: false,
      childProofClaimsAccepted: false,
      stableCollectionSnapshotVerified: false,
      launcherInstallationActivationCampaignCompleted: false,
      sidechainFinalityVerified: false,
      runtimeCodeStateProofsVerified: false,
      runtimeUpgradeHistoryVerified: false,
      runtimeInvariantReviewsVerified: false,
      checkpointPredatesDepositEligibilityVerified: false,
      historicalMintAbsenceVerified: false,
      cutoverPolicyVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history.states)).toBe(true);
    expect(() =>
      assertAuthorityBoundFinalizedRuntimeHistoryProvenance(history),
    ).not.toThrow();
    expect(() =>
      assertAuthorityBoundFinalizedRuntimeHistoryProvenance(
        structuredClone(history),
      ),
    ).toThrow(/provenance/i);
  });

  it('detects a runtime change and later reversion without losing block-entry semantics', () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeB, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, true, true, false],
    });
    const history = createAuthorityBoundFinalizedRuntimeHistory(fixture);

    expect(history.transitions).toEqual([
      {
        runtimeCodeChangeBlockHashHex:
          history.states[1].nativeBlockHashHex,
        runtimeCodeChangeBlockHeight: '10',
        activeFromBlockEntryHeight: '11',
        previousExpectedRuntimeCode: runtimeA,
        nextExpectedRuntimeCode: runtimeB,
        runtimeEnvironmentUpdatedDigestPresent: true,
        revertsToPreviouslyObservedRuntime: false,
      },
      {
        runtimeCodeChangeBlockHashHex:
          history.states[2].nativeBlockHashHex,
        runtimeCodeChangeBlockHeight: '11',
        activeFromBlockEntryHeight: '12',
        previousExpectedRuntimeCode: runtimeB,
        nextExpectedRuntimeCode: runtimeA,
        runtimeEnvironmentUpdatedDigestPresent: true,
        revertsToPreviouslyObservedRuntime: true,
      },
    ]);
    expect(history.runtimeEnvironmentUpdateMarkers).toEqual([
      {
        blockHashHex: history.states[1].nativeBlockHashHex,
        blockHeight: '10',
        expectedRuntimeCodeDigestChanged: true,
      },
      {
        blockHashHex: history.states[2].nativeBlockHashHex,
        blockHeight: '11',
        expectedRuntimeCodeDigestChanged: true,
      },
    ]);
    expect(history.changeAndRevertExpectationObserved).toBe(true);
    expect(history.expectedProducerRuntime).toEqual(runtimeA);
  });

  it('classifies a return to a non-initial runtime as a reversion', () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeB, runtimeC, runtimeB, runtimeB],
      runtimeEnvironmentUpdated: [false, true, true, true, false],
    });
    const history = createAuthorityBoundFinalizedRuntimeHistory(fixture);

    expect(history.transitions.map(transition => ({
      previous: transition.previousExpectedRuntimeCode.artifactSha256Hex,
      next: transition.nextExpectedRuntimeCode.artifactSha256Hex,
      reversion: transition.revertsToPreviouslyObservedRuntime,
    }))).toEqual([
      {
        previous: runtimeA.artifactSha256Hex,
        next: runtimeB.artifactSha256Hex,
        reversion: false,
      },
      {
        previous: runtimeB.artifactSha256Hex,
        next: runtimeC.artifactSha256Hex,
        reversion: false,
      },
      {
        previous: runtimeC.artifactSha256Hex,
        next: runtimeB.artifactSha256Hex,
        reversion: true,
      },
    ]);
    expect(history.changeAndRevertExpectationObserved).toBe(true);
    expect(history.expectedProducerRuntime).toEqual(runtimeB);
  });

  it('retains same-code RuntimeEnvironmentUpdated markers without inventing a transition', () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, true, false],
    });
    const history = createAuthorityBoundFinalizedRuntimeHistory(fixture);

    expect(history.transitions).toEqual([]);
    expect(history.runtimeEnvironmentUpdateMarkers).toEqual([
      {
        blockHashHex: history.states[1].nativeBlockHashHex,
        blockHeight: '10',
        expectedRuntimeCodeDigestChanged: false,
      },
    ]);
  });

  it('rejects an update marker on the baseline checkpoint without its parent state', () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [true, false, false],
      firstRuntimeEnvironmentUpdated: true,
    });

    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(fixture),
    ).toThrow(/cannot classify.*without its parent/i);
  });

  it('rejects a code change without a RuntimeEnvironmentUpdated marker', () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeB, runtimeB],
      runtimeEnvironmentUpdated: [false, false, false],
    });

    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(fixture),
    ).toThrow(/code change lacks.*RuntimeEnvironmentUpdated/i);
  });

  it.each([
    ['an omitted height', (fixture: MutableHistoryFixture) => {
      const prior = fixture.states[0];
      const finalStatement = fixture.states[2].request.statement;
      const skipped = substrateHeader({
        parentHashHex: checkpointHeader.hashHex,
        height: 11,
        stateRootHex: hex('31'),
        runtimeEnvironmentUpdated: false,
      });
      fixture.states = [
        prior,
        stateFor(skipped, finalStatement, runtimeA, 'd8'),
      ];
    }, /exactly cover the explicit interval/i],
    ['a non-descendant state', (fixture: MutableHistoryFixture) => {
      const finalStatement = fixture.states[2].request.statement;
      const fork = substrateHeader({
        parentHashHex: hex('77'),
        height: 11,
        stateRootHex: hex('31'),
        runtimeEnvironmentUpdated: false,
      });
      fixture.states[2] = stateFor(
        fork,
        finalStatement,
        runtimeA,
        'd9',
      );
      fixture.interval = {
        ...fixture.interval,
        executionNativeBlockHashHex: fork.hashHex,
      };
    }, /non-descendant state/i],
    ['a start after the checkpoint', (fixture: MutableHistoryFixture) => {
      fixture.states = fixture.states.slice(1);
    }, /start at the exact reviewed trust checkpoint/i],
  ])('rejects %s', (_label, mutate, error) => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    }) as MutableHistoryFixture;
    mutate(fixture);

    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(fixture),
    ).toThrow(error);
  });

  it('requires non-membership at every pre-execution state and membership at execution', () => {
    const earlyMembership = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    }) as MutableHistoryFixture;
    earlyMembership.states[0].request = {
      ...earlyMembership.states[0].request,
      statement: earlyMembership.states[2].request.statement,
    };
    refreshCandidate(earlyMembership.states[0], 'e1');
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(earlyMembership),
    ).toThrow(/pre-execution states require record non-membership/i);

    const missingExecution = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    }) as MutableHistoryFixture;
    missingExecution.states[2].request = {
      ...missingExecution.states[2].request,
      statement: missingExecution.states[1].request.statement,
    };
    refreshCandidate(missingExecution.states[2], 'e2');
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(missingExecution),
    ).toThrow(/execution state requires record membership/i);
  });

  it.each([
    ['deposit drift', (fixture: MutableHistoryFixture) => {
      fixture.states[1].request = {
        ...fixture.states[1].request,
        statement: {
          ...fixture.states[1].request.statement,
          ergoBoxIdHex: hex('55'),
        } as PegInRuntimeIdentityStatementV2,
      };
      refreshCandidate(fixture.states[1], 'f1');
    }, /different Ergo deposits/i],
    ['trust-anchor drift', (fixture: MutableHistoryFixture) => {
      fixture.states[1].request = {
        ...fixture.states[1].request,
        trustAnchor: {
          ...fixture.states[1].request.trustAnchor,
          grandpaSetId: '8',
        },
      };
      refreshCandidate(fixture.states[1], 'f2');
    }, /different trust anchors/i],
    ['candidate-anchor drift', (fixture: MutableHistoryFixture) => {
      (
        fixture.states[1].candidate as unknown as {
          trustAnchorDigestHex: string;
        }
      ).trustAnchorDigestHex = hex('a2');
    }, /candidates bind different trust anchors/i],
  ])('rejects %s', (_label, mutate, error) => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    }) as MutableHistoryFixture;
    mutate(fixture);

    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(fixture),
    ).toThrow(error);
  });

  it('rejects final record execution and profile-generation drift', () => {
    const wrongExecution = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    }) as MutableHistoryFixture;
    const final = wrongExecution.states.at(-1)!;
    final.request = {
      ...final.request,
      statement: executionMembershipStatement(
        runtimeA,
        hex('66'),
        11,
      ),
    };
    refreshCandidate(final, 'f3');
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(wrongExecution),
    ).toThrow(/record does not bind the exact execution state/i);

    const wrongProfile = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    }) as MutableHistoryFixture;
    const parent = wrongProfile.states.at(-2)!;
    parent.request = {
      ...parent.request,
      statement: parentNonMembershipStatement(
        runtimeA,
        profileScale('3'),
      ),
    };
    refreshCandidate(parent, 'f4');
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(wrongProfile),
    ).toThrow(/record revision|profile generation/i);
  });

  it('rejects conflicting artifact size for one runtime digest', () => {
    const conflictingRuntime = {
      ...runtimeA,
      artifactSizeBytes: '4097',
    };
    const fixture = historyFixture({
      runtimes: [runtimeA, conflictingRuntime, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });

    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(fixture),
    ).toThrow(/conflicting artifact or build-attestation identity/i);
  });

  it.each([
    [
      'build attestation ID',
      {
        ...runtimeA,
        buildAttestationId: 'runtime-build-a-rotated',
      },
    ],
    [
      'build attestation digest',
      {
        ...runtimeA,
        buildAttestationSha256Hex: hex('b3'),
      },
    ],
  ])('rejects conflicting %s for one runtime digest', (_label, runtime) => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtime, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });

    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(fixture),
    ).toThrow(/conflicting artifact or build-attestation identity/i);
  });

  it('rejects cloned and cross-evaluator candidates', () => {
    const cloned = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    cloned.states[1].candidate =
      structuredClone(cloned.states[1].candidate);
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(cloned),
    ).toThrow(/candidate provenance/i);

    const crossed = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    crossed.states[1].evaluator = crossed.states[0].evaluator;
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory(crossed),
    ).toThrow(/candidate provenance/i);
  });

  it('bounds the number of interval states before provenance work', () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });

    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory({
        interval: fixture.interval,
        states: Array(
          MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES + 1,
        ).fill(fixture.states[0]),
      }),
    ).toThrow(/requires 2 to 257 states/i);
    expect(authorityMocks.assertCandidate).not.toHaveBeenCalled();
  });

  it('requires explicit inclusive interval endpoints to match the state sequence', () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });

    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory({
        ...fixture,
        interval: {
          ...fixture.interval,
          executionBlockHeight: '12',
        },
      }),
    ).toThrow(/exactly cover the explicit interval/i);
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory({
        ...fixture,
        interval: {
          ...fixture.interval,
          executionNativeBlockHashHex: hex('77'),
        },
      }),
    ).toThrow(/exactly cover the explicit interval/i);
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory({
        ...fixture,
        interval: {
          ...fixture.interval,
          executionBlockHashHex: hex('77'),
        },
      }),
    ).toThrow(/record does not bind the exact execution state/i);
    const {
      executionNativeBlockHashHex: _executionNativeBlockHashHex,
      ...legacyInterval
    } = fixture.interval;
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory({
        ...fixture,
        interval: legacyInterval as unknown as typeof fixture.interval,
      }),
    ).toThrow(/exactly the supported fields/i);
    expect(() =>
      createAuthorityBoundFinalizedRuntimeHistory({
        ...fixture,
        interval: {
          ...fixture.interval,
          semantics: 'exclusive-post-state',
        } as unknown as typeof fixture.interval,
      }),
    ).toThrow(/semantics must be inclusive-post-state/i);
  });

  it('binds native and EVM terminal hashes independently into the V2 history digest', () => {
    const baselineFixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const baseline = createAuthorityBoundFinalizedRuntimeHistory(
      baselineFixture,
    );

    const evmFixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    }) as MutableHistoryFixture;
    const alternateExecutionHash = hex('ef');
    evmFixture.interval = {
      ...evmFixture.interval,
      executionBlockHashHex: alternateExecutionHash,
    };
    const evmFinal = evmFixture.states.at(-1)!;
    evmFinal.request = {
      ...evmFinal.request,
      statement: executionMembershipStatement(
        runtimeA,
        alternateExecutionHash,
        11,
      ),
    };
    refreshCandidate(evmFinal, 'f5');
    const evmVariant = createAuthorityBoundFinalizedRuntimeHistory(evmFixture);

    const nativeFixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    }) as MutableHistoryFixture;
    const nativeParent = nativeFixture.states.at(-2)!;
    const nativeFinal = nativeFixture.states.at(-1)!;
    const alternateNativeHeader = substrateHeader({
      parentHashHex: nativeParent.request.targetNativeBlockHashHex,
      height: 11,
      stateRootHex: hex('78'),
      runtimeEnvironmentUpdated: false,
    });
    nativeFixture.states[nativeFixture.states.length - 1] = stateFor(
      alternateNativeHeader,
      nativeFinal.request.statement,
      runtimeA,
      'f6',
      nativeFixture.trustAnchor,
    );
    nativeFixture.interval = {
      ...nativeFixture.interval,
      executionNativeBlockHashHex: alternateNativeHeader.hashHex,
    };
    const nativeVariant = createAuthorityBoundFinalizedRuntimeHistory(
      nativeFixture,
    );

    expect(evmVariant.historyDigestHex).not.toBe(baseline.historyDigestHex);
    expect(evmVariant.executionNativeBlockHashHex).toBe(
      baseline.executionNativeBlockHashHex,
    );
    expect(nativeVariant.historyDigestHex).not.toBe(baseline.historyDigestHex);
    expect(nativeVariant.executionBlockHashHex).toBe(
      baseline.executionBlockHashHex,
    );
  });

  it('collects the explicit state plan in order and returns a branded wrapper', async () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    collectorMocks.collect.mockImplementation(async input => {
      const state = fixture.states.find(candidate =>
        candidate.request.targetNativeBlockHashHex
          === input.targetNativeBlockHashHex);
      if (!state) throw new Error('unexpected target');
      expect(input.statement).toEqual(state.request.statement);
      expect(input.evaluator).toBe(state.evaluator);
      return {
        collection: { request: state.request },
        candidate: state.candidate,
      };
    });

    const result = await collectAuthorityBoundFinalizedRuntimeHistory({
      rpc: readOnlyRpc(),
      codec: {} as NativeSubstrateRpcProofCodec,
      trustAnchor,
      trustedAnchorDigestHex: trustAnchorDigestHex,
      interval: fixture.interval,
      statePlan: fixture.states.map(state => ({
        expectedHeight:
          deriveHeaderHeight(state.request.targetHeaderScaleHex),
        targetNativeBlockHashHex:
          state.request.targetNativeBlockHashHex,
        statement: state.request.statement,
        evaluator: state.evaluator,
      })),
    });

    expect(collectorMocks.collect).toHaveBeenCalledTimes(3);
    expect(collectorMocks.collect.mock.calls.map(call =>
      call[0].targetNativeBlockHashHex)).toEqual(
      fixture.states.map(state =>
        state.request.targetNativeBlockHashHex),
    );
    expect(result.history.stateCount).toBe(3);
    expect(result.collectionSummaries).toHaveLength(3);
    expect(result.aggregateCollectionBytes).toBeGreaterThan(0);
    expect('collections' in result).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() =>
      assertCollectedAuthorityBoundFinalizedRuntimeHistoryProvenance(
        result,
      ),
    ).not.toThrow();
    expect(() =>
      assertCollectedAuthorityBoundFinalizedRuntimeHistoryProvenance(
        structuredClone(result),
      ),
    ).toThrow(/provenance/i);
  });

  it('rejects a self-consistent collected native state other than the planned target', async () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const statePlan = fixture.states.map(state => ({
      expectedHeight:
        deriveHeaderHeight(state.request.targetHeaderScaleHex),
      targetNativeBlockHashHex:
        state.request.targetNativeBlockHashHex,
      statement: state.request.statement,
      evaluator: state.evaluator,
    }));
    const alternateHeader = substrateHeader({
      parentHashHex: hex('08'),
      height: 9,
      stateRootHex: hex('79'),
      runtimeEnvironmentUpdated: false,
    });
    const alternateRequest = requestFor(
      alternateHeader,
      statePlan[0].statement,
      trustAnchor,
    );
    collectorMocks.collect.mockImplementationOnce(async () => ({
      collection: { request: alternateRequest },
      candidate: candidateFor(
        statePlan[0].evaluator,
        alternateRequest,
        'f7',
      ),
    }));

    await expect(collectAuthorityBoundFinalizedRuntimeHistory({
      rpc: readOnlyRpc(),
      codec: {} as NativeSubstrateRpcProofCodec,
      trustAnchor,
      trustedAnchorDigestHex: trustAnchorDigestHex,
      interval: fixture.interval,
      statePlan,
    })).rejects.toThrow(/collected native identity.*snapshotted state plan/i);
    expect(collectorMocks.collect).toHaveBeenCalledTimes(1);
  });

  it('derives the parent/execution lineage from the single snapshotted state sequence', () => {
    const primary = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const alternate = historyFixture({
      runtimes: [runtimeB, runtimeB, runtimeB],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const reads = [0, 0, 0];
    const states = new Proxy(primary.states, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^[0-2]$/.test(property)) {
          const index = Number(property);
          reads[index] += 1;
          return reads[index] === 1
            ? Reflect.get(target, property, receiver)
            : alternate.states[index];
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const history = createAuthorityBoundFinalizedRuntimeHistory({
      interval: primary.interval,
      states,
    });

    expect(reads).toEqual([1, 1, 1]);
    expect(history.expectedProducerRuntime).toEqual(runtimeA);
    expect(history.states.every(state =>
      state.expectedRuntimeCode.artifactSha256Hex
        === runtimeA.artifactSha256Hex)).toBe(true);
  });

  it('rejects an unregistered plan evaluator before collection', async () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const statePlan = fixture.states.map(state => ({
      expectedHeight:
        deriveHeaderHeight(state.request.targetHeaderScaleHex),
      targetNativeBlockHashHex:
        state.request.targetNativeBlockHashHex,
      statement: state.request.statement,
      evaluator: state.evaluator,
    }));
    statePlan[1].evaluator = {
      ...statePlan[1].evaluator,
    };

    await expect(
      collectAuthorityBoundFinalizedRuntimeHistory({
        rpc: readOnlyRpc(),
        codec: {} as NativeSubstrateRpcProofCodec,
        trustAnchor,
        trustedAnchorDigestHex: trustAnchorDigestHex,
        interval: fixture.interval,
        statePlan,
      }),
    ).rejects.toThrow(/evaluator provenance/i);
    expect(collectorMocks.collect).not.toHaveBeenCalled();
  });

  it('rejects evaluator and execution-record drift before collection', async () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const statePlan = fixture.states.map(state => ({
      expectedHeight:
        deriveHeaderHeight(state.request.targetHeaderScaleHex),
      targetNativeBlockHashHex:
        state.request.targetNativeBlockHashHex,
      statement: state.request.statement,
      evaluator: state.evaluator,
    }));
    statePlan[1].statement = parentNonMembershipStatement(runtimeB);
    await expect(
      collectAuthorityBoundFinalizedRuntimeHistory({
        rpc: readOnlyRpc(),
        codec: {} as NativeSubstrateRpcProofCodec,
        trustAnchor,
        trustedAnchorDigestHex: trustAnchorDigestHex,
        interval: fixture.interval,
        statePlan,
      }),
    ).rejects.toThrow(/runtime does not match its evaluator/i);
    expect(collectorMocks.collect).not.toHaveBeenCalled();

    statePlan[1].statement = fixture.states[1].request.statement;
    statePlan[2].statement = executionMembershipStatement(
      runtimeA,
      hex('77'),
      11,
    );
    await expect(
      collectAuthorityBoundFinalizedRuntimeHistory({
        rpc: readOnlyRpc(),
        codec: {} as NativeSubstrateRpcProofCodec,
        trustAnchor,
        trustedAnchorDigestHex: trustAnchorDigestHex,
        interval: fixture.interval,
        statePlan,
      }),
    ).rejects.toThrow(/record does not bind the explicit execution endpoint/i);
    expect(collectorMocks.collect).not.toHaveBeenCalled();
  });

  it('rejects omitted or reordered plan heights before collection', async () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const statePlan = fixture.states.map(state => ({
      expectedHeight:
        deriveHeaderHeight(state.request.targetHeaderScaleHex),
      targetNativeBlockHashHex:
        state.request.targetNativeBlockHashHex,
      statement: state.request.statement,
      evaluator: state.evaluator,
    }));
    statePlan[1].expectedHeight = '9';

    await expect(
      collectAuthorityBoundFinalizedRuntimeHistory({
        rpc: readOnlyRpc(),
        codec: {} as NativeSubstrateRpcProofCodec,
        trustAnchor,
        trustedAnchorDigestHex: trustAnchorDigestHex,
        interval: fixture.interval,
        statePlan,
      }),
    ).rejects.toThrow(/omitted, duplicate, or reordered height/i);
    expect(collectorMocks.collect).not.toHaveBeenCalled();
  });

  it('enforces aggregate collection byte and time budgets', async () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const statePlan = fixture.states.map(state => ({
      expectedHeight:
        deriveHeaderHeight(state.request.targetHeaderScaleHex),
      targetNativeBlockHashHex:
        state.request.targetNativeBlockHashHex,
      statement: state.request.statement,
      evaluator: state.evaluator,
    }));
    collectorMocks.collect.mockImplementationOnce(async () => ({
      collection: { request: fixture.states[0].request },
      candidate: fixture.states[0].candidate,
    }));
    await expect(
      collectAuthorityBoundFinalizedRuntimeHistory({
        rpc: readOnlyRpc(),
        codec: {} as NativeSubstrateRpcProofCodec,
        trustAnchor,
        trustedAnchorDigestHex: trustAnchorDigestHex,
        interval: fixture.interval,
        statePlan,
        maxAggregateCollectionBytes: 1,
      }),
    ).rejects.toThrow(/exceeds its byte budget/i);

    collectorMocks.collect.mockReset();
    const now = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(2);
    await expect(
      collectAuthorityBoundFinalizedRuntimeHistory({
        rpc: readOnlyRpc(),
        codec: {} as NativeSubstrateRpcProofCodec,
        trustAnchor,
        trustedAnchorDigestHex: trustAnchorDigestHex,
        interval: fixture.interval,
        statePlan,
        aggregateDeadlineMs: 1,
      }),
    ).rejects.toThrow(/aggregate collection deadline exceeded/i);
    now.mockRestore();
    expect(collectorMocks.collect).not.toHaveBeenCalled();
  });

  it('caps child collection by remaining aggregate time and rejects a late result', async () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const statePlan = fixture.states.map(state => ({
      expectedHeight:
        deriveHeaderHeight(state.request.targetHeaderScaleHex),
      targetNativeBlockHashHex:
        state.request.targetNativeBlockHashHex,
      statement: state.request.statement,
      evaluator: state.evaluator,
    }));
    let nowMs = 1_000;
    const now = vi.spyOn(Date, 'now')
      .mockImplementation(() => nowMs);
    collectorMocks.collect.mockImplementation(async input => {
      const callIndex = collectorMocks.collect.mock.calls.length - 1;
      expect(input.deadlineMs).toBe(callIndex === 0 ? 100 : 50);
      nowMs = callIndex === 0 ? 1_050 : 1_101;
      const state = fixture.states[callIndex];
      return {
        collection: { request: state.request },
        candidate: state.candidate,
      };
    });

    await expect(
      collectAuthorityBoundFinalizedRuntimeHistory({
        rpc: readOnlyRpc(),
        codec: {} as NativeSubstrateRpcProofCodec,
        trustAnchor,
        trustedAnchorDigestHex: trustAnchorDigestHex,
        interval: fixture.interval,
        statePlan,
        aggregateDeadlineMs: 100,
      }),
    ).rejects.toThrow(/aggregate collection deadline exceeded/i);
    now.mockRestore();
    expect(collectorMocks.collect).toHaveBeenCalledTimes(2);
  });

  it('snapshots the complete plan before the first asynchronous collection', async () => {
    const fixture = historyFixture({
      runtimes: [runtimeA, runtimeA, runtimeA],
      runtimeEnvironmentUpdated: [false, false, false],
    });
    const statePlan = fixture.states.map(state => ({
      expectedHeight:
        deriveHeaderHeight(state.request.targetHeaderScaleHex),
      targetNativeBlockHashHex:
        state.request.targetNativeBlockHashHex,
      statement: state.request.statement,
      evaluator: state.evaluator,
    }));
    const originalTargets = statePlan.map(state =>
      state.targetNativeBlockHashHex);
    collectorMocks.collect.mockImplementation(async input => {
      if (collectorMocks.collect.mock.calls.length === 1) {
        statePlan[1].expectedHeight = '99';
        statePlan[1].targetNativeBlockHashHex = hex('77');
        statePlan[1].statement =
          statePlan[0].statement;
      }
      const state = fixture.states.find(candidate =>
        candidate.request.targetNativeBlockHashHex
          === input.targetNativeBlockHashHex);
      if (!state) throw new Error('snapshot target drifted');
      return {
        collection: { request: state.request },
        candidate: state.candidate,
      };
    });

    const result = await collectAuthorityBoundFinalizedRuntimeHistory({
      rpc: readOnlyRpc(),
      codec: {} as NativeSubstrateRpcProofCodec,
      trustAnchor,
      trustedAnchorDigestHex: trustAnchorDigestHex,
      interval: fixture.interval,
      statePlan,
    });

    expect(result.history.stateCount).toBe(3);
    expect(collectorMocks.collect.mock.calls.map(call =>
      call[0].targetNativeBlockHashHex)).toEqual(originalTargets);
  });

  it('keeps complete-history expectation candidates outside funds-path consumers', () => {
    for (const sourceName of [
      'relayer-daemon.ts',
      'peg-in-runtime-reconciliation.ts',
    ]) {
      const source = readFileSync(
        new URL(`./${sourceName}`, import.meta.url),
        'utf8',
      );
      expect(source).not.toContain(
        'collectAuthorityBoundFinalizedRuntimeHistory',
      );
      expect(source).not.toContain(
        'createAuthorityBoundFinalizedRuntimeHistory',
      );
    }
  });
});

type MutableHistoryFixture = ReturnType<typeof historyFixture>;
type MutableState = MutableHistoryFixture['states'][number];

function historyFixture(input: {
  runtimes: readonly PegInRuntimeCodeIdentityV2[];
  runtimeEnvironmentUpdated: readonly boolean[];
  firstRuntimeEnvironmentUpdated?: boolean;
}) {
  if (
    input.runtimes.length < 2
    || input.runtimes.length
      !== input.runtimeEnvironmentUpdated.length
  ) {
    throw new Error('invalid history fixture shape');
  }
  const startHeader = input.firstRuntimeEnvironmentUpdated
    ? substrateHeader({
      parentHashHex: hex('08'),
      height: 9,
      stateRootHex: hex('09'),
      runtimeEnvironmentUpdated: true,
    })
    : checkpointHeader;
  const fixtureTrustAnchor = {
    ...trustAnchor,
    checkpointHashHex: startHeader.hashHex,
  };
  const headers = [startHeader];
  for (let index = 1; index < input.runtimes.length; index += 1) {
    headers.push(substrateHeader({
      parentHashHex: headers[index - 1].hashHex,
      height: 9 + index,
      stateRootHex: hex(String(20 + index).padStart(2, '0')),
      runtimeEnvironmentUpdated:
        input.runtimeEnvironmentUpdated[index],
    }));
  }
  const states = headers.map((header, index) => {
    const runtime = input.runtimes[index];
    const statement = index === headers.length - 1
      ? executionMembershipStatement(
        runtime,
        executionBlockHashHex,
        9 + index,
      )
      : parentNonMembershipStatement(runtime);
    return stateFor(
      header,
      statement,
      runtime,
      (10 + index).toString(16).padStart(2, '0'),
      fixtureTrustAnchor,
    );
  });
  return {
    interval: {
      semantics: 'inclusive-post-state' as const,
      startCheckpointHashHex: headers[0].hashHex,
      startCheckpointHeight: '9',
      executionNativeBlockHashHex: headers.at(-1)!.hashHex,
      executionBlockHashHex,
      executionBlockHeight: String(8 + headers.length),
    },
    trustAnchor: fixtureTrustAnchor,
    states,
  };
}

function stateFor(
  header: ReturnType<typeof substrateHeader>,
  statement: PegInRuntimeIdentityStatementV2,
  runtime: PegInRuntimeCodeIdentityV2,
  childByte: string,
  requestTrustAnchor = trustAnchor,
) {
  const evaluator = evaluatorFor(runtime);
  const request = requestFor(
    header,
    statement,
    requestTrustAnchor,
  );
  return {
    request,
    evaluator,
    candidate: candidateFor(evaluator, request, childByte),
  };
}

function refreshCandidate(state: MutableState, childByte: string): void {
  state.candidate = candidateFor(
    state.evaluator,
    state.request,
    childByte,
  );
}

function parentNonMembershipStatement(
  runtimeCodeIdentity: PegInRuntimeCodeIdentityV2,
  expectedProfileScaleHex = profileScaleHex,
): PegInRuntimeIdentityStatementV2 {
  return {
    schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
    ergoBoxIdHex,
    expectedProfileScaleHex,
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

function profileScale(profileRevision = '2'): string {
  return encodePegInRuntimeProfileV1ScaleHex({
    formatVersion: 1,
    sidechainIdHex,
    bridgeAddress: hex('33', 20),
    profileRevision,
    activationHeight: '7',
  });
}

function requestFor(
  header: ReturnType<typeof substrateHeader>,
  statement: PegInRuntimeIdentityStatementV2,
  requestTrustAnchor = trustAnchor,
): NativeFinalizedPegInRuntimeIdentityV2Request {
  return {
    schema: 'e2s.native-finalized-peg-in-runtime-identity-request.v2',
    trustAnchor: { ...requestTrustAnchor },
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
    runtimeBuildAttestationId:
      runtimeCodeIdentity.buildAttestationId,
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

function substrateHeader(input: {
  parentHashHex: string;
  height: number;
  stateRootHex: string;
  runtimeEnvironmentUpdated: boolean;
}) {
  const digest = input.runtimeEnvironmentUpdated
    ? Buffer.from([4, 8])
    : Buffer.from([0]);
  const bytes = Buffer.concat([
    fixedHex(input.parentHashHex),
    compactUint(input.height),
    fixedHex(input.stateRootHex),
    fixedHex(hex('ee')),
    digest,
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

function deriveHeaderHeight(headerScaleHex: string): string {
  return String(Buffer.from(headerScaleHex.slice(2), 'hex')[32] >>> 2);
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
