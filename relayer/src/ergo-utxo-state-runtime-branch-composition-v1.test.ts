import { describe, expect, it } from 'vitest';

import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  replayErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  serializeErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  assertErgoUtxoStateRuntimeBranchCompositionV1Provenance,
  buildErgoUtxoStateRuntimeBranchCompositionV1,
} from './ergo-utxo-state-runtime-branch-composition-v1.js';
import {
  composeErgoUtxoStateRuntimeWitnessCaptureV1,
} from './relayer-core/ergo-utxo-state-runtime-witness-capture-v1.js';
import {
  buildErgoUtxoStateRuntimeWitnessRetainedPacketV1,
} from './relayer-core/ergo-utxo-state-runtime-witness-retained-packet-v1.js';
import {
  buildFrontierErgoUtxoRuntimeStatementV3Fixture,
} from './test-fixtures/frontier-ergo-utxo-runtime-statement-v3-fixture.js';

describe('retained Ergo UTXO supplied-branch composition V1', () => {
  it('replays retained proof bytes and rebuilds the exact V3 statement at supplied-branch depth', () => {
    const { fixture, packet } = compositionFixture();
    const composition = buildErgoUtxoStateRuntimeBranchCompositionV1({
      retainedPacket: JSON.parse(JSON.stringify(packet)) as typeof packet,
      relayWitnessBytes: fixture.relayWitnessBytes,
      expectedSpvProfileIdHex: fixture.expectedSpvProfileIdHex,
    });

    expect(composition).toMatchObject({
      status: 'NON_AUTHORIZING_RETAINED_UTXO_SUPPLIED_BRANCH_COMPOSED',
      retainedPacket: {
        packetDigestHex: packet.packetDigestHex,
        sourceCaptureDigestHex: packet.sourceCaptureDigestHex,
        transactionWitnessIdHex: packet.transactionWitnessIdHex,
        utxoWitnessIdHex: packet.utxoWitnessIdHex,
      },
      suppliedBranch: {
        spvProfileIdHex: fixture.expectedSpvProfileIdHex,
        suppliedBranchCount: 1,
        confirmations: 2,
        requiredConfirmations: 2,
      },
      runtimeStatementV3: {
        statementIdHex: fixture.statementIdHex,
        statementHex: `0x${fixture.statementBytes.toString('hex')}`,
      },
      checks: {
        retainedPacketDigestAndWitnessesReplayed: true,
        everySuppliedBranchVerified: true,
        selectedBranchGreatestWorkAmongSupplied: true,
        exactTargetHeaderMatchedRetainedCapture: true,
        targetPolicyDepthSatisfied: true,
        runtimeStatementV3Rebuilt: true,
      },
      authority: {
        nodeObservationProvenancePersisted: false,
        checkpointExternallyAuthenticated: false,
        completeCompetingBranchKnowledgeEstablished: false,
        globallyCanonicalErgoConsensusAccepted: false,
        deterministicFinalityEstablished: false,
        currentUtxoMembershipEstablished: false,
        transactionExecutionValidated: false,
        runtimeAdmissionAuthorized: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        productionReady: false,
      },
    });
    expect(composition.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining('every supplied branch'),
      expect.stringContaining('not externally authenticated'),
      expect.stringContaining('does not preserve process-local node-adapter provenance'),
    ]));
    expect(() => assertErgoUtxoStateRuntimeBranchCompositionV1Provenance(composition))
      .not.toThrow();
  });

  it('rejects the wrong statically expected SPV profile', () => {
    const { fixture, packet } = compositionFixture();
    expect(() => buildErgoUtxoStateRuntimeBranchCompositionV1({
      retainedPacket: packet,
      relayWitnessBytes: fixture.relayWitnessBytes,
      expectedSpvProfileIdHex: '00'.repeat(32),
    })).toThrow();
  });

  it('rejects relay witness byte drift instead of accepting a stale branch identity', () => {
    const { fixture, packet } = compositionFixture();
    const relayWitnessBytes = Buffer.from(fixture.relayWitnessBytes);
    relayWitnessBytes[relayWitnessBytes.length - 1] ^= 1;
    expect(() => buildErgoUtxoStateRuntimeBranchCompositionV1({
      retainedPacket: packet,
      relayWitnessBytes,
      expectedSpvProfileIdHex: fixture.expectedSpvProfileIdHex,
    })).toThrow();
  });

  it('rejects retained packet witness or authority drift before branch composition', () => {
    const { fixture, packet } = compositionFixture();
    const mutations: Array<(value: Record<string, unknown>) => void> = [
      value => { value.transactionWitnessIdHex = '00'.repeat(32); },
      value => { value.utxoWitnessBytesHex = mutateHex(value.utxoWitnessBytesHex as string); },
      value => {
        const authority = value.authority as Record<string, unknown>;
        authority.currentUtxoMembershipEstablished = true;
      },
    ];
    for (const mutate of mutations) {
      const retainedPacket = JSON.parse(JSON.stringify(packet)) as Record<string, unknown>;
      mutate(retainedPacket);
      expect(() => buildErgoUtxoStateRuntimeBranchCompositionV1({
        retainedPacket: retainedPacket as typeof packet,
        relayWitnessBytes: fixture.relayWitnessBytes,
        expectedSpvProfileIdHex: fixture.expectedSpvProfileIdHex,
      })).toThrow();
    }
  });

  it('rejects accessor or symbol input and forged composition provenance', () => {
    const { fixture, packet } = compositionFixture();
    const accessor = {
      retainedPacket: packet,
      relayWitnessBytes: fixture.relayWitnessBytes,
    } as Record<string, unknown>;
    Object.defineProperty(accessor, 'expectedSpvProfileIdHex', {
      enumerable: true,
      get: () => fixture.expectedSpvProfileIdHex,
    });
    expect(() => buildErgoUtxoStateRuntimeBranchCompositionV1(accessor as never))
      .toThrow(/data property/);
    const symbolInput = Object.assign({
      retainedPacket: packet,
      relayWitnessBytes: fixture.relayWitnessBytes,
      expectedSpvProfileIdHex: fixture.expectedSpvProfileIdHex,
    }, { [Symbol('authority')]: true });
    expect(() => buildErgoUtxoStateRuntimeBranchCompositionV1(symbolInput))
      .toThrow(/must contain exactly/);
    const composition = buildErgoUtxoStateRuntimeBranchCompositionV1({
      retainedPacket: packet,
      relayWitnessBytes: fixture.relayWitnessBytes,
      expectedSpvProfileIdHex: fixture.expectedSpvProfileIdHex,
    });
    const compositionClone = JSON.parse(JSON.stringify(composition)) as unknown;
    expect(() => assertErgoUtxoStateRuntimeBranchCompositionV1Provenance(
      compositionClone,
    )).toThrow(/lacks process provenance/);
    expect(() => assertErgoUtxoStateRuntimeBranchCompositionV1Provenance({}))
      .toThrow(/lacks process provenance/);
  });
});

function compositionFixture() {
  const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
  const relay = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
    fixture.relayWitnessBytes,
    fixture.expectedSpvProfileIdHex,
  );
  const targetHeaderBytes = serializeErgoHeaderIdentity(
    replayErgoAutolykosV2RelayWitnessV1(relay).targetHeader,
  );
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
  return { fixture, packet };
}

function mutateHex(value: string): string {
  const index = Math.min(16, value.length - 1);
  const next = value[index] === '0' ? '1' : '0';
  return `${value.slice(0, index)}${next}${value.slice(index + 1)}`;
}
