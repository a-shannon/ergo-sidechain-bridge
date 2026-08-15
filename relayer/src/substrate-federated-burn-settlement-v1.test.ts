import { beforeAll, describe, expect, it } from 'vitest';

import {
  decodeCanonicalLongRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodeSubstrateFederatedTrackerValueV1,
} from './profiles/substrate-federated-v1/tracker-admission.js';
import {
  assertSubstrateFederatedBurnSettlementV1Packet,
  buildSubstrateFederatedBurnSettlementV1,
  getSubstrateFederatedTrackerDigestV1Hex,
  type BuildSubstrateFederatedBurnSettlementV1Input,
} from './substrate-federated-burn-settlement-v1.js';
import {
  buildSubstrateFederatedBurnSettlementV1FixtureInput,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import {
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS,
} from './substrate-federated-settlement-family-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12OutputCandidate,
} from './unsigned-ergo-transaction.js';

const ALTERNATE_P2PK_TREE =
  '0008cd0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const BURN_AMOUNT = '10000000';

let baseInput: BuildSubstrateFederatedBurnSettlementV1Input;

beforeAll(async () => {
  baseInput = await buildSubstrateFederatedBurnSettlementV1FixtureInput();
});

describe('substrate federated burn settlement V1', () => {
  it('builds one deterministic unsigned reserve/DUP/external-fee transaction', async () => {
    const first = await buildSubstrateFederatedBurnSettlementV1(buildInput());
    const second = await buildSubstrateFederatedBurnSettlementV1(buildInput());

    expect(second).toEqual(first);
    assertSubstrateFederatedBurnSettlementV1Packet(first);
    expect(first.trustModel).toBe('federated_non_trustless');
    expect(first.familyIdHex).toBe(
      baseInput.familyIdentity.profile.familyIdHex,
    );
    expect(first.transaction.eip12Tx.inputs.map(input => input.boxId)).toEqual([
      baseInput.reserveState.predecessor.boxId,
      baseInput.duplicatePreventionState.predecessor.boxId,
      baseInput.feeFundingInput.boxId,
    ]);
    expect(first.transaction.eip12Tx.dataInputs.map(input => input.boxId))
      .toEqual([baseInput.trackerState.dataInput.boxId]);
    expect(first.transaction.outputs).toHaveLength(4);
    expect(first.transaction.eip12Tx.inputs.map(input => input.extension))
      .toEqual([
        {},
        first.contextExtensions.duplicatePrevention,
        {},
      ]);
    expect(Object.keys(first.contextExtensions.duplicatePrevention))
      .toEqual(['0', '1', '2', '3']);
    expect(first.boxes.reserveSuccessor.value).toBe('32000000');
    expect(decodeCanonicalLongRegister(
      first.boxes.reserveSuccessor.additionalRegisters.R6,
    )).toBe(30_000_000n);
    expect(first.boxes.duplicatePreventionSuccessor.ergoTree).toBe(
      baseInput.familyIdentity.contracts.duplicatePrevention.receipt
        .propositionHex,
    );
    expect(first.boxes.payout).toMatchObject({
      value: BURN_AMOUNT,
      ergoTree: baseInput.claim.recipientErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight: baseInput.creationHeight,
    });
    expect(first.transaction.outputs[3]).toMatchObject({
      value: String(MINER_FEE),
      ergoTree: MINER_FEE_TREE,
      assets: [],
      additionalRegisters: {},
    });
    expect(first.invariants).toEqual({
      exactFederatedTrackerEntryProved: true,
      federatedAuthorityProfileBound: true,
      canonicalBurnInclusionProved: true,
      payoutBoundToBurnLeaf: true,
      duplicatePreventionIsSoleProofConsumer: true,
      reserveBurnContextExtensionIsEmpty: true,
      reserveValueAndLiabilityReducedTogether: true,
      duplicatePreventionInsertedOnce: true,
      externalFeeIsValueNeutral: true,
      deterministicUnsignedTransactionConstructed: true,
    });
    expect(first.boundaries).toEqual({
      burnSettlementTransactionConstructed: true,
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
  });

  it('binds the exact FED-2 tracker and every disclosed authority field', async () => {
    const value = decodeSubstrateFederatedTrackerValueV1(
      baseInput.trackerState.history[0].value,
    );
    const mutations: readonly (readonly [string, (bytes: Buffer) => void])[] = [
      ['source block', bytes => bytes.fill(0xa1, 148, 180)],
      ['execution block', bytes => bytes.fill(0xa2, 180, 212)],
      ['runtime profile', bytes => bytes.fill(0xa3, 216, 248)],
      ['settlement profile', bytes => bytes.fill(0xa4, 248, 280)],
      ['federation profile', bytes => bytes.fill(0xa5, 280, 312)],
      ['Ergo key set', bytes => bytes.fill(0xa6, 312, 344)],
      ['Ergo threshold', bytes => bytes.writeUInt16BE(
        value.ergoAdmissionThreshold + 1,
        344,
      )],
      ['federation epoch', bytes => bytes.writeBigUInt64BE(
        BigInt(value.federationEpoch) + 1n,
        346,
      )],
    ];
    for (const [label, mutate] of mutations) {
      await expect(buildSubstrateFederatedBurnSettlementV1({
        ...buildInput(),
        trackerState: await trackerStateFor(mutate),
      }), label).rejects.toThrow(/binding mismatch/i);
    }
  });

  it('rejects tracker singleton and history identity drift', async () => {
    const tracker = baseInput.trackerState.dataInput;
    const wrongTree = await rebox(tracker, {
      ergoTree: ALTERNATE_P2PK_TREE,
    }, 'substrate federated wrong tracker contract');
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      trackerState: {
        ...structuredClone(baseInput.trackerState),
        dataInput: wrongTree,
      },
    })).rejects.toThrow(/exact singleton/i);

    const wrongAuthority = await rebox(tracker, {
      additionalRegisters: {
        ...tracker.additionalRegisters,
        R9: encodeCollByteRegister(Buffer.from('a7'.repeat(32), 'hex')),
      },
    }, 'substrate federated wrong tracker authority');
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      trackerState: {
        ...structuredClone(baseInput.trackerState),
        dataInput: wrongAuthority,
      },
    })).rejects.toThrow(/exact singleton/i);

    const substitutedHistory = {
      dataInput: structuredClone(baseInput.trackerState.dataInput),
      history: baseInput.trackerState.history.map((entry, index) => ({
        ...entry,
        key: index === 0 ? 'a8'.repeat(32) : entry.key,
      })),
    };
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      trackerState: substitutedHistory,
    })).rejects.toThrow(/lacks the derived key/i);
  });

  it('rejects an unauthenticated root, shallow anchor, and invalid horizon', async () => {
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      trackerState: await trackerStateFor(
        bytes => bytes.fill(0xb1, 40, 72),
      ),
    })).rejects.toThrow(/burn inclusion|bridgeEventRoot/i);

    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      trackerState: await trackerStateFor(bytes => bytes.writeUInt32BE(
        baseInput.currentErgoHeight - 9,
        136,
      )),
    })).rejects.toThrow(/anchor.*depth/i);

    const anchorHeight = decodeSubstrateFederatedTrackerValueV1(
      baseInput.trackerState.history[0].value,
    ).anchorHeaderHeight;
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      trackerState: await trackerStateFor(bytes => bytes.writeBigUInt64BE(
        BigInt(anchorHeight + 1),
        354,
      )),
    })).rejects.toThrow(/outside its horizon/i);
  });

  it('rejects payout, block, amount, and asset substitution', async () => {
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      claim: {
        ...structuredClone(baseInput.claim),
        recipientErgoTreeHex: ALTERNATE_P2PK_TREE,
      },
    })).rejects.toThrow(/payout binding|recipient/i);
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      claim: {
        ...structuredClone(baseInput.claim),
        burnLeaf: {
          ...baseInput.claim.burnLeaf,
          sidechainBlockHashHex: `0x${'b2'.repeat(32)}`,
        },
      },
    })).rejects.toThrow(/execution block hash/i);
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      claim: {
        ...structuredClone(baseInput.claim),
        burnLeaf: {
          ...baseInput.claim.burnLeaf,
          amountNanoErg: '9999999',
        },
      },
    })).rejects.toThrow(/burn inclusion|payout binding/i);
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      claim: {
        ...structuredClone(baseInput.claim),
        burnLeaf: {
          ...baseInput.claim.burnLeaf,
          assetIdHex: `0x${'b3'.repeat(32)}`,
        },
      },
    })).rejects.toThrow(/asset ID/i);
  });

  it('rejects reserve identity, ordering, and liability drift', async () => {
    const reserve = baseInput.reserveState.predecessor;
    const wrongProfile = await rebox(reserve, {
      additionalRegisters: {
        ...reserve.additionalRegisters,
        R4: encodeCollByteRegister(Buffer.from('b4'.repeat(32), 'hex')),
      },
    }, 'substrate federated wrong reserve profile');
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      reserveState: { predecessor: wrongProfile },
    })).rejects.toThrow(/reserve predecessor identity/i);

    const insufficient = await rebox(reserve, {
      additionalRegisters: {
        ...reserve.additionalRegisters,
        R6: encodeLongRegister(BigInt(BURN_AMOUNT) - 1n),
      },
    }, 'substrate federated insufficient reserve');
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      reserveState: { predecessor: insufficient },
    })).rejects.toThrow(/insufficient/i);

    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      reserveState: {
        predecessor: baseInput.duplicatePreventionState.predecessor,
      },
      duplicatePreventionState: {
        predecessor: reserve,
        historyKeys: [],
      },
    })).rejects.toThrow(/reserve predecessor identity/i);
  });

  it('rejects replay, divergent DUP history, and DUP identity drift', async () => {
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      duplicatePreventionState: {
        predecessor: baseInput.duplicatePreventionState.predecessor,
        historyKeys: [baseInput.claim.burnLeaf.burnIdHex],
      },
    })).rejects.toThrow(/already.*replay/i);
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      duplicatePreventionState: {
        predecessor: baseInput.duplicatePreventionState.predecessor,
        historyKeys: ['b5'.repeat(32)],
      },
    })).rejects.toThrow(/history mismatch/i);

    const dup = baseInput.duplicatePreventionState.predecessor;
    const wrongTree = await rebox(dup, {
      ergoTree: ALTERNATE_P2PK_TREE,
    }, 'substrate federated wrong DUP contract');
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      duplicatePreventionState: {
        predecessor: wrongTree,
        historyKeys: [],
      },
    })).rejects.toThrow(/duplicate-prevention identity/i);
  });

  it('rejects fee, successor-height, and future-input drift', async () => {
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      feeNanoErg: BigInt(MINER_FEE) + 1n,
    })).rejects.toThrow(/fee funding/i);
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      creationHeight: baseInput.currentErgoHeight - 101,
    })).rejects.toThrow(/creation height/i);
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      creationHeight: baseInput.currentErgoHeight + 1,
    })).rejects.toThrow(/creation height/i);

    const futureFee = await rebox(baseInput.feeFundingInput, {
      creationHeight: baseInput.currentErgoHeight + 1,
    }, 'substrate federated future fee input');
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      feeFundingInput: futureFee,
    })).rejects.toThrow(/future/i);

    const registeredFee = await rebox(baseInput.feeFundingInput, {
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from('b6'.repeat(32), 'hex')),
      },
    }, 'substrate federated registered fee input');
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      feeFundingInput: registeredFee,
    })).rejects.toThrow(/exact pure ERG/i);

    const tokenSource = baseInput.reserveState.predecessor;
    const tokenFeeTransaction = await materializeUnsignedTransaction({
      inputs: [{ ...tokenSource, extension: {} }],
      dataInputs: [],
      outputs: [
        {
          value: String(MINER_FEE),
          ergoTree: baseInput.feeFundingInput.ergoTree,
          assets: tokenSource.assets,
          additionalRegisters: {},
          creationHeight: baseInput.feeFundingInput.creationHeight,
        },
        {
          value: String(BigInt(tokenSource.value) - BigInt(MINER_FEE)),
          ergoTree: tokenSource.ergoTree,
          assets: [],
          additionalRegisters: {},
          creationHeight: tokenSource.creationHeight,
        },
      ],
    }, 'substrate federated token fee input');
    const tokenFee = tokenFeeTransaction.outputs[0];
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      feeFundingInput: tokenFee,
    })).rejects.toThrow(/exact pure ERG/i);
  });

  it('rejects a forged family, unknown fields, and forged packets', async () => {
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      familyIdentity: { ...baseInput.familyIdentity },
    })).rejects.toThrow(/same-process compiler provenance/i);
    await expect(buildSubstrateFederatedBurnSettlementV1({
      ...buildInput(),
      verified: true,
    } as unknown as BuildSubstrateFederatedBurnSettlementV1Input))
      .rejects.toThrow(/unknown or missing fields/i);
    expect(() => assertSubstrateFederatedBurnSettlementV1Packet({
      schema: 'e2s.substrate-federated-burn-settlement.v1',
      version: 1,
    })).toThrow(/not built in this process/i);
  });

  it('snapshots mutable inputs and freezes the completed packet', async () => {
    const input = buildInput();
    const building = buildSubstrateFederatedBurnSettlementV1(input);
    const mutable = input as any;
    mutable.claim.recipientErgoTreeHex = ALTERNATE_P2PK_TREE;
    mutable.trackerState.history[0].value = '00'.repeat(370);
    mutable.currentErgoHeight += 100;

    const packet = await building;
    expect(packet.boxes.payout.ergoTree)
      .toBe(baseInput.claim.recipientErgoTreeHex);
    expect(packet.tracker.valueHex).toBe(baseInput.trackerState.history[0].value);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.transaction)).toBe(true);
    expect(Object.isFrozen(packet.contextExtensions)).toBe(true);
    expect(Object.isFrozen(packet.contextExtensions.duplicatePrevention))
      .toBe(true);
  });

  it('uses all three frozen FED-3A contract identities', () => {
    expect(baseInput.familyIdentity.contracts.duplicatePrevention.receipt
      .contractIdHex).toBe(
      SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS
        .duplicatePrevention,
    );
    expect(baseInput.familyIdentity.contracts.sourceLock.receipt.contractIdHex)
      .toBe(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS.sourceLock);
    expect(baseInput.familyIdentity.contracts.pooledReserve.receipt.contractIdHex)
      .toBe(
        SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS.pooledReserve,
      );
  });
});

function buildInput(): BuildSubstrateFederatedBurnSettlementV1Input {
  const { familyIdentity, ...mutableInput } = baseInput;
  return {
    ...structuredClone(mutableInput),
    familyIdentity,
  };
}

async function trackerStateFor(
  mutate: (bytes: Buffer) => void,
): Promise<BuildSubstrateFederatedBurnSettlementV1Input['trackerState']> {
  const value = Buffer.from(baseInput.trackerState.history[0].value, 'hex');
  mutate(value);
  const history = [{
    key: baseInput.trackerState.history[0].key,
    value: value.toString('hex'),
  }];
  const predecessor = baseInput.trackerState.dataInput;
  return {
    history,
    dataInput: await rebox(predecessor, {
      additionalRegisters: {
        ...predecessor.additionalRegisters,
        R5: encodeAvlTreeRegister(
          Buffer.from(getSubstrateFederatedTrackerDigestV1Hex(history), 'hex'),
          0x01,
          370,
        ),
      },
    }, 'substrate federated tracker mutation'),
  };
}

async function rebox(
  box: Eip12Box,
  changes: Partial<Eip12OutputCandidate>,
  label: string,
): Promise<Eip12Box> {
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...box, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: box.value,
      ergoTree: box.ergoTree,
      assets: box.assets,
      additionalRegisters: box.additionalRegisters,
      creationHeight: box.creationHeight,
      ...changes,
    }],
  }, label);
  return transaction.outputs[0];
}
