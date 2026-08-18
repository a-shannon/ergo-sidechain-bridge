import { beforeAll, describe, expect, it } from 'vitest';

import { getPooledReserveEmptyDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
} from './peg-in-causal-admission-v2.js';
import {
  assertSubstrateFederatedPooledReserveDepositV1Packet,
  buildSubstrateFederatedPooledReserveDepositV1,
  type BuildSubstrateFederatedPooledReserveDepositV1Input,
} from './substrate-federated-pooled-reserve-deposit-v1.js';
import {
  getSubstrateFederatedSettlementFamilyV1FixtureIdentity,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS,
} from './substrate-federated-settlement-family-v1.js';
import {
  type Eip12Box,
  type Eip12OutputCandidate,
} from './unsigned-ergo-transaction.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';

const P2PK_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const OTHER_P2PK_TREE =
  '0008cd0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const SOURCE_AMOUNT = 10_000_000n;
const SOURCE_HEIGHT = 110;
const TRANSITION_HEIGHT = 111;

let baseInput: BuildSubstrateFederatedPooledReserveDepositV1Input;

beforeAll(async () => {
  baseInput = await buildFixtureInput();
});

describe('substrate federated pooled-reserve deposit V1', () => {
  it('builds deterministic source-lock and reserve-transition transactions', async () => {
    const first = await buildSubstrateFederatedPooledReserveDepositV1(
      buildInput(),
    );
    const second = await buildSubstrateFederatedPooledReserveDepositV1(
      buildInput(),
    );

    expect(second).toEqual(first);
    assertSubstrateFederatedPooledReserveDepositV1Packet(first);
    expect(first.trustModel).toBe('federated_non_trustless');
    expect(first.transactions.sourceLockCreation.outputs).toHaveLength(4);
    expect(first.transactions.reserveTransition.eip12Tx.inputs.map(
      input => input.boxId,
    )).toEqual([
      baseInput.reserveState.predecessor.boxId,
      first.boxes.sourceLock.boxId,
      first.boxes.transitionFeeFunding.boxId,
    ]);
    expect(first.transactions.reserveTransition.outputs[1]).toMatchObject({
      value: String(MINER_FEE),
      ergoTree: MINER_FEE_TREE,
      assets: [],
      additionalRegisters: {},
    });
    expect(first.reserve).toMatchObject({
      inputValueNanoErg: '2000000',
      outputValueNanoErg: '12000000',
      inputLiabilityNanoErg: '0',
      outputLiabilityNanoErg: '10000000',
      protectedSeedNanoErg: '2000000',
      predecessorDepositCount: 0,
      successorDepositCount: 1,
    });
    expect(first.invariants).toEqual({
      exactFederatedFamilyBound: true,
      exactSourceIntentBound: true,
      sourceLockCreatedBeforeRefundTimeout: true,
      transitionConsumesExactSourceAndReserve: true,
      depositCommitmentBindsSourceIdAndIntent: true,
      reserveInsertProofReplayed: true,
      reserveValueAndLiabilityIncreaseTogether: true,
      protectedReserveSeedPreserved: true,
      externalFeeIsValueNeutral: true,
      deterministicUnsignedTransactionsConstructed: true,
    });
    expect(first.boundaries).toMatchObject({
      predecessorStateProvenanceEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      ergoDepositFinalityEstablished: false,
      sidechainMintAcceptanceEstablished: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
  });

  it('rejects source-intent family and asset substitution', async () => {
    const substitutions: readonly (readonly [
      string,
      Partial<typeof baseInput.sourceIntent>,
      RegExp,
    ])[] = [
      ['source network', { sourceNetworkIdHex: `0x${'a1'.repeat(32)}` },
        /source network/i],
      ['sidechain', { sidechainIdHex: `0x${'a2'.repeat(32)}` }, /sidechain/i],
      ['bridge', { bridgeAddressHex: `0x${'a3'.repeat(20)}` },
        /bridge address/i],
      ['token', { tokenAddressHex: `0x${'a4'.repeat(20)}` }, /token address/i],
      ['settlement profile', {
        settlementProfileIdHex: `0x${'a5'.repeat(32)}`,
      }, /settlement profile/i],
      ['federated family', {
        admissionProfileIdHex: `0x${'a6'.repeat(32)}`,
      }, /federated family/i],
      ['source asset', { sourceAssetIdHex: `0x${'a7'.repeat(32)}` },
        /source asset/i],
    ];
    for (const [label, substitution, error] of substitutions) {
      await expect(buildSubstrateFederatedPooledReserveDepositV1({
        ...buildInput(),
        sourceIntent: {
          ...baseInput.sourceIntent,
          ...substitution,
        },
      }), label).rejects.toThrow(error);
    }
    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      sourceIntent: {
        ...baseInput.sourceIntent,
        recipientAddressHex: `0x${'00'.repeat(20)}`,
      },
    })).rejects.toThrow(/must not be zero|zero address/i);
  });

  it('extends an exact non-empty reserve history without changing its seed', async () => {
    const first = await buildSubstrateFederatedPooledReserveDepositV1(
      buildInput(),
    );
    const [nextFunding] = await materializeCandidates([{
      value: '20000000',
      ergoTree: P2PK_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: TRANSITION_HEIGHT,
    }], 'b4'.repeat(32));
    const second = await buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      sourceFundingInput: nextFunding,
      reserveState: {
        predecessor: first.boxes.reserveSuccessor,
        depositHistory: [{
          sourceLockBoxIdHex: first.boxes.sourceLock.boxId,
          depositCommitmentHex: first.depositCommitmentHex,
        }],
      },
      sourceIntent: {
        ...baseInput.sourceIntent,
        recipientAddressHex: `0x${'b5'.repeat(20)}`,
      },
      creationHeights: {
        currentErgoHeight: TRANSITION_HEIGHT + 1,
        sourceLockCreation: TRANSITION_HEIGHT + 1,
        reserveTransition: TRANSITION_HEIGHT + 1,
      },
    });

    expect(second.reserve).toMatchObject({
      inputDigestHex: first.reserve.outputDigestHex,
      inputValueNanoErg: '12000000',
      outputValueNanoErg: '22000000',
      inputLiabilityNanoErg: '10000000',
      outputLiabilityNanoErg: '20000000',
      protectedSeedNanoErg: '2000000',
      predecessorDepositCount: 1,
      successorDepositCount: 2,
    });
    expect(second.reserve.outputDigestHex).not.toBe(first.reserve.outputDigestHex);
  });

  it('accepts a new deposit after all prior liability was redeemed', async () => {
    const first = await buildSubstrateFederatedPooledReserveDepositV1(
      buildInput(),
    );
    const redeemedReserve = await rebox(first.boxes.reserveSuccessor, {
      value: '2000000',
      additionalRegisters: {
        ...first.boxes.reserveSuccessor.additionalRegisters,
        R6: encodeLongRegister(0n),
      },
    }, 'substrate federated fully redeemed reserve');
    const [nextFunding] = await materializeCandidates([{
      value: '20000000',
      ergoTree: P2PK_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: TRANSITION_HEIGHT,
    }], 'b6'.repeat(32));
    const next = await buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      sourceFundingInput: nextFunding,
      reserveState: {
        predecessor: redeemedReserve,
        depositHistory: [{
          sourceLockBoxIdHex: first.boxes.sourceLock.boxId,
          depositCommitmentHex: first.depositCommitmentHex,
        }],
      },
      creationHeights: {
        currentErgoHeight: TRANSITION_HEIGHT + 1,
        sourceLockCreation: TRANSITION_HEIGHT + 1,
        reserveTransition: TRANSITION_HEIGHT + 1,
      },
    });

    expect(next.reserve).toMatchObject({
      inputLiabilityNanoErg: '0',
      outputLiabilityNanoErg: '10000000',
      protectedSeedNanoErg: '2000000',
      predecessorDepositCount: 1,
      successorDepositCount: 2,
    });
  });

  it('rejects reserve contract, NFT, profile, AVL, and liability drift', async () => {
    const reserve = baseInput.reserveState.predecessor;
    const mutations: readonly (readonly [string, Partial<Eip12Box>, RegExp])[] = [
      ['contract', { ergoTree: OTHER_P2PK_TREE }, /identity|policy/i],
      ['NFT', { assets: [{ tokenId: 'a3'.repeat(32), amount: '1' }] },
        /identity|policy/i],
      ['NFT amount', { assets: [{
        tokenId: reserve.assets[0]!.tokenId,
        amount: '2',
      }] }, /identity|policy/i],
      ['extra asset', { assets: [...reserve.assets, {
        tokenId: 'a8'.repeat(32),
        amount: '1',
      }] }, /identity|policy/i],
      ['profile', { additionalRegisters: {
        ...reserve.additionalRegisters,
        R4: encodeCollByteRegister(Buffer.from('a4'.repeat(32), 'hex')),
      } }, /identity|policy/i],
      ['AVL', { additionalRegisters: {
        ...reserve.additionalRegisters,
        R5: encodeAvlTreeRegister(
          Buffer.from('a5'.repeat(33), 'hex'),
          VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
          VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
        ),
      } }, /history|identity|policy/i],
      ['AVL flags', { additionalRegisters: {
        ...reserve.additionalRegisters,
        R5: encodeAvlTreeRegister(
          Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
          0x03,
          VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
        ),
      } }, /identity|policy/i],
      ['AVL value length', { additionalRegisters: {
        ...reserve.additionalRegisters,
        R5: encodeAvlTreeRegister(
          Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
          VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
          VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH - 1,
        ),
      } }, /identity|policy/i],
      ['liability', { additionalRegisters: {
        ...reserve.additionalRegisters,
        R6: encodeLongRegister(1n),
      } }, /empty.*history.*zero liability/i],
    ];
    for (const [label, mutation, error] of mutations) {
      await expect(buildSubstrateFederatedPooledReserveDepositV1({
        ...buildInput(),
        reserveState: {
          predecessor: await rebox(
            reserve,
            mutation,
            `substrate federated ${label} drift`,
          ),
          depositHistory: [],
        },
      }), label).rejects.toThrow(error);
    }

    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      reserveState: {
        predecessor: reserve,
        depositHistory: [{
          sourceLockBoxIdHex: 'a9'.repeat(32),
          depositCommitmentHex: 'aa'.repeat(32),
        }, {
          sourceLockBoxIdHex: 'a9'.repeat(32),
          depositCommitmentHex: 'ab'.repeat(32),
        }],
      },
    })).rejects.toThrow(/duplicate keys/i);
  });

  it('rejects impure or underfunded source funding', async () => {
    const source = baseInput.sourceFundingInput;
    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      sourceFundingInput: await rebox(source, {
        additionalRegisters: {
          R4: encodeCollByteRegister(Buffer.from('a6'.repeat(32), 'hex')),
        },
      }, 'substrate federated registered source funding'),
    })).rejects.toThrow(/pure ERG/i);
    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      sourceFundingInput: await rebox(source, {
        value: String(SOURCE_AMOUNT + BigInt(MINER_FEE) * 2n + 1n),
      }, 'substrate federated dust change'),
    })).rejects.toThrow(/change.*minimum box/i);
  });

  it('rejects fee and height policies at each boundary', async () => {
    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      fees: { reserveTransitionNanoErg: 999_999 },
    })).rejects.toThrow(/fee policy/i);
    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      fees: { reserveTransitionNanoErg: 2_100_001 },
    })).rejects.toThrow(/fee policy/i);
    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      creationHeights: {
        ...baseInput.creationHeights,
        sourceLockCreation: 99,
      },
    })).rejects.toThrow(/outside the observed history/i);
    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      creationHeights: {
        currentErgoHeight: SOURCE_HEIGHT + 10_000,
        sourceLockCreation: SOURCE_HEIGHT,
        reserveTransition: SOURCE_HEIGHT + 10_000,
      },
    })).rejects.toThrow(/refund timeout/i);
    await expect(buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      creationHeights: {
        currentErgoHeight: TRANSITION_HEIGHT + 101,
        sourceLockCreation: SOURCE_HEIGHT,
        reserveTransition: TRANSITION_HEIGHT,
      },
    })).rejects.toThrow(/creation-height lag/i);

    const lastValidHeight = SOURCE_HEIGHT
      + SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS
      - 1;
    const lastValid = await buildSubstrateFederatedPooledReserveDepositV1({
      ...buildInput(),
      creationHeights: {
        currentErgoHeight: lastValidHeight,
        sourceLockCreation: SOURCE_HEIGHT,
        reserveTransition: lastValidHeight,
      },
    });
    expect(lastValid.invariants.sourceLockCreatedBeforeRefundTimeout).toBe(true);
  });

  it('rejects cloned packets without same-process provenance', async () => {
    const packet = await buildSubstrateFederatedPooledReserveDepositV1(
      buildInput(),
    );
    expect(() => assertSubstrateFederatedPooledReserveDepositV1Packet(
      structuredClone(packet),
    )).toThrow(/same-process provenance/i);
  });
});

function buildInput(): BuildSubstrateFederatedPooledReserveDepositV1Input {
  return {
    ...structuredClone({
      sourceFundingInput: baseInput.sourceFundingInput,
      reserveState: baseInput.reserveState,
      sourceIntent: baseInput.sourceIntent,
      depositorErgoTreeHex: baseInput.depositorErgoTreeHex,
      creationHeights: baseInput.creationHeights,
      fees: baseInput.fees,
    }),
    familyIdentity: baseInput.familyIdentity,
  };
}

async function buildFixtureInput():
Promise<BuildSubstrateFederatedPooledReserveDepositV1Input> {
  const family = getSubstrateFederatedSettlementFamilyV1FixtureIdentity();
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    family.profile,
  );
  const [sourceFundingInput, reservePredecessor] = await materializeBoxes();
  return {
    familyIdentity: family,
    sourceFundingInput,
    reserveState: {
      predecessor: reservePredecessor,
      depositHistory: [],
    },
    sourceIntent: {
      formatVersion: PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
      sourceNetworkIdHex: `0x${profile.sourceNetworkIdHex}`,
      sidechainIdHex: `0x${profile.sidechainIdHex}`,
      bridgeAddressHex: `0x${profile.bridgeAddressHex}`,
      tokenAddressHex: `0x${profile.tokenAddressHex}`,
      settlementProfileIdHex: `0x${profile.settlementProfileIdHex}`,
      admissionProfileIdHex: `0x${family.profile.familyIdHex}`,
      sourceAssetIdHex: `0x${profile.settlementAssetIdHex}`,
      amountNanoErg: SOURCE_AMOUNT,
      recipientAddressHex: `0x${'b1'.repeat(20)}`,
    },
    depositorErgoTreeHex: P2PK_TREE,
    creationHeights: {
      currentErgoHeight: TRANSITION_HEIGHT,
      sourceLockCreation: SOURCE_HEIGHT,
      reserveTransition: TRANSITION_HEIGHT,
    },
  };
}

async function materializeBoxes(): Promise<readonly [Eip12Box, Eip12Box]> {
  const family = getSubstrateFederatedSettlementFamilyV1FixtureIdentity();
  const outputs = await materializeCandidates([{
      value: '20000000',
      ergoTree: P2PK_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 100,
    }, {
      value: '2000000',
      ergoTree: family.contracts.pooledReserve.receipt.propositionHex,
      assets: [{
        tokenId: family.profile.pooledReserveNftIdHex,
        amount: '1',
      }],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(
          family.profile.familyIdHex,
          'hex',
        )),
        R5: encodeAvlTreeRegister(
          Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
          VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
          VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
        ),
        R6: encodeLongRegister(0n),
      },
      creationHeight: 100,
    }], 'b2'.repeat(32));
  return [outputs[0], outputs[1]];
}

async function rebox(
  source: Eip12Box,
  mutation: Partial<Eip12Box>,
  label: string,
): Promise<Eip12Box> {
  const outputs = await materializeCandidates([{
      value: mutation.value ?? source.value,
      ergoTree: mutation.ergoTree ?? source.ergoTree,
      assets: mutation.assets ?? source.assets,
      additionalRegisters:
        mutation.additionalRegisters ?? source.additionalRegisters,
      creationHeight: mutation.creationHeight ?? source.creationHeight,
    }], 'b3'.repeat(32), label);
  return outputs[0];
}

async function materializeCandidates(
  outputs: readonly Eip12OutputCandidate[],
  inputBoxId: string,
  label = 'substrate federated deposit fixture',
): Promise<Eip12Box[]> {
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  let unsigned: any;
  let transactionId: any;
  let candidates: any;
  const boxes: Eip12Box[] = [];
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
      inputs: [{ boxId: inputBoxId, extension: {} }],
      dataInputs: [],
      outputs: outputs.map(output => ({
        ...output,
        value: String(output.value),
      })),
    }));
    transactionId = unsigned.id();
    candidates = unsigned.output_candidates();
    if (candidates.len() !== outputs.length) {
      throw new Error(`${label} output count drifted`);
    }
    for (let index = 0; index < candidates.len(); index += 1) {
      const candidate = candidates.get(index);
      const box = wasm.ErgoBox.from_box_candidate(
        candidate,
        transactionId,
        index,
      );
      try {
        boxes.push(box.to_js_eip12() as Eip12Box);
      } finally {
        box.free?.();
        candidate.free?.();
      }
    }
    return boxes;
  } finally {
    candidates?.free?.();
    transactionId?.free?.();
    unsigned?.free?.();
  }
}
