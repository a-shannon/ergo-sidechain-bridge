import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  decodeCanonicalLongRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  assertValidityApplicationPooledReserveBurnSettlementV5Packet,
  buildValidityApplicationPooledReserveBurnSettlementV5,
  decodeValidityApplicationPooledReserveTrackerValueV5,
  encodeValidityApplicationPooledReserveTrackerValueV5Hex,
  getValidityApplicationPooledReserveTrackerDigestV5Hex,
  VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_DOMAIN,
  type BuildValidityApplicationPooledReserveBurnSettlementV5Input,
  type ValidityApplicationPooledReserveTrackerHistoryEntryV5,
  type ValidityApplicationPooledReserveTrackerValueV5Input,
} from './validity-application-pooled-reserve-burn-settlement-v5.js';
import {
  buildValidityApplicationPooledReserveBurnSettlementV5FixtureInput,
} from './validity-application-pooled-reserve-burn-settlement-v5-fixture.js';
import {
  type ValidityApplicationPooledReserveInstanceV5Candidate,
} from './validity-application-pooled-reserve-instance-v5.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12OutputCandidate,
} from './unsigned-ergo-transaction.js';

const RECIPIENT_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const ALTERNATE_P2PK_TREE =
  '0008cd0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const BURN_AMOUNT = '10000000';
const SIDECHAIN_HEIGHT = '77';
const ANCHOR_HEIGHT = 120;
const CURRENT_HEIGHT = 130;

let baseInput: BuildValidityApplicationPooledReserveBurnSettlementV5Input;
let compiled: Readonly<ValidityApplicationPooledReserveInstanceV5Candidate>;
let trackerHistory:
  readonly ValidityApplicationPooledReserveTrackerHistoryEntryV5[];
let trackerValueInput: ValidityApplicationPooledReserveTrackerValueV5Input;
let claim: BuildValidityApplicationPooledReserveBurnSettlementV5Input['claim'];
let burnLeaves: readonly TrustlessBurnLeafInput[];

beforeAll(async () => {
  baseInput =
    await buildValidityApplicationPooledReserveBurnSettlementV5FixtureInput();
  compiled = baseInput.compiledInstance;
  trackerHistory = baseInput.trackerState.history;
  claim = baseInput.claim;
  const {
    version: _version,
    hashAlgorithmId: _hashAlgorithmId,
    sourceFinalityProfileId: _sourceFinalityProfileId,
    flags: _flags,
    ...valueInput
  } = decodeValidityApplicationPooledReserveTrackerValueV5(
    trackerHistory[0].value,
  );
  trackerValueInput = valueInput;
  burnLeaves = deterministicBurnLeaves(BURN_AMOUNT);
});

describe('validity application pooled-reserve burn settlement V5', () => {
  it('separates the retained V4 source runtime from the V5 target lineage', () => {
    expect(compiled.sourceRuntimeLineageProfileIdHex)
      .toBe('f0cd15e335996211353a2eb895b5bbdeaf7a5de4f10ec0f547a8f6e505a522f9');
    expect(compiled.lineageProfileIdHex)
      .toBe('ffba97e5ce0b2a467b7b18dde382ce2a6c4fff7448804f793641fd9955c74dd2');
    expect(compiled.lineageProfileIdHex)
      .not.toBe(compiled.sourceRuntimeLineageProfileIdHex);
    expect(compiled.relations).toEqual({
      exactV4SourceRuntimeRetained: true,
      v5SettlementLineageIsDistinct: true,
      trackerContractSelfBound: true,
      dependentContractCascadeBound: true,
    });
  });

  it('encodes the exact versioned V5 tracker key and 370-byte value', () => {
    const encoded = encodeValidityApplicationPooledReserveTrackerValueV5Hex(
      trackerValueInput,
    );
    const decoded = decodeValidityApplicationPooledReserveTrackerValueV5(
      encoded,
    );

    expect(Buffer.from(encoded, 'hex')).toHaveLength(370);
    expect(trackerHistory[0].key)
      .toBe('25e791e98439d9ae986a55566e9ade214fb903ed874f6832264c87161ff7a4b7');
    expect(Buffer.from(encoded, 'hex').subarray(
      0,
      Buffer.byteLength(
        VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_DOMAIN,
        'ascii',
      ),
    ).toString('ascii')).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_DOMAIN,
    );
    expect(decoded).toEqual(expect.objectContaining({
      version: 5,
      hashAlgorithmId: 1,
      sourceFinalityProfileId: 1,
      flags: 0,
      pooledReserveProfileIdHex: compiled.lineageProfileIdHex,
    }));

    const discriminatorOffset = (
      Buffer.byteLength(
        VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_DOMAIN,
        'ascii',
      ) + 1
    ) * 2;
    const mutations = [
      [0, '04', /version/i],
      [1, '02', /hash algorithm/i],
      [2, '02', /finality profile/i],
      [3, '01', /flags/i],
    ] as const;
    for (const [index, replacement, error] of mutations) {
      const offset = discriminatorOffset + (index * 2);
      expect(() => decodeValidityApplicationPooledReserveTrackerValueV5(
        `${encoded.slice(0, offset)}${replacement}${encoded.slice(offset + 2)}`,
      )).toThrow(error);
    }
  });

  it('builds one deterministic unsigned V5 settlement transaction', async () => {
    const first =
      await buildValidityApplicationPooledReserveBurnSettlementV5(buildInput());
    const second =
      await buildValidityApplicationPooledReserveBurnSettlementV5(buildInput());

    expect(second).toEqual(first);
    assertValidityApplicationPooledReserveBurnSettlementV5Packet(first);
    expect(first.version).toBe(5);
    expect(first.transaction.eip12Tx.inputs.map(input => input.boxId)).toEqual([
      baseInput.reserveState.predecessor.boxId,
      baseInput.duplicatePreventionState.predecessor.boxId,
      baseInput.feeFundingInput.boxId,
    ]);
    expect(first.transaction.eip12Tx.dataInputs)
      .toEqual([baseInput.trackerState.dataInput]);
    expect(first.transaction.outputs).toHaveLength(4);
    expect(first.transaction.eip12Tx.inputs[0].extension)
      .toEqual(first.contextExtension);
    expect(first.transaction.eip12Tx.inputs[1].extension)
      .toEqual(first.contextExtension);
    expect(first.transaction.eip12Tx.inputs[2].extension).toEqual({});
    expect(Object.keys(first.contextExtension)).toEqual(['0', '1', '2', '3']);
    expect(first.boxes.reserveSuccessor.value).toBe('32000000');
    expect(decodeCanonicalLongRegister(
      first.boxes.reserveSuccessor.additionalRegisters.R6,
    )).toBe(30000000n);
    expect(first.boxes.payout).toMatchObject({
      value: BURN_AMOUNT,
      ergoTree: RECIPIENT_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: CURRENT_HEIGHT,
    });
    expect(first.invariants).toEqual({
      exactV5TrackerEntryProved: true,
      canonicalBurnInclusionProved: true,
      payoutBoundToBurnLeaf: true,
      reserveValueAndLiabilityReducedTogether: true,
      duplicatePreventionInsertedOnce: true,
      externalFeeIsValueNeutral: true,
      deterministicUnsignedTransactionConstructed: true,
    });
    expect(first.boundaries).toEqual(expect.objectContaining({
      burnSettlementTransactionConstructed: true,
      trackerAdmissionEstablished: false,
      sidechainFinalityEstablished: false,
      proofSystemActivated: false,
      targetNodeAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    }));
  });

  it('uses the reviewed miner fee and native-ERG lane defaults', async () => {
    const { feeNanoErg: _omitted, ...withoutFee } = buildInput();
    const { assetIdHex: _asset, ...burnLeaf } = claim.burnLeaf;
    const packet =
      await buildValidityApplicationPooledReserveBurnSettlementV5({
        ...withoutFee,
        claim: { ...claim, burnLeaf },
      });

    expect(packet.transaction.outputs[3].value).toBe(String(MINER_FEE));
    expect(packet.burn.leaf.assetIdHex).toBe('00'.repeat(32));
  });

  it('rejects an unauthenticated burn root and shallow or future anchors', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      trackerState: await trackerStateFor({
        ...trackerValueInput,
        bridgeEventRootHex: `0x${'f1'.repeat(32)}`,
      }),
    })).rejects.toThrow(/burn inclusion|bridgeEventRoot/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      currentErgoHeight: ANCHOR_HEIGHT + 9,
      creationHeight: ANCHOR_HEIGHT + 9,
    })).rejects.toThrow(/confirmations/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      trackerState: await trackerStateFor({
        ...trackerValueInput,
        anchorHeaderHeight: CURRENT_HEIGHT + 1,
      }),
    })).rejects.toThrow(/future/i);
  });

  it('rejects each target application identity independently', async () => {
    const mutations: Array<[
      string,
      Partial<ValidityApplicationPooledReserveTrackerValueV5Input>,
    ]> = [
      ['burn application binding', {
        applicationBindingDigestHex: `0x${'a0'.repeat(32)}`,
      }],
      ['settlement profile', {
        settlementProfileIdHex: `0x${'a1'.repeat(32)}`,
      }],
      ['pooled-reserve profile', {
        pooledReserveProfileIdHex: `0x${'a2'.repeat(32)}`,
      }],
      ['program', { programIdHex: `0x${'a3'.repeat(32)}` }],
      ['verifier profile', {
        verifierProfileIdHex: `0x${'a4'.repeat(32)}`,
      }],
    ];
    for (const [label, mutation] of mutations) {
      await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
        ...buildInput(),
        trackerState: await trackerStateFor({
          ...trackerValueInput,
          ...mutation,
        }),
      }), label).rejects.toThrow(new RegExp(label, 'i'));
    }
  });

  it('rejects burn sidechain, block, recipient, amount, and asset drift', async () => {
    const mutations: Array<[string, TrustlessBurnLeafInput]> = [
      ['sidechain', {
        ...claim.burnLeaf,
        sidechainIdHex: `0x${'f3'.repeat(32)}`,
      }],
      ['execution block', {
        ...claim.burnLeaf,
        sidechainBlockHashHex: `0x${'f4'.repeat(32)}`,
      }],
      ['recipient', {
        ...claim.burnLeaf,
        recipientErgoTreeHashHex: `0x${'f5'.repeat(32)}`,
      }],
      ['amount', { ...claim.burnLeaf, amountNanoErg: '9999999' }],
      ['asset', {
        ...claim.burnLeaf,
        assetIdHex: `0x${'f6'.repeat(32)}`,
      }],
    ];
    for (const [label, burnLeaf] of mutations) {
      await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
        ...buildInput(),
        claim: { ...claim, burnLeaf },
      }), label).rejects.toThrow();
    }
  });

  it('rejects payout substitution and malformed Merkle coordinates', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      claim: { ...claim, recipientErgoTreeHex: ALTERNATE_P2PK_TREE },
    })).rejects.toThrow(/payout binding|recipient/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      claim: { ...claim, leafCount: claim.leafCount + 1 },
    })).rejects.toThrow(/leafCount|burn inclusion/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      claim: {
        ...claim,
        burnProof: claim.burnProof.map((step, index) => index === 0
          ? { ...step, hashHex: 'f7'.repeat(32) }
          : step),
      },
    })).rejects.toThrow(/burn inclusion|bridgeEventRoot/i);
  });

  it('rejects replay and any divergent DUP history digest', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      duplicatePreventionState: {
        predecessor: baseInput.duplicatePreventionState.predecessor,
        historyKeys: [claim.burnLeaf.burnIdHex],
      },
    })).rejects.toThrow(/already present|replay/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      duplicatePreventionState: {
        predecessor: baseInput.duplicatePreventionState.predecessor,
        historyKeys: ['f8'.repeat(32)],
      },
    })).rejects.toThrow(/digest/i);
  });

  it('rejects reserve profile, contract, and liability drift', async () => {
    const reserve = baseInput.reserveState.predecessor;
    const wrongProfile = await rebox(reserve, {
      additionalRegisters: {
        ...reserve.additionalRegisters,
        R4: encodeCollByteRegister(Buffer.from('f9'.repeat(32), 'hex')),
      },
    }, 'wrong V5 reserve profile fixture');
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      reserveState: { predecessor: wrongProfile },
    })).rejects.toThrow(/profile/i);

    const insufficientLiability = await rebox(reserve, {
      additionalRegisters: {
        ...reserve.additionalRegisters,
        R6: encodeLongRegister(BigInt(BURN_AMOUNT) - 1n),
      },
    }, 'insufficient V5 reserve liability fixture');
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      reserveState: { predecessor: insufficientLiability },
    })).rejects.toThrow(/liability/i);

    const wrongTree = await rebox(reserve, {
      ergoTree: ALTERNATE_P2PK_TREE,
    }, 'wrong V5 reserve contract fixture');
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      reserveState: { predecessor: wrongTree },
    })).rejects.toThrow(/ErgoTree|contract/i);
  });

  it('rejects fee, creation-height, minimum-payout, and future-input drift', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      feeNanoErg: BigInt(MINER_FEE) + 1n,
    })).rejects.toThrow(/fee funding|fee/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      creationHeight: CURRENT_HEIGHT - 101,
    })).rejects.toThrow(/creation height/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      creationHeight: CURRENT_HEIGHT + 1,
    })).rejects.toThrow(/creation height/i);

    const subMinimumLeaves = deterministicBurnLeaves('999999');
    const proof = buildTrustlessBurnInclusionProof(
      [...subMinimumLeaves],
      subMinimumLeaves[1].burnIdHex,
    );
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      trackerState: await trackerStateFor({
        ...trackerValueInput,
        bridgeEventRootHex: proof.bridgeEventRootHex,
        burnLeafCount: proof.leafCount,
      }),
      claim: {
        ...claim,
        burnLeaf: subMinimumLeaves[1],
        leafIndex: proof.leafIndex,
        leafCount: proof.leafCount,
        burnProof: proof.proof,
      },
    })).rejects.toThrow(/minimum box|minimum payout/i);

    const futureFeeInput = await rebox(baseInput.feeFundingInput, {
      creationHeight: CURRENT_HEIGHT + 1,
    }, 'future V5 fee input fixture');
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      feeFundingInput: futureFeeInput,
    })).rejects.toThrow(/future|creation height/i);
  });

  it('rejects unknown fields and forged process-owned candidates', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      verified: true,
    } as unknown as BuildValidityApplicationPooledReserveBurnSettlementV5Input))
      .rejects.toThrow(/unknown or missing fields/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV5({
      ...buildInput(),
      compiledInstance: { ...compiled },
    })).rejects.toThrow(/not built from the reviewed compiler family/i);
  });

  it('snapshots mutable inputs and freezes the completed packet', async () => {
    const input = buildInput();
    const building =
      buildValidityApplicationPooledReserveBurnSettlementV5(input);
    const mutable = input as any;
    mutable.claim.recipientErgoTreeHex = ALTERNATE_P2PK_TREE;
    mutable.currentErgoHeight = CURRENT_HEIGHT + 100;
    mutable.trackerState.history[0].value = '00'.repeat(370);

    const packet = await building;
    expect(packet.boxes.payout.ergoTree).toBe(RECIPIENT_TREE);
    expect(packet.boxes.payout.creationHeight).toBe(CURRENT_HEIGHT);
    expect(packet.tracker.valueHex).toBe(trackerHistory[0].value);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.transaction)).toBe(true);
    expect(Object.isFrozen(packet.contextExtension)).toBe(true);
  });

  it('rejects forged packet objects outside the process-owned builder', () => {
    expect(() =>
      assertValidityApplicationPooledReserveBurnSettlementV5Packet({
        schema: 'e2s.validity-application-pooled-reserve-burn-settlement.v5',
        version: 5,
      }),
    ).toThrow(/not built in this process/i);
  });
});

function buildInput(): BuildValidityApplicationPooledReserveBurnSettlementV5Input {
  return {
    compiledInstance: baseInput.compiledInstance,
    trackerState: structuredClone(baseInput.trackerState),
    reserveState: structuredClone(baseInput.reserveState),
    duplicatePreventionState:
      structuredClone(baseInput.duplicatePreventionState),
    feeFundingInput: structuredClone(baseInput.feeFundingInput),
    claim: structuredClone(baseInput.claim),
    currentErgoHeight: baseInput.currentErgoHeight,
    creationHeight: baseInput.creationHeight,
    feeNanoErg: baseInput.feeNanoErg,
  };
}

async function trackerStateFor(
  value: ValidityApplicationPooledReserveTrackerValueV5Input,
): Promise<BuildValidityApplicationPooledReserveBurnSettlementV5Input[
  'trackerState'
]> {
  const history = [{
    key: trackerHistory[0].key,
    value: encodeValidityApplicationPooledReserveTrackerValueV5Hex(value),
  }];
  const predecessor = baseInput.trackerState.dataInput;
  return {
    dataInput: await rebox(predecessor, {
      additionalRegisters: {
        ...predecessor.additionalRegisters,
        R5: encodeAvlTreeRegister(Buffer.from(
          getValidityApplicationPooledReserveTrackerDigestV5Hex(history),
          'hex',
        ), 0x01, 370),
      },
    }, 'pooled-reserve V5 tracker data-input mutation'),
    history,
  };
}

function deterministicBurnLeaves(
  targetAmount: string,
): readonly TrustlessBurnLeafInput[] {
  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const sidechainBlockHashHex = `0x${'ab'.repeat(32)}`;
  return [0, 1, 2].map(index => {
    const sidechainTxHashHex =
      `0x${String(index + 1).padStart(2, '0').repeat(32)}`;
    return {
      sidechainIdHex: profile.sidechainIdHex,
      sidechainBlockHashHex,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex: profile.sidechainIdHex,
        sidechainTxHashHex,
        eventIndex: index,
      }),
      sidechainTxHashHex,
      eventIndex: index,
      recipientErgoTreeHashHex: blake2b256Hex(
        Buffer.from(RECIPIENT_TREE, 'hex'),
      ),
      amountNanoErg: index === 1 ? targetAmount : '1000000',
      assetIdHex: `0x${'00'.repeat(32)}`,
    };
  });
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

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
