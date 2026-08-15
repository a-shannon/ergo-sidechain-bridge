import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildValidityApplicationPooledReserveBurnSettlementV5AcceptanceFixture,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V5_ACCEPTANCE_FIXTURE_SCHEMA,
} from './validity-application-pooled-reserve-burn-settlement-v5-fixture.js';

describe('pooled-reserve V5 burn-settlement JVM acceptance fixture', () => {
  it('materializes one deterministic exact V5 settlement fixture', async () => {
    const first =
      await buildValidityApplicationPooledReserveBurnSettlementV5AcceptanceFixture();
    const second =
      await buildValidityApplicationPooledReserveBurnSettlementV5AcceptanceFixture();

    expect(second).toEqual(first);
    expect(first.schema).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V5_ACCEPTANCE_FIXTURE_SCHEMA,
    );
    expect(first.version).toBe(5);
    expect(first.sigmaStateCommit)
      .toBe('f78deadd668f801e7fae3bc884283f79c6f484fa');
    expect(first.compilerReceipt.sha256Hex)
      .toBe('b56eb130f63de10e26801e9983f722a6185a658580a1949fe0d133e717756db1');
    expect(first.contracts).toEqual({
      tracker: expect.objectContaining({
        contractIdHex:
          'c9f54f6e60bcad8a135df23e92c69a5134144c2cebc7091566f6da490b7cff08',
      }),
      duplicatePrevention: expect.objectContaining({
        contractIdHex:
          'dea715869bab05f678d7d7f30375d95d6b791a2ed2d8db4a8c982dcef88a778c',
      }),
      pooledReserve: expect.objectContaining({
        contractIdHex:
          '00e45fb10eb4b70a8b0aa7276f17752c7c46210dd474b553b1f5cdfd3edabac6',
      }),
    });
    expect(first.prooflessTransactionIdHex)
      .toBe('54055d4fd8d8f6dc2d9a5483e0e4d535ff1be6a9663a622bc699eab68f6aa07a');
    expect(first.prooflessTransactionHex).toMatch(/^[0-9a-f]+$/);
    expect(Buffer.from(first.prooflessTransactionHex, 'hex')).toHaveLength(
      first.prooflessTransactionBytes,
    );
    expect(first.inputBoxSigmaHex).toHaveLength(3);
    expect(first.dataInputBoxSigmaHex).toHaveLength(1);
    expect(first.contextExtensions.map(extension => extension.keys)).toEqual([
      [0, 1, 2, 3],
      [0, 1, 2, 3],
      [],
    ]);
    expect(first.transactionShape).toEqual({
      protectedInputIndices: [0, 1],
      reserveInputIndex: 0,
      duplicatePreventionInputIndex: 1,
      externalFeeInputIndex: 2,
      trackerDataInputIndex: 0,
      reserveOutputIndex: 0,
      duplicatePreventionOutputIndex: 1,
      payoutOutputIndex: 2,
      externalFeeOutputIndex: 3,
    });
    expect(first.boundaries).toEqual({
      syntheticSettlementPredecessorsConstructed: true,
      reservePredecessorProvenanceEstablished: false,
      trackerAdmissionEstablished: false,
      sidechainFinalityEstablished: false,
      proofSystemActivated: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });

    const canonicalJson = `${JSON.stringify(first, null, 2)}\n`;
    expect(createHash('sha256').update(canonicalJson, 'ascii').digest('hex'))
      .toMatch(/^[0-9a-f]{64}$/);
  });
});
