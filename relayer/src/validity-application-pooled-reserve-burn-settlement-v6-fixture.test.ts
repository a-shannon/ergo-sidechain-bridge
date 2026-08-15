import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildValidityApplicationPooledReserveBurnSettlementV6AcceptanceFixture,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V6_ACCEPTANCE_FIXTURE_SCHEMA,
} from './validity-application-pooled-reserve-burn-settlement-v6-fixture.js';

describe('pooled-reserve V6 burn-settlement JVM acceptance fixture', () => {
  it('materializes one deterministic exact V6 settlement fixture', async () => {
    const first =
      await buildValidityApplicationPooledReserveBurnSettlementV6AcceptanceFixture();
    const second =
      await buildValidityApplicationPooledReserveBurnSettlementV6AcceptanceFixture();

    expect(second).toEqual(first);
    expect(first.schema).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V6_ACCEPTANCE_FIXTURE_SCHEMA,
    );
    expect(first.version).toBe(6);
    expect(first.sigmaStateCommit)
      .toBe('f78deadd668f801e7fae3bc884283f79c6f484fa');
    expect(first.compilerReceipt.sha256Hex)
      .toBe('302db270a82d2492e52e3adaa7cfdb259f8e6bb6e452c34e563a7c85455a5b56');
    expect(first.contracts).toEqual({
      tracker: expect.objectContaining({
        contractIdHex:
          'c9c8315fd54af8387f16f177c66fc9f8748f683fc394bd8678a359f9a793d7bb',
      }),
      duplicatePrevention: expect.objectContaining({
        contractIdHex:
          '5062c938e5ecaf04384cc2dadeaf0d1d0333c6255cef67653913f92a8e2e50c2',
      }),
      pooledReserve: expect.objectContaining({
        contractIdHex:
          '6aa92a05622a5e6490285b06e6e3654e3900495873195a364ad58b9fe22e1bfc',
      }),
    });
    expect(first.prooflessTransactionIdHex)
      .toBe('e9511548e623756c917496e13f41fbfd65703deedd8a521288b082aedb800a83');
    expect(first.prooflessTransactionBytes).toBe(6600);
    expect(first.prooflessTransactionHex).toMatch(/^[0-9a-f]+$/);
    expect(Buffer.from(first.prooflessTransactionHex, 'hex')).toHaveLength(
      first.prooflessTransactionBytes,
    );
    expect(first.inputBoxSigmaHex).toHaveLength(3);
    expect(first.dataInputBoxSigmaHex).toHaveLength(1);
    expect(first.contextExtensions.map(extension => extension.keys)).toEqual([
      [],
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
