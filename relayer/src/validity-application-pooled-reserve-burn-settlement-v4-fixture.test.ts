import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assertValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture,
  buildValidityApplicationPooledReserveBurnSettlementV4AcceptanceFixture,
  buildValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_ACCEPTANCE_FIXTURE_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_INTEGRATED_FIXTURE_SCHEMA,
} from './validity-application-pooled-reserve-burn-settlement-v4-fixture.js';

describe('pooled-reserve V4 burn-settlement JVM acceptance fixture', () => {
  it('materializes one deterministic exact AF-4C-1 transaction fixture', async () => {
    const first =
      await buildValidityApplicationPooledReserveBurnSettlementV4AcceptanceFixture();
    const second =
      await buildValidityApplicationPooledReserveBurnSettlementV4AcceptanceFixture();

    expect(second).toEqual(first);
    expect(first.schema).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_ACCEPTANCE_FIXTURE_SCHEMA,
    );
    expect(first.version).toBe(1);
    expect(first.sigmaStateCommit)
      .toBe('f78deadd668f801e7fae3bc884283f79c6f484fa');
    expect(first.compilerReceipt.sha256Hex)
      .toBe('69a545564256e84b28c6744f96e3a484eac76b3c30b97f99f6eee14fda57dc52');
    expect(first.prooflessTransactionIdHex).toMatch(/^[0-9a-f]{64}$/);
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
    expect(createHash('sha256').update(
      JSON.stringify(first),
      'ascii',
    ).digest('hex'))
      .toBe('ea3be218b63c39042432690050666db391d701fc2760baa45f7a6eea3d2a7b3a');
    expect(first.prooflessTransactionIdHex)
      .toBe('4507b1cd9efe3a023453e069c92eb4b5da158459a94a9adafd27e1d158af4b7d');
  });

  it('joins the compiled tracker context to the exact V4 settlement packet', async () => {
    const first =
      await buildValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture();
    const second =
      await buildValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture();

    expect(second).toBe(first);
    expect(first.schema).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V4_INTEGRATED_FIXTURE_SCHEMA,
    );
    expect(() =>
      assertValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture(
        first,
      )).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture({
        ...first,
      })).toThrow('must be built in this process');

    const { compiledInstance, trackerContext, settlementPacket } = first;
    expect(trackerContext.contract.contractIdHex)
      .toBe(compiledInstance.contracts.tracker.receipt.contractIdHex);
    expect(trackerContext.contract.contractIdHex)
      .toBe('bfba2ed2dabca6a843b3acf996029cb3ed5578eda512043cb5e1a7217624e594');
    expect(settlementPacket.tracker.keyHex)
      .toBe(trackerContext.trackerTransition.trackerKeyHex);
    expect(settlementPacket.tracker.valueHex)
      .toBe(trackerContext.trackerTransition.trackerValueHex);
    expect(settlementPacket.tracker.decodedValue.applicationBindingDigestHex)
      .toBe(trackerContext.statement.applicationBindingDigestHex);
    expect(settlementPacket.boxes.trackerDataInput.transactionId)
      .toBe(trackerContext.unsignedTransactionIdHex);
    expect(settlementPacket.boxes.trackerDataInput.index).toBe(0);
    expect(settlementPacket.boxes.trackerDataInput.ergoTree)
      .toBe(trackerContext.contract.propositionHex);
    expect(settlementPacket.boxes.trackerDataInput.assets).toEqual([{
      tokenId: trackerContext.trackerTransition.trackerNftIdHex,
      amount: '1',
    }]);
    expect(settlementPacket.boxes.trackerDataInput.additionalRegisters)
      .toEqual(trackerContext.trackerTransition.successorRegisters);
    expect(settlementPacket.burn.leaf.sidechainBlockHashHex)
      .toBe('ab'.repeat(32));
    expect(first.boundaries).toEqual({
      fixtureOnly: true,
      sourceAdmissionEstablished: false,
      sidechainFinalityEstablished: false,
      proofSystemActivated: false,
      targetNodeAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
  });
});
