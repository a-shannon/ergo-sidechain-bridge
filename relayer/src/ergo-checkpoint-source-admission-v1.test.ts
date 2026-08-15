import { describe, expect, it } from 'vitest';

import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
  encodeErgoAutolykosV2RelayRuntimeWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  computeErgoDifficultyContextDigest,
} from './ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import {
  replayErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  computeErgoHeaderId,
  serializeErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  assertErgoCheckpointSourceAdmissionV1Provenance,
  buildErgoCheckpointSourceAdmissionV1,
  computeErgoCheckpointSourcePolicyV1Digest,
  ERGO_CHECKPOINT_SOURCE_POLICY_V1_SCHEMA,
  REVIEWED_ERGO_CHECKPOINT_SOURCE_POLICY_V1_DIGEST_HEXES,
  selectReviewedErgoCheckpointSourcePolicyV1,
  type ErgoCheckpointSourceObservationV1,
  type ErgoCheckpointSourcePolicyV1,
} from './ergo-checkpoint-source-admission-v1.js';
import {
  composeErgoUtxoStateRuntimeWitnessCaptureV1,
} from './relayer-core/ergo-utxo-state-runtime-witness-capture-v1.js';
import {
  buildErgoUtxoStateRuntimeWitnessRetainedPacketV1,
} from './relayer-core/ergo-utxo-state-runtime-witness-retained-packet-v1.js';
import {
  buildFrontierErgoUtxoRuntimeStatementV3Fixture,
} from './test-fixtures/frontier-ergo-utxo-runtime-statement-v3-fixture.js';

const EVALUATED_AT_UNIX_MS = 1_000_000;

describe('reviewed Ergo checkpoint source admission V1', () => {
  it('binds the reviewed checkpoint and exact bounded source set to retained V3 bytes', () => {
    const { fixture, packet, policy, observations } = admissionFixture();
    const admission = buildErgoCheckpointSourceAdmissionV1({
      policy,
      retainedPacket: packet,
      observations,
      evaluatedAtUnixMs: EVALUATED_AT_UNIX_MS,
    });

    expect(admission).toMatchObject({
      status: 'NON_AUTHORIZING_REVIEWED_CHECKPOINT_SOURCE_SET_ADMITTED',
      policy: {
        policyDigestHex:
          '771cfe0166928e697ca50b8439cb0040e8b90a776c9d3bcd8624100a31bb0ebe',
        environment: 'historical-conformance',
        policyId: 'ergo-checkpoint.synthetic-conformance.v1',
        sourceNetworkIdHex: '66'.repeat(32),
        spvProfileIdHex: fixture.expectedSpvProfileIdHex,
        checkpointHeight: 128,
      },
      sourceSet: {
        evaluatedAtUnixMs: EVALUATED_AT_UNIX_MS,
        maximumObservationAgeMs: 300_000,
        observationCount: 2,
        selectedTipHeight: 130,
        observations: [
          { sourceId: 'primary', administrationId: 'operator-a' },
          { sourceId: 'witness', administrationId: 'operator-b' },
        ],
      },
      retainedPacket: {
        packetDigestHex: packet.packetDigestHex,
        targetHeaderIdHex: packet.targetHeaderIdHex,
        targetHeight: 129,
        confirmations: 2,
        requiredConfirmations: 2,
      },
      runtimeStatementV3: {
        statementIdHex: fixture.statementIdHex,
        statementHex: `0x${fixture.statementBytes.toString('hex')}`,
      },
      checks: {
        reviewedStaticPolicySelected: true,
        exactCheckpointHeaderAndContextPinned: true,
        exactBoundedSourceSetSupplied: true,
        declaredAdministrationIdentitiesDistinct: true,
        observationsFreshRelativeToSuppliedEvaluationTime: true,
        exactRelayWitnessAgreement: true,
        retainedPacketAndV3CompositionReplayed: true,
      },
      authority: {
        checkpointPinnedByReviewedStaticPolicy: true,
        checkpointExternallyAuthenticated: false,
        suppliedSourceSetMetadataMatchedReviewedPolicy: true,
        observationSourceProvenanceEstablished: false,
        observationClockExternallyAuthenticated: false,
        sourceOperationalIndependenceEstablished: false,
        completeCompetingBranchKnowledgeEstablished: false,
        globallyCanonicalErgoConsensusAccepted: false,
        deterministicFinalityEstablished: false,
        currentUtxoMembershipEstablished: false,
        transactionExecutionValidated: false,
        runtimeAdmissionAuthorized: false,
        mintAuthorized: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        productionReady: false,
      },
    });
    expect(admission.sourceSet.observations.every(
      observation => !Object.hasOwn(observation, 'rpcOrigin'),
    )).toBe(true);
    expect(admission.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining('not externally authenticated'),
      expect.stringContaining('caller-supplied metadata'),
      expect.stringContaining('does not prove current canonicality'),
      expect.stringContaining('do not prove independent operation'),
      expect.stringContaining('supplied process clock'),
      expect.stringContaining('not deterministic finality'),
    ]));
    expect(() => assertErgoCheckpointSourceAdmissionV1Provenance(admission))
      .not.toThrow();
  });

  it('selects only the exact inert source-reviewed profile', () => {
    const { rawPolicy, policy } = admissionFixture();
    expect(computeErgoCheckpointSourcePolicyV1Digest(rawPolicy)).toBe(
      REVIEWED_ERGO_CHECKPOINT_SOURCE_POLICY_V1_DIGEST_HEXES[0],
    );
    expect(policy.activation).toEqual({
      runtimeAuthorityEnabled: false,
      fundsAuthorityEnabled: false,
    });

    const unreviewed = clone(rawPolicy) as unknown as Record<string, unknown>;
    unreviewed.policyId = 'ergo-checkpoint.unreviewed.v1';
    expect(() => selectReviewedErgoCheckpointSourcePolicyV1(unreviewed))
      .toThrow(/not source reviewed/);

    for (const field of [
      'sourceNetworkIdHex',
      'spvProfileIdHex',
      'checkpointDifficultyContextDigestHex',
    ] as const) {
      const mutated = clone(rawPolicy) as unknown as {
        checkpoint: Record<typeof field, string>;
      };
      mutated.checkpoint[field] = flipFirstHexNibble(mutated.checkpoint[field]);
      expect(() => selectReviewedErgoCheckpointSourcePolicyV1(mutated), field)
        .toThrow(/not source reviewed/);
    }

    const changedWork = clone(rawPolicy) as unknown as {
      checkpoint: { checkpointCumulativeWork: string };
    };
    changedWork.checkpoint.checkpointCumulativeWork = (
      BigInt(changedWork.checkpoint.checkpointCumulativeWork) + 1n
    ).toString();
    expect(() => selectReviewedErgoCheckpointSourcePolicyV1(changedWork))
      .toThrow(/not source reviewed/);

    const enabled = clone(rawPolicy) as unknown as Record<string, unknown>;
    (enabled.activation as Record<string, unknown>).runtimeAuthorityEnabled = true;
    expect(() => selectReviewedErgoCheckpointSourcePolicyV1(enabled))
      .toThrow(/must remain non-authorizing/);
  });

  it('enforces the exact bounded observation set and supplied-clock age policy', () => {
    const { packet, policy, observations } = admissionFixture();
    const cases: Array<{
      name: string;
      observations: ErgoCheckpointSourceObservationV1[];
      error: RegExp;
    }> = [
      {
        name: 'missing',
        observations: observations.slice(0, 1),
        error: /missing or excessive/,
      },
      {
        name: 'duplicate',
        observations: [observations[0]!, {
          ...observations[1]!,
          sourceId: observations[0]!.sourceId,
        }],
        error: /duplicate source/,
      },
      {
        name: 'same origin',
        observations: [observations[0]!, {
          ...observations[1]!,
          rpcOrigin: observations[0]!.rpcOrigin,
        }],
        error: /distinct RPC origins/,
      },
      {
        name: 'same administration',
        observations: [observations[0]!, {
          ...observations[1]!,
          administrationId: observations[0]!.administrationId,
        }],
        error: /distinct administration identities/,
      },
      {
        name: 'stale',
        observations: [{
          ...observations[0]!,
          observedAtUnixMs: EVALUATED_AT_UNIX_MS - 300_001,
        }, observations[1]!],
        error: /is stale/,
      },
      {
        name: 'future',
        observations: [{
          ...observations[0]!,
          observedAtUnixMs: EVALUATED_AT_UNIX_MS + 1,
        }, observations[1]!],
        error: /from the future/,
      },
    ];

    for (const testCase of cases) {
      expect(() => buildErgoCheckpointSourceAdmissionV1({
        policy,
        retainedPacket: packet,
        observations: testCase.observations,
        evaluatedAtUnixMs: EVALUATED_AT_UNIX_MS,
      }), testCase.name).toThrow(testCase.error);
    }

    expect(() => buildErgoCheckpointSourceAdmissionV1({
      policy,
      retainedPacket: packet,
      observations: [{
        ...observations[0]!,
        observedAtUnixMs: EVALUATED_AT_UNIX_MS - 300_000,
      }, observations[1]!],
      evaluatedAtUnixMs: EVALUATED_AT_UNIX_MS,
    })).not.toThrow();
  });

  it('rejects divergent but individually valid relay observations', () => {
    const { fixture, packet, policy, observations } = admissionFixture();
    const relay = clone(decodeErgoAutolykosV2RelayRuntimeWitnessV1(
      fixture.relayWitnessBytes,
      fixture.expectedSpvProfileIdHex,
    )) as unknown as {
      branches: Array<{ observedAtTimestamp: string }>;
    };
    relay.branches[0]!.observedAtTimestamp = (
      BigInt(relay.branches[0]!.observedAtTimestamp) + 1n
    ).toString();
    const divergentWitness = encodeErgoAutolykosV2RelayRuntimeWitnessV1(relay);

    expect(() => buildErgoCheckpointSourceAdmissionV1({
      policy,
      retainedPacket: packet,
      observations: [observations[0]!, {
        ...observations[1]!,
        relayWitnessBytes: divergentWitness,
      }],
      evaluatedAtUnixMs: EVALUATED_AT_UNIX_MS,
    })).toThrow(/observations diverge/);
  });

  it('rejects wrong-network and wrong-checkpoint relay bytes before composition', () => {
    const { packet, policy, observations } = admissionFixture();
    const wrongNetwork = Buffer.from(observations[1]!.relayWitnessBytes);
    wrongNetwork[checkpointSectionOffset(wrongNetwork)] ^= 1;
    const wrongCheckpoint = Buffer.from(observations[1]!.relayWitnessBytes);
    wrongCheckpoint[checkpointSectionOffset(wrongCheckpoint) + 35] ^= 1;

    for (const [name, relayWitnessBytes] of [
      ['wrong network', wrongNetwork],
      ['wrong checkpoint', wrongCheckpoint],
    ] as const) {
      expect(() => buildErgoCheckpointSourceAdmissionV1({
        policy,
        retainedPacket: packet,
        observations: [observations[0]!, {
          ...observations[1]!,
          relayWitnessBytes,
        }],
        evaluatedAtUnixMs: EVALUATED_AT_UNIX_MS,
      }), name).toThrow(/network|checkpoint/i);
    }
  });

  it('rejects forged profile/admission provenance and accessor input', () => {
    const { packet, policy, observations } = admissionFixture();
    expect(() => buildErgoCheckpointSourceAdmissionV1({
      policy: clone(policy),
      retainedPacket: packet,
      observations,
      evaluatedAtUnixMs: EVALUATED_AT_UNIX_MS,
    })).toThrow(/reviewed provenance/);

    const admission = buildErgoCheckpointSourceAdmissionV1({
      policy,
      retainedPacket: packet,
      observations,
      evaluatedAtUnixMs: EVALUATED_AT_UNIX_MS,
    });
    expect(() => assertErgoCheckpointSourceAdmissionV1Provenance(clone(admission)))
      .toThrow(/lacks process provenance/);

    const accessor = { policy, retainedPacket: packet, observations } as
      Record<string, unknown>;
    Object.defineProperty(accessor, 'evaluatedAtUnixMs', {
      enumerable: true,
      get: () => EVALUATED_AT_UNIX_MS,
    });
    expect(() => buildErgoCheckpointSourceAdmissionV1(accessor as never))
      .toThrow(/data property/);
  });
});

function admissionFixture() {
  const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
  const relay = replayErgoAutolykosV2RelayWitnessV1(
    decodeErgoAutolykosV2RelayRuntimeWitnessV1(
      fixture.relayWitnessBytes,
      fixture.expectedSpvProfileIdHex,
    ),
  );
  const targetHeaderBytes = serializeErgoHeaderIdentity(relay.targetHeader);
  const capture = composeErgoUtxoStateRuntimeWitnessCaptureV1({
    targetHeaderBytes,
    transactionWitnessBytes: fixture.transactionWitnessBytes,
    expectedTransactionProfile: fixture.expectedTransactionProfile,
    currentTipBeforeHeaderBytes: targetHeaderBytes,
    boxesBinaryProofBytes: Buffer.from(fixture.utxoInput.proofHex, 'hex'),
    currentTipAfterHeaderBytes: targetHeaderBytes,
  });
  const packet = buildErgoUtxoStateRuntimeWitnessRetainedPacketV1({
    capture,
    transactionWitnessBytes: fixture.transactionWitnessBytes,
    expectedTransactionProfile: fixture.expectedTransactionProfile,
  });
  const rawPolicy: ErgoCheckpointSourcePolicyV1 = {
    schema: ERGO_CHECKPOINT_SOURCE_POLICY_V1_SCHEMA,
    environment: 'historical-conformance',
    policyId: 'ergo-checkpoint.synthetic-conformance.v1',
    checkpoint: {
      sourceNetworkIdHex: Buffer.from(relay.profile.sourceNetworkId).toString('hex'),
      spvProfileIdHex: fixture.expectedSpvProfileIdHex,
      checkpointHeaderIdHex: computeErgoHeaderId(relay.checkpoint.header).toString('hex'),
      checkpointHeight: relay.checkpoint.header.height,
      checkpointHeaderBytesHex:
        serializeErgoHeaderIdentity(relay.checkpoint.header).toString('hex'),
      checkpointDifficultyContextDigestHex: computeErgoDifficultyContextDigest(
        relay.checkpoint.difficultyContext,
      ).toString('hex'),
      checkpointCumulativeWork: relay.profile.checkpointCumulativeWork.toString(),
    },
    sourceSet: {
      maximumObservationAgeMs: 300_000,
      sources: [
        {
          sourceId: 'primary',
          administrationId: 'operator-a',
          rpcOrigin: 'https://primary.example.invalid',
        },
        {
          sourceId: 'witness',
          administrationId: 'operator-b',
          rpcOrigin: 'https://witness.example.invalid',
        },
      ],
    },
    activation: {
      runtimeAuthorityEnabled: false,
      fundsAuthorityEnabled: false,
    },
  };
  const policy = selectReviewedErgoCheckpointSourcePolicyV1(rawPolicy);
  const observations: ErgoCheckpointSourceObservationV1[] = [
    {
      sourceId: 'primary',
      administrationId: 'operator-a',
      rpcOrigin: 'https://primary.example.invalid',
      observedAtUnixMs: EVALUATED_AT_UNIX_MS - 100,
      relayWitnessBytes: fixture.relayWitnessBytes,
    },
    {
      sourceId: 'witness',
      administrationId: 'operator-b',
      rpcOrigin: 'https://witness.example.invalid',
      observedAtUnixMs: EVALUATED_AT_UNIX_MS - 50,
      relayWitnessBytes: fixture.relayWitnessBytes,
    },
  ];
  return { fixture, packet, rawPolicy, policy, observations };
}

function checkpointSectionOffset(bytes: Buffer): number {
  const envelopeHeaderBytes = 72;
  const profileSectionLength = bytes.readUInt32BE(50);
  return envelopeHeaderBytes + profileSectionLength;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function flipFirstHexNibble(value: string): string {
  return `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;
}
