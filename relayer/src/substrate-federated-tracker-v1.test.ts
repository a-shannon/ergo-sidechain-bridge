import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerAdmissionV1,
} from './profiles/substrate-federated-v1/tracker-admission.js';
import {
  buildSubstrateFederatedTrackerV1AcceptanceFixture,
} from './substrate-federated-tracker-v1-fixture.js';
import {
  buildSubstrateFederatedTrackerV1Context,
  type SubstrateFederatedTrackerContractV1Identity,
} from './substrate-federated-tracker-v1.js';

const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8'));
const contract = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json',
  import.meta.url,
), 'utf8')) as SubstrateFederatedTrackerContractV1Identity;

function inputs() {
  const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
  const statement = buildSubstrateFederatedCheckpointStatementV1({
    profile,
    ...vector.input.statement,
  });
  return { profile, statement };
}

describe('substrate federated tracker V1 transaction plan', () => {
  it('constructs one deterministic exact successor without transport authority', async () => {
    const first = await buildSubstrateFederatedTrackerV1AcceptanceFixture();
    const second = await buildSubstrateFederatedTrackerV1AcceptanceFixture();

    expect(first).toEqual(second);
    expect(first.schema).toBe('e2s.substrate-federated-v1-tracker-context');
    expect(first.trustModel).toBe('federated_non_trustless');
    expect(first.contract.contractIdHex)
      .toBe('4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c');
    expect(first.contextExtension.keys).toEqual([0, 1, 2]);
    expect(Object.keys(first.contextExtension.eip12Values)).toEqual(['0', '1', '2']);
    expect(first.trackerTransition.trackerValueHex).toHaveLength(370 * 2);
    expect(first.trackerTransition.trackerKeyHex).toHaveLength(64);
    expect(first.trackerTransition.successorRegisters.R4)
      .toBe(first.trackerTransition.inputRegisters.R4);
    expect(first.trackerTransition.successorRegisters.R6)
      .toBe(first.trackerTransition.inputRegisters.R6);
    expect(first.trackerTransition.successorRegisters.R9)
      .toBe(first.trackerTransition.inputRegisters.R9);
    expect(first.prooflessTransactionBytes).toBeGreaterThan(0);
    expect(first.prooflessTransactionBytes).toBeLessThanOrEqual(262_144);
    expect(first.boundaries).toEqual({
      contractIdentityBound: true,
      statementAndProfileValidated: true,
      anchorMembershipConstructed: true,
      exactContextExtensionRoundTrip: true,
      avlTransitionConstructed: true,
      sourceSignaturesVerifiedOnChain: false,
      jvmReductionAccepted: false,
      nodeCheckPerformed: false,
      profileActivated: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    });
  });

  it('derives the exact key/value from the canonical anchor header', async () => {
    const context = await buildSubstrateFederatedTrackerV1AcceptanceFixture();
    const { profile, statement } = inputs();
    const anchor = context.trackerTransition.headers[
      context.trackerTransition.anchorContextIndex
    ];
    const admission = buildSubstrateFederatedTrackerAdmissionV1({
      profile,
      encodedStatementHex: statement.encodedStatementHex,
      currentErgoHeight: context.trackerTransition.currentErgoHeight,
      anchorHeaderIdHex: anchor.id,
      anchorHeaderHeight: anchor.height,
    });

    expect(context.statement.encodedHex).toBe(statement.encodedStatementHex);
    expect(context.trackerTransition.trackerKeyHex).toBe(admission.trackerKeyHex);
    expect(context.trackerTransition.trackerValueHex).toBe(admission.trackerValueHex);
    expect(anchor.extensionRootHex).not.toBe('00'.repeat(32));
  });

  it('rejects contract identity, compiled profile and application drift', async () => {
    const { profile, statement } = inputs();
    const build = (identity: SubstrateFederatedTrackerContractV1Identity) =>
      buildSubstrateFederatedTrackerV1Context({
        contract: identity,
        profile,
        encodedStatementHex: statement.encodedStatementHex,
        currentErgoHeight: 1_030,
        anchorContextIndex: 1,
      });
    await expect(build({ ...contract, contractIdHex: '11'.repeat(32) }))
      .rejects.toThrow(/contract identity is invalid/);
    await expect(build({
      ...contract,
      application: { ...contract.application, bridgeAddressHex: '12'.repeat(20) },
    })).rejects.toThrow(/differs from the compiled profile/);
    await expect(build({
      ...contract,
      ergoAdmissionPublicKeysHex: [...contract.ergoAdmissionPublicKeysHex].reverse(),
    })).rejects.toThrow(/Ergo admission keys differ/);
  });

  it('rejects invalid header selection before emitting transaction bytes', async () => {
    const { profile, statement } = inputs();
    await expect(buildSubstrateFederatedTrackerV1Context({
      contract,
      profile,
      encodedStatementHex: statement.encodedStatementHex,
      currentErgoHeight: 1_030,
      anchorContextIndex: 10,
    })).rejects.toThrow(/anchor context index/);
  });
});
