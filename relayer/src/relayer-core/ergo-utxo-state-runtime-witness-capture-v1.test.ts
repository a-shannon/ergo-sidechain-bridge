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
  assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance,
  composeErgoUtxoStateRuntimeWitnessCaptureV1,
} from './ergo-utxo-state-runtime-witness-capture-v1.js';
import {
  buildFrontierErgoUtxoRuntimeStatementV3Fixture,
} from '../test-fixtures/frontier-ergo-utxo-runtime-statement-v3-fixture.js';

describe('Ergo UTXO state runtime witness capture V1', () => {
  it('verifies one stable supplied-tip tuple and reproduces E2UTXW01', () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const capture = compose(fixture);

    expect(Buffer.from(capture.witness.bytesHex, 'hex')).toEqual(
      fixture.utxoWitnessBytes,
    );
    expect(capture).toMatchObject({
      status: 'NON_AUTHORIZING_STABLE_SUPPLIED_TIP_UTXO_PROOF_CAPTURED',
      targetHeader: {
        stateRootHex: fixture.utxoInput.stateRootHex,
      },
      lookup: {
        orderedBoxIdsHex: [
          fixture.utxoInput.vaultBoxIdHex,
          fixture.utxoInput.refundableSourceBoxIdHex,
        ],
        proofLength: 280,
      },
      witness: {
        witnessIdHex:
          'e7c82bef7d520d0f30d1122221f97f41ae1d275d495a5e5e41df517367fdebf5',
      },
      authority: {
        nodeObservationAdapterProvenanceEstablished: false,
        globallyCanonicalErgoConsensusAccepted: false,
        currentUtxoMembershipEstablished: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        productionReady: false,
      },
    });
    expect(Object.isFrozen(capture)).toBe(true);
    expect(Object.isFrozen(capture.lookup.orderedBoxIdsHex)).toBe(true);
    expect(() => assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance(capture))
      .not.toThrow();
  });

  it('rejects supplied target drift before or after proof collection', () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const targetHeaderBytes = targetBytes(fixture);
    const drifted = Buffer.from(targetHeaderBytes);
    drifted[40] ^= 1;

    expect(() => compose(fixture, [drifted, targetHeaderBytes])).toThrow(
      /does not equal the exact target header before/,
    );
    expect(() => compose(fixture, [targetHeaderBytes, drifted])).toThrow(
      /does not equal the exact target header after/,
    );
  });

  it('rejects malformed, root-drifting, and wrong-role proofs', () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    for (const proof of [
      Buffer.from(fixture.utxoInput.proofHex, 'hex').subarray(0, -1),
      mutate(Buffer.from(fixture.utxoInput.proofHex, 'hex'), 4),
      Buffer.alloc(0),
    ]) {
      expect(() => compose(fixture, undefined, proof)).toThrow();
    }
  });

  it('rejects a transaction witness or target header from another transition', () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const targetHeaderBytes = targetBytes(fixture);
    const wrongRoot = Buffer.from(targetHeaderBytes);
    wrongRoot[70] ^= 1;
    expect(() => composeErgoUtxoStateRuntimeWitnessCaptureV1({
      targetHeaderBytes: wrongRoot,
      transactionWitnessBytes: fixture.transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
      currentTipBeforeHeaderBytes: wrongRoot,
      boxesBinaryProofBytes: Buffer.from(fixture.utxoInput.proofHex, 'hex'),
      currentTipAfterHeaderBytes: wrongRoot,
    })).toThrow(/transaction runtime witness does not match/);

    const wrongTransaction = Buffer.from(fixture.transactionWitnessBytes);
    wrongTransaction[16] ^= 1;
    expect(() => composeErgoUtxoStateRuntimeWitnessCaptureV1({
      targetHeaderBytes,
      transactionWitnessBytes: wrongTransaction,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
      currentTipBeforeHeaderBytes: targetHeaderBytes,
      boxesBinaryProofBytes: Buffer.from(fixture.utxoInput.proofHex, 'hex'),
      currentTipAfterHeaderBytes: targetHeaderBytes,
    })).toThrow();
  });

  it('rejects extra symbol input and forged capture provenance', () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const targetHeaderBytes = targetBytes(fixture);
    const symbolInput = Object.assign({
      targetHeaderBytes,
      transactionWitnessBytes: fixture.transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
      currentTipBeforeHeaderBytes: targetHeaderBytes,
      boxesBinaryProofBytes: Buffer.from(fixture.utxoInput.proofHex, 'hex'),
      currentTipAfterHeaderBytes: targetHeaderBytes,
    }, { [Symbol('authority')]: true });
    expect(() => composeErgoUtxoStateRuntimeWitnessCaptureV1(symbolInput))
      .toThrow(/must contain exactly/);
    expect(() => assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance({}))
      .toThrow(/lacks process provenance/);
  });
});

function targetBytes(fixture: ReturnType<
  typeof buildFrontierErgoUtxoRuntimeStatementV3Fixture
>): Buffer {
  const relay = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
    fixture.relayWitnessBytes,
    fixture.expectedSpvProfileIdHex,
  );
  return serializeErgoHeaderIdentity(
    replayErgoAutolykosV2RelayWitnessV1(relay).targetHeader,
  );
}

function compose(
  fixture: ReturnType<typeof buildFrontierErgoUtxoRuntimeStatementV3Fixture>,
  headers?: readonly [Uint8Array, Uint8Array],
  proof: Uint8Array = Buffer.from(fixture.utxoInput.proofHex, 'hex'),
) {
  const targetHeaderBytes = targetBytes(fixture);
  return composeErgoUtxoStateRuntimeWitnessCaptureV1({
    targetHeaderBytes,
    transactionWitnessBytes: fixture.transactionWitnessBytes,
    expectedTransactionProfile: fixture.expectedTransactionProfile,
    currentTipBeforeHeaderBytes: headers?.[0] ?? targetHeaderBytes,
    boxesBinaryProofBytes: proof,
    currentTipAfterHeaderBytes: headers?.[1] ?? targetHeaderBytes,
  });
}

function mutate(value: Buffer, offset: number): Buffer {
  const copy = Buffer.from(value);
  copy[offset] ^= 1;
  return copy;
}
