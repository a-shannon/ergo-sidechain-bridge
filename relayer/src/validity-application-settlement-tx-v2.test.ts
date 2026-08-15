import { readFileSync } from 'fs';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  deriveBridgeCheckpointCommitmentHex,
} from './bridge-checkpoint-commitment.js';
import {
  decodeBridgeCausalApplicationBindingV2,
  decodeBridgeValidityApplicationPayloadV3,
  deriveBridgeCausalApplicationBindingV2DigestHex,
  encodeBridgeValidityApplicationPayloadV3,
} from './bridge-validity-application-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  deriveApplicationValidityPayloadDigestHex,
  deriveApplicationValiditySpvTrackerKey,
  encodeApplicationValiditySpvTrackerAvlRegister,
  encodeApplicationValiditySpvTrackerValue,
  getApplicationValiditySpvTrackerDigest,
} from './spv-tracker-validity-v2.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX as PLANNER_TRUST_ROOT_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
  buildValidityApplicationSettlementPlanV2,
  type BuildValidityApplicationSettlementPlanV2Input,
  type ValidityApplicationSettlementProfileV2,
} from './validity-application-settlement-v2.js';
import {
  VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
  buildValidityApplicationSettlementTxV2,
  type BuildValidityApplicationSettlementTxV2Input,
  type ValidityApplicationSettlementBoxV2,
} from './validity-application-settlement-tx-v2.js';

const finalityVector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/bridge-validity-finality-statement-v2.json',
    import.meta.url,
  ),
  'utf8',
));

const EXECUTION_BLOCK_HASH_HEX = '93'.repeat(32);
const CONSENSUS_BLOCK_HASH_HEX = '94'.repeat(32);
const ANCHOR_HEADER_ID_HEX = '95'.repeat(32);
const RECIPIENT_ERGO_TREE_HEX = `0008cd02${'96'.repeat(32)}`;
const SOURCE_BOX_ID_HEX = '97'.repeat(32);
const SIDECHAIN_HEIGHT = 42;
const CURRENT_HEIGHT = 110;
const SOURCE_AMOUNT = 10_000_000n;

interface Fixture {
  readonly planInput: BuildValidityApplicationSettlementPlanV2Input;
  readonly input: BuildValidityApplicationSettlementTxV2Input;
}

function fixture(): Fixture {
  expect(PLANNER_TRUST_ROOT_HEX)
    .toBe(VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX);
  const profile = applicationProfile();
  const recipientHash = blake2b256Hex(
    Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex'),
  );
  const burns = [7, 11, 99].map((eventIndex, index) => {
    const sidechainTxHashHex = (0x30 + index).toString(16).repeat(32);
    return {
      sidechainIdHex: profile.sidechainIdHex,
      sidechainBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex: profile.sidechainIdHex,
        sidechainTxHashHex,
        eventIndex,
      }),
      sidechainTxHashHex,
      eventIndex,
      recipientErgoTreeHashHex: recipientHash,
      amountNanoErg: 2_000_000n + BigInt(index),
      assetIdHex: profile.zeroSourceAssetIdHex,
    } satisfies TrustlessBurnLeafInput;
  });
  const inclusion = buildTrustlessBurnInclusionProof(
    burns,
    burns[2].burnIdHex,
  );
  const finalityPayloadHex = buildBoundFinalityPayloadHex({
    profile,
    bridgeEventRootHex: inclusion.bridgeEventRootHex,
    burnLeafCount: inclusion.leafCount,
  });
  const applicationPayload = encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: finalityPayloadHex,
    application: decodeBridgeCausalApplicationBindingV2(
      profile.applicationBindingHex,
    ),
  });
  const decodedPayload =
    decodeBridgeValidityApplicationPayloadV3(applicationPayload);
  const trackerKeyHex = deriveApplicationValiditySpvTrackerKey({
    sidechainIdHex: profile.sidechainIdHex,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
  });
  const trackerValueHex = encodeApplicationValiditySpvTrackerValue({
    bridgeEventRootHex: inclusion.bridgeEventRootHex,
    checkpointCommitmentHex:
      decodedPayload.finality.checkpointCommitmentHex,
    anchorHeaderIdHex: ANCHOR_HEADER_ID_HEX,
    anchorHeaderHeight: 100,
    sidechainConsensusBlockHashHex: CONSENSUS_BLOCK_HASH_HEX,
    burnLeafCount: inclusion.leafCount,
    applicationBindingDigestHex:
      decodedPayload.applicationBindingDigestHex,
    settlementProfileIdHex: profile.settlementProfileIdHex,
    causalProfileIdHex: profile.causalProfileIdHex,
    applicationPayloadDigestHex:
      deriveApplicationValidityPayloadDigestHex(applicationPayload),
    programIdHex: profile.programIdHex,
    verifierProfileIdHex: profile.verifierProfileIdHex,
  });
  const trackerHistory = [{ key: trackerKeyHex, value: trackerValueHex }];
  const trackerDigestHex =
    getApplicationValiditySpvTrackerDigest(trackerHistory);
  const planInput: BuildValidityApplicationSettlementPlanV2Input = {
    profile,
    trackerHistory,
    trackerTree: {
      digestHex: trackerDigestHex,
      keyLength: 32,
      valueLength: 370,
      flags: 1,
    },
    applicationPayloadHex: applicationPayload.toString('hex'),
    duplicatePreventionHistoryKeys: [],
    claim: {
      trackerIdentity: {
        sidechainHeight: SIDECHAIN_HEIGHT,
        executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
      },
      burnLeaf: burns[2],
      leafIndex: inclusion.leafIndex,
      leafCount: inclusion.leafCount,
      burnProof: inclusion.proof,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
    },
    currentErgoHeight: CURRENT_HEIGHT,
  };
  const plan = buildValidityApplicationSettlementPlanV2(planInput);
  const application = decodeBridgeCausalApplicationBindingV2(
    profile.applicationBindingHex,
  );
  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: profile.sourceNetworkIdHex,
    sidechainIdHex: profile.sidechainIdHex,
    bridgeAddressHex: application.bridgeAddressHex,
    tokenAddressHex: application.tokenAddressHex,
    settlementProfileIdHex: plan.settlementProfileIdHex,
    admissionProfileIdHex: profile.causalProfileIdHex,
    sourceAssetIdHex: profile.zeroSourceAssetIdHex,
    amountNanoErg: SOURCE_AMOUNT,
    recipientAddressHex: '98'.repeat(20),
  }).slice(2);
  const trackerBox: ValidityApplicationSettlementBoxV2 = {
    boxId: 'a2'.repeat(32),
    value: '10000000',
    ergoTree: profile.trackerPropositionBytesHex,
    assets: [{ tokenId: profile.trackerNftIdHex, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(1),
      R5: encodeApplicationValiditySpvTrackerAvlRegister(
        trackerDigestHex,
      ),
      R6: encodeCollByteRegister(Buffer.from(profile.sidechainIdHex, 'hex')),
      R7: encodeLongRegister(SIDECHAIN_HEIGHT),
      R8: '0400',
      R9: encodeCollByteRegister(Buffer.from(
        VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
        'hex',
      )),
    },
    creationHeight: 100,
  };
  const duplicatePreventionBox: ValidityApplicationSettlementBoxV2 = {
    boxId: 'a3'.repeat(32),
    value: '1000000',
    ergoTree: VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
    assets: [{
      tokenId: profile.duplicatePreventionNftIdHex,
      amount: 1,
    }],
    additionalRegisters: {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(
        Buffer.from(plan.dupInputDigestHex, 'hex'),
        0x0b,
        1,
      ),
      R6: encodeCollByteRegister(
        Buffer.from(plan.settlementProfileIdHex, 'hex'),
      ),
    },
    creationHeight: CURRENT_HEIGHT - 1,
  };
  const causalVaultBox: ValidityApplicationSettlementBoxV2 = {
    boxId: 'a4'.repeat(32),
    value: SOURCE_AMOUNT.toString(),
    ergoTree: VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex')),
      R5: encodeCollByteRegister(Buffer.from(SOURCE_BOX_ID_HEX, 'hex')),
    },
    creationHeight: CURRENT_HEIGHT - 1,
  };
  const feeFundingBox: ValidityApplicationSettlementBoxV2 = {
    boxId: 'a5'.repeat(32),
    value: String(MINER_FEE),
    ergoTree: '10010100d17300',
    assets: [],
    additionalRegisters: {},
    creationHeight: CURRENT_HEIGHT - 1,
  };
  return {
    planInput,
    input: {
      deployed: {
        tracker: {
          nftIdHex: profile.trackerNftIdHex,
          ergoTreeHex: profile.trackerPropositionBytesHex,
        },
        duplicatePrevention: {
          nftIdHex: profile.duplicatePreventionNftIdHex,
          ergoTreeHex:
            VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
        },
        causalVault: {
          ergoTreeHex:
            VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
        },
      },
      plan,
      trackerBox,
      duplicatePreventionBox,
      causalVaultBox,
      feeFundingBox,
      creationHeight: CURRENT_HEIGHT,
      minerFee: MINER_FEE,
    },
  };
}

describe('Application-Bound Validity Settlement V2 unsigned transaction', () => {
  it('builds the exact partial 3-input/1-data-input conjunction', () => {
    const { input } = fixture();
    const tx = buildValidityApplicationSettlementTxV2(input);

    expect(tx.inputs.map(entry => entry.boxId)).toEqual([
      input.duplicatePreventionBox.boxId,
      input.causalVaultBox.boxId,
      input.feeFundingBox.boxId,
    ]);
    expect(tx.inputs.map(entry => Object.keys(entry.extension))).toEqual([
      ['0', '1', '2'],
      ['0', '1', '2', '3'],
      [],
    ]);
    expect(tx.dataInputs).toEqual([{ boxId: input.trackerBox.boxId }]);
    expect(tx.outputs).toHaveLength(4);
    expect(tx.outputs[0]).toMatchObject({
      value: '1000000',
      ergoTree:
        VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
      assets: [{
        tokenId: input.plan.profile.duplicatePreventionNftIdHex,
        amount: 1,
      }],
      additionalRegisters: {
        R4: encodeLongRegister(1),
        R6: encodeCollByteRegister(Buffer.from(
          input.plan.settlementProfileIdHex,
          'hex',
        )),
      },
    });
    expect(tx.outputs[1]).toMatchObject({
      value: input.plan.burnLeaf.amountNanoErg,
      ergoTree: RECIPIENT_ERGO_TREE_HEX,
      assets: [],
    });
    expect(tx.outputs[2]).toMatchObject({
      value: (
        SOURCE_AMOUNT - BigInt(input.plan.burnLeaf.amountNanoErg)
      ).toString(),
      ergoTree:
        VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
      additionalRegisters: input.causalVaultBox.additionalRegisters,
    });
    expect(tx.outputs[3]).toEqual({
      value: String(MINER_FEE),
      ergoTree: MINER_FEE_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: CURRENT_HEIGHT,
    });
    expect(tx.boundaries).toEqual({
      unsignedOnly: true,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      proofValidityEstablishedInPayoutTransaction: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      nodeCheckPerformed: false,
      gate5Closed: false,
    });
    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.inputs[1].extension)).toBe(true);
    expect(Object.isFrozen(tx.outputs[0].additionalRegisters)).toBe(true);
    expect(() => {
      (tx.outputs[1] as { value: string }).value = '1';
    }).toThrow();
  });

  it('supports the exact terminal branch without a vault successor', () => {
    const { input } = fixture();
    const amount = input.plan.burnLeaf.amountNanoErg;
    const r4 = encodePegInSourceIntentV2Hex({
      ...decodeSourceIntentInput(input),
      amountNanoErg: amount,
    }).slice(2);
    const tx = buildValidityApplicationSettlementTxV2({
      ...input,
      causalVaultBox: {
        ...input.causalVaultBox,
        value: amount,
        additionalRegisters: {
          ...input.causalVaultBox.additionalRegisters,
          R4: encodeCollByteRegister(Buffer.from(r4, 'hex')),
        },
      },
    });

    expect(tx.outputs).toHaveLength(3);
    expect(tx.outputs.map(output => output.ergoTree)).toEqual([
      VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
      RECIPIENT_ERGO_TREE_HEX,
      MINER_FEE_TREE,
    ]);
  });

  it('rejects V1-family compatibility and stale trust-root plans', () => {
    const { input } = fixture();
    expect(() => buildValidityApplicationSettlementTxV2({
      ...input,
      plan: {
        ...input.plan,
        contractCompatibility: 'validity-settlement-v1',
      } as unknown as typeof input.plan,
    })).toThrow(/exact V2 preactivation plan/);
    expect(() => buildValidityApplicationSettlementTxV2({
      ...input,
      plan: {
        ...input.plan,
        profile: {
          ...input.plan.profile,
          approvedTrustRootDigestHex: '4e'.repeat(32),
        },
      },
    })).toThrow(/regenerated WP-06AD trust root/);
    expect(() => buildValidityApplicationSettlementTxV2({
      ...input,
      plan: {
        ...input.plan,
        trackerValueHex: '00'.repeat(264),
      },
    })).toThrow(/370-byte tracker value family/);
  });

  it('rejects isolated tracker, DUP, vault, fee, and ordering mutations', () => {
    const { input } = fixture();
    const cases: readonly [
      string,
      BuildValidityApplicationSettlementTxV2Input,
      RegExp,
    ][] = [
      ['DUP extension', {
        ...input,
        plan: {
          ...input.plan,
          dupExtension: {
            ...input.plan.dupExtension,
            '1': encodeCollByteRegister(Buffer.from('01'.repeat(32), 'hex')),
          },
        },
      }, /DUP ContextExtension/],
      ['vault extension', {
        ...input,
        plan: {
          ...input.plan,
          vaultExtension: {
            ...input.plan.vaultExtension,
            '3': encodeCollByteRegister(Buffer.from('02', 'hex')),
          },
        },
      }, /vault ContextExtension/],
      ['tracker proposition', {
        ...input,
        trackerBox: {
          ...input.trackerBox,
          ergoTree: `0008cd02${'01'.repeat(32)}`,
        },
      }, /tracker box ErgoTree/],
      ['tracker NFT', {
        ...input,
        trackerBox: {
          ...input.trackerBox,
          assets: [{ tokenId: '02'.repeat(32), amount: 1 }],
        },
      }, /singleton token ID/],
      ['tracker R5', {
        ...input,
        trackerBox: {
          ...input.trackerBox,
          additionalRegisters: {
            ...input.trackerBox.additionalRegisters,
            R5: encodeApplicationValiditySpvTrackerAvlRegister(
              `03${input.plan.trackerInputDigestHex.slice(2)}`,
            ),
          },
        },
      }, /planned tracker digest/],
      ['tracker R9', {
        ...input,
        trackerBox: {
          ...input.trackerBox,
          additionalRegisters: {
            ...input.trackerBox.additionalRegisters,
            R9: encodeCollByteRegister(Buffer.from('04'.repeat(32), 'hex')),
          },
        },
      }, /tracker box R9/],
      ['DUP profile descriptor substitution', {
        ...input,
        duplicatePreventionBox: {
          ...input.duplicatePreventionBox,
          additionalRegisters: {
            ...input.duplicatePreventionBox.additionalRegisters,
            R6: encodeCollByteRegister(Buffer.from(
              input.plan.profileDescriptorDigestHex,
              'hex',
            )),
          },
        },
      }, /DUP box R6/],
      ['DUP counter overflow', {
        ...input,
        duplicatePreventionBox: {
          ...input.duplicatePreventionBox,
          additionalRegisters: {
            ...input.duplicatePreventionBox.additionalRegisters,
            R4: encodeLongRegister(0x7fff_ffff_ffff_ffffn),
          },
        },
      }, /counter must be nonnegative and incrementable/],
      ['negative DUP counter', {
        ...input,
        duplicatePreventionBox: {
          ...input.duplicatePreventionBox,
          additionalRegisters: {
            ...input.duplicatePreventionBox.additionalRegisters,
            R4: encodeLongRegister(-1n),
          },
        },
      }, /counter must be nonnegative and incrementable/],
      ['DUP proposition', {
        ...input,
        deployed: {
          ...input.deployed,
          duplicatePrevention: {
            ...input.deployed.duplicatePrevention,
            ergoTreeHex: `0008cd02${'05'.repeat(32)}`,
          },
        },
      }, /exactly 701 bytes/],
      ['vault bridge address', mutateSourceIntent(input, {
        bridgeAddressHex: '06'.repeat(20),
      }), /bridge address/],
      ['vault token address', mutateSourceIntent(input, {
        tokenAddressHex: '07'.repeat(20),
      }), /token address/],
      ['vault causal profile', mutateSourceIntent(input, {
        admissionProfileIdHex: '08'.repeat(32),
      }), /causal profile/],
      ['vault source asset', mutateSourceIntent(input, {
        sourceAssetIdHex: '09'.repeat(32),
      }), /native ERG asset/],
      ['fee token', {
        ...input,
        feeFundingBox: {
          ...input.feeFundingBox,
          assets: [{ tokenId: '0a'.repeat(32), amount: 1 }],
        },
      }, /only ERG/],
      ['duplicate input identity', {
        ...input,
        feeFundingBox: {
          ...input.feeFundingBox,
          boxId: input.causalVaultBox.boxId,
        },
      }, /box IDs must be distinct/],
      ['future state input', {
        ...input,
        duplicatePreventionBox: {
          ...input.duplicatePreventionBox,
          creationHeight: CURRENT_HEIGHT + 1,
        },
      }, /cannot exceed its successor/],
    ];
    for (const [label, mutated, expected] of cases) {
      expect(
        () => buildValidityApplicationSettlementTxV2(mutated),
        label,
      ).toThrow(expected);
    }
  });
});

function applicationProfile(): ValidityApplicationSettlementProfileV2 {
  return {
    formatVersion: 2,
    minAnchorConfirmations: 10,
    sourceNetworkIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
    trackerNftIdHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
    trackerContractIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
    trackerPropositionBytesHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
    approvedTrustRootDigestHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
    applicationBindingHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    applicationBindingDigestHex:
      deriveBridgeCausalApplicationBindingV2DigestHex(
        EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
      ),
    settlementProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
    causalProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    verifierProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    duplicatePreventionNftIdHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX,
    zeroSourceAssetIdHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
  };
}

function buildBoundFinalityPayloadHex(input: {
  readonly profile: ValidityApplicationSettlementProfileV2;
  readonly bridgeEventRootHex: string;
  readonly burnLeafCount: number;
}): string {
  const bytes = Buffer.from(
    finalityVector.expected.encodedPayloadHex as string,
    'hex',
  );
  const checkpoint = Buffer.from(bytes.subarray(76, 292));
  Buffer.from(input.profile.sidechainIdHex, 'hex').copy(checkpoint, 4);
  checkpoint.writeBigUInt64BE(BigInt(SIDECHAIN_HEIGHT), 36);
  Buffer.from(CONSENSUS_BLOCK_HASH_HEX, 'hex').copy(checkpoint, 44);
  Buffer.from(EXECUTION_BLOCK_HASH_HEX, 'hex').copy(checkpoint, 76);
  Buffer.from(input.bridgeEventRootHex, 'hex').copy(checkpoint, 108);
  checkpoint.writeUInt32BE(input.burnLeafCount, 140);
  checkpoint.copy(bytes, 76);
  const commitment = Buffer.from(
    deriveBridgeCheckpointCommitmentHex(checkpoint),
    'hex',
  );
  commitment.copy(bytes, 292);
  Buffer.from(input.profile.trackerNftIdHex, 'hex').copy(bytes, 44);
  Buffer.from(
    VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
    'hex',
  ).copy(bytes, 516);
  Buffer.concat([
    checkpoint.subarray(108, 140),
    commitment,
  ]).copy(bytes, 590);
  return bytes.toString('hex');
}

function decodeSourceIntentInput(
  input: BuildValidityApplicationSettlementTxV2Input,
) {
  const application = decodeBridgeCausalApplicationBindingV2(
    input.plan.profile.applicationBindingHex,
  );
  return {
    formatVersion: 2 as const,
    sourceNetworkIdHex: input.plan.profile.sourceNetworkIdHex,
    sidechainIdHex: input.plan.profile.sidechainIdHex,
    bridgeAddressHex: application.bridgeAddressHex,
    tokenAddressHex: application.tokenAddressHex,
    settlementProfileIdHex: input.plan.settlementProfileIdHex,
    admissionProfileIdHex: input.plan.profile.causalProfileIdHex,
    sourceAssetIdHex: input.plan.profile.zeroSourceAssetIdHex,
    recipientAddressHex: '98'.repeat(20),
  };
}

function mutateSourceIntent(
  input: BuildValidityApplicationSettlementTxV2Input,
  overrides: Partial<ReturnType<typeof decodeSourceIntentInput>>,
): BuildValidityApplicationSettlementTxV2Input {
  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    ...decodeSourceIntentInput(input),
    amountNanoErg: SOURCE_AMOUNT,
    ...overrides,
  }).slice(2);
  return {
    ...input,
    causalVaultBox: {
      ...input.causalVaultBox,
      additionalRegisters: {
        ...input.causalVaultBox.additionalRegisters,
        R4: encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex')),
      },
    },
  };
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
