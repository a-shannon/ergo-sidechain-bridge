import { createHash } from 'node:crypto';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedBurnSettlementV1AcceptanceFixture,
  SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V1_ACCEPTANCE_FIXTURE_SCHEMA,
} from './substrate-federated-burn-settlement-v1-acceptance-fixture.js';

describe('Substrate federated V1 burn-settlement JVM fixture', () => {
  it('materializes one deterministic exact FED-3B settlement fixture', async () => {
    const first =
      await buildSubstrateFederatedBurnSettlementV1AcceptanceFixture();
    const second =
      await buildSubstrateFederatedBurnSettlementV1AcceptanceFixture();

    expect(second).toEqual(first);
    expect(first.schema).toBe(
      SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V1_ACCEPTANCE_FIXTURE_SCHEMA,
    );
    expect(first.version).toBe(1);
    expect(first.trustModel).toBe('federated_non_trustless');
    expect(first.sigmaStateCommit)
      .toBe('f78deadd668f801e7fae3bc884283f79c6f484fa');
    expect(first.compilerBatch.sha256Hex)
      .toBe('8a6fa2b2acba330f92718389fc401cc7f15f67602282d949958cc072406fa20e');
    expect(first.contracts).toEqual({
      tracker: expect.objectContaining({
        contractIdHex:
          '4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c',
        propositionSha256Hex:
          '8de007e45b4528614885b922732c1d1b2f38bc76bc73f4468f91ccb85d4f7a80',
        propositionBytes: 2713,
      }),
      duplicatePrevention: expect.objectContaining({
        contractIdHex:
          '3a3c8f40d4901b8ae30a5b6a43c001127bcf8d4cb6a3e89bc1b075620b7683e4',
        propositionSha256Hex:
          '36504d682d9306121c5628e7b7d6381ed0e3181f4377e512cc658dbca22f5b20',
        propositionBytes: 3419,
      }),
      sourceLock: expect.objectContaining({
        contractIdHex:
          '76c16560b4232d3d992febfd3a9939b67203424087b5b54a1845e13b39464402',
        propositionSha256Hex:
          'd9b5193eef560ede574f39b4dce3c5615ce5543caa680cd1cff413f70b8703ea',
        propositionBytes: 1317,
      }),
      pooledReserve: expect.objectContaining({
        contractIdHex:
          '16ac723b2c5e899240173abbb5632aa4a1730c0688ada499898a63b05389421c',
        propositionSha256Hex:
          'c0daea38f6aa856c2a260386fb51c95209673e20851663cb239a75432605b25d',
        propositionBytes: 1962,
      }),
    });
    expect(first.bindings.familyIdHex)
      .toBe('fc4ef41f900e0801c56183999056ef739c4cce29dab9a7c7129ecaf49c76e6e8');
    expect(first.prooflessTransactionIdHex)
      .toBe(first.unsignedTransactionIdHex);
    expect(first.prooflessTransactionIdHex)
      .toBe('27436055d83147364f240d5f5b194c8ed66cdbc10125655a033f1372d1b26a6e');
    expect(first.prooflessTransactionBytes).toBe(6920);
    expect(first.prooflessTransactionHex).toMatch(/^[0-9a-f]+$/);
    const prooflessBytes = Buffer.from(first.prooflessTransactionHex, 'hex');
    expect(prooflessBytes).toHaveLength(first.prooflessTransactionBytes);
    expect(Buffer.from(
      blakejs.blake2b(prooflessBytes, undefined, 32),
    ).toString('hex')).toBe(first.prooflessTransactionIdHex);
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
      exactFed3bPacketConsumed: true,
      syntheticSettlementPredecessorsConstructed: true,
      predecessorStateProvenanceEstablished: false,
      sourceAttestationsVerifiedOnChain: false,
      trackerAdmissionEstablished: false,
      sidechainFinalityEstablished: false,
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
      .toBe('6f80dfa25f88851a3e91a38a6a8a6a8b3e9a6961f775f9e18e4ff2133d0c13d3');
  });
});
