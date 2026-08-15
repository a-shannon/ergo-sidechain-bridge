import { describe, expect, it } from 'vitest';

import {
  replayErgoAutolykosV2RelayWitnessV1,
} from '../ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
} from '../ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  serializeErgoHeaderIdentity,
} from '../ergo-settlement-core/ergo-header-id.js';
import {
  buildFrontierErgoUtxoRuntimeStatementV3Fixture,
} from '../test-fixtures/frontier-ergo-utxo-runtime-statement-v3-fixture.js';
import {
  composeErgoUtxoStateRuntimeWitnessCaptureV1,
} from './ergo-utxo-state-runtime-witness-capture-v1.js';
import {
  assertErgoUtxoStateRuntimeWitnessRetainedReplayV1Provenance,
  buildErgoUtxoStateRuntimeWitnessRetainedPacketV1,
  normalizeErgoUtxoStateRuntimeWitnessRetainedPacketV1,
  replayErgoUtxoStateRuntimeWitnessRetainedPacketV1,
} from './ergo-utxo-state-runtime-witness-retained-packet-v1.js';

describe('retained Ergo UTXO runtime witness packet V1', () => {
  it('round-trips the exact capture bytes and reconstructs the same proof result', () => {
    const { fixture, packet } = retainedFixture();
    const serialized = JSON.parse(JSON.stringify(packet)) as unknown;
    const normalized = normalizeErgoUtxoStateRuntimeWitnessRetainedPacketV1(serialized);
    const replay = replayErgoUtxoStateRuntimeWitnessRetainedPacketV1(serialized);

    expect(normalized).toEqual(packet);
    expect(replay.capture.witness.bytesHex).toBe(fixture.utxoWitnessBytes.toString('hex'));
    expect(replay.capture.captureDigestHex).toBe(packet.sourceCaptureDigestHex);
    expect(replay).toMatchObject({
      status: 'NON_AUTHORIZING_RETAINED_UTXO_WITNESS_REPLAYED',
      checks: {
        packetDigestVerified: true,
        transactionWitnessReplayed: true,
        utxoWitnessReplayed: true,
        captureDigestReproduced: true,
      },
      authority: {
        nodeObservationProvenancePersisted: false,
        checkpointExternallyAuthenticated: false,
        globallyCanonicalErgoConsensusAccepted: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
      },
    });
    expect(buildPacket(fixture).packetDigestHex).toBe(packet.packetDigestHex);
    expect(() => assertErgoUtxoStateRuntimeWitnessRetainedReplayV1Provenance(replay))
      .not.toThrow();
  });

  it('rejects digest, derived identity, profile, and authority drift after serialization', () => {
    const { packet } = retainedFixture();
    const mutations: Array<Readonly<{
      mutate: (value: Record<string, unknown>) => void;
      expectedError: RegExp;
    }>> = [
      {
        mutate: value => { value.packetDigestHex = '00'.repeat(32); },
        expectedError: /packet digest mismatch/,
      },
      {
        mutate: value => { value.targetHeaderIdHex = '00'.repeat(32); },
        expectedError: /derived fields drifted/,
      },
      {
        mutate: value => { value.transactionWitnessIdHex = '00'.repeat(32); },
        expectedError: /derived fields drifted/,
      },
      {
        mutate: value => { value.utxoWitnessIdHex = '00'.repeat(32); },
        expectedError: /derived fields drifted/,
      },
      {
        mutate: value => { value.sourceCaptureDigestHex = '00'.repeat(32); },
        expectedError: /source capture digest mismatch/,
      },
      {
        mutate: (value) => {
          const profile = value.expectedTransactionProfile as Record<string, unknown>;
          profile.routeProfileIdHex = '00'.repeat(32);
        },
        expectedError: /route-profile ID must be nonzero/,
      },
      {
        mutate: (value) => {
          const profile = value.expectedTransactionProfile as Record<string, unknown>;
          profile.routeProfileIdHex = `0x${profile.routeProfileIdHex as string}`;
        },
        expectedError: /bounded canonical lowercase hexadecimal/,
      },
      {
        mutate: (value) => {
          const authority = value.authority as Record<string, unknown>;
          authority.mintAuthorized = true;
        },
        expectedError: /must remain false/,
      },
    ];
    for (const { mutate, expectedError } of mutations) {
      const candidate = JSON.parse(JSON.stringify(packet)) as Record<string, unknown>;
      mutate(candidate);
      expect(() => normalizeErgoUtxoStateRuntimeWitnessRetainedPacketV1(candidate))
        .toThrow(expectedError);
    }
  });

  it('rejects target, transaction, or UTXO witness byte drift independently', () => {
    const { packet } = retainedFixture();
    for (const field of [
      'targetHeaderBytesHex',
      'transactionWitnessBytesHex',
      'utxoWitnessBytesHex',
    ] as const) {
      const candidate = JSON.parse(JSON.stringify(packet)) as Record<string, unknown>;
      candidate[field] = mutateHex(candidate[field] as string, 16);
      expect(() => normalizeErgoUtxoStateRuntimeWitnessRetainedPacketV1(candidate))
        .toThrow();
    }
  });

  it('rejects capture and transaction inputs from different transitions', () => {
    const { fixture, capture } = captureFixture();
    const transactionWitnessBytes = Buffer.from(fixture.transactionWitnessBytes);
    transactionWitnessBytes[16] ^= 1;
    expect(() => buildErgoUtxoStateRuntimeWitnessRetainedPacketV1({
      capture,
      transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
    })).toThrow();
  });

  it('rejects accessor or symbol input and forged replay provenance', () => {
    const { fixture, capture } = captureFixture();
    const accessor = {
      capture,
      transactionWitnessBytes: fixture.transactionWitnessBytes,
    } as Record<string, unknown>;
    Object.defineProperty(accessor, 'expectedTransactionProfile', {
      enumerable: true,
      get: () => fixture.expectedTransactionProfile,
    });
    expect(() => buildErgoUtxoStateRuntimeWitnessRetainedPacketV1(accessor as never))
      .toThrow(/data property/);
    const symbolInput = Object.assign({
      capture,
      transactionWitnessBytes: fixture.transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
    }, { [Symbol('authority')]: true });
    expect(() => buildErgoUtxoStateRuntimeWitnessRetainedPacketV1(symbolInput))
      .toThrow(/must contain exactly/);
    const replay = replayErgoUtxoStateRuntimeWitnessRetainedPacketV1(
      JSON.parse(JSON.stringify(buildPacket(fixture))) as unknown,
    );
    const replayClone = JSON.parse(JSON.stringify(replay)) as unknown;
    expect(() => assertErgoUtxoStateRuntimeWitnessRetainedReplayV1Provenance(replayClone))
      .toThrow(/lacks process provenance/);
    expect(() => assertErgoUtxoStateRuntimeWitnessRetainedReplayV1Provenance({}))
      .toThrow(/lacks process provenance/);
  });
});

function retainedFixture() {
  const { fixture, capture } = captureFixture();
  return {
    fixture,
    capture,
    packet: buildErgoUtxoStateRuntimeWitnessRetainedPacketV1({
      capture,
      transactionWitnessBytes: fixture.transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
    }),
  };
}

function buildPacket(
  fixture: ReturnType<typeof buildFrontierErgoUtxoRuntimeStatementV3Fixture>,
) {
  const { capture } = captureFixture(fixture);
  return buildErgoUtxoStateRuntimeWitnessRetainedPacketV1({
    capture,
    transactionWitnessBytes: fixture.transactionWitnessBytes,
    expectedTransactionProfile: fixture.expectedTransactionProfile,
  });
}

function captureFixture(
  fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture(),
) {
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
  return { fixture, capture };
}

function mutateHex(value: string, index: number): string {
  const next = value[index] === '0' ? '1' : '0';
  return `${value.slice(0, index)}${next}${value.slice(index + 1)}`;
}
