import { describe, expect, it } from 'vitest';

import {
  assertValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture,
  buildValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture,
} from './validity-application-pooled-reserve-burn-settlement-v4-fixture.js';
import {
  assertValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture,
  buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4-fixture.js';

describe('pooled-reserve V4 integrated historical DUP fixture', () => {
  it('joins the exact tracker statement, settlement, and DUP lineage once', async () => {
    const fixture =
      await buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture();
    assertValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
      fixture,
    );
    assertValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture(
      fixture.settlementFixture,
    );

    const settlement = fixture.settlementFixture.settlementPacket;
    const tracker = fixture.settlementFixture.trackerContext;
    const lineage = fixture.historicalLineage;
    expect(lineage.classification).toBe('raw-reconstructed');
    expect(lineage.rawInsertedKeysHex).toEqual([
      settlement.burn.leaf.burnIdHex,
    ]);
    expect(lineage.transitions).toHaveLength(1);
    expect(lineage.lineageBoxes.map(box => box.boxIdHex)).toEqual([
      settlement.boxes.duplicatePreventionPredecessor.boxId,
      settlement.boxes.duplicatePreventionSuccessor.boxId,
    ]);
    expect(fixture.bindings).toMatchObject({
      lineageProfileIdHex: settlement.lineageProfileIdHex,
      applicationBindingDigestHex:
        tracker.statement.applicationBindingDigestHex,
      trackerStatementDigestHex: tracker.statement.digestHex,
      trackerKeyHex: settlement.tracker.keyHex,
      trackerValueHex: settlement.tracker.valueHex,
      checkpointCommitmentHex:
        settlement.tracker.decodedValue.checkpointCommitmentHex,
      bridgeEventRootHex: settlement.tracker.decodedValue.bridgeEventRootHex,
      burnLeafHex: settlement.burn.leaf.encodedLeafHex,
      burnIdHex: settlement.burn.leaf.burnIdHex,
      recipientErgoTreeHex: settlement.burn.recipientErgoTreeHex,
      amountNanoErg: settlement.burn.leaf.amountNanoErg,
      payoutBoxIdHex: settlement.boxes.payout.boxId,
      settlementTransactionIdHex: settlement.transaction.txId,
      duplicatePreventionPredecessorBoxIdHex:
        settlement.boxes.duplicatePreventionPredecessor.boxId,
      duplicatePreventionSuccessorBoxIdHex:
        settlement.boxes.duplicatePreventionSuccessor.boxId,
      duplicatePreventionInputDigestHex:
        settlement.duplicatePrevention.inputDigestHex,
      duplicatePreventionOutputDigestHex:
        settlement.duplicatePrevention.outputDigestHex,
    });
    expect(fixture.instance).toMatchObject({
      ergoTreeHex:
        fixture.settlementFixture.compiledInstance.contracts
          .duplicatePrevention.receipt.propositionHex,
      singletonTokenIdHex:
        fixture.settlementFixture.compiledInstance.genesis
          .duplicatePreventionNftIdHex.slice(2),
      genesisBoxIdHex:
        settlement.boxes.duplicatePreventionPredecessor.boxId,
    });
    expect(fixture.boundaries).toMatchObject({
      fixtureOnly: true,
      distinctSyntheticViewsMatched: true,
      canonicalEventMappingEstablished: false,
      sourceAdmissionEstablished: false,
      ergoConsensusAuthenticated: false,
      sidechainFinalityEstablished: false,
      proofSystemActivated: false,
      targetNodeAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
    });
  });

  it('is deterministic and rejects cloned producer or joined provenance', async () => {
    const settlement =
      await buildValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture();
    const first =
      await buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
        settlement,
      );
    const second =
      await buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
        settlement,
      );
    expect(second.joinDigestHex).toBe(first.joinDigestHex);
    expect(second.historicalLineage.observationDigestHex)
      .toBe(first.historicalLineage.observationDigestHex);
    expect(second.historicalLineage.packetDigestHex)
      .toBe(first.historicalLineage.packetDigestHex);

    expect(() =>
      assertValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
        structuredClone(first),
      )
    ).toThrow(/must be built in this process/);
    await expect(
      buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
        structuredClone(settlement),
      ),
    ).rejects.toThrow(/must be built in this process/);
  });
});
